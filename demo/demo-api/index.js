const http = require('http');

const PORT = Number(process.env.PORT || 13659);
const NAME = process.env.APP_NAME || 'demo-api';
const VERSION = require('./package.json').version;

let requests = 0;

const server = http.createServer((req, res) => {
  requests += 1;
  const started = Date.now();

  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, uptime: process.uptime() }));
  } else if (req.url === '/boom') {
    console.error(`[${NAME}] simulated failure on request #${requests}`);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'simulated failure' }));
  } else {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ app: NAME, version: VERSION, requests, pid: process.pid }));
  }

  console.log(`[${NAME}] ${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - started}ms)`);
});

server.listen(PORT, () => {
  console.log(`[${NAME}] v${VERSION} listening on http://127.0.0.1:${PORT} (pid ${process.pid})`);
});

// Background heartbeat so the log view always has something moving.
setInterval(() => {
  const mb = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
  console.log(`[${NAME}] heartbeat requests=${requests} rss=${mb}MB uptime=${process.uptime().toFixed(0)}s`);
}, 5000);

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[${NAME}] received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
