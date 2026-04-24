import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { patchExtractionApi } from '../api.js'
import {
  deleteExtraction,
  getExtraction,
  insertExtraction,
  listExtractions,
} from '../lib/store.js'
import { useApp } from '../lib/AppContext.jsx'
import { useToast } from '../components/Toast.jsx'
import { Badge, Button, Card, IconTile, Spinner } from '../components/primitives.jsx'
import {
  AlertTriangle,
  Check,
  FileText,
  FolderClosed,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash,
  Users,
  X,
} from '../components/icons.jsx'

/** Format an ISO timestamp as a human-friendly relative string. */
function timeAgo(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function MetaItem({ icon, label, tone }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        color: tone === 'warn' ? 'var(--warn-ink)' : 'var(--text-muted)',
      }}
    >
      {icon}
      {label}
    </span>
  )
}

function EmptyState({ onNew }) {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 40, background: 'var(--bg)' }}>
      <Card padding={32} style={{ maxWidth: 440, textAlign: 'center' }}>
        <IconTile tone="accent" size={44} style={{ margin: '0 auto 14px' }}>
          <FileText size={20} />
        </IconTile>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20,
            fontWeight: 600,
            color: 'var(--text-strong)',
            marginBottom: 6,
          }}
        >
          No documents yet
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            marginBottom: 20,
          }}
        >
          Run your first extraction to see it listed here.
        </div>
        <Button variant="primary" icon={<Plus size={14} />} onClick={onNew}>
          New extraction
        </Button>
      </Card>
    </div>
  )
}

/** Skeleton row used while the initial list is loading. */
function SkeletonRow({ delay = 0 }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        background: 'var(--bg-elevated)',
        animation: `fade-in .25s ease-out ${delay}ms both`,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-hover)',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            height: 12,
            width: '40%',
            background: 'var(--bg-hover)',
            borderRadius: 4,
            marginBottom: 8,
          }}
        />
        <div
          style={{
            height: 10,
            width: '60%',
            background: 'var(--bg-hover)',
            borderRadius: 4,
            opacity: 0.7,
          }}
        />
      </div>
    </div>
  )
}

function ErrorState({ error, onRetry }) {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 40, background: 'var(--bg)' }}>
      <Card padding={32} style={{ maxWidth: 460, textAlign: 'center' }}>
        <IconTile tone="danger" size={44} style={{ margin: '0 auto 14px' }}>
          <AlertTriangle size={20} />
        </IconTile>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--text-strong)',
            marginBottom: 6,
          }}
        >
          Couldn't load documents
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            marginBottom: 20,
          }}
        >
          {error}
        </div>
        <Button variant="primary" icon={<RefreshCw size={13} />} onClick={onRetry}>
          Retry
        </Button>
      </Card>
    </div>
  )
}

/**
 * Move-to-project popover. Renders the menu inline (anchored to the row Card
 * via position:relative on the parent) plus a fixed-position click-catcher
 * that closes on outside click or Esc.
 */
function MoveMenu({ projects, currentProjectId, onPick, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {/* click-outside catcher */}
      <div
        onClick={(e) => { e.stopPropagation(); onClose() }}
        style={{ position: 'fixed', inset: 0, zIndex: 50 }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: '100%',
          right: 8,
          marginTop: 4,
          minWidth: 220,
          maxHeight: 280,
          overflowY: 'auto',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 51,
          padding: 4,
        }}
      >
        <div
          style={{
            padding: '6px 10px 4px',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: 'var(--text-soft)',
          }}
        >
          Move to project
        </div>
        {projects.length === 0 && (
          <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No projects yet — create one in the sidebar.
          </div>
        )}
        {projects.map((p) => {
          const isCurrent = p.id === currentProjectId
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '6px 10px',
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--text-strong)',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <FolderClosed size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </span>
              {isCurrent && <Check size={13} style={{ color: 'var(--accent-strong)', flexShrink: 0 }} />}
            </button>
          )
        })}
        {currentProjectId && (
          <>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            <button
              type="button"
              onClick={() => onPick(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '6px 10px',
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--text-muted)',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <X size={13} style={{ flexShrink: 0 }} />
              Remove from project
            </button>
          </>
        )}
      </div>
    </>
  )
}

export default function Documents() {
  const navigate = useNavigate()
  const { restoreExtraction, projects, projectById, refreshProjects } = useApp()
  const { toast } = useToast()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [menuFor, setMenuFor] = useState(null)
  const initialLoadRef = useRef(true)

  // Run a fresh fetch with the current query. Used by Retry + the undo flow.
  const refresh = async (q = query) => {
    setError(null)
    if (initialLoadRef.current) setLoading(true)
    else setSearching(true)
    try {
      const rows = await listExtractions({ q: q.trim() || undefined })
      setRecords(rows)
    } catch (e) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
      setSearching(false)
      initialLoadRef.current = false
    }
  }

  // Debounced search: re-query the backend 200 ms after the user stops typing.
  // Same effect handles initial load (query starts empty).
  useEffect(() => {
    const t = setTimeout(() => { refresh(query) }, 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // After backend filtering, `records` IS the displayed list — no client filter.
  const filtered = records

  const onOpen = (record) => {
    // App handles the async hydration AND the navigate to '/'.
    restoreExtraction(record)
  }

  const onMove = async (record, projectId) => {
    setMenuFor(null)
    const target = projectId ?? ''  // empty string clears server-side
    if ((record.project_id || null) === (projectId || null)) return
    try {
      await patchExtractionApi(record.id, { project_id: target })
      setRecords((rs) =>
        rs.map((r) => (r.id === record.id ? { ...r, project_id: projectId || null } : r)),
      )
      await refreshProjects()
      toast.success(
        projectId
          ? `Moved "${record.filename}" to ${projectById[projectId]?.name || 'project'}`
          : `Removed "${record.filename}" from project`,
      )
    } catch (err) {
      toast.error(err.message || 'Could not move document')
    }
  }

  const onDelete = async (record, e) => {
    e.stopPropagation()
    // Capture the full record BEFORE delete so undo can re-import it.
    let full
    try {
      full = await getExtraction(record.id)
    } catch (err) {
      toast.error(err.message || 'Could not fetch document for delete')
      return
    }
    try {
      await deleteExtraction(record.id)
    } catch (err) {
      toast.error(err.message || 'Delete failed')
      return
    }
    setRecords((rs) => rs.filter((r) => r.id !== record.id))
    if (record.project_id) await refreshProjects()
    toast.success(`Deleted "${record.filename}"`, {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: async () => {
          try {
            await insertExtraction(full)
            await refresh()
            if (record.project_id) await refreshProjects()
          } catch (err) {
            toast.error(err.message || 'Undo failed')
          }
        },
      },
    })
  }

  if (loading) {
    return (
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px 40px', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 24,
              fontWeight: 600,
              color: 'var(--text-strong)',
              margin: 0,
              letterSpacing: -0.3,
            }}
          >
            Documents
          </h1>
          <Spinner size={16} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonRow key={i} delay={i * 60} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return <ErrorState error={error} onRetry={refresh} />
  }

  // Only show the "no docs yet" hero when the store really is empty (no query).
  // An empty result during a search falls through to the inline no-matches state.
  if (records.length === 0 && !query) {
    return <EmptyState onNew={() => navigate('/')} />
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px 40px', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 24,
            fontWeight: 600,
            color: 'var(--text-strong)',
            margin: 0,
            letterSpacing: -0.3,
          }}
        >
          Documents
        </h1>
        <Badge tone="neutral">
          {query ? `${records.length} match${records.length === 1 ? '' : 'es'}` : records.length}
        </Badge>
        {searching && <Spinner size={14} />}
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => navigate('/')}>
          New extraction
        </Button>
      </div>

      {/* Search */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          marginBottom: 14,
          boxShadow: 'var(--shadow-xs)',
          transition: 'border-color .12s, box-shadow .12s',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent)'
          e.currentTarget.style.boxShadow = 'var(--shadow-focus)'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.boxShadow = 'var(--shadow-xs)'
        }}
      >
        <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by filename, brief, or tag…"
          style={{
            flex: 1,
            height: 38,
            border: 'none',
            background: 'transparent',
            fontSize: 13,
            outline: 'none',
            color: 'var(--text-strong)',
            fontFamily: 'inherit',
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            title="Clear"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* List or empty-search state */}
      {filtered.length === 0 && (
        <div
          style={{
            padding: '32px 16px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 13,
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-subtle)',
          }}
        >
          No documents match <strong style={{ color: 'var(--text-strong)' }}>"{query}"</strong>.
          <br />
          <button
            type="button"
            onClick={() => setQuery('')}
            style={{
              marginTop: 10,
              background: 'transparent',
              border: 'none',
              color: 'var(--accent-strong)',
              cursor: 'pointer',
              fontSize: 12.5,
              fontWeight: 500,
              padding: 0,
            }}
          >
            Clear search
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((r, i) => {
          const stories = r.story_count ?? 0
          const gaps = r.gap_count ?? 0
          const actors = r.actor_count ?? 0
          const isLive = r.live
          const inProject = r.project_id ? projectById[r.project_id] : null
          return (
            <Card
              key={r.id}
              hover
              padding={14}
              className="doc-row"
              onClick={() => onOpen(r)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                cursor: 'pointer',
                position: 'relative',
                animation: `fade-in .25s ease-out ${Math.min(i * 30, 300)}ms both`,
              }}
              title={`Open ${r.filename}`}
            >
              <IconTile tone={isLive ? 'success' : 'warn'} size={36}>
                <FileText size={16} />
              </IconTile>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--text-strong)',
                    marginBottom: 3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.filename}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <span>{timeAgo(r.created_at)}</span>
                  <span style={{ color: 'var(--text-soft)' }}>·</span>
                  <MetaItem
                    icon={<Users size={12} />}
                    label={`${actors} actor${actors === 1 ? '' : 's'}`}
                  />
                  <span style={{ color: 'var(--text-soft)' }}>·</span>
                  <MetaItem
                    icon={<Sparkles size={12} />}
                    label={`${stories} stor${stories === 1 ? 'y' : 'ies'}`}
                  />
                  <span style={{ color: 'var(--text-soft)' }}>·</span>
                  <MetaItem
                    icon={<AlertTriangle size={12} />}
                    label={`${gaps} gap${gaps === 1 ? '' : 's'}`}
                    tone={gaps > 0 ? 'warn' : 'muted'}
                  />
                </div>
              </div>
              {inProject && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); navigate(`/projects/${inProject.id}`) }}
                  title={`Open project ${inProject.name}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--accent-soft)',
                    color: 'var(--accent-ink)',
                    border: 'none',
                    fontSize: 11.5,
                    fontWeight: 500,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    maxWidth: 160,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <FolderClosed size={11} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {inProject.name}
                  </span>
                </button>
              )}
              {!isLive && (
                <Badge tone="warn" size="sm">
                  Mock
                </Badge>
              )}
              <button
                type="button"
                className="row-action"
                aria-label="Move to project"
                title="Move to project"
                onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === r.id ? null : r.id) }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 6,
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <MoreHorizontal size={14} />
              </button>
              <button
                type="button"
                className="row-delete"
                aria-label={`Delete ${r.filename}`}
                title="Delete"
                onClick={(e) => onDelete(r, e)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 6,
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Trash size={14} />
              </button>
              {menuFor === r.id && (
                <MoveMenu
                  projects={projects}
                  currentProjectId={r.project_id}
                  onPick={(pid) => onMove(r, pid)}
                  onClose={() => setMenuFor(null)}
                />
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
