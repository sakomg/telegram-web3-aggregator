import { TelegramClient } from 'telegram';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { MessageFilterService } from './filter.service';
import { Logger } from './logger.service';
import { MessageService } from './message.service';
import { channelsToMarkdown, delay, markdownToChannels } from '../utils/main.utils';

type ChannelState = {
  name: string;
  messageId: number;
};

type AlbumBuffer = {
  ids: number[];
  lastId: number;
  lead: any;
  timer: ReturnType<typeof setTimeout>;
};

type MsgGroup = { ids: number[]; lastId: number; lead: any };

export class SyncService {
  private readonly config;
  private readonly messageService: MessageService;
  private readonly messageFilterService: MessageFilterService;
  private readonly userClient: TelegramClient;
  private readonly logger = new Logger('SyncService');
  private channelsState: ChannelState[] = [];
  private channelIdMap = new Map<string, ChannelState>();
  private storageMessageId: number | null = null;
  private isActive = false;
  private activeBotClient: TelegramClient | null = null;
  private activeSender?: string[];
  private albumBuffers = new Map<string, AlbumBuffer>();
  private messageHandler: ((event: NewMessageEvent) => Promise<void>) | null = null;

  private static readonly CATCH_UP_DELAY_MS = 2_000;

  private static toRecipients(sender: string | string[] | undefined): string[] {
    if (!sender) return [];
    return Array.isArray(sender) ? sender.filter(Boolean) : [sender];
  }

  constructor(config: any, messageService: MessageService, messageFilterService: MessageFilterService, userClient: TelegramClient) {
    this.config = config;
    this.messageService = messageService;
    this.messageFilterService = messageFilterService;
    this.userClient = userClient;
  }

  async start(botClient: TelegramClient, sender?: string | string[]) {
    if (this.isActive) this.stop();

    this.isActive = true;
    this.activeBotClient = botClient;
    this.activeSender = SyncService.toRecipients(sender);

    await this.#loadChannelsState(botClient, this.activeSender);
    await this.#catchUp(botClient);
    await this.#buildChannelIdMap();
    this.#registerHandler(botClient);

    this.logger.info(`Live sync active for ${this.channelsState.length} channels`);
  }

  stop() {
    if (!this.isActive) return;

    this.logger.info('Stopping sync');
    this.isActive = false;

    if (this.messageHandler) {
      this.userClient.removeEventHandler(this.messageHandler, new NewMessage({}));
      this.messageHandler = null;
    }

    for (const buf of this.albumBuffers.values()) clearTimeout(buf.timer);
    this.albumBuffers.clear();

    this.activeBotClient = null;
    this.activeSender = undefined;
  }

  async refreshSubscriptions(botClient?: TelegramClient, sender?: string | string[]) {
    if (!this.isActive) return;

    this.logger.info('Refreshing channel list from storage');

    const client = botClient ?? this.activeBotClient;
    if (!client) return;

    const senderList = sender ? SyncService.toRecipients(sender) : (this.activeSender ?? []);
    await this.#loadChannelsState(client, senderList);
    await this.#buildChannelIdMap();
  }

  async #catchUp(botClient: TelegramClient) {
    for (const channel of this.channelsState) {
      if (!this.isActive) break;
      try {
        const { success, value } = await this.messageService.getMessagesSince(channel.name, channel.messageId);
        if (success && value?.messages?.length) {
          for (const group of this.#groupMessages([...value.messages].reverse(), channel.messageId)) {
            await this.#processGroup(group, channel, botClient, '[CatchUp]');
          }
        }
      } catch (e) {
        this.logger.error(`[CatchUp] Failed for channel ${channel.name}`, e);
      }
      await delay(SyncService.CATCH_UP_DELAY_MS);
    }

    await this.#persistChannelsState();
    this.logger.info('Catch-up complete');
  }

  async #buildChannelIdMap() {
    this.channelIdMap.clear();
    for (const channel of this.channelsState) {
      const channelId = await this.messageService.getChannelId(channel.name);
      if (channelId) {
        this.channelIdMap.set(channelId, channel);
      } else {
        this.logger.warn(`Cannot resolve channel ID for ${channel.name}`);
      }
    }
  }

  #registerHandler(botClient: TelegramClient) {
    if (this.messageHandler) {
      this.userClient.removeEventHandler(this.messageHandler, new NewMessage({}));
    }

    this.messageHandler = async (event: NewMessageEvent) => {
      if (!this.isActive) return;

      const msg = event.message;
      if (!msg?.id) return;

      const channelId = (msg.peerId as any)?.channelId?.toString();
      if (!channelId) return;

      const channel = this.channelIdMap.get(channelId);
      if (!channel) return;

      if (msg.groupedId) {
        this.#bufferAlbum(channel, msg, botClient);
      } else {
        await this.#processGroup({ ids: [msg.id], lastId: msg.id, lead: msg }, channel, botClient, '[Live]');
        await this.#persistChannelsState();
      }
    };

    this.userClient.addEventHandler(this.messageHandler, new NewMessage({}));
  }

  #bufferAlbum(channel: ChannelState, msg: any, botClient: TelegramClient) {
    const gid = msg.groupedId.toString();
    const existing = this.albumBuffers.get(gid);

    const flush = (buf: AlbumBuffer) => {
      this.albumBuffers.delete(gid);
      this.#processGroup(buf, channel, botClient, '[Live]')
        .then(() => this.#persistChannelsState())
        .catch((e) => this.logger.error(`Album flush failed for ${channel.name}`, e));
    };

    if (existing) {
      clearTimeout(existing.timer);
      existing.ids.push(msg.id);
      existing.lastId = msg.id;
      existing.timer = setTimeout(() => flush(existing), 500);
    } else {
      const buf: AlbumBuffer = { ids: [msg.id], lastId: msg.id, lead: msg, timer: null! };
      buf.timer = setTimeout(() => flush(buf), 500);
      this.albumBuffers.set(gid, buf);
    }
  }

  async #processGroup(group: MsgGroup, channel: ChannelState, botClient: TelegramClient, tag: string) {
    const invalidReason = this.messageFilterService.getInvalidReason(group.lead);
    if (invalidReason !== null) {
      this.logger.warn(`${tag} Skipped message ${group.lead.id} from ${channel.name} (reason: ${invalidReason})`);
      channel.messageId = group.lastId;
      return;
    }

    try {
      await this.messageService.forwardMessages(channel.name, this.config.get('TELEGRAM_TARGET_CHANNEL_USERNAME'), group.ids);
    } catch (e) {
      this.logger.error(`${tag} Failed to forward [${group.ids.join(',')}] from ${channel.name}`, e);
      channel.messageId = group.lastId;
      return;
    }

    this.logger.info(`${tag} Forwarded [${group.ids.join(',')}] from ${channel.name}`);
    await this.#notifyStateMessage(botClient, this.activeSender, channel.name, group.lastId, group.lead.message);

    channel.messageId = group.lastId;
  }

  #groupMessages(messages: any[], afterId: number): MsgGroup[] {
    const groups: MsgGroup[] = [];
    for (const msg of messages) {
      if (!msg.id || msg.id <= afterId) continue;
      const prev = groups[groups.length - 1];
      const gid = msg.groupedId?.toString();
      if (gid && prev && prev.lead.groupedId?.toString() === gid) {
        prev.ids.push(msg.id);
        prev.lastId = msg.id;
      } else {
        groups.push({ ids: [msg.id], lastId: msg.id, lead: msg });
      }
    }
    return groups;
  }

  async #loadChannelsState(client: TelegramClient, sender?: string[]) {
    const { success, value } = await this.messageService.getMessagesHistory(
      this.config.get('TELEGRAM_STORAGE_CHANNEL_USERNAME'),
      1,
    );

    this.channelsState = [];
    this.storageMessageId = null;

    if (!success) {
      this.logger.warn('Cannot read storage channel messages');
      for (const r of sender ?? []) {
        await client.sendMessage(r, { message: '❗ Cannot extract storage channel messages.', parseMode: 'html' });
      }
      return;
    }

    if (!value.messages?.length) {
      this.logger.warn('Storage channel is empty');
      for (const r of sender ?? []) {
        await client.sendMessage(r, { message: '🗑️ Store channel is empty.' });
      }
      return;
    }

    this.storageMessageId = value.messages[0].id;
    this.channelsState = markdownToChannels(value.messages[0].message);
    this.logger.info(`Loaded ${this.channelsState.length} channels from storage`);
  }

  async #persistChannelsState() {
    if (!this.storageMessageId) return;
    await this.messageService.editMessage(
      this.config.get('TELEGRAM_STORAGE_CHANNEL_USERNAME'),
      this.storageMessageId,
      channelsToMarkdown(this.channelsState),
    );
  }

  async #notifyStateMessage(
    client: TelegramClient,
    sender: string[] | undefined,
    channelName: string,
    messageId: number,
    messageText: string | undefined,
  ) {
    const recipients = sender?.filter(Boolean) ?? [];
    if (recipients.length === 0) return;

    const preview = (messageText ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const details = preview ? `\nPreview: <i>${preview}</i>` : '';

    for (const recipient of recipients) {
      try {
        await client.sendMessage(recipient, {
          message: `✅ Forwarded message <b>${messageId}</b> from <b>${channelName}</b>.${details}`,
          parseMode: 'html',
        });
      } catch (error) {
        this.logger.warn(`Failed to notify forwarded message to recipient ${recipient}`, error);
      }
    }
  }
}
