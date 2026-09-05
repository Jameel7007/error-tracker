import { emptyData, LEVELS, type AppData, type ErrorEntry, type Student } from './types'

export const STORAGE_KEY = 'lesson-error-tracker:v1'

export function loadData(storage: Storage = localStorage): AppData {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return emptyData()
    return parseData(JSON.parse(raw))
  } catch {
    return emptyData()
  }
}

/** True once this browser has saved data before, even if that data is empty. */
export function hasStoredData(storage: Storage = localStorage): boolean {
  try {
    return storage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}

export function saveData(data: AppData, storage: Storage = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Storage may be unavailable (private mode, quota). The app keeps working in memory.
  }
}

export class InvalidDataError extends Error {}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isStudent(v: unknown): v is Student {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.level === 'string' &&
    (LEVELS as string[]).includes(v.level) &&
    typeof v.createdAt === 'string'
  )
}

function isError(v: unknown): v is ErrorEntry {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.studentId === 'string' &&
    typeof v.original === 'string' &&
    typeof v.correction === 'string' &&
    typeof v.tag === 'string' &&
    typeof v.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.date) &&
    typeof v.createdAt === 'string'
  )
}

/**
 * Validate untrusted JSON (from localStorage or an imported file) into AppData.
 * Throws InvalidDataError with a human-readable message on bad input.
 */
export function parseData(input: unknown): AppData {
  if (!isRecord(input)) throw new InvalidDataError('Expected a JSON object')
  if (input.version !== 1) throw new InvalidDataError(`Unsupported version: ${String(input.version)}`)
  if (!Array.isArray(input.students)) throw new InvalidDataError('Missing "students" array')
  if (!Array.isArray(input.errors)) throw new InvalidDataError('Missing "errors" array')

  const students: Student[] = []
  for (const s of input.students) {
    if (!isStudent(s)) throw new InvalidDataError('Malformed student entry')
    students.push(s)
  }
  const ids = new Set(students.map((s) => s.id))
  const errors: ErrorEntry[] = []
  for (const e of input.errors) {
    if (!isError(e)) throw new InvalidDataError('Malformed error entry')
    if (!ids.has(e.studentId)) throw new InvalidDataError(`Error refers to unknown student "${e.studentId}"`)
    errors.push(e)
  }
  return { version: 1, students, errors }
}

export function exportJson(data: AppData): string {
  return JSON.stringify(data, null, 2)
}

export function importJson(text: string): AppData {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new InvalidDataError('File is not valid JSON')
  }
  return parseData(parsed)
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
