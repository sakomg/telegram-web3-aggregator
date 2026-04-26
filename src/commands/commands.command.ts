import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';
import { Logger } from '../services';

export class CommandsCommand implements CommandHandler {
  private readonly commands: Record<string, string>;
  private readonly logger = new Logger('CommandsCommand');

  constructor(commands: Record<string, string>) {
    this.commands = commands;
  }

  async handle(botClient: TelegramClient, sender: any) {
    this.logger.info('Commands command triggered');
    const message = Object.values(this.commands)
      .map((cmd) => `<b>${cmd}</b>`)
      .join(' | ');
    await botClient.sendMessage(sender, { message, parseMode: 'html' });
  }
}
