import React, { useEffect, useMemo, useRef, useState } from 'react'
import { splitParagraphsByDoc } from '../lib/multi_doc.js'
import { Badge } from './primitives.jsx'
import { FileText, AlertTriangle } from './icons.jsx'

/* M5.2 — collect every (quote, source-of-quote) pair from the extraction so
 * we can highlight them inline in the source text. Stories + NFRs get an
 * "info" tone; gap source_quotes (and the legacy gap.context heuristic) keep
 * the warn tone so users can tell them apart at a glance.
 *
 * Returns a list of { quote, kind: 'story'|'nfr'|'gap', label } sorted by
 * quote length DESC so longer quotes win when one is a substring of another
 * (otherwise the shorter match would get found first and break the longer
 * highlight). */
function collectQuotes(extraction) {
  const out = []
  for (const s of extraction.stories || []) {
    if (s.source_quote) out.push({ quote: s.source_quote, kind: 'story', label: `${s.id} · ${s.actor}` })
  }
  for (const n of extraction.nfrs || []) {
    if (n.source_quote) out.push({ quote: n.source_quote, kind: 'nfr', label: `${n.category} · ${n.value}` })
  }
  for (const g of extraction.gaps || []) {
    if (g.source_quote) out.push({ quote: g.source_quote, kind: 'gap', label: `${g.severity?.toUpperCase()} · ${g.question}` })
    // Legacy fallback — pre-M5.1 gaps only had `context`. Keep highlighting
    // those until the data is rerun against the new prompt.
    else if (g.context && g.context.length >= 8) out.push({ quote: g.context, kind: 'gap', label: `${g.severity?.toUpperCase()} · ${g.question}` })
  }
  return out.sort((a, b) => b.quote.length - a.quote.length)
}

/* Walk a paragraph and split it into segments at every quote-match (case-
 * insensitive substring). Greedy left-to-right; once a span is matched it's
 * not re-considered for other quotes. Returns [{text, hit?}]. */
function segmentParagraph(paragraph, quotes) {
  if (!quotes.length) return [{ text: paragraph, hit: null }]
  const lower = paragraph.toLowerCase()
  // Build [start, end, hit] spans
  const spans = []
  for (const q of quotes) {
    const needle = q.quote.trim().toLowerCase()
    if (!needle || needle.length < 4) continue
    let from = 0
    while (true) {
      const idx = lower.indexOf(needle, from)
      if (idx === -1) break
      const end = idx + needle.length
      // Skip if overlaps an already-claimed span
      if (!spans.some((s) => idx < s[1] && end > s[0])) {
        spans.push([idx, end, q])
      }
      from = end
    }
  }
  if (!spans.length) return [{ text: paragraph, hit: null }]
  spans.sort((a, b) => a[0] - b[0])
  const segs = []
  let cursor = 0
  for (const [start, end, hit] of spans) {
    if (start > cursor) segs.push({ text: paragraph.slice(cursor, start), hit: null })
    segs.push({ text: paragraph.slice(start, end), hit })
    cursor = end
  }
  if (cursor < paragraph.length) segs.push({ text: paragraph.slice(cursor), hit: null })
  return segs
}

const TONE_STYLE = {
  story: { bg: 'var(--accent-soft)', ink: 'var(--accent-ink)' },
  nfr: { bg: 'var(--info-soft)', ink: 'var(--info-ink)' },
  gap: { bg: 'var(--warn-soft)', ink: 'var(--warn-ink)' },
}

/* Stable DOM id for a quote string. Just lowercased + collapsed whitespace +
 * truncated to keep attribute size bounded. We don't need cryptographic
 * uniqueness — the SourcePane effect just needs to find SOMETHING that
 * matches `selectedQuote.text`. */
function quoteId(text) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200)
}

export default function SourcePane({ extraction, selectedQuote, width = '42%' }) {
  const bodyRef = useRef(null)

  // M8.5 — doc-aware paragraph split. Marker lines are stripped; surviving
  // paragraphs carry the docIdx of the marker that preceded them. For
  // single-doc inputs `docs.length` is 0 and every paragraph has docIdx=0.
  const { docs, paragraphs: docParagraphs } = useMemo(
    () => splitParagraphsByDoc(extraction.raw_text || ''),
    [extraction.raw_text],
  )
  const isMultiDoc = docs.length > 1
  const [activeDocIdx, setActiveDocIdx] = useState(() => (docs[0]?.idx ?? 0))

  const quotes = useMemo(() => collectQuotes(extraction), [extraction])

  const wordCount = (extraction.raw_text || '').trim().split(/\s+/).filter(Boolean).length

  // M5.2 — when an artifact picks a quote, scroll to + flash the first
  // <mark> whose data-quote-id matches. Empty selection / no match = no-op.
  useEffect(() => {
    if (!selectedQuote || !bodyRef.current) return
    const id = quoteId(selectedQuote.text)
    const target = bodyRef.current.querySelector(`[data-quote-id="${CSS.escape(id)}"]`)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.classList.remove('quote-flash')
    // Force reflow so the animation re-fires when the same target is picked twice
    void target.offsetWidth
    target.classList.add('quote-flash')
  }, [selectedQuote])

  // M8.5 — scroll-spy: track the doc that the user is currently reading
  // so the tab strip's active state stays honest when they scroll without
  // clicking. We observe the per-doc anchor markers (one per doc, attached
  // to the first paragraph of that doc); the topmost-visible anchor wins.
  useEffect(() => {
    if (!isMultiDoc || !bodyRef.current) return
    const root = bodyRef.current
    const anchors = root.querySelectorAll('[data-doc-anchor]')
    if (!anchors.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        // Sort by viewport position; the smallest top-offset wins.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (!visible.length) return
        const idx = parseInt(visible[0].target.getAttribute('data-doc-anchor') || '0', 10)
        if (Number.isFinite(idx) && idx > 0) setActiveDocIdx(idx)
      },
      { root, rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    )
    anchors.forEach((a) => observer.observe(a))
    return () => observer.disconnect()
  }, [isMultiDoc, docParagraphs])

  const scrollToDoc = (idx) => {
    if (!bodyRef.current) return
    const target = bodyRef.current.querySelector(`[data-doc-anchor="${idx}"]`)
    if (target) {
      setActiveDocIdx(idx)
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <section
      style={{
        // M8.2 — width is parent-driven (App.jsx persists the ratio in
        // localStorage). Default '42%' keeps single-call usage unchanged.
        width,
        minWidth: 340,
        flexShrink: 0,
        background: 'var(--bg-subtle)',
        borderRight: '1px solid var(--border)',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 'var(--space-5) var(--space-6) var(--space-4)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-subtle)',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
          <FileText size={14} style={{ color: 'var(--text-muted)' }} />
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wide)',
              color: 'var(--accent-strong)',
            }}
          >
            Source
          </span>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-xl)',
            fontWeight: 600,
            color: 'var(--text-strong)',
            marginBottom: 'var(--space-2)',
            wordBreak: 'break-word',
            lineHeight: 'var(--leading-snug)',
            letterSpacing: 'var(--tracking-tight)',
          }}
        >
          {extraction.filename}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Badge tone="neutral" size="sm">
            {wordCount.toLocaleString()} words
          </Badge>
          <Badge tone="neutral" size="sm">
            {docParagraphs.length} paragraphs
          </Badge>
          {extraction.gaps.length > 0 && (
            <Badge tone="warn" size="sm" icon={<AlertTriangle size={11} />}>
              {extraction.gaps.length} gaps
            </Badge>
          )}
        </div>

        {/* M8.5 — multi-doc tab strip. One pill per doc; active state
            tracked via scroll-spy + click-to-scroll. Hidden on single-doc
            extractions (downloads still live in the Sidebar's "This
            document → Sources" list — no need for a download UI here). */}
        {isMultiDoc && (
          <div
            role="tablist"
            aria-label="Source documents"
            style={{
              display: 'flex',
              gap: 4,
              marginTop: 12,
              overflowX: 'auto',
              paddingBottom: 2,
            }}
          >
            {docs.map((d) => {
              const isActive = d.idx === activeDocIdx
              return (
                <button
                  key={d.idx}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  onClick={() => scrollToDoc(d.idx)}
                  title={d.name}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    border: 'none',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: 11.5,
                    fontWeight: 500,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    background: isActive ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: isActive ? '#fff' : 'var(--text)',
                    border: isActive ? 'none' : '1px solid var(--border)',
                    transition: 'background .12s, color .12s',
                  }}
                >
                  <FileText size={11} />
                  {d.name}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Body */}
      <div ref={bodyRef} style={{ padding: '20px 24px 40px', flex: 1, overflow: 'auto' }}>
        {docParagraphs.length === 0 && (
          <div
            style={{
              color: 'var(--text-soft)',
              fontSize: 13,
              fontStyle: 'italic',
            }}
          >
            No paragraphs detected in the source.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {docParagraphs.map(({ docIdx, text }, i) => {
            const segments = segmentParagraph(text, quotes)
            const hasHit = segments.some((s) => s.hit)
            // M8.5 — first paragraph of each doc gets a data-doc-anchor
            // attribute so scrollToDoc can target it + IntersectionObserver
            // can spy on which doc is currently in view.
            const isFirstOfDoc = isMultiDoc && docIdx > 0 &&
              (i === 0 || docParagraphs[i - 1].docIdx !== docIdx)
            return (
              <p
                key={i}
                data-doc-anchor={isFirstOfDoc ? docIdx : undefined}
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: 'var(--text)',
                  whiteSpace: 'pre-wrap',
                  paddingLeft: hasHit ? 12 : 0,
                  borderLeft: hasHit ? '3px solid var(--border)' : 'none',
                  position: 'relative',
                  scrollMarginTop: 16,
                }}
              >
                {segments.map((s, j) =>
                  s.hit ? (
                    <mark
                      key={j}
                      data-quote-id={quoteId(s.hit.quote)}
                      title={s.hit.label}
                      style={{
                        background: TONE_STYLE[s.hit.kind].bg,
                        color: TONE_STYLE[s.hit.kind].ink,
                        padding: '1px 3px',
                        borderRadius: 3,
                        fontWeight: 500,
                        scrollMarginTop: 80,
                      }}
                    >
                      {s.text}
                    </mark>
                  ) : (
                    <span key={j}>{s.text}</span>
                  ),
                )}
              </p>
            )
          })}
        </div>
      </div>
    </section>
  )
}
