import React, { useEffect, useState } from 'react'
import { copyToClipboard } from '../lib/clipboard.js'
import { createShareApi, getShareApi, revokeShareApi } from '../api.js'
import { track } from '../lib/analytics.js'
import { useToast } from './Toast.jsx'
import { Card } from './primitives.jsx'

/* M4.6 — owner-side share-link manager.
 *
 * Behavior:
 *   - On open, fetches the active share for this extraction.
 *   - "Create" mints + rotates (revokes any existing token).
 *   - "Copy" copies the public URL to clipboard.
 *   - "Revoke" disables all active tokens.
 *
 * The public URL is derived client-side from window.location.origin so it
 * works in dev (localhost), Render preview, and prod without backend
 * configuration. The backend doesn't ever see the host header for this —
 * tokens are opaque, so there's nothing host-specific to serialize.
 */

export default function ShareModal({ extractionId, onClose }) {
  const [share, setShare] = useState(null)  // {token, created_at, ...} | null
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getShareApi(extractionId)
      .then((s) => { if (!cancelled) setShare(s) })
      .catch((err) => { if (!cancelled) toast.error(err.message || 'Could not load share') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [extractionId])

  // Esc closes; click-outside the card closes (parent renders the scrim).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const create = async () => {
    setBusy(true)
    try {
      const s = await createShareApi(extractionId)
      setShare(s)
      track('share_link_created', { rotated: !!share })
      toast.success(share ? 'Share link rotated' : 'Share link created')
    } catch (err) {
      toast.error(err.message || 'Could not create share')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    if (!window.confirm('Revoke this share link? Anyone with the URL will lose access.')) return
    setBusy(true)
    try {
      await revokeShareApi(extractionId)
      setShare(null)
      toast.success('Share link revoked')
    } catch (err) {
      toast.error(err.message || 'Could not revoke share')
    } finally {
      setBusy(false)
    }
  }

  const url = share ? `${window.location.origin}/share/${share.token}` : ''

  const copy = async () => {
    if (!url) return
    const ok = await copyToClipboard(url)
    if (ok) toast.success('Share URL copied to clipboard', { duration: 2500 })
    else toast.error('Could not copy — your browser blocked clipboard access')
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 100,
        padding: 24,
      }}
    >
      <Card padding={24} style={{ width: 480, maxWidth: '100%', boxShadow: 'var(--shadow-lg)' }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--text-strong)',
            margin: '0 0 6px',
          }}
        >
          Share read-only link
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
          Anyone with the URL can view this extraction — no sign-in required.
          They can't edit, comment, or see usage history.
        </p>

        {loading ? (
          <div style={{ padding: '20px 0', fontSize: 13, color: 'var(--text-soft)', textAlign: 'center' }}>
            Loading…
          </div>
        ) : share ? (
          <>
            <div
              style={{
                display: 'flex',
                gap: 6,
                marginBottom: 12,
              }}
            >
              <input
                type="text"
                value={url}
                readOnly
                onFocus={(e) => e.target.select()}
                style={{
                  flex: 1,
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  background: 'var(--bg-subtle)',
                  color: 'var(--text)',
                  outline: 'none',
                  minWidth: 0,
                }}
              />
              <button
                type="button"
                onClick={copy}
                disabled={busy}
                style={primaryBtn}
              >
                Copy
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-soft)', marginBottom: 18 }}>
              Created {new Date(share.created_at).toLocaleString()}
              {share.expires_at && ` · expires ${new Date(share.expires_at).toLocaleString()}`}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <button type="button" onClick={revoke} disabled={busy} style={dangerBtn}>
                Revoke
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={create} disabled={busy} style={ghostBtn}>
                  Rotate
                </button>
                <button type="button" onClick={onClose} disabled={busy} style={ghostBtn}>
                  Done
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                padding: '14px 0 18px',
                fontSize: 13,
                color: 'var(--text-soft)',
                fontStyle: 'italic',
                textAlign: 'center',
              }}
            >
              No share link yet. Create one to give someone read-only access.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={onClose} disabled={busy} style={ghostBtn}>
                Cancel
              </button>
              <button type="button" onClick={create} disabled={busy} style={primaryBtn}>
                {busy ? 'Creating…' : 'Create share link'}
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

const primaryBtn = {
  background: 'var(--accent)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  color: 'white',
  cursor: 'pointer',
  fontSize: 12.5,
  fontWeight: 500,
  fontFamily: 'inherit',
  padding: '8px 14px',
}

const ghostBtn = {
  background: 'transparent',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text)',
  cursor: 'pointer',
  fontSize: 12.5,
  fontWeight: 500,
  fontFamily: 'inherit',
  padding: '7px 14px',
}

const dangerBtn = {
  background: 'transparent',
  border: '1px solid var(--danger-strong, #b91c1c)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--danger-strong, #b91c1c)',
  cursor: 'pointer',
  fontSize: 12.5,
  fontWeight: 500,
  fontFamily: 'inherit',
  padding: '7px 14px',
}
