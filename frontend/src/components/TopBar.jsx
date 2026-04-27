import React, { useState } from 'react'
import { downloadExtractionDocxApi } from '../api.js'
import { track } from '../lib/analytics.js'
import { buildCsv, buildJson, buildMarkdown, downloadFile, exportBaseName } from '../lib/exports.js'
import { useToast } from './Toast.jsx'
import { Badge, Button, IconButton } from './primitives.jsx'
import {
  AlertTriangle,
  ChevronRight,
  Download,
  FileText,
  MoreHorizontal,
  Plug,
  RefreshCw,
  Sparkles,
  Zap,
} from './icons.jsx'

/* M6.1 — Export menu. Dropdown with 4 formats. MD/JSON/CSV are pure
 * client-side; DOCX hits the backend (python-docx). Click-outside + Esc
 * dismiss; same pattern as CommentThread. */
function ExportMenu({ extraction, busy }) {
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const { toast } = useToast()
  const popRef = React.useRef(null)
  const btnRef = React.useRef(null)

  React.useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (popRef.current?.contains(e.target)) return
      if (btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const base = exportBaseName(extraction.filename)

  const exportClient = (format) => {
    setOpen(false)
    if (format === 'md') {
      downloadFile(`${base}.md`, buildMarkdown(extraction), 'text/markdown')
    } else if (format === 'json') {
      downloadFile(`${base}.json`, buildJson(extraction), 'application/json')
    } else if (format === 'csv') {
      downloadFile(`${base}.csv`, buildCsv(extraction), 'text/csv')
    }
    track('export_clicked', { format })
  }

  const exportDocx = async () => {
    setOpen(false)
    setDownloading(true)
    try {
      await downloadExtractionDocxApi(extraction.id)
      track('export_clicked', { format: 'docx' })
    } catch (err) {
      toast.error(err.message || 'DOCX export failed')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span ref={btnRef} style={{ display: 'inline-block' }}>
        <Button
          variant="primary"
          size="sm"
          icon={<Download size={13} />}
          onClick={() => setOpen((x) => !x)}
          disabled={busy || downloading}
        >
          {downloading ? 'Exporting…' : 'Export'}
        </Button>
      </span>
      {open && (
        <div
          ref={popRef}
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 180,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg)',
            padding: 4,
            zIndex: 50,
          }}
        >
          <ExportMenuItem onClick={() => exportClient('md')}  title="Markdown (.md)" hint="Headings + bullets" />
          <ExportMenuItem onClick={() => exportClient('json')} title="JSON (.json)"   hint="Full structured payload" />
          <ExportMenuItem onClick={() => exportClient('csv')}  title="CSV (.csv)"     hint="Spreadsheet-friendly" />
          <ExportMenuItem onClick={exportDocx}                 title="Word (.docx)"   hint="Formatted document" />
        </div>
      )}
    </span>
  )
}

/* M6.3 — Push menu. Mirrors ExportMenu (same dropdown shape) so users
 * recognize the pattern. Items only render when their callback exists,
 * so a future single-tracker connection still gets a clean menu. */
function PushMenu({ onPushToJira, onPushToLinear, onPushToGitHub, onPushToSlack, onPushToNotion, busy }) {
  const [open, setOpen] = useState(false)
  const popRef = React.useRef(null)
  const btnRef = React.useRef(null)

  React.useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (popRef.current?.contains(e.target)) return
      if (btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const fire = (cb) => () => { setOpen(false); cb?.() }

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span ref={btnRef} style={{ display: 'inline-block' }}>
        <Button
          variant="secondary"
          size="sm"
          icon={<Plug size={13} />}
          onClick={() => setOpen((x) => !x)}
          disabled={busy}
        >
          Push to…
        </Button>
      </span>
      {open && (
        <div
          ref={popRef}
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 200,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg)',
            padding: 4,
            zIndex: 50,
          }}
        >
          {typeof onPushToJira === 'function' && (
            <ExportMenuItem onClick={fire(onPushToJira)} title="Jira" hint="One issue per story" />
          )}
          {typeof onPushToLinear === 'function' && (
            <ExportMenuItem onClick={fire(onPushToLinear)} title="Linear" hint="One issue per story" />
          )}
          {typeof onPushToGitHub === 'function' && (
            <ExportMenuItem onClick={fire(onPushToGitHub)} title="GitHub Issues" hint="Criteria as task list" />
          )}
          {typeof onPushToSlack === 'function' && (
            <ExportMenuItem onClick={fire(onPushToSlack)} title="Slack" hint="Send unresolved gaps" />
          )}
          {typeof onPushToNotion === 'function' && (
            <ExportMenuItem onClick={fire(onPushToNotion)} title="Notion" hint="One page per story" />
          )}
        </div>
      )}
    </span>
  )
}

function ExportMenuItem({ onClick, title, hint }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitem"
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        padding: '6px 10px',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-strong)' }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 1 }}>{hint}</div>
    </button>
  )
}

// M8.1 — VersionPicker + fmtTime moved to SidebarExtractionSection. The
// version chip + per-version Compare link now live in the Sidebar's
// "This document" section.

/* M8.3 — Overflow `…` menu. Hosts low-frequency actions (Share, Save as
 * example) + the theme toggle so the TopBar primary row doesn't grow as
 * we add features. Same dropdown shape as ExportMenu / PushMenu so users
 * already know the interaction. Items render conditionally so an
 * extraction-less view doesn't show a stub menu. */
function OverflowMenu({ theme, onTheme, onShare, onSaveAsExample }) {
  const [open, setOpen] = useState(false)
  const popRef = React.useRef(null)
  const btnRef = React.useRef(null)

  React.useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (popRef.current?.contains(e.target)) return
      if (btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const themeLabel = theme === 'light' ? 'Switch to dark mode'
                   : theme === 'dark'  ? 'Switch to system theme'
                   :                     'Switch to light mode'
  const cycleTheme = () => {
    setOpen(false)
    onTheme?.(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')
  }

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span ref={btnRef} style={{ display: 'inline-block' }}>
        <IconButton label="More actions" onClick={() => setOpen((s) => !s)}>
          <MoreHorizontal size={15} />
        </IconButton>
      </span>
      {open && (
        <div
          ref={popRef}
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 200,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg)',
            padding: 4,
            zIndex: 50,
          }}
        >
          {typeof onShare === 'function' && (
            <ExportMenuItem
              onClick={() => { setOpen(false); onShare() }}
              title="Share"
              hint="Generate a public read-only URL"
            />
          )}
          {typeof onSaveAsExample === 'function' && (
            <ExportMenuItem
              onClick={() => { setOpen(false); onSaveAsExample() }}
              title="Save as example"
              hint="Capture for few-shot examples"
            />
          )}
          <ExportMenuItem
            onClick={cycleTheme}
            title={themeLabel}
            hint={`Currently: ${theme}`}
          />
        </div>
      )}
    </span>
  )
}

export default function TopBar({
  extraction,
  extractionId,
  loading,
  rerunning,
  theme,
  onTheme,
  onReset,
  onRerun,
  onShare,
  onPushToJira,
  onPushToLinear,
  onPushToGitHub,
  onPushToSlack,
  onPushToNotion,
  onSaveAsExample,
  // M8.1 — Sidebar's "This document" section now owns the live version
  // chip; pass the current version label down so the run-state Badge can
  // still render "Live · v3" without re-fetching.
  currentVersion,
}) {
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

      {/* M8.3 — primary row: Re-run + New + Push + Export only. Theme,
          Share, Save-as-example moved to the OverflowMenu so the row
          stays scannable as we add features. */}
      {extraction && (
        <>
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
          {(typeof onPushToJira === 'function' || typeof onPushToLinear === 'function' || typeof onPushToGitHub === 'function' || typeof onPushToSlack === 'function' || typeof onPushToNotion === 'function') && (
            <PushMenu
              onPushToJira={onPushToJira}
              onPushToLinear={onPushToLinear}
              onPushToGitHub={onPushToGitHub}
              onPushToSlack={onPushToSlack}
              onPushToNotion={onPushToNotion}
              busy={loading || rerunning}
            />
          )}
          <ExportMenu extraction={extraction} busy={loading || rerunning} />
        </>
      )}
      <OverflowMenu
        theme={theme}
        onTheme={onTheme}
        onShare={extraction ? onShare : undefined}
        onSaveAsExample={extraction ? onSaveAsExample : undefined}
      />
    </div>
  )
}
