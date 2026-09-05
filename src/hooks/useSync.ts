import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from 'react'
import type { Action } from '../lib/reducer'
import { applyChanges, changesSince } from '../lib/sync'
import { api, ApiError, syncServerUrl } from '../lib/syncApi'
import { emptyData, type AppData } from '../lib/types'

export const SYNC_KEY = 'lesson-error-tracker:sync'

/** What survives a reload: who is signed in and how far this device has synced. */
interface Persisted {
  token: string
  email: string
  /** Server sequence number already seen by this device */
  cursor: number
  /** Local time of the last successful push; records changed after it are still pending */
  lastPushedAt: string | null
}

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

const DEBOUNCE_MS = 1500
const POLL_MS = 60_000

function loadPersisted(): Persisted | null {
  try {
    const raw = localStorage.getItem(SYNC_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<Persisted>
    if (typeof p.token !== 'string' || typeof p.email !== 'string') return null
    return { token: p.token, email: p.email, cursor: typeof p.cursor === 'number' ? p.cursor : 0, lastPushedAt: typeof p.lastPushedAt === 'string' ? p.lastPushedAt : null }
  } catch {
    return null
  }
}

function savePersisted(p: Persisted | null): void {
  try {
    if (p) localStorage.setItem(SYNC_KEY, JSON.stringify(p))
    else localStorage.removeItem(SYNC_KEY)
  } catch {
    // storage unavailable; the session lives in memory for this tab
  }
}

/**
 * Keeps local data in step with the sync server when someone is signed in.
 * Local-first: every change is saved in the browser immediately and pushed
 * shortly after; nothing waits on the network. Pulls happen with each push,
 * on a timer, when the tab regains focus, and when the browser comes back
 * online.
 */
export function useSync(data: AppData, dispatch: Dispatch<Action>) {
  const enabled = syncServerUrl() !== null
  const [session, setSession] = useState<Persisted | null>(() => (enabled ? loadPersisted() : null))
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  // Refs so an in-flight sync always works against the latest state, not the render it started in
  const dataRef = useRef(data)
  const sessionRef = useRef(session)
  useEffect(() => {
    dataRef.current = data
  }, [data])
  useEffect(() => {
    sessionRef.current = session
  }, [session])
  const inFlight = useRef(false)
  const queued = useRef(false)

  const setSessionEverywhere = (next: Persisted | null) => {
    sessionRef.current = next
    savePersisted(next)
    setSession(next)
  }

  const runSync = useCallback(async (): Promise<void> => {
    const s = sessionRef.current
    if (!s) return
    if (inFlight.current) {
      queued.current = true
      return
    }
    inFlight.current = true
    setStatus('syncing')
    const startedAt = new Date().toISOString()
    try {
      const res = await api.sync(s.token, { cursor: s.cursor, changes: changesSince(dataRef.current, s.lastPushedAt) })
      const current = dataRef.current
      const merged = applyChanges(current, res.changes)
      if (JSON.stringify(merged) !== JSON.stringify(current)) {
        dataRef.current = merged
        dispatch({ type: 'replaceAll', data: merged })
      }
      // The session may have been cleared by a sign-out while we were waiting
      if (sessionRef.current?.token === s.token) setSessionEverywhere({ ...s, cursor: res.cursor, lastPushedAt: startedAt })
      setLastSyncedAt(startedAt)
      setError(null)
      setStatus('idle')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setSessionEverywhere(null)
        setError('Your session expired. Sign in again to keep syncing.')
        setStatus('idle')
      } else if (err instanceof ApiError && err.offline) {
        setStatus('offline')
      } else {
        setError(err instanceof Error ? err.message : 'Sync failed')
        setStatus('error')
      }
    } finally {
      inFlight.current = false
      if (queued.current) {
        queued.current = false
        void runSync()
      }
    }
  }, [dispatch])

  // Push shortly after any change, and pull whatever came in meanwhile
  useEffect(() => {
    if (!session?.token) return
    const t = setTimeout(() => void runSync(), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [data, session?.token, runSync])

  // Pick up other devices' changes even when this one is quiet
  useEffect(() => {
    if (!session?.token) return
    const timer = setInterval(() => void runSync(), POLL_MS)
    const onOnline = () => void runSync()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runSync()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [session?.token, runSync])

  const pendingCount = useMemo(() => (session ? changesSince(data, session.lastPushedAt).length : 0), [data, session])

  /**
   * Sign in or create an account, then do a first sync. On sign-in to an
   * existing account with data already on this device, the caller decides
   * whether to merge it in or replace it with the account's copy.
   */
  const start = async (mode: 'login' | 'register', email: string, password: string, keepLocal: boolean): Promise<void> => {
    const res = mode === 'login' ? await api.login(email, password) : await api.register(email, password)
    if (!keepLocal) {
      dataRef.current = emptyData()
      dispatch({ type: 'replaceAll', data: emptyData() })
    }
    setError(null)
    setSessionEverywhere({ token: res.token, email: res.email, cursor: 0, lastPushedAt: keepLocal ? null : new Date().toISOString() })
    await runSync()
  }

  const signOut = async (): Promise<void> => {
    const s = sessionRef.current
    setSessionEverywhere(null)
    setError(null)
    setStatus('idle')
    if (s) await api.logout(s.token).catch(() => undefined)
  }

  const deleteAccount = async (): Promise<void> => {
    const s = sessionRef.current
    if (!s) return
    await api.deleteAccount(s.token)
    setSessionEverywhere(null)
    setStatus('idle')
  }

  return {
    enabled,
    email: session?.email ?? null,
    status,
    error,
    lastSyncedAt,
    pendingCount,
    start,
    signOut,
    deleteAccount,
    syncNow: runSync,
  }
}

export type SyncState = ReturnType<typeof useSync>
