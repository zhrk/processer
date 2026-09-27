const NAME = process.env.APP_NAME || 'demo-flaky';
const VERSION = require('./package.json').version;
const LIFETIME_MS = Number(process.env.CRASH_AFTER_MS || 45000);

console.log(`[${NAME}] v${VERSION} started (pid ${process.pid}), will crash in ~${Math.round(LIFETIME_MS / 1000)}s`);

const timer = setInterval(() => {
  console.log(`[${NAME}] still alive, uptime=${process.uptime().toFixed(0)}s`);
}, 3000);

setTimeout(() => {
  clearInterval(timer);
  console.error(`[${NAME}] unrecoverable error: upstream connection lost`);
  process.exit(1);
}, LIFETIME_MS + Math.floor(Math.random() * 15000));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    clearInterval(timer);
    console.log(`[${NAME}] received ${signal}, exiting cleanly`);
    process.exit(0);
  });
}
