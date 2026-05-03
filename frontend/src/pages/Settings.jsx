import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  addSlackWebhookApi,
  createApiTokenApi,
  createPromptTemplateApi,
  deleteFewShotExampleApi,
  deleteGitHubConnectionApi,
  deleteJiraConnectionApi,
  deleteLinearConnectionApi,
  deleteNotionConnectionApi,
  deletePromptTemplateApi,
  deleteSlackConnectionApi,
  deleteSlackWebhookApi,
  downloadMeExport,
  getGitHubConnectionApi,
  getJiraConnectionApi,
  getJiraOAuthStatusApi,
  getLinearConnectionApi,
  getMeSettingsApi,
  getNotionConnectionApi,
  getSlackConnectionApi,
  listApiTokensApi,
  listFewShotExamplesApi,
  listGitHubReposApi,
  listJiraProjectsApi,
  listLinearTeamsApi,
  listNotionDatabasesApi,
  listPromptTemplatesApi,
  listSlackWebhooksApi,
  patchFewShotExampleApi,
  patchPromptTemplateApi,
  putGitHubConnectionApi,
  putJiraConnectionApi,
  putLinearConnectionApi,
  putMeSettingsApi,
  putNotionConnectionApi,
  putSlackConnectionApi,
  revokeApiTokenApi,
  startJiraOAuthApi,
  testApiKey,
} from '../api.js'
import { copyToClipboard } from '../lib/clipboard.js'
import { useApp } from '../lib/AppContext.jsx'
import { useOrganization } from '@clerk/clerk-react'
import { useToast } from '../components/Toast.jsx'
import { Badge, Button, Card, IconTile, Spinner } from '../components/primitives.jsx'
import PageShell from '../components/PageShell.jsx'
import { BookOpen, Brush, ChevronRight, Clock, Code, CheckCircle, DollarSign, Download, ExternalLink, Eye, FileText, Headphones, HelpCircle, Inbox, Info, Key, Lightbulb, Lock, Mail, Monitor, Moon, Plug, Send, Shield, Sparkles, Sun, Trash, Users, Wrench, Zap } from '../components/icons.jsx'

function Section({ icon, tone, title, description, comingIn, children }) {
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
        <IconTile tone={tone} size={36}>
          {icon}
        </IconTile>
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
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            {description}
          </p>
        </div>
        {comingIn && (
          <Badge tone="neutral" size="sm">
            Coming in {comingIn}
          </Badge>
        )}
      </div>
      {children}
    </Card>
  )
}

const MODEL_OPTIONS = [
  {
    id: '',
    name: 'Server default',
    description: 'Use whatever the server is configured with via STORYFORGE_MODEL.',
    pricing: null,
    badge: null,
  },
  {
    id: 'claude-opus-4-7',
    name: 'Claude Opus 4.7',
    description: 'Most capable. Best for complex documents and high-stakes extraction.',
    pricing: '$5 in / $25 out · per 1M tokens',
    badge: { label: 'Best quality', tone: 'purple' },
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    description: 'Cost-quality sweet spot. Recommended for most workloads.',
    pricing: '$3 in / $15 out · per 1M tokens',
    badge: { label: 'Recommended', tone: 'success' },
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    description: 'Fastest and cheapest. Good for short, simple docs.',
    pricing: '$1 in / $5 out · per 1M tokens',
    badge: { label: 'Fastest', tone: 'info' },
  },
]

function ModelPicker({ selected, onChange }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const onSelect = async (id) => {
    if (id === selected || busy) return
    setBusy(true)
    try {
      // Server stores `model_default` as null when empty; pass empty string
      // here and the API client + backend translate it correctly.
      const next = await putMeSettingsApi({ modelDefault: id || '' })
      onChange(next.model_default || '')
      const opt = MODEL_OPTIONS.find((o) => o.id === id)
      toast.success(`Model set to ${opt.name}`)
    } catch (e) {
      toast.error(e.message || 'Could not save model preference')
    } finally {
      setBusy(false)
    }
  }

  /* M14.5.c — radio rows with right-aligned pricing column matching the
     design replica. Default option gets a "Default" pill in the
     pricing column (server config doesn't have a $ price). */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {MODEL_OPTIONS.map((opt) => {
        const isSelected = selected === opt.id
        const isDefault = opt.id === ''
        return (
          <button
            key={opt.id || 'default'}
            type="button"
            onClick={() => onSelect(opt.id)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              padding: '14px 16px',
              border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              background: isSelected ? 'var(--accent-soft)' : 'var(--bg-elevated)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'border-color .12s, background .12s',
              fontFamily: 'inherit',
              color: 'inherit',
            }}
          >
            {/* Radio circle */}
            <span
              aria-hidden
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border-strong)'}`,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 2,
                background: 'var(--bg-elevated)',
                transition: 'border-color .12s',
              }}
            >
              {isSelected && (
                <span style={{ width: 9, height: 9, borderRadius: 999, background: 'var(--accent)' }} />
              )}
            </span>

            {/* Middle: name + badge inline, description below */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
                  {opt.name}
                </span>
                {opt.badge && (
                  <Badge tone={opt.badge.tone} size="sm">
                    {opt.badge.label}
                  </Badge>
                )}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                }}
              >
                {opt.description}
              </div>
            </div>

            {/* Right: pricing (or "Default" pill for the server-default option) */}
            <div style={{
              flexShrink: 0,
              textAlign: 'right',
              minWidth: 110,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 2,
            }}>
              {opt.pricing ? (
                <>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
                    {opt.pricing.split('·')[0]?.trim()}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-soft)' }}>
                    {opt.pricing.split('·')[1]?.trim() || 'per 1M tokens'}
                  </span>
                </>
              ) : isDefault ? (
                <Badge tone="neutral" size="sm">Default</Badge>
              ) : null}
            </div>
          </button>
        )
      })}
    </div>
  )
}

/* M9.2 — ThemePicker restored. The user wants the formal theme picker
 * back in Settings (where it can carry descriptions for each option);
 * the TopBar overflow menu (M8.3) keeps its quick-cycle shortcut. Both
 * surfaces drive the same `theme` state in AppContext. */
const THEME_OPTIONS = [
  { id: 'light', name: 'Light', description: 'Warm off-white background.', icon: <Sun size={16} /> },
  { id: 'dark', name: 'Dark', description: 'Easier on the eyes after sundown.', icon: <Moon size={16} /> },
  {
    id: 'system',
    name: 'System',
    description: 'Match your operating-system preference; updates as it changes.',
    icon: <Monitor size={16} />,
  },
]

function ThemePicker() {
  const { theme, setTheme } = useApp()
  const { toast } = useToast()

  const onSelect = (id) => {
    if (id === theme) return
    setTheme(id)
    const opt = THEME_OPTIONS.find((o) => o.id === id)
    toast.success(`Theme set to ${opt.name}`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {THEME_OPTIONS.map((opt) => {
        const isSelected = theme === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              background: isSelected ? 'var(--accent-soft)' : 'var(--bg-elevated)',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
              color: 'inherit',
              boxShadow: isSelected ? '0 0 0 1px var(--accent)' : 'none',
            }}
          >
            <IconTile tone={isSelected ? 'accent' : 'neutral'} size={28}>
              {opt.icon}
            </IconTile>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
                {opt.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 2 }}>
                {opt.description}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// M10.7 — PageShell extracted to ../components/PageShell.jsx so Account,
// Project, and other top-level pages can land on the same layout rhythm
// without copy-pasting the wrapper.

function ApiKeyForm({ keySet, keyPreview, byokMode = 'strict', onSaved }) {
  const { toast } = useToast()
  // The raw key is held in component state ONLY while the user is editing.
  // It is never persisted client-side — Save sends it once to the backend
  // (which encrypts via Fernet) and we drop it from state.
  const [key, setKey] = useState('')
  const [shown, setShown] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)

  const trimmed = key.trim()
  const dirty = trimmed.length > 0

  const onSave = async () => {
    if (!trimmed) return
    setSaving(true)
    try {
      const next = await putMeSettingsApi({ anthropicKey: trimmed })
      onSaved(next)
      setKey('')  // clear form — server now holds the secret
      toast.success('API key saved (encrypted server-side)')
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const onRemove = async () => {
    setSaving(true)
    try {
      const next = await putMeSettingsApi({ anthropicKey: '' })
      onSaved(next)
      setKey('')
      toast.success('API key removed — falling back to server env key (or mock mode)')
    } catch (e) {
      toast.error(e.message || 'Remove failed')
    } finally {
      setSaving(false)
    }
  }

  const onTest = async () => {
    if (!trimmed) {
      toast.warn('Enter a key first')
      return
    }
    setTesting(true)
    try {
      const result = await testApiKey(trimmed)
      toast.success(`Key works — Claude is reachable (${result.models_visible} models visible)`)
    } catch (e) {
      toast.error(e.message || 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  // M3.4.6 — managed mode: server pays for every extraction. The BYOK form
  // is hidden entirely so users don't accidentally save a key that will be
  // ignored. (UserSettings still allows model_default — picker is below.)
  if (byokMode === 'managed') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--success)' }} />
        <span>
          Managed mode — extractions use the Lucid-hosted Anthropic key.
          You don't need to bring your own.
        </span>
      </div>
    )
  }

  // Mode-aware copy for the inactive (no-user-key) state. In strict the env
  // key is NOT a fallback for live extractions; in choice it is.
  const inactiveCopy =
    byokMode === 'choice'
      ? 'Inactive — extractions use the server-managed key. Add your own to bring your own billing.'
      : 'Inactive — extractions run in mock mode until you add a key.'

  return (
    <div>
      {/* M14.5.c — status row: colored dot + status text + info icon. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 14,
          fontSize: 13,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: keySet ? 'var(--success)' : 'var(--text-soft)',
            flexShrink: 0,
          }}
        />
        <span style={{ color: keySet ? 'var(--text)' : 'var(--text-muted)', flex: 1 }}>
          {keySet ? (
            <>
              Active — extractions use your key
              {keyPreview && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11.5,
                    color: 'var(--text-soft)',
                    marginLeft: 8,
                  }}
                >
                  ({keyPreview})
                </span>
              )}
            </>
          ) : (
            inactiveCopy
          )}
        </span>
        <span
          aria-label="More info"
          title="Status reflects whether your stored key is active for live extractions."
          style={{
            color: 'var(--text-soft)',
            display: 'inline-flex',
            cursor: 'help',
          }}
        >
          <Info size={14} />
        </span>
      </div>

      {/* Field label */}
      <label
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          display: 'block',
          marginBottom: 6,
        }}
      >
        API key
      </label>

      {/* Input */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius)',
          gap: 6,
        }}
      >
        <input
          type={shown ? 'text' : 'password'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={keySet ? 'Paste a new key to replace the saved one…' : 'sk-ant-api03-…'}
          spellCheck={false}
          autoComplete="off"
          disabled={saving}
          style={{
            flex: 1,
            height: 42,
            border: 'none',
            background: 'transparent',
            fontSize: 13,
            fontFamily: 'var(--font-mono)',
            outline: 'none',
            color: 'var(--text-strong)',
            minWidth: 0,
          }}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? 'Hide key' : 'Show key'}
          title={shown ? 'Hide key' : 'Show key'}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 6,
            borderRadius: 4,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Eye size={15} />
        </button>
      </div>

      {/* Actions — three buttons matching the design replica:
          Test connection (ghost) · Save key (solid teal primary) · Remove (red ghost). */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onTest}
          disabled={!trimmed || saving || testing}
          style={apiKeyBtnGhost}
        >
          <Sparkles size={13} />
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          style={{
            ...apiKeyBtnPrimary,
            opacity: (!dirty || saving) ? 0.55 : 1,
            cursor: (!dirty || saving) ? 'not-allowed' : 'pointer',
          }}
        >
          <Shield size={13} />
          {saving ? 'Saving…' : (keySet ? 'Replace key' : 'Save key')}
        </button>
        {keySet && (
          <button
            type="button"
            onClick={onRemove}
            disabled={saving}
            style={apiKeyBtnDanger}
          >
            <Trash size={13} />
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

const apiKeyBtnBase = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '8px 14px',
  borderRadius: 'var(--radius)',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
}

const apiKeyBtnGhost = {
  ...apiKeyBtnBase,
  background: 'var(--bg-elevated)',
  color: 'var(--text-strong)',
  border: '1px solid var(--border-strong)',
}

const apiKeyBtnPrimary = {
  ...apiKeyBtnBase,
  background: 'var(--accent-strong)',
  color: '#fff',
  border: '1px solid var(--accent-strong)',
}

const apiKeyBtnDanger = {
  ...apiKeyBtnBase,
  background: 'var(--bg-elevated)',
  color: 'var(--danger-ink)',
  border: '1px solid var(--danger-soft)',
}

/* M6.2.c — scope picker shared by all 5 connection forms. Only renders
 * the toggle when the user has an active workspace context (otherwise
 * personal is the only option and the UI is silent about it).
 *
 *   const { scope, setScope, picker, badge } = useConnectionScope(conn?.scope)
 *
 *   // form mode: drop {picker} above Save
 *   // connected display: drop {badge} next to the title
 */
function useConnectionScope(initialScope) {
  const { organization } = useOrganization()
  const orgName = organization?.name
  const [scope, setScope] = useState(initialScope || 'user')

  // When the saved connection's scope changes (eg after a fresh GET),
  // sync the local state — but only if the caller is *not* mid-edit
  // (which would clobber the user's pending choice). Caller controls
  // by passing a key/effect; here we just track the prop.
  useEffect(() => {
    if (initialScope) setScope(initialScope)
  }, [initialScope])

  const picker = !organization ? null : (
    <label
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        fontSize: 12.5, color: 'var(--text)', userSelect: 'none',
        margin: '4px 0',
      }}
    >
      <input
        type="checkbox"
        checked={scope === 'org'}
        onChange={(e) => setScope(e.target.checked ? 'org' : 'user')}
        style={{ marginTop: 2 }}
      />
      <span>
        Share with workspace <strong>{orgName}</strong>
        <div style={{ fontSize: 11.5, color: 'var(--text-soft)', marginTop: 2 }}>
          Every member can use this connection. Members with their own
          personal connection keep using theirs.
        </div>
      </span>
    </label>
  )

  const badge = (
    <Badge tone={scope === 'org' ? 'info' : 'neutral'} size="sm">
      {scope === 'org' ? `Workspace · ${orgName || 'org'}` : 'Personal'}
    </Badge>
  )

  return { scope, setScope, picker, badge }
}

/* M6.2 — Jira connection form. Two states: not-connected (full form
 * with Connect + Cancel) and connected (preview row with Test + Edit
 * + Disconnect). Edit puts us back in form mode with the existing
 * fields pre-filled (token shown blank — never round-tripped from
 * backend, user must re-enter to change). */
function JiraConnectionForm() {
  const { toast } = useToast()
  const [conn, setConn] = useState(null)        // saved connection or null
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false) // form open
  const [busy, setBusy] = useState(false)
  const [oauthEnabled, setOauthEnabled] = useState(false)   // M6.2.d
  const { scope, picker: scopePicker, badge: scopeBadge } = useConnectionScope(conn?.scope)

  // Form fields (only used while editing)
  const [baseUrl, setBaseUrl] = useState('')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')

  // Detect the ?jira_oauth=connected / ?jira_oauth_error=… search params
  // dropped by the OAuth callback, surface a toast, then strip them from
  // the URL so a refresh doesn't re-toast.
  useEffect(() => {
    const u = new URL(window.location.href)
    const ok = u.searchParams.get('jira_oauth')
    const err = u.searchParams.get('jira_oauth_error')
    if (ok === 'connected') toast.success('Jira connected via Atlassian.')
    else if (err) toast.error(`Jira OAuth failed: ${err}`)
    if (ok || err) {
      u.searchParams.delete('jira_oauth')
      u.searchParams.delete('jira_oauth_error')
      window.history.replaceState({}, '', u.toString())
    }
  }, [toast])

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([getJiraConnectionApi(), getJiraOAuthStatusApi()])
      .then(([c, status]) => {
        if (!alive) return
        setConn(c)
        setOauthEnabled(!!status?.enabled)
      })
      .catch((e) => { if (alive) toast.error(e.message || 'Could not load Jira connection') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const startOAuth = async () => {
    setBusy(true)
    try {
      const r = await startJiraOAuthApi()
      // Hard navigate to Atlassian — they redirect back to the callback,
      // which then redirects to /settings with ?jira_oauth=connected.
      window.location.href = r.url
    } catch (e) {
      toast.error(e.message || 'Could not start OAuth')
      setBusy(false)
    }
  }

  const startEdit = () => {
    setBaseUrl(conn?.base_url || '')
    setEmail(conn?.email || '')
    setToken('')
    setEditing(true)
  }
  const cancelEdit = () => {
    setEditing(false)
    setBaseUrl(''); setEmail(''); setToken('')
  }

  const save = async () => {
    if (!baseUrl.trim() || !email.trim() || !token.trim()) {
      toast.error('All fields required')
      return
    }
    setBusy(true)
    try {
      const c = await putJiraConnectionApi({
        base_url: baseUrl.trim(),
        email: email.trim(),
        api_token: token.trim(),
        scope,   // M6.2.c
      })
      setConn(c)
      setEditing(false)
      setToken('')   // never keep the plaintext in component state
      toast.success('Jira connection saved')
    } catch (e) {
      toast.error(e.message || 'Could not save Jira connection')
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    try {
      const projects = await listJiraProjectsApi()
      toast.success(`Connection OK — ${projects.length} project${projects.length === 1 ? '' : 's'} visible`)
    } catch (e) {
      toast.error(e.message || 'Connection test failed')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!window.confirm('Disconnect Jira? You can reconnect any time.')) return
    setBusy(true)
    try {
      // M6.2.c — disconnect at the connection's actual scope (a personal
      // disconnect must not delete the workspace's shared connection,
      // and vice versa).
      await deleteJiraConnectionApi({ scope: conn?.scope || 'user' })
      setConn(null)
      toast.success('Jira disconnected')
    } catch (e) {
      toast.error(e.message || 'Could not disconnect')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
        <Spinner size={14} /> Loading Jira connection…
      </div>
    )
  }

  if (conn && !editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ marginBottom: 2 }}>{scopeBadge}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '4px 12px', fontSize: 13 }}>
          <div style={{ color: 'var(--text-soft)' }}>URL</div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{conn.base_url}</div>
          <div style={{ color: 'var(--text-soft)' }}>Email</div>
          <div style={{ color: 'var(--text-strong)' }}>{conn.email}</div>
          <div style={{ color: 'var(--text-soft)' }}>Token</div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{conn.api_token_preview}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Button variant="secondary" size="sm" onClick={test} disabled={busy}>
            {busy ? 'Testing…' : 'Test'}
          </Button>
          <Button variant="secondary" size="sm" onClick={startEdit} disabled={busy}>Edit</Button>
          <Button variant="ghost" size="sm" onClick={disconnect} disabled={busy}>Disconnect</Button>
        </div>
      </div>
    )
  }

  // Form mode (no saved conn, or editing)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
      {/* M6.2.d — OAuth shortcut. Only visible when the server has
          CLIENT_ID/SECRET configured. Below it: a soft divider + the
          existing API-token form for users who prefer the manual path. */}
      {oauthEnabled && (
        <>
          <Button
            variant="primary"
            size="sm"
            onClick={startOAuth}
            disabled={busy}
            style={{ alignSelf: 'flex-start' }}
          >
            {busy ? 'Redirecting…' : 'Connect with Atlassian'}
          </Button>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            margin: '4px 0', color: 'var(--text-soft)', fontSize: 11,
          }}>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            or use an API token
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
        </>
      )}
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
        Generate an API token at{' '}
        <a
          href="https://id.atlassian.com/manage-profile/security/api-tokens"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent-strong)' }}
        >
          id.atlassian.com → API tokens
        </a>
        . The token is encrypted before storage and only decrypted at push time.
      </p>
      <FieldLabel>Atlassian URL</FieldLabel>
      <input
        type="url"
        placeholder="https://your-team.atlassian.net"
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        disabled={busy}
        style={inputStyle}
      />
      <FieldLabel>Email</FieldLabel>
      <input
        type="email"
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy}
        style={inputStyle}
      />
      <FieldLabel>API token</FieldLabel>
      <input
        type="password"
        placeholder="paste token here"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        disabled={busy}
        style={inputStyle}
      />
      {scopePicker}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Button variant="primary" size="sm" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : conn ? 'Save changes' : 'Connect'}
        </Button>
        {(conn || editing) && (
          <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={busy}>Cancel</Button>
        )}
      </div>
    </div>
  )
}

/* M6.3 — Linear connection form. Mirrors JiraConnectionForm but with
 * a single API-key input (Linear's auth is a personal API key — workspace
 * is implied, no URL or email needed). */
function LinearConnectionForm() {
  const { toast } = useToast()
  const [conn, setConn] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState('')
  const { scope, picker: scopePicker, badge: scopeBadge } = useConnectionScope(conn?.scope)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getLinearConnectionApi()
      .then((c) => { if (alive) setConn(c) })
      .catch((e) => { if (alive) toast.error(e.message || 'Could not load Linear connection') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const startEdit = () => { setToken(''); setEditing(true) }
  const cancelEdit = () => { setEditing(false); setToken('') }

  const save = async () => {
    if (!token.trim()) {
      toast.error('API key required')
      return
    }
    setBusy(true)
    try {
      const c = await putLinearConnectionApi({ api_key: token.trim(), scope })
      setConn(c)
      setEditing(false)
      setToken('')
      toast.success('Linear connection saved')
    } catch (e) {
      toast.error(e.message || 'Could not save Linear connection')
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    try {
      const teams = await listLinearTeamsApi()
      toast.success(`Connection OK — ${teams.length} team${teams.length === 1 ? '' : 's'} visible`)
    } catch (e) {
      toast.error(e.message || 'Connection test failed')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!window.confirm('Disconnect Linear? You can reconnect any time.')) return
    setBusy(true)
    try {
      await deleteLinearConnectionApi({ scope: conn?.scope || 'user' })
      setConn(null)
      toast.success('Linear disconnected')
    } catch (e) {
      toast.error(e.message || 'Could not disconnect')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
        <Spinner size={14} /> Loading Linear connection…
      </div>
    )
  }

  if (conn && !editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>{scopeBadge}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '4px 12px', fontSize: 13 }}>
          <div style={{ color: 'var(--text-soft)' }}>API key</div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{conn.api_key_preview}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Button variant="secondary" size="sm" onClick={test} disabled={busy}>
            {busy ? 'Testing…' : 'Test'}
          </Button>
          <Button variant="secondary" size="sm" onClick={startEdit} disabled={busy}>Edit</Button>
          <Button variant="ghost" size="sm" onClick={disconnect} disabled={busy}>Disconnect</Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
        Generate a personal API key at{' '}
        <a
          href="https://linear.app/settings/api"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent-strong)' }}
        >
          linear.app → Settings → API
        </a>
        . The key is encrypted before storage.
      </p>
      <FieldLabel>API key</FieldLabel>
      <input
        type="password"
        placeholder="lin_api_…"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        disabled={busy}
        style={inputStyle}
      />
      {scopePicker}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Button variant="primary" size="sm" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : conn ? 'Save changes' : 'Connect'}
        </Button>
        {(conn || editing) && (
          <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={busy}>Cancel</Button>
        )}
      </div>
    </div>
  )
}

/* M6.4 — GitHub connection form. Mirrors Linear's (single PAT input;
 * GitHub's PAT carries scope so no URL/owner needed at save time —
 * the repo picker comes at push time). */
function GitHubConnectionForm() {
  const { toast } = useToast()
  const [conn, setConn] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState('')
  const { scope, picker: scopePicker, badge: scopeBadge } = useConnectionScope(conn?.scope)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getGitHubConnectionApi()
      .then((c) => { if (alive) setConn(c) })
      .catch((e) => { if (alive) toast.error(e.message || 'Could not load GitHub connection') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const startEdit = () => { setToken(''); setEditing(true) }
  const cancelEdit = () => { setEditing(false); setToken('') }

  const save = async () => {
    if (!token.trim()) {
      toast.error('Token required')
      return
    }
    setBusy(true)
    try {
      const c = await putGitHubConnectionApi({ api_token: token.trim(), scope })
      setConn(c)
      setEditing(false)
      setToken('')
      toast.success('GitHub connection saved')
    } catch (e) {
      toast.error(e.message || 'Could not save GitHub connection')
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    try {
      const repos = await listGitHubReposApi()
      toast.success(`Connection OK — ${repos.length} repo${repos.length === 1 ? '' : 's'} visible`)
    } catch (e) {
      toast.error(e.message || 'Connection test failed')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!window.confirm('Disconnect GitHub? You can reconnect any time.')) return
    setBusy(true)
    try {
      await deleteGitHubConnectionApi({ scope: conn?.scope || 'user' })
      setConn(null)
      toast.success('GitHub disconnected')
    } catch (e) {
      toast.error(e.message || 'Could not disconnect')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
        <Spinner size={14} /> Loading GitHub connection…
      </div>
    )
  }

  if (conn && !editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>{scopeBadge}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '4px 12px', fontSize: 13 }}>
          <div style={{ color: 'var(--text-soft)' }}>Token</div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{conn.api_token_preview}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Button variant="secondary" size="sm" onClick={test} disabled={busy}>
            {busy ? 'Testing…' : 'Test'}
          </Button>
          <Button variant="secondary" size="sm" onClick={startEdit} disabled={busy}>Edit</Button>
          <Button variant="ghost" size="sm" onClick={disconnect} disabled={busy}>Disconnect</Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
        Generate a personal access token at{' '}
        <a
          href="https://github.com/settings/tokens"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent-strong)' }}
        >
          github.com → Settings → Tokens
        </a>
        {' '}with the <code style={{ fontSize: 11.5 }}>repo</code> scope. The token is encrypted before storage.
      </p>
      <FieldLabel>Personal access token</FieldLabel>
      <input
        type="password"
        placeholder="ghp_…"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        disabled={busy}
        style={inputStyle}
      />
      {scopePicker}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Button variant="primary" size="sm" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : conn ? 'Save changes' : 'Connect'}
        </Button>
        {(conn || editing) && (
          <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={busy}>Cancel</Button>
        )}
      </div>
    </div>
  )
}

/* M6.6 — Slack connection form. Slightly different from the others —
 * Slack uses an incoming webhook URL (channel-specific) rather than an
 * API key. No "test" button: a test post would publish a real message
 * to the user's Slack channel, which is annoying as a UX. The first
 * real push doubles as the test. */
function SlackConnectionForm() {
  const { toast } = useToast()
  const [conn, setConn] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const { scope, picker: scopePicker, badge: scopeBadge } = useConnectionScope(conn?.scope)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getSlackConnectionApi()
      .then((c) => { if (alive) setConn(c) })
      .catch((e) => { if (alive) toast.error(e.message || 'Could not load Slack connection') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const startEdit = () => {
    setUrl('')
    setLabel(conn?.channel_label || '')
    setEditing(true)
  }
  const cancelEdit = () => { setEditing(false); setUrl(''); setLabel('') }

  const save = async () => {
    if (!url.trim()) {
      toast.error('Webhook URL required')
      return
    }
    setBusy(true)
    try {
      const c = await putSlackConnectionApi({
        webhook_url: url.trim(),
        channel_label: label.trim() || null,
        scope,
      })
      setConn(c)
      setEditing(false)
      setUrl(''); setLabel('')
      toast.success('Slack connection saved')
    } catch (e) {
      toast.error(e.message || 'Could not save Slack connection')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!window.confirm('Disconnect Slack? You can reconnect any time.')) return
    setBusy(true)
    try {
      await deleteSlackConnectionApi({ scope: conn?.scope || 'user' })
      setConn(null)
      toast.success('Slack disconnected')
    } catch (e) {
      toast.error(e.message || 'Could not disconnect')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
        <Spinner size={14} /> Loading Slack connection…
      </div>
    )
  }

  if (conn && !editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>{scopeBadge}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '4px 12px', fontSize: 13 }}>
          <div style={{ color: 'var(--text-soft)' }}>Webhook</div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
            {conn.webhook_url_preview}
          </div>
          {conn.channel_label && (
            <>
              <div style={{ color: 'var(--text-soft)' }}>Channel</div>
              <div style={{ color: 'var(--text-strong)' }}>{conn.channel_label}</div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Button variant="secondary" size="sm" onClick={startEdit} disabled={busy}>Edit</Button>
          <Button variant="ghost" size="sm" onClick={disconnect} disabled={busy}>Disconnect</Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
        Create an Incoming Webhook in Slack — pick a channel, install the app, copy the URL.
        See{' '}
        <a
          href="https://api.slack.com/messaging/webhooks"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent-strong)' }}
        >
          api.slack.com → Incoming Webhooks
        </a>
        . The URL is channel-specific (one webhook = one channel) and is encrypted before storage.
      </p>
      <FieldLabel>Webhook URL</FieldLabel>
      <input
        type="password"
        placeholder="https://hooks.slack.com/services/T…/B…/…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={busy}
        style={inputStyle}
      />
      <FieldLabel>Channel name (cosmetic, optional)</FieldLabel>
      <input
        type="text"
        placeholder="#dev-team"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        disabled={busy}
        style={inputStyle}
      />
      {scopePicker}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Button variant="primary" size="sm" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : conn ? 'Save changes' : 'Connect'}
        </Button>
        {(conn || editing) && (
          <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={busy}>Cancel</Button>
        )}
      </div>
    </div>
  )
}

/* M6.6.b — Additional Slack destinations. Lives below the primary
 * connection form. Each row = one named webhook (e.g. "stakeholders" /
 * "dev-team-2"). Add form is inline; remove is one-click with a confirm.
 * Hidden when no primary webhook is connected (the backend would 400 on
 * any add attempt anyway). */
function SlackAdditionalDestinations() {
  const { toast } = useToast()
  const [items, setItems] = useState(null)        // [] = empty list, null = loading
  const [hasPrimary, setHasPrimary] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')

  const refresh = () => {
    setLoading(true)
    listSlackWebhooksApi()
      .then((rows) => {
        setHasPrimary(rows.some((d) => d.is_primary))
        setItems(rows.filter((d) => !d.is_primary))
      })
      .catch((e) => toast.error(e.message || 'Could not load destinations'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The endpoint returns [] when no Slack connection exists at all; in that
  // case the primary form's empty state already nudges the user, so we hide
  // this whole section to avoid noise.
  if (!loading && !hasPrimary) return null

  const submit = async () => {
    if (!name.trim() || !url.trim()) {
      toast.error('Name and URL required')
      return
    }
    setBusy(true)
    try {
      await addSlackWebhookApi({
        name: name.trim(),
        webhook_url: url.trim(),
        channel_label: label.trim() || null,
      })
      setName(''); setUrl(''); setLabel('')
      setAdding(false)
      refresh()
      toast.success('Destination added')
    } catch (e) {
      toast.error(e.message || 'Could not add destination')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id, dispName) => {
    if (!window.confirm(`Remove "${dispName}"? Pushes targeting it will start failing.`)) return
    setBusy(true)
    try {
      await deleteSlackWebhookApi(id)
      refresh()
      toast.success('Destination removed')
    } catch (e) {
      toast.error(e.message || 'Could not remove')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <FieldLabel>Additional destinations</FieldLabel>
        {!adding && (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)} disabled={busy}>
            + Add destination
          </Button>
        )}
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-soft)', margin: '0 0 10px', lineHeight: 1.5 }}>
        Push to a different channel without changing your primary. The push modal lets you pick which
        destination to send to.
      </p>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
      ) : items && items.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: adding ? 12 : 0 }}>
          {items.map((d) => (
            <div
              key={d.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 10px', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: 500 }}>
                  {d.name}
                  {d.channel_label && (
                    <span style={{ color: 'var(--text-soft)', fontWeight: 400 }}> · {d.channel_label}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                  {d.webhook_url_preview}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove(d.id, d.name)}
                disabled={busy}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      ) : !adding ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          No additional destinations. Click <strong>+ Add destination</strong> above to send to multiple channels.
        </div>
      ) : null}

      {adding && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          marginTop: 8, padding: 12,
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        }}>
          <FieldLabel>Name</FieldLabel>
          <input
            type="text"
            placeholder="e.g. stakeholders"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            style={inputStyle}
          />
          <FieldLabel>Webhook URL</FieldLabel>
          <input
            type="password"
            placeholder="https://hooks.slack.com/services/T…/B…/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            style={inputStyle}
          />
          <FieldLabel>Channel name (cosmetic, optional)</FieldLabel>
          <input
            type="text"
            placeholder="#stakeholders"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={busy}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Button variant="primary" size="sm" onClick={submit} disabled={busy}>
              {busy ? 'Adding…' : 'Add destination'}
            </Button>
            <Button
              variant="secondary" size="sm"
              onClick={() => { setAdding(false); setName(''); setUrl(''); setLabel('') }}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}


/* M6.5 — Notion connection form. Single token input + a prominent
 * reminder that the user must explicitly share each target database
 * with the integration in Notion (the API can't see databases that
 * weren't shared, no matter how broad the token's scope). */
function NotionConnectionForm() {
  const { toast } = useToast()
  const [conn, setConn] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState('')
  const { scope, picker: scopePicker, badge: scopeBadge } = useConnectionScope(conn?.scope)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getNotionConnectionApi()
      .then((c) => { if (alive) setConn(c) })
      .catch((e) => { if (alive) toast.error(e.message || 'Could not load Notion connection') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const startEdit = () => { setToken(''); setEditing(true) }
  const cancelEdit = () => { setEditing(false); setToken('') }

  const save = async () => {
    if (!token.trim()) {
      toast.error('Token required')
      return
    }
    setBusy(true)
    try {
      const c = await putNotionConnectionApi({ token: token.trim(), scope })
      setConn(c)
      setEditing(false)
      setToken('')
      toast.success('Notion connection saved')
    } catch (e) {
      toast.error(e.message || 'Could not save Notion connection')
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    try {
      const dbs = await listNotionDatabasesApi()
      if (dbs.length === 0) {
        toast.error('Connection works but no databases visible — share one with the integration in Notion.')
      } else {
        toast.success(`Connection OK — ${dbs.length} database${dbs.length === 1 ? '' : 's'} visible`)
      }
    } catch (e) {
      toast.error(e.message || 'Connection test failed')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!window.confirm('Disconnect Notion? You can reconnect any time.')) return
    setBusy(true)
    try {
      await deleteNotionConnectionApi({ scope: conn?.scope || 'user' })
      setConn(null)
      toast.success('Notion disconnected')
    } catch (e) {
      toast.error(e.message || 'Could not disconnect')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
        <Spinner size={14} /> Loading Notion connection…
      </div>
    )
  }

  if (conn && !editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>{scopeBadge}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '4px 12px', fontSize: 13 }}>
          <div style={{ color: 'var(--text-soft)' }}>Token</div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{conn.token_preview}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Button variant="secondary" size="sm" onClick={test} disabled={busy}>
            {busy ? 'Testing…' : 'Test'}
          </Button>
          <Button variant="secondary" size="sm" onClick={startEdit} disabled={busy}>Edit</Button>
          <Button variant="ghost" size="sm" onClick={disconnect} disabled={busy}>Disconnect</Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
        Create an internal integration at{' '}
        <a
          href="https://www.notion.so/my-integrations"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent-strong)' }}
        >
          notion.so/my-integrations
        </a>
        {' '}→ copy the secret. <strong>Then in Notion, open each database you want to push to → "..." → "Add connections" → pick this integration.</strong> Notion's API can't see databases the integration wasn't explicitly added to.
      </p>
      <FieldLabel>Integration token</FieldLabel>
      <input
        type="password"
        placeholder="secret_…"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        disabled={busy}
        style={inputStyle}
      />
      {scopePicker}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Button variant="primary" size="sm" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : conn ? 'Save changes' : 'Connect'}
        </Button>
        {(conn || editing) && (
          <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={busy}>Cancel</Button>
        )}
      </div>
    </div>
  )
}

/* M7.1 — Prompt template (system-prompt suffix).
 *
 * Single textarea, character count, Save button. Loaded from + saved
 * back to the same UserSettings row that holds the BYOK key + model
 * preference. Empty save (or the explicit Clear button) sets the
 * column to NULL and the extractor reverts to the unmodified default
 * prompt.
 *
 * The placeholder shows three concrete examples — copying any of them
 * into the field is a fine starting point. We deliberately don't ship
 * a "template gallery" UX in v1; one suffix per user covers the
 * 90% case (analysts have one preferred style across all extractions).
 */
/* M7.1.b — list-based template manager. Replaces the single-textarea
 * `PromptTemplateForm`. Active template is highlighted; only one per
 * (user, org) can be active at a time (backend enforces). M7.1.c lets
 * users mark a template as org-shared via a checkbox at create time
 * (visible only when an active Clerk org is set). */
function PromptTemplatesSection({ orgId }) {
  const { toast } = useToast()
  const [rows, setRows] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [creating, setCreating] = useState(false)

  const refresh = async () => {
    try { setRows(await listPromptTemplatesApi()) }
    catch (e) { toast.error(e.message || 'Could not load templates') }
  }
  useEffect(() => { refresh() }, [])

  const activate = async (row) => {
    try {
      await patchPromptTemplateApi(row.id, { is_active: true })
      await refresh()
      toast.success(`Activated "${row.name}"`)
    } catch (e) { toast.error(e.message || 'Could not activate') }
  }
  const deactivate = async (row) => {
    try {
      await patchPromptTemplateApi(row.id, { is_active: false })
      await refresh()
    } catch (e) { toast.error(e.message || 'Could not deactivate') }
  }
  const remove = async (row) => {
    if (!window.confirm(`Delete template "${row.name}"?`)) return
    try {
      await deletePromptTemplateApi(row.id)
      await refresh()
      toast.success('Template deleted')
    } catch (e) { toast.error(e.message || 'Could not delete') }
  }

  if (rows === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
        <Spinner size={14} /> Loading templates…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
        Multiple named templates; one is active at a time. The active template is appended
        to the system prompt on every extract / rerun / regen. Org-shared templates
        (marked with {' '}<Badge tone="accent" size="sm">org</Badge>) apply to every member of your
        active workspace; personal templates are yours only.
      </p>

      {rows.length === 0 ? (
        <div style={{
          padding: '14px 16px', fontSize: 12.5, color: 'var(--text-soft)',
          fontStyle: 'italic', textAlign: 'center',
          background: 'var(--bg-subtle)', border: '1px dashed var(--border)',
          borderRadius: 'var(--radius)',
        }}>
          No templates yet — create one below.
        </div>
      ) : (
        <div style={{
          display: 'flex', flexDirection: 'column',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        }}>
          {rows.map((r, i) => {
            const isEditing = editingId === r.id
            return (
              <div key={r.id} style={{
                borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--border)',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  background: r.is_active ? 'var(--accent-soft)' : 'transparent',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--text-strong)' }}>
                      {r.name}
                      {r.org_id && <Badge tone="accent" size="sm">org</Badge>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 2 }}>
                      {r.content.length.toLocaleString()} chars · updated {new Date(r.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Badge tone={r.is_active ? 'success' : 'neutral'} size="sm">
                    {r.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  {r.is_active ? (
                    <Button variant="ghost" size="sm" onClick={() => deactivate(r)}>Deactivate</Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => activate(r)}>Activate</Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(isEditing ? null : r.id)}>
                    {isEditing ? 'Close' : 'Edit'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(r)}>Delete</Button>
                </div>
                {isEditing && (
                  <PromptTemplateEditPanel
                    template={r}
                    onSaved={async () => { setEditingId(null); await refresh() }}
                    onCancel={() => setEditingId(null)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {creating ? (
        <PromptTemplateEditPanel
          template={null}
          orgId={orgId}
          onSaved={async () => { setCreating(false); await refresh() }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <div>
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
            + New template
          </Button>
        </div>
      )}
    </div>
  )
}

/* Inline editor — used both for editing an existing template (template != null)
 * and for creating a new one (template === null). The latter exposes the
 * org-share checkbox; editing an existing template can't change scope. */
function PromptTemplateEditPanel({ template, orgId, onSaved, onCancel }) {
  const { toast } = useToast()
  const [name, setName] = useState(template?.name || '')
  const [content, setContent] = useState(template?.content || '')
  const [isActive, setIsActive] = useState(template?.is_active || false)
  const [shareWithOrg, setShareWithOrg] = useState(false)
  const [busy, setBusy] = useState(false)

  const isNew = template === null
  const overLimit = content.length > 4000

  const save = async () => {
    if (!name.trim()) { toast.error('Name required'); return }
    if (overLimit) { toast.error('Content too long (max 4000 chars)'); return }
    setBusy(true)
    try {
      if (isNew) {
        await createPromptTemplateApi({
          name: name.trim(),
          content,
          is_active: isActive,
          // M7.1.c — pass org_id only when checkbox set + orgId present.
          // Backend rejects mismatches as a 400.
          org_id: shareWithOrg && orgId ? orgId : null,
        })
        toast.success('Template created')
      } else {
        await patchPromptTemplateApi(template.id, {
          name: name.trim(),
          content,
        })
        toast.success('Template updated')
      }
      onSaved?.()
    } catch (e) {
      toast.error(e.message || 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      padding: isNew ? 12 : '0 14px 14px',
      display: 'flex', flexDirection: 'column', gap: 10,
      background: 'var(--bg-subtle)',
      border: isNew ? '1px solid var(--border)' : 'none',
      borderRadius: isNew ? 'var(--radius)' : 0,
    }}>
      <FieldLabel>Name</FieldLabel>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={busy}
        maxLength={100}
        placeholder="e.g. job-stories, pci-strict, default"
        style={inputStyle}
      />
      <FieldLabel>
        Template content (appended to the system prompt) · {content.length.toLocaleString()} / 4,000
      </FieldLabel>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={busy}
        rows={6}
        placeholder={isNew
          ? `Examples:

Use 'job story' format instead of 'user story':
  When [situation], I want to [motivation], so I can [outcome].

Tag any NFR mentioning compliance (PCI-DSS, GDPR, HIPAA) with severity: high.`
          : ''}
        style={{
          ...inputStyle,
          fontFamily: 'var(--font-mono)',
          fontSize: 12.5, lineHeight: 1.55,
          resize: 'vertical',
          borderColor: overLimit ? 'var(--danger-strong, #b91c1c)' : 'var(--border-strong)',
        }}
      />
      {isNew && (
        <>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12.5, cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={busy}
            />
            Activate immediately (deactivates the previous active template)
          </label>
          {orgId && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12.5, cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={shareWithOrg}
                onChange={(e) => setShareWithOrg(e.target.checked)}
                disabled={busy}
              />
              Share with everyone in this workspace
            </label>
          )}
        </>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={save} disabled={busy || overLimit || !name.trim()}>
          {busy ? 'Saving…' : isNew ? 'Create template' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}

/* M6.7 — API tokens management.
 *
 * UX:
 *   - Empty state: "Create your first token" CTA + curl example.
 *   - Created: in-place reveal panel with copy button + "I've saved it"
 *     dismiss. Plaintext is held in component state only — never
 *     re-fetched (and the backend can't return it again).
 *   - List: each token row shows name, prefix•••last4, created/last-used,
 *     status (Active / Revoked), and a Revoke button.
 *   - Below the list: copy-able curl snippet so users see the auth shape
 *     without leaving Settings.
 */
function ApiTokensSection() {
  const { toast } = useToast()
  const [tokens, setTokens] = useState(null)        // null=loading, []=empty, [...]=loaded
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [scope, setScope] = useState('rw')          // M6.7.b — 'rw' or 'ro'
  const [revealed, setRevealed] = useState(null)    // freshly-minted token (plaintext) or null

  const refresh = async () => {
    try {
      const rows = await listApiTokensApi()
      setTokens(rows)
    } catch (e) {
      toast.error(e.message || 'Could not load API tokens')
    }
  }

  useEffect(() => { refresh() }, [])

  const create = async (e) => {
    e?.preventDefault()
    if (!name.trim() || creating) return
    setCreating(true)
    try {
      const r = await createApiTokenApi({ name: name.trim(), scope })
      setRevealed(r)
      setName('')
      setScope('rw')
      await refresh()
    } catch (e) {
      toast.error(e.message || 'Could not create token')
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (id, label) => {
    if (!window.confirm(`Revoke "${label}"? Anything using this token stops working immediately.`)) return
    try {
      await revokeApiTokenApi(id)
      toast.success('Token revoked')
      await refresh()
    } catch (e) {
      toast.error(e.message || 'Could not revoke')
    }
  }

  const copyToken = async () => {
    const ok = await copyToClipboard(revealed?.token || '')
    if (ok) toast.success('Token copied to clipboard', { duration: 2500 })
    else toast.error("Couldn't copy — clipboard access blocked")
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
        Long-lived bearer tokens for programmatic access (curl, Zapier, custom scripts).
        Same scope as your account; tokens never expire but can be revoked any time.
      </p>

      {/* Reveal panel — only visible after a successful create. */}
      {revealed && (
        <Card padding={14} style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)', marginBottom: 6 }}>
            Save this token now — you won't see it again
          </div>
          <div style={{
            display: 'flex', gap: 6, marginBottom: 8,
          }}>
            <input
              type="text"
              value={revealed.token}
              readOnly
              onFocus={(e) => e.target.select()}
              style={{
                ...inputStyle,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                background: 'var(--bg)',
              }}
            />
            <Button variant="primary" size="sm" onClick={copyToken}>Copy</Button>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setRevealed(null)}>
            I've saved it — dismiss
          </Button>
        </Card>
      )}

      {/* Create form — hidden while a freshly-minted token is on screen
       *  to prevent the user from creating another one before saving the
       *  first. M6.7.b: scope picker defaults to 'rw' so the existing
       *  curl-and-extract flow doesn't change. */}
      {!revealed && (
        <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder="Token name (e.g. production-pipeline)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={creating}
              maxLength={100}
              style={{ ...inputStyle, flex: 1 }}
            />
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              disabled={creating}
              style={{ ...inputStyle, width: 130 }}
              title="Scope: read/write or read-only"
            >
              <option value="rw">Read/write</option>
              <option value="ro">Read-only</option>
            </select>
            <Button variant="primary" size="sm" type="submit" disabled={creating || !name.trim()}>
              {creating ? 'Creating…' : 'Create token'}
            </Button>
          </div>
          {scope === 'ro' && (
            <div style={{ fontSize: 11.5, color: 'var(--text-soft)', marginLeft: 2 }}>
              Read-only tokens can only call GET endpoints — useful for read-only
              integrations (dashboards, exports) that don't need to mutate data.
            </div>
          )}
        </form>
      )}

      {/* Token list. */}
      {tokens === null ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
          <Spinner size={14} /> Loading…
        </div>
      ) : tokens.length === 0 ? (
        <div style={{
          padding: '14px 16px', fontSize: 12.5, color: 'var(--text-soft)',
          fontStyle: 'italic', textAlign: 'center',
          background: 'var(--bg-subtle)', border: '1px dashed var(--border)',
          borderRadius: 'var(--radius)',
        }}>
          No tokens yet.
        </div>
      ) : (
        <div style={{
          display: 'flex', flexDirection: 'column',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        }}>
          {tokens.map((t, i) => (
            <TokenRow
              key={t.id}
              token={t}
              isLast={i === tokens.length - 1}
              onRevoke={() => revoke(t.id, t.name)}
            />
          ))}
        </div>
      )}

      {/* Curl example — small, monospace, copy-able. */}
      <div style={{
        padding: 12, background: 'var(--bg-subtle)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
          color: 'var(--text-soft)', marginBottom: 6,
        }}>
          Example
        </div>
        <pre style={{
          margin: 0, fontFamily: 'var(--font-mono)', fontSize: 11.5,
          color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          lineHeight: 1.6,
        }}>{`curl ${window.location.origin}/api/extract \\
  -H "Authorization: Bearer sk_live_…" \\
  -F "text=Your source document content" \\
  -F "filename=spec.txt"`}</pre>
        {/* M6.7.d — link to the interactive API docs. Opens in a new tab
            so the user keeps their place in Settings. */}
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
          Full reference + "Try it out" at{' '}
          <a
            href="/api-docs"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent-strong)' }}
          >
            /api-docs
          </a>
          . Click <strong>Authorize</strong> there and paste a token to test endpoints
          without leaving the browser.
        </div>
      </div>
    </div>
  )
}

function TokenRow({ token, isLast, onRevoke }) {
  const isRevoked = !!token.revoked_at
  const isReadOnly = (token.scope || 'rw') === 'ro'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
      opacity: isRevoked ? 0.55 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: 'var(--text-strong)',
          textDecoration: isRevoked ? 'line-through' : 'none',
        }}>
          {token.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-soft)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
          {token.prefix}••••{token.last4}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-soft)', marginTop: 2 }}>
          Created {new Date(token.created_at).toLocaleDateString()}
          {token.last_used_at && ` · last used ${new Date(token.last_used_at).toLocaleDateString()}`}
        </div>
      </div>
      {/* M6.7.b — scope badge always visible (rw or ro) so users can tell
          tokens apart at a glance without opening the create form. */}
      <Badge tone={isReadOnly ? 'info' : 'neutral'} size="sm">
        {isReadOnly ? 'Read-only' : 'Read/write'}
      </Badge>
      {isRevoked ? (
        <Badge tone="danger" size="sm">Revoked</Badge>
      ) : (
        <>
          <Badge tone="success" size="sm">Active</Badge>
          <Button variant="ghost" size="sm" onClick={onRevoke}>Revoke</Button>
        </>
      )}
    </div>
  )
}

/* M7.2 — manage saved few-shot examples. List + toggle + delete + edit.
 * Authoring is via the "Save as example" TopBar button (captures from a
 * live extraction); M7.2.c adds an inline JSON editor so power users can
 * hand-tune the captured payload without re-extracting. */
function FewShotExamplesSection() {
  const { toast } = useToast()
  const [rows, setRows] = useState(null)
  const [editingId, setEditingId] = useState(null)   // M7.2.c — open editor row id

  const refresh = async () => {
    try { setRows(await listFewShotExamplesApi()) }
    catch (e) { toast.error(e.message || 'Could not load examples') }
  }
  useEffect(() => { refresh() }, [])

  const enabledCount = (rows || []).filter((r) => r.enabled).length

  const toggle = async (row) => {
    try {
      await patchFewShotExampleApi(row.id, { enabled: !row.enabled })
      await refresh()
    } catch (e) {
      toast.error(e.message || 'Could not toggle')
    }
  }
  const remove = async (row) => {
    if (!window.confirm(`Delete "${row.name}"?`)) return
    try {
      await deleteFewShotExampleApi(row.id)
      await refresh()
      toast.success('Example deleted')
    } catch (e) {
      toast.error(e.message || 'Could not delete')
    }
  }
  const onEditSaved = async () => {
    setEditingId(null)
    await refresh()
  }

  if (rows === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
        <Spinner size={14} /> Loading examples…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
        Demonstrations Claude sees on every extraction — input → expected output pairs that
        teach your house style. <strong>Capture from a live extraction</strong> via the "Save as
        example" button in the studio after editing it to your liking. Up to 3 enabled at once;
        currently {enabledCount} of 3.
      </p>

      {rows.length === 0 ? (
        <div style={{
          padding: '14px 16px', fontSize: 12.5, color: 'var(--text-soft)',
          fontStyle: 'italic', textAlign: 'center',
          background: 'var(--bg-subtle)', border: '1px dashed var(--border)',
          borderRadius: 'var(--radius)',
        }}>
          No examples yet — extract a doc, edit it to your liking, click "Save as example" in the studio.
        </div>
      ) : (
        <div style={{
          display: 'flex', flexDirection: 'column',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        }}>
          {rows.map((r, i) => {
            const sCount = r.expected_payload?.stories?.length || 0
            const nCount = r.expected_payload?.nfrs?.length || 0
            const gCount = r.expected_payload?.gaps?.length || 0
            const isEditing = editingId === r.id
            return (
              <div
                key={r.id}
                style={{
                  borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--border)',
                  opacity: r.enabled ? 1 : 0.6,
                }}
              >
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--text-strong)' }}>
                      {r.name}
                      {r.org_id && <Badge tone="accent" size="sm">org</Badge>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 2 }}>
                      {r.input_text.length.toLocaleString()} chars input · {sCount}st / {nCount}nfr / {gCount}gap output
                    </div>
                  </div>
                  <Badge tone={r.enabled ? 'success' : 'neutral'} size="sm">
                    {r.enabled ? 'Active' : 'Inactive'}
                  </Badge>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => toggle(r)}
                    title={r.enabled ? 'Disable (still saved, just not sent to Claude)' : 'Enable'}
                  >
                    {r.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setEditingId(isEditing ? null : r.id)}
                  >
                    {isEditing ? 'Close' : 'Edit'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(r)}>Delete</Button>
                </div>
                {isEditing && (
                  <FewShotEditPanel example={r} onSaved={onEditSaved} onCancel={() => setEditingId(null)} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* M7.2.c — inline JSON editor for an existing few-shot example. The
 * expected_payload is JSON-validated client-side before save (so a
 * malformed paste fails fast with a clear message); backend revalidates
 * via Pydantic on the PATCH so a malicious bypass still gets rejected.
 *
 * Layout: name + input_text + expected_payload textarea, all editable.
 * Show JSON parse errors inline. Cancel discards local edits. */
function FewShotEditPanel({ example, onSaved, onCancel }) {
  const { toast } = useToast()
  const [name, setName] = useState(example.name)
  const [inputText, setInputText] = useState(example.input_text)
  const [payloadJson, setPayloadJson] = useState(
    JSON.stringify(example.expected_payload, null, 2),
  )
  const [busy, setBusy] = useState(false)
  const [parseError, setParseError] = useState(null)

  // Re-validate JSON on every keystroke so the user sees the error inline.
  const onPayloadChange = (v) => {
    setPayloadJson(v)
    try {
      JSON.parse(v)
      setParseError(null)
    } catch (e) {
      setParseError(e.message)
    }
  }

  const save = async () => {
    let parsed
    try {
      parsed = JSON.parse(payloadJson)
    } catch (e) {
      toast.error(`Invalid JSON: ${e.message}`)
      return
    }
    setBusy(true)
    try {
      await patchFewShotExampleApi(example.id, {
        name: name.trim(),
        input_text: inputText,
        expected_payload: parsed,
      })
      toast.success('Example updated')
      onSaved?.()
    } catch (e) {
      toast.error(e.message || 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      padding: '0 14px 14px',
      display: 'flex', flexDirection: 'column', gap: 10,
      background: 'var(--bg-subtle)',
    }}>
      <FieldLabel>Name</FieldLabel>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={busy}
        maxLength={100}
        style={inputStyle}
      />
      <FieldLabel>Input text (the source doc that should produce the expected payload)</FieldLabel>
      <textarea
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        disabled={busy}
        rows={4}
        style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
      />
      <FieldLabel>
        Expected payload (JSON — must match ExtractionPayload shape: {`{brief, actors, stories, nfrs, gaps}`})
      </FieldLabel>
      <textarea
        value={payloadJson}
        onChange={(e) => onPayloadChange(e.target.value)}
        disabled={busy}
        rows={14}
        spellCheck={false}
        style={{
          ...inputStyle,
          fontFamily: 'var(--font-mono)',
          fontSize: 11.5,
          lineHeight: 1.5,
          resize: 'vertical',
          borderColor: parseError ? 'var(--danger-strong, #b91c1c)' : 'var(--border-strong)',
        }}
      />
      {parseError && (
        <div style={{ fontSize: 11.5, color: 'var(--danger-ink)', fontFamily: 'var(--font-mono)' }}>
          JSON error: {parseError}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={save} disabled={busy || !!parseError}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}

function FieldLabel({ children }) {
  return (
    <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-soft)' }}>
      {children}
    </label>
  )
}

const inputStyle = {
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 10px',
  fontFamily: 'inherit',
  fontSize: 13,
  background: 'var(--bg)',
  color: 'inherit',
  outline: 'none',
}

/* M9.2 — top-level page promotion.
 *
 * Models / Tools / Integrations / Support are no longer nested tabs under
 * /settings; they're first-class top-level routes (`/models`, `/tools`,
 * `/integrations`, `/support`) reachable from the Sidebar nav. Each
 * exports a self-contained page component (heading + sections) wrapped
 * with `<PageShell>` for consistent layout.
 *
 * `Settings` (the default export) is now a small page with the things
 * that don't fit the other four categories: data export + appearance.
 *
 * Trade-off: each page does its own getMeSettingsApi fetch when needed
 * (only ModelsPage does, today), since we no longer have a shared layout
 * shell to hold the result. Acceptable — the request is one round-trip
 * to a dependency-free endpoint.
 */

export default function Settings() {
  const { toast } = useToast()
  const [exporting, setExporting] = useState(false)

  const doExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      await downloadMeExport()
      toast.success('Data export downloaded')
    } catch (e) {
      toast.error(e.message || 'Could not export your data')
    } finally {
      setExporting(false)
    }
  }

  /* M14.5.g — SettingsPage rebuilt as 2-column workspace replica.
   * Same shell pattern as M14.5.c-f. Main column has Appearance + Data
   * export + Privacy & account cards. Right rail has Quick help +
   * Security + Workspace preferences.
   */
  return (
    <div style={modelsShell}>
      <div style={modelsContainer}>
        <header style={modelsHeader}>
          <IconTile tone="accent" size={44} style={{ flexShrink: 0 }}>
            <SettingsIcon size={20} />
          </IconTile>
          <div>
            <h1 style={modelsTitle}>Settings</h1>
            <p style={modelsSubtitle}>
              Manage appearance, preferences, and your data.
            </p>
          </div>
        </header>

        <div className="settings-split">
          <div style={modelsMain}>
            <SettingsAppearanceCard />
            <SettingsDataExportCard exporting={exporting} doExport={doExport} />
            <SettingsPrivacyCard />
          </div>
          <aside style={modelsRail}>
            <QuickHelpRail />
            <SettingsSecurityRail />
            <WorkspacePrefsRail />
          </aside>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// M14.5.g — Settings page card shells + right-rail components
// ============================================================================

function SettingsAppearanceCard() {
  return (
    <div style={modelsCard}>
      <div style={cardHeader}>
        <IconTile tone="accent" size={36}><Brush size={16} /></IconTile>
        <div>
          <div style={cardTitle}>Appearance</div>
          <div style={cardSubtitle}>Choose how Lucid looks across the app.</div>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <ThemePicker />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 12.5, color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--success)', display: 'inline-flex' }}>
            <CheckCircle size={14} />
          </span>
          Your preference is saved across sessions.
        </div>
      </div>
    </div>
  )
}

function SettingsDataExportCard({ exporting, doExport }) {
  const items = ['Extractions JSON', 'Projects and templates', 'Usage log', 'Original uploaded files']
  return (
    <div style={modelsCard}>
      <div style={cardHeader}>
        <IconTile tone="accent" size={36}><Download size={16} /></IconTile>
        <div>
          <div style={cardTitle}>Data export</div>
          <div style={cardSubtitle}>Download a ZIP archive of your Lucid data.</div>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 14 }}>
          {items.map((it) => (
            <div key={it} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>
              <span style={{ color: 'var(--success)', display: 'inline-flex' }}>
                <CheckCircle size={14} />
              </span>
              {it}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={doExport}
          disabled={exporting}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            background: 'var(--accent-strong)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius)',
            fontSize: 13,
            fontWeight: 600,
            cursor: exporting ? 'not-allowed' : 'pointer',
            opacity: exporting ? 0.6 : 1,
            fontFamily: 'inherit',
          }}
        >
          <Download size={13} />
          {exporting ? 'Preparing…' : 'Download my data'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 12, color: 'var(--text-soft)' }}>
          <Lock size={12} />
          Data is streamed securely and never staged permanently.
        </div>
      </div>
    </div>
  )
}

function SettingsPrivacyCard() {
  const rows = [
    { icon: <Trash size={16} />, title: 'Delete account', desc: 'Permanently delete your Lucid account and all data.' },
    { icon: <Monitor size={16} />, title: 'Manage sessions', desc: 'Review and sign out of active sessions.' },
  ]
  return (
    <div style={modelsCard}>
      <div style={cardHeader}>
        <IconTile tone="accent" size={36}><Shield size={16} /></IconTile>
        <div>
          <div style={cardTitle}>Privacy &amp; account</div>
          <div style={cardSubtitle}>Manage sensitive actions and sessions.</div>
        </div>
      </div>
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => (
          <div
            key={r.title}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '12px 16px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-elevated)',
              cursor: 'default',
            }}
          >
            <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>{r.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)' }}>{r.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{r.desc}</div>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--text-soft)', flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

function QuickHelpRail() {
  const items = [
    'Preferences sync across devices when you\'re signed in.',
    'Theme can also be changed from the studio menu.',
    'Exports may take a few minutes for large workspaces.',
  ]
  return (
    <div style={railCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={railIconDisc}><Lightbulb size={14} /></span>
        <div style={railTitle}>Quick help</div>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((it, i) => (
          <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span aria-hidden style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--accent-strong)', marginTop: 7, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SettingsSecurityRail() {
  return (
    <div style={railCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={railIconDisc}><Lock size={14} /></span>
        <div style={railTitle}>Security</div>
      </div>
      <p style={{ ...railDesc, marginBottom: 12 }}>
        Your exports are generated securely and delivered only to you.
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          background: 'var(--accent-soft)',
          border: '1px solid var(--accent-soft)',
          borderRadius: 'var(--radius)',
          fontSize: 12,
          color: 'var(--accent-ink)',
          lineHeight: 1.45,
        }}
      >
        <Shield size={13} style={{ flexShrink: 0 }} />
        We use industry-standard encryption to protect your data.
      </div>
    </div>
  )
}

function WorkspacePrefsRail() {
  const navigate = useNavigate()
  return (
    <div style={railCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={railIconDisc}><Users size={14} /></span>
        <div style={railTitle}>Workspace preferences</div>
      </div>
      <p style={{ ...railDesc, marginBottom: 12 }}>
        Workspace-level settings like models, tools, and integrations can be managed by your team in their respective sections.
      </p>
      <button
        type="button"
        onClick={() => navigate('/integrations')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 12px',
          background: 'transparent',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius)',
          fontSize: 12.5,
          fontWeight: 600,
          color: 'var(--accent-strong)',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Go to workspace
      </button>
    </div>
  )
}


/* ---- /models ------------------------------------------------------- */

/* M14.5.c — ModelsPage rebuilt as a 2-column layout (main + right rail)
 * matching the design replica: API key card with Shield icon disc, status
 * row, three buttons (Test connection / Save key / Remove); Choose-a-
 * model card with radio rows; right rail with "When to use each model" +
 * "How billing works" + security note. Bypasses PageShell because that
 * shell forces a single centered column with a max-width of 720/960.
 */
export function ModelsPage() {
  const [serverSettings, setServerSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    getMeSettingsApi()
      .then((s) => { if (alive) setServerSettings(s) })
      .catch((e) => { if (alive) setError(e.message || 'Failed to load settings') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <div style={modelsShell}>
      <div style={modelsContainer}>
        {/* Page header */}
        <header style={modelsHeader}>
          <IconTile tone="accent" size={44} style={{ flexShrink: 0 }}>
            <Sparkles size={20} />
          </IconTile>
          <div>
            <h1 style={modelsTitle}>Models</h1>
            <p style={modelsSubtitle}>
              Bring your own Anthropic API key and choose which Claude model runs your extractions.
            </p>
          </div>
        </header>

        {/* 2-column body — see .settings-split in styles.css for the
            responsive grid (single column < 1080px, 1fr + 320px above). */}
        <div className="settings-split">
          {/* MAIN COLUMN */}
          <div style={modelsMain}>
            {/* API key card */}
            <ApiKeyCardShell loading={loading} error={error}>
              <ApiKeyForm
                keySet={!!serverSettings?.anthropic_key_set}
                keyPreview={serverSettings?.anthropic_key_preview || null}
                byokMode={serverSettings?.byok_mode || 'strict'}
                onSaved={(s) => setServerSettings(s)}
              />
            </ApiKeyCardShell>

            {/* Choose a model card */}
            <ChooseModelCardShell loading={loading}>
              <ModelPicker
                selected={serverSettings?.model_default || ''}
                onChange={(model) => setServerSettings((s) => ({ ...(s || {}), model_default: model || null }))}
              />
            </ChooseModelCardShell>
          </div>

          {/* RIGHT RAIL */}
          <aside style={modelsRail}>
            <ModelGuideRail />
            <BillingRailCard />
            <SecurityRailCard />
          </aside>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// M14.5.c — ModelsPage layout primitives + sub-components
// ============================================================================

function ApiKeyCardShell({ loading, error, children }) {
  return (
    <div style={modelsCard}>
      <div style={cardHeader}>
        <IconTile tone="accent" size={36}><Shield size={16} /></IconTile>
        <div>
          <div style={cardTitle}>API key</div>
          <div style={cardSubtitle}>
            Bring your own Anthropic API key. It's encrypted server-side and only decrypted at extract time.
          </div>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        {loading ? (
          <div style={loadingRow}><Spinner size={14} /> Loading settings…</div>
        ) : error ? (
          <div style={{ fontSize: 13, color: 'var(--danger-ink)' }}>{error}</div>
        ) : children}
      </div>
      <div style={cardFooterNote}>
        Keys are encrypted with Fernet (AES-128-CBC + HMAC) and decrypted only at extract time.
        Your key never leaves our servers in plaintext. Learn more at{' '}
        <a
          href="https://console.anthropic.com"
          target="_blank"
          rel="noopener noreferrer"
          style={cardFooterLink}
        >
          console.anthropic.com <ExternalLink size={11} />
        </a>
      </div>
    </div>
  )
}

function ChooseModelCardShell({ loading, children }) {
  return (
    <div style={modelsCard}>
      <div style={cardHeader}>
        <IconTile tone="accent" size={36}><Sparkles size={16} /></IconTile>
        <div>
          <div style={cardTitle}>Choose a model</div>
          <div style={cardSubtitle}>
            Select which Claude model should run your extractions. Pricing is shown per million tokens.
          </div>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        {loading ? (
          <div style={loadingRow}><Spinner size={14} /> Loading…</div>
        ) : children}
      </div>
    </div>
  )
}

function ModelGuideRail() {
  return (
    <div style={railCard}>
      <div style={railTitle}>When to use each model</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
        <div>
          <div style={{ ...railModelName, color: '#9333ea' }}>Claude Opus 4.7</div>
          <p style={railDesc}>
            Use for the most complex documents, nuanced instructions, or when quality is critical.
          </p>
        </div>
        <div>
          <div style={{ ...railModelName, color: 'var(--accent-strong)' }}>Claude Sonnet 4.6</div>
          <p style={railDesc}>
            Great default for most extractions with strong accuracy and speed.
          </p>
        </div>
        <div>
          <div style={{ ...railModelName, color: 'var(--text-strong)' }}>Server default</div>
          <p style={railDesc}>
            Follows your server configuration. Useful for team-wide consistency.
          </p>
        </div>
      </div>
    </div>
  )
}

function BillingRailCard() {
  return (
    <div style={railCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={railIconDisc}><DollarSign size={14} /></span>
        <div style={railTitle}>How billing works</div>
      </div>
      <p style={railDesc}>
        You're billed directly by Anthropic for API usage based on the model you choose.
      </p>
      <a
        href="https://www.anthropic.com/pricing"
        target="_blank"
        rel="noopener noreferrer"
        style={railLink}
      >
        View pricing details <ExternalLink size={11} />
      </a>
    </div>
  )
}

function SecurityRailCard() {
  return (
    <div style={{ ...railCard, background: 'var(--bg-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ ...railIconDisc, background: 'transparent', color: 'var(--text-muted)' }}>
          <Lock size={14} />
        </span>
        <p style={{ ...railDesc, marginTop: 0 }}>
          Your API key is stored securely and is never shared with third parties.
        </p>
      </div>
    </div>
  )
}

// ---- styles for ModelsPage layout ----

const modelsShell = {
  flex: 1,
  overflow: 'auto',
  background: 'var(--bg)',
  minHeight: '100%',
}

const modelsContainer = {
  width: '100%',
  maxWidth: 1280,
  margin: '0 auto',
  padding: 'clamp(28px, 4vw, 48px) clamp(20px, 3vw, 40px) 80px',
}

const modelsHeader = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  marginBottom: 32,
}

const modelsTitle = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(28px, 3vw, 36px)',
  fontWeight: 600,
  color: 'var(--text-strong)',
  letterSpacing: '-0.02em',
  lineHeight: 1.1,
}

const modelsSubtitle = {
  margin: '6px 0 0',
  fontSize: 14,
  color: 'var(--text-muted)',
  lineHeight: 1.55,
}

// Body uses a CSS class (.models-body) defined in styles.css so the
// grid can react to viewport resize via a media query — runtime JS
// matchMedia at module-load wouldn't track resize.

const modelsMain = {
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  minWidth: 0,
}

const modelsRail = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  minWidth: 0,
}

const modelsCard = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 24,
  boxShadow: 'var(--shadow-xs)',
}

const cardHeader = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 14,
}

const cardTitle = {
  fontFamily: 'var(--font-display)',
  fontSize: 19,
  fontWeight: 600,
  color: 'var(--text-strong)',
  letterSpacing: '-0.01em',
  lineHeight: 1.3,
}

const cardSubtitle = {
  marginTop: 4,
  fontSize: 13.5,
  color: 'var(--text-muted)',
  lineHeight: 1.55,
  maxWidth: 600,
}

const loadingRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: 'var(--text-muted)',
  fontSize: 13,
}

const cardFooterNote = {
  marginTop: 18,
  paddingTop: 14,
  borderTop: '1px solid var(--border)',
  fontSize: 11.5,
  color: 'var(--text-soft)',
  lineHeight: 1.55,
}

const cardFooterLink = {
  color: 'var(--accent-strong)',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  fontWeight: 500,
}

const railCard = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 18,
}

const railTitle = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-strong)',
  letterSpacing: '-0.005em',
}

const railModelName = {
  fontSize: 13.5,
  fontWeight: 600,
  marginBottom: 4,
}

const railDesc = {
  margin: 0,
  fontSize: 12.5,
  color: 'var(--text-muted)',
  lineHeight: 1.55,
}

const railLink = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  marginTop: 10,
  fontSize: 12.5,
  fontWeight: 600,
  color: 'var(--accent-strong)',
  textDecoration: 'none',
}

const railIconDisc = {
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

/* ---- /tools -------------------------------------------------------- */

/* M14.5.d — ToolsPage rebuilt as a 2-column workspace layout matching
 * the design replica: main column has 3 cards (Prompt templates,
 * Few-shot examples, API tokens) with the same icon-disc + title +
 * subtitle + body chrome as the Models page. Right rail has 3
 * informational cards (When to use tools, Best practices, Tokens stored
 * securely). Underlying section logic (PromptTemplatesSection,
 * FewShotExamplesSection, ApiTokensSection) is unchanged — only the
 * surrounding shells change.
 */
export function ToolsPage() {
  const { organization } = useOrganization()
  const orgId = organization?.id || null
  return (
    <div style={modelsShell}>
      <div style={modelsContainer}>
        <header style={modelsHeader}>
          <IconTile tone="accent" size={44} style={{ flexShrink: 0 }}>
            <Wrench size={20} />
          </IconTile>
          <div>
            <h1 style={modelsTitle}>Tools</h1>
            <p style={modelsSubtitle}>
              Power-user controls that shape how Claude extracts and how external tools connect to Lucid.
            </p>
          </div>
        </header>

        <div className="settings-split">
          <div style={modelsMain}>
            <ToolsCard
              icon={<FileText size={16} />}
              title="Prompt templates"
              subtitle="Save multiple named templates and activate one at a time. Append your own instructions to the system prompt — house style, naming conventions, severity rules, and more."
            >
              <PromptTemplatesSection orgId={orgId} />
            </ToolsCard>

            <ToolsCard
              icon={<Sparkles size={16} />}
              title="Few-shot examples"
              subtitle="Show Claude input → expected-output pairs so it learns your preferred format and naming conventions by example."
            >
              <FewShotExamplesSection />
            </ToolsCard>

            <ToolsCard
              icon={<Key size={16} />}
              title="API tokens"
              subtitle="Programmatic access via Bearer tokens for cURL, Zapier, Make, custom scripts, and more."
            >
              <ApiTokensSection />
            </ToolsCard>
          </div>

          <aside style={modelsRail}>
            <ToolsGuideRail />
            <BestPracticesRail />
            <TokensSecurityRail />
          </aside>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// M14.5.d — Tools page card shell + right-rail components
// ============================================================================

function ToolsCard({ icon, title, subtitle, children }) {
  return (
    <div style={modelsCard}>
      <div style={cardHeader}>
        <IconTile tone="accent" size={36}>{icon}</IconTile>
        <div>
          <div style={cardTitle}>{title}</div>
          <div style={cardSubtitle}>{subtitle}</div>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>{children}</div>
    </div>
  )
}

function ToolsGuideRail() {
  const items = [
    {
      title: 'Prompt templates',
      desc: 'Use to standardize instructions, rules, and house style across extractions.',
    },
    {
      title: 'Few-shot examples',
      desc: 'Use to teach Claude your preferred output format with real examples.',
    },
    {
      title: 'API tokens',
      desc: 'Use to connect external tools and automate extractions at scale.',
    },
  ]
  return (
    <div style={railCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={railIconDisc}><Lightbulb size={14} /></span>
        <div style={railTitle}>When to use tools</div>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items.map((it) => (
          <li key={it.title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span
              aria-hidden
              style={{
                width: 6, height: 6, borderRadius: 999,
                background: 'var(--accent-strong)',
                marginTop: 6, flexShrink: 0,
              }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 2 }}>
                {it.title}
              </div>
              <p style={{ ...railDesc, marginTop: 2 }}>{it.desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function BestPracticesRail() {
  const tips = [
    'Keep templates concise and focused on rules and style.',
    'Use examples to lock in format and edge cases.',
    'Rotate tokens regularly and revoke unused ones.',
  ]
  return (
    <div style={railCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={railIconDisc}><Shield size={14} /></span>
        <div style={railTitle}>Best practices</div>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tips.map((t) => (
          <li key={t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--success)', marginTop: 1, flexShrink: 0 }}>
              <CheckCircle size={14} />
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TokensSecurityRail() {
  return (
    <div style={{ ...railCard, background: 'var(--bg-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ ...railIconDisc, background: 'transparent', color: 'var(--text-muted)' }}>
          <Lock size={14} />
        </span>
        <p style={{ ...railDesc, marginTop: 0 }}>
          Tokens are stored securely using industry-standard encryption and can be revoked at any time.
        </p>
      </div>
    </div>
  )
}

/* ---- /integrations ------------------------------------------------- */

/* M14.5.e — IntegrationsPage rebuilt as 2-column workspace matching
 * the design replica. Hero header with serif "Integrations" title +
 * teal accent underline + subtitle. Main column has 5 brand-toned
 * connection cards (Jira / Linear / GitHub / Slack / Notion) each
 * wrapping the existing connection-form section unchanged. Right rail
 * has 3 informational cards (How integrations work, Supported exports,
 * Security note).
 */
export function IntegrationsPage() {
  return (
    <div style={modelsShell}>
      <div style={modelsContainer}>
        {/* Header — slightly different from Models/Tools: serif title with
            a teal underline accent below, no IconTile (more horizontal,
            lets the card icons carry the visual weight). */}
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ ...modelsTitle, marginBottom: 8 }}>Integrations</h1>
          <div
            aria-hidden
            style={{ width: 56, height: 3, background: 'var(--accent)', borderRadius: 2, marginBottom: 16 }}
          />
          <p style={{ ...modelsSubtitle, marginTop: 0 }}>
            Connect Lucid to your team's delivery tools and push extracted artifacts directly into your workflow.
          </p>
        </header>

        <div className="settings-split">
          <div style={modelsMain}>
            <IntegrationCard
              tone="info"
              name="Jira"
              subtitle="Push extracted user stories into Jira issues with acceptance criteria and metadata."
            >
              <JiraConnectionForm />
            </IntegrationCard>

            <IntegrationCard
              tone="purple"
              name="Linear"
              subtitle="Send extracted stories into a Linear team with description, labels, and acceptance criteria."
            >
              <LinearConnectionForm />
            </IntegrationCard>

            <IntegrationCard
              tone="neutral"
              name="GitHub Issues"
              subtitle="Push extracted user stories into a GitHub repo as issues with task-list criteria."
            >
              <GitHubConnectionForm />
            </IntegrationCard>

            <IntegrationCard
              tone="warn"
              name="Slack"
              subtitle="Send unresolved gaps to a Slack channel as a Block Kit message. One channel per webhook."
            >
              <SlackConnectionForm />
              <SlackAdditionalDestinations />
            </IntegrationCard>

            <IntegrationCard
              tone="accent"
              name="Notion"
              subtitle="Push extracted user stories into a Notion database with mapped properties."
            >
              <NotionConnectionForm />
            </IntegrationCard>
          </div>

          <aside style={modelsRail}>
            <HowIntegrationsWorkRail />
            <SupportedExportsRail />
            <IntegrationsSecurityRail />
          </aside>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// M14.5.e — Integrations card shell + right-rail components
// ============================================================================

function IntegrationCard({ tone, name, subtitle, children }) {
  return (
    <div style={modelsCard}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <IconTile tone={tone} size={36}><Plug size={16} /></IconTile>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={cardTitle}>{name}</div>
            {/* Decorative status pill — actual connection state is rendered
                inside the form body below. This is the "at a glance" badge
                the screenshot shows in the top-right; can be wired to live
                state in M14.5.e.b if desired. */}
            <span style={statusPillIdle}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--text-soft)' }} />
              Configure below
            </span>
          </div>
          <div style={{ ...cardSubtitle, marginTop: 4 }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>{children}</div>
    </div>
  )
}

function HowIntegrationsWorkRail() {
  const items = [
    'Connect once and reuse across extractions.',
    'Push stories directly to project tools.',
    'Credentials are encrypted and stored securely.',
  ]
  return (
    <div style={railCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={railIconDisc}><Plug size={14} /></span>
        <div style={railTitle}>How integrations work</div>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((it) => (
          <li key={it} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--success)', marginTop: 1, flexShrink: 0 }}>
              <CheckCircle size={14} />
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SupportedExportsRail() {
  const items = ['User stories', 'Acceptance criteria', 'Metadata', 'Tags']
  return (
    <div style={railCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ ...railIconDisc, background: 'var(--purple-soft)', color: 'var(--purple-ink)' }}>
          <FileText size={14} />
        </span>
        <div style={railTitle}>Supported exports</div>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it) => (
          <li key={it} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: 'var(--text)' }}>
            <span aria-hidden style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--accent-strong)', flexShrink: 0 }} />
            {it}
          </li>
        ))}
      </ul>
    </div>
  )
}

function IntegrationsSecurityRail() {
  return (
    <div style={railCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={railIconDisc}><Lock size={14} /></span>
        <div style={railTitle}>Security</div>
      </div>
      <p style={{ ...railDesc, marginTop: 0 }}>
        Tokens are encrypted at rest and only decrypted at push time.
      </p>
    </div>
  )
}

const statusPillIdle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 10px',
  borderRadius: 999,
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border)',
  fontSize: 11.5,
  fontWeight: 500,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

/* ---- /support ------------------------------------------------------ */

/* M14.5.h — SupportPage rebuilt as 2-column workspace replica.
 * Resources card with 4 link rows (API ref, Contact support, Send feedback,
 * System status); Quick troubleshooting with 3 chip buttons; What's new
 * with release entries. Right rail has Need help fast + Popular topics +
 * Security & privacy.
 */
export function SupportPage() {
  return (
    <div style={modelsShell}>
      <div style={modelsContainer}>
        <header style={{ ...modelsHeader, alignItems: 'flex-start' }}>
          <IconTile tone="accent" size={44} style={{ flexShrink: 0 }}>
            <HelpCircle size={20} />
          </IconTile>
          <div>
            <h1 style={modelsTitle}>Support</h1>
            <div
              aria-hidden
              style={{ width: 56, height: 3, background: 'var(--accent)', borderRadius: 2, marginTop: 8, marginBottom: 8 }}
            />
            <p style={{ ...modelsSubtitle, marginTop: 0 }}>
              Documentation, troubleshooting, and the fastest ways to get help.
            </p>
          </div>
        </header>

        <div className="settings-split">
          <div style={modelsMain}>
            <SupportResourcesCard />
            <QuickTroubleshootingCard />
            <WhatsNewCard />
          </div>
          <aside style={modelsRail}>
            <NeedHelpFastRail />
            <PopularTopicsRail />
            <SecurityPrivacyRail />
          </aside>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// M14.5.h — Support page card shells + right-rail components
// ============================================================================

function SupportResourcesCard() {
  const items = [
    {
      icon: <Code size={16} />,
      title: 'API reference',
      desc: 'Interactive API explorer and complete endpoint documentation.',
      cta: 'Open docs',
      href: '/api-docs',
      external: true,
    },
    {
      icon: <Headphones size={16} />,
      title: 'Contact support',
      desc: 'Get help from our team for account, billing, or technical issues.',
      cta: 'Create ticket',
      href: 'mailto:bragadeeshs@gmail.com?subject=Lucid%20support%20ticket',
      external: false,
    },
    {
      icon: <Mail size={16} />,
      title: 'Send feedback',
      desc: 'Share ideas, report bugs, or request new features.',
      cta: 'Email us',
      href: 'mailto:bragadeeshs@gmail.com?subject=Lucid%20feedback',
      external: false,
    },
    {
      icon: <Activity size={16} />,
      title: 'System status',
      desc: 'Check the current status of Lucid services and past incidents.',
      cta: 'View status',
      href: 'https://stats.uptimerobot.com',
      external: true,
    },
  ]
  return (
    <div style={modelsCard}>
      <div style={cardHeader}>
        <IconTile tone="accent" size={36}><BookOpen size={16} /></IconTile>
        <div>
          <div style={cardTitle}>Resources</div>
        </div>
      </div>
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it) => (
          <a
            key={it.title}
            href={it.href}
            target={it.external ? '_blank' : undefined}
            rel={it.external ? 'noopener noreferrer' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 16px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-elevated)',
              textDecoration: 'none',
              color: 'inherit',
              transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)' }}
          >
            <span style={{ color: 'var(--accent-strong)', display: 'inline-flex', flexShrink: 0 }}>{it.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)' }}>{it.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{it.desc}</div>
            </div>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--accent-strong)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {it.cta}
              {it.external && <ExternalLink size={11} />}
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

function QuickTroubleshootingCard() {
  const chips = [
    { label: 'Authentication issues', href: '/api-docs' },
    { label: 'Integration setup', href: '/integrations' },
    { label: 'Export problems', href: '/account' },
  ]
  return (
    <div style={modelsCard}>
      <div style={cardHeader}>
        <IconTile tone="accent" size={36}><Wrench size={16} /></IconTile>
        <div>
          <div style={cardTitle}>Quick troubleshooting</div>
        </div>
      </div>
      <div style={{
        marginTop: 18,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 10,
      }}>
        {chips.map((c) => (
          <a
            key={c.label}
            href={c.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-elevated)',
              textDecoration: 'none',
              color: 'var(--text-strong)',
              fontSize: 13,
              fontWeight: 500,
              transition: 'background var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)' }}
          >
            {c.label}
            <ChevronRight size={14} style={{ color: 'var(--text-soft)' }} />
          </a>
        ))}
      </div>
    </div>
  )
}

function WhatsNewCard() {
  // M14.5.h — placeholder release entries. Wire to /api/releases when we
  // ship a release-notes feed. For now, hand-curated milestone highlights
  // so the card isn't empty.
  const releases = [
    {
      date: 'May 3, 2026',
      version: 'M14.5',
      desc: 'Notion-clean redesign across Models, Tools, Integrations, Account, and Settings.',
    },
    {
      date: 'May 1, 2026',
      version: 'M14.4',
      desc: 'Per-extraction chat workspace with three starter prompts.',
    },
  ]
  return (
    <div style={modelsCard}>
      <div style={cardHeader}>
        <IconTile tone="accent" size={36}><Sparkles size={16} /></IconTile>
        <div>
          <div style={cardTitle}>What's new</div>
        </div>
      </div>
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {releases.map((r, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 16px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-elevated)',
            }}
          >
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--accent)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{r.date}</span>
                <span aria-hidden style={{ color: 'var(--text-soft)' }}>·</span>
                <span style={{ fontSize: 12.5, color: 'var(--accent-strong)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  Version {r.version}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>{r.desc}</div>
            </div>
            <ChevronRight size={14} style={{ color: 'var(--text-soft)', flexShrink: 0 }} />
          </div>
        ))}
        <a
          href="https://github.com/bragadeeshs/brdtoprd/commits/main"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            alignSelf: 'center',
            marginTop: 6,
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--accent-strong)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          View all release notes <ExternalLink size={11} />
        </a>
      </div>
    </div>
  )
}

function NeedHelpFastRail() {
  const items = [
    { icon: <Clock size={14} />, title: 'Typical response time', desc: 'Under 2 business hours' },
    { icon: <Mail size={14} />, title: 'Support email', desc: 'support@lucid.app' },
    { icon: <FileText size={14} />, title: 'Docs available 24/7', desc: 'Guides, API docs, and examples' },
  ]
  return (
    <div style={railCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={railIconDisc}><Zap size={14} /></span>
        <div style={railTitle}>Need help fast?</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items.map((it) => (
          <div key={it.title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--accent-strong)', display: 'inline-flex', marginTop: 2, flexShrink: 0 }}>
              {it.icon}
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 1 }}>{it.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{it.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PopularTopicsRail() {
  const topics = [
    { label: 'Using API tokens', href: '/api-docs' },
    { label: 'Jira integration guide', href: '/integrations' },
    { label: 'Working with templates', href: '/tools' },
    { label: 'Data export options', href: '/settings' },
  ]
  return (
    <div style={railCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={railIconDisc}><FileText size={14} /></span>
        <div style={railTitle}>Popular topics</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {topics.map((t) => (
          <a
            key={t.label}
            href={t.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 4px',
              fontSize: 13,
              color: 'var(--accent-strong)',
              textDecoration: 'none',
              borderBottom: '1px solid var(--border)',
              fontWeight: 500,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-ink)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--accent-strong)' }}
          >
            {t.label}
            <ChevronRight size={13} style={{ color: 'var(--text-soft)' }} />
          </a>
        ))}
        <a
          href="/api-docs"
          style={{
            alignSelf: 'center',
            marginTop: 10,
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--accent-strong)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
          target="_blank"
          rel="noopener noreferrer"
        >
          Browse all docs <ExternalLink size={11} />
        </a>
      </div>
    </div>
  )
}

function SecurityPrivacyRail() {
  return (
    <div style={railCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={railIconDisc}><Shield size={14} /></span>
        <div style={railTitle}>Security &amp; privacy</div>
      </div>
      <p style={{ ...railDesc, marginBottom: 12 }}>
        Your data and API tokens are encrypted in transit and at rest. We follow industry best practices to keep your information safe and secure.
      </p>
      <a
        href="https://www.anthropic.com/legal"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 12.5,
          fontWeight: 600,
          color: 'var(--accent-strong)',
          textDecoration: 'none',
        }}
      >
        Learn more <ExternalLink size={11} />
      </a>
    </div>
  )
}
