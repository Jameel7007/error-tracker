import { beforeEach, describe, expect, it } from 'vitest'
import { reducer } from './reducer'
import { seedData } from './seed'
import { exportJson, hasStoredData, importJson, InvalidDataError, loadData, parseData, saveData, STORAGE_KEY } from './storage'
import { emptyData } from './types'

describe('parseData / importJson', () => {
  it('round-trips exported data', () => {
    const data = seedData()
    expect(importJson(exportJson(data))).toEqual(data)
  })

  it('rejects non-JSON', () => {
    expect(() => importJson('{nope')).toThrow(InvalidDataError)
  })

  it('rejects unknown versions', () => {
    expect(() => parseData({ version: 3, students: [], errors: [], tombstones: [] })).toThrow(/version/)
  })

  it('migrates a v1 export: updatedAt is filled from createdAt and tombstones start empty', () => {
    const v1 = {
      version: 1,
      students: [{ id: 's', name: 'Ana', level: 'A2', createdAt: '2026-01-01T10:00:00.000Z' }],
      errors: [{ id: 'e', studentId: 's', original: 'a', correction: 'b', tag: 't', date: '2026-01-01', createdAt: '2026-01-01T10:05:00.000Z' }],
    }
    const data = parseData(v1)
    expect(data.version).toBe(2)
    expect(data.students[0].updatedAt).toBe('2026-01-01T10:00:00.000Z')
    expect(data.errors[0].updatedAt).toBe('2026-01-01T10:05:00.000Z')
    expect(data.tombstones).toEqual([])
  })

  it('requires updatedAt and tombstones on v2 data', () => {
    const { tombstones: _t, ...noTombstones } = seedData()
    expect(() => parseData(noTombstones)).toThrow(/tombstones/)
    const s = seedData()
    const { updatedAt: _u, ...staleStudent } = s.students[0]
    expect(() => parseData({ ...s, students: [staleStudent, ...s.students.slice(1)] })).toThrow(/student/)
    expect(() => parseData({ ...s, tombstones: [{ id: 'x', kind: 'thing', deletedAt: 'now' }] })).toThrow(/tombstone/)
  })

  it('rejects malformed students and errors', () => {
    expect(() => parseData({ version: 1, students: [{ id: 1 }], errors: [] })).toThrow(/student/)
    expect(() =>
      parseData({ version: 1, students: [], errors: [{ id: 'e', studentId: 's', original: '', correction: '', tag: '', date: 'bad', createdAt: '' }] }),
    ).toThrow(/error/)
  })

  it('rejects invalid levels', () => {
    expect(() => parseData({ version: 1, students: [{ id: 's', name: 'X', level: 'Z9', createdAt: '' }], errors: [] })).toThrow()
  })

  it('rejects errors pointing at unknown students', () => {
    const data = seedData()
    data.errors[0] = { ...data.errors[0], studentId: 'ghost' }
    expect(() => parseData(data)).toThrow(/unknown student/)
  })
})

describe('loadData / saveData', () => {
  beforeEach(() => localStorage.clear())

  it('returns empty data when nothing is stored', () => {
    expect(loadData()).toEqual(emptyData())
  })

  it('persists and reloads', () => {
    const data = seedData()
    saveData(data)
    expect(loadData()).toEqual(data)
  })

  it('distinguishes "never saved" from "saved but empty"', () => {
    expect(hasStoredData()).toBe(false)
    saveData(emptyData())
    expect(hasStoredData()).toBe(true)
    expect(loadData()).toEqual(emptyData())
  })

  it('falls back to empty data on corrupt storage', () => {
    localStorage.setItem(STORAGE_KEY, '{corrupt')
    expect(loadData()).toEqual(emptyData())
  })
})

describe('reducer', () => {
  it('adds a student and an error', () => {
    let s = reducer(emptyData(), { type: 'addStudent', name: '  Ana ', level: 'A2' })
    expect(s.students).toHaveLength(1)
    expect(s.students[0].name).toBe('Ana')
    s = reducer(s, {
      type: 'addError',
      entry: { studentId: s.students[0].id, original: ' I has ', correction: 'I have', tag: 'agreement', date: '2026-09-05' },
    })
    expect(s.errors).toHaveLength(1)
    expect(s.errors[0].original).toBe('I has')
  })

  it('ignores blank input', () => {
    const s = reducer(emptyData(), { type: 'addStudent', name: '   ', level: 'A2' })
    expect(s.students).toHaveLength(0)
    const s2 = reducer(seedData(), { type: 'addError', entry: { studentId: 's-luana', original: '', correction: 'x', tag: 'y', date: '2026-01-01' } })
    expect(s2.errors).toHaveLength(seedData().errors.length)
  })

  it('refuses errors for unknown students', () => {
    const s = reducer(emptyData(), { type: 'addError', entry: { studentId: 'nope', original: 'a', correction: 'b', tag: 'c', date: '2026-01-01' } })
    expect(s.errors).toHaveLength(0)
  })

  it('removing a student cascades to their errors and leaves a tombstone for each', () => {
    const before = seedData()
    const luanaErrors = before.errors.filter((e) => e.studentId === 's-luana').map((e) => e.id)
    const after = reducer(before, { type: 'removeStudent', id: 's-luana' })
    expect(after.students.some((x) => x.id === 's-luana')).toBe(false)
    expect(after.errors.some((e) => e.studentId === 's-luana')).toBe(false)
    expect(after.tombstones.map((t) => t.id)).toEqual(['s-luana', ...luanaErrors])
    expect(after.tombstones[0].kind).toBe('student')
    expect(after.tombstones[1].kind).toBe('error')
  })

  it('updates bump updatedAt; removals leave a tombstone', () => {
    const s = seedData()
    const id = s.errors[0].id
    const updated = reducer(s, { type: 'updateError', id, patch: { tag: 'renamed' } })
    expect(updated.errors[0].tag).toBe('renamed')
    expect(updated.errors[0].updatedAt > s.errors[0].updatedAt).toBe(true)
    expect(updated.errors[0].createdAt).toBe(s.errors[0].createdAt)
    const removed = reducer(updated, { type: 'removeError', id })
    expect(removed.errors.some((e) => e.id === id)).toBe(false)
    expect(removed.tombstones).toEqual([expect.objectContaining({ id, kind: 'error' })])
  })

  it('removing something that does not exist is a no-op, not a tombstone', () => {
    const s = seedData()
    expect(reducer(s, { type: 'removeError', id: 'ghost' })).toBe(s)
    expect(reducer(s, { type: 'removeStudent', id: 'ghost' })).toBe(s)
  })
})
