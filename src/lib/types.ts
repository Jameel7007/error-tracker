export type Level = 'A0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

export interface Student {
  id: string
  name: string
  level: Level
  createdAt: string
}

export interface ErrorEntry {
  id: string
  studentId: string
  /** What the student actually said or wrote */
  original: string
  /** The corrected form */
  correction: string
  /** Category tag, e.g. "past simple vs present perfect" */
  tag: string
  /** ISO date (YYYY-MM-DD) of the lesson */
  date: string
  createdAt: string
}

export interface AppData {
  version: 1
  students: Student[]
  errors: ErrorEntry[]
}

export const LEVELS: Level[] = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export const emptyData = (): AppData => ({ version: 1, students: [], errors: [] })
