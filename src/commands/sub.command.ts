import { TelegramClient } from 'telegram';
import { Entity } from 'telegram/define';
import { CommandHandler } from '../types/command-handler.interface';
import { channelsToMarkdown, clearChannelName, markdownToChannels } from '../utils/main.utils';
import { MessageService } from '../services';

export class SubCommand implements CommandHandler {
  private readonly messageService: MessageService;
  private readonly storageChannel: string;

  constructor(messageService: MessageService, storageChannel: string) {
    this.messageService = messageService;
    this.storageChannel = storageChannel;
  }

  async handle(botClient: TelegramClient, sender: any, message: string) {
    console.log(`💥 /sub handler`);
    await this.processSubscriptionChannel(botClient, sender, message);
  }

  async processSubscriptionChannel(client: TelegramClient, sender: any, message: string) {
    const rawChannelName = message?.split(' ')[1];
    const storageChannelResult = await this.messageService.getMessagesHistory(this.storageChannel, 1);
    const lastForwardedResult = storageChannelResult.messages[0];
    const scrapChannels = markdownToChannels(lastForwardedResult.message);
    let replyMessage = '';
    const channelName: string | null = clearChannelName(rawChannelName);
    if (channelName == null) {
      replyMessage = '❗ Invalid channel username.';
    } else {
      try {
        const entity: Entity = await client.getEntity(channelName);
        if (entity.className === 'Channel') {
          if (!scrapChannels.map((item) => item.name).includes(channelName)) {
            scrapChannels.push({
              name: channelName,
              messageId: 0,
            });
            const markdown = channelsToMarkdown(scrapChannels);
            client.editMessage(this.storageChannel, { message: lastForwardedResult.id, text: markdown });
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

    await client.sendMessage(sender, { message: replyMessage, parseMode: 'html' });
  }
}
