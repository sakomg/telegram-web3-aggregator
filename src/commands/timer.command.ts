import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';
import { SyncService } from '../services';

export class TimerCommand implements CommandHandler {
  private readonly syncService: SyncService;

  constructor(syncService: SyncService) {
    this.syncService = syncService;
  }

  async handle(botClient: TelegramClient, sender: any) {
    await botClient.sendMessage(sender, {
      message: this.syncService.isSync() ? '👍🏿' : '👎🏿',
    });
  }
}
