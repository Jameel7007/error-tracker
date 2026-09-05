# How Lesson Error Tracker works

This is a guided tour of the whole system, written so that someone who has not
read the code can follow it, with enough detail that someone who has can check
it. Each section starts plain and gets more technical.

## The one-paragraph version

A tutor opens a web page and logs the mistakes a student makes. The page keeps
that data in the browser, so it works with no account and no internet. If the
tutor signs in, the page also sends each change to a small server, and pulls
back changes made on other devices, so a laptop and a tablet end up with the
same list. When two devices disagree about a record, the more recent change
wins.

## Two halves

```
 Browser (React app)                         Server (Node + SQLite)
 ┌───────────────────────────────┐            ┌──────────────────────────┐
 │ UI components                 │            │ /auth/register, /login   │
 │   └─ reducer  ── AppData ──┐  │  HTTPS     │ /auth/me, /session       │
 │ useAppData ── localStorage │  │ ◀────────▶ │ /sync                    │
 │ useSync ── syncApi ────────┘  │  JSON      │   accounts, sessions,    │
 │ lib/: insights, sync, storage │            │   docs (change log)      │
 └───────────────────────────────┘            └──────────────────────────┘
```

The **browser app** (`src/`) is React with TypeScript, built by Vite. It has
no state library and no UI library. All the domain logic lives in `src/lib`
as plain functions with no React in them, which is where most tests are.

The **server** (`server/`) is a Hono app on Node using Node's built-in SQLite.
It has one job: hold each account's records and hand back whatever a device
has not seen yet. It never interprets the data; it does not know what a
"lesson" is.

The two share one file for the wire format (`src/lib/sync.ts`) and one for
the record types (`src/lib/types.ts`). If either side changes the shape of a
record, TypeScript fails the build on the other side.

## Data in the browser

Everything the tutor has entered is one JSON object, `AppData`:

```ts
{ version: 2, students: Student[], errors: ErrorEntry[], tombstones: Tombstone[] }
```

- **Students** have an id, name, CEFR level, and two timestamps: `createdAt`
  and `updatedAt`.
- **Errors** belong to a student and hold what was said, the correction, a
  free-text tag, the lesson date, and the same two timestamps.
- **Tombstones** record deletions: which id was deleted, of what kind, and
  when. Without them, a deletion on one device could be undone by an older
  copy of the record arriving from another device.

The object is saved to `localStorage` after every change (`useAppData`), and
loaded on startup. Storage is untrusted input: whatever comes out of
`localStorage` or an imported file goes through `parseData`, a hand-written
validator that checks every field and rejects anything malformed with a
readable reason. It also **migrates old data forward**: version 1 records had
no `updatedAt`, so the migration copies `createdAt` into it. Old exports still
import cleanly.

State changes go through a **reducer**: a pure function `(state, action) →
newState`. Adding an error, editing a student, deleting something: each is an
action, and the reducer returns a new object rather than mutating the old one.
This is what makes the app easy to test and easy to reason about when sync
starts changing state from the outside.

## Insights

`rankTags` groups a student's errors by tag (case- and whitespace-insensitive),
counts them, and works out a trend for each:

- **persistent**: seen in at least one of the student's last three lesson dates
- **improving**: seen in more than one lesson, but not in the last three
- **new**: seen in exactly one lesson

A weighted-decay score was tried first and rejected as harder to explain than
it was worth. The three-lesson window matches how a tutor actually thinks:
"did this come up recently?"

`lessonSummary` produces the plain-text notes a tutor can paste to a student.
It only looks at lessons up to the summary's date when deciding what is "still
coming up", so notes for an old lesson read as they would have on the day.

## Sync, step by step

Sync is designed so that **the app never waits for the network**. Every change
is saved locally first, then pushed. This is what "local-first" means here.

### What a change looks like on the wire

The app and server exchange a flat list of `Change` objects:

```ts
{ kind: 'student', id: 's-luana', at: '2026-09-05T21:46:34.566Z', deleted: false, body: { ...the student } }
{ kind: 'error',   id: 'e-12',    at: '2026-09-05T21:47:01.002Z', deleted: true }
```

`at` is the record's `updatedAt` for a live record, or the tombstone's
`deletedAt` for a deletion. That single timestamp is what conflicts are
decided on.

### One round trip does both directions

The client calls `POST /sync` with two things:

1. `changes`: every record or tombstone whose timestamp is after the last
   successful push from this device. A brand-new device sends everything.
2. `cursor`: the server sequence number this device has already seen. A new
   device sends 0.

The server stores each incoming change **only if it is newer** than what it
already has for that record, and gives each stored change the account's next
sequence number. Then it returns every change with a sequence number greater
than the client's cursor, plus the new cursor. The client merges those with
`applyChanges`, saves the new cursor, and records the push time.

The client's own just-pushed changes come back in that list. That is
deliberate: it keeps the server simple, and the merge treats them as no-ops
because their timestamps equal what is already local.

### When two devices disagree

`applyChanges` is the heart of it, and it is a pure function with its own
tests. For each incoming change it compares timestamps with whatever is local
for that id, live or deleted:

| Local             | Incoming              | Result                          |
| ----------------- | --------------------- | ------------------------------- |
| edit at 10:00     | edit at 10:05         | incoming edit wins              |
| edit at 10:05     | edit at 10:00         | local kept                      |
| edit at 10:00     | delete at 10:05       | record removed, tombstone kept  |
| delete at 10:05   | edit at 10:00         | stays deleted                   |
| delete at 10:00   | edit at 10:05         | record comes back               |
| edit at 10:00     | edit at 10:00         | local kept (ties favour local)  |

Deleting a student also drops that student's errors, even if no tombstone for
them arrived. Applying the same list twice changes nothing, and two devices
converge to the same state whatever order the changes arrive in. Both facts
are tests, not hopes.

### When the network is down

A change made offline is saved locally like any other. The status shows
"Offline · 1 change waiting". Nothing is queued in memory that could be lost:
pending changes are just the records whose `updatedAt` is after the last push
time, which is stored alongside the session. When the browser fires `online`,
or the tab regains focus, or the one-minute timer ticks, the next sync pushes
them.

### Signing in with data already on the device

If you sign in to an existing account on a device that has students, the app
asks whether to merge them into the account or replace them with the
account's copy. Merging pushes everything as if newly changed. Replacing
clears the device and pulls from cursor 0. Creating a new account always
keeps the local data, since the account is empty.

## Security choices

- **Passwords** are hashed with scrypt and a random per-password salt. The cost
  parameter is stored with the hash so it can be raised later without breaking
  existing accounts. The server never stores or logs a password.
- **Sessions** are random 256-bit tokens sent as `Authorization: Bearer`. Only
  the SHA-256 of the token is stored, so a copy of the database does not give
  anyone a usable session. Tokens expire after 30 days.
- **Sign-in failures** return the same message for a wrong password and an
  unknown email, and are rate-limited per address and email.
- **Every request body** is validated field by field before it touches the
  database, and a bad request says which field and why.
- **CORS** allows only the origins listed in `CORS_ORIGIN`. A browser on any
  other site cannot call the API with a user's token.
- **Accounts are isolated** at the query level: every read and write is scoped
  by the account id from the session.
- **Deleting an account** removes its records and sessions in one statement
  through foreign-key cascades.

## What is deliberately simple, and its limits

**Last-write-wins on client timestamps.** Devices use their own clocks. If a
tablet's clock is five minutes fast, its edits will beat a laptop's newer
edits for five minutes. For one tutor with two devices this is acceptable; a
collaborative product would use server-assigned versions or vector clocks.

**Whole-record conflicts.** If two devices edit different fields of the same
error offline, the newer record wins and the other device's field change is
lost. Per-field merging would fix this and is a natural next step.

**Tombstones are kept forever.** Each deletion adds a small row that never
goes away. At this app's scale that is a few kilobytes a year. A larger system
would prune tombstones older than the longest a device could plausibly be
offline.

**One SQLite file.** SQLite in WAL mode handles this workload comfortably and
means the server is a single process with a single file to back up. It does
not scale horizontally. If it needed to, the `Db` class is the only thing that
would change.

**No end-to-end encryption.** The server can read the records. Encrypting
them client-side would make the server blind but would also make "forgot my
password" mean "lost my data", a trade-off left for the tutor to make.

## Where things live

| Path                          | What it is                                                         |
| ----------------------------- | ------------------------------------------------------------------ |
| `src/lib/types.ts`            | The record shapes. Shared with the server.                         |
| `src/lib/reducer.ts`          | Every state change, as a pure function.                            |
| `src/lib/storage.ts`          | localStorage load/save, validation, v1 → v2 migration, import/export |
| `src/lib/insights.ts`         | Ranking, trends, tag normalisation, grouping by lesson             |
| `src/lib/summary.ts`          | The paste-ready lesson notes                                       |
| `src/lib/sync.ts`             | Wire format, `changesSince`, `applyChanges`. Shared with the server. |
| `src/lib/syncApi.ts`          | The only file that calls `fetch`                                   |
| `src/hooks/useAppData.ts`     | Reducer + localStorage + cross-tab sync                            |
| `src/hooks/useSync.ts`        | When to sync, session persistence, offline handling                |
| `src/components/`             | The UI. Thin: it renders state and dispatches actions.             |
| `server/src/app.ts`           | Routes, auth middleware, rate limiting                             |
| `server/src/db.ts`            | Schema and every SQL statement                                     |
| `server/src/auth.ts`          | scrypt hashing, token generation and hashing                       |
| `server/src/validate.ts`      | Request validation against the shared types                        |
| `server/src/app.test.ts`      | The server's behaviour, tested through HTTP without a port         |

## Running it all locally

```bash
npm install                                   # installs the app and the server (npm workspaces)
npm run dev --workspace server                # sync server on http://localhost:8787
echo 'VITE_SYNC_URL=http://localhost:8787' > .env.local
npm run dev                                   # app on http://localhost:5173/error-tracker/
```

Open the app in two different browsers (or one normal and one private
window), create an account in one, sign in from the other, and watch a change
cross over.

```bash
npm test              # app tests (jsdom)
npm run test:server   # server tests (node)
npm run typecheck     # both, via project references
```
