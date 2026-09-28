import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';
import { SyncService } from '../services';

const formatTime = (date: Date | null) => (date ? date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—');

export class StatusCommand implements CommandHandler {
  private readonly syncService: SyncService;

  constructor(syncService: SyncService) {
    this.syncService = syncService;
  }

  async handle(botClient: TelegramClient, sender: any) {
    const status = this.syncService.getStatus();
    const filtered = Object.entries(status.filtered)
      .map(([reason, count]) => `${reason}: ${count}`)
      .join(', ');

    const lines = [
      `${status.isActive ? '🟢 Sync is running' : '🔴 Sync is stopped'} for <b>${status.channels}</b> channels`,
      `Started: ${formatTime(status.startedAt)}`,
      `Last catch-up: ${formatTime(status.lastCatchUpAt)}`,
      `Forwarded: <b>${status.forwarded}</b> | Duplicates: ${status.duplicates} | Failed: ${status.failed} | Gaps: ${status.gaps}`,
      `Filtered: ${filtered || '0'}`,
    ];
    if (status.unsubscribed.length) lines.push(`⚠️ Not subscribed: ${status.unsubscribed.join(', ')}`);

    await botClient.sendMessage(sender, { message: lines.join('\n'), parseMode: 'html' });
  }
}
