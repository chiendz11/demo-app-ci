const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  createMetrics,
  createServer,
  resolveName,
  createPayload,
  resolvePort,
} = require('../app/server');

test('uses docker when NAME is missing', () => {
  assert.equal(resolveName({}), 'docker');
});

test('uses NAME from environment', () => {
  assert.equal(resolveName({ NAME: 'phase1' }), 'phase1');
});

test('creates expected response payload', () => {
  assert.deepEqual(createPayload('phase1', 123456), {
    msg: 'hello from phase1',
    ts: 123456,
  });
});

test('validates the listening port', () => {
  assert.equal(resolvePort('3000'), 3000);
  assert.throws(() => resolvePort('invalid'), /invalid PORT/);
  assert.throws(() => resolvePort('70000'), /invalid PORT/);
});

function request(server, path, options = {}) {
  const address = server.address();

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      path,
      method: options.method || 'GET',
      headers: options.headers,
    }, (res) => {
      let body = '';

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          body,
          headers: res.headers,
          statusCode: res.statusCode,
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function withServer(callback) {
  const logs = [];
  const logger = {
    log(message) {
      logs.push(message);
    },
    error(message) {
      logs.push(message);
    },
  };
  const server = createServer({
    env: {
      NAME: 'test',
    },
    logger,
    metrics: createMetrics(),
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    await callback(server, logs);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

test('serves the application and health endpoints', async () => {
  await withServer(async (server) => {
    const root = await request(server, '/');
    const health = await request(server, '/health');

    assert.equal(root.statusCode, 200);
    assert.equal(JSON.parse(root.body).msg, 'hello from test');

    assert.equal(health.statusCode, 200);
    assert.deepEqual(JSON.parse(health.body), {
      status: 'ok',
      service: 'demo-app',
    });
  });
});

test('exposes Prometheus metrics and structured request logs', async () => {
  await withServer(async (server, logs) => {
    await request(server, '/health', {
      headers: {
        'X-Request-ID': 'test-request-id',
      },
    });

    const metrics = await request(server, '/metrics');

    assert.equal(metrics.statusCode, 200);
    assert.match(metrics.body, /demo_app_http_requests_total/);

    const healthLog = logs
      .map((line) => JSON.parse(line))
      .find((entry) => entry.request_id === 'test-request-id');

    assert.equal(healthLog.event, 'request_completed');
    assert.equal(healthLog.route, 'health');
    assert.equal(healthLog.status_code, 200);
  });
});

test('returns 404 and 405 for unsupported requests', async () => {
  await withServer(async (server) => {
    const missing = await request(server, '/missing');
    const wrongMethod = await request(server, '/', {
      method: 'POST',
    });

    assert.equal(missing.statusCode, 404);
    assert.equal(wrongMethod.statusCode, 405);
    assert.equal(wrongMethod.headers.allow, 'GET');
  });
});
