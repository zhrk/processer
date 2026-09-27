const NAME = process.env.APP_NAME || 'demo-worker';
const INTERVAL = Number(process.env.JOB_INTERVAL_MS || 2000);
const VERSION = require('./package.json').version;

const QUEUES = ['emails', 'thumbnails', 'invoices', 'exports'];

let processed = 0;
let failed = 0;

console.log(`[${NAME}] v${VERSION} worker started (pid ${process.pid}), polling every ${INTERVAL}ms`);

const timer = setInterval(() => {
  const queue = QUEUES[processed % QUEUES.length];
  const durationMs = 40 + Math.floor(Math.random() * 400);
  const jobId = `job_${(processed + 1).toString().padStart(5, '0')}`;

  if (Math.random() < 0.12) {
    failed += 1;
    console.error(`[${NAME}] ${jobId} queue=${queue} FAILED after ${durationMs}ms (retrying later)`);
  } else {
    console.log(`[${NAME}] ${jobId} queue=${queue} done in ${durationMs}ms`);
  }

  processed += 1;

  if (processed % 10 === 0) {
    console.log(`[${NAME}] stats processed=${processed} failed=${failed} backlog=${Math.floor(Math.random() * 25)}`);
  }
}, INTERVAL);

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    clearInterval(timer);
    console.log(`[${NAME}] received ${signal}, draining and exiting (processed=${processed})`);
    process.exit(0);
  });
}
