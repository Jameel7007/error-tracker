import { newId } from './storage'
import type { AppData, ErrorEntry, Level, Student } from './types'

export type Action =
  | { type: 'addStudent'; name: string; level: Level }
  | { type: 'updateStudent'; id: string; name?: string; level?: Level }
  | { type: 'removeStudent'; id: string }
  | { type: 'addError'; entry: Omit<ErrorEntry, 'id' | 'createdAt'> }
  | { type: 'updateError'; id: string; patch: Partial<Omit<ErrorEntry, 'id' | 'createdAt' | 'studentId'>> }
  | { type: 'removeError'; id: string }
  | { type: 'replaceAll'; data: AppData }

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'addStudent': {
      const name = action.name.trim()
      if (!name) return state
      const student: Student = { id: newId(), name, level: action.level, createdAt: new Date().toISOString() }
      return { ...state, students: [...state.students, student] }
    }
    case 'updateStudent':
      return {
        ...state,
        students: state.students.map((s) =>
          s.id === action.id
            ? { ...s, name: action.name?.trim() || s.name, level: action.level ?? s.level }
            : s,
        ),
      }
    case 'removeStudent':
      return {
        ...state,
        students: state.students.filter((s) => s.id !== action.id),
        errors: state.errors.filter((e) => e.studentId !== action.id),
      }
    case 'addError': {
      const { original, correction, tag } = action.entry
      if (!original.trim() || !correction.trim() || !tag.trim()) return state
      if (!state.students.some((s) => s.id === action.entry.studentId)) return state
      const entry: ErrorEntry = {
        ...action.entry,
        original: original.trim(),
        correction: correction.trim(),
        tag: tag.trim(),
        id: newId(),
        createdAt: new Date().toISOString(),
      }
      return { ...state, errors: [...state.errors, entry] }
    }
    case 'updateError':
      return {
        ...state,
        errors: state.errors.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)),
      }
    case 'removeError':
      return { ...state, errors: state.errors.filter((e) => e.id !== action.id) }
    case 'replaceAll':
      return action.data
  }
}
