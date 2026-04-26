import React, { useEffect, useMemo, useState } from 'react'
import { getGapStates, setGapState } from '../lib/store.js'
import { copyToClipboard } from '../lib/clipboard.js'
import { useToast } from './Toast.jsx'
import { Badge, Card, IconTile } from './primitives.jsx'
import { EditableSelect, EditableText, EditableTextarea } from './Editable.jsx'
import { RegenButton } from './ArtifactsPane.jsx'
import { docNameFor, parseDocNames } from '../lib/multi_doc.js'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  HelpCircle,
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
  if (g.source_quote) {
    lines.push('')
    lines.push(`> ${g.source_quote}`)
  }
  return lines.join('\n')
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

function GapCard({ gap, idx, state, onResolve, onIgnore, onAsk, onReopen, onCopy, onPickQuote, onUpdate, onRemove, docName }) {
  const meta = SEVERITY_META[gap.severity] || SEVERITY_META.low
  const isResolved = !!state?.resolved
  const wasAsked = !!state?.askedAt
  const editable = typeof onUpdate === 'function'
  const removable = typeof onRemove === 'function'
  const update = (patch) => onUpdate?.({ ...gap, ...patch })

  return (
    <Card
      hover={!isResolved}
      padding={14}
      className="has-action"
      style={{
        animation: `fade-in .25s ease-out ${Math.min(idx * 40, 400)}ms both`,
        opacity: isResolved ? 0.65 : 1,
        position: 'relative',
      }}
    >
      {/* Floating action cluster — copy + (delete when editable). */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          display: 'flex',
          gap: 2,
          zIndex: 1,
        }}
      >
        <button
          type="button"
          className="row-action"
          aria-label="Copy gap as markdown"
          title="Copy as markdown"
          onClick={() => onCopy(gap)}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 5,
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Copy size={13} />
        </button>
        {removable && (
          <button
            type="button"
            className="row-action"
            aria-label="Delete gap"
            title="Delete gap"
            onClick={() => {
              if (window.confirm('Delete this gap?')) onRemove()
            }}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 5,
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Header row: severity badge + section ref. Severity becomes a
       *  picklist when editable; section becomes a text field. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingRight: 28 }}>
        {isResolved ? (
          <Badge tone="success" icon={<Check size={11} />} size="sm">
            Resolved
          </Badge>
        ) : editable ? (
          <Badge tone={meta.tone} icon={meta.icon} size="sm">
            <EditableSelect
              value={gap.severity}
              options={[
                { value: 'high', label: 'High' },
                { value: 'med', label: 'Medium' },
                { value: 'low', label: 'Low' },
              ]}
              onSave={(v) => update({ severity: v })}
              renderDisplay={(v) => SEVERITY_META[v]?.label || v}
            />
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
        {(editable || gap.section) && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-soft)',
            }}
          >
            {editable ? (
              <EditableText
                value={gap.section}
                placeholder="§ ?"
                onSave={(v) => update({ section: v })}
              />
            ) : (
              gap.section
            )}
          </span>
        )}
        {docName && (
          <span
            title={`From ${docName}`}
            style={{
              padding: '2px 6px', borderRadius: 'var(--radius-pill)',
              background: 'var(--bg-subtle)', color: 'var(--text-soft)',
              fontSize: 10, fontWeight: 500, fontFamily: 'var(--font-mono)',
              maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            📄 {docName}
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
        {editable ? (
          <EditableTextarea
            value={gap.question}
            onSave={(v) => update({ question: v })}
            placeholder="What is the open question?"
            rows={2}
          />
        ) : (
          gap.question
        )}
      </div>

      {/* Context */}
      {(editable || gap.context) && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            lineHeight: 1.55,
            marginBottom: 10,
          }}
        >
          {editable ? (
            <EditableTextarea
              value={gap.context}
              onSave={(v) => update({ context: v })}
              placeholder="Why is this a gap?"
              rows={2}
            />
          ) : (
            gap.context
          )}
        </div>
      )}

      {/* Source quote — verbatim passage that makes the gap evident (M5.1).
       * Empty for "absence-of-info" gaps, where context already paraphrases.
       * Clickable when onPickQuote is wired (M5.2). */}
      {gap.source_quote &&
        (typeof onPickQuote === 'function' ? (
          <button
            type="button"
            onClick={() => onPickQuote(gap.source_quote)}
            title="Click to find in source"
            className="quote-pick"
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              paddingLeft: 10,
              border: 'none',
              borderLeft: '2px solid var(--border)',
              background: 'transparent',
              fontFamily: 'inherit',
              fontSize: 11.5,
              lineHeight: 1.5,
              color: 'var(--text-soft)',
              fontStyle: 'italic',
              marginBottom: 10,
              cursor: 'pointer',
            }}
          >
            “{gap.source_quote}”
          </button>
        ) : (
          <div
            style={{
              paddingLeft: 10,
              borderLeft: '2px solid var(--border)',
              fontSize: 11.5,
              lineHeight: 1.5,
              color: 'var(--text-soft)',
              fontStyle: 'italic',
              marginBottom: 10,
            }}
            title="Source quote"
          >
            “{gap.source_quote}”
          </div>
        ))}

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

const SEVERITY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'high', label: 'High' },
  { id: 'med', label: 'Medium' },
  { id: 'low', label: 'Low' },
]

export default function GapsRail({ gaps = [], extractionId, onPickQuote, onUpdate, onRegen, regenBusy, rawText }) {
  // M7.5.c — pull doc-name list from raw_text (single-doc → [""], no badges).
  const docNames = useMemo(() => parseDocNames(rawText || ''), [rawText])
  const isMultiDoc = docNames.length > 1
  // M4.1 — gap-level edits. Each card edits its own slot; we hand back the
  // full new gaps array to the parent's onUpdate callback (App.jsx wraps it
  // into a {gaps: ...} PATCH).
  const editable = typeof onUpdate === 'function'
  const updateGap = (i, next) => {
    if (!editable) return
    const arr = [...gaps]
    arr[i] = next
    onUpdate(arr)
  }
  // M4.3 — add a fresh gap (medium severity, empty fields). User clicks
  // each placeholder to fill in.
  const addGap = () => {
    if (!editable) return
    const newGap = { severity: 'med', question: '', section: '', context: '', source_quote: '' }
    onUpdate([...gaps, newGap])
  }
  // M4.3 — delete a gap entirely. The existing "ignored" state is for
  // dismissing without removing; this is the harder destructive case
  // (e.g. a gap was added by mistake or the model hallucinated it).
  const removeGap = (i) => {
    if (!editable) return
    onUpdate(gaps.filter((_, idx) => idx !== i))
  }
  const { toast } = useToast()
  const [states, setStates] = useState({})
  const [showIgnored, setShowIgnored] = useState(false)
  const [filter, setFilter] = useState('all')

  // Re-fetch on extraction change so each opened doc has its own gap states.
  // Guarded by an alive flag to avoid setting state from a stale request after
  // the user clicked into another extraction mid-flight.
  useEffect(() => {
    let alive = true
    setStates({})
    setShowIgnored(false)
    setFilter('all')
    if (!extractionId) return
    getGapStates(extractionId)
      .then((next) => { if (alive) setStates(next) })
      .catch(() => { /* leave empty; user can still resolve/ignore */ })
    return () => { alive = false }
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

  // Optimistic update — write to local state, then persist. Revert on failure.
  const update = (idx, patch) => {
    if (!extractionId) return
    const prev = states[idx] || {}
    const optimistic = { ...prev, ...patch }
    setStates((s) => ({ ...s, [idx]: optimistic }))
    setGapState(extractionId, idx, patch)
      .then((settled) => {
        if (settled) setStates((s) => ({ ...s, [idx]: settled }))
      })
      .catch((e) => {
        setStates((s) => ({ ...s, [idx]: prev }))
        toast.error(e.message || 'Could not save change')
      })
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

  const onCopy = async (gap) => {
    const ok = await copyToClipboard(formatGapMarkdown(gap))
    if (ok) toast.success('Gap copied as markdown', { duration: 2500 })
    else toast.error('Could not copy — your browser blocked clipboard access')
  }

  // Apply severity filter to active list (ignored + footer untouched)
  const filteredActive = active.filter((x) => filter === 'all' || x.gap.severity === filter)

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
          <div style={{ flex: 1, minWidth: 0 }}>
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
          {typeof onRegen === 'function' && (
            <RegenButton onClick={onRegen} busy={!!regenBusy} />
          )}
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

        {/* Severity filter (only when there's something to filter) */}
        {active.length > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: 3,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-pill)',
              marginBottom: 2,
              boxShadow: 'var(--shadow-xs)',
              alignSelf: 'flex-start',
            }}
          >
            {SEVERITY_FILTERS.map((f) => {
              const isOn = filter === f.id
              const count = f.id === 'all' ? active.length : active.filter((x) => x.gap.severity === f.id).length
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  aria-current={isOn ? 'true' : undefined}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: 11.5,
                    fontWeight: 500,
                    color: isOn ? 'var(--text-strong)' : 'var(--text-muted)',
                    background: isOn ? 'var(--bg-subtle)' : 'transparent',
                    border: 'none',
                    cursor: count === 0 ? 'not-allowed' : 'pointer',
                    opacity: count === 0 && !isOn ? 0.4 : 1,
                    fontFamily: 'inherit',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'background .12s, color .12s',
                  }}
                  disabled={count === 0 && !isOn}
                >
                  {f.label}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-soft)' }}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Active gaps (open + resolved) */}
        {filteredActive.map(({ gap, idx, state }) => (
          <GapCard
            key={`${extractionId || 'cur'}-${idx}`}
            gap={gap}
            idx={idx}
            state={state}
            onResolve={onResolve}
            onIgnore={onIgnore}
            onAsk={onAsk}
            onReopen={onReopen}
            onCopy={onCopy}
            onPickQuote={onPickQuote}
            onUpdate={editable ? (next) => updateGap(idx, next) : undefined}
            onRemove={editable ? () => removeGap(idx) : undefined}
            docName={isMultiDoc ? docNameFor(docNames, gap.source_doc) : ''}
          />
        ))}

        {/* M4.3 — append a fresh gap. Lives inside the active list so it's
         * visually grouped with the open work; we don't add to ignored or
         * resolved buckets. */}
        {editable && (
          <button
            type="button"
            onClick={addGap}
            style={{
              marginTop: 8,
              background: 'transparent',
              border: '1px dashed var(--border-strong)',
              borderRadius: 'var(--radius)',
              color: 'var(--accent-strong)',
              cursor: 'pointer',
              fontSize: 12.5,
              fontWeight: 500,
              padding: '8px 14px',
              fontFamily: 'inherit',
              transition: 'background .12s, border-color .12s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent-soft)'
              e.currentTarget.style.borderColor = 'var(--accent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = 'var(--border-strong)'
            }}
          >
            + Add gap
          </button>
        )}

        {filteredActive.length === 0 && active.length > 0 && (
          <div
            style={{
              padding: '20px 12px',
              textAlign: 'center',
              fontSize: 12,
              color: 'var(--text-soft)',
              fontStyle: 'italic',
            }}
          >
            No {filter} gaps in this extraction.
          </div>
        )}

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
