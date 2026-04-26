import React, { useEffect, useState } from 'react'
import { listVersionsApi } from '../api.js'
import { track } from '../lib/analytics.js'
import { Badge, Button, IconButton } from './primitives.jsx'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Moon,
  RefreshCw,
  Share2,
  Sparkles,
  Sun,
  Zap,
} from './icons.jsx'

function exportMarkdown(extraction) {
  const e = extraction
  const lines = []
  lines.push(`# ${e.filename}\n`)
  lines.push(`> ${e.brief.summary}\n`)
  if (e.brief.tags?.length) {
    lines.push(e.brief.tags.map((t) => `\`${t}\``).join(' ') + '\n')
  }
  lines.push('## Actors\n')
  e.actors.forEach((a) => lines.push(`- ${a}`))
  lines.push('\n## User Stories\n')
  e.stories.forEach((s) => {
    lines.push(`### ${s.id} — ${s.actor}`)
    lines.push(`**As a** ${s.actor} **I want** ${s.want} **so that** ${s.so_that}`)
    if (s.section) lines.push(`_Source: ${s.section}_`)
    if (s.criteria?.length) {
      lines.push('\n**Acceptance criteria:**')
      s.criteria.forEach((c) => lines.push(`- ${c}`))
    }
    lines.push('')
  })
  lines.push('## Non-Functional Requirements\n')
  lines.push('| Category | Value |')
  lines.push('|---|---|')
  e.nfrs.forEach((n) => lines.push(`| ${n.category} | ${n.value} |`))
  lines.push('\n## Gaps & questions\n')
  e.gaps.forEach((g) =>
    lines.push(`- **[${g.severity}]** ${g.question} _(${g.section})_ — ${g.context}`),
  )
  return lines.join('\n')
}

function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Version selector — clickable badge that opens a dropdown listing all
 * versions in this extraction's chain. Hides itself when versions.length<=1.
 */
function VersionPicker({ versions, currentId, onPick }) {
  const [open, setOpen] = useState(false)
  const current = versions.find((v) => v.id === currentId)
  const total = versions.length

  if (total <= 1 || !current) return null

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        title="Show all versions of this document"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          borderRadius: 'var(--radius-pill)',
          background: 'var(--accent-soft)',
          color: 'var(--accent-ink)',
          border: 'none',
          fontSize: 11.5,
          fontWeight: 500,
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        v{current.version} of {total}
        <ChevronDown size={11} />
      </button>
      {open && (
        <>
          <div
            onClick={(e) => { e.stopPropagation(); setOpen(false) }}
            style={{ position: 'fixed', inset: 0, zIndex: 50 }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              minWidth: 240,
              maxHeight: 300,
              overflowY: 'auto',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 51,
              padding: 4,
            }}
          >
            <div
              style={{
                padding: '6px 10px 4px',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: 'var(--text-soft)',
              }}
            >
              All versions
            </div>
            {versions.map((v) => {
              const isCurrent = v.id === currentId
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => { setOpen(false); onPick(v.id) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '6px 10px',
                    background: isCurrent ? 'var(--accent-soft)' : 'transparent',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    color: 'var(--text-strong)',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = 'transparent' }}
                >
                  <span
                    style={{
                      width: 22,
                      flexShrink: 0,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--text-muted)',
                    }}
                  >
                    v{v.version}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--text-strong)' }}>{fmtTime(v.created_at)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {v.live ? v.model_used : 'mock'}
                    </div>
                  </span>
                  {isCurrent && <Check size={13} style={{ color: 'var(--accent-strong)', flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default function TopBar({
  extraction,
  extractionId,
  loading,
  rerunning,
  theme,
  onTheme,
  showGaps,
  onToggleGaps,
  onReset,
  onRerun,
  onSwitchVersion,
  onShare,
}) {
  const [versions, setVersions] = useState([])

  // Re-fetch the version chain whenever the open extraction changes. Don't
  // block rendering on this — the picker only appears when total > 1, so a
  // single-version extraction never sees the dropdown anyway.
  useEffect(() => {
    let alive = true
    if (!extractionId) { setVersions([]); return }
    listVersionsApi(extractionId)
      .then((vs) => { if (alive) setVersions(vs) })
      .catch(() => { if (alive) setVersions([]) })
    return () => { alive = false }
  }, [extractionId])

  const onExport = () => {
    if (!extraction) return
    const md = exportMarkdown(extraction)
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${extraction.filename.replace(/\.[^/.]+$/, '')}.stories.md`
    a.click()
    URL.revokeObjectURL(url)
    track('export_clicked', { format: 'md' })
  }

  const currentVersion = versions.find((v) => v.id === extractionId)?.version

  return (
    <div
      style={{
        height: 56,
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 18px',
        gap: 10,
        flexShrink: 0,
        background: 'var(--bg-elevated)',
      }}
    >
      {extraction ? (
        <>
          <span style={{ color: 'var(--text-muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={14} />
            Documents
          </span>
          <ChevronRight size={14} style={{ color: 'var(--text-soft)' }} />
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-strong)',
              maxWidth: 360,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {extraction.filename}
          </span>
          <VersionPicker versions={versions} currentId={extractionId} onPick={onSwitchVersion} />
          {loading || rerunning ? (
            <Badge tone="info" icon={<Sparkles size={12} />}>
              {rerunning ? 'Re-running' : 'Running'}
            </Badge>
          ) : extraction.live ? (
            <Badge tone="success" dot>
              Live{currentVersion ? ` · v${currentVersion}` : ' · v1'}
            </Badge>
          ) : (
            <Badge tone="warn" icon={<AlertTriangle size={11} />}>
              Mock mode · no API key
            </Badge>
          )}
        </>
      ) : (
        <>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Home</span>
          <ChevronRight size={14} style={{ color: 'var(--text-soft)' }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-strong)' }}>
            New extraction
          </span>
        </>
      )}

      <div style={{ flex: 1 }} />

      <IconButton
        label={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
        onClick={() => onTheme(theme === 'light' ? 'dark' : 'light')}
      >
        {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
      </IconButton>

      {extraction && (
        <>
          <IconButton
            label={showGaps ? 'Hide gaps panel' : 'Show gaps panel'}
            onClick={onToggleGaps}
            active={showGaps}
          >
            <AlertTriangle size={15} />
          </IconButton>
          <Button
            variant="secondary"
            size="sm"
            icon={<Zap size={13} />}
            onClick={onRerun}
            disabled={rerunning || loading}
            title="Run extraction again on this document"
          >
            {rerunning ? 'Re-running…' : 'Re-run'}
          </Button>
          <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={onReset}>
            New
          </Button>
          {typeof onShare === 'function' && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Share2 size={13} />}
              onClick={onShare}
              title="Generate a public read-only URL for this document"
            >
              Share
            </Button>
          )}
          <Button variant="primary" size="sm" icon={<Download size={13} />} onClick={onExport}>
            Export .md
          </Button>
        </>
      )}
    </div>
  )
}
