export type Level = 'A0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

export interface Student {
  id: string
  name: string
  level: Level
  createdAt: string
  /** ISO timestamp of the last change; sync uses it to decide which version wins */
  updatedAt: string
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
  /** ISO timestamp of the last change; sync uses it to decide which version wins */
  updatedAt: string
}

/** A record that was deleted. Kept so a deletion can win over an older edit made on another device. */
export interface Tombstone {
  id: string
  kind: 'student' | 'error'
  deletedAt: string
}

export interface AppData {
  version: 2
  students: Student[]
  errors: ErrorEntry[]
  tombstones: Tombstone[]
}

export const LEVELS: Level[] = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export const emptyData = (): AppData => ({ version: 2, students: [], errors: [], tombstones: [] })
