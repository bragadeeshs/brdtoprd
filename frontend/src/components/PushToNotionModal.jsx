import React, { useEffect, useRef, useState } from 'react'
import {
  getNotionDatabaseSchemaApi,
  listNotionDatabasesApi,
  pushToNotionApi,
} from '../api.js'
import { useToast } from './Toast.jsx'
import { Card } from './primitives.jsx'
import { track } from '../lib/analytics.js'

/* M6.5.b — story field metadata for the property mapping picker.
 * `compatible_types` lists the Notion property types this field can be
 * routed into. Anything not in the list (formula, relation, files, etc.)
 * is filtered out of the per-field dropdown so users can't pick a target
 * the backend won't write to. */
const STORY_FIELDS = [
  { key: 'actor',        label: 'Actor',         compatible: ['rich_text', 'select'] },
  { key: 'want',         label: 'I want',        compatible: ['rich_text'] },
  { key: 'so_that',      label: 'So that',       compatible: ['rich_text'] },
  { key: 'section',      label: 'Section',       compatible: ['rich_text', 'select'] },
  { key: 'source_quote', label: 'Source quote',  compatible: ['rich_text'] },
  { key: 'criteria',     label: 'Criteria',      compatible: ['multi_select'] },
]

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
  // M6.5.b — schema for the picked database (loaded on demand) + the
  // user's per-field mapping choices.
  const [schema, setSchema] = useState(null)        // null=loading, []=empty, [...]=loaded
  const [schemaErr, setSchemaErr] = useState(null)
  const [propMap, setPropMap] = useState({})        // story_field -> {name, type} | undefined
  const schemaCache = useRef(new Map())

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

  // M6.5.b — fetch the picked database's full property list (cached).
  useEffect(() => {
    if (!selectedId) return
    setPropMap({})   // reset mappings when switching databases
    if (schemaCache.current.has(selectedId)) {
      setSchema(schemaCache.current.get(selectedId))
      setSchemaErr(null)
      return
    }
    setSchema(null); setSchemaErr(null)
    let alive = true
    getNotionDatabaseSchemaApi(selectedId)
      .then((rows) => {
        if (!alive) return
        schemaCache.current.set(selectedId, rows)
        setSchema(rows)
      })
      .catch((err) => {
        if (!alive) return
        setSchemaErr(err.message || 'Could not load database schema')
        setSchema([])
      })
    return () => { alive = false }
  }, [selectedId])

  const selected = databases?.find((d) => d.id === selectedId)

  const onMapChange = (storyField, raw) => {
    setPropMap((prev) => {
      const next = { ...prev }
      if (!raw) {
        delete next[storyField]
        return next
      }
      // raw is "name|type" — encoding the type with the name lets the
      // backend skip a schema fetch on push (we already have it).
      const sep = raw.lastIndexOf('|')
      const name = raw.slice(0, sep)
      const type = raw.slice(sep + 1)
      next[storyField] = { name, type }
      return next
    })
  }

  const doPush = async () => {
    if (!selected || pushing) return
    setPushing(true)
    track('push_to_notion_started', {
      database_id: selected.id,
      mapped_count: Object.keys(propMap).length,
    })
    try {
      const r = await pushToNotionApi(extraction.id, {
        database_id: selected.id,
        title_prop: selected.title_prop,
        property_map: propMap,
      })
      setResult(r)
      track('push_to_notion_finished', {
        pushed: r.pushed.length,
        failed: r.failed.length,
        mapped_count: Object.keys(propMap).length,
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
              style={{ ...inputStyle, marginBottom: 12 }}
            >
              {databases.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} (title column: {d.title_prop})
                </option>
              ))}
            </select>

            {/* M6.5.b — property mapping. Per-field dropdown, options
                filtered by the field's compatible Notion types. "Body
                only" is always available — that's the legacy behaviour. */}
            <SectionLabel>
              Property mapping {Object.keys(propMap).length > 0 && `(${Object.keys(propMap).length} mapped)`}
            </SectionLabel>
            {schema === null ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                Loading database columns…
              </div>
            ) : schemaErr ? (
              <div style={{ fontSize: 12, color: 'var(--danger-ink)', marginBottom: 14 }}>
                {schemaErr}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex', flexDirection: 'column', gap: 6,
                  marginBottom: 14, padding: 8,
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-subtle)',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-soft)', marginBottom: 4, lineHeight: 1.4 }}>
                  Optional. Route a story field into a Notion column. Anything you
                  don't map keeps rendering inside the page body.
                </div>
                {STORY_FIELDS.map((f) => {
                  // Only offer columns whose type matches the field's compatible list.
                  const options = (schema || []).filter(
                    (s) => f.compatible.includes(s.type) && s.type !== 'title',
                  )
                  const current = propMap[f.key]
                  const value = current ? `${current.name}|${current.type}` : ''
                  return (
                    <div
                      key={f.key}
                      style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, alignItems: 'center' }}
                    >
                      <div style={{ fontSize: 12, color: 'var(--text-strong)' }}>{f.label}</div>
                      <select
                        value={value}
                        onChange={(e) => onMapChange(f.key, e.target.value)}
                        disabled={pushing}
                        style={{ ...inputStyle, fontSize: 12, padding: '5px 8px' }}
                      >
                        <option value="">— body only —</option>
                        {options.map((o) => (
                          <option key={o.name} value={`${o.name}|${o.type}`}>
                            {o.name} · {o.type}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            )}

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
