import { describe, expect, it } from 'vitest'
import { seedData } from './seed'
import { applyChanges, changesSince, type Change } from './sync'
import { emptyData } from './types'
import type { ErrorEntry, Student } from './types'

const T = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString()

const student = (id: string, name: string, at: string): Student => ({ id, name, level: 'B1', createdAt: T(0), updatedAt: at })
const error = (id: string, studentId: string, tag: string, at: string): ErrorEntry => ({
  id,
  studentId,
  original: 'x',
  correction: 'y',
  tag,
  date: '2026-01-01',
  createdAt: T(0),
  updatedAt: at,
})
const live = (body: Student | ErrorEntry): Change =>
  'studentId' in body ? { kind: 'error', id: body.id, at: body.updatedAt, deleted: false, body } : { kind: 'student', id: body.id, at: body.updatedAt, deleted: false, body }
const dead = (kind: 'student' | 'error', id: string, at: string): Change => ({ kind, id, at, deleted: true })

describe('changesSince', () => {
  it('emits everything when since is null, in the wire shape', () => {
    const data = seedData()
    const all = changesSince(data, null)
    expect(all).toHaveLength(data.students.length + data.errors.length)
    expect(all.every((c) => !c.deleted && c.at === c.body.updatedAt)).toBe(true)
  })

  it('emits only records and tombstones changed strictly after since', () => {
    const data = {
      ...emptyData(),
      students: [student('a', 'A', T(1)), student('b', 'B', T(5))],
      tombstones: [{ id: 'gone', kind: 'error' as const, deletedAt: T(3) }],
    }
    expect(changesSince(data, T(1)).map((c) => c.id)).toEqual(['b', 'gone'])
    expect(changesSince(data, T(5))).toEqual([])
  })
})

describe('applyChanges', () => {
  const base = () => ({ ...emptyData(), students: [student('a', 'Ana', T(2))], errors: [error('e1', 'a', 'articles', T(2))] })

  it('a newer remote edit replaces the local version', () => {
    const out = applyChanges(base(), [live(student('a', 'Ana Maria', T(3)))])
    expect(out.students[0].name).toBe('Ana Maria')
  })

  it('an older remote edit is ignored, and so is an equal timestamp', () => {
    expect(applyChanges(base(), [live(student('a', 'Old', T(1)))]).students[0].name).toBe('Ana')
    expect(applyChanges(base(), [live(student('a', 'Tie', T(2)))]).students[0].name).toBe('Ana')
  })

  it('a newer remote delete removes the record and keeps a tombstone', () => {
    const out = applyChanges(base(), [dead('error', 'e1', T(3))])
    expect(out.errors).toEqual([])
    expect(out.tombstones).toEqual([{ id: 'e1', kind: 'error', deletedAt: T(3) }])
  })

  it('an edit newer than a delete brings the record back', () => {
    const deleted = applyChanges(base(), [dead('error', 'e1', T(3))])
    const out = applyChanges(deleted, [live(error('e1', 'a', 'articles again', T(4)))])
    expect(out.errors.map((e) => e.tag)).toEqual(['articles again'])
    expect(out.tombstones).toEqual([])
  })

  it('a delete older than the local edit is ignored', () => {
    const out = applyChanges(base(), [dead('error', 'e1', T(1))])
    expect(out.errors).toHaveLength(1)
    expect(out.tombstones).toEqual([])
  })

  it('deleting a student drops their errors even without error tombstones', () => {
    const out = applyChanges(base(), [dead('student', 'a', T(3))])
    expect(out.students).toEqual([])
    expect(out.errors).toEqual([])
  })

  it('an incoming error for an unknown student is not kept', () => {
    const out = applyChanges(base(), [live(error('e9', 'nobody', 't', T(3)))])
    expect(out.errors.map((e) => e.id)).toEqual(['e1'])
  })

  it('is idempotent: applying the same changes twice changes nothing', () => {
    const changes = [live(student('b', 'Bo', T(3))), live(error('e2', 'b', 't', T(3))), dead('error', 'e1', T(3))]
    const once = applyChanges(base(), changes)
    expect(applyChanges(once, changes)).toEqual(once)
  })

  it('two devices converge regardless of the order changes arrive', () => {
    const a = [live(student('a', 'From A', T(5))), dead('error', 'e1', T(4))]
    const b = [live(student('a', 'From B', T(6))), live(error('e2', 'a', 'new on B', T(6)))]
    const ab = applyChanges(applyChanges(base(), a), b)
    const ba = applyChanges(applyChanges(base(), b), a)
    expect(ab).toEqual(ba)
    expect(ab.students[0].name).toBe('From B')
    expect(ab.errors.map((e) => e.id)).toEqual(['e2'])
  })

  it('round-trips: a full snapshot applied to an empty store reproduces the data', () => {
    const data = seedData()
    const rebuilt = applyChanges(emptyData(), changesSince(data, null))
    expect(rebuilt.students).toEqual([...data.students].sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id)))
    expect(new Set(rebuilt.errors.map((e) => e.id))).toEqual(new Set(data.errors.map((e) => e.id)))
  })
})
