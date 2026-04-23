import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteExtraction, insertExtraction, listExtractions } from '../lib/store.js'
import { useApp } from '../lib/AppContext.jsx'
import { useToast } from '../components/Toast.jsx'
import { Badge, Button, Card, IconTile } from '../components/primitives.jsx'
import { AlertTriangle, FileText, Plus, Search, Sparkles, Trash, Users, X } from '../components/icons.jsx'

/** Format an ISO timestamp as a human-friendly relative string. */
function timeAgo(iso) {
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

export default function Documents() {
  const navigate = useNavigate()
  const { restoreExtraction } = useApp()
  const { toast } = useToast()
  const [records, setRecords] = useState(() => listExtractions())
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return records
    return records.filter((r) => {
      const fname = (r.filename || '').toLowerCase()
      const summary = (r.payload?.brief?.summary || '').toLowerCase()
      const tags = (r.payload?.brief?.tags || []).map((t) => String(t).toLowerCase())
      return fname.includes(q) || summary.includes(q) || tags.some((t) => t.includes(q))
    })
  }, [records, query])

  const onOpen = (record) => {
    restoreExtraction(record)
    navigate('/')
  }

  const onDelete = (record, e) => {
    e.stopPropagation()
    // Compute idx in the FULL list (records), not the filtered list,
    // so undo restores at the original position.
    const originalIdx = records.findIndex((r) => r.id === record.id)
    deleteExtraction(record.id)
    setRecords(listExtractions())
    toast.success(`Deleted "${record.filename}"`, {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          insertExtraction(record, originalIdx >= 0 ? originalIdx : 0)
          setRecords(listExtractions())
        },
      },
    })
  }

  if (records.length === 0) {
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
          {query ? `${filtered.length} of ${records.length}` : records.length}
        </Badge>
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
          const stories = r.payload?.stories?.length ?? 0
          const gaps = r.payload?.gaps?.length ?? 0
          const actors = r.payload?.actors?.length ?? 0
          const isLive = r.payload?.live
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
                  <span>{timeAgo(r.savedAt)}</span>
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
              {!isLive && (
                <Badge tone="warn" size="sm">
                  Mock
                </Badge>
              )}
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
            </Card>
          )
        })}
      </div>
    </div>
  )
}
