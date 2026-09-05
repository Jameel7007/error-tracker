import { newId } from './storage'
import type { AppData, ErrorEntry, Level, Student, Tombstone } from './types'

export type Action =
  | { type: 'addStudent'; name: string; level: Level }
  | { type: 'updateStudent'; id: string; name?: string; level?: Level }
  | { type: 'removeStudent'; id: string }
  | { type: 'addError'; entry: Omit<ErrorEntry, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'updateError'; id: string; patch: Partial<Omit<ErrorEntry, 'id' | 'createdAt' | 'updatedAt' | 'studentId'>> }
  | { type: 'removeError'; id: string }
  | { type: 'replaceAll'; data: AppData }

const now = () => new Date().toISOString()

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'addStudent': {
      const name = action.name.trim()
      if (!name) return state
      const at = now()
      const student: Student = { id: newId(), name, level: action.level, createdAt: at, updatedAt: at }
      return { ...state, students: [...state.students, student] }
    }
    case 'updateStudent':
      return {
        ...state,
        students: state.students.map((s) =>
          s.id === action.id
            ? { ...s, name: action.name?.trim() || s.name, level: action.level ?? s.level, updatedAt: now() }
            : s,
        ),
      }
    case 'removeStudent': {
      if (!state.students.some((s) => s.id === action.id)) return state
      const at = now()
      const gone: Tombstone[] = [
        { id: action.id, kind: 'student', deletedAt: at },
        ...state.errors.filter((e) => e.studentId === action.id).map((e): Tombstone => ({ id: e.id, kind: 'error', deletedAt: at })),
      ]
      return {
        ...state,
        students: state.students.filter((s) => s.id !== action.id),
        errors: state.errors.filter((e) => e.studentId !== action.id),
        tombstones: [...state.tombstones, ...gone],
      }
    }
    case 'addError': {
      const { original, correction, tag } = action.entry
      if (!original.trim() || !correction.trim() || !tag.trim()) return state
      if (!state.students.some((s) => s.id === action.entry.studentId)) return state
      const at = now()
      const entry: ErrorEntry = {
        ...action.entry,
        original: original.trim(),
        correction: correction.trim(),
        tag: tag.trim(),
        id: newId(),
        createdAt: at,
        updatedAt: at,
      }
      return { ...state, errors: [...state.errors, entry] }
    }
    case 'updateError':
      return {
        ...state,
        errors: state.errors.map((e) => (e.id === action.id ? { ...e, ...action.patch, updatedAt: now() } : e)),
      }
    case 'removeError': {
      if (!state.errors.some((e) => e.id === action.id)) return state
      return {
        ...state,
        errors: state.errors.filter((e) => e.id !== action.id),
        tombstones: [...state.tombstones, { id: action.id, kind: 'error', deletedAt: now() }],
      }
    }
    case 'replaceAll':
      return action.data
  }
}
