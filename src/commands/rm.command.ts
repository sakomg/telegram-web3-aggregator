import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';
import { channelsToMarkdown, clearChannelName, markdownToChannels } from '../utils/main.utils';
import { MessageService, SyncService } from '../services';

export class RmCommand implements CommandHandler {
  private readonly messageService: MessageService;
  private readonly storageChannel: string;
  private readonly syncService: SyncService;

  constructor(messageService: MessageService, storageChannel: string, syncService: SyncService) {
    this.messageService = messageService;
    this.storageChannel = storageChannel;
    this.syncService = syncService;
  }

  async handle(botClient: TelegramClient, sender: any, message: string) {
    const channelName = clearChannelName(message?.split(' ')[1]);
    if (channelName === null) {
      await botClient.sendMessage(sender, { message: '❗ Invalid channel username.', parseMode: 'html' });
      return;
    }

    let replyMessage = '';
    let didUpdateChannels = false;
    const { success, value } = await this.messageService.getMessagesHistory(this.storageChannel, 1);

    if (success && value.messages?.length) {
      const lastForwardedResult = value.messages[0];
      const scrapChannels = markdownToChannels(lastForwardedResult.message);
      if (scrapChannels.map((item) => item.name).includes(channelName)) {
        const newChannels = scrapChannels.filter((item) => item.name !== channelName);
        await this.messageService.editMessage(this.storageChannel, lastForwardedResult.id, channelsToMarkdown(newChannels));
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

    if (didUpdateChannels) {
      this.syncService.refreshSubscriptions(botClient).then(() => {
        botClient.sendMessage(sender, { message: replyMessage, parseMode: 'html' });
      });
    }
  }
}
