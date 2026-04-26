import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';
import { Logger, SyncService } from '../services';

export class StopCommand implements CommandHandler {
  private readonly syncService: SyncService;
  private readonly logger = new Logger('StopCommand');

  constructor(syncService: SyncService) {
    this.syncService = syncService;
  }

  async handle(botClient: TelegramClient, sender: any) {
    this.logger.info('Stop command triggered');
    this.syncService.stop();
  }
}
