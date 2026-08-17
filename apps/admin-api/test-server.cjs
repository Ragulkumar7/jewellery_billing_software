const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello World');
});
server.listen(4013, '127.0.0.1', () => {
  console.log('Server running at http://127.0.0.1:4013/');
  console.log('address:', server.address());
});
server.on('error', (err) => console.error('Server error:', err));