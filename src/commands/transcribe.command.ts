import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';
import { MessageService } from '../services';

export class TranscribeCommand implements CommandHandler {
  private readonly messageService: MessageService;
  private readonly config: any;

  constructor(messageService: MessageService, config: any) {
    this.messageService = messageService;
    this.config = config;
  }

  async handle(botClient: TelegramClient, sender: any, message: string) {
    console.log(`💥 /transcribe handler`);
    await this.processTranscribeAudio(botClient, message, sender);
  }

  async processTranscribeAudio(botClient: TelegramClient, message: string, sender: any) {
    const msgId = message?.split(' ')[1];
    try {
      const toChannel = this.config.get('TELEGRAM_TARGET_CHANNEL_USERNAME');
      const result = await this.messageService.transcribeAudio(toChannel, msgId);
      await botClient.sendMessage(sender, { message: result.text, parseMode: 'html' });
    } catch (e) {
      await botClient.sendMessage(sender, { message: JSON.stringify(e) });
    }
  }
}
