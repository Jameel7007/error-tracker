import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { hashPassword, hashToken, newId, newToken, verifyPassword } from './auth.ts'
import type { Db } from './db.ts'
import { parseEmail, parsePassword, parseSyncRequest } from './validate.ts'

export interface AppOptions {
  /** Browser origins allowed to call the API. Defaults to none, which blocks cross-origin browsers. */
  corsOrigins?: string[]
  sessionDays?: number
  /** Failed sign-ins allowed per email+address in the window before a 429 */
  loginAttempts?: number
  loginWindowMs?: number
}

type Env = { Variables: { accountId: string; tokenHash: string } }

const DAY_MS = 24 * 60 * 60 * 1000

export function createApp(db: Db, opts: AppOptions = {}) {
  const sessionDays = opts.sessionDays ?? 30
  const loginAttempts = opts.loginAttempts ?? 10
  const loginWindowMs = opts.loginWindowMs ?? 15 * 60 * 1000
  const failures = new Map<string, { count: number; resetAt: number }>()

  const app = new Hono<Env>()

  app.use('*', cors({ origin: opts.corsOrigins ?? [], allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowHeaders: ['Authorization', 'Content-Type'] }))
  app.use('*', bodyLimit({ maxSize: 5 * 1024 * 1024, onError: (c) => c.json({ error: 'Request too large' }, 413) }))

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
    console.error(err)
    return c.json({ error: 'Something went wrong on the server' }, 500)
  })
  app.notFound((c) => c.json({ error: 'Not found' }, 404))

  const readJson = async (c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new HTTPException(400, { message: 'Body must be JSON' })
    }
    if (typeof body !== 'object' || body === null) throw new HTTPException(400, { message: 'Expected a JSON object' })
    return body as Record<string, unknown>
  }

  const issueSession = (accountId: string) => {
    const token = newToken()
    const expiresAt = new Date(Date.now() + sessionDays * DAY_MS).toISOString()
    db.createSession(hashToken(token), accountId, expiresAt)
    return { token, expiresAt }
  }

  const requireAuth = createMiddleware<Env>(async (c, next) => {
    const header = c.req.header('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!token) throw new HTTPException(401, { message: 'Sign in required' })
    const tokenHash = hashToken(token)
    const session = db.findSession(tokenHash)
    if (!session) throw new HTTPException(401, { message: 'Session expired. Sign in again' })
    c.set('accountId', session.accountId)
    c.set('tokenHash', tokenHash)
    await next()
  })

  app.get('/health', (c) => c.json({ ok: true }))

  app.post('/auth/register', async (c) => {
    const body = await readJson(c)
    const email = parseEmail(body.email)
    const password = parsePassword(body.password)
    const account = db.createAccount(newId(), email, await hashPassword(password))
    if (!account) throw new HTTPException(409, { message: 'An account with that email already exists' })
    return c.json({ email, ...issueSession(account.id) }, 201)
  })

  app.post('/auth/login', async (c) => {
    const body = await readJson(c)
    const email = parseEmail(body.email)
    const password = typeof body.password === 'string' ? body.password : ''
    const key = `${c.req.header('x-forwarded-for') ?? 'local'}|${email}`
    const now = Date.now()
    const record = failures.get(key)
    if (record && record.resetAt > now && record.count >= loginAttempts) {
      throw new HTTPException(429, { message: 'Too many attempts. Try again later' })
    }

    const account = db.findAccountByEmail(email)
    const ok = account ? await verifyPassword(password, account.passwordHash) : false
    if (!account || !ok) {
      const fresh = !record || record.resetAt <= now
      failures.set(key, { count: fresh ? 1 : record.count + 1, resetAt: fresh ? now + loginWindowMs : record.resetAt })
      throw new HTTPException(401, { message: 'Email or password is incorrect' })
    }
    failures.delete(key)
    return c.json({ email: account.email, ...issueSession(account.id) })
  })

  app.get('/auth/me', requireAuth, (c) => {
    const account = db.findAccountById(c.get('accountId'))
    if (!account) throw new HTTPException(401, { message: 'Account no longer exists' })
    return c.json({ email: account.email })
  })

  app.delete('/auth/session', requireAuth, (c) => {
    db.deleteSession(c.get('tokenHash'))
    return c.body(null, 204)
  })

  /** Deletes the account and every record and session that belongs to it. */
  app.delete('/auth/account', requireAuth, (c) => {
    db.deleteAccount(c.get('accountId'))
    return c.body(null, 204)
  })

  /**
   * One round trip does both directions: store the client's changes (newer
   * wins per record), then return everything the account has stored after
   * the client's cursor, including its own just-pushed changes, which the
   * client's merge treats as no-ops.
   */
  app.post('/sync', requireAuth, async (c) => {
    const { cursor, changes } = parseSyncRequest(await readJson(c))
    const accountId = c.get('accountId')
    const applied = db.applyChanges(accountId, changes)
    const out = db.changesSince(accountId, cursor)
    return c.json({ ...out, applied })
  })

  return app
}
