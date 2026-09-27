## API

| Method | Path | Description |
|---|---|---|
| GET | `/apps` | Status of all apps |
| GET | `/apps/:name` | Status of one app |
| GET | `/apps/:name/logs?after=<id>&limit=<n>` | Buffered log entries (`{ id, time, stream, text }`, `stream` is `stdout`/`stderr`/`system`) |
| DELETE | `/apps/:name/logs` | Clear the buffer |
| POST | `/apps/:name/start` \| `stop` \| `restart` \| `update` | Control the app. `update` = `git pull` → `npm i` → restart (the app keeps running if either command fails) |
| GET | `/events` | Server-Sent Events stream: `log` (`{ app, id, time, stream, text }`) and `status` events for all apps |

Status is one of `running`, `stopped`, `crashed` (waiting `restartDelay` ms, default 2000, before an automatic restart), `updating`.
