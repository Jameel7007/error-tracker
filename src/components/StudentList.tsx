import { useState, type FormEvent } from 'react'
import { LEVELS, type Level, type Student } from '../lib/types'

interface Props {
  students: Student[]
  counts: Record<string, number>
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: (name: string, level: Level) => void
}

export function StudentList({ students, counts, selectedId, onSelect, onAdd }: Props) {
  const [name, setName] = useState('')
  const [level, setLevel] = useState<Level>('B1')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onAdd(name, level)
    setName('')
  }

  return (
    <aside className="panel" aria-label="Students">
      <div className="panel-head">
        <h2>Students</h2>
        <span className="chip">{students.length}</span>
      </div>
      {students.length === 0 ? (
        <div className="empty">
          <strong>No students yet</strong>
          Add your first one below.
        </div>
      ) : (
        <ul className="student-list">
          {students.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={`student-row${s.id === selectedId ? ' active' : ''}`}
                onClick={() => onSelect(s.id)}
                aria-current={s.id === selectedId ? 'true' : undefined}
              >
                <span className="name">{s.name}</span>
                <span className="meta">
                  <span className="chip">{s.level}</span>
                  <span aria-label={`${counts[s.id] ?? 0} errors logged`}>{counts[s.id] ?? 0}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="add-student" onSubmit={submit}>
        <label htmlFor="new-student" className="sr-only">
          New student name
        </label>
        <input
          id="new-student"
          type="text"
          placeholder="Add student"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
        <label htmlFor="new-level" className="sr-only">
          Level
        </label>
        <select id="new-level" value={level} onChange={(e) => setLevel(e.target.value as Level)} style={{ width: 'auto' }}>
          {LEVELS.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <button type="submit" className="btn small" aria-label="Add student">
          +
        </button>
      </form>
    </aside>
  )
}
