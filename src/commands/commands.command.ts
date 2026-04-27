import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';

export class CommandsCommand implements CommandHandler {
  private readonly commands: Record<string, string>;

  constructor(commands: Record<string, string>) {
    this.commands = commands;
  }

  async handle(botClient: TelegramClient, sender: any) {
    const message = Object.values(this.commands)
      .map((cmd) => `<b>${cmd}</b>`)
      .join(' | ');
    await botClient.sendMessage(sender, { message, parseMode: 'html' });
  }
}
