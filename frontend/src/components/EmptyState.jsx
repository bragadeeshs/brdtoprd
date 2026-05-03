/**
 * M14.5.b — EmptyState rebuilt around 10-point critique:
 *
 * 1. Drops the dead space — "What you'll get" + sample templates +
 *    trust strip fill the lower viewport.
 * 2. Hero shrinks; upload card is the visual primary.
 * 3. Upload card has clearer sections (Upload / Paste tabs +
 *    output-mode dropdown + bigger CTA).
 * 4. CTA is solid teal + outcome-driven copy ("Analyze document").
 * 5. "Powered by Claude" demoted to footer trust badge.
 * 6. (Sidebar "New Extraction" item handled in Sidebar.jsx.)
 * 7. "What you'll get" 8-card grid showing the dossier output up front.
 * 8. Sample templates — Try sample BRD / Try meeting notes / Try email.
 * 9. "Mode" replaces the cryptic "mode: extract" chip — proper dropdown.
 *10. Trust strip: source-grounded · gap detection · push to Jira/Linear/
 *    Notion · download Word/Excel · traceable.
 *
 * Layout shell: page is a vertical flex; hero + upload sit side-by-side
 * at >= 980px, stack on narrow. Below the fold: full-width "What you'll
 * get" grid, then templates + trust strip. The page now scrolls
 * naturally and feels populated instead of empty.
 */
import React, { useRef, useState } from 'react'
import { Button } from './primitives.jsx'
import {
  CheckCircle,
  Eye,
  FileText,
  Paperclip,
  Send,
  Sparkles,
  UploadCloud,
  Zap,
} from './icons.jsx'

// ============================================================================
// Sample templates — quick-start docs the user can load with one click when
// they don't have a doc handy. Realistic content, kept short (each ~250-450
// chars) so the textarea isn't overwhelming.
// ============================================================================

const SAMPLE_BRD = `Business Requirements Document — Customer Loyalty Program

Background: Acme Retail wants to launch a points-based loyalty program for its e-commerce site. Customers earn points on every purchase and can redeem them for discounts.

Scope: Account creation, points earning rules, redemption flow, and a customer-facing dashboard. Excludes B2B customers and gift cards (Phase 2).

Key requirements:
- Customers earn 1 point per ₹100 spent.
- Points expire after 12 months of inactivity.
- Minimum redemption is 100 points = ₹50 discount.
- Tier system: Silver (0-500 pts), Gold (500-2000), Platinum (2000+).
- Email notifications for tier upgrades and expiring points.

Open questions: Cross-channel earning (in-store vs online)? Returns — do points reverse?`

const SAMPLE_MEETING_NOTES = `Meeting Notes — Payment Gateway Replacement

Date: 2026-04-15
Attendees: Priya (PM), Karan (Eng Lead), Sara (Finance), Devon (Ops)

Discussion:
- Current Stripe integration is hitting transaction limits during peak hours.
- Karan proposes evaluating Razorpay + a fallback to PayU.
- Sara confirms the ₹15L annual budget is approved for Q3 implementation.
- Devon raised concerns about reconciliation reports — current Stripe webhook setup took 6 weeks to stabilize.

Decisions:
- Run a 2-week POC with Razorpay starting May 1.
- Karan to draft the technical comparison doc by April 22.
- Defer PayU evaluation pending Razorpay POC outcome.

Action items:
- Priya: schedule weekly POC review (Tuesdays).
- Karan: provision Razorpay sandbox account.`

const SAMPLE_EMAIL = `From: alex@partner.co
To: requirements@ourco.com
Subject: Re: API integration scoping — feedback

Hey team,

Reviewed the integration spec you sent over. A few thoughts:

1. The webhook retry policy needs to be explicit. We've seen 3-day delays on similar integrations and that breaks downstream reconciliation. Suggest exponential backoff with a 24h cap.

2. The "customer.updated" event payload is missing the previous_values diff that v1 had. Our subscribers depend on this for change tracking — please restore.

3. Rate limiting at 100 req/min seems aggressive for our typical 200-300 req/min batch jobs. Can we negotiate a higher tier or burst allowance?

4. SLA is unclear — your spec says "best effort" but the contract draft says 99.9%. Which is binding?

Happy to jump on a call this week to align.

— Alex`

// ============================================================================
// "What you'll get" — the artifact preview cards. Eight cards covering the
// dossier output so the user knows the value upfront.
// ============================================================================

const ARTIFACTS_PREVIEW = [
  { icon: <Sparkles size={14} />, title: 'Brief', desc: '2-sentence summary + tags' },
  { icon: <FileText size={14} />, title: '5W1H', desc: 'Who · What · When · Where · Why · How' },
  { icon: <FileText size={14} />, title: 'Mindmap', desc: 'Hierarchical breakdown of the doc' },
  { icon: <Sparkles size={14} />, title: 'User Stories', desc: 'As-a/want/so-that with acceptance criteria' },
  { icon: <CheckCircle size={14} />, title: 'NFRs', desc: 'Non-functional requirements with sources' },
  { icon: <Eye size={14} />, title: 'Gaps & Risks', desc: 'Hidden assumptions + failure modes' },
  { icon: <CheckCircle size={14} />, title: 'Action Items', desc: 'Concrete next steps with owners' },
  { icon: <Sparkles size={14} />, title: 'Better Questions', desc: 'What to ask the doc author next' },
]

// ============================================================================
// Modes — what kind of extraction. Two work today; rest tagged "Soon" so the
// roadmap is visible without being misleading.
// ============================================================================

const MODES = [
  { value: 'dossier', label: 'Full dossier (recommended)', desc: 'Brief, mindmap, gaps, action items, user stories — the full understanding pass' },
  { value: 'stories', label: 'User stories only', desc: 'Lean output — actors, stories, acceptance criteria, NFRs, gaps' },
  { value: '_soon_brd', label: 'BRD summary (soon)', desc: 'Coming soon', disabled: true },
  { value: '_soon_gap', label: 'Gap analysis (soon)', desc: 'Coming soon', disabled: true },
  { value: '_soon_tech', label: 'Technical spec (soon)', desc: 'Coming soon', disabled: true },
]

// ============================================================================
// Component
// ============================================================================

export default function EmptyState({ onSubmit, loading }) {
  const fileRef = useRef(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [tab, setTab] = useState('upload') // 'upload' | 'paste'
  const [mode, setMode] = useState('dossier')

  const pickFile = () => fileRef.current?.click()
  const addFiles = (incoming) => {
    if (!incoming || incoming.length === 0) return
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
    setTab('upload')
  }

  // M14.5.b — sample template loader. Drops the sample text into the paste
  // tab so the user sees what they're submitting before it runs.
  const loadSample = (sampleText, name) => {
    setText(sampleText)
    setTab('paste')
    setFiles([])
  }

  const submit = (e) => {
    e?.preventDefault()
    if (loading) return
    // M14.5.b — pass the chosen lens through to handleExtract.
    if (files.length) return onSubmit({ file: files, lens: mode })
    if (text.trim()) return onSubmit({ text, filename: 'pasted_text.txt', lens: mode })
  }

  const canRun = !!(files.length || text.trim()) && !loading

  return (
    <div className="empty-state-page" style={pageShell}>
      {/* ===== ZONE 1: Hero + Upload (side-by-side at >= 980px) ===== */}
      <section className="empty-hero" style={heroSection}>
        <div style={heroLeft}>
          <h1 style={heroH1}>
            Upload a messy requirement.{' '}
            <span className="gradient-text">Get structured stories</span>, gaps, NFRs, and acceptance criteria — in minutes.
          </h1>
          <p style={heroSub}>
            Lucid reads your document like an expert analyst. Every artifact links back to the source quote, so you can verify and push to Jira in one click.
          </p>
        </div>

        <form onSubmit={submit} style={uploadCard}>
          {/* Tab strip */}
          <div style={tabRow}>
            <button
              type="button"
              onClick={() => setTab('upload')}
              style={tab === 'upload' ? tabActive : tabInactive}
            >
              <UploadCloud size={14} /> Upload file
            </button>
            <button
              type="button"
              onClick={() => setTab('paste')}
              style={tab === 'paste' ? tabActive : tabInactive}
            >
              <FileText size={14} /> Paste text
            </button>
          </div>

          {/* Upload zone OR textarea */}
          {tab === 'upload' ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={(e) => {
                if (e.target === e.currentTarget && files.length === 0) pickFile()
              }}
              style={{
                ...dropZone,
                background: dragOver ? 'var(--accent-soft)' : 'var(--bg-subtle)',
                borderColor: dragOver ? 'var(--accent)' : 'var(--border-strong)',
              }}
            >
              {files.length === 0 ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 4 }}>
                    Drop a document here
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                    or <span style={{ color: 'var(--accent-strong)', fontWeight: 600, cursor: 'pointer' }}>browse files</span> · PDF · .docx · .txt · .md · PNG · JPG · up to 10 MB · multi-doc OK
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {files.map((f, i) => (
                    <div key={`${f.name}::${f.size}::${i}`} style={fileRow}>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.name}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-soft)' }}>
                          {(f.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                        style={removeBtn}
                        aria-label={`Remove ${f.name}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.markdown,.rst,.png,.jpg,.jpeg,.gif,.webp"
                onChange={onFileChange}
                style={{ display: 'none' }}
              />
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste meeting notes, an email thread, a brief description of the requirement…"
              style={textareaStyle}
            />
          )}

          {/* Mode dropdown */}
          <div style={{ marginTop: 14 }}>
            <label style={fieldLabel}>Output type</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={selectStyle}
            >
              {MODES.map((m) => (
                <option key={m.value} value={m.value} disabled={m.disabled}>
                  {m.label}
                </option>
              ))}
            </select>
            <p style={fieldHint}>
              {MODES.find((m) => m.value === mode)?.desc}
            </p>
          </div>

          {/* CTA */}
          <button
            type="submit"
            disabled={!canRun}
            style={{
              ...primaryCta,
              opacity: canRun ? 1 : 0.5,
              cursor: canRun ? 'pointer' : 'not-allowed',
            }}
          >
            {loading ? 'Analyzing…' : 'Analyze document'}
            {!loading && <Send size={14} />}
          </button>
        </form>
      </section>

      {/* ===== ZONE 2: What you'll get (8-card grid) ===== */}
      <section style={sectionBlock}>
        <SectionLabel>What you'll get</SectionLabel>
        <div style={artifactGrid}>
          {ARTIFACTS_PREVIEW.map((a) => (
            <div key={a.title} style={artifactCard}>
              <span style={artifactIcon}>{a.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 2 }}>
                  {a.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  {a.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== ZONE 3: Quick start templates + trust strip ===== */}
      <section style={sectionBlock}>
        <SectionLabel>Don't have a doc? Try one of these.</SectionLabel>
        <div style={templateRow}>
          <button type="button" onClick={() => loadSample(SAMPLE_BRD)} style={templateBtn}>
            <FileText size={14} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>Sample BRD</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Loyalty program requirements</div>
            </div>
          </button>
          <button type="button" onClick={() => loadSample(SAMPLE_MEETING_NOTES)} style={templateBtn}>
            <FileText size={14} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>Meeting notes</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Payment gateway replacement</div>
            </div>
          </button>
          <button type="button" onClick={() => loadSample(SAMPLE_EMAIL)} style={templateBtn}>
            <FileText size={14} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>Email thread</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>API integration feedback</div>
            </div>
          </button>
        </div>
      </section>

      <section style={{ ...sectionBlock, marginTop: 12 }}>
        <div style={trustStrip}>
          <TrustItem icon={<Eye size={13} />} label="Source-grounded — every claim links to a quote" />
          <TrustItem icon={<Sparkles size={13} />} label="Gap detection — surfaces hidden assumptions" />
          <TrustItem icon={<CheckCircle size={13} />} label="One-click push to Jira · Linear · Notion" />
          <TrustItem icon={<FileText size={13} />} label="Export Word · Excel · Markdown · JSON" />
          <TrustItem icon={<Zap size={13} />} label="Powered by Claude — adaptive thinking" />
        </div>
      </section>
    </div>
  )
}

// ============================================================================
// Subcomponents + styles
// ============================================================================

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 11,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--text-soft)',
        fontWeight: 600,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  )
}

function TrustItem({ icon, label }) {
  return (
    <div style={trustItem}>
      <span style={{ color: 'var(--accent-strong)', display: 'inline-flex' }}>{icon}</span>
      <span>{label}</span>
    </div>
  )
}

const pageShell = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 'clamp(36px, 5vw, 56px)',
  padding: 'clamp(28px, 4vw, 48px) clamp(20px, 4vw, 56px) 80px',
  overflow: 'auto',
  background: 'var(--bg-elevated)',
}

const heroSection = {
  display: 'grid',
  gridTemplateColumns: 'minmax(280px, 1fr) minmax(360px, 520px)',
  gap: 'clamp(24px, 3vw, 40px)',
  alignItems: 'start',
  width: '100%',
  maxWidth: 1180,
  margin: '0 auto',
}

const heroLeft = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  paddingTop: 8,
}

const heroH1 = {
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(28px, 3.4vw, 40px)',
  lineHeight: 1.15,
  fontWeight: 600,
  letterSpacing: '-0.02em',
  color: 'var(--text-strong)',
  margin: 0,
}

const heroSub = {
  fontSize: 14.5,
  lineHeight: 1.6,
  color: 'var(--text-muted)',
  margin: 0,
  maxWidth: 460,
}

const uploadCard = {
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-lg)',
  padding: 18,
  boxShadow: 'var(--shadow-sm)',
}

const tabRow = {
  display: 'flex',
  gap: 4,
  background: 'var(--bg-subtle)',
  padding: 3,
  borderRadius: 'var(--radius)',
  marginBottom: 14,
}

const tabBase = {
  flex: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '7px 12px',
  fontSize: 12.5,
  fontWeight: 600,
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
}

const tabActive = {
  ...tabBase,
  background: 'var(--bg-elevated)',
  color: 'var(--text-strong)',
  boxShadow: 'var(--shadow-xs)',
}

const tabInactive = {
  ...tabBase,
  background: 'transparent',
  color: 'var(--text-muted)',
}

const dropZone = {
  border: '1.5px dashed',
  borderRadius: 'var(--radius)',
  padding: '24px 20px',
  textAlign: 'center',
  cursor: 'pointer',
  minHeight: 100,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  transition: 'background .15s, border-color .15s',
}

const fileRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
}

const removeBtn = {
  background: 'transparent',
  border: 'none',
  fontSize: 14,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: 4,
}

const textareaStyle = {
  width: '100%',
  minHeight: 110,
  resize: 'vertical',
  padding: '12px 14px',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg-subtle)',
  fontSize: 13.5,
  lineHeight: 1.55,
  fontFamily: 'inherit',
  color: 'var(--text-strong)',
  outline: 'none',
  boxSizing: 'border-box',
}

const fieldLabel = {
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  display: 'block',
  marginBottom: 6,
}

const selectStyle = {
  width: '100%',
  height: 38,
  padding: '0 12px',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg-elevated)',
  fontSize: 13.5,
  color: 'var(--text-strong)',
  outline: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const fieldHint = {
  margin: '6px 0 0',
  fontSize: 11.5,
  color: 'var(--text-soft)',
  lineHeight: 1.5,
}

const primaryCta = {
  marginTop: 16,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '12px 18px',
  background: 'var(--accent-strong)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius)',
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: '-0.005em',
  width: '100%',
  boxShadow: '0 4px 12px -2px rgba(20, 184, 166, 0.35)',
  transition: 'transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
}

const sectionBlock = {
  width: '100%',
  maxWidth: 1180,
  margin: '0 auto',
}

const artifactGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
}

const artifactCard = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  padding: '14px 16px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg-elevated)',
}

const artifactIcon = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 'var(--radius-sm)',
  background: 'var(--accent-soft)',
  color: 'var(--accent-ink)',
  flexShrink: 0,
}

const templateRow = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 10,
}

const templateBtn = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  padding: '12px 14px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg-elevated)',
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)',
}

const trustStrip = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: '12px 28px',
  padding: '20px',
  borderTop: '1px solid var(--border)',
  borderBottom: '1px solid var(--border)',
  background: 'var(--bg-subtle)',
  borderRadius: 'var(--radius)',
}

const trustItem = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12.5,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
}
