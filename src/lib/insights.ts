import type { ErrorEntry } from './types'

export interface TagStat {
  tag: string
  count: number
  /** Number of distinct lesson dates the tag appeared on */
  lessons: number
  firstSeen: string
  lastSeen: string
  /** Trend over the most recent lessons: 'improving' | 'persistent' | 'new' */
  trend: 'improving' | 'persistent' | 'new'
}

/** Normalise a tag for grouping: trim, collapse spaces, lowercase. */
export function normaliseTag(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Rank error tags for one student (or all students when studentId is omitted).
 * Sorted by count desc, then by most recent occurrence.
 */
export function rankTags(errors: ErrorEntry[], studentId?: string): TagStat[] {
  const subset = studentId ? errors.filter((e) => e.studentId === studentId) : errors
  const groups = new Map<string, ErrorEntry[]>()
  for (const e of subset) {
    const key = normaliseTag(e.tag)
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push(e)
    groups.set(key, list)
  }

  const allDates = [...new Set(subset.map((e) => e.date))].sort()
  const recentWindow = new Set(allDates.slice(-3))

  const stats: TagStat[] = []
  for (const [tag, list] of groups) {
    const dates = [...new Set(list.map((e) => e.date))].sort()
    const firstSeen = dates[0]
    const lastSeen = dates[dates.length - 1]
    let trend: TagStat['trend']
    if (dates.length === 1) trend = 'new'
    else if (recentWindow.has(lastSeen)) trend = 'persistent'
    else trend = 'improving'
    stats.push({ tag, count: list.length, lessons: dates.length, firstSeen, lastSeen, trend })
  }

  return stats.sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen) || a.tag.localeCompare(b.tag))
}

/** Distinct tags across all errors, most-used first, for autocomplete. */
export function suggestTags(errors: ErrorEntry[]): string[] {
  const counts = new Map<string, { display: string; n: number }>()
  for (const e of errors) {
    const key = normaliseTag(e.tag)
    if (!key) continue
    const cur = counts.get(key)
    if (cur) cur.n++
    else counts.set(key, { display: e.tag.trim(), n: 1 })
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.display.localeCompare(b.display)).map((c) => c.display)
}

/** Errors grouped by date, newest date first, newest entry first within a date. */
export function groupByDate(errors: ErrorEntry[]): { date: string; entries: ErrorEntry[] }[] {
  const map = new Map<string, ErrorEntry[]>()
  for (const e of errors) {
    const list = map.get(e.date) ?? []
    list.push(e)
    map.set(e.date, list)
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, entries]) => ({
      date,
      entries: entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }))
}
