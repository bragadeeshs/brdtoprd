import React, { useEffect, useRef, useState } from 'react'
import { copyToClipboard } from '../lib/clipboard.js'
import { useToast } from './Toast.jsx'
import { Badge, Card, IconTile } from './primitives.jsx'
import { EditableList, EditableText, EditableTextarea } from './Editable.jsx'
import {
  Sparkles,
  Users,
  FileText,
  Activity,
  Zap,
  Eye,
  Shield,
  Hash,
  Tag,
  Check,
  ChevronRight,
  Copy,
  User,
} from './icons.jsx'

function SectionHeader({ icon, tone, title, count, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <IconTile tone={tone} size={36}>
        {icon}
      </IconTile>
      <div style={{ flex: 1 }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 17,
            fontWeight: 600,
            color: 'var(--text-strong)',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h2>
        {count != null && (
          <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>
            {count} {count === 1 ? 'item' : 'items'}
          </div>
        )}
      </div>
      {action}
    </div>
  )
}

function formatStoryMarkdown(s) {
  const lines = [
    `### ${s.id} — ${s.actor}`,
    `**As a** ${s.actor} **I want** ${s.want} **so that** ${s.so_that}`,
  ]
  if (s.section) lines.push(`*Source: ${s.section}*`)
  if (s.criteria?.length) {
    lines.push('')
    lines.push('**Acceptance criteria:**')
    s.criteria.forEach((c) => lines.push(`- ${c}`))
  }
  if (s.source_quote) {
    lines.push('')
    lines.push(`> ${s.source_quote}`)
  }
  return lines.join('\n')
}

/* M5.1/M5.2 — verbatim source snippet. Clickable when `onPick` is wired —
 * sends the quote up to App.jsx which forwards it to SourcePane to scroll +
 * flash. We render a button (not a div) when clickable so it gets focus +
 * keyboard activation for free. */
function SourceQuote({ text, compact = false, onPick }) {
  if (!text) return null
  const interactive = typeof onPick === 'function'
  const baseStyle = {
    marginTop: compact ? 6 : 12,
    paddingLeft: 10,
    borderLeft: '2px solid var(--border)',
    fontSize: compact ? 11.5 : 12.5,
    lineHeight: 1.5,
    color: 'var(--text-soft)',
    fontStyle: 'italic',
    textAlign: 'left',
  }
  if (!interactive) {
    return (
      <div style={baseStyle} title="Source quote">
        “{text}”
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onPick(text)}
      title="Click to find in source"
      className="quote-pick"
      style={{
        ...baseStyle,
        background: 'transparent',
        border: 'none',
        borderLeft: '2px solid var(--border)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        width: '100%',
        display: 'block',
        transition: 'border-color .12s, color .12s',
      }}
    >
      “{text}”
    </button>
  )
}

function StoryCard({ story, idx, onCopy, onPickQuote, onUpdate, onRemove }) {
  const editable = typeof onUpdate === 'function'
  const removable = typeof onRemove === 'function'
  const update = (patch) => onUpdate?.({ ...story, ...patch })
  return (
    <Card
      hover
      padding={16}
      className="has-action"
      style={{
        animation: `fade-in .3s ease-out ${Math.min(idx * 60, 600)}ms both`,
        position: 'relative',
      }}
    >
      {/* Hover-revealed action cluster: copy + (delete when editable). */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          display: 'flex',
          gap: 2,
          zIndex: 1,
        }}
      >
        <button
          type="button"
          className="row-action"
          aria-label={`Copy ${story.id} as markdown`}
          title="Copy as markdown"
          onClick={() => onCopy(story)}
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
            aria-label={`Delete ${story.id}`}
            title="Delete story"
            onClick={() => {
              if (window.confirm(`Delete ${story.id}?`)) onRemove()
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

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingRight: 28 }}>
        <Badge tone="accent" size="sm">
          {story.id}
        </Badge>
        <Badge tone="neutral" size="sm" icon={<User size={11} />}>
          {editable ? (
            <EditableText value={story.actor} onSave={(v) => update({ actor: v })} placeholder="Actor" />
          ) : (
            story.actor
          )}
        </Badge>
        <div style={{ flex: 1 }} />
        {(editable || story.section) && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-soft)',
            }}
          >
            {editable ? (
              <EditableText
                value={story.section}
                placeholder="§ ?"
                onSave={(v) => update({ section: v })}
              />
            ) : (
              story.section
            )}
          </span>
        )}
      </div>

      {/* Story body — As a / I want / so that, each clickable to edit */}
      <div style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--text)' }}>
        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>As a</span>{' '}
        {editable ? (
          <EditableText value={story.actor} onSave={(v) => update({ actor: v })} placeholder="actor" />
        ) : (
          story.actor
        )}{' '}
        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>I want</span>{' '}
        {editable ? (
          <EditableTextarea
            value={story.want}
            onSave={(v) => update({ want: v })}
            placeholder="capability"
            rows={2}
            displayStyle={{ display: 'inline' }}
          />
        ) : (
          story.want
        )}{' '}
        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>so that</span>{' '}
        {editable ? (
          <EditableTextarea
            value={story.so_that}
            onSave={(v) => update({ so_that: v })}
            placeholder="outcome"
            rows={2}
            displayStyle={{ display: 'inline' }}
          />
        ) : (
          story.so_that
        )}
      </div>

      {/* Source quote — verbatim snippet that grounds this story (M5.1).
       * Clicking sends the quote up to App.jsx which forwards to SourcePane. */}
      <SourceQuote text={story.source_quote} onPick={onPickQuote} />

      {/* Acceptance criteria — editable list when onUpdate is wired. We
       * render the section even when empty in editable mode so users can
       * "+ Add" the first item. */}
      {(story.criteria?.length > 0 || editable) && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              color: 'var(--text-soft)',
              marginBottom: 8,
            }}
          >
            Acceptance criteria
          </div>
          {editable ? (
            <EditableList
              items={story.criteria || []}
              onSave={(next) => update({ criteria: next })}
              placeholder="New criterion"
              addLabel="+ Add criterion"
              bulletRender={() => (
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    background: 'var(--success-soft)',
                    color: 'var(--success-ink)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  <Check size={11} />
                </span>
              )}
              itemStyle={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text)' }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {story.criteria.map((c, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: 'var(--text)',
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 999,
                      background: 'var(--success-soft)',
                      color: 'var(--success-ink)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    <Check size={11} />
                  </span>
                  <span>{c}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

/* Map common NFR categories to icon + tone */
function nfrIcon(category) {
  const c = (category || '').toLowerCase()
  if (c.includes('perf') || c.includes('latency') || c.includes('speed'))
    return { icon: <Zap size={14} />, tone: 'warn' }
  if (c.includes('avail') || c.includes('uptime') || c.includes('sla'))
    return { icon: <Activity size={14} />, tone: 'success' }
  if (c.includes('access') || c.includes('a11y') || c.includes('wcag'))
    return { icon: <Eye size={14} />, tone: 'info' }
  if (c.includes('pci') || c.includes('compli') || c.includes('secur') || c.includes('gdpr'))
    return { icon: <Shield size={14} />, tone: 'purple' }
  return { icon: <Hash size={14} />, tone: 'neutral' }
}

const SECTIONS = [
  { id: 'brief', label: 'Brief' },
  { id: 'actors', label: 'Actors' },
  { id: 'stories', label: 'Stories' },
  { id: 'nfrs', label: 'NFRs' },
]

export default function ArtifactsPane({ extraction, onPickQuote, onUpdate, onRegenSection, regenBusy }) {
  // Per-artifact callbacks: each takes the new piece + applies to the
  // corresponding array, then calls the parent's onUpdate({field: ...}).
  const editable = typeof onUpdate === 'function'
  const updateStory = (i, story) => {
    if (!editable) return
    const next = [...extraction.stories]
    next[i] = story
    onUpdate({ stories: next })
  }
  const removeStory = (i) => {
    if (!editable) return
    const next = extraction.stories.filter((_, idx) => idx !== i)
    onUpdate({ stories: next })
  }
  const updateNfr = (i, patch) => {
    if (!editable) return
    const next = [...extraction.nfrs]
    next[i] = { ...next[i], ...patch }
    onUpdate({ nfrs: next })
  }
  const removeNfr = (i) => {
    if (!editable) return
    const next = extraction.nfrs.filter((_, idx) => idx !== i)
    onUpdate({ nfrs: next })
  }
  const updateBrief = (patch) => {
    if (!editable) return
    onUpdate({ brief: { ...extraction.brief, ...patch } })
  }
  const updateActors = (next) => {
    if (!editable) return
    onUpdate({ actors: next })
  }

  // M4.3 — append empty artifacts. Defaults are tuned so the new card
  // immediately renders without crashing (every required field present)
  // and the empty placeholders nudge the user to click in and fill them.
  // For stories, the next sequential US-NN id is generated by counting
  // current stories — collisions would only happen if the user has been
  // deleting *and* the model is producing US-NN ids from cached state,
  // which we accept as low-risk for v1.
  const addStory = () => {
    if (!editable) return
    const nextNum = (extraction.stories?.length || 0) + 1
    const newStory = {
      id: `US-${String(nextNum).padStart(2, '0')}`,
      actor: '',
      want: '',
      so_that: '',
      section: '',
      criteria: [],
      source_quote: '',
    }
    onUpdate({ stories: [...(extraction.stories || []), newStory] })
  }
  const addNfr = () => {
    if (!editable) return
    const newNfr = { category: '', value: '', source_quote: '' }
    onUpdate({ nfrs: [...(extraction.nfrs || []), newNfr] })
  }
  const containerRef = useRef(null)
  const [activeTab, setActiveTab] = useState('brief')
  const userClickRef = useRef(false)
  const { toast } = useToast()

  const onCopyStory = async (story) => {
    const ok = await copyToClipboard(formatStoryMarkdown(story))
    if (ok) toast.success(`${story.id} copied as markdown`, { duration: 2500 })
    else toast.error('Could not copy — your browser blocked clipboard access')
  }

  // Re-derived per render — cheap, and makes the tab counts stay in sync.
  const counts = {
    brief: null,
    actors: extraction.actors.length,
    stories: extraction.stories.length,
    nfrs: extraction.nfrs.length,
  }

  // Scroll-spy: highlight whichever section is currently in the upper-third
  // band of the scroll container.
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const els = SECTIONS.map((s) => document.getElementById(`sec-${s.id}`)).filter(Boolean)
    if (els.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (userClickRef.current) return // ignore observer flicker during programmatic scroll
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveTab(entry.target.dataset.section)
          }
        })
      },
      {
        root,
        // 5% trigger band located 30% down from the top of the scroll area
        rootMargin: '-30% 0px -65% 0px',
        threshold: 0,
      },
    )

    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [extraction])

  const onTabClick = (id) => {
    const el = document.getElementById(`sec-${id}`)
    if (!el) return
    setActiveTab(id)
    // Suppress the observer briefly so the smooth scroll doesn't flicker the
    // tab through every section it passes en route.
    userClickRef.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(() => {
      userClickRef.current = false
    }, 600)
  }

  return (
    <section
      ref={containerRef}
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '24px 28px 48px',
        minWidth: 0,
        background: 'var(--bg)',
      }}
    >
      {/* Tab pills — segmented control, scrolls section into view + scroll-spy */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginBottom: 24,
          flexWrap: 'wrap',
          padding: 4,
          background: 'var(--bg-subtle)',
          borderRadius: 'var(--radius-pill)',
          width: 'fit-content',
          position: 'sticky',
          top: 0,
          zIndex: 5,
          boxShadow: '0 0 0 4px var(--bg)',
        }}
      >
        {SECTIONS.map((s) => {
          const isActive = activeTab === s.id
          const count = counts[s.id]
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onTabClick(s.id)}
              aria-current={isActive ? 'true' : undefined}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-pill)',
                fontSize: 12,
                fontWeight: 500,
                color: isActive ? 'var(--text-strong)' : 'var(--text-muted)',
                background: isActive ? 'var(--bg-elevated)' : 'transparent',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                transition: 'background .12s, color .12s, box-shadow .12s',
                boxShadow: isActive ? 'var(--shadow-xs)' : 'none',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => {
                if (isActive) return
                e.currentTarget.style.color = 'var(--text-strong)'
              }}
              onMouseLeave={(e) => {
                if (isActive) return
                e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              {s.label}
              {count != null && (
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    color: isActive ? 'var(--accent-strong)' : 'var(--text-soft)',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Brief */}
      <div id="sec-brief" data-section="brief" style={{ marginBottom: 24, scrollMarginTop: 60 }} className="fade-in">
        <SectionHeader
          icon={<Sparkles size={16} />}
          tone="accent"
          title="Business summary"
        />
        <Card padding={20} style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.65,
              color: 'var(--accent-ink)',
              marginBottom: 14,
            }}
          >
            {editable ? (
              <EditableTextarea
                value={extraction.brief.summary}
                onSave={(v) => updateBrief({ summary: v })}
                placeholder="One-line business summary"
                rows={3}
              />
            ) : (
              extraction.brief.summary
            )}
          </div>
          {editable ? (
            <EditableList
              items={extraction.brief.tags || []}
              onSave={(next) => updateBrief({ tags: next })}
              placeholder="Tag"
              addLabel="+ Add tag"
              bulletRender={() => <Tag size={11} style={{ color: 'var(--accent-ink)' }} />}
              itemStyle={{ alignItems: 'center' }}
            />
          ) : (
            extraction.brief.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {extraction.brief.tags.map((t) => (
                  <Badge key={t} tone="outline" icon={<Tag size={11} />}>
                    {t}
                  </Badge>
                ))}
              </div>
            )
          )}
        </Card>
      </div>

      {/* Actors */}
      <div id="sec-actors" data-section="actors" style={{ marginBottom: 24, scrollMarginTop: 60 }} className="fade-in">
        <SectionHeader
          icon={<Users size={16} />}
          tone="info"
          title="Actors"
          count={extraction.actors.length}
        />
        {editable ? (
          <Card padding={12} style={{ maxWidth: 480 }}>
            <EditableList
              items={extraction.actors || []}
              onSave={updateActors}
              placeholder="Actor name"
              addLabel="+ Add actor"
              bulletRender={() => (
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: 'var(--info-soft)',
                    color: 'var(--info-ink)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <User size={12} />
                </span>
              )}
              itemStyle={{ fontSize: 13, color: 'var(--text-strong)', alignItems: 'center' }}
            />
          </Card>
        ) : extraction.actors.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {extraction.actors.map((a) => (
              <Card key={a} hover padding="10px 14px" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    background: 'var(--info-soft)',
                    color: 'var(--info-ink)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <User size={13} />
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: 500 }}>{a}</span>
              </Card>
            ))}
          </div>
        ) : (
          <EmptySection label="No actors extracted." />
        )}
      </div>

      {/* User stories */}
      <div id="sec-stories" data-section="stories" style={{ marginBottom: 24, scrollMarginTop: 60 }} className="fade-in">
        <SectionHeader
          icon={<FileText size={16} />}
          tone="purple"
          title="User stories"
          count={extraction.stories.length}
          action={
            typeof onRegenSection === 'function' && (
              <RegenButton
                onClick={() => onRegenSection('stories')}
                busy={regenBusy === 'stories'}
                disabled={!!regenBusy}
              />
            )
          }
        />
        {extraction.stories.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {extraction.stories.map((s, i) => (
              <StoryCard
                key={s.id}
                story={s}
                idx={i}
                onCopy={onCopyStory}
                onPickQuote={onPickQuote}
                onUpdate={editable ? (next) => updateStory(i, next) : undefined}
                onRemove={editable ? () => removeStory(i) : undefined}
              />
            ))}
          </div>
        ) : (
          !editable && <EmptySection label="No user stories extracted." />
        )}
        {editable && <AddArtifactButton label="+ Add story" onClick={addStory} />}
      </div>

      {/* NFRs as a proper table */}
      <div id="sec-nfrs" data-section="nfrs" style={{ marginBottom: 24, scrollMarginTop: 60 }} className="fade-in">
        <SectionHeader
          icon={<Shield size={16} />}
          tone="success"
          title="Non-functional requirements"
          count={extraction.nfrs.length}
          action={
            typeof onRegenSection === 'function' && (
              <RegenButton
                onClick={() => onRegenSection('nfrs')}
                busy={regenBusy === 'nfrs'}
                disabled={!!regenBusy}
              />
            )
          }
        />
        {extraction.nfrs.length ? (
          <Card padding={0} style={{ overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Category</th>
                  <th>Value</th>
                  {editable && <th style={{ width: 32 }}></th>}
                </tr>
              </thead>
              <tbody>
                {extraction.nfrs.map((n, i) => {
                  const meta = nfrIcon(n.category)
                  return (
                    <tr key={i}>
                      <td>
                        <IconTile tone={meta.tone} size={28}>
                          {meta.icon}
                        </IconTile>
                      </td>
                      <td style={{ fontWeight: 500, color: 'var(--text-strong)' }}>
                        {editable ? (
                          <EditableText
                            value={n.category}
                            onSave={(v) => updateNfr(i, { category: v })}
                            placeholder="Category"
                          />
                        ) : (
                          n.category
                        )}
                      </td>
                      <td
                        style={{
                          color: 'var(--text)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12.5,
                        }}
                      >
                        {editable ? (
                          <EditableText
                            value={n.value}
                            onSave={(v) => updateNfr(i, { value: v })}
                            placeholder="Value"
                          />
                        ) : (
                          n.value
                        )}
                        {n.source_quote &&
                          (typeof onPickQuote === 'function' ? (
                            <button
                              type="button"
                              onClick={() => onPickQuote(n.source_quote)}
                              title="Click to find in source"
                              className="quote-pick"
                              style={{
                                display: 'block',
                                marginTop: 4,
                                background: 'transparent',
                                border: 'none',
                                padding: 0,
                                fontFamily: 'inherit',
                                fontSize: 11.5,
                                fontStyle: 'italic',
                                color: 'var(--text-soft)',
                                lineHeight: 1.4,
                                cursor: 'pointer',
                                textAlign: 'left',
                                width: '100%',
                              }}
                            >
                              “{n.source_quote}”
                            </button>
                          ) : (
                            <div
                              style={{
                                marginTop: 4,
                                fontFamily: 'inherit',
                                fontSize: 11.5,
                                fontStyle: 'italic',
                                color: 'var(--text-soft)',
                                lineHeight: 1.4,
                              }}
                              title="Source quote"
                            >
                              “{n.source_quote}”
                            </div>
                          ))}
                      </td>
                      {editable && (
                        <td style={{ verticalAlign: 'top', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Delete NFR "${n.category || 'untitled'}"?`)) removeNfr(i)
                            }}
                            aria-label="Delete NFR"
                            title="Delete NFR"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-soft)',
                              cursor: 'pointer',
                              fontSize: 16,
                              lineHeight: 1,
                              padding: '2px 6px',
                              opacity: 0.6,
                            }}
                          >
                            ×
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        ) : (
          !editable && <EmptySection label="No non-functional requirements extracted." />
        )}
        {editable && <AddArtifactButton label="+ Add NFR" onClick={addNfr} />}
      </div>
    </section>
  )
}

/* M4.4 — "Regen" button rendered in the section header's action slot.
 * Disabled + spinner-labeled while a regen is in flight (any section — we
 * disable all of them while one runs to keep the UI honest about cost). */
export function RegenButton({ onClick, busy = false, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      title="Ask Claude to redraft this section using your edits as context"
      style={{
        background: busy ? 'var(--bg-hover)' : 'transparent',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-pill)',
        color: busy ? 'var(--text-muted)' : 'var(--accent-strong)',
        cursor: busy || disabled ? 'wait' : 'pointer',
        fontSize: 11.5,
        fontWeight: 500,
        padding: '4px 10px',
        fontFamily: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
      onMouseEnter={(e) => {
        if (busy || disabled) return
        e.currentTarget.style.background = 'var(--accent-soft)'
        e.currentTarget.style.borderColor = 'var(--accent)'
      }}
      onMouseLeave={(e) => {
        if (busy || disabled) return
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.borderColor = 'var(--border-strong)'
      }}
    >
      {busy ? '⟳ Regenerating…' : '↻ Regen'}
    </button>
  )
}

/* M4.3 — small "+ Add story / NFR / gap" button used at the foot of each
 * editable section. Aligned left, accent-coloured, no border so it doesn't
 * compete with the artifact cards above. */
function AddArtifactButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginTop: 12,
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
      {label}
    </button>
  )
}

function EmptySection({ label }) {
  return (
    <div
      style={{
        padding: '20px',
        background: 'var(--bg-subtle)',
        border: '1px dashed var(--border)',
        borderRadius: 'var(--radius)',
        fontSize: 12.5,
        color: 'var(--text-soft)',
        fontStyle: 'italic',
        textAlign: 'center',
      }}
    >
      {label}
    </div>
  )
}
