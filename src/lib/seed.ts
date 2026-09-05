import type { AppData, ErrorEntry } from './types'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Demo data so a first-time visitor sees the app doing something. Names are fictional. */
export function seedData(): AppData {
  const ts = (i: number) => new Date(Date.now() - i * 60_000).toISOString()
  const students = [
    { id: 's-luana', name: 'Luana', level: 'B1' as const, createdAt: ts(300), updatedAt: ts(300) },
    { id: 's-emre', name: 'Emre', level: 'A2' as const, createdAt: ts(299), updatedAt: ts(299) },
    { id: 's-sofia', name: 'Sofía', level: 'B2' as const, createdAt: ts(298), updatedAt: ts(298) },
  ]
  const raw: Array<[string, number, string, string, string]> = [
    // Luana (Portuguese L1): present perfect still recurring; past simple vs present perfect has faded (improving)
    ['s-luana', 35, 'I have visited Lisbon last year.', 'I visited Lisbon last year.', 'past simple vs present perfect'],
    ['s-luana', 35, 'I have 25 years.', 'I am 25 years old.', 'age with have'],
    ['s-luana', 28, 'She has called me yesterday.', 'She called me yesterday.', 'past simple vs present perfect'],
    ['s-luana', 21, 'My mother is a very good cooker.', 'My mother is a very good cook.', 'false friend: cooker'],
    ['s-luana', 21, 'She is in the hospital since Monday.', 'She has been in hospital since Monday.', 'present perfect vs present simple'],
    ['s-luana', 21, 'I like very much the music.', 'I like the music very much.', 'adverb position'],
    ['s-luana', 14, 'I went to the university yesterday.', 'I went to university yesterday.', 'articles with institutions'],
    ['s-luana', 14, 'I live here since 2019.', 'I have lived here since 2019.', 'present perfect vs present simple'],
    ['s-luana', 7, 'We are married since ten years.', 'We have been married for ten years.', 'present perfect vs present simple'],
    ['s-luana', 7, 'I am agree with you.', 'I agree with you.', 'agree as a verb'],
    ['s-luana', 2, 'I did not saw him.', 'I did not see him.', 'auxiliary + base form'],
    ['s-luana', 2, 'He has gone to work since 8.', 'He has been at work since 8.', 'present perfect vs present simple'],
    // Emre (Turkish L1): articles and third person -s
    ['s-emre', 18, 'My brother work in bank.', 'My brother works in a bank.', 'third person -s'],
    ['s-emre', 18, 'I go to school with bus.', 'I go to school by bus.', 'prepositions of transport'],
    ['s-emre', 11, 'She like coffee.', 'She likes coffee.', 'third person -s'],
    ['s-emre', 11, 'I have dog.', 'I have a dog.', 'missing article'],
    ['s-emre', 4, 'He want to buy car.', 'He wants to buy a car.', 'third person -s'],
    ['s-emre', 4, 'It is very cold weather today.', 'The weather is very cold today.', 'word order'],
    // Sofía (Spanish L1): false friends, conditionals
    ['s-sofia', 16, 'I am actually working in marketing.', 'I am currently working in marketing.', 'false friend: actually'],
    ['s-sofia', 16, 'If I would have time, I would go.', 'If I had time, I would go.', 'second conditional'],
    ['s-sofia', 9, 'She assisted to the meeting.', 'She attended the meeting.', 'false friend: assist'],
    ['s-sofia', 3, 'If I would know, I would tell you.', 'If I knew, I would tell you.', 'second conditional'],
    ['s-sofia', 3, 'Can you explain me the rule?', 'Can you explain the rule to me?', 'explain + object'],
  ]
  const errors: ErrorEntry[] = raw.map(([studentId, ago, original, correction, tag], i) => ({
    id: `e-${i}`,
    studentId,
    original,
    correction,
    tag,
    date: daysAgo(ago),
    createdAt: ts(200 - i),
    updatedAt: ts(200 - i),
  }))
  return { version: 2, students, errors, tombstones: [] }
}
