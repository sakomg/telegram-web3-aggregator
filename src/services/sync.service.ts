import { TelegramClient } from 'telegram';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { MessageFilterService } from './filter.service';
import { Logger } from './logger.service';
import { MessageService } from './message.service';
import { channelsToMarkdown, delay, markdownToChannels } from '../utils/main.utils';

type ChannelState = {
  name: string;
  messageId: number;
  channelId?: string;
};

type ChannelListener = {
  handler: (event: NewMessageEvent) => Promise<void>;
  eventBuilder: NewMessage;
};

export class SyncService {
  private readonly config;
  private readonly messageService: MessageService;
  private readonly messageFilterService: MessageFilterService;
  private readonly logger = new Logger('SyncService');
  private readonly sourceChannelHandlers = new Map<string, ChannelListener>();
  private channelsState: ChannelState[] = [];
  private storageMessageId: number | null = null;
  private isActive = false;
  private activeClient: TelegramClient | null = null;
  private activeSender?: string[];
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private static readonly HEALTH_CHECK_MS = 5 * 60 * 1000; // 5 minutes

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
    if (this.isActive || this.sourceChannelHandlers.size > 0) {
      this.stop();
    }

    this.logger.info('Starting sync listeners');
    this.isActive = true;
    this.activeClient = client;
    this.activeSender = SyncService.toRecipients(sender);

    await this.#loadChannelsState(client, this.activeSender);
    await this.#attachChannelListeners(client, this.activeSender);
    this.logger.info(`Sync listeners are active for ${this.sourceChannelHandlers.size}/${this.channelsState.length} channels`);
    this.#attachDebugListener(client);
    this.#startHealthCheck();
  }

  stop() {
    if (!this.isActive && this.sourceChannelHandlers.size === 0) {
      return;
    }

    this.logger.info(`Stopping sync listeners (${this.sourceChannelHandlers.size} active)`);
    this.isActive = false;
    this.activeClient = null;
    this.activeSender = undefined;

    if (this.healthCheckInterval !== null) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    for (const listener of this.sourceChannelHandlers.values()) {
      this.messageService.removeChannelMessageListener(listener.handler, listener.eventBuilder);
    }

    this.sourceChannelHandlers.clear();
  }

  async refreshSubscriptions(client?: TelegramClient, sender?: string | string[]) {
    if (!this.isActive) {
      return;
    }

    this.logger.info('Refreshing channel subscriptions');

    const controlClient = client ?? this.activeClient;
    const controlSender = sender ? SyncService.toRecipients(sender) : (this.activeSender ?? []);
    if (!controlClient) {
      return;
    }

    for (const listener of this.sourceChannelHandlers.values()) {
      this.messageService.removeChannelMessageListener(listener.handler, listener.eventBuilder);
    }
    this.sourceChannelHandlers.clear();

    await this.#loadChannelsState(controlClient, controlSender);
    await this.#attachChannelListeners(controlClient, controlSender);
  }

  #attachDebugListener(client: TelegramClient) {
    const { userClient } = this.messageService as any;
    if (!userClient) return;

    const knownPeerIds = new Set(this.channelsState.map((c) => c.channelId).filter(Boolean));
    this.logger.info(`Debug listener watching ${knownPeerIds.size} peer IDs: ${[...knownPeerIds].join(', ')}`);

    userClient.addEventHandler((event: NewMessageEvent) => {
      if (!event?.message?.id) return;
      const peerId = String((event.message as any).peerId?.channelId ?? (event.message as any).peerId?.userId ?? (event.message as any).peerId ?? '?');
      const fromId = String((event.message as any).fromId?.userId ?? (event.message as any).fromId?.channelId ?? '?');
      this.logger.info(`[RAW] msg=${event.message.id} peerId=${peerId} fromId=${fromId} text=${(event.message.message ?? '').slice(0, 60).replace(/\n/g, ' ')}`);
    }, new (require('telegram/events').NewMessage)({}));
  }

  #startHealthCheck() {
    if (this.healthCheckInterval !== null) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      if (!this.isActive || !this.activeClient) {
        return;
      }

      const userClientConnected = this.messageService.isUserClientConnected();
      if (!userClientConnected) {
        this.logger.warn('User client disconnected — re-attaching channel listeners');
        for (const r of this.activeSender ?? []) {
          try {
            await this.activeClient.sendMessage(r, {
              message: '⚠️ User client disconnect detected. Re-attaching channel listeners…',
            });
          } catch {
            // best-effort notification
          }
        }

        for (const listener of this.sourceChannelHandlers.values()) {
          this.messageService.removeChannelMessageListener(listener.handler, listener.eventBuilder);
        }
        this.sourceChannelHandlers.clear();

        await this.#attachChannelListeners(this.activeClient, this.activeSender);
        this.logger.info(`Re-attached listeners for ${this.sourceChannelHandlers.size}/${this.channelsState.length} channels after disconnect`);
      }
    }, SyncService.HEALTH_CHECK_MS);
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

  async #attachChannelListeners(client: TelegramClient, sender?: string[]) {
    let didResolveMissingIds = false;
    const failedChannels: string[] = [];

    for (const channel of this.channelsState) {
      try {
        if (channel.channelId === undefined || !channel.channelId.startsWith('-')) {
          channel.channelId = await this.messageService.getUserChatPeerId(channel.name);
          didResolveMissingIds = true;
        }

        const handler = async (event: NewMessageEvent) => {
          if (!this.isActive || !event?.message?.id) {
            return;
          }

          this.logger.info(`Received message ${event.message.id} from ${channel.name} | text=${(event.message.message ?? '').slice(0, 60).replace(/\n/g, ' ')} media=${!!(event.message as any).media}`);
          const normalizedText = (event.message.message ?? '').replace(/\s+/g, ' ').trim();

          try {
            const invalidReason = this.messageFilterService.getInvalidReason(event.message as any);
            if (invalidReason !== null) {
              const preview = normalizedText.slice(0, 80);
              this.logger.warn(
                `Skipped message ${event.message.id} from ${channel.name} (reason: ${invalidReason})${preview ? ` | ${preview}` : ''}`,
              );
              await this.#notifyStateMessage(
                client,
                sender,
                channel.name,
                event.message.id,
                event.message.message,
                'skipped',
                invalidReason,
              );
              return;
            }

            if (event.message.id <= channel.messageId) {
              this.logger.warn(
                `Skipped message ${event.message.id} from ${channel.name} (reason: already_processed, stored id: ${channel.messageId})`,
              );
              return;
            }

            await this.messageService.forwardMessages(channel.name, this.config.get('TELEGRAM_TARGET_CHANNEL_USERNAME'), [
              event.message.id,
            ]);

            this.logger.info(`Forwarded message ${event.message.id} from ${channel.name}`);
            await this.#notifyStateMessage(client, sender, channel.name, event.message.id, event.message.message, 'forwarded');

            channel.messageId = event.message.id;
            await this.#persistChannelsState();
          } catch (e) {
            if (String(e).includes('MESSAGE_ID_INVALID')) {
              this.logger.warn(`Skipped message ${event.message.id} from ${channel.name} (reason: message_id_invalid)`);
              return;
            }
            this.logger.error(`Failed to forward message ${event.message.id} from ${channel.name}`, e);
            for (const r of sender ?? []) {
              await client.sendMessage(r, {
                message: `🚩 Error in forwarding message ${event.message.id} from ${channel.name} channel.`,
                parseMode: 'html',
              });
            }
          }
        };

        const eventBuilder = await this.messageService.addChannelMessageListener(channel.name, handler, channel.channelId);
        this.sourceChannelHandlers.set(channel.name, { handler, eventBuilder });
        this.logger.info(`Listener attached for ${channel.name} (peerId=${channel.channelId})`);

        // Avoid bursting entity resolution for large channel lists.
        await delay(50);
      } catch (error) {
        failedChannels.push(channel.name);
        this.logger.error(`Failed to attach listener for ${channel.name}`, error);
      }
    }

    if (didResolveMissingIds) {
      await this.#persistChannelsState();
    }

    if (failedChannels.length) {
      this.logger.warn(`Listener attach failed for ${failedChannels.length} channels`);
      for (const r of sender ?? []) {
        await client.sendMessage(r, {
          message: `⚠️ Listener attach failed for channels: ${failedChannels.join(', ')}`,
          parseMode: 'html',
        });
      }
    }
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
    state: 'forwarded' | 'skipped',
    reason?: string,
  ) {
    const recipients = sender?.filter(Boolean) ?? [];
    if (recipients.length === 0) {
      return;
    }

    const preview = (messageText ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const details = preview ? `\nPreview: <i>${preview}</i>` : '';
    const reasonText = state === 'skipped' && reason ? `\nReason: <code>${reason}</code>` : '';
    const icon = state === 'forwarded' ? '✅' : '🧹';
    const title = state === 'forwarded' ? 'Forwarded' : 'Skipped';

    for (const recipient of recipients) {
      try {
        await client.sendMessage(recipient, {
          message: `${icon} ${title} message <b>${messageId}</b> from <b>${channelName}</b>.${reasonText}${details}`,
          parseMode: 'html',
        });
      } catch (error) {
        this.logger.warn(`Failed to notify ${state} message to recipient ${recipient}`, error);
      }
    }
  }
}
