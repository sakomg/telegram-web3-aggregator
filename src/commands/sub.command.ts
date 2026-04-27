import { TelegramClient } from 'telegram';
import { Entity } from 'telegram/define';
import { CommandHandler } from '../types/command-handler.interface';
import { channelsToMarkdown, clearChannelName, markdownToChannels } from '../utils/main.utils';
import { Logger, MessageService, SyncService } from '../services';

export class SubCommand implements CommandHandler {
  private readonly messageService: MessageService;
  private readonly storageChannel: string;
  private readonly syncService: SyncService;
  private readonly logger = new Logger('SubCommand');

  constructor(messageService: MessageService, storageChannel: string, syncService: SyncService) {
    this.messageService = messageService;
    this.storageChannel = storageChannel;
    this.syncService = syncService;
  }

  async handle(botClient: TelegramClient, sender: any, message: string) {
    this.logger.info('Sub command triggered');
    await this.#processSubscriptionChannel(botClient, sender, message);
  }

  async #processSubscriptionChannel(client: TelegramClient, sender: any, message: string) {
    let replyMessage = '';
    let didUpdateChannels = false;
    const rawChannelName = message?.split(' ')[1];
    const { success, value } = await this.messageService.getMessagesHistory(this.storageChannel, 1);

    if (success && value.messages?.length) {
      const lastForwardedResult = value.messages[0];
      const scrapChannels = markdownToChannels(lastForwardedResult.message);
      const channelName: string | null = clearChannelName(rawChannelName);
      if (channelName === null) {
        replyMessage = '❗ Invalid channel username.';
      } else {
        try {
          const entity: Entity = await client.getEntity(channelName);
          if (entity.className === 'Channel') {
            if (!scrapChannels.map((item) => item.name).includes(channelName)) {
              scrapChannels.push({ name: channelName, messageId: 0 });
              const markdown = channelsToMarkdown(scrapChannels);
              await this.messageService.editMessage(this.storageChannel, lastForwardedResult.id, markdown);
              didUpdateChannels = true;
              replyMessage = `🔥 Channel <b>${channelName}</b> has been added to list.`;
            } else {
              replyMessage = `🙅🏻‍♂️ <b>${channelName}</b> is already in the list.`;
            }
          } else {
            replyMessage = `⚠️ Username <b>${channelName}</b> is of type <b>${entity.className}</b>. It must be channels only.`;
          }
        } catch (e) {
          replyMessage = `😕 Channel <b>${channelName}</b> doesn't exist, check the username.`;
        }
      }
    } else if (!success) {
      replyMessage = 'Cannot extract messages from storage.';
    } else {
      replyMessage = '🗑️ Store channel is empty.';
    }

    await client.sendMessage(sender, { message: replyMessage, parseMode: 'html' });

    if (didUpdateChannels) {
      await this.syncService.refreshSubscriptions(client);
    }
  }
}
