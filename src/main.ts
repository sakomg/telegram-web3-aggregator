import App from './app';
import http from 'http';
import fs from 'fs';

http
  .createServer(function (req: any, res: any) {
    console.log('im alive...');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.readFile('./src/public/index.html', (err, data) => {
      if (err) {
        console.log(err);
      } else {
        res.write(data);
      }
      res.end();
    });
  })
  .listen(process.env.PORT || 8080);

new App().bootstrap();
