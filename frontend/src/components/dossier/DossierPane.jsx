/**
 * M14.1.b — DossierPane: renders the M14 narrated dossier.
 *
 * Reads `extraction.lens_payload` (the DocumentDossier JSON the backend
 * persists when lens='dossier'). Renders:
 *
 *   [Sticky chapter nav: I · II · III · IV]
 *   ─── Overture (italic, large, centred) ───
 *   ACT I — ORIENT
 *     Brief · TLDR Ladder · 5W1H            (separated by italic narrator bridges)
 *   ACT II — STRUCTURE
 *     Glossary · Mindmap · Domain · Systems
 *   ACT III — INTERROGATE
 *     5 Whys · Assumptions · Inversion · Better Questions
 *   ACT IV — ACT
 *     Action Items · Decisions · What to Revisit · User Stories (if any)
 *   Closing line.
 *
 * Each section is its own component (kept inline in this file for now —
 * if it grows, split into ./sections/). Bridges are <Bridge> — a small
 * italic-centred-with-rules narrator block.
 *
 * v1 caveats:
 *   - No source-quote provenance click-to-jump (M14.2)
 *   - No glossary tooltips on hover (M14.2)
 *   - No chat (M14.4)
 *   - No stakeholder views (M14.5)
 *   - Sticky nav scrollspy is one-way (anchor links scroll smoothly; no
 *     active-chapter highlighting yet — M14.1.c polish)
 */
import React, { useEffect, useRef, useState } from 'react'
import { ConfidenceBadge, GlossaryTermified, SourceQuote } from './annotations.jsx'
import ChatPanel from './ChatPanel.jsx'

export default function DossierPane({ extraction }) {
  const dossier = extraction?.lens_payload
  // M14.2 — glossary terms feed the GlossaryTermified component everywhere
  // text renders. Pulled once so every section uses the same list.
  const glossaryTerms = dossier?.glossary || []
  // M14.1.c — scrollspy: track which chapter is currently in viewport so
  // the sticky nav highlights it. The pane itself is the scroll container
  // (paneShell has overflow:auto), so we observe relative to scrollerRef
  // instead of the viewport. RootMargin pulls the trigger zone to the
  // top-third of the scroller so a chapter activates as it scrolls past
  // the sticky nav, not when it first peeks in from below.
  const scrollerRef = useRef(null)
  const [activeChapter, setActiveChapter] = useState('orient')
  useEffect(() => {
    if (!dossier || !scrollerRef.current) return
    const ids = ['orient', 'structure', 'interrogate', 'act']
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean)
    if (els.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) setActiveChapter(visible[0].target.id)
      },
      { root: scrollerRef.current, rootMargin: '-30% 0px -60% 0px', threshold: 0 },
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [dossier])

  if (!dossier) {
    return (
      <div style={emptyShell}>
        <p style={{ color: 'var(--text-muted)' }}>
          No dossier payload found on this extraction.
        </p>
      </div>
    )
  }

  return (
    <div style={paneShell} ref={scrollerRef}>
      <ChapterNav active={activeChapter} />

      <div style={contentColumn}>
        <Overture text={dossier.overture} />

        <Chapter id="orient" roman="I" title="Orient" intro={dossier.orient_intro}>
          <BriefSection brief={dossier.brief} terms={glossaryTerms} />
          {/* M14.3 — Numbers Extract slot. Falls through to legacy bridge
              for pre-M14.3 dossiers that don't have the new fields. */}
          {dossier.numbers_extract?.facts?.length > 0 ? (
            <>
              <Bridge text={dossier.bridge_brief_to_numbers} />
              <NumbersExtractSection extract={dossier.numbers_extract} terms={glossaryTerms} />
              <Bridge text={dossier.bridge_numbers_to_tldr} />
            </>
          ) : (
            <Bridge text={dossier.bridge_brief_to_tldr} />
          )}
          <TLDRLadder ladder={dossier.tldr_ladder} terms={glossaryTerms} />
          <Bridge text={dossier.bridge_tldr_to_5w1h} />
          <FiveW1H w={dossier.five_w_one_h} terms={glossaryTerms} />
        </Chapter>

        <Bridge text={dossier.bridge_5w1h_to_structure} />
        <Chapter id="structure" roman="II" title="Structure" intro={dossier.structure_intro}>
          <Glossary terms={dossier.glossary} />
          <Bridge text={dossier.bridge_glossary_to_mindmap} />
          <MindmapTree mindmap={dossier.mindmap} />
          <Bridge text={dossier.bridge_mindmap_to_domain} />
          <DomainGrid domain={dossier.domain} terms={glossaryTerms} />
          {/* M14.3 — Timeline slot. Falls through to legacy bridge for
              pre-M14.3 dossiers. */}
          {dossier.timeline?.phases?.length > 0 ? (
            <>
              <Bridge text={dossier.bridge_domain_to_timeline} />
              <TimelineGantt timeline={dossier.timeline} terms={glossaryTerms} />
              <Bridge text={dossier.bridge_timeline_to_systems} />
            </>
          ) : (
            <Bridge text={dossier.bridge_domain_to_systems} />
          )}
          <SystemsView systems={dossier.systems} terms={glossaryTerms} />
        </Chapter>

        <Bridge text={dossier.bridge_systems_to_interrogate} />
        <Chapter id="interrogate" roman="III" title="Interrogate" intro={dossier.interrogate_intro}>
          <FiveWhys steps={dossier.five_whys} terms={glossaryTerms} />
          <Bridge text={dossier.bridge_whys_to_assumptions} />
          <AssumptionsAudit items={dossier.assumptions} terms={glossaryTerms} />
          <Bridge text={dossier.bridge_assumptions_to_inversion} />
          <InversionList items={dossier.inversion} terms={glossaryTerms} />
          {/* M14.3 — Negative Space slot. Falls through to legacy bridge
              for pre-M14.3 dossiers. */}
          {dossier.negative_space?.items?.length > 0 ? (
            <>
              <Bridge text={dossier.bridge_inversion_to_negative_space} />
              <NegativeSpaceList space={dossier.negative_space} terms={glossaryTerms} />
              <Bridge text={dossier.bridge_negative_space_to_questions} />
            </>
          ) : (
            <Bridge text={dossier.bridge_inversion_to_questions} />
          )}
          <BetterQuestions items={dossier.better_questions} terms={glossaryTerms} />
        </Chapter>

        <Bridge text={dossier.bridge_questions_to_act} />
        <Chapter id="act" roman="IV" title="Act" intro={dossier.act_intro}>
          <ActionItems items={dossier.action_items} terms={glossaryTerms} />
          <DecisionsRecord
            made={dossier.decisions_made}
            open={dossier.decisions_open}
            terms={glossaryTerms}
          />
          <WhatToRevisit items={dossier.what_to_revisit} terms={glossaryTerms} />
          {dossier.user_stories && dossier.user_stories.length > 0 && (
            <UserStoriesSection stories={dossier.user_stories} terms={glossaryTerms} />
          )}
        </Chapter>

        <Closing text={dossier.closing} />
      </div>
      {/* M14.4 — Chat panel as a fixed-position overlay; doesn't affect
          the scroll layout of the dossier itself. */}
      <ChatPanel extractionId={extraction?.id} />
    </div>
  )
}

// ============================================================================
// Layout shells
// ============================================================================

const paneShell = {
  flex: 1,
  background: 'var(--surface-0)',
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
}

const contentColumn = {
  width: '100%',
  maxWidth: 820,
  margin: '0 auto',
  padding: '40px 32px 100px',
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
}

const emptyShell = {
  flex: 1,
  display: 'grid',
  placeItems: 'center',
  padding: 'var(--space-8)',
}

// ============================================================================
// Chapter nav (sticky)
// ============================================================================

function ChapterNav({ active }) {
  const chapters = [
    { id: 'orient', roman: 'I', title: 'Orient' },
    { id: 'structure', roman: 'II', title: 'Structure' },
    { id: 'interrogate', roman: 'III', title: 'Interrogate' },
    { id: 'act', roman: 'IV', title: 'Act' },
  ]
  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        background: 'var(--surface-0)',
        borderBottom: '1px solid var(--border)',
        padding: '12px 24px',
        display: 'flex',
        gap: 8,
        justifyContent: 'center',
        flexWrap: 'wrap',
        backdropFilter: 'blur(6px)',
      }}
    >
      {chapters.map((c) => {
        const isActive = c.id === active
        return (
          <a
            key={c.id}
            href={`#${c.id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--accent-ink)' : 'var(--text-muted)',
              textDecoration: 'none',
              border: '1px solid ' + (isActive ? 'var(--accent)' : 'var(--border)'),
              background: isActive ? 'var(--accent-soft)' : 'var(--bg-elevated)',
              transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
            }}
          >
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: isActive ? 'var(--accent-ink)' : 'var(--accent-strong)',
            }}>
              {c.roman}.
            </span>
            {c.title}
          </a>
        )
      })}
    </nav>
  )
}

// ============================================================================
// Overture / Closing — narrative bookends
// ============================================================================

function Overture({ text }) {
  return (
    <div
      style={{
        margin: '32px 0 24px',
        padding: '28px 32px',
        background: 'var(--gradient-soft)',
        borderRadius: 'var(--radius-lg)',
        borderLeft: '3px solid var(--accent)',
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontSize: 19,
          lineHeight: 1.55,
          color: 'var(--text-strong)',
          fontStyle: 'italic',
          letterSpacing: '-0.005em',
        }}
      >
        {text}
      </p>
    </div>
  )
}

function Closing({ text }) {
  return (
    <div
      style={{
        marginTop: 48,
        padding: '20px 24px',
        borderTop: '1px solid var(--border)',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontSize: 17,
          lineHeight: 1.55,
          color: 'var(--text-strong)',
          fontStyle: 'italic',
        }}
      >
        {text}
      </p>
    </div>
  )
}

// ============================================================================
// Chapter wrapper — Roman numeral header + intro line
// ============================================================================

function Chapter({ id, roman, title, intro, children }) {
  return (
    <section id={id} style={{ marginTop: 32 }}>
      <header style={{ marginBottom: 18, paddingTop: 16 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--text-faint, var(--text-soft))',
            marginBottom: 6,
          }}
        >
          ACT {roman} — {title}
        </div>
        {intro && (
          <p
            style={{
              margin: 0,
              fontSize: 15,
              lineHeight: 1.6,
              color: 'var(--text-muted)',
              fontStyle: 'italic',
            }}
          >
            {intro}
          </p>
        )}
      </header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {children}
      </div>
    </section>
  )
}

// ============================================================================
// Bridge — narrator transition between sections
// ============================================================================

function Bridge({ text }) {
  if (!text) return null
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        margin: '4px 12px',
      }}
    >
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <p
        style={{
          margin: 0,
          fontSize: 13,
          fontStyle: 'italic',
          color: 'var(--text-muted)',
          textAlign: 'center',
          maxWidth: 420,
        }}
      >
        {text}
      </p>
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

// ============================================================================
// Section: Brief
// ============================================================================

function SectionTitle({ children }) {
  return (
    <h3
      style={{
        margin: 0,
        fontFamily: 'var(--font-display)',
        fontSize: 22,
        fontWeight: 600,
        color: 'var(--text-strong)',
        letterSpacing: '-0.01em',
      }}
    >
      {children}
    </h3>
  )
}

function SectionShell({ title, children }) {
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '22px 24px',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      <header style={{ marginBottom: 14 }}>
        <SectionTitle>{title}</SectionTitle>
      </header>
      {children}
    </div>
  )
}

function BriefSection({ brief, terms }) {
  if (!brief) return null
  return (
    <SectionShell title="Brief">
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--text)' }}>
        <GlossaryTermified text={brief.summary} terms={terms} />
      </p>
      {brief.tags && brief.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
          {brief.tags.map((t) => (
            <span
              key={t}
              style={{
                fontSize: 11.5,
                padding: '3px 9px',
                borderRadius: 999,
                background: 'var(--accent-soft)',
                color: 'var(--accent-ink)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </SectionShell>
  )
}

// ============================================================================
// Section: TLDR Ladder
// ============================================================================

function TLDRLadder({ ladder, terms }) {
  if (!ladder) return null
  const rows = [
    { label: '1 line', text: ladder.one_line },
    { label: '1 paragraph', text: ladder.one_paragraph },
    { label: '1 page', text: ladder.one_page },
  ]
  return (
    <SectionShell title="TLDR Ladder">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <span
              style={{
                flexShrink: 0,
                width: 90,
                fontSize: 11,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-soft)',
                fontFamily: 'var(--font-mono)',
                paddingTop: 3,
              }}
            >
              {r.label}
            </span>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--text)', flex: 1 }}>
              <GlossaryTermified text={r.text} terms={terms} />
            </p>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}

// ============================================================================
// Section: 5W1H
// ============================================================================

function FiveW1H({ w, terms }) {
  if (!w) return null
  const cells = [
    { k: 'WHO', v: w.who },
    { k: 'WHAT', v: w.what },
    { k: 'WHEN', v: w.when },
    { k: 'WHERE', v: w.where },
    { k: 'WHY', v: w.why },
    { k: 'HOW', v: w.how },
  ]
  return (
    <SectionShell title="5W1H">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
        }}
      >
        {cells.map((c) => (
          <div
            key={c.k}
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: 'var(--accent-strong)',
                fontFamily: 'var(--font-mono)',
                marginBottom: 4,
              }}
            >
              {c.k}
            </div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--text)' }}>
              <GlossaryTermified text={c.v} terms={terms} />
            </p>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}

// ============================================================================
// Section: Glossary
// ============================================================================

function Glossary({ terms }) {
  if (!terms || terms.length === 0) return null
  return (
    <SectionShell title="Glossary">
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 18, rowGap: 10 }}>
        {terms.map((t) => (
          <React.Fragment key={t.term}>
            <dt
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--text-strong)',
                paddingTop: 1,
                whiteSpace: 'nowrap',
              }}
            >
              {t.term}
            </dt>
            <dd style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-muted)' }}>
              {t.definition}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </SectionShell>
  )
}

// ============================================================================
// Section: Mindmap (3-level nested list)
// ============================================================================

function MindmapTree({ mindmap }) {
  if (!mindmap) return null
  return (
    <SectionShell title="Mindmap">
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.7 }}>
        <div style={{ fontWeight: 700, color: 'var(--accent-ink)', marginBottom: 4 }}>
          {mindmap.root}
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'none' }}>
          {(mindmap.branches || []).map((b, i) => (
            <li key={i} style={{ position: 'relative', paddingLeft: 14 }}>
              <span style={branchTick}>├──</span>
              <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{b.label}</span>
              {b.children && b.children.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'none' }}>
                  {b.children.map((sb, j) => (
                    <li key={j} style={{ position: 'relative', paddingLeft: 14 }}>
                      <span style={branchTick}>├──</span>
                      <span style={{ color: 'var(--text)' }}>{sb.label}</span>
                      {sb.children && sb.children.length > 0 && (
                        <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'none' }}>
                          {sb.children.map((leaf, k) => (
                            <li key={k} style={{ position: 'relative', paddingLeft: 14 }}>
                              <span style={branchTick}>└──</span>
                              <span style={{ color: 'var(--text-muted)' }}>{leaf.label}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </SectionShell>
  )
}

const branchTick = {
  position: 'absolute',
  left: -2,
  color: 'var(--text-soft)',
  fontFamily: 'var(--font-mono)',
}

// ============================================================================
// Section: Domain Map (7-card grid)
// ============================================================================

function DomainGrid({ domain, terms }) {
  if (!domain) return null
  const branches = [
    { k: 'Business Purpose', v: domain.business_purpose },
    { k: 'Stakeholders', v: domain.stakeholders },
    { k: 'Process Flow', v: domain.process_flow },
    { k: 'Data', v: domain.data },
    { k: 'Rules', v: domain.rules },
    { k: 'Metrics', v: domain.metrics },
    { k: 'Problems / Opportunities', v: domain.problems_opportunities },
  ]
  return (
    <SectionShell title="Domain Map">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        {branches.map((b) => (
          <div
            key={b.k}
            style={{
              padding: '14px 16px',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--accent-strong)',
                marginBottom: 8,
              }}
            >
              {b.k}
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.5, color: 'var(--text)' }}>
              {(b.v?.points || []).map((p, i) => (
                <li key={i} style={{ marginBottom: 3 }}>
                  <GlossaryTermified text={p} terms={terms} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}

// ============================================================================
// Section: Systems View (entities + flows + feedback loops)
// ============================================================================

function SystemsView({ systems, terms }) {
  if (!systems) return null
  const { entities = [], flows = [], feedback_loops = [] } = systems
  if (!entities.length && !flows.length && !feedback_loops.length) return null

  return (
    <SectionShell title="Systems View">
      {entities.length > 0 && (
        <SubsectionHeader>Entities</SubsectionHeader>
      )}
      {entities.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 14 }}>
          {entities.map((e, i) => (
            <div key={i} style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-strong)' }}>{e.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                <GlossaryTermified text={e.role} terms={terms} />
              </div>
            </div>
          ))}
        </div>
      )}
      {flows.length > 0 && <SubsectionHeader>Flows</SubsectionHeader>}
      {flows.length > 0 && (
        <ul style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: 13, lineHeight: 1.55 }}>
          {flows.map((f, i) => (
            <li key={i}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{f.from_entity}</span>{' '}
              <span style={{ color: 'var(--text-soft)' }}>→</span>{' '}
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{f.to_entity}</span>{' '}
              <span style={{ color: 'var(--text-muted)' }}>· <GlossaryTermified text={f.label} terms={terms} /></span>
            </li>
          ))}
        </ul>
      )}
      {feedback_loops.length > 0 && <SubsectionHeader>Feedback loops</SubsectionHeader>}
      {feedback_loops.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55, color: 'var(--text)' }}>
          {feedback_loops.map((l, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              <GlossaryTermified text={l.description} terms={terms} />
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  )
}

function SubsectionHeader({ children }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-soft)', marginBottom: 6 }}>
      {children}
    </div>
  )
}

// ============================================================================
// Section: 5 Whys (chain)
// ============================================================================

function FiveWhys({ steps, terms }) {
  if (!steps || steps.length === 0) return null
  return (
    <SectionShell title="5 Whys">
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {steps.map((s, i) => (
          <li key={i} style={{ display: 'flex', gap: 14 }}>
            <div
              style={{
                flexShrink: 0,
                width: 28,
                height: 28,
                borderRadius: 999,
                background: 'var(--accent-soft)',
                color: 'var(--accent-ink)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', flex: 1 }}>
                  <GlossaryTermified text={s.question} terms={terms} />
                </div>
                <ConfidenceBadge sourced={!!s.evidence} />
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.55 }}>
                → <GlossaryTermified text={s.answer} terms={terms} />
              </div>
              <SourceQuote text={s.evidence} />
            </div>
          </li>
        ))}
      </ol>
    </SectionShell>
  )
}

// ============================================================================
// Section: Assumptions Audit
// ============================================================================

function AssumptionsAudit({ items, terms }) {
  if (!items || items.length === 0) return null
  const toneFor = (lvl) => ({
    high: { bg: 'var(--danger-soft)', fg: 'var(--danger-ink)' },
    medium: { bg: 'var(--warn-soft)', fg: 'var(--warn-ink)' },
    low: { bg: 'var(--info-soft)', fg: 'var(--info-ink)' },
  }[lvl] || { bg: 'var(--bg-subtle)', fg: 'var(--text-muted)' })

  return (
    <SectionShell title="Assumptions Audit">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((a, i) => {
          const tone = toneFor(a.risk_level)
          return (
            <div
              key={i}
              style={{
                padding: '12px 14px',
                background: 'var(--bg-subtle)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text-strong)', fontWeight: 500, flex: 1 }}>
                  <GlossaryTermified text={a.assumption} terms={terms} />
                </p>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: tone.bg,
                    color: tone.fg,
                    flexShrink: 0,
                  }}
                >
                  {a.risk_level}
                </span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <GlossaryTermified text={a.risk_explanation} terms={terms} />
              </p>
            </div>
          )
        })}
      </div>
    </SectionShell>
  )
}

// ============================================================================
// Section: Inversion (failure modes)
// ============================================================================

function InversionList({ items, terms }) {
  if (!items || items.length === 0) return null
  return (
    <SectionShell title="Inversion · what could go catastrophically wrong">
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((f, i) => (
          <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--danger-ink)', fontFamily: 'var(--font-mono)', flexShrink: 0, marginTop: 2 }}>×</span>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.55, flex: 1 }}>
              <GlossaryTermified text={f.scenario} terms={terms} />
            </p>
            {f.likelihood && (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--text-soft)',
                  fontFamily: 'var(--font-mono)',
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                {f.likelihood}
              </span>
            )}
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}

// ============================================================================
// Section: Better Questions
// ============================================================================

function BetterQuestions({ items, terms }) {
  if (!items || items.length === 0) return null
  return (
    <SectionShell title="Better Questions">
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((q, i) => (
          <li key={i}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-strong)', lineHeight: 1.5 }}>
              {i + 1}. <GlossaryTermified text={q.question} terms={terms} />
            </p>
            {q.why_it_matters && (
              <p style={{ margin: '4px 0 0 18px', fontSize: 12.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                <GlossaryTermified text={q.why_it_matters} terms={terms} />
              </p>
            )}
          </li>
        ))}
      </ol>
    </SectionShell>
  )
}

// ============================================================================
// Section: Action Items
// ============================================================================

function ActionItems({ items, terms }) {
  if (!items || items.length === 0) return null
  return (
    <SectionShell title="Action Items">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead>
          <tr>
            <th style={thStyle}>Owner</th>
            <th style={thStyle}>Action</th>
            <th style={thStyle}>When</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a, i) => (
            <tr key={i}>
              <td style={tdStyle}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--accent-ink)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {a.owner}
                </span>
              </td>
              <td style={{ ...tdStyle, color: 'var(--text)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <GlossaryTermified text={a.action} terms={terms} />
                  </span>
                  <ConfidenceBadge sourced={!!a.source} />
                </div>
                <SourceQuote text={a.source} />
              </td>
              <td style={{ ...tdStyle, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{a.when}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionShell>
  )
}

const thStyle = {
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-soft)',
  padding: '6px 10px',
  borderBottom: '1px solid var(--border-strong)',
}

const tdStyle = {
  padding: '10px 10px',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'top',
}

// ============================================================================
// Section: Decisions Made / Open
// ============================================================================

function DecisionsRecord({ made = [], open = [], terms }) {
  if (!made.length && !open.length) return null
  return (
    <SectionShell title="Decisions">
      {made.length > 0 && (
        <>
          <SubsectionHeader>Decisions made</SubsectionHeader>
          <ul style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: 14, lineHeight: 1.55, color: 'var(--text)' }}>
            {made.map((d, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <GlossaryTermified text={d} terms={terms} />
              </li>
            ))}
          </ul>
        </>
      )}
      {open.length > 0 && (
        <>
          <SubsectionHeader>Open / unresolved</SubsectionHeader>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.55, color: 'var(--text-muted)' }}>
            {open.map((d, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <GlossaryTermified text={d} terms={terms} />
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionShell>
  )
}

// ============================================================================
// Section: What to Revisit
// ============================================================================

function WhatToRevisit({ items, terms }) {
  if (!items || items.length === 0) return null
  return (
    <SectionShell title="What to Revisit">
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((r, i) => (
          <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span
              style={{
                flexShrink: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--accent-strong)',
                marginTop: 2,
              }}
            >
              {i + 1}.
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong)', marginBottom: 2 }}>
                <GlossaryTermified text={r.item} terms={terms} />
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <GlossaryTermified text={r.why} terms={terms} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </SectionShell>
  )
}

// ============================================================================
// Section: User Stories (folded in per M14 pick (b))
// ============================================================================

function UserStoriesSection({ stories, terms }) {
  if (!stories || stories.length === 0) return null
  return (
    <SectionShell title="User Stories">
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>
        The doc is requirements-shaped — Lucid extracted user stories with acceptance criteria.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {stories.map((s) => (
          <div
            key={s.id}
            style={{
              padding: '12px 14px',
              background: 'var(--bg-subtle)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent-strong)' }}>
                {s.id}
              </span>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong)', flex: 1, minWidth: 0 }}>
                As a {s.actor}, I want <GlossaryTermified text={s.want} terms={terms} />
              </span>
              <ConfidenceBadge sourced={!!s.source_quote} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 8, paddingLeft: 4 }}>
              so that <GlossaryTermified text={s.so_that} terms={terms} />.
            </div>
            {s.criteria && s.criteria.length > 0 && (
              <ul style={{ margin: '0 0 0 18px', padding: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {s.criteria.map((c, i) => (
                  <li key={i}>
                    <GlossaryTermified text={c} terms={terms} />
                  </li>
                ))}
              </ul>
            )}
            <SourceQuote text={s.source_quote} />
          </div>
        ))}
      </div>
    </SectionShell>
  )
}

// ============================================================================
// M14.3 — Section: Numbers Extract (scannable table grouped by category)
// ============================================================================

function NumbersExtractSection({ extract, terms }) {
  if (!extract?.facts || extract.facts.length === 0) return null
  // Group facts by category so cost/time/count read together. Keep stable
  // order matching the schema enum order so the table feels deterministic.
  const order = ['cost', 'time', 'count', 'percentage', 'other']
  const grouped = order
    .map((cat) => ({ cat, items: extract.facts.filter((f) => f.category === cat) }))
    .filter((g) => g.items.length > 0)

  const catLabel = {
    cost: 'Cost',
    time: 'Time',
    count: 'Count',
    percentage: 'Percentage',
    other: 'Other',
  }

  return (
    <SectionShell title="Numbers Extract">
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>
        Every discrete number from the document, in one place. Click any "View source" to verify.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {grouped.map(({ cat, items }) => (
          <div key={cat}>
            <SubsectionHeader>{catLabel[cat]}</SubsectionHeader>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {items.map((f, i) => (
                  <tr key={i}>
                    <td style={numLabelTd}>
                      <GlossaryTermified text={f.label} terms={terms} />
                    </td>
                    <td style={numValueTd}>
                      {f.value}
                    </td>
                    <td style={numSourceTd}>
                      {f.source ? <SourceQuote text={f.source} /> : (
                        <ConfidenceBadge sourced={false} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}

const numLabelTd = {
  padding: '8px 12px 8px 0',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text)',
  width: '50%',
  verticalAlign: 'top',
}
const numValueTd = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text-strong)',
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
}
const numSourceTd = {
  padding: '8px 0 8px 12px',
  borderBottom: '1px solid var(--border)',
  textAlign: 'right',
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
}

// ============================================================================
// M14.3 — Section: Timeline (horizontal phase sequence)
// ============================================================================

function TimelineGantt({ timeline, terms }) {
  if (!timeline?.phases || timeline.phases.length === 0) return null
  const phases = timeline.phases
  return (
    <SectionShell title="Timeline">
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--text-muted)' }}>
        Phase sequence extracted from the document. Bars are equal-width — they show order, not duration.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${phases.length}, 1fr)`,
          gap: 4,
          marginBottom: 16,
        }}
      >
        {phases.map((p, i) => (
          <div
            key={i}
            style={{
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              background: i % 2 === 0 ? 'var(--accent-soft)' : 'var(--bg-subtle)',
              borderTop: '3px solid ' + (i % 2 === 0 ? 'var(--accent)' : 'var(--accent-strong)'),
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: i % 2 === 0 ? 'var(--accent-ink)' : 'var(--text-muted)',
              textAlign: 'center',
              textTransform: 'uppercase',
            }}
          >
            {p.when}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {phases.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div
              style={{
                flexShrink: 0,
                width: 28,
                height: 28,
                borderRadius: 999,
                background: 'var(--accent-soft)',
                color: 'var(--accent-ink)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
                  {p.label}
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {p.when}
                </span>
              </div>
              {p.description && (
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <GlossaryTermified text={p.description} terms={terms} />
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}

// ============================================================================
// M14.3 — Section: Negative Space (what the doc DOESN'T say)
// ============================================================================

function NegativeSpaceList({ space, terms }) {
  if (!space?.items || space.items.length === 0) return null
  return (
    <SectionShell title="Negative Space · what the doc doesn't say">
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>
        Structural absences — sections, numbers, safeguards, or clauses you'd expect but the doc leaves out.
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {space.items.map((it, i) => (
          <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span
              aria-hidden
              style={{
                flexShrink: 0,
                width: 22,
                height: 22,
                borderRadius: 999,
                background: 'var(--warn-soft)',
                color: 'var(--warn-ink)',
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 1,
              }}
              title="Missing from the document"
            >
              ∅
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong)' }}>
                <GlossaryTermified text={it.missing_item} terms={terms} />
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 3 }}>
                <GlossaryTermified text={it.why_it_matters} terms={terms} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}
