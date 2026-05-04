/**
 * M14.5.l — Markdown-style typography primitives for the dossier.
 *
 * One canonical heading scale, body paragraph, bullet, and ordered list
 * so every section reads like a single neat document instead of 14
 * differently-styled widgets. No markdown parser; just disciplined
 * components callers compose by hand.
 *
 *   <H1>Document title</H1>           — Roman-act / chapter
 *   <H2>Section title</H2>            — section header (replaces SectionTitle)
 *   <H3>Subsection</H3>               — small uppercase label
 *   <P>Body paragraph.</P>            — 15px / line-height 1.7
 *   <UL>{items.map(i => <LI/>)}</UL>  — round accent dot, hanging indent
 *   <OL>{items.map(i => <OLI/>)}</OL> — mono accent number, hanging indent
 *   <Quote>Blockquote text.</Quote>   — italic, accent left rule
 *   <Hr/>                             — thin neutral divider
 *   <Code>literal</Code>              — inline mono pill
 */
import React from 'react'

export function H1({ children, id }) {
  return (
    <h1 id={id} style={h1Style}>
      {children}
    </h1>
  )
}

export function H2({ children, id }) {
  return (
    <h2 id={id} style={h2Style}>
      {children}
    </h2>
  )
}

export function H3({ children }) {
  return <div style={h3Style}>{children}</div>
}

export function P({ children, muted, style }) {
  return (
    <p style={{ ...pStyle, color: muted ? 'var(--text-muted)' : 'var(--text)', ...style }}>
      {children}
    </p>
  )
}

export function UL({ children, style }) {
  return <ul style={{ ...ulStyle, ...style }}>{children}</ul>
}

export function LI({ children, muted }) {
  return (
    <li style={{ ...liStyle, color: muted ? 'var(--text-muted)' : 'var(--text)' }}>
      {children}
    </li>
  )
}

export function OL({ children, style }) {
  return <ol style={{ ...olStyle, ...style }}>{children}</ol>
}

/**
 * Ordered list item with a mono accent number prefix in the hanging indent.
 * `n` is required — the parent <OL> doesn't auto-number to keep the marker
 * style controllable per-item (some sections need 0-prefixed indices, etc.).
 */
export function OLI({ n, children }) {
  return (
    <li style={oliStyle}>
      <span style={oliNum}>{n}.</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </li>
  )
}

export function Quote({ children, style }) {
  return <blockquote style={{ ...quoteStyle, ...style }}>{children}</blockquote>
}

export function Hr() {
  return <hr style={hrStyle} />
}

export function Code({ children }) {
  return <code style={codeStyle}>{children}</code>
}

// ============================================================================
// Styles
// ============================================================================

const h1Style = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(28px, 3vw, 32px)',
  fontWeight: 600,
  color: 'var(--text-strong)',
  letterSpacing: '-0.02em',
  lineHeight: 1.15,
}

const h2Style = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 22,
  fontWeight: 600,
  color: 'var(--text-strong)',
  letterSpacing: '-0.015em',
  lineHeight: 1.2,
}

const h3Style = {
  margin: 0,
  fontFamily: 'var(--font-sans)',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--text-soft)',
}

const pStyle = {
  margin: 0,
  fontSize: 15,
  lineHeight: 1.7,
}

const ulStyle = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const liStyle = {
  position: 'relative',
  paddingLeft: 22,
  fontSize: 15,
  lineHeight: 1.65,
  // Custom accent-dot marker via ::before isn't reachable in inline styles,
  // so we use a leading bullet character with absolute positioning on the
  // pseudo via background-image — fall back to a simple bullet character
  // rendered through a sibling span in the consumer. To keep the
  // primitive self-contained, use background-image trick.
  backgroundImage:
    'radial-gradient(circle, var(--accent-strong) 2.5px, transparent 2.5px)',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: '6px 0.7em',
  backgroundSize: '6px 6px',
}

const olStyle = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const oliStyle = {
  display: 'flex',
  gap: 12,
  fontSize: 15,
  lineHeight: 1.65,
  color: 'var(--text)',
}

const oliNum = {
  flexShrink: 0,
  width: 22,
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--accent-strong)',
  paddingTop: 2,
  textAlign: 'right',
}

const quoteStyle = {
  margin: 0,
  padding: '4px 0 4px 18px',
  borderLeft: '2px solid var(--accent)',
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontSize: 16,
  lineHeight: 1.6,
  color: 'var(--text-strong)',
  fontWeight: 500,
}

const hrStyle = {
  margin: '8px 0',
  border: 'none',
  borderTop: '1px solid var(--border)',
}

const codeStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.88em',
  padding: '1px 6px',
  borderRadius: 4,
  background: 'var(--bg-subtle)',
  color: 'var(--text-strong)',
  border: '1px solid var(--border)',
}
