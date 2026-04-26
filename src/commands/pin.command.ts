import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';
import { Logger, MessageService } from '../services';

export class PinCommand implements CommandHandler {
  private readonly messageService: MessageService;
  private readonly config: any;
  private readonly logger = new Logger('PinCommand');

  constructor(messageService: MessageService, config: any) {
    this.messageService = messageService;
    this.config = config;
  }

  async handle(botClient: TelegramClient, sender: any, message: string) {
    this.logger.info('Pin command triggered');
    const regex = /^\/pin\s+([^\s]+)\s+-\s+([^\s]+)\s+-\s+(.+)/;
    const matches = regex.exec(message);

    if (!matches) {
      await botClient.sendMessage(sender, { message: 'Invalid command format' });
      return;
    }

    const channel = this.config.get('TELEGRAM_TARGET_CHANNEL_USERNAME');
    const sendMessageId: number | null = await this.#sendMessageWithMarkup(channel, botClient, sender, matches);
    if (sendMessageId !== null) {
      try {
        await this.messageService.pinMessage(channel, sendMessageId);
      } catch (e: any) {
        this.logger.error('Pinning message failed', e);

        await botClient.sendMessage(sender, { message: e });
      }
    }
  }

  async #sendMessageWithMarkup(channel: string, client: TelegramClient, sender: any, matches: RegExpExecArray) {
    try {
      const result: any = await this.messageService.sendMessageWithMarkup(channel, matches);

      return Number(result.updates[1].message.id);
    } catch (err: any) {
      this.logger.error('Sending pin message with markup failed', err);
      await client.sendMessage(sender, { message: err });
      return null;
    }
  }
}
