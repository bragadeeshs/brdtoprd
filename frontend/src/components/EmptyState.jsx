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
  const [file, setFile] = useState(null)

  const pickFile = () => fileRef.current?.click()
  const onFileChange = (e) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }
  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) setFile(f)
  }

  const submit = (e) => {
    e?.preventDefault()
    if (loading) return
    if (file) return onSubmit({ file })
    if (text.trim()) return onSubmit({ text, filename: 'pasted_text.txt' })
  }

  const canRun = !!(file || text.trim()) && !loading

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '64px 20px 40px',
        overflow: 'auto',
      }}
    >
      {/* Hero */}
      <div style={{ textAlign: 'center', maxWidth: 640, marginBottom: 36 }}>
        <Badge tone="accent" icon={<Sparkles size={11} />} style={{ marginBottom: 18 }}>
          Powered by Claude Opus 4.7
        </Badge>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 40,
            lineHeight: 1.15,
            fontWeight: 600,
            margin: '0 0 12px',
            letterSpacing: -0.5,
            color: 'var(--text-strong)',
          }}
        >
          What are we turning <span className="gradient-text">into stories</span> today?
        </h1>
        <p style={{ fontSize: 14.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
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
            onClick={() => !file && pickFile()}
            style={{
              padding: '36px 24px',
              textAlign: 'center',
              cursor: file ? 'default' : 'pointer',
              background: dragOver ? 'var(--accent-soft)' : 'transparent',
              border: dragOver
                ? '2px dashed var(--accent)'
                : '2px dashed transparent',
              transition: 'background .15s, border-color .15s',
            }}
          >
            {!file ? (
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
                  PDF, .docx, .txt, .md up to 10 MB
                </div>
              </>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--bg-elevated)',
                  textAlign: 'left',
                  maxWidth: 420,
                  margin: '0 auto',
                }}
              >
                <IconTile tone="info" size={32}>
                  <FileText size={16} />
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
                    {file.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>
                    {(file.size / 1024).toFixed(1)} KB · ready to extract
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Remove file"
                  title="Remove file"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFile(null)
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
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,.markdown,.rst"
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
