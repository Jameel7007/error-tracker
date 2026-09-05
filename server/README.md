# Sync server

The optional backend for Lesson Error Tracker. Accounts, sessions, and a
per-account change log on SQLite. About 400 lines, no ORM, no build step: Node
runs the TypeScript directly.

For how sync works end to end, read [docs/architecture.md](../docs/architecture.md).

## Run

```bash
npm install                        # from the repository root
npm run dev --workspace server     # http://localhost:8787, restarts on change
npm run test:server
```

Requires Node 22.13 or newer for `node:sqlite`. Node 24 is what CI and the
Docker image use.

### Environment

| Variable        | Default                                              | Meaning                                                   |
| --------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| `PORT`          | `8787`                                               | Port to listen on                                         |
| `DATABASE_PATH` | `./data/error-tracker.sqlite`                        | SQLite file; the directory is created if missing          |
| `CORS_ORIGIN`   | `http://localhost:5173,http://localhost:5180`        | Comma-separated browser origins allowed to call the API   |

In production set `CORS_ORIGIN` to the exact origin the app is served from,
for example `https://jameel7007.github.io`.

## API

All bodies are JSON. Errors are `{ "error": "reason" }` with a 4xx status.
Authenticated routes take `Authorization: Bearer <token>`.

| Method | Path                | Body                                   | Reply                                          |
| ------ | ------------------- | -------------------------------------- | ---------------------------------------------- |
| GET    | `/health`           |                                        | `{ ok: true }`                                 |
| POST   | `/auth/register`    | `{ email, password }` (8+ chars)       | 201 `{ email, token, expiresAt }`; 409 if taken |
| POST   | `/auth/login`       | `{ email, password }`                  | `{ email, token, expiresAt }`; 401; 429 after repeated failures |
| GET    | `/auth/me`          |                                        | `{ email }`                                    |
| DELETE | `/auth/session`     |                                        | 204, token is forgotten                        |
| DELETE | `/auth/account`     |                                        | 204, account and all its data removed          |
| POST   | `/sync`             | `{ cursor, changes }`                  | `{ cursor, changes, applied }`                 |

`changes` is a list of records or deletions in the shape defined in
[`src/lib/sync.ts`](../src/lib/sync.ts). The server keeps a change only if it
is newer than what it has for that record, then returns everything stored
after `cursor`, oldest first. Send `cursor: 0` from a new device.

## Deploy

The server is one process and one SQLite file, so any host that runs a Node
container with a persistent disk works. The Dockerfile builds from the
repository root because the server imports two shared files from `src/lib`.

```bash
docker build -f server/Dockerfile -t error-tracker-sync .
docker run -p 8787:8787 -v error-tracker-data:/data -e CORS_ORIGIN=https://jameel7007.github.io error-tracker-sync
```

### Fly.io, as one example

```bash
fly launch --no-deploy --dockerfile server/Dockerfile --name error-tracker-sync
fly volumes create data --size 1
fly secrets set CORS_ORIGIN=https://jameel7007.github.io
fly deploy
```

Add to `fly.toml`:

```toml
[env]
  DATABASE_PATH = "/data/error-tracker.sqlite"

[mounts]
  source = "data"
  destination = "/data"
```

Render, Railway, and a plain VPS with Docker work the same way: persistent
disk mounted at `/data`, `CORS_ORIGIN` set to the app's origin.

### Point the app at it

The app reads `VITE_SYNC_URL` at build time. For the GitHub Pages deployment,
add a repository variable named `VITE_SYNC_URL` with the server's URL
(Settings → Secrets and variables → Actions → Variables). The CI workflow
passes it to the build. Leave it unset and the app stays local-only with the
sync UI hidden.

## Back up

Copy the SQLite file. In WAL mode the safe way is:

```bash
sqlite3 /data/error-tracker.sqlite ".backup /backups/error-tracker-$(date +%F).sqlite"
```
