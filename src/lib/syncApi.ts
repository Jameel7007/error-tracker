import type { SyncRequest, SyncResponse } from './sync'

/** Thin fetch wrapper for the sync server. This is the app's only network boundary. */

export interface Session {
  token: string
  email: string
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
  /** True when the request never reached the server */
  get offline(): boolean {
    return this.status === 0
  }
}

export function syncServerUrl(): string | null {
  const url = import.meta.env.VITE_SYNC_URL?.trim()
  return url ? url.replace(/\/+$/, '') : null
}

async function request<T>(path: string, init: { method: 'GET' | 'POST' | 'DELETE'; token?: string; body?: unknown }): Promise<T> {
  const base = syncServerUrl()
  if (!base) throw new ApiError(0, 'Sync is not configured')
  const headers: Record<string, string> = {}
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  if (init.token) headers.authorization = `Bearer ${init.token}`
  let res: Response
  try {
    res = await fetch(`${base}${path}`, { method: init.method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) })
  } catch {
    throw new ApiError(0, 'Could not reach the sync server')
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    throw new ApiError(res.status, 'Unexpected reply from the sync server')
  }
  if (!res.ok) {
    const message = typeof json === 'object' && json !== null && 'error' in json && typeof json.error === 'string' ? json.error : `Server error ${res.status}`
    throw new ApiError(res.status, message)
  }
  return json as T
}

export const api = {
  register: (email: string, password: string) => request<Session>('/auth/register', { method: 'POST', body: { email, password } }),
  login: (email: string, password: string) => request<Session>('/auth/login', { method: 'POST', body: { email, password } }),
  logout: (token: string) => request<void>('/auth/session', { method: 'DELETE', token }),
  deleteAccount: (token: string) => request<void>('/auth/account', { method: 'DELETE', token }),
  sync: (token: string, body: SyncRequest) => request<SyncResponse & { applied: number }>('/sync', { method: 'POST', token, body }),
}
