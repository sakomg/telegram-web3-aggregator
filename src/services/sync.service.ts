import { TelegramClient } from 'telegram';
import { MessageFilterService } from './filter.service';
import { Logger } from './logger.service';
import { MessageService } from './message.service';
import { channelsToMarkdown, delay, markdownToChannels } from '../utils/main.utils';

type ChannelState = {
  name: string;
  messageId: number;
};

export class SyncService {
  private readonly config;
  private readonly messageService: MessageService;
  private readonly messageFilterService: MessageFilterService;
  private readonly logger = new Logger('SyncService');
  private channelsState: ChannelState[] = [];
  private storageMessageId: number | null = null;
  private isActive = false;
  private activeClient: TelegramClient | null = null;
  private activeSender?: string[];

  private static readonly INTER_CHANNEL_DELAY_MS = 1_000;
  private static readonly INTER_PASS_DELAY_MS = 30_000;

  private static toRecipients(sender: string | string[] | undefined): string[] {
    if (!sender) return [];
    return Array.isArray(sender) ? sender.filter(Boolean) : [sender];
  }

  constructor(config: any, messageService: MessageService, messageFilterService: MessageFilterService) {
    this.config = config;
    this.messageService = messageService;
    this.messageFilterService = messageFilterService;
  }

  async start(client: TelegramClient, sender?: string | string[]) {
    if (this.isActive) {
      this.stop();
    }

    this.isActive = true;
    this.activeClient = client;
    this.activeSender = SyncService.toRecipients(sender);

    await this.#loadChannelsState(client, this.activeSender);
    this.logger.info(`Starting polling for ${this.channelsState.length} channels`);

    this.#runLoop(client);
  }

  stop() {
    if (!this.isActive) {
      return;
    }

    this.logger.info('Stopping sync polling');
    this.isActive = false;
    this.activeClient = null;
    this.activeSender = undefined;
  }

  async refreshSubscriptions(client?: TelegramClient, sender?: string | string[]) {
    if (!this.isActive) {
      return;
    }

    this.logger.info('Refreshing channel list from storage');

    const controlClient = client ?? this.activeClient;
    const controlSender = sender ? SyncService.toRecipients(sender) : (this.activeSender ?? []);
    if (!controlClient) {
      return;
    }

    await this.#loadChannelsState(controlClient, controlSender);
  }

  async #runLoop(client: TelegramClient) {
    while (this.isActive) {
      await this.#runPollCheck(client);
      if (this.isActive) {
        await delay(SyncService.INTER_PASS_DELAY_MS);
      }
    }
  }

  async #runPollCheck(client: TelegramClient) {
    let totalForwarded = 0;

    for (const channel of this.channelsState) {
      if (!this.isActive) break;
      try {
        const { success, value } = await this.messageService.getMessagesSince(channel.name, channel.messageId);
        if (!success || !value?.messages?.length) continue;

        const messages: any[] = [...value.messages].reverse();

        const groups: { ids: number[]; lastId: number; lead: any }[] = [];
        for (const msg of messages) {
          if (!msg.id || msg.id <= channel.messageId) continue;
          const prev = groups[groups.length - 1];
          const gid = msg.groupedId?.toString();
          if (gid && prev && prev.lead.groupedId?.toString() === gid) {
            prev.ids.push(msg.id);
            prev.lastId = msg.id;
          } else {
            groups.push({ ids: [msg.id], lastId: msg.id, lead: msg });
          }
        }

        for (const group of groups) {
          const invalidReason = this.messageFilterService.getInvalidReason(group.lead);
          if (invalidReason !== null) {
            this.logger.warn(`[Poll] Skipped message ${group.lead.id} from ${channel.name} (reason: ${invalidReason})`);
            continue;
          }

          await this.messageService.forwardMessages(channel.name, this.config.get('TELEGRAM_TARGET_CHANNEL_USERNAME'), group.ids);

          this.logger.info(`[Poll] Forwarded [${group.ids.join(',')}] from ${channel.name}`);
          await this.#notifyStateMessage(client, this.activeSender, channel.name, group.lastId, group.lead.message);

          channel.messageId = group.lastId;
          totalForwarded++;
        }
      } catch (e) {
        this.logger.error(`[Poll] Failed for channel ${channel.name}`, e);
      }

      await delay(SyncService.INTER_CHANNEL_DELAY_MS);
    }

    if (totalForwarded > 0) {
      await this.#persistChannelsState();
      this.logger.info(`Poll check complete | forwarded=${totalForwarded} channels=${this.channelsState.length}`);
    }
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
        await client.sendMessage(r, { message: `❗ Cannot extract storage channel messages.`, parseMode: 'html' });
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
    if (!this.storageMessageId) {
      return;
    }

    const markdown = channelsToMarkdown(this.channelsState);
    await this.messageService.editMessage(this.config.get('TELEGRAM_STORAGE_CHANNEL_USERNAME'), this.storageMessageId, markdown);
  }

  async #notifyStateMessage(
    client: TelegramClient,
    sender: string[] | undefined,
    channelName: string,
    messageId: number,
    messageText: string | undefined,
  ) {
    const recipients = sender?.filter(Boolean) ?? [];
    if (recipients.length === 0) {
      return;
    }

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
