import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';

export class CommandsCommand implements CommandHandler {
  private readonly commands: string[];

  constructor(commands: string[]) {
    this.commands = commands;
  }

  async handle(botClient: TelegramClient, sender: any) {
    const message = this.commands.map((cmd) => `<b>${cmd}</b>`).join(' | ');
    await botClient.sendMessage(sender, { message, parseMode: 'html' });
  }
}
