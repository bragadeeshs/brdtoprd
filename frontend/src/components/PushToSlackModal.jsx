import React, { useEffect, useState } from 'react'
import { listSlackWebhooksApi, pushToSlackApi } from '../api.js'
import { useToast } from './Toast.jsx'
import { Card } from './primitives.jsx'
import { track } from '../lib/analytics.js'

/* M6.6 — Send extraction gaps to a Slack channel.
 *
 * Simpler than the other push modals: no picker (the webhook is bound
 * to a single channel — pick a different one in Slack admin). Just
 * confirm + send + result. Two states: ready (with optional
 * "include resolved gaps" toggle) and result.
 *
 * On open, fetches the connection so we can show the channel label
 * if the user gave one. If no connection is saved → CTA to Settings.
 */

export default function PushToSlackModal({ extraction, onClose }) {
  const { toast } = useToast()
  // M6.6.b — destinations is the full list (primary + additional). Picked
  // is the id we'll send to; defaults to first (typically the primary).
  const [destinations, setDestinations] = useState(null)
  const [picked, setPicked] = useState('')
  const [loadError, setLoadError] = useState(null)
  const [includeResolved, setIncludeResolved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    let alive = true
    listSlackWebhooksApi()
      .then((rows) => {
        if (!alive) return
        if (!rows || rows.length === 0) {
          setLoadError({ status: 400, detail: 'No Slack connection saved.' })
        } else {
          setDestinations(rows)
          setPicked(rows[0].id)   // primary first when present
        }
      })
      .catch((err) => {
        if (!alive) return
        setLoadError({ detail: err.message, status: err.status })
      })
    return () => { alive = false }
  }, [])

  const pickedDest = destinations?.find((d) => d.id === picked)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const send = async () => {
    if (busy) return
    setBusy(true)
    // Backend treats the primary as default → don't send webhook_id when
    // it's __primary__, keeps the wire payload identical for legacy users.
    const sendWebhookId = picked && picked !== '__primary__' ? picked : null
    track('push_to_slack_started', {
      include_resolved: includeResolved,
      destination: pickedDest?.is_primary ? 'primary' : 'additional',
    })
    try {
      const r = await pushToSlackApi(extraction.id, {
        include_resolved: includeResolved,
        webhook_id: sendWebhookId,
      })
      setResult(r)
      track('push_to_slack_finished', { posted: r.posted_gap_count })
    } catch (err) {
      toast.error(err.message || 'Slack send failed')
    } finally {
      setBusy(false)
    }
  }

  const gapCount = extraction.gaps?.length || 0

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
          color: 'var(--text-strong)', margin: '0 0 14px',
        }}>
          Send gaps to Slack
        </h2>

        {result ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 16 }}>
              Sent {result.posted_gap_count} gap{result.posted_gap_count === 1 ? '' : 's'}
              {pickedDest?.channel_label ? ` to ${pickedDest.channel_label}` : ''}.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={primaryBtn}>Done</button>
            </div>
          </>
        ) : loadError ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: '0 0 12px', lineHeight: 1.55 }}>
              {loadError.status === 400
                ? 'No Slack connection saved yet. Add a webhook in Settings.'
                : `Could not load Slack settings: ${loadError.detail}`}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={onClose} style={ghostBtn}>Close</button>
              <a href="/settings" style={{ ...primaryBtn, textDecoration: 'none', display: 'inline-block' }}>
                Open Settings
              </a>
            </div>
          </>
        ) : destinations === null ? (
          <div style={{ padding: '20px 0', color: 'var(--text-soft)', fontSize: 13, textAlign: 'center' }}>
            Loading…
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.55 }}>
              Sending {gapCount > 0 ? gapCount : 'no'} gap{gapCount === 1 ? '' : 's'}
              {pickedDest?.channel_label ? ` to ${pickedDest.channel_label}` : ''}.
              {' '}Each gap renders as a Slack section block with severity, question, and context.
            </p>

            {/* M6.6.b — destination picker. Only renders when 2+ exist
                (single-destination users get the legacy clean UI). */}
            {destinations.length > 1 && (
              <>
                <div style={{
                  fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
                  color: 'var(--text-soft)', marginBottom: 6,
                }}>
                  Destination
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                  {destinations.map((d) => (
                    <label
                      key={d.id}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${picked === d.id ? 'var(--accent-strong)' : 'var(--border)'}`,
                        cursor: busy ? 'not-allowed' : 'pointer',
                        background: picked === d.id ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                      }}
                    >
                      <input
                        type="radio"
                        name="slack-dest"
                        value={d.id}
                        checked={picked === d.id}
                        onChange={() => setPicked(d.id)}
                        disabled={busy}
                        style={{ marginTop: 2 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: 500 }}>
                          {d.name}
                          {d.is_primary && (
                            <span style={{ fontSize: 11, color: 'var(--text-soft)', marginLeft: 6 }}>
                              · primary
                            </span>
                          )}
                          {d.channel_label && (
                            <span style={{ color: 'var(--text-soft)', fontWeight: 400 }}> · {d.channel_label}</span>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}

            <label style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12.5, color: 'var(--text)', marginBottom: 16, cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={includeResolved}
                onChange={(e) => setIncludeResolved(e.target.checked)}
                disabled={busy}
              />
              Include resolved gaps too
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={onClose} disabled={busy} style={ghostBtn}>Cancel</button>
              <button type="button" onClick={send} disabled={busy || gapCount === 0} style={primaryBtn}>
                {busy ? 'Sending…' : 'Send to Slack'}
              </button>
            </div>
          </>
        )}
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
