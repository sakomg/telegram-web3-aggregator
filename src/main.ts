import App from './app';
import http from 'http';

http
  .createServer(function (req: any, res: any) {
    new App().bootstrap();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('started server...');
    res.end();
  })
  .listen(process.env.PORT || 8080);
