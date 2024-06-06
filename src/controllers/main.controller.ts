import { Api, TelegramClient } from 'telegram';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { Entity } from 'telegram/define';
import { delay } from '../utils/main.utils';
import TgClientAuth from '../auth/main.auth';
import MessageService from '../services/message.service';
import MessageFilterService from '../services/filter.service';

export default class MainController {
  private readonly config: any;
  private readonly storageChannel: string;
  private startIntervalId: NodeJS.Timeout | undefined;
  private messageFilterService: MessageFilterService;

  constructor(config: any) {
    this.config = config;
    this.storageChannel = this.config.get('TELEGRAM_STORAGE_CHANNEL_USERNAME');
    this.messageFilterService = new MessageFilterService();
  }

  async launch() {
    const botClientContainer = new TgClientAuth('BOT');
    const botClient = await botClientContainer.start();
    const userClientContainer = new TgClientAuth('USER');
    const userClient = await userClientContainer.start();

    await botClient.invoke(
      new Api.bots.SetBotCommands({
        scope: new Api.BotCommandScopeDefault(),
        langCode: '',
        commands: [
          new Api.BotCommand({ command: 'start', description: 'To start post forwarding.' }),
          new Api.BotCommand({ command: 'commands', description: 'To show all available commands.' }),
          new Api.BotCommand({ command: 'stop', description: 'To stop post forwarding.' }),
        ],
      }),
    );

    const messageService = new MessageService(botClient, userClient);

    botClient.addEventHandler(async (event: NewMessageEvent) => {
      if (event?.message?.message) {
        const messageWrapper = event.message;
        const sender: any = await messageWrapper.getSender();
        const message: string = messageWrapper.message;
        try {
          if (message.startsWith('/start')) {
            console.log(`💥 /start handler, execution time: ${new Date().toLocaleString()}`);
            this.clearTimer();
            await botClient.sendMessage(sender, { message: `🎬 Started.`, parseMode: 'html' });
            await this.startTimer(botClient, messageService, sender, this.messageFilterService);
          }
          if (message.startsWith('/stop')) {
            console.log(`💥 /stop handler`);
            this.clearTimer();
          }
          if (message.startsWith('/timer')) {
            await botClient.sendMessage(sender, {
              message: this.startIntervalId ? 'it is working' : 'call /start command to have interval',
            });
          }
          if (message.startsWith('/transcribe')) {
            console.log(`💥 /transcribe handler`);
            this.processTranscribeAudio(botClient, userClient, message, sender);
          }
          if (message.startsWith('/sub')) {
            console.log(`💥 /sub handler`);
            this.processSubscriptionChannel(botClient, messageService, message, sender);
          }
          if (message.startsWith('/rm')) {
            console.log(`💥 /rm handler`);
            this.processRemoveChannel(botClient, messageService, message, sender);
          }
          if (message.startsWith('/commands')) {
            console.log(`💥 /commands handler`);
            this.sendCommandsList(botClient, sender);
          }
        } catch (e) {
          console.log('❗❗❗ Error in handlers. Check it manually to resolve.');
        }
      }
    }, new NewMessage({}));

    // console.log('b:', botClient.session.save());
    // console.log('u:', userClient.session.save());
  }

  async processStart(
    client: TelegramClient,
    messageService: MessageService,
    sender: any,
    messageFilterService: MessageFilterService,
  ) {
    const storageChannelResult = await messageService.getMessagesHistory(this.storageChannel, 1);
    if (storageChannelResult.messages?.length) {
      let needToUpdate = false;
      const lastForwardedResult = storageChannelResult.messages[0];
      const scrapChannels = this.markdownToChannels(lastForwardedResult.message);

      for (const channel of scrapChannels) {
        const result = await messageService.getMessagesHistory(channel.name, 3);
        const messages = result?.messages;

        const newMessages = messageFilterService
          .filterGarbage(messages)
          .filter((msg: any) => msg.id > channel.messageId)
          .map((msg: any) => msg.id)
          .sort((a: number, b: number) => a - b);

        console.log(`${channel.name} ===>`, newMessages);

        if (newMessages.length > 0) {
          try {
            await messageService.forwardMessages(channel.name, this.config.get('TELEGRAM_TARGET_CHANNEL_USERNAME'), newMessages);
            await client.sendMessage(sender, {
              message: `✨ Messages ${newMessages.join(', ')} have been forwarded from ${channel.name}.`,
              parseMode: 'html',
            });
          } catch (e) {
            await client.sendMessage(sender, {
              message: `🚩 Error in forwarding messages ${newMessages.join(', ')} from ${channel.name} channel.`,
              parseMode: 'html',
            });
          } finally {
            needToUpdate = true;
            channel.messageId = newMessages[newMessages.length - 1];
          }
        }

        await delay(500);
      }

      if (needToUpdate) {
        const markdown = this.channelsToMarkdown(scrapChannels);
        console.log('markdown:', markdown);
        await client.editMessage(this.storageChannel, { message: lastForwardedResult.id, text: markdown });
      }
    } else {
      await client.sendMessage(sender, {
        message: '🗑️ Store channel is empty.',
      });
    }

    await this.startTimer(client, messageService, sender, this.messageFilterService);
  }

  async startTimer(
    client: TelegramClient,
    messageService: MessageService,
    sender: any,
    messageFilterService: MessageFilterService,
  ) {
    try {
      const sentMessage = await client.sendMessage(sender, {
        message: `🔄 Sync in 45 seconds...`,
        parseMode: 'html',
      });

      let remainingTime = 45;
      this.startIntervalId = setInterval(async () => {
        remainingTime -= 15;
        if (remainingTime > 0) {
          client.editMessage(sender, {
            message: sentMessage.id,
            text: `🔄 Sync in ${remainingTime} seconds...`,
          });
        } else {
          this.clearTimer();
          await client.deleteMessages(sender, [sentMessage.id], { revoke: true });
          await this.processStart(client, messageService, sender, messageFilterService);
        }
      }, 15000);
    } catch (error) {
      console.error('Error starting timer:', error);
    }
  }

  clearTimer() {
    if (this.startIntervalId) {
      clearInterval(this.startIntervalId);
      this.startIntervalId = undefined;
    }
  }

  async processTranscribeAudio(botClient: TelegramClient, userClient: TelegramClient, message: string, sender: any) {
    const msgId = message?.split(' ')[1];
    try {
      const result = await userClient.invoke(
        new Api.messages.TranscribeAudio({
          peer: this.config.get('TELEGRAM_TARGET_CHANNEL_USERNAME'),
          msgId: parseInt(msgId),
        }),
      );
      await botClient.sendMessage(sender, { message: result.text, parseMode: 'html' });
    } catch (e) {
      await botClient.sendMessage(sender, { message: JSON.stringify(e) });
    }
  }

  async processSubscriptionChannel(client: TelegramClient, messageService: MessageService, message: string, sender: any) {
    const rawChannelName = message?.split(' ')[1];
    const storageChannelResult = await messageService.getMessagesHistory(this.storageChannel, 1);
    const lastForwardedResult = storageChannelResult.messages[0];
    const scrapChannels = this.markdownToChannels(lastForwardedResult.message);
    let replyMessage = '';
    const channelName: string | null = this.clearChannelName(rawChannelName);
    if (channelName == null) {
      replyMessage = 'Invalid chanel username.';
    } else {
      try {
        const entity: Entity = await client.getEntity(channelName);
        if (entity.className === 'Channel') {
          if (!scrapChannels.map((item) => item.name).includes(channelName)) {
            scrapChannels.push({
              name: channelName,
              messageId: 0,
            });
            const markdown = this.channelsToMarkdown(scrapChannels);
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

  async processRemoveChannel(client: TelegramClient, messageService: MessageService, message: string, sender: any) {
    const channelName = message?.split(' ')[1];
    const storageChannelResult = await messageService.getMessagesHistory(this.storageChannel, 1);
    const lastForwardedResult = storageChannelResult.messages[0];
    const scrapChannels = this.markdownToChannels(lastForwardedResult.message);
    const channelNames = scrapChannels.map((item) => item.name);
    let replyMessage = '';
    if (channelNames.includes(channelName)) {
      const newChannels = scrapChannels.filter((item) => item.name !== channelName);
      const markdown = this.channelsToMarkdown(newChannels);
      client.editMessage(this.storageChannel, { message: lastForwardedResult.id, text: markdown });
      replyMessage = `🔥 Channel <b>${channelName}</b> has been removed successfully.`;
    } else {
      replyMessage = `🤷 Channel <b>${channelName}</b> doesn't exist in the list.`;
    }

    await client.sendMessage(sender, { message: replyMessage, parseMode: 'html' });
  }

  sendCommandsList(bot: TelegramClient, sender: any) {
    const commands = [
      { command: 'sub', description: 'to add channel to track list. /sub @channel_name' },
      { command: 'rm', description: 'to remove channel from track list. /rm @channel_name' },
      { command: 'transcribe', description: 'to transcribe audio to text. /transcribe messageId' },
    ];
    const message = commands.map((cmd) => `<b>${cmd.command}</b>: <i>${cmd.description}</i>`).join('\n');

    bot.sendMessage(sender, { message, parseMode: 'html' });
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

  clearChannelName = (url: string): string | null => {
    if (typeof url !== 'string') return null;
    const trimmedUrl = url.trim();
    if (trimmedUrl.startsWith('https://t.me/')) return `@${trimmedUrl.slice(13)}`;
    if (trimmedUrl.startsWith('@')) return trimmedUrl;
    return `@${trimmedUrl}`;
  };
}
