const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { clearTimeout, setTimeout } = require('node:timers');
const { URL } = require('node:url');
const client = require('prom-client');

function resolveName(env = process.env) {
  return env.NAME || 'docker';
}

function resolvePort(value = '3000') {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid PORT: ${value}`);
  }

  return port;
}

function createPayload(name, timestamp = Date.now()) {
  return {
    msg: `hello from ${name}`,
    ts: timestamp,
  };
}

function createMetrics() {
  const registry = new client.Registry();

  registry.setDefaultLabels({
    service: 'demo-app',
  });

  client.collectDefaultMetrics({
    prefix: 'demo_app_',
    register: registry,
  });

  const requestsTotal = new client.Counter({
    name: 'demo_app_http_requests_total',
    help: 'Total number of HTTP requests handled by the demo application.',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry],
  });

  const requestDuration = new client.Histogram({
    name: 'demo_app_http_request_duration_seconds',
    help: 'Duration of HTTP requests handled by the demo application.',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
    registers: [registry],
  });

  return {
    registry,
    requestsTotal,
    requestDuration,
  };
}

function writeLog(logger, level, fields) {
  const writer = logger[level] || logger.log;

  writer.call(logger, JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    ...fields,
  }));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });

  res.end(JSON.stringify(payload));
}

function routeLabel(pathname) {
  if (pathname === '/') {
    return 'root';
  }

  if (pathname === '/health') {
    return 'health';
  }

  if (pathname === '/metrics') {
    return 'metrics';
  }

  return 'not_found';
}

function createServer(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const metrics = options.metrics || createMetrics();

  return http.createServer(async (req, res) => {
    const startedAt = process.hrtime.bigint();
    const requestId = req.headers['x-request-id'] || randomUUID();
    const method = req.method || 'UNKNOWN';
    const url = new URL(req.url || '/', 'http://localhost');
    const route = routeLabel(url.pathname);

    res.setHeader('X-Request-ID', requestId);

    res.once('finish', () => {
      const durationSeconds = Number(
        process.hrtime.bigint() - startedAt,
      ) / 1e9;
      const statusCode = String(res.statusCode);

      metrics.requestsTotal.inc({
        method,
        route,
        status_code: statusCode,
      });

      metrics.requestDuration.observe({
        method,
        route,
        status_code: statusCode,
      }, durationSeconds);

      writeLog(logger, 'log', {
        event: 'request_completed',
        request_id: requestId,
        method,
        path: url.pathname,
        route,
        status_code: res.statusCode,
        duration_ms: Number((durationSeconds * 1000).toFixed(3)),
      });
    });

    try {
      if (method !== 'GET') {
        res.setHeader('Allow', 'GET');
        sendJson(res, 405, {
          error: 'method not allowed',
          request_id: requestId,
        });
        return;
      }

      if (url.pathname === '/health') {
        sendJson(res, 200, {
          status: 'ok',
          service: 'demo-app',
        });
        return;
      }

      if (url.pathname === '/metrics') {
        const body = await metrics.registry.metrics();

        res.writeHead(200, {
          'Content-Type': metrics.registry.contentType,
          'Cache-Control': 'no-store',
        });
        res.end(body);
        return;
      }

      if (url.pathname === '/') {
        sendJson(res, 200, createPayload(resolveName(env)));
        return;
      }

      sendJson(res, 404, {
        error: 'not found',
        request_id: requestId,
      });
    } catch (error) {
      writeLog(logger, 'error', {
        event: 'request_failed',
        request_id: requestId,
        method,
        path: url.pathname,
        error: error.message,
      });

      if (!res.headersSent) {
        sendJson(res, 500, {
          error: 'internal server error',
          request_id: requestId,
        });
      } else {
        res.destroy(error);
      }
    }
  });
}

if (require.main === module) {
  const port = resolvePort(process.env.PORT || '3000');
  const server = createServer();
  let shuttingDown = false;

  server.listen(port, '0.0.0.0', () => {
    writeLog(console, 'log', {
      event: 'server_started',
      port,
    });
  });

  function shutdown(signal) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    writeLog(console, 'log', {
      event: 'shutdown_started',
      signal,
    });

    const forceExitTimer = setTimeout(() => {
      writeLog(console, 'error', {
        event: 'shutdown_timeout',
      });
      process.exit(1);
    }, 10000);

    forceExitTimer.unref();

    server.close((error) => {
      clearTimeout(forceExitTimer);

      if (error) {
        writeLog(console, 'error', {
          event: 'shutdown_failed',
          error: error.message,
        });
        process.exit(1);
      }

      writeLog(console, 'log', {
        event: 'shutdown_completed',
      });
      process.exit(0);
    });
  }

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

module.exports = {
  createMetrics,
  createServer,
  createPayload,
  resolveName,
  resolvePort,
};
