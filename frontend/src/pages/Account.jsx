import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { UserProfile, useUser } from '@clerk/clerk-react'
import {
  adoptLegacyApi,
  createCheckoutApi,
  downloadMeExport,
  getMeLegacyApi,
  getMeUsageApi,
  getPortalApi,
} from '../api.js'
import { useApp } from '../lib/AppContext.jsx'
import { useToast } from '../components/Toast.jsx'
import { Badge, Button, Card, IconTile, Spinner, StatCard } from '../components/primitives.jsx'
import PageShell from '../components/PageShell.jsx'
import {
  Activity,
  AlertTriangle,
  Check,
  Download,
  RefreshCw,
  Settings as SettingsIcon,
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

// M3.6 — Lemon Squeezy plan picker. Reads current plan + subscription state
// from AppContext (App.jsx fetches /api/me/plan); writes via /api/me/checkout
// (LSQ hosted checkout) and /api/me/portal (LSQ self-service).
const PLAN_TIERS = [
  {
    id: 'starter',
    name: 'Starter',
    monthly: 20,
    annual: 192,
    extractions: 25,
    blurb: 'Sonnet model. 25-page docs. Personal workspace.',
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 49,
    annual: 470,
    extractions: 100,
    blurb: 'Sonnet + Opus. 50-page docs. Workspace member.',
    badge: { label: 'Recommended', tone: 'success' },
  },
  {
    id: 'team',
    name: 'Team',
    monthly: 99,
    annual: 950,
    extractions: 300,
    blurb: 'All models. 100-page docs. Workspace owner + admin.',
  },
]

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function PlanSection() {
  const { plan, refreshPlan } = useApp()
  const { toast } = useToast()
  const [busy, setBusy] = useState(null)  // tier id of in-flight checkout
  const [portalBusy, setPortalBusy] = useState(false)
  const [interval, setInterval] = useState('monthly')

  const currentPlan = plan?.plan || 'trial'
  const hasSub = !!plan?.has_active_subscription
  const isCanceled = !!plan?.plan_canceled_at

  const onSubscribe = async (tier) => {
    setBusy(tier)
    try {
      const { url } = await createCheckoutApi({ tier, interval })
      window.location.href = url  // full-page redirect to LSQ
    } catch (e) {
      toast.error(e.message || 'Could not start checkout')
      setBusy(null)
    }
  }

  const onManage = async () => {
    setPortalBusy(true)
    try {
      const { url } = await getPortalApi()
      window.location.href = url
    } catch (e) {
      toast.error(e.message || 'Could not load portal')
      setPortalBusy(false)
    }
  }

  return (
    <div>
      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <Badge
          tone={
            hasSub ? (isCanceled ? 'warn' : 'success')
            : currentPlan === 'expired' ? 'danger'
            : 'info'
          }
          dot
        >
          {plan?.plan_name || 'Loading…'}
        </Badge>
        {hasSub && plan?.plan_renews_at && !isCanceled && (
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            Renews on {fmtDate(plan.plan_renews_at)}
          </span>
        )}
        {hasSub && isCanceled && (
          <span style={{ fontSize: 12.5, color: 'var(--warn-ink)' }}>
            Cancellation pending — active until {fmtDate(plan.plan_renews_at)}
          </span>
        )}
        {currentPlan === 'trial' && plan?.trial_ends_at && (
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            Trial ends {fmtDate(plan.trial_ends_at)}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {hasSub && (
          <Button
            variant="secondary"
            size="sm"
            icon={<SettingsIcon size={13} />}
            loading={portalBusy}
            onClick={onManage}
          >
            Manage subscription
          </Button>
        )}
      </div>

      {/* Billing-interval toggle */}
      <div
        style={{
          display: 'inline-flex',
          padding: 3,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-pill)',
          marginBottom: 14,
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        {[
          { id: 'monthly', label: 'Monthly' },
          { id: 'annual', label: 'Annual' },
        ].map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setInterval(opt.id)}
            style={{
              padding: '5px 12px',
              borderRadius: 'var(--radius-pill)',
              fontSize: 12,
              fontWeight: 500,
              color: interval === opt.id ? 'var(--text-strong)' : 'var(--text-muted)',
              background: interval === opt.id ? 'var(--bg-subtle)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {opt.label}
            {opt.id === 'annual' && (
              <span style={{ marginLeft: 5, fontSize: 10.5, color: 'var(--success-ink)', fontWeight: 600 }}>
                save 20%
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tier cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PLAN_TIERS.map((t) => {
          const isCurrent = currentPlan === t.id && hasSub
          const price = interval === 'annual' ? t.annual : t.monthly
          const priceLabel = interval === 'annual' ? `$${price}/yr` : `$${price}/mo`
          return (
            <div
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: 14,
                border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                background: isCurrent ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                boxShadow: isCurrent ? '0 0 0 1px var(--accent), var(--shadow-xs)' : 'var(--shadow-xs)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{t.name}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>{priceLabel}</span>
                  {t.badge && (
                    <Badge tone={t.badge.tone} size="sm">{t.badge.label}</Badge>
                  )}
                  {isCurrent && (
                    <Badge tone="accent" icon={<Check size={11} />} size="sm">Current</Badge>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--text)' }}>{t.extractions} extractions/mo</strong>
                  {' · '}{t.blurb}
                </div>
              </div>
              {!isCurrent && (
                <Button
                  variant={t.id === 'pro' ? 'primary' : 'secondary'}
                  size="sm"
                  loading={busy === t.id}
                  onClick={() => onSubscribe(t.id)}
                  disabled={busy !== null}
                >
                  {busy === t.id ? 'Loading…' : (hasSub ? 'Switch' : 'Subscribe')}
                </Button>
              )}
            </div>
          )
        })}
      </div>

      <p
        style={{
          fontSize: 11.5,
          color: 'var(--text-soft)',
          marginTop: 14,
          lineHeight: 1.55,
        }}
      >
        Billing handled by Lemon Squeezy as Merchant of Record — they collect VAT/GST in your jurisdiction
        and provide proper tax invoices. Cancel anytime via "Manage subscription"; access continues until your
        renewal date.
      </p>
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

/* M12.2 — top-of-page KPI strip. Four StatCards in a flex row giving an
 * at-a-glance read on usage + spend without scrolling into the Usage
 * section. Does its own getMeUsageApi fetch — UsageSection's existing
 * fetch handles the by-model breakdown below; one extra GET here is
 * cheap and keeps both surfaces independently loadable. */
function KpiStrip() {
  const [usage, setUsage] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    getMeUsageApi()
      .then((u) => { if (alive) setUsage(u) })
      .catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [])

  if (error) return null   // soft-fail: UsageSection below shows the same data + error UI
  if (!usage) {
    // Skeleton row while fetching — same height as a real StatCard so layout doesn't jump.
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              flex: 1, minWidth: 180, height: 110,
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-subtle)',
              animation: `fade-in .25s ease-out ${i * 40}ms both`,
            }}
          />
        ))}
      </div>
    )
  }

  const { this_month: tm, all_time: at } = usage
  const totalTokens = (b) => (b.input_tokens || 0) + (b.output_tokens || 0)
  const avgCost = tm.calls > 0 ? Math.round(tm.cost_cents / tm.calls) : 0

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
      <StatCard
        label="Extractions this month"
        value={fmtNum(tm.calls)}
        sublabel={tm.calls === 0 ? 'no runs yet this month' : `${fmtNum(totalTokens(tm))} tokens`}
        icon={<Zap size={16} />}
      />
      <StatCard
        label="Cost this month"
        value={fmtCents(tm.cost_cents)}
        sublabel={tm.calls > 0 ? `≈ ${fmtCents(avgCost)}/call avg` : '—'}
        icon={<Sparkles size={16} />}
      />
      <StatCard
        label="Tokens this month"
        value={fmtNum(totalTokens(tm))}
        sublabel={`${fmtNum(tm.input_tokens || 0)} in · ${fmtNum(tm.output_tokens || 0)} out`}
        icon={<Activity size={16} />}
      />
      <StatCard
        label="All-time extractions"
        value={fmtNum(at.calls)}
        sublabel={`${fmtCents(at.cost_cents)} total spend`}
        icon={<Check size={16} />}
      />
    </div>
  )
}

export default function Account() {
  const { user, isLoaded } = useUser()
  const { refreshPlan } = useApp()
  const { toast } = useToast()
  const location = useLocation()
  const navigate = useNavigate()

  // M3.6 — LSQ redirects back to /account?checkout=success after payment.
  // Webhook flips user_settings.plan ~immediately; we just need to re-fetch
  // and tell the user. Strip the query so a refresh doesn't re-toast.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('checkout') === 'success') {
      toast.success('Subscription active — welcome aboard!')
      refreshPlan()
      navigate('/account', { replace: true })
    }
  }, [location.search, refreshPlan, toast, navigate])

  // M10.7 — moved to PageShell. `wide` because the Profile section embeds
  // Clerk's UserProfile widget which is itself a wide multi-column surface
  // (~720px wants more room).
  // M12.4 — icon prop renders a 36px IconTile next to the title for a
  // visual anchor (matches the reference dashboard pattern).
  // M12.2 — KpiStrip renders above the existing Section stack for an
  // at-a-glance read on usage + spend.
  const description = isLoaded && user
    ? `Signed in as ${user.primaryEmailAddress?.emailAddress || user.username || user.id}.`
    : 'Loading account…'
  return (
    <PageShell title="Account" description={description} icon={<User size={18} />} wide>
      <KpiStrip />
      <Section
        icon={<Activity size={16} />}
        tone="accent"
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
        tone="accent"
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
    </PageShell>
  )
}
