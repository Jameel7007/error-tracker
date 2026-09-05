import { rankTags } from '../lib/insights'
import type { ErrorEntry } from '../lib/types'

interface Props {
  errors: ErrorEntry[]
  studentName: string
  activeTag: string | null
  onPickTag: (tag: string | null) => void
}

const TREND_LABEL = { persistent: 'Persistent', improving: 'Improving', new: 'New' } as const

export function Insights({ errors, studentName, activeTag, onPickTag }: Props) {
  const ranked = rankTags(errors)
  const lessons = new Set(errors.map((e) => e.date)).size
  const max = ranked[0]?.count ?? 1
  const persistent = ranked.filter((r) => r.trend === 'persistent').length

  return (
    <aside className="panel insights" aria-label="Insights">
      <div className="panel-head">
        <h2>{studentName}'s patterns</h2>
      </div>
      <div className="panel-body">
        <div className="stat-row">
          <div className="stat">
            <div className="n">{errors.length}</div>
            <div className="l">errors logged</div>
          </div>
          <div className="stat">
            <div className="n">{lessons}</div>
            <div className="l">lessons</div>
          </div>
          <div className="stat">
            <div className="n">{ranked.length}</div>
            <div className="l">distinct tags</div>
          </div>
          <div className="stat">
            <div className="n">{persistent}</div>
            <div className="l">still recurring</div>
          </div>
        </div>
        {ranked.length === 0 ? (
          <p className="hint">Once you log a few errors, the most frequent tags will rank here with a trend for each.</p>
        ) : (
          <ol className="rank">
            {ranked.map((r) => (
              <li key={r.tag}>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 6px', color: 'inherit' }}
                  onClick={() => onPickTag(activeTag === r.tag ? null : r.tag)}
                  aria-pressed={activeTag === r.tag}
                  title="Filter the log by this tag"
                >
                  <div className="tagname">{r.tag}</div>
                  <div className="sub">
                    {r.count} {r.count === 1 ? 'time' : 'times'} across {r.lessons} {r.lessons === 1 ? 'lesson' : 'lessons'}
                  </div>
                  <div className="bar-wrap" aria-hidden="true">
                    <div className="bar" style={{ width: `${(r.count / max) * 100}%` }} />
                  </div>
                </button>
                <span className={`trend ${r.trend}`}>{TREND_LABEL[r.trend]}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="hint" style={{ marginTop: 14 }}>
          <b>Persistent</b> = seen in one of the last three lessons. <b>Improving</b> = seen before, but not recently. <b>New</b> = seen once.
        </p>
      </div>
    </aside>
  )
}
