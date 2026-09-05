import { useEffect, useMemo, useRef, useState } from 'react'
import { ErrorForm } from './components/ErrorForm'
import { ErrorLog } from './components/ErrorLog'
import { Insights } from './components/Insights'
import { StudentList } from './components/StudentList'
import { useAppData } from './hooks/useAppData'
import { normaliseTag, suggestTags } from './lib/insights'
import { seedData } from './lib/seed'
import { exportJson, importJson, InvalidDataError } from './lib/storage'
import { emptyData, LEVELS, type Level } from './lib/types'

export default function App() {
  const [data, dispatch] = useAppData(seedData)
  const [requestedId, setSelectedId] = useState<string | null>(null)
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  // Derive the selection so it stays valid after import or delete without an effect
  const selected = data.students.find((s) => s.id === requestedId) ?? data.students[0] ?? null
  const selectedId = selected?.id ?? null
  const studentErrors = useMemo(() => data.errors.filter((e) => e.studentId === selectedId), [data.errors, selectedId])
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of data.errors) c[e.studentId] = (c[e.studentId] ?? 0) + 1
    return c
  }, [data.errors])
  const tagSuggestions = useMemo(() => suggestTags(data.errors), [data.errors])

  const download = () => {
    const blob = new Blob([exportJson(data)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `error-tracker-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setToast('Exported JSON')
  }

  const onImportFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const imported = importJson(await file.text())
      if ((data.students.length > 0 || data.errors.length > 0) && !confirm(`Replace ${data.students.length} students and ${data.errors.length} errors with the imported file?`)) return
      dispatch({ type: 'replaceAll', data: imported })
      setFilterTag(null)
      setToast(`Imported ${imported.students.length} students, ${imported.errors.length} errors`)
    } catch (err) {
      setToast(err instanceof InvalidDataError ? `Import failed: ${err.message}` : 'Import failed')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const clearAll = () => {
    if (!confirm('Delete all students and errors? Export first if you want a backup.')) return
    dispatch({ type: 'replaceAll', data: emptyData() })
    setFilterTag(null)
  }

  const removeStudent = () => {
    if (!selected) return
    if (!confirm(`Remove ${selected.name} and their ${counts[selected.id] ?? 0} logged errors?`)) return
    dispatch({ type: 'removeStudent', id: selected.id })
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Lesson Error Tracker</h1>
          <span>for language tutors</span>
        </div>
        <div className="topbar-actions">
          <button type="button" className="btn" onClick={download}>
            Export JSON
          </button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            Import JSON
          </button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => onImportFile(e.target.files?.[0])} aria-label="Import JSON file" />
          {data.students.length === 0 && (
            <button type="button" className="btn" onClick={() => dispatch({ type: 'replaceAll', data: seedData() })}>
              Load demo data
            </button>
          )}
          <button type="button" className="btn ghost danger" onClick={clearAll}>
            Clear all
          </button>
        </div>
      </header>

      <main className="layout">
        <StudentList
          students={data.students}
          counts={counts}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id)
            setFilterTag(null)
          }}
          onAdd={(name, level) => dispatch({ type: 'addStudent', name, level })}
        />

        <div>
          {selected ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 20 }}>{selected.name}</strong>
                  <label htmlFor="level" className="sr-only">
                    Level
                  </label>
                  <select
                    id="level"
                    value={selected.level}
                    onChange={(e) => dispatch({ type: 'updateStudent', id: selected.id, level: e.target.value as Level })}
                    style={{ width: 'auto', padding: '3px 6px' }}
                  >
                    {LEVELS.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <button type="button" className="btn small ghost danger" onClick={removeStudent}>
                  Remove student
                </button>
              </div>
              <ErrorForm
                studentName={selected.name}
                tagSuggestions={tagSuggestions}
                onSubmit={(entry) => {
                  dispatch({ type: 'addError', entry: { ...entry, studentId: selected.id } })
                  setToast('Saved')
                }}
              />
              <ErrorLog
                errors={studentErrors}
                studentName={selected.name}
                filterTag={filterTag}
                onClearFilter={() => setFilterTag(null)}
                onNotify={setToast}
                onUpdate={(id, patch) => dispatch({ type: 'updateError', id, patch })}
                onRemove={(id) => dispatch({ type: 'removeError', id })}
              />
            </>
          ) : (
            <div className="panel empty" style={{ padding: 48 }}>
              <strong>Pick or add a student</strong>
              Log the errors you hear in a lesson and see which ones keep coming back.
            </div>
          )}
        </div>

        {selected && (
          <Insights
            errors={studentErrors}
            studentName={selected.name}
            activeTag={filterTag}
            onPickTag={(t) => setFilterTag(t ? normaliseTag(t) : null)}
          />
        )}
      </main>
      <footer className="footer">Data stays in your browser. Export JSON to back it up or move it.</footer>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
