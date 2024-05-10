import { TelegramClient } from 'telegram';
import MainController from './controllers/main.controller';
import config from 'config';

export default class App {
  bootstrap() {
    new MainController(config).launch();
  }
}
