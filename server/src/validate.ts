import { HTTPException } from 'hono/http-exception'
import type { Change } from '../../src/lib/sync.ts'
import { LEVELS } from '../../src/lib/types.ts'

export const MAX_CHANGES_PER_REQUEST = 10_000

const bad = (message: string): never => {
  throw new HTTPException(400, { message })
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isStr = (v: unknown, max = 10_000): v is string => typeof v === 'string' && v.length <= max
const isIsoTime = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v)
const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

export function parseEmail(v: unknown): string {
  if (!isStr(v, 254)) return bad('Email is required')
  const email = v.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('That does not look like an email address')
  return email
}

export function parsePassword(v: unknown): string {
  if (!isStr(v, 200) || v.length < 8) return bad('Password must be at least 8 characters')
  return v
}

function parseChange(v: unknown, i: number): Change {
  if (!isRecord(v)) return bad(`Change ${i}: expected an object`)
  const { kind, id, at, deleted } = v
  if (kind !== 'student' && kind !== 'error') return bad(`Change ${i}: unknown kind`)
  if (!isStr(id, 200) || id.length === 0) return bad(`Change ${i}: missing id`)
  if (!isIsoTime(at)) return bad(`Change ${i}: "at" must be an ISO timestamp`)
  if (typeof deleted !== 'boolean') return bad(`Change ${i}: "deleted" must be a boolean`)
  if (deleted) return { kind, id, at, deleted: true }

  const b = v.body
  if (!isRecord(b)) return bad(`Change ${i}: missing body`)
  if (b.id !== id) return bad(`Change ${i}: body id does not match`)
  if (b.updatedAt !== at) return bad(`Change ${i}: body updatedAt does not match "at"`)
  if (!isIsoTime(b.createdAt)) return bad(`Change ${i}: body createdAt must be an ISO timestamp`)

  if (kind === 'student') {
    if (!isStr(b.name, 200) || !b.name.trim()) return bad(`Change ${i}: student needs a name`)
    if (!isStr(b.level) || !(LEVELS as string[]).includes(b.level)) return bad(`Change ${i}: unknown level`)
    return {
      kind,
      id,
      at,
      deleted: false,
      body: { id, name: b.name, level: b.level as (typeof LEVELS)[number], createdAt: b.createdAt, updatedAt: at },
    }
  }
  if (!isStr(b.studentId, 200) || !b.studentId) return bad(`Change ${i}: error needs a studentId`)
  if (!isStr(b.original) || !isStr(b.correction) || !isStr(b.tag, 500)) return bad(`Change ${i}: error fields must be strings`)
  if (!isIsoDate(b.date)) return bad(`Change ${i}: error date must be YYYY-MM-DD`)
  return {
    kind,
    id,
    at,
    deleted: false,
    body: { id, studentId: b.studentId, original: b.original, correction: b.correction, tag: b.tag, date: b.date, createdAt: b.createdAt, updatedAt: at },
  }
}

export function parseSyncRequest(v: unknown): { cursor: number; changes: Change[] } {
  if (!isRecord(v)) return bad('Expected a JSON object')
  const { cursor, changes } = v
  if (typeof cursor !== 'number' || !Number.isInteger(cursor) || cursor < 0) return bad('"cursor" must be a non-negative integer')
  if (!Array.isArray(changes)) return bad('"changes" must be an array')
  if (changes.length > MAX_CHANGES_PER_REQUEST) throw new HTTPException(413, { message: `Send at most ${MAX_CHANGES_PER_REQUEST} changes per request` })
  return { cursor, changes: changes.map(parseChange) }
}
