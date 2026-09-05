import { useState, type FormEvent } from 'react'
import type { SyncState } from '../hooks/useSync'

interface Props {
  sync: SyncState
  /** Students and errors currently on this device, for the merge-or-replace question */
  localCounts: { students: number; errors: number }
  onNotify: (message: string) => void
}

function statusLine(sync: SyncState): string {
  if (sync.status === 'syncing') return 'Syncing…'
  if (sync.status === 'offline') return sync.pendingCount > 0 ? `Offline · ${sync.pendingCount} change${sync.pendingCount === 1 ? '' : 's'} waiting` : 'Offline · will retry'
  if (sync.status === 'error') return sync.error ?? 'Sync failed'
  if (sync.pendingCount > 0) return `${sync.pendingCount} change${sync.pendingCount === 1 ? '' : 's'} to sync`
  if (sync.lastSyncedAt) {
    const ageMs = Date.now() - new Date(sync.lastSyncedAt).getTime()
    return ageMs < 60_000 ? 'Synced just now' : `Synced at ${new Date(sync.lastSyncedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
  }
  return 'Synced'
}

export function SyncPanel({ sync, localCounts, onNotify }: Props) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const submit = async (mode: 'login' | 'register', e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setFormError(null)
    let keepLocal = true
    const hasLocal = localCounts.students > 0
    if (mode === 'login' && hasLocal) {
      keepLocal = confirm(
        `This device has ${localCounts.students} students and ${localCounts.errors} errors. Merge them into your account?\n\nOK merges them. Cancel replaces them with what is already in your account.`,
      )
    }
    setBusy(true)
    try {
      await sync.start(mode, email, password, keepLocal)
      setPassword('')
      setOpen(false)
      onNotify(mode === 'register' ? 'Account created. This device now syncs.' : 'Signed in. Syncing this device.')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    await sync.signOut()
    setOpen(false)
    onNotify('Signed out. Your data stays on this device.')
  }

  const deleteAccount = async () => {
    if (!confirm('Delete your sync account and every record stored on the server? The data on this device is kept.')) return
    try {
      await sync.deleteAccount()
      setOpen(false)
      onNotify('Account deleted. This device is now local-only.')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not delete the account')
    }
  }

  if (!sync.enabled) return null

  return (
    <div className="sync">
      <button type="button" className={`btn sync-toggle ${sync.status}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="sync-panel">
        <span className="sync-dot" aria-hidden="true" />
        {sync.email ? statusLine(sync) : 'Sign in to sync'}
      </button>
      {open && (
        <div id="sync-panel" className="panel sync-panel" role="dialog" aria-label="Sync">
          {sync.email ? (
            <>
              <div className="sync-row">
                <strong>{sync.email}</strong>
                <span className="hint">{statusLine(sync)}</span>
              </div>
              <p className="hint">Changes save on this device first and sync a moment later. Other devices signed in to this account pick them up within a minute.</p>
              {sync.error && <p className="form-error">{sync.error}</p>}
              {formError && <p className="form-error">{formError}</p>}
              <div className="sync-actions">
                <button type="button" className="btn small" onClick={() => void sync.syncNow()} disabled={sync.status === 'syncing'}>
                  Sync now
                </button>
                <button type="button" className="btn small ghost" onClick={() => void signOut()}>
                  Sign out
                </button>
                <button type="button" className="btn small ghost danger" onClick={() => void deleteAccount()}>
                  Delete account
                </button>
              </div>
            </>
          ) : (
            <form className="sync-form" onSubmit={(e) => void submit('login', e)}>
              <p className="hint">Sign in to keep the same students and errors on every device. Without an account the app keeps working on this device only.</p>
              <div className="field">
                <label htmlFor="sync-email">Email</label>
                <input id="sync-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="sync-password">Password</label>
                <input id="sync-password" type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {(formError ?? sync.error) && <p className="form-error">{formError ?? sync.error}</p>}
              <div className="sync-actions">
                <button type="submit" className="btn small primary" disabled={busy}>
                  Sign in
                </button>
                <button type="button" className="btn small" disabled={busy} onClick={(e) => void submit('register', e)}>
                  Create account
                </button>
                <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
