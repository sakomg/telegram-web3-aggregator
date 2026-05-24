import { NewMessage, NewMessageEvent } from 'telegram/events';
import { CommandHandler } from '../types/command-handler.interface';
import { CommandsCommand, RmCommand, StartCommand, StopCommand, SubCommand } from '../commands';
import { Logger, MessageFilterService, MessageService, SyncService } from '../services';
import TgClientAuth from '../auth/main.auth';

export default class MainController {
  private readonly config: any;
  private readonly storageChannel: string;
  private readonly logger = new Logger('MainController');

  constructor(config: any) {
    this.config = config;
    this.storageChannel = this.config.get('TELEGRAM_STORAGE_CHANNEL_USERNAME');
  }

  async launch() {
    const [botClient, userClient] = await Promise.all([new TgClientAuth('BOT').start(), new TgClientAuth('USER').start()]);

    // console.log('Bot session', String((botClient.session as any).save()));
    // console.log('User session', String((userClient.session as any).save()));

    const messageService = new MessageService(botClient, userClient);
    const syncService = new SyncService(this.config, messageService, new MessageFilterService(), userClient);

    const commandHandlers: Record<string, CommandHandler> = {
      '/start': new StartCommand(syncService),
      '/stop': new StopCommand(syncService),
      '/sub': new SubCommand(messageService, this.storageChannel, syncService),
      '/rm': new RmCommand(messageService, this.storageChannel, syncService),
    };
    commandHandlers['/commands'] = new CommandsCommand([...Object.keys(commandHandlers), '/commands']);

    const adminUsernames: string[] = this.config.get('TELEGRAM_ADMIN_USERNAMES') ?? [];
    const monitoringRecipients = adminUsernames.map((u: string) => (u.startsWith('@') ? u : `@${u}`));

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

    for (const r of monitoringRecipients) {
      botClient.sendMessage(r, { message: '🔄 Bot restarted. Sync started automatically.' }).catch((e) => {
        this.logger.error(`Failed to send restart notification to ${r}`, e);
      });
    }

    await syncService.start(botClient, monitoringRecipients);
  }
}
