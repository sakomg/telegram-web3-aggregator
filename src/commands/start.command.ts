import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';
import { SyncService } from '../services';

export class StartCommand implements CommandHandler {
  private readonly syncService: SyncService;

  constructor(syncService: SyncService) {
    this.syncService = syncService;
  }

  async handle(botClient: TelegramClient, sender: any) {
    await botClient.sendMessage(sender, { message: '🎬 Starting sync, catch-up may take a few minutes…', parseMode: 'html' });
    this.syncService.start(botClient, sender).catch(() => {});
  }
}
