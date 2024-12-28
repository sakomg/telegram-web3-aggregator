import { TelegramClient } from 'telegram';
import { MessageFilterService } from './filter.service';
import { MessageService } from './message.service';
import { channelsToMarkdown, delay, markdownToChannels } from '../utils/main.utils';

export class SyncService {
  private readonly config;
  private readonly messageService: MessageService;
  private readonly messageFilterService: MessageFilterService;
  private startIntervalId: NodeJS.Timeout | undefined;

  constructor(config: any, messageService: MessageService, messageFilterService: MessageFilterService) {
    this.config = config;
    this.messageService = messageService;
    this.messageFilterService = messageFilterService;
  }

  async start(client: TelegramClient, sender: any) {
    try {
      const sentMessage = await client.sendMessage(sender, {
        message: `🔄 Sync in 60 seconds...`,
        parseMode: 'html',
      });

      let remainingTime = 60;
      this.startIntervalId = setInterval(async () => {
        remainingTime -= 15;
        if (remainingTime > 0) {
          client.editMessage(sender, {
            message: sentMessage.id,
            text: `🔄 Sync in ${remainingTime} seconds...`,
          });
        } else {
          this.stop();
          await client.deleteMessages(sender, [sentMessage.id], { revoke: true });
          await this.#processStart(client, sender);
        }
      }, 15000);
    } catch (error) {
      console.error('Error starting timer:', error);
    }
  }

  stop() {
    if (this.startIntervalId) {
      clearInterval(this.startIntervalId);
      this.startIntervalId = undefined;
    }
  }

  async #processStart(client: TelegramClient, sender: any) {
    const storageChannelResult = await this.messageService.getMessagesHistory(
      this.config.get('TELEGRAM_STORAGE_CHANNEL_USERNAME'),
      1,
    );
    if (storageChannelResult == null) {
      await client.sendMessage(sender, {
        message: `❗ Cannot extract storage channel messages.`,
        parseMode: 'html',
      });
      return;
    }
    if (storageChannelResult.messages?.length) {
      let needToUpdate = false;
      let channelsWithGetMessageIssues: any[] = [];
      const lastForwardedResult = storageChannelResult.messages[0];
      const scrapChannels = markdownToChannels(lastForwardedResult.message);

      for (const channel of scrapChannels) {
        const result = await this.messageService.getMessagesHistory(channel.name, 3);
        if (!result.success) {
          channelsWithGetMessageIssues.push({ channel: channel.name, message: result.value });
          continue;
        }
        const messages = result.value?.messages;

        const newMessages = this.messageFilterService
          .filterGarbage(messages)
          .filter((msg: any) => msg.id > channel.messageId)
          .map((msg: any) => msg.id)
          .sort((a: number, b: number) => a - b);

        console.log(`${channel.name} ===>`, newMessages);

        if (newMessages.length > 0) {
          try {
            await this.messageService.forwardMessages(
              channel.name,
              this.config.get('TELEGRAM_TARGET_CHANNEL_USERNAME'),
              newMessages,
            );
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

        await delay(777);
      }

      if (channelsWithGetMessageIssues.length) {
        const channelDetails = channelsWithGetMessageIssues.map((item) => `${item.channel} (error: ${item.message})`).join(', ');

        await client.sendMessage(sender, {
          message: `Cannot extract messages from channels: ${channelDetails}`,
        });
      }

      if (needToUpdate) {
        const markdown = channelsToMarkdown(scrapChannels);
        console.log('markdown:', markdown);
        await client.editMessage(this.config.get('TELEGRAM_STORAGE_CHANNEL_USERNAME'), {
          message: lastForwardedResult.id,
          text: markdown,
        });
      }
    } else {
      await client.sendMessage(sender, {
        message: '🗑️ Store channel is empty.',
      });
    }

    await this.start(client, sender);
  }
}
