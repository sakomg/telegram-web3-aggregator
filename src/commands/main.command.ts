import { Context, Telegraf } from 'telegraf';
import StartCommand from './start.command';
import SubCommand from './sub.command';

export default class TelegramCommands {
  private readonly bot;
  private readonly config;

  constructor(bot: Telegraf, config: any) {
    this.bot = bot;
    this.config = config;
  }

  launch() {
    const subCommand = new SubCommand(this.bot, this.config);
    subCommand.execute();
    const startCommand = new StartCommand(this.bot, subCommand.subscribedChannels, this.config);
    startCommand.execute();
  }
}
