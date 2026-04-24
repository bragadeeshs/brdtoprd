import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  deleteProjectApi,
  patchExtractionApi,
  patchProjectApi,
} from '../api.js'
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
  Edit,
  FileText,
  FolderClosed,
  Plus,
  RefreshCw,
  Sparkles,
  Trash,
  Users,
  X,
} from '../components/icons.jsx'

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
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
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

/** Inline-editable header title — click pencil to rename, Enter to save, Esc to cancel. */
function NameEditor({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const submit = async () => {
    const next = draft.trim()
    if (!next || next === value) {
      setDraft(value)
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(next)
      setEditing(false)
    } catch {
      // toast already handled by caller
      setDraft(value)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          else if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
        onBlur={submit}
        disabled={saving}
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 24,
          fontWeight: 600,
          color: 'var(--text-strong)',
          letterSpacing: -0.3,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-sm)',
          padding: '2px 8px',
          outline: 'none',
          minWidth: 200,
        }}
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to rename"
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'text',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        color: 'inherit',
        fontFamily: 'inherit',
      }}
    >
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
        {value}
      </h1>
      <Edit size={14} style={{ color: 'var(--text-soft)' }} />
    </button>
  )
}

function EmptyState() {
  const navigate = useNavigate()
  return (
    <Card padding={32} style={{ maxWidth: 460, margin: '40px auto', textAlign: 'center' }}>
      <IconTile tone="accent" size={44} style={{ margin: '0 auto 14px' }}>
        <FolderClosed size={20} />
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
        No documents in this project yet
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 18 }}>
        Move documents into this project from the Documents view, or run a new extraction.
      </div>
      <div style={{ display: 'inline-flex', gap: 8 }}>
        <Button variant="secondary" size="sm" icon={<FileText size={13} />} onClick={() => navigate('/documents')}>
          Go to Documents
        </Button>
        <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => navigate('/')}>
          New extraction
        </Button>
      </div>
    </Card>
  )
}

function NotFoundState() {
  const navigate = useNavigate()
  return (
    <Card padding={32} style={{ maxWidth: 460, margin: '40px auto', textAlign: 'center' }}>
      <IconTile tone="warn" size={44} style={{ margin: '0 auto 14px' }}>
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
        Project not found
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 18 }}>
        It may have been deleted from another tab.
      </div>
      <Button variant="secondary" size="sm" icon={<FileText size={13} />} onClick={() => navigate('/documents')}>
        Back to Documents
      </Button>
    </Card>
  )
}

export default function Project() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { projects, projectsLoading, refreshProjects, projectById, restoreExtraction } = useApp()
  const { toast } = useToast()

  const project = projectById[id]

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      setRecords(await listExtractions({ projectId: id }))
    } catch (e) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [id])

  const onRename = async (newName) => {
    try {
      await patchProjectApi(id, { name: newName })
      await refreshProjects()
      toast.success('Project renamed')
    } catch (e) {
      toast.error(e.message || 'Rename failed')
      throw e
    }
  }

  const onDeleteProject = async () => {
    if (!project) return
    if (!window.confirm(`Delete "${project.name}"? Documents in this project will be unassigned, not deleted.`)) return
    try {
      await deleteProjectApi(id)
      await refreshProjects()
      toast.success(`Deleted project "${project.name}"`)
      navigate('/documents')
    } catch (e) {
      toast.error(e.message || 'Delete failed')
    }
  }

  const onOpen = (record) => {
    restoreExtraction(record)
  }

  const onRemoveFromProject = async (record, e) => {
    e.stopPropagation()
    try {
      await patchExtractionApi(record.id, { project_id: '' })
      setRecords((rs) => rs.filter((r) => r.id !== record.id))
      await refreshProjects()
      toast.success(`Removed "${record.filename}" from project`)
    } catch (err) {
      toast.error(err.message || 'Could not remove from project')
    }
  }

  const onDeleteRow = async (record, e) => {
    e.stopPropagation()
    let full
    try { full = await getExtraction(record.id) }
    catch (err) { toast.error(err.message || 'Could not fetch document'); return }
    try { await deleteExtraction(record.id) }
    catch (err) { toast.error(err.message || 'Delete failed'); return }
    setRecords((rs) => rs.filter((r) => r.id !== record.id))
    await refreshProjects()
    toast.success(`Deleted "${record.filename}"`, {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: async () => {
          try {
            // Re-import keeps the original project_id from the cached record.
            await insertExtraction(full)
            await refresh()
            await refreshProjects()
          } catch (err) {
            toast.error(err.message || 'Undo failed')
          }
        },
      },
    })
  }

  // Loading / not-found / error
  if (projectsLoading && !project) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
        <Spinner size={20} />
      </div>
    )
  }
  if (!project) {
    return (
      <div style={{ flex: 1, padding: 24, background: 'var(--bg)' }}>
        <NotFoundState />
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px 40px', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <IconTile tone="accent" size={36}>
          <FolderClosed size={16} />
        </IconTile>
        <NameEditor value={project.name} onSave={onRename} />
        <Badge tone="neutral">{records.length}</Badge>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" icon={<Trash size={13} />} onClick={onDeleteProject}>
          Delete project
        </Button>
      </div>

      {/* Body */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
          <Spinner size={14} /> Loading documents…
        </div>
      )}
      {error && (
        <Card padding={20} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertTriangle size={16} style={{ color: 'var(--danger-ink)' }} />
          <div style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{error}</div>
          <Button variant="secondary" size="sm" icon={<RefreshCw size={12} />} onClick={refresh}>
            Retry
          </Button>
        </Card>
      )}
      {!loading && !error && records.length === 0 && <EmptyState />}

      {!loading && !error && records.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {records.map((r, i) => {
            const stories = r.story_count ?? 0
            const gaps = r.gap_count ?? 0
            const actors = r.actor_count ?? 0
            const isLive = r.live
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
                    <span>{timeAgo(r.created_at)}</span>
                    <span style={{ color: 'var(--text-soft)' }}>·</span>
                    <MetaItem icon={<Users size={12} />} label={`${actors} actor${actors === 1 ? '' : 's'}`} />
                    <span style={{ color: 'var(--text-soft)' }}>·</span>
                    <MetaItem icon={<Sparkles size={12} />} label={`${stories} stor${stories === 1 ? 'y' : 'ies'}`} />
                    <span style={{ color: 'var(--text-soft)' }}>·</span>
                    <MetaItem
                      icon={<AlertTriangle size={12} />}
                      label={`${gaps} gap${gaps === 1 ? '' : 's'}`}
                      tone={gaps > 0 ? 'warn' : 'muted'}
                    />
                  </div>
                </div>
                {!isLive && <Badge tone="warn" size="sm">Mock</Badge>}
                <button
                  type="button"
                  className="row-action"
                  aria-label="Remove from project"
                  title="Remove from project"
                  onClick={(e) => onRemoveFromProject(r, e)}
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
                  <X size={14} />
                </button>
                <button
                  type="button"
                  className="row-action"
                  aria-label={`Delete ${r.filename}`}
                  title="Delete"
                  onClick={(e) => onDeleteRow(r, e)}
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
      )}
    </div>
  )
}
