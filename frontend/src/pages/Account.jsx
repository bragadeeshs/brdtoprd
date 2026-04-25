import React, { useEffect, useState } from 'react'
import { UserProfile, useUser } from '@clerk/clerk-react'
import {
  adoptLegacyApi,
  downloadMeExport,
  getMeLegacyApi,
  getMeUsageApi,
} from '../api.js'
import { useToast } from '../components/Toast.jsx'
import { Badge, Button, Card, IconTile, Spinner } from '../components/primitives.jsx'
import {
  Activity,
  AlertTriangle,
  Download,
  RefreshCw,
  Sparkles,
  User,
  Zap,
} from '../components/icons.jsx'

const fmtCents = (cents) => `$${((cents || 0) / 100).toFixed(2)}`
const fmtNum = (n) => (n || 0).toLocaleString()
const fmtRelTime = (iso) => {
  if (!iso) return 'never'
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function StatTile({ label, value, sublabel }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 140,
        padding: 14,
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        background: 'var(--bg-elevated)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-soft)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--text-strong)', lineHeight: 1.1 }}>
        {value}
      </div>
      {sublabel && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
          {sublabel}
        </div>
      )}
    </div>
  )
}

function UsageSection() {
  const { toast } = useToast()
  const [usage, setUsage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      setUsage(await getMeUsageApi())
    } catch (e) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
        <Spinner size={14} /> Loading usage…
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <AlertTriangle size={16} style={{ color: 'var(--danger-ink)' }} />
        <div style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{error}</div>
        <Button variant="secondary" size="sm" icon={<RefreshCw size={12} />} onClick={refresh}>Retry</Button>
      </div>
    )
  }

  const { this_month: tm, all_time: at, by_model, last_extraction_at } = usage
  const totalTokens = (b) => (b.input_tokens || 0) + (b.output_tokens || 0)
  const monthCost = at.cost_cents > 0 ? Math.round((tm.cost_cents / at.cost_cents) * 100) : 0

  return (
    <div>
      {/* Top stat row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <StatTile
          label="This month"
          value={fmtCents(tm.cost_cents)}
          sublabel={`${fmtNum(tm.calls)} call${tm.calls === 1 ? '' : 's'} · ${fmtNum(totalTokens(tm))} tokens`}
        />
        <StatTile
          label="All time"
          value={fmtCents(at.cost_cents)}
          sublabel={`${fmtNum(at.calls)} call${at.calls === 1 ? '' : 's'} · ${fmtNum(totalTokens(at))} tokens`}
        />
        <StatTile
          label="Last extraction"
          value={last_extraction_at ? fmtRelTime(last_extraction_at) : '—'}
          sublabel={at.calls > 0 && monthCost > 0 ? `${monthCost}% of all-time spend this month` : 'no calls yet'}
        />
      </div>

      {/* By-model breakdown */}
      {by_model.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-soft)', fontStyle: 'italic' }}>
          No extractions yet — your usage will appear here after the first run.
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-soft)', marginBottom: 8 }}>
            By model
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {by_model.map((m) => {
              const pct = at.cost_cents > 0 ? Math.round((m.cost_cents / at.cost_cents) * 100) : 0
              return (
                <div
                  key={m.model}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-elevated)',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-strong)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.model}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {fmtNum(m.calls)} call{m.calls === 1 ? '' : 's'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)', minWidth: 60, textAlign: 'right' }}>
                    {fmtCents(m.cost_cents)}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-soft)', fontFamily: 'var(--font-mono)', minWidth: 32, textAlign: 'right' }}>
                    {pct}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function PlanSection() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Badge tone="success" dot>Free trial</Badge>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          No usage limits enforced yet. Pricing tiers + Stripe billing arrive in M3.5/M3.6.
        </span>
      </div>
      <div
        style={{
          padding: 14,
          border: '1px dashed var(--border)',
          borderRadius: 'var(--radius)',
          background: 'var(--bg-subtle)',
          fontSize: 12.5,
          color: 'var(--text-muted)',
          lineHeight: 1.55,
        }}
      >
        Until billing is live, every extraction runs at <strong style={{ color: 'var(--text-strong)' }}>at-cost</strong>:
        you pay Anthropic directly via your saved BYOK key, and we don't add a markup. The
        usage card above shows what you've spent.
      </div>
    </div>
  )
}

function DataSection() {
  const { toast } = useToast()
  const [legacy, setLegacy] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [adopting, setAdopting] = useState(false)

  const refresh = async () => {
    try { setLegacy(await getMeLegacyApi()) } catch { /* silent */ }
  }
  useEffect(() => { refresh() }, [])

  const onExport = async () => {
    setExporting(true)
    try {
      await downloadMeExport()
      toast.success('Export downloaded')
    } catch (e) {
      toast.error(e.message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const onAdopt = async () => {
    if (!legacy) return
    const total = legacy.extractions + legacy.projects + legacy.usage_logs
    if (!window.confirm(`Adopt ${total} orphan row${total === 1 ? '' : 's'} (from before per-user isolation landed)? This is one-shot.`)) return
    setAdopting(true)
    try {
      const res = await adoptLegacyApi()
      const moved = res.adopted_extractions + res.adopted_projects + res.adopted_usage_logs
      toast.success(`Adopted ${moved} row${moved === 1 ? '' : 's'} — they're now visible in Documents/Projects`)
      await refresh()
    } catch (e) {
      toast.error(e.message || 'Adopt failed')
    } finally {
      setAdopting(false)
    }
  }

  const hasLegacy = legacy && (legacy.extractions + legacy.projects + legacy.usage_logs) > 0

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="primary" size="sm" icon={<Download size={13} />} loading={exporting} onClick={onExport}>
          Export all data (.zip)
        </Button>
        {hasLegacy && (
          <Button variant="secondary" size="sm" icon={<Zap size={13} />} loading={adopting} onClick={onAdopt}>
            Adopt {legacy.extractions + legacy.projects + legacy.usage_logs} orphan row
            {legacy.extractions + legacy.projects + legacy.usage_logs === 1 ? '' : 's'}
          </Button>
        )}
      </div>

      <p style={{ fontSize: 11.5, color: 'var(--text-soft)', lineHeight: 1.55, marginTop: 12, marginBottom: 0 }}>
        The export ZIP contains every extraction (full payload), project, usage log, gap state, and
        original uploaded file we hold for you — JSON for the structured data, raw files under{' '}
        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>uploads/</code>. The Anthropic
        key is exported as ciphertext only (we never decrypt it for export).
      </p>
    </div>
  )
}

function Section({ icon, tone, title, description, children }) {
  return (
    <Card padding={20}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
          marginBottom: children ? 18 : 0,
        }}
      >
        <IconTile tone={tone} size={36}>{icon}</IconTile>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--text-strong)',
              margin: '0 0 4px',
              lineHeight: 1.3,
            }}
          >
            {title}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
            {description}
          </p>
        </div>
      </div>
      {children}
    </Card>
  )
}

export default function Account() {
  const { user, isLoaded } = useUser()
  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '24px 28px 40px',
        background: 'var(--bg)',
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 24,
          fontWeight: 600,
          color: 'var(--text-strong)',
          margin: '0 0 6px',
          letterSpacing: -0.3,
        }}
      >
        Account
      </h1>
      <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 22px', maxWidth: 640 }}>
        {isLoaded && user
          ? `Signed in as ${user.primaryEmailAddress?.emailAddress || user.username || user.id}.`
          : 'Loading account…'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 760 }}>
        <Section
          icon={<Activity size={16} />}
          tone="purple"
          title="Usage"
          description="Tokens billed, cost, and per-model breakdown — drawn from every Claude call you've made."
        >
          <UsageSection />
        </Section>

        <Section
          icon={<Sparkles size={16} />}
          tone="success"
          title="Plan"
          description="Your subscription tier and any quota limits."
        >
          <PlanSection />
        </Section>

        <Section
          icon={<Download size={16} />}
          tone="info"
          title="Data"
          description="GDPR-style data export, plus a one-shot button to claim any orphan dev rows from before per-user isolation landed."
        >
          <DataSection />
        </Section>

        <Section
          icon={<User size={16} />}
          tone="accent"
          title="Profile"
          description="Update your name, email, password, MFA, and connected accounts. Powered by Clerk."
        >
          {/* Clerk's UserProfile is a full embedded surface — set routing so it
              uses our /account path and doesn't try to navigate elsewhere. */}
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              background: 'var(--bg-elevated)',
            }}
          >
            {isLoaded ? (
              <UserProfile routing="hash" />
            ) : (
              <div style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
                <Spinner size={14} /> Loading profile…
              </div>
            )}
          </div>
        </Section>
      </div>
    </div>
  )
}
