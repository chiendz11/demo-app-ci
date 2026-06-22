const http = require('node:http');

const port = Number(process.env.PORT || 3000);

function resolveName(env = process.env) {
  return env.NAME || 'docker';
}

function createPayload(name, timestamp = Date.now()) {
  return {
    msg: `hello from ${name}`,
    ts: timestamp,
  };
}

function createServer() {
  return http.createServer((_req, res) => {
    const payload = createPayload(resolveName());

    res.writeHead(200, {
      'Content-Type': 'application/json',
    });

    res.end(JSON.stringify(payload));
  });
}

if (require.main === module) {
  createServer().listen(port, () => {
    console.log(`listening on ${port}`);
  });
}

module.exports = {
  resolveName,
  createPayload,
  createServer,
};