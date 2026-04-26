import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';
import { Logger, SyncService } from '../services';

export class StartCommand implements CommandHandler {
  private readonly syncService: SyncService;
  private readonly logger = new Logger('StartCommand');

  constructor(syncService: SyncService) {
    this.syncService = syncService;
  }

  async handle(botClient: TelegramClient, sender: any) {
    this.logger.info('Start command triggered');
    await botClient.sendMessage(sender, { message: `🎬 Started.`, parseMode: 'html' });
    await this.syncService.start(botClient, sender);
  }
}
