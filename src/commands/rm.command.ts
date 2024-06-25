import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';
import { channelsToMarkdown, clearChannelName, markdownToChannels } from '../utils/main.utils';
import { MessageService } from '../services';

export class RmCommand implements CommandHandler {
  private readonly messageService: MessageService;
  private readonly storageChannel: string;

  constructor(messageService: MessageService, storageChannel: string) {
    this.messageService = messageService;
    this.storageChannel = storageChannel;
  }

  async handle(botClient: TelegramClient, sender: any, message: string) {
    console.log(`💥 /rm handler`);
    await this.processRemoveChannel(botClient, message, sender);
  }

  async processRemoveChannel(client: TelegramClient, message: string, sender: any) {
    const rawChannelName = message?.split(' ')[1];
    const storageChannelResult = await this.messageService.getMessagesHistory(this.storageChannel, 1);
    const lastForwardedResult = storageChannelResult.messages[0];
    const scrapChannels = markdownToChannels(lastForwardedResult.message);
    const channelNames = scrapChannels.map((item) => item.name);
    const channelName = clearChannelName(rawChannelName);
    let replyMessage = '';
    if (channelNames.includes(channelName)) {
      const newChannels = scrapChannels.filter((item) => item.name !== channelName);
      const markdown = channelsToMarkdown(newChannels);
      client.editMessage(this.storageChannel, { message: lastForwardedResult.id, text: markdown });
      replyMessage = `🔥 Channel <b>${channelName}</b> has been removed successfully.`;
    } else {
      replyMessage = `🤷 Channel <b>${channelName}</b> doesn't exist in the list.`;
    }

    await client.sendMessage(sender, { message: replyMessage, parseMode: 'html' });
  }
}
