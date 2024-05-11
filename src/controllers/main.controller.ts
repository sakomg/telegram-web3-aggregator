import { TelegramClient } from 'telegram';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { Entity } from 'telegram/define';
import TgClientAuth from '../auth/main.auth';
import MessageService from '../services/message.service';

export default class MainController {
  private readonly config: any;
  private readonly storageChannel: string;

  constructor(config: any) {
    this.config = config;
    this.storageChannel = this.config.get('TELEGRAM_STORAGE_CHANNEL_USERNAME');
  }

  async launch() {
    const botClientContainer = new TgClientAuth('BOT');
    await botClientContainer.start();
    const userClientContainer = new TgClientAuth('USER');
    await userClientContainer.start();

    const messageService = new MessageService(botClientContainer.client, userClientContainer.client);
    botClientContainer.client.addEventHandler(async (event: NewMessageEvent) => {
      if (event?.message?.message) {
        const messageWrapper = event.message;
        const sender = await messageWrapper.getSender();
        const message = messageWrapper.message;
        if (message.startsWith('/sub')) {
          this.processSubscriptionChannel(botClientContainer.client, messageService, message, sender);
        }
        if (message.startsWith('/start')) {
          setInterval(() => this.processStart(botClientContainer.client, messageService, sender), 10000);
        }
      }
    }, new NewMessage({}));
  }

  async processSubscriptionChannel(client: TelegramClient, messageService: MessageService, message: string, sender: any) {
    const channelName = message?.split(' ')[1];
    const storageChannelResult = await messageService.getMessagesHistory(this.storageChannel, 1);
    const lastForwardedResult = storageChannelResult.messages[0];
    const scrapChannels = this.markdownToChannels(lastForwardedResult.message);
    let replyMessage = '';
    try {
      const entity: Entity = await client.getEntity(channelName);
      if (entity.className === 'Channel') {
        if (!scrapChannels.map((item) => item.name).includes(channelName)) {
          scrapChannels.push({
            name: channelName,
            messageId: 0,
          });
          const markdown = this.channelsToMarkdown(scrapChannels);

          client.sendMessage(this.storageChannel, { message: markdown, parseMode: 'markdown' });
          replyMessage = `Channel <b>${channelName}</b> has been added to list.`;
        } else {
          replyMessage = `<b>${channelName}</b> is already in the list.`;
        }
      } else {
        replyMessage = `Username <b>${channelName}</b> is of type <b>${entity.className}</b>. It must be channels only.`;
      }
    } catch (e) {
      replyMessage = `Channel <b>${channelName}</b> doesn't exist, check the username.`;
    }

    await client.sendMessage(sender, { message: replyMessage, parseMode: 'html' });
  }

  async processStart(client: TelegramClient, messageService: MessageService, sender: any) {
    const storageChannelResult = await messageService.getMessagesHistory(this.storageChannel, 1);
    if (storageChannelResult.messages?.length) {
      let needToUpdate = false;
      const lastForwardedResult = storageChannelResult.messages[0];
      const scrapChannels = this.markdownToChannels(lastForwardedResult.message);
      for (const channel of scrapChannels) {
        const result = await messageService.getMessagesHistory(channel.name, 1);
        const messageIds = result?.messages.map((item: any) => item.id).toSorted();
        if (channel.messageId != messageIds[0]) {
          needToUpdate = true;
          channel.messageId = messageIds[0];
          await messageService.forwardMessages(channel.name, this.config.get('TELEGRAM_TARGET_CHANNEL_USERNAME'), messageIds);
          client.sendMessage(sender, {
            message: `Message ${messageIds[0]} has been forwarded from ${channel.name} at ${new Date().toLocaleString()}`,
            parseMode: 'html',
          });
        }
      }

      if (needToUpdate) {
        const markdown = this.channelsToMarkdown(scrapChannels);
        client.editMessage(this.storageChannel, { message: lastForwardedResult.id, text: markdown });
      }
    } else {
      client.sendMessage(sender, {
        message: 'Store channel is empty.',
      });
    }
  }

  markdownToChannels(markdownContent: string) {
    const channels: Array<any> = [];
    const rows = markdownContent.trim().split('\n').slice(2);

    rows.forEach((row) => {
      const [name, messageId] = row
        .trim()
        .split('|')
        .slice(1, 3)
        .map((cell) => cell.trim());
      if (name && messageId) {
        channels.push({ name, messageId: parseInt(messageId) });
      }
    });

    return channels;
  }

  channelsToMarkdown(channels: Array<any>) {
    let markdown = '| Name | Message ID |\n';
    markdown += '| ---- | ---------- |\n';
    channels.forEach((channel) => {
      markdown += `| ${channel.name} | ${channel.messageId} |\n`;
    });
    return markdown;
  }
}
