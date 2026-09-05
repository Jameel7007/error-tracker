import { beforeEach, describe, expect, it } from 'vitest'
import type { Change } from '../../src/lib/sync.ts'
import { createApp } from './app.ts'
import { Db } from './db.ts'

type App = ReturnType<typeof createApp>

const T = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString()

const student = (id: string, name: string, at: string): Change => ({
  kind: 'student',
  id,
  at,
  deleted: false,
  body: { id, name, level: 'B1', createdAt: T(0), updatedAt: at },
})
const error = (id: string, studentId: string, tag: string, at: string): Change => ({
  kind: 'error',
  id,
  at,
  deleted: false,
  body: { id, studentId, original: 'x', correction: 'y', tag, date: '2026-01-01', createdAt: T(0), updatedAt: at },
})
const gone = (kind: 'student' | 'error', id: string, at: string): Change => ({ kind, id, at, deleted: true })

async function call(app: App, method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

async function register(app: App, email = 'tutor@example.com', password = 'correct horse battery') {
  const r = await call(app, 'POST', '/auth/register', { email, password })
  expect(r.status).toBe(201)
  return r.body.token as string
}

describe('sync server', () => {
  let app: App
  beforeEach(() => {
    app = createApp(Db.open(':memory:'), { loginAttempts: 3 })
  })

  it('answers health checks', async () => {
    expect((await call(app, 'GET', '/health')).body).toEqual({ ok: true })
  })

  describe('accounts', () => {
    it('registers, then signs in with the same password', async () => {
      await register(app, 'Tutor@Example.com ')
      const r = await call(app, 'POST', '/auth/login', { email: 'tutor@example.com', password: 'correct horse battery' })
      expect(r.status).toBe(200)
      expect(r.body.email).toBe('tutor@example.com')
      expect(typeof r.body.token).toBe('string')
    })

    it('rejects duplicate emails, weak passwords, and bad email addresses', async () => {
      await register(app)
      expect((await call(app, 'POST', '/auth/register', { email: 'tutor@example.com', password: 'another good one' })).status).toBe(409)
      expect((await call(app, 'POST', '/auth/register', { email: 'x@example.com', password: 'short' })).status).toBe(400)
      expect((await call(app, 'POST', '/auth/register', { email: 'not-an-email', password: 'long enough password' })).status).toBe(400)
    })

    it('gives the same answer for a wrong password and an unknown email', async () => {
      await register(app)
      const wrong = await call(app, 'POST', '/auth/login', { email: 'tutor@example.com', password: 'nope nope nope' })
      const unknown = await call(app, 'POST', '/auth/login', { email: 'ghost@example.com', password: 'nope nope nope' })
      expect(wrong.status).toBe(401)
      expect(unknown).toEqual(wrong)
    })

    it('rate-limits repeated failed sign-ins', async () => {
      await register(app)
      for (let i = 0; i < 3; i++) expect((await call(app, 'POST', '/auth/login', { email: 'tutor@example.com', password: 'wrong wrong wrong' })).status).toBe(401)
      const blocked = await call(app, 'POST', '/auth/login', { email: 'tutor@example.com', password: 'correct horse battery' })
      expect(blocked.status).toBe(429)
    })

    it('identifies the signed-in account and forgets a signed-out token', async () => {
      const token = await register(app)
      expect((await call(app, 'GET', '/auth/me', undefined, token)).body).toEqual({ email: 'tutor@example.com' })
      expect((await call(app, 'DELETE', '/auth/session', undefined, token)).status).toBe(204)
      expect((await call(app, 'GET', '/auth/me', undefined, token)).status).toBe(401)
    })

    it('refuses requests without a valid token', async () => {
      expect((await call(app, 'GET', '/auth/me')).status).toBe(401)
      expect((await call(app, 'POST', '/sync', { cursor: 0, changes: [] }, 'made-up')).status).toBe(401)
    })

    it('expires sessions', async () => {
      const short = createApp(Db.open(':memory:'), { sessionDays: -1 })
      const token = await register(short)
      expect((await call(short, 'GET', '/auth/me', undefined, token)).status).toBe(401)
    })

    it('deleting the account removes its data and sessions', async () => {
      const token = await register(app)
      await call(app, 'POST', '/sync', { cursor: 0, changes: [student('a', 'Ana', T(1))] }, token)
      expect((await call(app, 'DELETE', '/auth/account', undefined, token)).status).toBe(204)
      expect((await call(app, 'GET', '/auth/me', undefined, token)).status).toBe(401)
      const again = await register(app)
      expect((await call(app, 'POST', '/sync', { cursor: 0, changes: [] }, again)).body.changes).toEqual([])
    })
  })

  describe('sync', () => {
    it('stores pushed changes and hands them to a second device from cursor 0', async () => {
      const token = await register(app)
      const first = await call(app, 'POST', '/sync', { cursor: 0, changes: [student('a', 'Ana', T(1)), error('e1', 'a', 'articles', T(1))] }, token)
      expect(first.status).toBe(200)
      expect(first.body.applied).toBe(2)
      expect(first.body.cursor).toBe(2)

      const second = await call(app, 'POST', '/sync', { cursor: 0, changes: [] }, token)
      expect(second.body.changes.map((c: Change) => c.id)).toEqual(['a', 'e1'])
      expect(second.body.cursor).toBe(2)

      const nothingNew = await call(app, 'POST', '/sync', { cursor: 2, changes: [] }, token)
      expect(nothingNew.body.changes).toEqual([])
    })

    it('keeps the newer version when two devices disagree, whichever arrives first', async () => {
      const token = await register(app)
      await call(app, 'POST', '/sync', { cursor: 0, changes: [student('a', 'Newer', T(5))] }, token)
      const stale = await call(app, 'POST', '/sync', { cursor: 0, changes: [student('a', 'Older', T(3))] }, token)
      expect(stale.body.applied).toBe(0)
      expect(stale.body.changes[0].body.name).toBe('Newer')

      const newer = await call(app, 'POST', '/sync', { cursor: 1, changes: [student('a', 'Newest', T(7))] }, token)
      expect(newer.body.applied).toBe(1)
      expect(newer.body.changes).toEqual([student('a', 'Newest', T(7))])
    })

    it('a newer delete beats an older edit and is delivered as a tombstone', async () => {
      const token = await register(app)
      await call(app, 'POST', '/sync', { cursor: 0, changes: [error('e1', 'a', 't', T(1))] }, token)
      await call(app, 'POST', '/sync', { cursor: 0, changes: [gone('error', 'e1', T(2))] }, token)
      const late = await call(app, 'POST', '/sync', { cursor: 0, changes: [error('e1', 'a', 'edited offline', T(1))] }, token)
      expect(late.body.applied).toBe(0)
      expect(late.body.changes).toEqual([gone('error', 'e1', T(2))])
    })

    it('keeps accounts apart', async () => {
      const a = await register(app, 'a@example.com')
      const b = await register(app, 'b@example.com')
      await call(app, 'POST', '/sync', { cursor: 0, changes: [student('s', 'Only A', T(1))] }, a)
      expect((await call(app, 'POST', '/sync', { cursor: 0, changes: [] }, b)).body.changes).toEqual([])
    })

    it('rejects malformed changes with a reason', async () => {
      const token = await register(app)
      const cases: unknown[] = [
        { kind: 'thing', id: 'x', at: T(1), deleted: true },
        { kind: 'student', id: 'x', at: 'yesterday', deleted: true },
        { kind: 'student', id: 'x', at: T(1), deleted: false, body: { id: 'y', name: 'Mismatch', level: 'B1', createdAt: T(0), updatedAt: T(1) } },
        { kind: 'student', id: 'x', at: T(1), deleted: false, body: { id: 'x', name: 'Bad level', level: 'Z9', createdAt: T(0), updatedAt: T(1) } },
        { kind: 'error', id: 'x', at: T(1), deleted: false, body: { id: 'x', studentId: 's', original: 'a', correction: 'b', tag: 't', date: 'bad', createdAt: T(0), updatedAt: T(1) } },
      ]
      for (const c of cases) {
        const r = await call(app, 'POST', '/sync', { cursor: 0, changes: [c] }, token)
        expect(r.status, JSON.stringify(c)).toBe(400)
        expect(typeof r.body.error).toBe('string')
      }
      expect((await call(app, 'POST', '/sync', { cursor: -1, changes: [] }, token)).status).toBe(400)
      expect((await call(app, 'POST', '/sync', { cursor: 0, changes: [] }, token, {}) ).status).toBe(200)
    })

    it('rejects a body that is not JSON', async () => {
      const token = await register(app)
      const res = await app.request('/sync', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{nope' })
      expect(res.status).toBe(400)
    })
  })
})
