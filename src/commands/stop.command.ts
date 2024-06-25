import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';
import { SyncService } from '../services';

export class StopCommand implements CommandHandler {
  private readonly syncService: SyncService;

  constructor(syncService: SyncService) {
    this.syncService = syncService;
  }

  async handle(botClient: TelegramClient, sender: any) {
    console.log(`💥 /stop handler`);
    this.syncService.stop();
  }
}
