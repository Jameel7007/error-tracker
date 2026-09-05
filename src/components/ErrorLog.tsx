import { useEffect, useRef, useState } from 'react'
import { groupByDate, normaliseTag } from '../lib/insights'
import { lessonSummary } from '../lib/summary'
import type { ErrorEntry } from '../lib/types'

interface Props {
  /** The student's full history; tag filtering happens inside */
  errors: ErrorEntry[]
  studentName: string
  filterTag: string | null
  onNotify: (message: string) => void
  onClearFilter: () => void
  onUpdate: (id: string, patch: Partial<Pick<ErrorEntry, 'original' | 'correction' | 'tag' | 'date'>>) => void
  onRemove: (id: string) => void
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function ErrorLog({ errors, studentName, filterTag, onClearFilter, onNotify, onUpdate, onRemove }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  // When the clipboard is blocked (some browsers, embedded views), show the text instead so it can be copied by hand
  const [fallback, setFallback] = useState<{ date: string; text: string } | null>(null)
  const visible = filterTag ? errors.filter((e) => normaliseTag(e.tag) === filterTag) : errors
  const groups = groupByDate(visible)

  // Summarise the whole lesson, not just the entries visible under the current tag filter
  const copySummary = async (date: string) => {
    const text = lessonSummary({ studentName, date, errors })
    if (await copyText(text)) {
      setFallback(null)
      onNotify('Lesson summary copied')
    } else {
      setFallback({ date, text })
      onNotify('Clipboard blocked. The notes are shown below so you can copy them.')
    }
  }

  return (
    <section className="panel log" aria-label="Error log">
      <div className="panel-head">
        <h2>
          Log <span className="chip">{visible.length}</span>
        </h2>
        {filterTag && (
          <button type="button" className="btn small ghost" onClick={onClearFilter}>
            Showing "{filterTag}" · clear
          </button>
        )}
      </div>
      {fallback && <SummaryFallback key={fallback.date} title={formatDate(fallback.date)} text={fallback.text} onClose={() => setFallback(null)} />}
      {groups.length === 0 ? (
        <div className="empty">
          <strong>Nothing logged yet</strong>
          Errors you save will appear here, grouped by lesson.
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.date}>
            <div className="log-date">
              <span>{formatDate(g.date)}</span>
              <button
                type="button"
                className="btn small ghost"
                onClick={() => copySummary(g.date)}
                aria-label={`Copy lesson summary for ${formatDate(g.date)}`}
                title="Copy plain-text notes for this lesson to paste into homework"
              >
                Copy summary
              </button>
            </div>
            {g.entries.map((e) =>
              editingId === e.id ? (
                <EditRow key={e.id} entry={e} onCancel={() => setEditingId(null)} onSave={(patch) => { onUpdate(e.id, patch); setEditingId(null) }} />
              ) : (
                <div key={e.id} className="entry">
                  <div>
                    <div className="original">{e.original}</div>
                    <div className="correction">{e.correction}</div>
                    <div className="tagline">
                      <span className="chip tag">{e.tag}</span>
                    </div>
                  </div>
                  <div className="actions">
                    <button type="button" className="btn small ghost" onClick={() => setEditingId(e.id)} aria-label={`Edit "${e.original}"`}>
                      Edit
                    </button>
                    <button type="button" className="btn small ghost danger" onClick={() => onRemove(e.id)} aria-label={`Delete "${e.original}"`}>
                      Delete
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        ))
      )}
    </section>
  )
}

function SummaryFallback({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    area.current?.focus()
    area.current?.select()
  }, [])
  return (
    <div className="summary-fallback" role="region" aria-label={`Lesson summary for ${title}`}>
      <div className="summary-fallback-head">
        <span className="hint">Your browser blocked the clipboard. The notes for {title} are selected below: press Ctrl/Cmd + C to copy.</span>
        <button type="button" className="btn small ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <textarea ref={area} readOnly rows={Math.min(12, text.split('\n').length + 1)} value={text} aria-label="Lesson summary text" />
    </div>
  )
}

/** Clipboard API first, with the legacy selection-based copy as a fallback for older or non-secure contexts. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

function EditRow({ entry, onSave, onCancel }: { entry: ErrorEntry; onSave: (p: Partial<ErrorEntry>) => void; onCancel: () => void }) {
  const [original, setOriginal] = useState(entry.original)
  const [correction, setCorrection] = useState(entry.correction)
  const [tag, setTag] = useState(entry.tag)
  const [date, setDate] = useState(entry.date)
  const valid = original.trim() && correction.trim() && tag.trim() && date
  const id = (field: string) => `edit-${field}-${entry.id}`
  return (
    <div className="entry editing">
      <div className="form-grid">
        <div className="field wide">
          <label htmlFor={id('original')}>What they said</label>
          <textarea id={id('original')} rows={1} value={original} onChange={(e) => setOriginal(e.target.value)} />
        </div>
        <div className="field wide">
          <label htmlFor={id('correction')}>Correction</label>
          <textarea id={id('correction')} rows={1} value={correction} onChange={(e) => setCorrection(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={id('tag')}>Tag</label>
          <input id={id('tag')} type="text" value={tag} onChange={(e) => setTag(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={id('date')}>Date</label>
          <input id={id('date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="actions" style={{ opacity: 1, flexDirection: 'column' }}>
        <button type="button" className="btn small primary" disabled={!valid} onClick={() => onSave({ original: original.trim(), correction: correction.trim(), tag: tag.trim(), date })}>
          Save
        </button>
        <button type="button" className="btn small ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
