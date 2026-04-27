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

  private static readonly INTER_CHANNEL_DELAY_MS = 500; // between each channel request
  private static readonly INTER_PASS_DELAY_MS = 30_000; // minimum gap between full passes

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

    this.logger.info('Starting sync polling');
    this.isActive = true;
    this.activeClient = client;
    this.activeSender = SyncService.toRecipients(sender);

    await this.#loadChannelsState(client, this.activeSender);
    this.logger.info(`Starting continuous polling for ${this.channelsState.length} channels`);

    // Fire-and-forget: loop runs in background until stop() sets isActive = false
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
    this.logger.info('Poll loop exited');
  }

  async #runPollCheck(client: TelegramClient) {
    let totalForwarded = 0;

    for (const channel of this.channelsState) {
      if (!this.isActive) break;
      try {
        const { success, value } = await this.messageService.getMessagesSince(channel.name, channel.messageId);
        if (!success || !value?.messages?.length) continue;

        // GetHistory returns newest-first; reverse to forward in chronological order
        const messages: any[] = [...value.messages].reverse();

        for (const msg of messages) {
          if (!msg.id || msg.id <= channel.messageId) continue;

          const invalidReason = this.messageFilterService.getInvalidReason(msg);
          if (invalidReason !== null) {
            this.logger.warn(`[Poll] Skipped message ${msg.id} from ${channel.name} (reason: ${invalidReason})`);
            continue;
          }

          await this.messageService.forwardMessages(channel.name, this.config.get('TELEGRAM_TARGET_CHANNEL_USERNAME'), [msg.id]);

          this.logger.info(`[Poll] Forwarded message ${msg.id} from ${channel.name}`);
          await this.#notifyStateMessage(client, this.activeSender, channel.name, msg.id, msg.message);

          channel.messageId = msg.id;
          totalForwarded++;
        }
      } catch (e) {
        this.logger.error(`[Poll] Failed for channel ${channel.name}`, e);
      }

      await delay(SyncService.INTER_CHANNEL_DELAY_MS);
    }

    if (totalForwarded > 0) {
      await this.#persistChannelsState();
    }

    this.logger.info(`Poll check complete | forwarded=${totalForwarded} channels=${this.channelsState.length}`);
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

    const lastForwardedResult = value.messages[0];
    this.storageMessageId = lastForwardedResult.id;
    this.channelsState = markdownToChannels(lastForwardedResult.message);
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

    const preview = (messageText ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
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
