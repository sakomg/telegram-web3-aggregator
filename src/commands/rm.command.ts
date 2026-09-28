import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';
import { clearChannelName } from '../utils/main.utils';
import { MessageService, SyncService } from '../services';

export class RmCommand implements CommandHandler {
  private readonly messageService: MessageService;
  private readonly syncService: SyncService;

  constructor(messageService: MessageService, syncService: SyncService) {
    this.messageService = messageService;
    this.syncService = syncService;
  }

  async handle(botClient: TelegramClient, sender: any, message: string) {
    const reply = await this.#unsubscribe(clearChannelName(message.split(/\s+/)[1]));
    await botClient.sendMessage(sender, { message: reply, parseMode: 'html' });
  }

  async #unsubscribe(channelName: string | null): Promise<string> {
    if (!channelName) return '❗ Invalid channel username.';

    try {
      if (!(await this.syncService.removeChannel(channelName))) return `🤷 Channel <b>${channelName}</b> doesn't exist in the list.`;
    } catch {
      return 'Cannot read storage channel.';
    }

    try {
      await this.messageService.leaveChannel(channelName);
    } catch {
      return `⚠️ Could not auto-leave ${channelName} with user account — leave manually.\n🔥 Channel <b>${channelName}</b> has been removed successfully.`;
    }
    return `🔥 Channel <b>${channelName}</b> has been removed successfully.`;
  }
}
