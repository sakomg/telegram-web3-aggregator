import 'dotenv/config';
import config from 'config';
import MainController from './controllers/main.controller';

export default class App {
  bootstrap() {
    new MainController(config).launch();
  }
}
