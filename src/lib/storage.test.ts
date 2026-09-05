import { beforeEach, describe, expect, it } from 'vitest'
import { reducer } from './reducer'
import { seedData } from './seed'
import { exportJson, importJson, InvalidDataError, loadData, parseData, saveData, STORAGE_KEY } from './storage'
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
    expect(() => parseData({ version: 2, students: [], errors: [] })).toThrow(/version/)
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

  it('removing a student cascades to their errors', () => {
    const before = seedData()
    const after = reducer(before, { type: 'removeStudent', id: 's-luana' })
    expect(after.students.some((x) => x.id === 's-luana')).toBe(false)
    expect(after.errors.some((e) => e.studentId === 's-luana')).toBe(false)
    expect(after.errors.length).toBeLessThan(before.errors.length)
  })

  it('updates and removes errors', () => {
    const s = seedData()
    const id = s.errors[0].id
    const updated = reducer(s, { type: 'updateError', id, patch: { tag: 'renamed' } })
    expect(updated.errors[0].tag).toBe('renamed')
    const removed = reducer(updated, { type: 'removeError', id })
    expect(removed.errors.some((e) => e.id === id)).toBe(false)
  })
})
