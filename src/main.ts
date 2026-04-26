import App from './app';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { Logger } from './services';

const indexHtmlPath = path.join(process.cwd(), 'src', 'public', 'index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
const logger = new Logger('Main');
const port = Number(process.env.PORT || 8080);

const server = http.createServer(function (req: any, res: any) {
  logger.debug('Health request received');
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(indexHtml);
});

server.on('error', (error: unknown) => {
  logger.error('HTTP server failed to start', error);
  process.exit(1);
});

server.listen(port, () => {
  logger.info(`HTTP server is listening on port ${port}`);
});

new App().bootstrap().catch((error: unknown) => {
  logger.error('App bootstrap failed', error);
  process.exit(1);
});
