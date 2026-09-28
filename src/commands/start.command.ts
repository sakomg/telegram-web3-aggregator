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
    await botClient.sendMessage(sender, { message: '🎬 Starting sync, catch-up may take a few minutes…' });
    this.syncService.start().catch((e) => this.logger.error('Sync start failed', e));
  }
}
