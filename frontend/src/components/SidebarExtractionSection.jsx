import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { downloadExtractionSourceApi } from '../api.js'
import { parseDocNames } from '../lib/multi_doc.js'
import { useToast } from './Toast.jsx'
import { Badge } from './primitives.jsx'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  MessageSquare,
  RefreshCw,
} from './icons.jsx'

/* M8.1 — Studio reshuffle, sub-step 1.
 *
 * "This document" contextual section that lives inside the existing app
 * Sidebar whenever a Studio extraction is open. Replaces two TopBar
 * controls — the version picker badge and the gaps-panel toggle — by
 * promoting them to Sidebar-level navigation. Adds two extras the TopBar
 * couldn't easily host: the multi-doc source list (M7.5.b downloads) and
 * a comment-count signal (M4.5).
 *
 * Layout:
 *   ─────────── divider
 *   THIS DOCUMENT
 *   spec.pdf
 *   v3 · sonnet-4.6
 *
 *   ▸ Versions (N)         — collapsible, shown only when N > 1
 *   ▸ Sources (M)          — collapsible, shown only on multi-doc
 *
 *   ⚠ 4 gaps · 💬 2 comments   — click gaps badge → toggle GapsRail
 *   ─────────── divider
 *
 * Why a section inside Sidebar (vs a new dedicated rail): the app already
 * has a 248px Sidebar; a second left rail would crowd the layout. The
 * existing Sidebar has natural section affordances (see ProjectsSection)
 * and Studio-scope content reads naturally as "after global nav".
 */

const fmtTime = (iso) => {
  try { return new Date(iso).toLocaleDateString() }
  catch { return '' }
}

const SECTION_HEADER_STYLE = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  color: 'var(--text-soft)',
  padding: '4px 14px',
  marginBottom: 4,
}

const SUBSECTION_BUTTON_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  padding: '6px 14px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 11.5,
  fontWeight: 500,
  color: 'var(--text-muted)',
  fontFamily: 'inherit',
  textAlign: 'left',
}

export default function SidebarExtractionSection({
  extraction,
  versions,
  comments,
  showGaps,
  onSwitchVersion,
  onToggleGaps,
}) {
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)

  if (!extraction) return null

  // Resolve current version + multi-doc source paths (defensive — both
  // fields can lag the open-extraction event by one tick).
  const currentVersion = versions?.find?.((v) => v.id === extraction.id)?.version
  const totalVersions = versions?.length || 0
  const sourcePaths = useMemo(() => {
    const list = extraction.source_file_paths || []
    if (list.length) return list
    if (extraction.source_file_path) return [extraction.source_file_path]
    return []
  }, [extraction.source_file_paths, extraction.source_file_path])
  const docNames = useMemo(() => parseDocNames(extraction.raw_text || ''), [extraction.raw_text])
  const isMultiDoc = sourcePaths.length > 1

  const gapCount = extraction.gaps?.length || 0
  const commentCount = comments?.length || 0

  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 12,
        paddingBottom: 8,
        borderTop: '1px solid var(--border)',
      }}
    >
      <div style={SECTION_HEADER_STYLE}>This document</div>

      {/* Title + version chip */}
      <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          title={extraction.filename}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12.5,
            fontWeight: 500,
            color: 'var(--text-strong)',
          }}
        >
          <FileText size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {extraction.filename || 'Untitled extraction'}
          </span>
        </div>
        {currentVersion && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              paddingLeft: 19,
            }}
          >
            v{currentVersion}{extraction.model_used ? ` · ${extraction.model_used}` : ''}
          </div>
        )}
      </div>

      {/* Versions sub-list — collapsible, only shown when N > 1 */}
      {totalVersions > 1 && (
        <VersionsList
          open={versionsOpen}
          onToggle={() => setVersionsOpen((s) => !s)}
          versions={versions}
          currentId={extraction.id}
          onSwitchVersion={onSwitchVersion}
        />
      )}

      {/* Sources sub-list — collapsible, only shown when multi-doc */}
      {isMultiDoc && (
        <SourcesList
          open={sourcesOpen}
          onToggle={() => setSourcesOpen((s) => !s)}
          extractionId={extraction.id}
          sourcePaths={sourcePaths}
          docNames={docNames}
          fallbackName={extraction.filename}
        />
      )}

      {/* Stats row — gaps badge (clickable → toggles GapsRail) + comments count */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px 0',
          flexWrap: 'wrap',
        }}
      >
        {gapCount > 0 && (
          <button
            type="button"
            onClick={onToggleGaps}
            title={showGaps ? 'Hide gaps panel' : 'Show gaps panel'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 'var(--radius-pill)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 500,
              fontFamily: 'inherit',
              background: showGaps ? 'var(--warn)' : 'var(--warn-soft)',
              color: showGaps ? '#fff' : 'var(--warn-ink)',
            }}
          >
            <AlertTriangle size={11} />
            {gapCount} {gapCount === 1 ? 'gap' : 'gaps'}
          </button>
        )}
        {commentCount > 0 && (
          <Badge tone="neutral" size="sm" icon={<MessageSquare size={10} />}>
            {commentCount}
          </Badge>
        )}
      </div>
    </div>
  )
}

/* Collapsible version list. Each row is a switch-to button + an inline
 * "Compare" link to /compare/<older>/<newer> (preserved from the TopBar
 * VersionPicker — same routing convention). */
function VersionsList({ open, onToggle, versions, currentId, onSwitchVersion }) {
  const navigate = useNavigate()
  const current = versions.find((v) => v.id === currentId)

  const compare = (otherId) => {
    const other = versions.find((v) => v.id === otherId)
    if (!current || !other) return
    const [oldId, newId] = other.version < current.version
      ? [other.id, current.id]
      : [current.id, other.id]
    navigate(`/compare/${oldId}/${newId}`)
  }

  return (
    <div style={{ paddingBottom: 4 }}>
      <button type="button" onClick={onToggle} style={SUBSECTION_BUTTON_STYLE}>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <RefreshCw size={11} />
        Versions ({versions.length})
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {versions.map((v) => {
            const isCurrent = v.id === currentId
            return (
              <div
                key={v.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: isCurrent ? 'var(--accent-soft)' : 'transparent',
                }}
                onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = 'transparent' }}
              >
                <button
                  type="button"
                  onClick={() => onSwitchVersion?.(v.id)}
                  disabled={isCurrent}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flex: 1,
                    minWidth: 0,
                    padding: '5px 14px 5px 30px',
                    background: 'transparent',
                    border: 'none',
                    cursor: isCurrent ? 'default' : 'pointer',
                    fontSize: 11.5,
                    color: isCurrent ? 'var(--accent-ink)' : 'var(--text)',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10.5,
                      color: 'var(--text-muted)',
                      width: 22,
                      flexShrink: 0,
                    }}
                  >
                    v{v.version}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: 11,
                    }}
                  >
                    {fmtTime(v.created_at)}
                  </span>
                  {isCurrent && <Check size={11} style={{ color: 'var(--accent-strong)', flexShrink: 0 }} />}
                </button>
                {!isCurrent && (
                  <button
                    type="button"
                    onClick={() => compare(v.id)}
                    title={`Compare v${v.version} with current`}
                    style={{
                      marginRight: 8,
                      padding: '3px 6px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--accent-strong)',
                      cursor: 'pointer',
                      fontSize: 10.5,
                      fontWeight: 500,
                      fontFamily: 'inherit',
                    }}
                  >
                    Compare
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* Collapsible per-doc download list (M7.5.b). Mirrors SourcePane's
 * download list, but in a more discoverable spot. Falls back to the
 * basename of the stored path when parseDocNames doesn't have an entry
 * (e.g. legacy single-doc rows that somehow ended up multi). */
function SourcesList({ open, onToggle, extractionId, sourcePaths, docNames, fallbackName }) {
  const { toast } = useToast()
  const [busyIdx, setBusyIdx] = useState(null)

  const download = async (idx, displayName) => {
    setBusyIdx(idx)
    try {
      await downloadExtractionSourceApi(extractionId, idx, displayName || fallbackName)
    } catch (e) {
      toast.error(e?.message || 'Could not download source')
    } finally {
      setBusyIdx(null)
    }
  }

  return (
    <div style={{ paddingBottom: 4 }}>
      <button type="button" onClick={onToggle} style={SUBSECTION_BUTTON_STYLE}>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <FileText size={11} />
        Sources ({sourcePaths.length})
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sourcePaths.map((_, i) => {
            const name = docNames[i + 1] || `Document ${i + 1}`
            const busy = busyIdx === i
            return (
              <button
                key={i}
                type="button"
                onClick={() => download(i, name)}
                disabled={busyIdx !== null}
                title={`Download "${name}"`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  padding: '5px 14px 5px 30px',
                  background: 'transparent',
                  border: 'none',
                  cursor: busyIdx !== null ? 'not-allowed' : 'pointer',
                  fontSize: 11.5,
                  color: 'var(--text)',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => { if (busyIdx === null) e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {busy ? 'Downloading…' : name}
                </span>
                <Download size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
