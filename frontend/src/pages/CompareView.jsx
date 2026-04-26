import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getExtractionApi, listVersionsApi } from '../api.js'
import { diffExtractions, diffSummary } from '../lib/diff.js'
import { Badge, Card, IconTile, Spinner } from '../components/primitives.jsx'
import {
  AlertTriangle,
  Check,
  ChevronRight,
  FileText,
  Sparkles,
  Shield,
  Users,
} from '../components/icons.jsx'

/* M7.6 — Compare two extractions (typically two rerun versions of the
 * same source). Routed at `/compare/:idA/:idB` — bookmarkable.
 *
 * Design: one-column inline diff (no side-by-side). Five collapsible
 * sections (brief / actors / stories / nfrs / gaps). Each shows a
 * color-coded count badge ("+3 -1 ~2" or "no changes") and, when
 * expanded, the per-item before/after.
 *
 * Not an LLM call — pure client-side diff via lib/diff.js. Both
 * extractions are fetched at mount; no streaming needed.
 */

const TONE = {
  added:    { fg: 'var(--success-ink)', bg: 'var(--success-soft)', icon: '+', label: 'added' },
  removed:  { fg: 'var(--danger-ink)',  bg: 'var(--danger-soft)',  icon: '−', label: 'removed' },
  changed:  { fg: 'var(--warn-ink)',    bg: 'var(--warn-soft)',    icon: '~', label: 'changed' },
}

export default function CompareView() {
  const { idA, idB } = useParams()
  const [state, setState] = useState({ loading: true, a: null, b: null, error: null, versions: null })

  useEffect(() => {
    let cancelled = false
    setState({ loading: true, a: null, b: null, error: null, versions: null })
    Promise.all([getExtractionApi(idA), getExtractionApi(idB)])
      .then(async ([a, b]) => {
        if (cancelled) return
        // Fetch the version chain so we can label "v1 → v3" instead of
        // raw ids. Tolerant of failure — if it 404s, we just show ids.
        let versions = null
        try { versions = await listVersionsApi(idA) } catch { /* ignore */ }
        if (!cancelled) setState({ loading: false, a, b, versions, error: null })
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, a: null, b: null, versions: null, error: err.message || 'Failed to load' })
      })
    return () => { cancelled = true }
  }, [idA, idB])

  if (state.loading) {
    return (
      <Centered>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)' }}>
          <Spinner size={16} /> Loading both versions…
        </div>
      </Centered>
    )
  }
  if (state.error || !state.a || !state.b) {
    return (
      <Centered>
        <Card padding={20} style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={{ fontSize: 13, color: 'var(--danger-ink)', marginBottom: 12 }}>
            {state.error || 'Could not load both versions.'}
          </div>
          <Link to="/" style={{ fontSize: 12.5, color: 'var(--accent-strong)', textDecoration: 'none' }}>
            Go back →
          </Link>
        </Card>
      </Centered>
    )
  }

  const { a, b } = state
  const diff = diffExtractions(a, b)
  // Resolve human version numbers if available; fall back to abbreviated ids.
  const versionLabel = (id) => {
    const v = state.versions?.find((x) => x.id === id)
    if (v) return `v${v.version}`
    return id.slice(-6)
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 40px', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <Link to="/" style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}>
          ← Back
        </Link>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600,
          color: 'var(--text-strong)', margin: '6px 0 4px', letterSpacing: -0.3,
        }}>
          Comparing {versionLabel(a.id)} → {versionLabel(b.id)}
        </h1>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{a.filename}</span> ·{' '}
          {new Date(a.created_at).toLocaleString()} → {new Date(b.created_at).toLocaleString()}
        </div>
      </div>

      {/* Section: Brief */}
      <Section
        icon={<Sparkles size={15} />}
        tone="accent"
        title="Brief"
        summary={diff.brief.fields.length ? `${diff.brief.fields.join(' + ')} changed` : 'no changes'}
        emphasis={diff.brief.fields.length > 0}
      >
        {diff.brief.fields.length === 0 ? (
          <UnchangedNote />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {diff.brief.fields.includes('summary') && (
              <BeforeAfter
                label="Summary"
                before={diff.brief.old.summary}
                after={diff.brief.new.summary}
              />
            )}
            {diff.brief.fields.includes('tags') && (
              <BeforeAfter
                label="Tags"
                before={(diff.brief.old.tags || []).join(', ')}
                after={(diff.brief.new.tags || []).join(', ')}
              />
            )}
          </div>
        )}
      </Section>

      {/* Section: Actors */}
      <Section
        icon={<Users size={15} />}
        tone="info"
        title="Actors"
        summary={diffSummary(diff.actors)}
        emphasis={diff.actors.added.length + diff.actors.removed.length > 0}
      >
        {!diff.actors.added.length && !diff.actors.removed.length ? (
          <UnchangedNote />
        ) : (
          <FlatList added={diff.actors.added} removed={diff.actors.removed} render={(s) => s} />
        )}
      </Section>

      {/* Section: Stories */}
      <Section
        icon={<FileText size={15} />}
        tone="purple"
        title="User stories"
        summary={diffSummary(diff.stories)}
        emphasis={diff.stories.added.length + diff.stories.removed.length + diff.stories.changed.length > 0}
      >
        <ChangeBlocks
          added={diff.stories.added.map((s) => ({ key: s.id, label: `${s.id} — ${s.actor}`, body: storyOneLine(s) }))}
          removed={diff.stories.removed.map((s) => ({ key: s.id, label: `${s.id} — ${s.actor}`, body: storyOneLine(s) }))}
          changed={diff.stories.changed.map((c) => ({
            key: c.new.id,
            label: `${c.new.id} — ${c.new.actor}`,
            fields: c.fields,
            old: c.old,
            new: c.new,
          }))}
          renderChanged={(c) => <StoryChanged item={c} />}
        />
      </Section>

      {/* Section: NFRs */}
      <Section
        icon={<Shield size={15} />}
        tone="success"
        title="Non-functional requirements"
        summary={diffSummary(diff.nfrs)}
        emphasis={diff.nfrs.added.length + diff.nfrs.removed.length + diff.nfrs.changed.length > 0}
      >
        <ChangeBlocks
          added={diff.nfrs.added.map((n) => ({ key: n.category, label: n.category, body: n.value }))}
          removed={diff.nfrs.removed.map((n) => ({ key: n.category, label: n.category, body: n.value }))}
          changed={diff.nfrs.changed.map((c) => ({
            key: c.new.category,
            label: c.new.category,
            fields: c.fields,
            old: c.old,
            new: c.new,
          }))}
          renderChanged={(c) => (
            <BeforeAfter label={c.label} before={c.old.value} after={c.new.value} />
          )}
        />
      </Section>

      {/* Section: Gaps */}
      <Section
        icon={<AlertTriangle size={15} />}
        tone="warn"
        title="Gaps & questions"
        summary={diffSummary(diff.gaps)}
        emphasis={diff.gaps.added.length + diff.gaps.removed.length + diff.gaps.changed.length > 0}
      >
        <ChangeBlocks
          added={diff.gaps.added.map((g) => ({ key: g.question, label: `[${g.severity}] ${g.question}`, body: g.context }))}
          removed={diff.gaps.removed.map((g) => ({ key: g.question, label: `[${g.severity}] ${g.question}`, body: g.context }))}
          changed={diff.gaps.changed.map((c) => ({
            key: c.new.question,
            label: `[${c.new.severity}] ${c.new.question}`,
            fields: c.fields,
            old: c.old,
            new: c.new,
          }))}
          renderChanged={(c) => (
            <BeforeAfter label={c.label} before={c.old.context || '(no context)'} after={c.new.context || '(no context)'} />
          )}
        />
      </Section>
    </div>
  )
}

function Centered({ children }) {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg)' }}>
      {children}
    </div>
  )
}

function Section({ icon, tone, title, summary, emphasis, children }) {
  const [open, setOpen] = useState(emphasis)
  // Reflect emphasis changes (e.g. when the diff completes async).
  useEffect(() => { setOpen(emphasis) }, [emphasis])
  return (
    <Card padding={0} style={{ marginBottom: 12, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', padding: '12px 16px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <IconTile tone={tone} size={28}>{icon}</IconTile>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{title}</div>
          <div style={{
            fontSize: 11.5, color: emphasis ? 'var(--accent-strong)' : 'var(--text-soft)',
            fontFamily: 'var(--font-mono)', marginTop: 2,
          }}>
            {summary}
          </div>
        </div>
        <ChevronRight
          size={14}
          style={{
            color: 'var(--text-soft)',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform .15s',
          }}
        />
      </button>
      {open && <div style={{ padding: '4px 16px 16px' }}>{children}</div>}
    </Card>
  )
}

function UnchangedNote() {
  return (
    <div style={{
      fontSize: 12.5, color: 'var(--text-soft)', fontStyle: 'italic',
      padding: '8px 0',
    }}>
      No changes in this section.
    </div>
  )
}

function FlatList({ added = [], removed = [], render }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {removed.map((item, i) => <Line key={`r${i}`} kind="removed">{render(item)}</Line>)}
      {added.map((item, i) => <Line key={`a${i}`} kind="added">{render(item)}</Line>)}
    </div>
  )
}

function Line({ kind, children }) {
  const t = TONE[kind]
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '4px 8px', borderRadius: 'var(--radius-sm)',
      background: t.bg, color: t.fg, fontSize: 13,
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, lineHeight: 1.4, flexShrink: 0 }}>
        {t.icon}
      </span>
      <span style={{ lineHeight: 1.4 }}>{children}</span>
    </div>
  )
}

function ChangeBlocks({ added = [], removed = [], changed = [], renderChanged }) {
  if (!added.length && !removed.length && !changed.length) {
    return <UnchangedNote />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {removed.map((item) => (
        <Block key={`r-${item.key}`} kind="removed" label={item.label}>
          {item.body && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{item.body}</div>}
        </Block>
      ))}
      {added.map((item) => (
        <Block key={`a-${item.key}`} kind="added" label={item.label}>
          {item.body && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{item.body}</div>}
        </Block>
      ))}
      {changed.map((item) => (
        <Block key={`c-${item.key}`} kind="changed" label={item.label}>
          <div style={{ fontSize: 11, color: 'var(--text-soft)', marginBottom: 6 }}>
            Changed: {item.fields.join(', ')}
          </div>
          {renderChanged(item)}
        </Block>
      ))}
    </div>
  )
}

function Block({ kind, label, children }) {
  const t = TONE[kind]
  return (
    <div style={{
      borderLeft: `3px solid ${t.fg}`,
      background: t.bg,
      padding: '8px 12px',
      borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
    }}>
      <div style={{
        fontSize: 12, fontWeight: 600, color: t.fg,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)' }}>{t.icon}</span>
        <span>{label}</span>
      </div>
      {children}
    </div>
  )
}

function BeforeAfter({ label, before, after }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <div style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </div>
      )}
      <div style={{
        fontSize: 12.5, padding: '6px 10px', borderRadius: 'var(--radius-sm)',
        background: 'var(--danger-soft)', color: 'var(--danger-ink)',
        textDecoration: 'line-through', textDecorationColor: 'rgba(0,0,0,0.25)',
      }}>
        {before || '(empty)'}
      </div>
      <div style={{
        fontSize: 12.5, padding: '6px 10px', borderRadius: 'var(--radius-sm)',
        background: 'var(--success-soft)', color: 'var(--success-ink)',
      }}>
        {after || '(empty)'}
      </div>
    </div>
  )
}

function StoryChanged({ item }) {
  // Show field-level before/after for the most editable story fields.
  // Skip source_quote field-level diff to keep the panel scannable —
  // the user can switch to the version directly to see the full quote.
  const interesting = ['actor', 'want', 'so_that', 'criteria', 'section']
  const fields = item.fields.filter((f) => interesting.includes(f))
  if (!fields.length) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
        Changes in source_quote only.
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {fields.map((f) => {
        const before = formatStoryField(f, item.old[f])
        const after = formatStoryField(f, item.new[f])
        return <BeforeAfter key={f} label={f.replace('_', ' ')} before={before} after={after} />
      })}
    </div>
  )
}

function formatStoryField(field, value) {
  if (field === 'criteria') return (value || []).map((c) => `• ${c}`).join('\n') || '(none)'
  return (value ?? '').toString()
}

function storyOneLine(s) {
  const w = s.want ? `I want ${s.want}` : ''
  return [w, s.so_that ? `so that ${s.so_that}` : ''].filter(Boolean).join(', ')
}
