import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';
import { channelsToMarkdown, clearChannelName, markdownToChannels } from '../utils/main.utils';
import { Logger, MessageService, SyncService } from '../services';

export class RmCommand implements CommandHandler {
  private readonly messageService: MessageService;
  private readonly storageChannel: string;
  private readonly syncService: SyncService;
  private readonly logger = new Logger('RmCommand');

  constructor(messageService: MessageService, storageChannel: string, syncService: SyncService) {
    this.messageService = messageService;
    this.storageChannel = storageChannel;
    this.syncService = syncService;
  }

  async handle(botClient: TelegramClient, sender: any, message: string) {
    this.logger.info('Remove command triggered');
    await this.#processRemoveChannel(botClient, message, sender);
  }

  async #processRemoveChannel(client: TelegramClient, message: string, sender: any) {
    let replyMessage = '';
    let didUpdateChannels = false;
    const rawChannelName = message?.split(' ')[1];
    const channelName = clearChannelName(rawChannelName);
    if (channelName === null) {
      await client.sendMessage(sender, { message: '❗ Invalid channel username.', parseMode: 'html' });
      return;
    }

    const { success, value } = await this.messageService.getMessagesHistory(this.storageChannel, 1);

    if (success && value.messages?.length) {
      const lastForwardedResult = value.messages[0];
      const scrapChannels = markdownToChannels(lastForwardedResult.message);
      const channelNames = scrapChannels.map((item) => item.name);
      if (channelNames.includes(channelName)) {
        const newChannels = scrapChannels.filter((item) => item.name !== channelName);
        const markdown = channelsToMarkdown(newChannels);
        await this.messageService.editMessage(this.storageChannel, lastForwardedResult.id, markdown);
        didUpdateChannels = true;
        replyMessage = `🔥 Channel <b>${channelName}</b> has been removed successfully.`;
      } else {
        replyMessage = `🤷 Channel <b>${channelName}</b> doesn't exist in the list.`;
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
