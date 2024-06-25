import { TelegramClient } from 'telegram';
import { CommandHandler } from '../types/command-handler.interface';

export class CommandsCommand implements CommandHandler {
  private readonly commands: Record<string, string>;

  constructor(commands: Record<string, string>) {
    this.commands = commands;
  }

  async handle(botClient: TelegramClient, sender: any) {
    console.log(`💥 /commands handler`);
    this.sendCommandsList(botClient, sender, this.commands);
  }

  sendCommandsList(bot: TelegramClient, sender: any, commandsObj: Record<string, string>) {
    const message = Object.values(commandsObj)
      .map((cmd) => `<b>${cmd}</b>`)
      .join(' | ');

    bot.sendMessage(sender, { message, parseMode: 'html' });
  }
}
