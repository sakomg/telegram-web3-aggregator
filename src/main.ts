import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import config from 'config';
import { Logger } from './services';
import MainController from './controllers/main.controller';

const indexHtml = fs.readFileSync(path.join(process.cwd(), 'src', 'public', 'index.html'), 'utf-8');
const logger = new Logger('Main');
const port = Number(process.env.PORT || 8080);

http
  .createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(indexHtml);
  })
  .on('error', (error: unknown) => {
    logger.error('HTTP server failed to start', error);
    process.exit(1);
  })
  .listen(port, () => {
    logger.info(`HTTP server listening on port ${port}`);
  });

new MainController(config)
  .launch()
  .then(() => logger.info('Bootstrap completed'))
  .catch((error: unknown) => {
    logger.error('Bootstrap failed', error);
    process.exit(1);
  });
