import { NewMessage, NewMessageEvent } from 'telegram/events';
import { CommandHandler } from '../types/command-handler.interface';
import { CommandsCommand, PinCommand, RmCommand, StartCommand, StopCommand, SubCommand, TranscribeCommand } from '../commands';
import { Logger, MessageFilterService, MessageService, SyncService } from '../services';
import TgClientAuth from '../auth/main.auth';

const COMMANDS: Record<string, string> = {
  START: '/start',
  STOP: '/stop',
  TRANSCRIBE: '/transcribe',
  SUB: '/sub',
  RM: '/rm',
  COMMANDS: '/commands',
  PIN: '/pin',
};

export default class MainController {
  private readonly config: any;
  private readonly storageChannel: string;
  private readonly logger = new Logger('MainController');

  constructor(config: any) {
    this.config = config;
    this.storageChannel = this.config.get('TELEGRAM_STORAGE_CHANNEL_USERNAME');
  }

  async launch() {
    this.logger.info('Launching controller');
    const botClientContainer = new TgClientAuth('BOT');
    const userClientContainer = new TgClientAuth('USER');

    const [botClient, userClient] = await Promise.all([botClientContainer.start(), userClientContainer.start()]);

    const messageFilterService = new MessageFilterService();
    const messageService = new MessageService(botClient, userClient);
    const syncService = new SyncService(this.config, messageService, messageFilterService);

    const commandHandlers: Record<string, CommandHandler> = {
      [COMMANDS.START]: new StartCommand(syncService),
      [COMMANDS.STOP]: new StopCommand(syncService),
      [COMMANDS.TRANSCRIBE]: new TranscribeCommand(messageService, this.config),
      [COMMANDS.SUB]: new SubCommand(messageService, this.storageChannel, syncService),
      [COMMANDS.RM]: new RmCommand(messageService, this.storageChannel, syncService),
      [COMMANDS.COMMANDS]: new CommandsCommand(COMMANDS),
      [COMMANDS.PIN]: new PinCommand(messageService, this.config),
    };

    botClient.addEventHandler(async (event: NewMessageEvent) => {
      if (!event?.message?.message) return;

      try {
        const messageWrapper = event.message;
        const message: string = messageWrapper.message;
        if (!message.startsWith('/')) {
          return;
        }

        const sender: any = await messageWrapper.getSender();
        if (sender?.className !== 'User') {
          return;
        }

        const adminUsernames: string[] = this.config.get('TELEGRAM_ADMIN_USERNAMES');
        if (!adminUsernames.includes(sender.username)) {
          await botClient.sendMessage(sender, {
            message:
              '🛑 You do not have permission to send messages. Please contact @saskakomegunov if you would like to add a channel to the pool or for any other requests/suggestions.',
          });
          return;
        }
        const messageCommand = message.trim().split(/\s+/)[0];
        const command = Object.keys(COMMANDS).find((key: string) => COMMANDS[key] === messageCommand);
        if (command && commandHandlers[COMMANDS[command]]) {
          this.logger.info(`Command received: ${messageCommand}`);
          await commandHandlers[COMMANDS[command]].handle(botClient, sender, message);
        } else {
          const response = '❌ Invalid command, please check and try again. \r\n\r\n💨 /commands to view all commands.';
          await botClient.sendMessage(sender, { message: response });
        }
      } catch (e) {
        this.logger.error('Error in command handler', e);
      }
    }, new NewMessage({}));

    this.logger.info('Starting sync service on launch');
    const adminUsernames: string[] = this.config.get('TELEGRAM_ADMIN_USERNAMES') ?? [];
    const monitoringRecipients = adminUsernames.map((u: string) => (u.startsWith('@') ? u : `@${u}`));
    await syncService.start(botClient, monitoringRecipients);

    // this.logger.debug(String((botClient.session as any).save()));
    // this.logger.debug(String((userClient.session as any).save()));
  }
}
