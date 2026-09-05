import type { AppData, ErrorEntry, Student, Tombstone } from './types'

/**
 * Wire format shared by the app and the sync server. One flat list of
 * changes, each either a live record or a deletion, stamped with the time of
 * the change. Merging is last-write-wins per record on that timestamp.
 */
export type Change =
  | { kind: 'student'; id: string; at: string; deleted: false; body: Student }
  | { kind: 'error'; id: string; at: string; deleted: false; body: ErrorEntry }
  | { kind: 'student' | 'error'; id: string; at: string; deleted: true }

export interface SyncRequest {
  /** Server sequence number the client has already seen; 0 for a fresh device */
  cursor: number
  changes: Change[]
}

export interface SyncResponse {
  cursor: number
  changes: Change[]
}

/** Every record and tombstone changed after `since` (all of them when since is null). */
export function changesSince(data: AppData, since: string | null): Change[] {
  const after = (at: string) => since === null || at > since
  const out: Change[] = []
  for (const s of data.students) if (after(s.updatedAt)) out.push({ kind: 'student', id: s.id, at: s.updatedAt, deleted: false, body: s })
  for (const e of data.errors) if (after(e.updatedAt)) out.push({ kind: 'error', id: e.id, at: e.updatedAt, deleted: false, body: e })
  for (const t of data.tombstones) if (after(t.deletedAt)) out.push({ kind: t.kind, id: t.id, at: t.deletedAt, deleted: true })
  return out
}

/**
 * Merge incoming changes into local data. For each record the newer timestamp
 * wins, whether that is an edit or a deletion; ties keep the local version.
 * Applying the same changes twice is a no-op. Errors whose student no longer
 * exists are dropped so the result is always internally consistent.
 */
export function applyChanges(data: AppData, incoming: Change[]): AppData {
  const students = new Map(data.students.map((s) => [s.id, s]))
  const errors = new Map(data.errors.map((e) => [e.id, e]))
  const tombstones = new Map(data.tombstones.map((t) => [t.id, t]))

  const localTime = (kind: Change['kind'], id: string): string | null => {
    const live = kind === 'student' ? students.get(id) : errors.get(id)
    const dead = tombstones.get(id)
    return live?.updatedAt ?? dead?.deletedAt ?? null
  }

  for (const c of incoming) {
    const mine = localTime(c.kind, c.id)
    if (mine !== null && c.at <= mine) continue
    if (c.deleted) {
      students.delete(c.id)
      errors.delete(c.id)
      tombstones.set(c.id, { id: c.id, kind: c.kind, deletedAt: c.at })
    } else {
      tombstones.delete(c.id)
      if (c.kind === 'student') students.set(c.id, c.body)
      else errors.set(c.id, c.body)
    }
  }

  const byCreated = <T extends { createdAt: string; id: string }>(a: T, b: T) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  const liveStudents = [...students.values()].sort(byCreated)
  const studentIds = new Set(liveStudents.map((s) => s.id))
  const liveErrors = [...errors.values()].filter((e) => studentIds.has(e.studentId)).sort(byCreated)
  const deadList: Tombstone[] = [...tombstones.values()].sort((a, b) => a.deletedAt.localeCompare(b.deletedAt) || a.id.localeCompare(b.id))

  return { version: 2, students: liveStudents, errors: liveErrors, tombstones: deadList }
}
