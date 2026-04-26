import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';
import { Logger, MessageService } from '../services';

export class TranscribeCommand implements CommandHandler {
  private readonly messageService: MessageService;
  private readonly config: any;
  private readonly logger = new Logger('TranscribeCommand');

  constructor(messageService: MessageService, config: any) {
    this.messageService = messageService;
    this.config = config;
  }

  async handle(botClient: TelegramClient, sender: any, message: string) {
    this.logger.info('Transcribe command triggered');
    await this.#processTranscribeAudio(botClient, message, sender);
  }

  async #processTranscribeAudio(botClient: TelegramClient, message: string, sender: any) {
    const msgId = message?.split(' ')[1];
    if (!msgId || Number.isNaN(Number(msgId))) {
      await botClient.sendMessage(sender, { message: '❗ Specify valid message id. Example: /transcribe 123' });
      return;
    }

    try {
      const toChannel = this.config.get('TELEGRAM_TARGET_CHANNEL_USERNAME');
      const result = await this.messageService.transcribeAudio(toChannel, msgId);
      await botClient.sendMessage(sender, { message: result.text, parseMode: 'html' });
    } catch (e) {
      this.logger.error('Transcribe command failed', e);
      await botClient.sendMessage(sender, { message: JSON.stringify(e) });
    }
  }
}
