import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchSharedExtraction } from '../api.js'
import { Card, IconTile } from '../components/primitives.jsx'
import SourcePane from '../components/SourcePane.jsx'
import ArtifactsPane from '../components/ArtifactsPane.jsx'
import { Sparkles } from '../components/icons.jsx'

/* M4.6 — public read-only studio rendered by token.
 *
 * Routed at `/share/:token` OUTSIDE the SignedIn gate (App.jsx) so visitors
 * don't need a Clerk account. Re-uses SourcePane + ArtifactsPane in their
 * non-editable fallback mode (set up in M4.1) — no `onUpdate`, no
 * `onPickQuote` callback chain, no comments. The components fall back
 * cleanly because they were always designed with a read-only path.
 *
 * Visible: brief, actors, stories, NFRs, gaps, source quotes, raw text.
 * Hidden: comments, gap action state, edit/regen buttons, sidebar, billing.
 */

export default function ShareView() {
  const { token } = useParams()
  const [state, setState] = useState({ loading: true, extraction: null, error: null })

  useEffect(() => {
    let cancelled = false
    setState({ loading: true, extraction: null, error: null })
    fetchSharedExtraction(token)
      .then((extraction) => {
        if (!cancelled) setState({ loading: false, extraction, error: null })
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, extraction: null, error: err.message || 'Failed to load' })
      })
    return () => { cancelled = true }
  }, [token])

  if (state.loading) return <CenteredCard message="Loading shared document…" />
  if (state.error) return <CenteredCard message={state.error} tone="error" showHomeLink />
  if (!state.extraction) return <CenteredCard message="Not found" tone="error" showHomeLink />

  const ext = state.extraction
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
      {/* Minimal top bar — not the full StudioBar with rerun/version controls */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-subtle)',
          flexShrink: 0,
        }}
      >
        <IconTile tone="accent" size={28}>
          <Sparkles size={14} />
        </IconTile>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-strong)',
              wordBreak: 'break-word',
            }}
          >
            {ext.filename}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>
            Shared read-only · Lucid
          </div>
        </div>
        <Link
          to="/sign-in"
          style={{
            fontSize: 12,
            color: 'var(--accent-strong)',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          Sign in to Lucid →
        </Link>
      </header>

      {/* The studio body — same components, no edit props passed. */}
      <div className="body" style={{ flex: 1, minHeight: 0 }}>
        <SourcePane extraction={ext} />
        <ArtifactsPane extraction={ext} />
      </div>
    </div>
  )
}

function CenteredCard({ message, tone, showHomeLink }) {
  return (
    <div
      style={{
        height: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg)',
        padding: 24,
      }}
    >
      <Card padding={24} style={{ width: 400, textAlign: 'center' }}>
        <div
          style={{
            fontSize: 14,
            color: tone === 'error' ? 'var(--danger-strong, #b91c1c)' : 'var(--text)',
            marginBottom: showHomeLink ? 14 : 0,
          }}
        >
          {message}
        </div>
        {showHomeLink && (
          <Link
            to="/"
            style={{
              fontSize: 12.5,
              color: 'var(--accent-strong)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Go to Lucid home →
          </Link>
        )}
      </Card>
    </div>
  )
}
