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
import { Badge, Button, Card, FilterChipStrip, IconTile, Spinner } from '../components/primitives.jsx'
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

  // M11 — multi-select. `selected` is a Set of extraction ids; the page
  // header swaps to "N selected · Move · Delete · Clear" mode whenever
  // size > 0. Row checkboxes show on hover when nothing is selected, and
  // stay persistent while a selection is active so users can build it up.
  const [selected, setSelected] = useState(() => new Set())
  // M11 — bulk move-to-project menu visibility.
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false)
  // M11.b — anchor for shift-click range select. Updated on every plain
  // checkbox click; shift+click extends from anchor to the new id.
  const lastClickedIdRef = useRef(null)
  // M12.3 — view filter applied client-side over the search-filtered list.
  // 'all' is the default; switching does not refetch (cheap + responsive).
  const [viewFilter, setViewFilter] = useState('all')

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

  // After backend search-filtering, `records` is the candidate list.
  // M12.3 — additional client-side view filter on top: All / Live / Mock /
  // This week. Counts shown in the chip strip use `records` (post-search,
  // pre-view-filter) so the chips reflect "of what your search matches".
  const oneWeekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000
  const filterFns = {
    all: () => true,
    live: (r) => !!r.live,
    mock: (r) => !r.live,
    week: (r) => {
      const t = r.created_at ? new Date(r.created_at).getTime() : 0
      return t > oneWeekAgoMs
    },
  }
  const filtered = records.filter(filterFns[viewFilter] || filterFns.all)
  const filterOptions = [
    { id: 'all',  label: 'All',       count: records.length },
    { id: 'live', label: 'Live',      count: records.filter(filterFns.live).length },
    { id: 'mock', label: 'Mock',      count: records.filter(filterFns.mock).length },
    { id: 'week', label: 'This week', count: records.filter(filterFns.week).length },
  ]

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

  // M11 — selection helpers + bulk actions.
  const hasSelection = selected.size > 0
  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id))
  // M11.b — shift-aware. When the underlying event carries shiftKey AND we
  // have a previous anchor in the current filtered list, extend selection
  // from anchor to id (inclusive) using the *current visible order* (so a
  // search-filtered subset selects the visible rows between, not the
  // off-screen ones). Otherwise toggle just this id.
  const toggleSelect = (id, event) => {
    if (event?.shiftKey && lastClickedIdRef.current && lastClickedIdRef.current !== id) {
      const ids = filtered.map((r) => r.id)
      const a = ids.indexOf(lastClickedIdRef.current)
      const b = ids.indexOf(id)
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        setSelected((prev) => {
          const next = new Set(prev)
          for (let i = lo; i <= hi; i++) next.add(ids[i])
          return next
        })
        lastClickedIdRef.current = id
        return
      }
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    lastClickedIdRef.current = id
  }
  const clearSelection = () => setSelected(new Set())
  const toggleSelectAll = () => {
    if (allSelected) clearSelection()
    else setSelected(new Set(filtered.map((r) => r.id)))
  }

  // Bulk delete — serial deletes so a single failure doesn't strand the
  // batch; per-failure count surfaces in the final toast. No undo for
  // bulk (we'd need to refetch each row's full payload first; explicit
  // confirmation gates the cost of accidental clicks).
  const bulkDelete = async () => {
    if (selected.size === 0) return
    const n = selected.size
    if (!window.confirm(`Delete ${n} document${n === 1 ? '' : 's'}? This can't be undone.`)) return
    const ids = Array.from(selected)
    let ok = 0, failed = 0
    for (const id of ids) {
      try { await deleteExtraction(id); ok++ } catch { failed++ }
    }
    setRecords((rs) => rs.filter((r) => !selected.has(r.id)))
    clearSelection()
    await refreshProjects()
    if (failed) toast.error(`Deleted ${ok}, ${failed} failed`)
    else toast.success(`Deleted ${ok} document${ok === 1 ? '' : 's'}`)
  }

  // Bulk move — same serial pattern. `projectId === null` removes from
  // any project; matches the single-row MoveMenu contract.
  const bulkMove = async (projectId) => {
    if (selected.size === 0) return
    setBulkMoveOpen(false)
    const ids = Array.from(selected)
    let ok = 0, failed = 0
    for (const id of ids) {
      try {
        await patchExtractionApi(id, { project_id: projectId || '' })
        ok++
      } catch { failed++ }
    }
    setRecords((rs) =>
      rs.map((r) => (selected.has(r.id) ? { ...r, project_id: projectId || null } : r)),
    )
    clearSelection()
    await refreshProjects()
    const projName = projectId ? projectById[projectId]?.name : null
    if (failed) toast.error(`Moved ${ok}, ${failed} failed`)
    else if (projectId) toast.success(`Moved ${ok} to ${projName || 'project'}`)
    else toast.success(`Removed ${ok} from project`)
  }

  if (loading) {
    return (
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px 40px', background: 'var(--bg)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-3xl)',
                fontWeight: 600,
                color: 'var(--text-strong)',
                margin: 0,
                letterSpacing: 'var(--tracking-tight)',
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
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Header — swaps to bulk-action mode when hasSelection (M11). */}
      {hasSelection ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--accent-soft)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius)',
            position: 'relative',
          }}
        >
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            aria-label={allSelected ? 'Clear selection' : 'Select all'}
            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--accent-ink)' }}>
            {selected.size} selected
          </span>
          {!allSelected && filtered.length > selected.size && (
            <button
              type="button"
              onClick={toggleSelectAll}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-strong)',
                cursor: 'pointer',
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
                padding: 0,
              }}
            >
              Select all {filtered.length}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative' }}>
            <Button
              variant="secondary"
              size="sm"
              icon={<FolderClosed size={13} />}
              onClick={() => setBulkMoveOpen((s) => !s)}
            >
              Move to project
            </Button>
            {bulkMoveOpen && (
              <MoveMenu
                projects={projects}
                currentProjectId={null}
                onPick={(pid) => bulkMove(pid)}
                onClose={() => setBulkMoveOpen(false)}
              />
            )}
          </div>
          <Button variant="secondary" size="sm" icon={<Trash size={13} />} onClick={bulkDelete}>
            Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-3xl)',
              fontWeight: 600,
              color: 'var(--text-strong)',
              margin: 0,
              letterSpacing: 'var(--tracking-tight)',
              lineHeight: 'var(--leading-tight)',
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
      )}

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

      {/* M12.3 — view filter chips. Sit between the search bar and the
          list so users see filter options + counts at a glance. Hidden
          when no records (the empty hero handles that case). */}
      {records.length > 0 && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <FilterChipStrip
            options={filterOptions}
            active={viewFilter}
            onChange={setViewFilter}
          />
        </div>
      )}

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
          {/* M12.3 — distinguish empty-by-search vs empty-by-view-filter so
              the call-to-action targets the actual cause. */}
          {query && viewFilter === 'all' ? (
            <>
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
            </>
          ) : (
            <>
              No documents in this view.
              <br />
              <button
                type="button"
                onClick={() => { setQuery(''); setViewFilter('all') }}
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
                Clear filters
              </button>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((r, i) => {
          const stories = r.story_count ?? 0
          const gaps = r.gap_count ?? 0
          const actors = r.actor_count ?? 0
          const isLive = r.live
          const inProject = r.project_id ? projectById[r.project_id] : null
          const isSelected = selected.has(r.id)
          return (
            <Card
              key={r.id}
              hover
              padding={14}
              className="doc-row"
              onClick={(e) => {
                // M11 — when a selection is active, clicking the row toggles
                // selection instead of opening (Linear-style); to actually
                // open, the user clears the selection first.
                // M11.b — shift held → range select via the same helper.
                if (hasSelection || e.shiftKey) toggleSelect(r.id, e)
                else onOpen(r)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                cursor: 'pointer',
                position: 'relative',
                animation: `fade-in .25s ease-out ${Math.min(i * 30, 300)}ms both`,
                background: isSelected ? 'var(--accent-soft)' : undefined,
                borderColor: isSelected ? 'var(--accent)' : undefined,
              }}
              title={hasSelection ? `Toggle selection · ${r.filename}` : `Open ${r.filename}`}
            >
              {/* M11 — row checkbox. Visible on hover via .row-checkbox CSS;
                  forced visible inline when a selection exists OR this row
                  is selected so the user always sees it during a multi-pick. */}
              <input
                type="checkbox"
                className="row-checkbox"
                checked={isSelected}
                onClick={(e) => {
                  // M11.b — shift-click for range select. We capture the
                  // shift state on click (onChange's synthetic event lacks
                  // it cleanly across browsers) and run the same helper;
                  // stopPropagation so the row's onClick doesn't double-fire.
                  e.stopPropagation()
                  toggleSelect(r.id, e)
                }}
                onChange={() => { /* handled by onClick */ }}
                aria-label={`Select ${r.filename}`}
                style={{
                  width: 16,
                  height: 16,
                  cursor: 'pointer',
                  flexShrink: 0,
                  accentColor: 'var(--accent)',
                  opacity: hasSelection || isSelected ? 1 : undefined,
                }}
              />
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
    </div>
  )
}
