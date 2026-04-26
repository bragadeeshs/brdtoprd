import React, { useEffect, useState } from 'react'
import { captureFewShotFromExtractionApi } from '../api.js'
import { useToast } from './Toast.jsx'
import { Card } from './primitives.jsx'
import { track } from '../lib/analytics.js'

/* M7.2 — "Save as few-shot example" modal.
 *
 * Captures the open extraction's current raw_text + payload as a new
 * FewShotExample. The PRIMARY UX path for authoring examples — most
 * users won't hand-write the JSON; they'll extract → edit (M4.1) →
 * Save here.
 *
 * Fields: just `name` and an enabled toggle. Backend pulls the actual
 * data from the extraction by id (so the captured snapshot reflects
 * any inline edits up to this moment).
 *
 * Cap-aware: the backend returns 400 when enabling would push past the
 * 3-active limit; we surface that as a toast + suggest disabling first.
 */
export default function SaveExampleModal({ extractionId, defaultName, onClose }) {
  const { toast } = useToast()
  const [name, setName] = useState(defaultName || '')
  const [enabled, setEnabled] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const submit = async (e) => {
    e?.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true)
    try {
      await captureFewShotFromExtractionApi(extractionId, name.trim(), enabled)
      track('few_shot_captured', { enabled })
      toast.success(`Saved "${name.trim()}"${enabled ? ' (enabled)' : ' (disabled)'}`)
      onClose()
    } catch (err) {
      toast.error(err.message || 'Could not save example')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'grid', placeItems: 'center', zIndex: 100, padding: 24,
      }}
    >
      <Card padding={24} style={{ width: 460, maxWidth: '100%', boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600,
          color: 'var(--text-strong)', margin: '0 0 6px',
        }}>
          Save as few-shot example
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.55 }}>
          Captures this extraction's current state (source text + edited stories / NFRs / gaps) as
          a demonstration Claude sees on every future extraction. Up to 3 examples can be enabled
          at once.
        </p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
            color: 'var(--text-soft)',
          }}>
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            placeholder="e.g. acme-stories-style"
            maxLength={100}
            autoFocus
            style={{
              width: '100%',
              border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)',
              padding: '8px 10px', fontFamily: 'inherit', fontSize: 13,
              background: 'var(--bg)', color: 'inherit', outline: 'none',
            }}
          />
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12.5, color: 'var(--text)', cursor: 'pointer',
            marginTop: 4,
          }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={busy}
            />
            Enable immediately (counts against your 3-active limit)
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button type="button" onClick={onClose} disabled={busy} style={ghostBtn}>Cancel</button>
            <button type="submit" disabled={busy || !name.trim()} style={primaryBtn}>
              {busy ? 'Saving…' : 'Save example'}
            </button>
          </div>
        </form>
      </Card>
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
