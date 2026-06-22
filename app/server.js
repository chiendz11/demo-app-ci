// app/server.js
const http = require('http');
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({msg: 'hello from ' + (process.env.NAME || 'docker'), ts: Date.now()}));
}).listen(port, () => console.log(`listening on ${port}`));