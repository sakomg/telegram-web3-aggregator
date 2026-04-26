import 'dotenv/config';
import config from 'config';
import MainController from './controllers/main.controller';
import { Logger } from './services';

export default class App {
  private readonly logger = new Logger('App');

  async bootstrap() {
    this.logger.info('Bootstrapping application');
    await new MainController(config).launch();
    this.logger.info('Application bootstrap completed');
  }
}
