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
    this.tgClient = this.createClient(process.env[WHO_TO_SESSION[this.who]]);
  }

  private createClient(sessionValue?: string): TelegramClient {
    const session = new StringSession(sessionValue ?? '');
    return new TelegramClient(session, Number(process.env.TELEGRAM_API_ID), process.env.TELEGRAM_API_HASH as string, {
      connectionRetries: 5,
    });
  }

  private isAuthKeyDuplicated(error: unknown): boolean {
    return String(error).includes('AUTH_KEY_DUPLICATED');
  }

  private formatStartError(error: unknown): Error {
    return new Error(`error login as ${this.who.toLowerCase()}: ${error}`);
  }

  private async startByRole() {
    if (this.who === 'BOT') {
      await this.startAsBot(process.env.TELEGRAM_TOKEN as string);
    } else if (this.who === 'USER') {
      await this.startAsUser(process.env.TELEGRAM_USER_PHONE as string);
    }
  }

  async start() {
    this.logger.info('Starting Telegram client');
    await this.#startWithRetry();
    this.logger.info('Telegram client started');
    return this.tgClient;
  }

  async #startWithRetry() {
    try {
      await this.startByRole();
    } catch (error) {
      if (!this.isAuthKeyDuplicated(error)) {
        throw this.formatStartError(error);
      }

      this.logger.warn('Session has duplicated auth key. Recreating a fresh session and retrying login...');
      this.tgClient = this.createClient('');

      try {
        await this.startByRole();
        this.logger.warn(`Session has been recreated. Save this value to ${WHO_TO_SESSION[this.who]}`);
        this.logger.warn(String((this.tgClient.session as any).save()));
      } catch (retryError) {
        throw this.formatStartError(retryError);
      }
    }
  }

  async startAsUser(phoneNumber: string) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = (question: string) => new Promise<string>((resolve) => rl.question(question, resolve));
    let didUseEnvCode = false;

    try {
      await this.tgClient.start({
        phoneNumber: phoneNumber,
        password: async () => process.env.TELEGRAM_USER_PASSWORD || ask('>>> Please enter your password: '),
        phoneCode: async () => {
          const envCode = process.env.TELEGRAM_USER_CODE;
          if (envCode && !didUseEnvCode) {
            didUseEnvCode = true;
            return envCode;
          }

          return ask('>>> Please enter the code you received: ');
        },
        onError: (err: unknown) => this.logger.error('Telegram auth callback error', err),
      });
    } finally {
      rl.close();
    }
  }

  async startAsBot(telegramToken: string) {
    await this.tgClient.start({
      botAuthToken: telegramToken,
    });
  }
}
