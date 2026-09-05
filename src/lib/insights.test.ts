import { describe, expect, it } from 'vitest'
import { groupByDate, normaliseTag, rankTags, suggestTags } from './insights'
import type { ErrorEntry } from './types'

let n = 0
const err = (studentId: string, tag: string, date: string): ErrorEntry => ({
  id: `e${n++}`,
  studentId,
  original: 'x',
  correction: 'y',
  tag,
  date,
  createdAt: new Date(2026, 0, 1, 0, n).toISOString(),
})

describe('normaliseTag', () => {
  it('trims, collapses whitespace and lowercases', () => {
    expect(normaliseTag('  Present   Perfect ')).toBe('present perfect')
  })
})

describe('rankTags', () => {
  const errors = [
    err('a', 'articles', '2026-01-01'),
    err('a', 'Articles', '2026-01-08'),
    err('a', 'articles ', '2026-01-15'),
    err('a', 'third person -s', '2026-01-08'),
    err('a', 'third person -s', '2026-01-15'),
    err('a', 'word order', '2026-01-22'),
    err('b', 'articles', '2026-01-22'),
  ]

  it('groups case- and whitespace-insensitively and sorts by count', () => {
    const ranked = rankTags(errors, 'a')
    expect(ranked.map((r) => r.tag)).toEqual(['articles', 'third person -s', 'word order'])
    expect(ranked[0].count).toBe(3)
    expect(ranked[0].lessons).toBe(3)
  })

  it('scopes to one student', () => {
    expect(rankTags(errors, 'b')).toHaveLength(1)
    expect(rankTags(errors)[0].count).toBe(4)
  })

  it('reports first and last seen', () => {
    const [articles] = rankTags(errors, 'a')
    expect(articles.firstSeen).toBe('2026-01-01')
    expect(articles.lastSeen).toBe('2026-01-15')
  })

  it('flags trend: new for single lesson, persistent if in last 3 lessons, improving otherwise', () => {
    const many = [
      err('c', 'old habit', '2026-01-01'),
      err('c', 'old habit', '2026-01-02'),
      err('c', 'sticky', '2026-01-01'),
      err('c', 'sticky', '2026-01-05'),
      err('c', 'fresh', '2026-01-05'),
      err('c', 'filler', '2026-01-03'),
      err('c', 'filler', '2026-01-04'),
    ]
    const byTag = Object.fromEntries(rankTags(many, 'c').map((r) => [r.tag, r.trend]))
    expect(byTag['old habit']).toBe('improving')
    expect(byTag['sticky']).toBe('persistent')
    expect(byTag['fresh']).toBe('new')
  })

  it('returns an empty list for a student with no errors', () => {
    expect(rankTags(errors, 'nobody')).toEqual([])
  })

  it('ignores blank tags', () => {
    expect(rankTags([err('a', '   ', '2026-01-01')])).toEqual([])
  })
})

describe('suggestTags', () => {
  it('returns distinct display tags, most used first', () => {
    const errors = [err('a', 'B tag', '2026-01-01'), err('a', 'a tag', '2026-01-01'), err('a', 'A Tag', '2026-01-02')]
    expect(suggestTags(errors)).toEqual(['a tag', 'B tag'])
  })
})

describe('groupByDate', () => {
  it('groups newest date first, newest entry first within a date', () => {
    const first = err('a', 't', '2026-02-01')
    const second = err('a', 't', '2026-02-01')
    const older = err('a', 't', '2026-01-01')
    const grouped = groupByDate([older, first, second])
    expect(grouped.map((g) => g.date)).toEqual(['2026-02-01', '2026-01-01'])
    expect(grouped[0].entries.map((e) => e.id)).toEqual([second.id, first.id])
  })
})
