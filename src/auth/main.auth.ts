import { TelegramClient } from 'telegram';
import { StartAsWho } from '../types/auth.type';
import { StringSession } from 'telegram/sessions';
import readline from 'readline';

const WHO_TO_SESSION = {
  BOT: 'TELEGRAM_BOT_SESSION',
  USER: 'TELEGRAM_USER_SESSION',
};

export default class TgClientAuth {
  private readonly tgClient;
  private readonly who;
  private readonly config;

  constructor(config: any, who: StartAsWho) {
    this.config = config;
    this.who = who;
    const session = new StringSession(process.env[WHO_TO_SESSION[this.who]]);
    this.tgClient = new TelegramClient(session, Number(process.env.TELEGRAM_API_ID), process.env.TELEGRAM_API_HASH as string, {
      connectionRetries: 5,
    });
  }

  get client() {
    return this.tgClient;
  }

  async start() {
    if (this.who == 'BOT') {
      await this.startAsBot(process.env.TELEGRAM_TOKEN as string);
    } else if (this.who == 'USER') {
      await this.startAsUser(process.env.TELEGRAM_USER_PHONE as string);
    }
  }

  async startAsUser(phoneNumber: string) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      await this.tgClient.start({
        phoneNumber: phoneNumber,
        password: async () => new Promise((resolve) => rl.question('>>> Please enter your password: ', resolve)),
        phoneCode: async () => new Promise((resolve) => rl.question('>>> Please enter the code you received: ', resolve)),
        onError: (err: any) => console.log(err),
      });
    } catch (e) {
      throw new Error('error login as user: ' + e);
    }
  }

  async startAsBot(telegramToken: string) {
    try {
      await this.tgClient.start({
        botAuthToken: telegramToken,
      });
    } catch (e) {
      throw new Error('error login as bot: ' + e);
    }
  }
}
