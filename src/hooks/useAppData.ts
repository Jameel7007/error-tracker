import { useEffect, useReducer } from 'react'
import { reducer } from '../lib/reducer'
import { hasStoredData, loadData, saveData, STORAGE_KEY } from '../lib/storage'
import type { AppData } from '../lib/types'

/**
 * App state backed by localStorage, synced across tabs.
 * `initial` seeds the state only on a true first visit (nothing stored yet),
 * so clearing all data and reloading does not bring the demo data back.
 */
export function useAppData(initial?: () => AppData) {
  const [data, dispatch] = useReducer(reducer, undefined, () => {
    if (initial && !hasStoredData()) return initial()
    return loadData()
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
