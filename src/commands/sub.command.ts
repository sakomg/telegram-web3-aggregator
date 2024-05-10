import { Context, Telegraf } from 'telegraf';

export default class SubCommand {
  private readonly bot;
  private readonly config;
  private channels = ['aptos'];

  get subscribedChannels() {
    return this.channels;
  }

  constructor(bot: Telegraf, config: any) {
    this.bot = bot;
    this.config = config;
  }

  execute() {
    this.bot.command('sub', (ctx: Context) => {
      const message = ctx.message;
      if (message && 'text' in message) {
        const channelName = message.text?.split(' ')[1];
        this.channels.push(channelName);
        ctx.reply(`subscribed to ${channelName}`);
      }
    });
  }
}
