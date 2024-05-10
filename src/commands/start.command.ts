import { Context, Telegraf } from 'telegraf';
import MessageService from '../services/message.service';

export default class StartCommand {
  private readonly bot: Telegraf<Context>;
  private readonly config;
  private readonly subscribedChannels;

  constructor(bot: Telegraf, subscribedChannels: Array<string>, config: any) {
    this.bot = bot;
    this.subscribedChannels = subscribedChannels;
    this.config = config;
  }

  execute() {
    this.bot.command('start', (ctx: Context) => {
      ctx.reply('☑️ sync activated.');
      // setInterval(() => new MessageService(ctx, this.subscribedChannels, this.config).aggregatePosts(), 10000);
      new MessageService(ctx, this.subscribedChannels, this.config).aggregatePosts();
    });
  }
}
