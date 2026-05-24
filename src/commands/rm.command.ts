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
      if (scrapChannels.some((ch) => ch.name === channelName)) {
        const newChannels = scrapChannels.filter((ch) => ch.name !== channelName);
        await this.messageService.editMessage(this.storageChannel, lastForwardedResult.id, channelsToMarkdown(newChannels));

        try {
          await this.messageService.leaveChannel(channelName);
        } catch {
          replyMessage += `⚠️ Could not auto-leave ${channelName} with user account — leave manually.\n`;
        }

        didUpdateChannels = true;
        replyMessage += `🔥 Channel <b>${channelName}</b> has been removed successfully.`;
      } else {
        replyMessage = `🤷 Channel <b>${channelName}</b> doesn't exist in the list.`;
      }
    } else if (!success) {
      replyMessage = 'Cannot extract messages from storage.';
    } else {
      replyMessage = '🗑️ Store channel is empty.';
    }

    await botClient.sendMessage(sender, { message: replyMessage, parseMode: 'html' });

    if (didUpdateChannels) {
      await this.syncService.refreshSubscriptions(botClient);
    }
  }
}
