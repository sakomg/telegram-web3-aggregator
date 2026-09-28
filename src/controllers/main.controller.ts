import { NewMessage, NewMessageEvent } from 'telegram/events';
import { CommandHandler } from '../types/command-handler.interface';
import { CommandsCommand, RmCommand, StartCommand, StopCommand, SubCommand } from '../commands';
import { Logger, MessageFilterService, MessageService, SyncService } from '../services';
import TgClientAuth from '../auth/main.auth';
import { normalizeUsername } from '../utils/main.utils';

export default class MainController {
  private readonly config: any;
  private readonly logger = new Logger('MainController');
  private syncService: SyncService | null = null;

  constructor(config: any) {
    this.config = config;
  }

  async launch() {
    const [botClient, userClient] = await Promise.all([new TgClientAuth('BOT').start(), new TgClientAuth('USER').start()]);

    const adminUsernames: string[] = this.config.get('TELEGRAM_ADMIN_USERNAMES') ?? [];
    const recipients = adminUsernames.map(normalizeUsername);

    const messageService = new MessageService(botClient, userClient);
    const syncService = new SyncService(this.config, messageService, new MessageFilterService(), userClient, recipients);
    this.syncService = syncService;

    const commandHandlers: Record<string, CommandHandler> = {
      '/start': new StartCommand(syncService),
      '/stop': new StopCommand(syncService),
      '/sub': new SubCommand(messageService, syncService),
      '/rm': new RmCommand(messageService, syncService),
    };
    commandHandlers['/commands'] = new CommandsCommand([...Object.keys(commandHandlers), '/commands']);

    botClient.addEventHandler(async (event: NewMessageEvent) => {
      if (!event?.message?.message) return;

      try {
        const message = event.message.message;
        if (!message.startsWith('/')) return;

        const sender: any = await event.message.getSender();
        if (sender?.className !== 'User') return;

        if (!adminUsernames.includes(sender.username)) {
          await botClient.sendMessage(sender, { message: '🛑 You do not have permission to send messages.' });
          return;
        }

        const command = message.trim().split(/\s+/)[0];
        const handler = commandHandlers[command];
        if (handler) {
          this.logger.info(`Command received: ${command}`);
          await handler.handle(botClient, sender, message);
        } else {
          await botClient.sendMessage(sender, { message: '❌ Invalid command. Use /commands to see available commands.' });
        }
      } catch (e) {
        this.logger.error('Error in command handler', e);
      }
    }, new NewMessage({}));

    await syncService.start();
  }

  async shutdown() {
    await this.syncService?.stop();
  }
}
