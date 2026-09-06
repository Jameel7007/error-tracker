# Study guide: understanding this project well enough to be asked anything

I built this project with an AI assistant as a pair programmer. I set the goals
and made the product decisions; it wrote much of the code; I reviewed, tested,
and asked for changes. The part I care about is being able to explain every
piece of it and defend every decision. This document is how I made sure of
that, and I am publishing it because I think that is the honest way to present
AI-assisted work.

[docs/architecture.md](architecture.md) is the technical walkthrough. This is
the study version: the same system in plain language, the vocabulary, the
decisions with their alternatives, and the questions the project invites.

## What was built, in three layers

**Layer 1, the app.** A web page where a tutor logs a student's mistake, the
correction, and a tag. It stores everything inside the browser, so it needs no
account and works offline. It ranks each student's recurring tags and labels
them persistent, improving, or new.

**Layer 2, the lesson summary.** A button on each lesson that copies plain-text
notes to paste into a student's homework message. Small feature, but it
introduced one idea that matters: the summary only looks at lessons up to its
own date, so notes for an old lesson read the way they would have on the day. A
test caught the first version getting this wrong.

**Layer 3, sync.** An optional account. When signed in, every change is sent to
a small server and other devices pull it down. This is what turns a front-end
demo into a full product: accounts, passwords, a database, an API, and a rule
for what happens when two devices disagree.

The single most important sentence: **the app is local-first**. It saves to the
browser immediately and syncs afterwards. It never waits for the network.
Everything else in the sync design follows from that choice.

## What happens when you press "Save error"

Each step names the file where it happens.

1. **The form collects what you typed.** A React component holds the four
   fields in its own state. Nothing is saved yet. `src/components/ErrorForm.tsx`
2. **The form dispatches an action.** It hands the app a small message,
   `{ type: 'addError', entry: {…} }`. The form never touches storage directly.
   This is what keeps the UI thin. `src/App.tsx`
3. **The reducer computes the new state.** A pure function takes the old data
   and the action and returns a new data object with the error added, an id,
   and two timestamps, `createdAt` and `updatedAt`. It never mutates the old
   object. `src/lib/reducer.ts`
4. **React re-renders.** The log shows the new entry, the insights recount.
5. **The data is saved to the browser.** An effect watches the data and writes
   it to `localStorage` as JSON after each change. Close the tab now and
   nothing is lost. `src/hooks/useAppData.ts`
6. **If signed in, a sync is scheduled.** Another effect waits 1.5 seconds of
   quiet (a debounce, so ten quick edits become one request) and then calls
   the server. `src/hooks/useSync.ts`

## What happens during one sync

One HTTP request does both directions. That was a deliberate simplification.

1. **The client collects its pending changes.** `changesSince(data,
   lastPushedAt)` picks every student, error, and deletion whose timestamp is
   after the last successful push. A new device has no last push, so it sends
   everything. Nothing is queued in memory; pending is derived from the data,
   which is why closing the tab mid-sync loses nothing. `src/lib/sync.ts`
2. **It sends one `POST /sync`.** Body: `{ cursor, changes }`. The cursor is a
   number meaning "I have seen everything up to server change N". The request
   carries the session token in an `Authorization: Bearer` header.
   `src/lib/syncApi.ts`
3. **The server checks the token.** It hashes the token and looks the hash up
   in the sessions table. No match or expired: 401. Otherwise every query from
   here is scoped to that account. `server/src/app.ts`
4. **The server validates every change** field by field against the shared
   type definitions. A bad request gets a 400 with the reason. Never trust the
   client. `server/src/validate.ts`
5. **The server stores what is newer.** For each change it compares timestamps
   with what it already has for that record. Newer replaces; older is ignored.
   Each stored change gets the account's next sequence number, all inside one
   transaction. `server/src/db.ts`
6. **The server replies with everything after the cursor**, oldest first, plus
   the new cursor. This includes the client's own just-pushed changes.
7. **The client merges the reply.** `applyChanges(local, incoming)` applies the
   same newer-wins rule locally. Its own echoes tie on timestamp, and ties keep
   the local copy, so they change nothing. `src/lib/sync.ts`
8. **The client remembers where it got to.** New cursor and push time are saved
   next to the session. The status line says "Synced just now".

## The conflict rule, and what it costs

Two devices offline, both edit the same record. When they reconnect, who wins?
This app answers with **last-write-wins per record on a timestamp**, plus
**tombstones** so deletions can win too.

| Local has       | Incoming        | Result                         |
| --------------- | --------------- | ------------------------------ |
| edit at 10:00   | edit at 10:05   | incoming edit wins             |
| edit at 10:05   | edit at 10:00   | local kept                     |
| edit at 10:00   | delete at 10:05 | record removed, tombstone kept |
| delete at 10:05 | edit at 10:00   | stays deleted                  |
| delete at 10:00 | edit at 10:05   | record comes back              |
| edit at 10:00   | edit at 10:00   | local kept (ties favour local) |

**Why tombstones exist.** Without a record of the deletion, a device that
still has the old copy would push it back and undelete it. A tombstone says
"this id was deleted at this time", so the merge can compare times.

**Two properties the tests prove.** Idempotent: applying the same changes
twice changes nothing. Convergent: two devices end up identical whatever
order changes arrive in. Both are tests in `src/lib/sync.test.ts`.

**The limit.** Timestamps come from each device's clock. A tablet whose clock
is five minutes fast wins arguments for five minutes. Conflicts are also
whole-record: if two devices edit different fields of the same error offline,
one field change is lost. I would rather say this unprompted than pretend it
is not there.

## Security choices, and the reason for each

| What              | How                                                                          | Why                                                                                   |
| ----------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Passwords         | scrypt with a random salt per password; the cost is stored with the hash     | A stolen database gives hashes, not passwords. The cost can be raised later.          |
| Sessions          | Random 256-bit token; only its SHA-256 is stored; expires in 30 days         | The database cannot be used to impersonate anyone.                                    |
| Sign-in failures  | Same message for wrong password and unknown email; rate-limited              | Stops "does this email have an account?" probing and slows guessing.                  |
| Input             | Every request body validated field by field before the database             | The client is untrusted. Shared TypeScript types keep validator and app in agreement. |
| CORS              | Only origins in `CORS_ORIGIN` may call the API from a browser                | A malicious site cannot make a signed-in user's browser call the API.                 |
| Isolation         | Every query includes the account id from the session                         | No query can return another account's data, even with a bug in a handler.            |
| Account deletion  | One `DELETE`; foreign-key cascades remove sessions and records               | The user can leave and take everything with them.                                     |

## Vocabulary

Each term, then where it shows up here.

- **Local-first.** The device holds the primary copy; the server is for sync,
  not the source of truth. Here: `useAppData` saves to localStorage before
  anything else.
- **localStorage.** A small key-value store built into the browser, per site,
  around 5 MB. Keys here: `lesson-error-tracker:v1` and `:sync`.
- **Reducer.** A pure function `(state, action) → newState`. `src/lib/reducer.ts`.
- **Pure function.** Same inputs, same output, no side effects. Everything in
  `src/lib`, which is where most tests are.
- **Schema migration.** Code that upgrades old saved data to the current
  shape. `parseData` turns v1 data into v2.
- **API and endpoint.** The URLs a server answers; each URL plus method is an
  endpoint. Seven of them in `server/src/app.ts`.
- **Bearer token.** A secret the client sends in the `Authorization` header to
  prove who it is. Only its hash is stored server-side.
- **Hash and salt.** A one-way scramble, with random data mixed in so equal
  passwords hash differently. `server/src/auth.ts`.
- **CORS.** The browser rule deciding which sites may call which servers.
  `CORS_ORIGIN`.
- **SQLite.** A relational database in one file inside the process. Node's
  built-in `node:sqlite`, so no dependency.
- **WAL mode.** Write-ahead logging, so readers are not blocked by writers.
  Enabled in `Db.open()`.
- **Transaction.** All-or-nothing group of database operations.
  `applyChanges` wraps its loop in one.
- **Tombstone.** A record of a deletion, kept so a merge can decide who wins.
- **Last-write-wins.** Later timestamp is kept. Same rule on both sides.
- **Cursor.** A bookmark for how far a client has read a stream of changes.
- **Idempotent.** Doing it twice equals doing it once. Essential with retries.
- **Debounce.** Wait for a pause before acting. 1.5 s in `useSync`.
- **Offline queue.** Apply locally now, send later, keep and retry on failure.
  "Offline · 1 change waiting" is this.
- **npm workspace.** One repo, several packages, one install. `server/`.
- **TypeScript strict mode.** The compiler's strictest checks, on for both
  the app and the server.
- **Unit vs integration test.** One function alone, versus several parts
  together. `sync.test.ts` is unit; `server/src/app.test.ts` sends real HTTP
  requests into an in-memory database.
- **jsdom.** A fake browser for tests. Vitest's environment for the app tests.
- **CI/CD.** Every push runs checks; if they pass, it ships. GitHub Actions
  here.
- **Environment variable.** A setting from outside the program.
  `VITE_SYNC_URL`, `PORT`, `DATABASE_PATH`, `CORS_ORIGIN`.

## Decisions I can defend

Each one with the alternative and the trade.

- **Own server instead of Firebase or Supabase.** A hosted backend would have
  been faster. Writing it shows auth, a database, validation, and API design
  on a project I fully understand, in about 400 lines with no dependencies
  beyond Node and a tiny router. The trade: I run it myself.
- **SQLite instead of Postgres.** One process, one file, backups are a copy.
  Right for one tutor and a few devices. It does not scale across machines;
  the `Db` class is the only file that would change.
- **Last-write-wins instead of CRDTs or vector clocks.** Explainable in one
  sentence, testable in a page. Depends on device clocks and loses one side
  of a field-level conflict. Both alternatives are heavier than this needs.
- **One `/sync` endpoint instead of push and pull.** Half the requests, and a
  push's response is exactly what a pull would return. The client's own
  changes echo back, which the merge tolerates by design.
- **Hand-written validation instead of a library.** The shape is small, the
  bundle stays under 70 kB gzipped, and error messages can say exactly what a tutor would
  understand. More code to maintain if the schema grows.
- **Pending changes derived from data, not queued.** "Everything changed after
  my last push" needs no separate queue that could get out of step or be lost.
  A device with a wrong clock may re-push some records, which the server
  ignores.

## Questions this project invites

**Walk me through the architecture.** A React and TypeScript app with all the
domain logic in plain functions under `src/lib`, so the UI renders state and
dispatches actions to a reducer. Data lives in the browser and is saved to
localStorage after each change. Optionally, a small Node server with SQLite
lets a signed-in user sync between devices: one endpoint takes the device's
changes since its last push and returns everything it has not seen, and both
sides merge with the same newer-wins rule. The app and server share their
TypeScript types, so they cannot drift.

**What does local-first mean and why choose it?** The device holds the real
copy and never waits for a server. The app is used mid-lesson, sometimes on
bad wifi, and the original had no server at all. Sync was added on top without
changing that. The cost is that conflicts become my problem instead of the
database's.

**How do you handle two devices editing the same thing offline?** Each record
has an `updatedAt`, deletions leave tombstones, and the newer timestamp wins,
edit or delete, with ties keeping the local copy. The merge is a pure function
with tests proving idempotency and convergence. The honest limit is that it
trusts device clocks and resolves per record, not per field. For a team
product I would move to server-assigned versions or a CRDT.

**What happens if the network drops mid-sync?** Nothing is lost. Pending
changes are derived as "anything changed after my last successful push", and
that push time only advances after the server confirms. The UI shows how many
changes are waiting and retries on `online`, on focus, and on a timer.

**How is authentication done?** Email and password. Passwords hashed with
scrypt and a per-password salt, cost stored with the hash. Login returns a
random token whose SHA-256 is stored, sent as a Bearer header. Same message for
wrong password and unknown email, rate-limited, 30-day expiry.

**Why SQLite? Would it scale?** The server's job is tiny: hold each account's
records and answer "what changed after N". SQLite in WAL mode handles that, it
is one file to back up, and Node ships it built in. It will not scale
horizontally; the `Db` class is the only thing that speaks SQL.

**How do you test it?** Unit tests on the pure functions. Component tests in
jsdom, including sign-in with a fake fetch. Integration tests that send real
HTTP requests through the server into an in-memory SQLite: auth flows, rate
limiting, both conflict directions, account isolation, validation. Around 70
tests, all in CI on every push.

**Tell me about a bug you found.** The lesson summary's "still coming up" list
looked at the student's whole history, so a summary for an old lesson
mentioned tags that only recurred later. A test for an early lesson failed and
made it obvious. The fix counts only lessons up to the summary's date.

**What would you change with another week?** Per-field merging. Pruning old
tombstones. A Playwright test across two browser contexts. A real deployment
with monitoring; the server has so far run locally and in tests.

**How did you use AI on this project?** As a pair programmer. I set the goals
and made the product decisions, it wrote much of the code, and I reviewed,
tested, and asked for changes. I made sure I could explain every design
decision, which is why the README has design notes and the repo has this
document and the architecture guide.

## Exercises

- **Break the merge and watch a test catch it.** In `src/lib/sync.ts`, change
  `c.at <= mine` to `c.at < mine`. Run `npm test`. Read which test fails and
  why ties now flip. Revert.
- **Watch a sync happen.** Run the server and app locally, open the browser's
  Network tab, log an error, and read the `/sync` request and response. Match
  them to the steps above.
- **Add a field end to end.** Add an optional `note` to `ErrorEntry` and
  follow the compiler errors through types, validators, form, and tests.
- **Read one file completely.** `server/src/app.ts` holds every endpoint in
  about 150 lines. Write one sentence per route in your own words.
- **Explain the conflict table to someone** without looking. If you can say
  why a delete at 10:00 loses to an edit at 10:05, you understand tombstones.
- **Deploy the server.** Follow `server/README.md`, set the repository
  variable, and sign in on the live site from two devices.
