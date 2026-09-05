import { describe, expect, it } from 'vitest'
import { lessonSummary } from './summary'
import type { ErrorEntry } from './types'

let n = 0
const err = (date: string, original: string, correction: string, tag: string): ErrorEntry => ({
  id: `e${n++}`,
  studentId: 's',
  original,
  correction,
  tag,
  date,
  createdAt: new Date(2026, 0, 1, 0, n).toISOString(),
  updatedAt: new Date(2026, 0, 1, 0, n).toISOString(),
})

describe('lessonSummary', () => {
  const history = [
    err('2026-03-01', 'I have 25 years.', 'I am 25 years old.', 'age with have'),
    err('2026-03-01', 'I live here since 2019.', 'I have lived here since 2019.', 'present perfect vs present simple'),
    err('2026-03-08', 'We are married since ten years.', 'We have been married for ten years.', 'Present Perfect vs Present Simple'),
    err('2026-03-08', 'I am agree with you.', 'I agree with you.', 'agree as a verb'),
  ]

  it('names the student and the lesson date', () => {
    const text = lessonSummary({ studentName: 'Luana', date: '2026-03-08', errors: history, locale: 'en-GB' })
    expect(text.split('\n')[0]).toMatch(/^Lesson notes for Luana – .*8 March 2026$/)
  })

  it('lists only that lesson, in the order the errors were logged', () => {
    const text = lessonSummary({ studentName: 'Luana', date: '2026-03-08', errors: history, locale: 'en-GB' })
    expect(text).toContain('1. "We are married since ten years." → "We have been married for ten years." (Present Perfect vs Present Simple)')
    expect(text).toContain('2. "I am agree with you." → "I agree with you." (agree as a verb)')
    expect(text).not.toContain('I have 25 years.')
  })

  it('calls out tags from this lesson that appeared in earlier lessons, grouping case-insensitively', () => {
    const text = lessonSummary({ studentName: 'Luana', date: '2026-03-08', errors: history, locale: 'en-GB' })
    expect(text).toContain('Still coming up:')
    expect(text).toContain('- present perfect vs present simple (2 lessons so far)')
    expect(text).not.toContain('- agree as a verb')
  })

  it('omits the recurring section when nothing in the lesson has been seen in an earlier lesson (later lessons do not count)', () => {
    const text = lessonSummary({ studentName: 'Luana', date: '2026-03-01', errors: history, locale: 'en-GB' })
    expect(text).toContain('Corrections from this lesson:')
    expect(text).not.toContain('Still coming up')
  })

  it('uses the singular heading for one correction', () => {
    const text = lessonSummary({ studentName: 'Emre', date: '2026-04-01', errors: [err('2026-04-01', 'She like coffee.', 'She likes coffee.', 'third person -s')], locale: 'en-GB' })
    expect(text).toContain('Correction from this lesson:')
  })

  it('handles a date with no entries', () => {
    const text = lessonSummary({ studentName: 'Luana', date: '2026-05-05', errors: history, locale: 'en-GB' })
    expect(text).toContain('No corrections logged for this lesson.')
  })
})
