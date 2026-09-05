import { useEffect, useReducer } from 'react'
import { reducer } from '../lib/reducer'
import { loadData, saveData, STORAGE_KEY } from '../lib/storage'
import type { AppData } from '../lib/types'

/** App state backed by localStorage, synced across tabs. */
export function useAppData(initial?: () => AppData) {
  const [data, dispatch] = useReducer(reducer, undefined, () => {
    const stored = loadData()
    if (stored.students.length === 0 && initial) return initial()
    return stored
  })

  useEffect(() => {
    saveData(data)
  }, [data])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) dispatch({ type: 'replaceAll', data: loadData() })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return [data, dispatch] as const
}
