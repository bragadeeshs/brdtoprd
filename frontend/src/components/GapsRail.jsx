import React, { useEffect, useMemo, useState } from 'react'
import { getGapStates, setGapState } from '../lib/store.js'
import { useToast } from './Toast.jsx'
import { Badge, Card, IconTile } from './primitives.jsx'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  MessageSquare,
} from './icons.jsx'

const SEVERITY_ORDER = { high: 0, med: 1, low: 2 }

const SEVERITY_META = {
  high: { tone: 'danger', icon: <AlertTriangle size={14} />, label: 'High' },
  med: { tone: 'warn', icon: <AlertCircle size={14} />, label: 'Medium' },
  low: { tone: 'info', icon: <HelpCircle size={14} />, label: 'Low' },
}

function formatGapMarkdown(g) {
  const lines = [
    `**Question**: ${g.question}`,
    '',
    `**Severity**: ${g.severity}`,
  ]
  if (g.section) lines.push(`**Source**: ${g.section}`)
  if (g.context) {
    lines.push('')
    lines.push(`**Context**: ${g.context}`)
  }
  return lines.join('\n')
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for older browsers
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

function ActionLink({ children, onClick, tone = 'accent' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        fontSize: 11.5,
        color: tone === 'muted' ? 'var(--text-muted)' : 'var(--accent-strong)',
        cursor: 'pointer',
        fontWeight: 500,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

function ActionDot() {
  return <span style={{ color: 'var(--text-soft)', fontSize: 11.5 }}>·</span>
}

function GapCard({ gap, idx, state, onResolve, onIgnore, onAsk, onReopen }) {
  const meta = SEVERITY_META[gap.severity] || SEVERITY_META.low
  const isResolved = !!state?.resolved
  const wasAsked = !!state?.askedAt

  return (
    <Card
      hover={!isResolved}
      padding={14}
      style={{
        animation: `fade-in .25s ease-out ${Math.min(idx * 40, 400)}ms both`,
        opacity: isResolved ? 0.65 : 1,
      }}
    >
      {/* Header row: severity badge + section ref */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {isResolved ? (
          <Badge tone="success" icon={<Check size={11} />} size="sm">
            Resolved
          </Badge>
        ) : (
          <Badge tone={meta.tone} icon={meta.icon} size="sm">
            {meta.label}
          </Badge>
        )}
        {wasAsked && !isResolved && (
          <Badge tone="info" size="sm">
            Asked
          </Badge>
        )}
        <div style={{ flex: 1 }} />
        {gap.section && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-soft)',
            }}
          >
            {gap.section}
          </span>
        )}
      </div>

      {/* Question */}
      <div
        style={{
          fontSize: 13.5,
          fontWeight: 600,
          color: 'var(--text-strong)',
          marginBottom: 6,
          lineHeight: 1.4,
          textDecoration: isResolved ? 'line-through' : 'none',
          textDecorationColor: 'var(--text-soft)',
        }}
      >
        {gap.question}
      </div>

      {/* Context */}
      {gap.context && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            lineHeight: 1.55,
            marginBottom: 10,
          }}
        >
          {gap.context}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {isResolved ? (
          <ActionLink onClick={() => onReopen(idx)} tone="muted">
            Reopen
          </ActionLink>
        ) : (
          <>
            <ActionLink onClick={() => onResolve(idx)}>Resolve</ActionLink>
            <ActionDot />
            <ActionLink onClick={() => onAsk(idx, gap)}>
              {wasAsked ? 'Copy again' : 'Ask stakeholder'}
            </ActionLink>
            <ActionDot />
            <ActionLink onClick={() => onIgnore(idx)} tone="muted">
              Ignore
            </ActionLink>
          </>
        )}
      </div>
    </Card>
  )
}

export default function GapsRail({ gaps = [], extractionId }) {
  const { toast } = useToast()
  const [states, setStates] = useState(() => getGapStates(extractionId))
  const [showIgnored, setShowIgnored] = useState(false)

  // Re-read on extraction change so each opened doc has its own gap states
  useEffect(() => {
    setStates(getGapStates(extractionId))
    setShowIgnored(false)
  }, [extractionId])

  // Tag gaps with their original index so we never lose alignment as we sort
  const indexed = useMemo(
    () =>
      gaps.map((g, idx) => ({
        gap: g,
        idx,
        state: states[idx] || {},
      })),
    [gaps, states],
  )

  // Sort active by severity (resolved go to bottom of active list)
  const active = indexed
    .filter((x) => !x.state.ignored)
    .sort((a, b) => {
      // Unresolved first, then by severity
      const ar = a.state.resolved ? 1 : 0
      const br = b.state.resolved ? 1 : 0
      if (ar !== br) return ar - br
      return (SEVERITY_ORDER[a.gap.severity] ?? 99) - (SEVERITY_ORDER[b.gap.severity] ?? 99)
    })

  const ignored = indexed.filter((x) => x.state.ignored)
  const resolvedCount = active.filter((x) => x.state.resolved).length
  const openCount = active.length - resolvedCount

  const update = (idx, patch) => {
    setGapState(extractionId, idx, patch)
    setStates(getGapStates(extractionId))
  }

  const onResolve = (idx) => {
    update(idx, { resolved: true, ignored: false })
    toast.success('Gap resolved')
  }

  const onReopen = (idx) => {
    update(idx, { resolved: false })
    toast.info('Gap reopened')
  }

  const onIgnore = (idx) => {
    update(idx, { ignored: true, resolved: false })
    toast.success('Gap ignored — moved to footer')
  }

  const onRestore = (idx) => {
    update(idx, { ignored: false })
  }

  const onAsk = async (idx, gap) => {
    const md = formatGapMarkdown(gap)
    const ok = await copyToClipboard(md)
    if (ok) {
      update(idx, { askedAt: new Date().toISOString() })
      toast.success('Stakeholder question copied to clipboard', { duration: 3000 })
    } else {
      toast.error('Could not copy — your browser blocked clipboard access')
    }
  }

  return (
    <aside
      style={{
        width: 320,
        background: 'var(--bg-subtle)',
        borderLeft: '1px solid var(--border)',
        overflowY: 'auto',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px 18px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-subtle)',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IconTile tone="warn" size={32}>
            <AlertTriangle size={15} />
          </IconTile>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--text-strong)',
                lineHeight: 1.2,
              }}
            >
              Gaps & questions
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: 'var(--text-soft)',
                marginTop: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              <span>
                {openCount} open
                {resolvedCount > 0 && (
                  <>
                    {' '}
                    · <span style={{ color: 'var(--success-ink)' }}>{resolvedCount} resolved</span>
                  </>
                )}
                {ignored.length > 0 && (
                  <>
                    {' '}· {ignored.length} ignored
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          padding: '14px 14px 30px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          flex: 1,
        }}
      >
        {gaps.length === 0 && (
          <Card
            padding={20}
            style={{
              textAlign: 'center',
              background: 'var(--success-soft)',
              borderColor: 'transparent',
            }}
          >
            <IconTile tone="success" size={36} style={{ margin: '0 auto 10px' }}>
              <CheckCircle size={16} />
            </IconTile>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success-ink)', marginBottom: 4 }}>
              No gaps detected
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--success-ink)', opacity: 0.8 }}>
              The source covered the bases.
            </div>
          </Card>
        )}

        {/* Active gaps (open + resolved) */}
        {active.map(({ gap, idx, state }, i) => (
          <GapCard
            key={`${extractionId || 'cur'}-${idx}`}
            gap={gap}
            idx={idx}
            state={state}
            onResolve={onResolve}
            onIgnore={onIgnore}
            onAsk={onAsk}
            onReopen={onReopen}
          />
        ))}

        {/* Ignored footer */}
        {ignored.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setShowIgnored((s) => !s)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                width: '100%',
                padding: '8px 10px',
                background: 'transparent',
                border: '1px dashed var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'inherit',
                transition: 'border-color .12s, color .12s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-strong)'
                e.currentTarget.style.color = 'var(--text)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              {showIgnored ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {ignored.length} ignored
            </button>

            {showIgnored && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {ignored.map(({ gap, idx }) => (
                  <div
                    key={`ig-${idx}`}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-elevated)',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {gap.question}
                    </span>
                    <ActionLink onClick={() => onRestore(idx)}>Restore</ActionLink>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
