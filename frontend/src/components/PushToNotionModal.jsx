import React, { useEffect, useState } from 'react'
import { listNotionDatabasesApi, pushToNotionApi } from '../api.js'
import { useToast } from './Toast.jsx'
import { Card } from './primitives.jsx'
import { track } from '../lib/analytics.js'

/* M6.5 — Push extraction stories to a Notion database.
 *
 * Same three-state flow as the other push modals (error → picker →
 * result). Notion-specific UX: an empty database list is the most
 * common "this isn't working" symptom — usually because the user
 * forgot to share their database with the integration in Notion's
 * "..." menu. The empty state surfaces a doc link explaining this.
 *
 * Picker carries `(database_id, title_prop)` together — the title
 * column name is discovered server-side from the database schema and
 * forwarded back unchanged on push, so the backend doesn't have to
 * re-fetch the schema (saves a Notion API call per push).
 */

export default function PushToNotionModal({ extraction, onClose }) {
  const { toast } = useToast()
  const [databases, setDatabases] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [selectedId, setSelectedId] = useState('')
  const [pushing, setPushing] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    let alive = true
    listNotionDatabasesApi()
      .then((rows) => {
        if (!alive) return
        setDatabases(rows)
        if (rows.length > 0) setSelectedId(rows[0].id)
      })
      .catch((err) => {
        if (!alive) return
        setLoadError({ detail: err.message, status: err.status })
      })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !pushing) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, pushing])

  const selected = databases?.find((d) => d.id === selectedId)

  const doPush = async () => {
    if (!selected || pushing) return
    setPushing(true)
    track('push_to_notion_started', { database_id: selected.id })
    try {
      const r = await pushToNotionApi(extraction.id, {
        database_id: selected.id,
        title_prop: selected.title_prop,
      })
      setResult(r)
      track('push_to_notion_finished', {
        pushed: r.pushed.length,
        failed: r.failed.length,
      })
    } catch (err) {
      toast.error(err.message || 'Push failed')
    } finally {
      setPushing(false)
    }
  }

  const storyCount = extraction.stories?.length || 0

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !pushing) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'grid', placeItems: 'center', zIndex: 100, padding: 24,
      }}
    >
      <Card padding={24} style={{ width: 500, maxWidth: '100%', boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600,
          color: 'var(--text-strong)', margin: '0 0 14px',
        }}>
          Push to Notion
        </h2>

        {result ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 12 }}>
              Pushed {result.pushed.length} of {storyCount} stories
              {selected ? ` to ${selected.title}` : ''}.
              {result.failed.length > 0 && (
                <span style={{ color: 'var(--danger-ink)' }}>
                  {' '}{result.failed.length} failed.
                </span>
              )}
            </div>
            {result.pushed.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <SectionLabel>Created</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {result.pushed.map((p) => (
                    <a
                      key={p.story_id}
                      href={p.issue_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 12.5, fontFamily: 'var(--font-mono)',
                        color: 'var(--accent-strong)', textDecoration: 'none',
                      }}
                    >
                      {p.story_id} → Notion ↗
                    </a>
                  ))}
                </div>
              </div>
            )}
            {result.failed.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <SectionLabel>Failed</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {result.failed.map((f, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{f.story_id}</span>
                      {' — '}
                      <span style={{ color: 'var(--danger-ink)' }}>{f.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={onClose} style={primaryBtn}>Done</button>
            </div>
          </>
        ) : loadError ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: '0 0 12px', lineHeight: 1.55 }}>
              {loadError.status === 400
                ? 'No Notion connection saved yet.'
                : loadError.status === 401
                  ? 'Notion token rejected — re-enter it in Settings.'
                  : `Could not reach Notion: ${loadError.detail}`}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={onClose} style={ghostBtn}>Close</button>
              <a href="/settings" style={{ ...primaryBtn, textDecoration: 'none', display: 'inline-block' }}>
                Open Settings
              </a>
            </div>
          </>
        ) : databases === null ? (
          <div style={{ padding: '20px 0', color: 'var(--text-soft)', fontSize: 13, textAlign: 'center' }}>
            Loading databases…
          </div>
        ) : databases.length === 0 ? (
          /* Empty state — most common Notion gotcha. */
          <>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: '0 0 8px', lineHeight: 1.55 }}>
              No databases visible to your integration.
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.55 }}>
              In Notion, open the database you want to push to → click the
              <strong> "..." </strong> menu → <strong>Add connections</strong> →
              pick your StoryForge integration.{' '}
              <a
                href="https://www.notion.so/help/add-and-manage-connections-with-the-api"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent-strong)' }}
              >
                Notion docs →
              </a>
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={ghostBtn}>Close</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.55 }}>
              {storyCount} stor{storyCount === 1 ? 'y' : 'ies'} will be created in the chosen database.
              Title goes in the database's title column; the rest renders as page body blocks.
            </p>
            <SectionLabel>Database</SectionLabel>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={pushing}
              style={{ ...inputStyle, marginBottom: 14 }}
            >
              {databases.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} (title column: {d.title_prop})
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={onClose} disabled={pushing} style={ghostBtn}>Cancel</button>
              <button type="button" onClick={doPush} disabled={pushing || !selected} style={primaryBtn}>
                {pushing ? 'Pushing…' : `Push ${storyCount} stor${storyCount === 1 ? 'y' : 'ies'}`}
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
      color: 'var(--text-soft)', marginBottom: 4,
    }}>
      {children}
    </div>
  )
}

const primaryBtn = {
  background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)',
  color: 'white', cursor: 'pointer', fontSize: 12.5, fontWeight: 500,
  fontFamily: 'inherit', padding: '8px 14px',
}
const ghostBtn = {
  background: 'transparent', border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text)', cursor: 'pointer',
  fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit', padding: '7px 14px',
}
const inputStyle = {
  width: '100%', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)',
  padding: '8px 10px', fontFamily: 'inherit', fontSize: 13,
  background: 'var(--bg)', color: 'inherit', outline: 'none',
}
