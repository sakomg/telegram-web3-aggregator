import { TelegramClient } from 'telegram';
import { StartAsWho } from '../types/auth.type';
import { StringSession } from 'telegram/sessions';
import { Logger } from '../services';
import readline from 'readline';

const WHO_TO_SESSION = {
  BOT: 'TELEGRAM_BOT_SESSION',
  USER: 'TELEGRAM_USER_SESSION',
};

export default class TgClientAuth {
  private tgClient: TelegramClient;
  private readonly who: StartAsWho;
  private readonly logger: Logger;

  constructor(who: StartAsWho) {
    this.who = who;
    this.logger = new Logger(`Auth:${who}`);
    this.tgClient = this.#createClient(process.env[WHO_TO_SESSION[this.who]]);
  }

  #createClient(sessionValue?: string): TelegramClient {
    return new TelegramClient(
      new StringSession(sessionValue ?? ''),
      Number(process.env.TELEGRAM_API_ID),
      process.env.TELEGRAM_API_HASH as string,
      { connectionRetries: 5 },
    );
  }

  #formatError(error: unknown): Error {
    const detail = error instanceof Error ? (error.stack ?? error.message) : JSON.stringify(error, null, 2);
    return new Error(`error login as ${this.who.toLowerCase()}: ${detail}`);
  }

  async #startByRole() {
    if (this.who === 'BOT') {
      await this.#startAsBot(process.env.TELEGRAM_TOKEN as string);
    } else {
      await this.#startAsUser(process.env.TELEGRAM_USER_PHONE as string);
    }
  }

  async start() {
    try {
      await this.#startByRole();
    } catch (error) {
      if (!String(error).includes('AUTH_KEY_DUPLICATED')) {
        throw this.#formatError(error);
      }

      this.logger.warn('Session has duplicated auth key. Recreating a fresh session and retrying login...');
      this.tgClient = this.#createClient('');

      try {
        await this.#startByRole();
        this.logger.warn(`Session recreated. Save this value to ${WHO_TO_SESSION[this.who]}`);
        this.logger.warn(String((this.tgClient.session as any).save()));
      } catch (retryError) {
        throw this.#formatError(retryError);
      }
    }

    return this.tgClient;
  }

  async #startAsUser(phoneNumber: string) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (question: string) => new Promise<string>((resolve) => rl.question(question, resolve));

    try {
      await this.tgClient.start({
        phoneNumber,
        password: async () => ask('>>> Please enter your password: '),
        phoneCode: async () => ask('>>> Please enter the code you received: '),
        onError: (err: unknown) => {
          this.logger.error('Telegram auth callback error', err);
          throw err;
        },
      });
    } finally {
      rl.close();
    }
  }

  async #startAsBot(telegramToken: string) {
    await this.tgClient.start({ botAuthToken: telegramToken });
  }
}
