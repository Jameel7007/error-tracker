import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Change } from '../../src/lib/sync.ts'

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_used_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);
  -- One row per record per account: the latest known version, live or deleted.
  -- seq is a per-account change counter so a client can ask for "everything after N".
  CREATE TABLE IF NOT EXISTS docs (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    at TEXT NOT NULL,
    deleted INTEGER NOT NULL,
    body TEXT,
    seq INTEGER NOT NULL,
    PRIMARY KEY (account_id, kind, id)
  );
  CREATE INDEX IF NOT EXISTS docs_seq ON docs(account_id, seq);
  CREATE TABLE IF NOT EXISTS counters (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL
  );
`

export interface Account {
  id: string
  email: string
  passwordHash: string
}

export interface Session {
  accountId: string
  expiresAt: string
}

interface DocRow {
  kind: 'student' | 'error'
  id: string
  at: string
  deleted: number
  body: string | null
  seq: number
}

export class Db {
  private readonly db: DatabaseSync

  private constructor(db: DatabaseSync) {
    this.db = db
    db.exec('PRAGMA foreign_keys = ON')
    db.exec(SCHEMA)
  }

  static open(path: string): Db {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    const db = new DatabaseSync(path)
    if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
    return new Db(db)
  }

  close(): void {
    this.db.close()
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN')
    try {
      const out = fn()
      this.db.exec('COMMIT')
      return out
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  /** Returns null when the email is already taken. */
  createAccount(id: string, email: string, passwordHash: string): Account | null {
    try {
      this.db.prepare('INSERT INTO accounts (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(id, email, passwordHash, new Date().toISOString())
      this.db.prepare('INSERT INTO counters (account_id, seq) VALUES (?, 0)').run(id)
      return { id, email, passwordHash }
    } catch (err) {
      if (err instanceof Error && /UNIQUE/.test(err.message)) return null
      throw err
    }
  }

  findAccountByEmail(email: string): Account | null {
    const row = this.db.prepare('SELECT id, email, password_hash FROM accounts WHERE email = ?').get(email) as
      | { id: string; email: string; password_hash: string }
      | undefined
    return row ? { id: row.id, email: row.email, passwordHash: row.password_hash } : null
  }

  findAccountById(id: string): Pick<Account, 'id' | 'email'> | null {
    const row = this.db.prepare('SELECT id, email FROM accounts WHERE id = ?').get(id) as { id: string; email: string } | undefined
    return row ?? null
  }

  deleteAccount(id: string): void {
    this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
  }

  createSession(tokenHash: string, accountId: string, expiresAt: string): void {
    const now = new Date().toISOString()
    this.db.prepare('INSERT INTO sessions (token_hash, account_id, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?)').run(tokenHash, accountId, now, expiresAt, now)
  }

  /** Looks up a session, dropping it if expired. */
  findSession(tokenHash: string, now: string = new Date().toISOString()): Session | null {
    const row = this.db.prepare('SELECT account_id, expires_at FROM sessions WHERE token_hash = ?').get(tokenHash) as
      | { account_id: string; expires_at: string }
      | undefined
    if (!row) return null
    if (row.expires_at <= now) {
      this.deleteSession(tokenHash)
      return null
    }
    this.db.prepare('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?').run(now, tokenHash)
    return { accountId: row.account_id, expiresAt: row.expires_at }
  }

  deleteSession(tokenHash: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
  }

  /**
   * Merge a client's changes: a change is stored only if it is newer than
   * what the server already has for that record. Each stored change gets the
   * account's next sequence number. Returns how many were stored.
   */
  applyChanges(accountId: string, changes: Change[]): number {
    const existing = this.db.prepare('SELECT at FROM docs WHERE account_id = ? AND kind = ? AND id = ?')
    const upsert = this.db.prepare(`
      INSERT INTO docs (account_id, kind, id, at, deleted, body, seq) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (account_id, kind, id) DO UPDATE SET at = excluded.at, deleted = excluded.deleted, body = excluded.body, seq = excluded.seq
    `)
    const bump = this.db.prepare('UPDATE counters SET seq = seq + 1 WHERE account_id = ? RETURNING seq')
    return this.transaction(() => {
      let applied = 0
      for (const c of changes) {
        const current = existing.get(accountId, c.kind, c.id) as { at: string } | undefined
        if (current && c.at <= current.at) continue
        const { seq } = bump.get(accountId) as { seq: number }
        upsert.run(accountId, c.kind, c.id, c.at, c.deleted ? 1 : 0, c.deleted ? null : JSON.stringify(c.body), seq)
        applied++
      }
      return applied
    })
  }

  /** Everything stored after `cursor`, oldest first, plus the cursor to ask from next time. */
  changesSince(accountId: string, cursor: number): { cursor: number; changes: Change[] } {
    const rows = this.db.prepare('SELECT kind, id, at, deleted, body, seq FROM docs WHERE account_id = ? AND seq > ? ORDER BY seq').all(accountId, cursor) as unknown as DocRow[]
    const counter = this.db.prepare('SELECT seq FROM counters WHERE account_id = ?').get(accountId) as { seq: number } | undefined
    const changes = rows.map((r): Change => (r.deleted ? { kind: r.kind, id: r.id, at: r.at, deleted: true } : ({ kind: r.kind, id: r.id, at: r.at, deleted: false, body: JSON.parse(r.body!) } as Change)))
    return { cursor: counter?.seq ?? cursor, changes }
  }
}
