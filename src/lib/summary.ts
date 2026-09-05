import { normaliseTag, rankTags } from './insights'
import type { ErrorEntry } from './types'

export interface LessonSummaryInput {
  studentName: string
  /** Lesson date, YYYY-MM-DD */
  date: string
  /** The student's full error history; the lesson's entries are picked out of it */
  errors: ErrorEntry[]
  /** BCP 47 locale for the date line; defaults to the browser's */
  locale?: string
}

function longDate(iso: string, locale?: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Plain-text notes for one lesson, ready to paste into a student's homework
 * message: each correction in the order it was logged, then the tags from this
 * lesson that have come up in earlier lessons too.
 */
export function lessonSummary({ studentName, date, errors, locale }: LessonSummaryInput): string {
  const entries = errors.filter((e) => e.date === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const lines = [`Lesson notes for ${studentName} – ${longDate(date, locale)}`, '']

  if (entries.length === 0) {
    lines.push('No corrections logged for this lesson.')
    return lines.join('\n')
  }

  lines.push(entries.length === 1 ? 'Correction from this lesson:' : 'Corrections from this lesson:')
  entries.forEach((e, i) => {
    lines.push(`${i + 1}. "${e.original}" → "${e.correction}" (${e.tag.trim()})`)
  })

  // Only lessons up to this one count: a summary written on the day should not know about later lessons
  const inLesson = new Set(entries.map((e) => normaliseTag(e.tag)))
  const upToLesson = errors.filter((e) => e.date <= date)
  const recurring = rankTags(upToLesson).filter((s) => inLesson.has(s.tag) && s.lessons > 1)
  if (recurring.length > 0) {
    lines.push('', 'Still coming up:')
    for (const s of recurring) {
      lines.push(`- ${s.tag} (${s.lessons} lessons so far)`)
    }
  }

  return lines.join('\n')
}
