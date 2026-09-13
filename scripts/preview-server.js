const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');
http.createServer((request, response) => {
  const requested = request.url === '/' ? 'index.html' : request.url.replace(/^\//, '');
  const file = path.resolve(root, requested);
  if (!file.startsWith(root)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) return response.writeHead(404).end('Not found');
    const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html';
    response.writeHead(200, { 'Content-Type': type });
    response.end(data);
  });
}).listen(8765, '127.0.0.1');
