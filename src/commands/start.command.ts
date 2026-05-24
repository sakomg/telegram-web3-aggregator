import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';
import { SyncService } from '../services';

export class StartCommand implements CommandHandler {
  private readonly syncService: SyncService;

  constructor(syncService: SyncService) {
    this.syncService = syncService;
  }

  async handle(botClient: TelegramClient, sender: any) {
    this.syncService.start(botClient, sender).then(() => {
      botClient.sendMessage(sender, { message: `🎬 Started.`, parseMode: 'html' });
    });
  }
}
