import React, { useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { createCommentApi, deleteCommentApi, patchCommentApi } from '../api.js'
import { track } from '../lib/analytics.js'
import { useToast } from './Toast.jsx'
import { Card } from './primitives.jsx'
import { MessageSquare } from './icons.jsx'

/* M4.5 — comments on a single artifact (brief or one story).
 *
 * The list of all comments for an extraction is fetched once at the studio
 * level (App.jsx) and passed down filtered for this artifact. Mutations
 * (create/edit/delete) bubble back up via `onCreate` / `onPatch` / `onDelete`
 * so the parent owns the canonical list and re-renders all sibling popovers.
 *
 * Renders as: small button with count badge → popover with thread + input.
 * Click-outside or Esc dismisses. Author info comes denormalized from the
 * backend (no per-render Clerk lookup).
 */

function relTime(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

function authorLabel(c) {
  return c.author_name || c.author_email || `user…${c.author_user_id.slice(-4)}`
}

function CommentItem({ comment, currentUserId, onPatch, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [busy, setBusy] = useState(false)
  const isMine = currentUserId === comment.author_user_id

  useEffect(() => { setDraft(comment.body) }, [comment.body])

  const save = async () => {
    const body = draft.trim()
    if (!body || body === comment.body) {
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      await onPatch(comment.id, body)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!window.confirm('Delete this comment?')) return
    setBusy(true)
    try {
      await onDelete(comment.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        padding: '10px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-strong)' }}>
          {authorLabel(comment)}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-soft)' }}>
          {relTime(comment.created_at)}
          {comment.edited_at && ' · edited'}
        </span>
        {isMine && !editing && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={busy}
              style={ghostBtn}
            >
              Edit
            </button>
            <button type="button" onClick={remove} disabled={busy} style={ghostBtn}>
              Delete
            </button>
          </span>
        )}
      </div>
      {editing ? (
        <>
          <textarea
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setEditing(false)
                setDraft(comment.body)
              } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                save()
              }
            }}
            rows={2}
            style={textareaStyle}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button type="button" onClick={save} disabled={busy} style={primaryBtn}>
              Save
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setDraft(comment.body) }}
              disabled={busy}
              style={ghostBtn}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
          {comment.body}
        </div>
      )}
    </div>
  )
}

const ghostBtn = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-soft)',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 500,
  fontFamily: 'inherit',
  padding: 0,
}

const primaryBtn = {
  background: 'var(--accent)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  color: 'white',
  cursor: 'pointer',
  fontSize: 11.5,
  fontWeight: 500,
  fontFamily: 'inherit',
  padding: '4px 10px',
}

const textareaStyle = {
  width: '100%',
  border: '1px solid var(--accent)',
  borderRadius: 'var(--radius-sm)',
  padding: '6px 8px',
  font: 'inherit',
  fontSize: 13,
  background: 'var(--bg)',
  color: 'inherit',
  outline: 'none',
  resize: 'vertical',
}

export default function CommentThread({
  extractionId,
  targetKind,
  targetKey = '',
  comments = [],     // pre-filtered to (targetKind, targetKey) by the parent
  onCreate,          // (newComment) => void — parent merges into its master list
  onPatch,           // (updatedComment) => void
  onDelete,          // (deletedId) => void
}) {
  const { user } = useUser()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const popRef = useRef(null)
  const btnRef = useRef(null)

  // Click-outside + Escape to close. Skip when busy so a network race
  // doesn't drop the in-flight comment.
  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (busy) return
      if (popRef.current?.contains(e.target)) return
      if (btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => {
      if (busy) return
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, busy])

  const submit = async (e) => {
    e?.preventDefault()
    const body = draft.trim()
    if (!body) return
    setBusy(true)
    try {
      const created = await createCommentApi(extractionId, {
        target_kind: targetKind,
        target_key: targetKey,
        body,
      })
      onCreate?.(created)
      setDraft('')
      track('comment_posted', { target_kind: targetKind })
    } catch (err) {
      toast.error(err.message || 'Could not post comment')
    } finally {
      setBusy(false)
    }
  }

  const handlePatch = async (commentId, body) => {
    try {
      const updated = await patchCommentApi(commentId, body)
      onPatch?.(updated)
    } catch (err) {
      toast.error(err.message || 'Could not save edit')
    }
  }

  const handleDelete = async (commentId) => {
    try {
      await deleteCommentApi(commentId)
      onDelete?.(commentId)
    } catch (err) {
      toast.error(err.message || 'Could not delete comment')
    }
  }

  const count = comments.length

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((x) => !x)}
        title={count ? `${count} comment${count === 1 ? '' : 's'}` : 'Add comment'}
        aria-label={count ? `${count} comments` : 'Add comment'}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 4,
          cursor: 'pointer',
          color: count > 0 ? 'var(--accent-strong)' : 'var(--text-soft)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          lineHeight: 1,
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <MessageSquare size={13} />
        {count > 0 && <span>{count}</span>}
      </button>

      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Comments"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: 320,
            zIndex: 50,
          }}
        >
          <Card padding={0} style={{ boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ maxHeight: 280, overflowY: 'auto', padding: '4px 14px' }}>
              {comments.length === 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-soft)',
                    fontStyle: 'italic',
                    padding: '14px 0',
                    textAlign: 'center',
                  }}
                >
                  No comments yet. Be the first.
                </div>
              ) : (
                comments.map((c) => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    currentUserId={user?.id}
                    onPatch={handlePatch}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </div>
            <form
              onSubmit={submit}
              style={{
                padding: 10,
                borderTop: '1px solid var(--border)',
                background: 'var(--bg-subtle)',
              }}
            >
              <textarea
                value={draft}
                disabled={busy}
                placeholder="Write a comment…"
                rows={2}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e)
                }}
                style={textareaStyle}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <span style={{ fontSize: 10.5, color: 'var(--text-soft)' }}>⌘+Enter to send</span>
                <button
                  type="submit"
                  disabled={busy || !draft.trim()}
                  style={{
                    ...primaryBtn,
                    opacity: busy || !draft.trim() ? 0.5 : 1,
                    cursor: busy || !draft.trim() ? 'default' : 'pointer',
                  }}
                >
                  {busy ? 'Posting…' : 'Post'}
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </span>
  )
}
