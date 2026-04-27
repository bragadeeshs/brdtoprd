import React, { useRef, useState } from 'react'
import { Badge, Button, Card, IconTile } from './primitives.jsx'
import {
  UploadCloud,
  FileText,
  Sparkles,
  Send,
  Paperclip,
  Zap,
  Eye,
  CheckCircle,
} from './icons.jsx'

function HowItWorksStep({ icon, tone, title, body }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <IconTile tone={tone} size={32}>
        {icon}
      </IconTile>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 2 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{body}</div>
      </div>
    </div>
  )
}

export default function EmptyState({ onSubmit, loading }) {
  const fileRef = useRef(null)
  const [text, setText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  // M7.5 — files is always an array; single-file uploads collapse to a
  // 1-element array. Empty array = nothing staged.
  const [files, setFiles] = useState([])

  const pickFile = () => fileRef.current?.click()
  const addFiles = (incoming) => {
    if (!incoming || incoming.length === 0) return
    // Append to existing — picking again adds, doesn't replace. De-dupe by
    // (name, size) so reselecting the same file is a no-op.
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}::${f.size}`))
      const next = [...prev]
      for (const f of incoming) {
        const k = `${f.name}::${f.size}`
        if (!seen.has(k)) { next.push(f); seen.add(k) }
      }
      return next
    })
  }
  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx))
  const onFileChange = (e) => addFiles(e.target.files)
  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  const submit = (e) => {
    e?.preventDefault()
    if (loading) return
    if (files.length) return onSubmit({ file: files })
    if (text.trim()) return onSubmit({ text, filename: 'pasted_text.txt' })
  }

  const canRun = !!(files.length || text.trim()) && !loading

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 'var(--space-10) var(--space-5) var(--space-8)',
        overflow: 'auto',
        position: 'relative',
        background: 'var(--surface-0)',
      }}
    >
      {/* M10.2 — ambient hero gradient backdrop. The brand bloom we
          intentionally locked into the 28px Sidebar Logo before now
          gets one place to breathe at hero scale. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 420,
          background: 'var(--gradient-soft)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      {/* Hero */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 720, marginBottom: 'var(--space-8)' }}>
        <Badge tone="accent" icon={<Sparkles size={11} />} style={{ marginBottom: 'var(--space-5)' }}>
          Powered by Claude Opus 4.7
        </Badge>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-5xl)',
            lineHeight: 'var(--leading-tight)',
            fontWeight: 600,
            margin: '0 0 var(--space-4)',
            letterSpacing: 'var(--tracking-tighter)',
            color: 'var(--text-strong)',
          }}
        >
          What are we turning <span className="gradient-text">into stories</span> today?
        </h1>
        <p style={{
          fontSize: 'var(--text-lg)',
          color: 'var(--text-muted)',
          margin: 0,
          lineHeight: 'var(--leading-base)',
          maxWidth: 580,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          Drop a messy requirement document — get a clean brief, actors, user stories with acceptance
          criteria, NFRs and gap analysis in one pass.
        </p>
      </div>

      {/* Upload card */}
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 720 }}>
        <Card
          padding={0}
          style={{
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={(e) => {
              // Only open picker when clicking the empty drop area —
              // not when clicking a staged file row or its remove button.
              if (e.target === e.currentTarget && files.length === 0) pickFile()
            }}
            style={{
              padding: '36px 24px',
              textAlign: 'center',
              cursor: files.length ? 'default' : 'pointer',
              background: dragOver ? 'var(--accent-soft)' : 'transparent',
              border: dragOver
                ? '2px dashed var(--accent)'
                : '2px dashed transparent',
              transition: 'background .15s, border-color .15s',
            }}
          >
            {files.length === 0 ? (
              <>
                <IconTile tone="accent" size={48} style={{ margin: '0 auto 14px' }}>
                  <UploadCloud size={22} />
                </IconTile>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--text-strong)',
                    marginBottom: 4,
                  }}
                >
                  Drop a requirement document here
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                  or{' '}
                  <span style={{ color: 'var(--accent-strong)', fontWeight: 500 }}>browse files</span> ·
                  PDF, .docx, .txt, .md, or images (PNG / JPG) up to 10 MB
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 4 }}>
                  Multi-doc supported — drop or pick more than one to combine into a single extraction.
                </div>
              </>
            ) : (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 6,
                maxWidth: 480, margin: '0 auto',
              }}>
                {files.map((f, i) => (
                  <div
                    key={`${f.name}::${f.size}::${i}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      background: 'var(--bg-elevated)',
                      textAlign: 'left',
                    }}
                  >
                    <IconTile tone="info" size={28}>
                      <FileText size={14} />
                    </IconTile>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--text-strong)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {f.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>
                        {(f.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      title="Remove"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFile(i)
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: 4,
                        borderRadius: 4,
                        fontSize: 16,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); pickFile() }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent-strong)',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    fontWeight: 500,
                    fontFamily: 'inherit',
                    marginTop: 2,
                  }}
                >
                  + Add another file
                </button>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              // M7.3 / M7.4 — image extensions go through Claude vision on
              // the backend; PDFs that pypdf can't read fall back to OCR.
              // M7.5 — `multiple` lets the picker select N files at once;
              // dropping multiple files into the zone also works.
              multiple
              accept=".pdf,.docx,.txt,.md,.markdown,.rst,.png,.jpg,.jpeg,.gif,.webp"
              onChange={onFileChange}
              style={{ display: 'none' }}
            />
          </div>

          {/* Divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '0 24px',
              color: 'var(--text-soft)',
              fontSize: 11,
            }}
          >
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>or paste text</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Textarea */}
          <div style={{ padding: '14px 18px 0' }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste meeting notes, an email thread, or a brief description of the requirement…"
              style={{
                width: '100%',
                minHeight: 110,
                border: 'none',
                background: 'transparent',
                fontSize: 13.5,
                lineHeight: 1.6,
                resize: 'vertical',
                outline: 'none',
                color: 'var(--text-strong)',
                padding: 0,
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Footer toolbar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 18px 14px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-subtle)',
            }}
          >
            <Button variant="ghost" size="sm" icon={<Paperclip size={13} />} onClick={pickFile}>
              Attach
            </Button>
            <Badge tone="neutral">mode: extract</Badge>
            <div style={{ flex: 1 }} />
            <Button
              variant="primary"
              size="md"
              type="submit"
              disabled={!canRun}
              loading={loading}
              iconRight={!loading && <Send size={13} />}
            >
              {loading ? 'Extracting…' : 'Extract requirements'}
            </Button>
          </div>
        </Card>
      </form>

      {/* How it works */}
      <div
        style={{
          marginTop: 48,
          width: '100%',
          maxWidth: 720,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 24,
        }}
      >
        <HowItWorksStep
          icon={<Zap size={16} />}
          tone="purple"
          title="One-shot extraction"
          body="Drop a doc. Get a structured brief, actors, user stories with acceptance criteria, NFRs and gaps."
        />
        <HowItWorksStep
          icon={<Eye size={16} />}
          tone="info"
          title="Source-grounded"
          body="Every extraction stays faithful to the source. Highlights show where each gap came from."
        />
        <HowItWorksStep
          icon={<CheckCircle size={16} />}
          tone="success"
          title="Export ready"
          body="Copy as Markdown for Linear, Jira or your PRD tool — or hand a polished brief to stakeholders."
        />
      </div>
    </div>
  )
}
