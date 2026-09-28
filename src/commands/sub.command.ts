import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';
import { clearChannelName } from '../utils/main.utils';
import { MessageService, SyncService } from '../services';

export class SubCommand implements CommandHandler {
  private readonly messageService: MessageService;
  private readonly syncService: SyncService;

  constructor(messageService: MessageService, syncService: SyncService) {
    this.messageService = messageService;
    this.syncService = syncService;
  }

  async handle(botClient: TelegramClient, sender: any, message: string) {
    const reply = await this.#subscribe(clearChannelName(message.split(/\s+/)[1]));
    await botClient.sendMessage(sender, { message: reply, parseMode: 'html' });
  }

  async #subscribe(channelName: string | null): Promise<string> {
    if (!channelName) return '❗ Invalid channel username.';

    let entity: any;
    try {
      entity = await this.messageService.resolveChannel(channelName);
    } catch {
      return `😕 Channel <b>${channelName}</b> doesn't exist, check the username.`;
    }
    if (entity.className !== 'Channel') {
      return `⚠️ Username <b>${channelName}</b> is of type <b>${entity.className}</b>. It must be channels only.`;
    }

    let warning = '';
    try {
      await this.messageService.joinChannel(channelName);
    } catch (e) {
      if (!String(e).includes('USER_ALREADY_PARTICIPANT')) {
        warning = `⚠️ Could not auto-join ${channelName} with user account — join manually to receive live updates.\n`;
      }
    }

    try {
      if (!(await this.syncService.addChannel(channelName))) return `🙅🏻‍♂️ <b>${channelName}</b> is already in the list.`;
    } catch {
      return 'Cannot read storage channel.';
    }
    return `${warning}🔥 Channel <b>${channelName}</b> has been added to list.`;
  }
}
