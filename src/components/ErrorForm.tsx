import { useEffect, useRef, useState, type FormEvent } from 'react'
import { today } from '../lib/storage'

interface Props {
  studentName: string
  tagSuggestions: string[]
  onSubmit: (entry: { original: string; correction: string; tag: string; date: string }) => void
}

export function ErrorForm({ studentName, tagSuggestions, onSubmit }: Props) {
  const [original, setOriginal] = useState('')
  const [correction, setCorrection] = useState('')
  const [tag, setTag] = useState('')
  const [date, setDate] = useState(today)
  const firstField = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    firstField.current?.focus()
  }, [studentName])

  const valid = original.trim() && correction.trim() && tag.trim() && date

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    onSubmit({ original, correction, tag, date })
    setOriginal('')
    setCorrection('')
    // keep tag and date: errors in one lesson often share a tag
    firstField.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      submit(e)
    }
  }

  return (
    <form className="panel" onSubmit={submit} onKeyDown={onKeyDown} aria-label={`Log an error for ${studentName}`}>
      <div className="panel-head">
        <h2>Log an error for {studentName}</h2>
      </div>
      <div className="panel-body">
        <div className="form-grid">
          <div className="field wide">
            <label htmlFor="original">What they said</label>
            <textarea
              id="original"
              ref={firstField}
              rows={1}
              value={original}
              onChange={(e) => setOriginal(e.target.value)}
              placeholder="I have 25 years."
            />
          </div>
          <div className="field wide">
            <label htmlFor="correction">Correction</label>
            <textarea
              id="correction"
              rows={1}
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              placeholder="I am 25 years old."
            />
          </div>
          <div className="field">
            <label htmlFor="tag">Tag</label>
            <input
              id="tag"
              type="text"
              list="tag-suggestions"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="age with have"
              autoComplete="off"
            />
            <datalist id="tag-suggestions">
              {tagSuggestions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="date">Lesson date</label>
            <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="form-actions">
          <span className="hint">Tag and date stay filled for the next entry. Ctrl/Cmd + Enter to save.</span>
          <button type="submit" className="btn primary" disabled={!valid}>
            Save error
          </button>
        </div>
      </div>
    </form>
  )
}
