import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { EventEmitter, once } from 'node:events';
import express from 'express';
import cors from 'cors';
import treeKill from 'tree-kill';

process.env.FORCE_COLOR = '1';

const config = { restartDelay: 2000, ...JSON.parse(readFileSync(new URL('./config.json', import.meta.url))) };
const events = new EventEmitter();

class App {
  constructor({ name, cwd }) {
    Object.assign(this, { name, cwd, status: 'stopped', pid: null, startedAt: null, exitCode: null });
    this.logs = [];
    this.seq = 0;
    this.queue = Promise.resolve();
  }

  toJSON() {
    const { name, cwd, status, pid, startedAt, exitCode } = this;
    return { name, cwd, status, pid, startedAt, exitCode };
  }

  setStatus(status) {
    this.status = status;
    events.emit('status', this.toJSON());
  }

  log(stream, text) {
    const entry = { id: ++this.seq, time: Date.now(), stream, text };
    this.logs.push(entry);
    if (this.logs.length > config.bufferSize) this.logs.shift();
    events.emit('log', { app: this.name, ...entry });
  }

  spawn(command) {
    this.log('system', `> ${command}`);
    const child = spawn(command, { cwd: this.cwd, shell: true, windowsHide: true });
    createInterface({ input: child.stdout }).on('line', (l) => this.log('stdout', l));
    createInterface({ input: child.stderr }).on('line', (l) => this.log('stderr', l));
    child.on('error', (err) => this.log('system', err.message));
    return child;
  }

  // Serialize actions so start/stop/update never overlap
  enqueue(fn) {
    return (this.queue = this.queue.then(fn, fn));
  }

  async exec(command) {
    const [code] = await once(this.spawn(command), 'close');
    if (code !== 0) throw new Error(`"${command}" exited with code ${code}`);
  }

  async start() {
    if (this.child) return;
    clearTimeout(this.restartTimer);
    this.stopping = false;
    const child = (this.child = this.spawn('npm start'));
    this.pid = child.pid;
    this.startedAt = Date.now();
    this.exitCode = null;
    this.setStatus('running');
    child.on('close', (code, signal) => {
      this.child = this.pid = null;
      this.exitCode = code;
      this.log('system', `exited with ${signal ?? `code ${code}`}`);
      if (this.stopping) return this.setStatus('stopped');
      // Unexpected exit: restart after a delay so a crash loop doesn't spin
      this.log('system', `restarting in ${config.restartDelay}ms`);
      this.setStatus('crashed');
      this.restartTimer = setTimeout(() => this.enqueue(() => this.start()), config.restartDelay);
    });
  }

  async stop() {
    clearTimeout(this.restartTimer);
    if (!this.child) {
      if (this.status === 'crashed') this.setStatus('stopped');
      return;
    }
    this.stopping = true;
    const closed = once(this.child, 'close');
    treeKill(this.child.pid);
    await closed;
  }

  async restart() {
    await this.stop();
    await this.start();
  }

  // Pull and install while the old version keeps running; restart only if both succeed
  async update() {
    this.setStatus('updating');
    try {
      await this.exec('git pull');
      await this.exec('npm i');
    } catch (err) {
      this.log('system', `update failed: ${err.message}`);
      throw err;
    } finally {
      if (this.status === 'updating') this.setStatus(this.child ? 'running' : 'stopped');
    }
    await this.restart();
  }
}

const apps = new Map(config.apps.map((a) => [a.name, new App(a)]));
const ACTIONS = ['start', 'stop', 'restart', 'update'];

const server = express();
server.use(cors());

server.param('name', (req, res, next, name) => {
  res.locals.app = apps.get(name);
  res.locals.app ? next() : res.status(404).json({ error: `Unknown app "${name}"` });
});

server.get('/apps', (req, res) => res.json([...apps.values()]));

server.get('/apps/:name', (req, res) => res.json(res.locals.app));

// ?after=<id> returns only entries newer than id, ?limit=<n> caps the count (most recent)
server.get('/apps/:name/logs', (req, res) => {
  const after = Number(req.query.after ?? 0);
  const limit = Number(req.query.limit ?? config.bufferSize);
  res.json(res.locals.app.logs.filter((e) => e.id > after).slice(-limit));
});

server.delete('/apps/:name/logs', (req, res) => {
  res.locals.app.logs = [];
  res.status(204).end();
});

server.post('/apps/:name/:action', async (req, res) => {
  const { action } = req.params;
  if (!ACTIONS.includes(action)) return res.status(404).json({ error: `Unknown action "${action}"` });
  try {
    await res.locals.app.enqueue(() => res.locals.app[action]());
    res.json(res.locals.app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Server-Sent Events: "log" and "status" events for all apps
server.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (type) => (data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  const onLog = send('log');
  const onStatus = send('status');
  events.on('log', onLog).on('status', onStatus);
  req.on('close', () => events.off('log', onLog).off('status', onStatus));
});

server.listen(config.port, (err) => {
  if (err) throw err;
  console.log(`Process manager listening on port ${config.port}`);
  for (const app of apps.values()) app.enqueue(() => app.start());
});

async function shutdown() {
  await Promise.all([...apps.values()].map((a) => a.stop()));
  process.exit();
}
process.on('SIGINT', shutdown).on('SIGTERM', shutdown);
