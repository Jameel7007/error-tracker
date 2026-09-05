import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SYNC_KEY } from './hooks/useSync'
import type { Change, SyncRequest } from './lib/sync'

/** A tiny fake of the sync server, just enough for the flows below. */
function fakeServer() {
  const calls: { path: string; body: unknown; auth: string | null }[] = []
  let remote: Change[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    const headers = new Headers(init?.headers)
    calls.push({ path: url.pathname, body, auth: headers.get('authorization') })
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
    if (url.pathname === '/auth/register') return json(201, { token: 'tok-1', email: body.email })
    if (url.pathname === '/auth/login') return body.password === 'right password' ? json(200, { token: 'tok-1', email: body.email }) : json(401, { error: 'Email or password is incorrect' })
    if (url.pathname === '/auth/session') return new Response(null, { status: 204 })
    if (url.pathname === '/sync') {
      if (headers.get('authorization') !== 'Bearer tok-1') return json(401, { error: 'Sign in required' })
      const req = body as SyncRequest
      const out = remote
      remote = []
      return json(200, { cursor: 7, changes: out, applied: req.changes.length })
    }
    return json(404, { error: 'Not found' })
  })
  return { fetchMock, calls, setRemote: (c: Change[]) => (remote = c) }
}

const remoteStudent: Change = {
  kind: 'student',
  id: 's-remote',
  at: '2026-02-01T10:00:00.000Z',
  deleted: false,
  body: { id: 's-remote', name: 'From Tablet', level: 'C1', createdAt: '2026-02-01T10:00:00.000Z', updatedAt: '2026-02-01T10:00:00.000Z' },
}

describe('sync', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubEnv('VITE_SYNC_URL', 'http://sync.test/')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('hides the sync UI when no server is configured', () => {
    vi.stubEnv('VITE_SYNC_URL', '')
    render(<App />)
    expect(screen.queryByRole('button', { name: /Sign in to sync/ })).not.toBeInTheDocument()
  })

  it('creates an account, pushes the local data, and merges what the server returns', async () => {
    const server = fakeServer()
    server.setRemote([remoteStudent])
    vi.stubGlobal('fetch', server.fetchMock)
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Sign in to sync/ }))
    const dialog = screen.getByRole('dialog', { name: 'Sync' })
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'tutor@example.com' } })
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'right password' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(server.calls.some((c) => c.path === '/sync')).toBe(true))
    const push = server.calls.find((c) => c.path === '/sync')!
    expect(push.auth).toBe('Bearer tok-1')
    const req = push.body as SyncRequest
    expect(req.cursor).toBe(0)
    expect(req.changes.filter((c) => c.kind === 'student')).toHaveLength(3) // the demo students went up
    expect(req.changes.every((c) => !c.deleted)).toBe(true)

    // The student that only existed on the server is now in the list, and the session survives a reload
    expect(await screen.findByRole('button', { name: /From Tablet/ })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(SYNC_KEY)!)).toMatchObject({ email: 'tutor@example.com', cursor: 7 })
    expect(screen.getByText(/Saved in this browser and synced to tutor@example.com/)).toBeInTheDocument()
  })

  it('shows the server message when sign-in fails and stays signed out', async () => {
    const server = fakeServer()
    vi.stubGlobal('fetch', server.fetchMock)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Sign in to sync/ }))
    const dialog = screen.getByRole('dialog', { name: 'Sync' })
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'tutor@example.com' } })
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'wrong password' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign in' }))
    expect(await within(dialog).findByText('Email or password is incorrect')).toBeInTheDocument()
    expect(localStorage.getItem(SYNC_KEY)).toBeNull()
  })

  it('signing out keeps the data on the device', async () => {
    const server = fakeServer()
    vi.stubGlobal('fetch', server.fetchMock)
    localStorage.setItem(SYNC_KEY, JSON.stringify({ token: 'tok-1', email: 'tutor@example.com', cursor: 7, lastPushedAt: null }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Synced|change|Syncing/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(server.calls.some((c) => c.path === '/auth/session')).toBe(true))
    expect(await screen.findByRole('button', { name: /Sign in to sync/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Luana/ })).toBeInTheDocument()
    expect(localStorage.getItem(SYNC_KEY)).toBeNull()
  })
})
