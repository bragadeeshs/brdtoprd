import React, { useEffect, useState } from 'react'
import {
  createApiTokenApi,
  deleteFewShotExampleApi,
  deleteGitHubConnectionApi,
  deleteJiraConnectionApi,
  deleteLinearConnectionApi,
  deleteNotionConnectionApi,
  deleteSlackConnectionApi,
  getGitHubConnectionApi,
  getJiraConnectionApi,
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
  patchFewShotExampleApi,
  putGitHubConnectionApi,
  putJiraConnectionApi,
  putLinearConnectionApi,
  putMeSettingsApi,
  putNotionConnectionApi,
  putSlackConnectionApi,
  revokeApiTokenApi,
  testApiKey,
} from '../api.js'
import { copyToClipboard } from '../lib/clipboard.js'
import { useApp } from '../lib/AppContext.jsx'
import { useToast } from '../components/Toast.jsx'
import { Badge, Button, Card, IconTile, Spinner } from '../components/primitives.jsx'
import { Eye, FileText, Key, Monitor, Moon, Plug, Shield, Sparkles, Sun } from '../components/icons.jsx'

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {MODEL_OPTIONS.map((opt) => {
        const isSelected = selected === opt.id
        return (
          <button
            key={opt.id || 'default'}
            type="button"
            onClick={() => onSelect(opt.id)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: 14,
              border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              background: isSelected ? 'var(--accent-soft)' : 'var(--bg-elevated)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'border-color .12s, background .12s, box-shadow .12s',
              boxShadow: isSelected
                ? '0 0 0 1px var(--accent), var(--shadow-xs)'
                : 'var(--shadow-xs)',
              fontFamily: 'inherit',
              color: 'inherit',
            }}
          >
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
                marginTop: 1,
                background: 'var(--bg-elevated)',
                transition: 'border-color .12s',
              }}
            >
              {isSelected && (
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 999,
                    background: 'var(--accent)',
                  }}
                />
              )}
            </span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)' }}>
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
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                  marginBottom: opt.pricing ? 4 : 0,
                }}
              >
                {opt.description}
              </div>
              {opt.pricing && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-soft)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {opt.pricing}
                </div>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

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
              alignItems: 'flex-start',
              gap: 12,
              padding: 14,
              border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              background: isSelected ? 'var(--accent-soft)' : 'var(--bg-elevated)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'border-color .12s, background .12s, box-shadow .12s',
              boxShadow: isSelected
                ? '0 0 0 1px var(--accent), var(--shadow-xs)'
                : 'var(--shadow-xs)',
              fontFamily: 'inherit',
              color: 'inherit',
            }}
          >
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
                marginTop: 1,
                background: 'var(--bg-elevated)',
              }}
            >
              {isSelected && (
                <span style={{ width: 9, height: 9, borderRadius: 999, background: 'var(--accent)' }} />
              )}
            </span>
            <IconTile tone={isSelected ? 'accent' : 'neutral'} size={32}>
              {opt.icon}
            </IconTile>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 3 }}>
                {opt.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {opt.description}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function ApiKeyForm({ keySet, keyPreview, onSaved }) {
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

  return (
    <div>
      {/* Status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          fontSize: 12,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: keySet ? 'var(--success)' : 'var(--text-soft)',
          }}
        />
        <span style={{ color: 'var(--text-muted)' }}>
          {keySet ? (
            <>
              Active — extractions use your key{' '}
              {keyPreview && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--text-strong)',
                    marginLeft: 4,
                  }}
                >
                  ({keyPreview})
                </span>
              )}
            </>
          ) : (
            'Inactive — using server config (env key or mock mode)'
          )}
        </span>
      </div>

      {/* Input */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          gap: 6,
          boxShadow: 'var(--shadow-xs)',
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
            height: 38,
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
            padding: 4,
            borderRadius: 4,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Eye size={14} />
        </button>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <Button variant="secondary" size="sm" loading={testing} onClick={onTest} disabled={!trimmed || saving}>
          {testing ? 'Testing…' : 'Test connection'}
        </Button>
        <Button variant="primary" size="sm" loading={saving} disabled={!dirty || saving} onClick={onSave}>
          {keySet ? 'Replace' : 'Save'}
        </Button>
        {keySet && (
          <Button variant="ghost" size="sm" onClick={onRemove} disabled={saving}>
            Remove
          </Button>
        )}
      </div>

      <p
        style={{
          fontSize: 11.5,
          color: 'var(--text-soft)',
          marginTop: 14,
          marginBottom: 0,
          lineHeight: 1.55,
        }}
      >
        Encrypted server-side with Fernet (AES-128-CBC + HMAC) and decrypted only at extract time.
        The key never leaves the backend in plaintext after Save. Get a key at{' '}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
          console.anthropic.com
        </a>
        .
      </p>
    </div>
  )
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

  // Form fields (only used while editing)
  const [baseUrl, setBaseUrl] = useState('')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    getJiraConnectionApi()
      .then((c) => { if (alive) setConn(c) })
      .catch((e) => { if (alive) toast.error(e.message || 'Could not load Jira connection') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

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
      await deleteJiraConnectionApi()
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
      const c = await putLinearConnectionApi({ api_key: token.trim() })
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
      await deleteLinearConnectionApi()
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
      const c = await putGitHubConnectionApi({ api_token: token.trim() })
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
      await deleteGitHubConnectionApi()
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
      await deleteSlackConnectionApi()
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
      const c = await putNotionConnectionApi({ token: token.trim() })
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
      await deleteNotionConnectionApi()
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
function PromptTemplateForm({ initial, onSaved }) {
  const { toast } = useToast()
  const [draft, setDraft] = useState(initial || '')
  const [saving, setSaving] = useState(false)

  // Re-sync if the parent's saved value changes (e.g. after another
  // section's save refreshes settings).
  useEffect(() => { setDraft(initial || '') }, [initial])

  const dirty = (draft || '') !== (initial || '')
  const charCount = draft.length
  const overLimit = charCount > 4000

  const save = async () => {
    if (overLimit) {
      toast.error('Template too long (max 4000 chars)')
      return
    }
    setSaving(true)
    try {
      // Empty string clears the column server-side; non-empty saves it.
      const updated = await putMeSettingsApi({ prompt_suffix: draft })
      onSaved?.(updated)
      toast.success(draft ? 'Template saved' : 'Template cleared')
    } catch (e) {
      toast.error(e.message || 'Could not save template')
    } finally {
      setSaving(false)
    }
  }

  const clear = () => {
    setDraft('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={saving}
        rows={6}
        placeholder={`Examples:

Use 'job story' format instead of 'user story':
  When [situation], I want to [motivation], so I can [outcome].

Tag any NFR mentioning compliance (PCI-DSS, GDPR, HIPAA) with severity: high.

All actors must be roles or systems, never specific people.`}
        style={{
          ...inputStyle,
          minHeight: 140,
          fontFamily: 'var(--font-mono)',
          fontSize: 12.5,
          lineHeight: 1.55,
          resize: 'vertical',
          borderColor: overLimit ? 'var(--danger-strong, #b91c1c)' : 'var(--border-strong)',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{
          fontSize: 11.5,
          color: overLimit ? 'var(--danger-ink)' : 'var(--text-soft)',
          fontFamily: 'var(--font-mono)',
        }}>
          {charCount.toLocaleString()} / 4,000
          {overLimit && ' · over limit'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {draft && (
            <Button variant="ghost" size="sm" onClick={clear} disabled={saving}>
              Clear
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={save} disabled={saving || !dirty || overLimit}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Save'}
          </Button>
        </div>
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
      const r = await createApiTokenApi(name.trim())
      setRevealed(r)
      setName('')
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
       *  first. */}
      {!revealed && (
        <form onSubmit={create} style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            placeholder="Token name (e.g. production-pipeline)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={creating}
            maxLength={100}
            style={{ ...inputStyle, flex: 1 }}
          />
          <Button variant="primary" size="sm" type="submit" disabled={creating || !name.trim()}>
            {creating ? 'Creating…' : 'Create token'}
          </Button>
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
      </div>
    </div>
  )
}

function TokenRow({ token, isLast, onRevoke }) {
  const isRevoked = !!token.revoked_at
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

/* M7.2 — manage saved few-shot examples. Read-only first version: list +
 * toggle enable/disable + delete. Authoring is via the "Save as example"
 * TopBar button (captures from a live extraction); hand-editing the
 * expected_payload JSON is intentionally not in this v1 — the JSON shape
 * is structured enough that a textarea is more dangerous than useful. */
function FewShotExamplesSection() {
  const { toast } = useToast()
  const [rows, setRows] = useState(null)

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
            return (
              <div
                key={r.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--border)',
                  opacity: r.enabled ? 1 : 0.6,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-strong)' }}>
                    {r.name}
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
                <Button variant="ghost" size="sm" onClick={() => remove(r)}>Delete</Button>
              </div>
            )
          })}
        </div>
      )}
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

export default function Settings() {
  const { toast } = useToast()
  const [serverSettings, setServerSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // One fetch for both ApiKeyForm + ModelPicker (they live on the same page).
  // Updates flow back via the `onSaved` / `onChange` props, so we don't need
  // to refetch after each PUT — the response shape matches GET.
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
        Settings
      </h1>
      <p
        style={{
          fontSize: 13.5,
          color: 'var(--text-muted)',
          margin: '0 0 22px',
          maxWidth: 640,
        }}
      >
        Configure how StoryForge talks to Claude, which model runs your extractions, and how
        the app looks.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 720 }}>
        <Section
          icon={<Shield size={16} />}
          tone="info"
          title="API"
          description="Bring your own Anthropic API key. Encrypted server-side and only decrypted at extract time."
        >
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
              <Spinner size={14} /> Loading settings…
            </div>
          ) : error ? (
            <div style={{ fontSize: 13, color: 'var(--danger-ink)' }}>{error}</div>
          ) : (
            <ApiKeyForm
              keySet={!!serverSettings?.anthropic_key_set}
              keyPreview={serverSettings?.anthropic_key_preview || null}
              onSaved={(s) => setServerSettings(s)}
            />
          )}
        </Section>
        <Section
          icon={<Sparkles size={16} />}
          tone="purple"
          title="Model"
          description="Choose which Claude model runs your extractions. Pricing is shown per million tokens of input / output."
        >
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
              <Spinner size={14} /> Loading…
            </div>
          ) : (
            <ModelPicker
              selected={serverSettings?.model_default || ''}
              onChange={(model) => setServerSettings((s) => ({ ...(s || {}), model_default: model || null }))}
            />
          )}
        </Section>
        <Section
          icon={<FileText size={16} />}
          tone="purple"
          title="Prompt template"
          description="Append your own instructions to the system prompt — house style for stories, naming conventions, severity rules. Applied to every extraction, rerun, and regen."
        >
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
              <Spinner size={14} /> Loading…
            </div>
          ) : (
            <PromptTemplateForm
              initial={serverSettings?.prompt_suffix || ''}
              onSaved={(s) => setServerSettings(s)}
            />
          )}
        </Section>
        <Section
          icon={<Sparkles size={16} />}
          tone="info"
          title="Few-shot examples"
          description="Saved input → expected-output pairs Claude sees on every extraction. Strong way to teach a custom story format or naming convention by example, not by description."
        >
          <FewShotExamplesSection />
        </Section>
        <Section
          icon={<Sun size={16} />}
          tone="warn"
          title="Appearance"
          description="Light, dark, or follow your system preference. Persists across sessions."
        >
          <ThemePicker />
        </Section>
        <Section
          icon={<Plug size={16} />}
          tone="success"
          title="Integrations · Jira"
          description="Push extracted user stories straight into a Jira project. One issue per story; criteria included as bullet points in the description."
        >
          <JiraConnectionForm />
        </Section>
        <Section
          icon={<Plug size={16} />}
          tone="purple"
          title="Integrations · Linear"
          description="Push extracted user stories into a Linear team. One issue per story; criteria as a markdown checklist in the description."
        >
          <LinearConnectionForm />
        </Section>
        <Section
          icon={<Plug size={16} />}
          tone="info"
          title="Integrations · GitHub Issues"
          description="Push extracted user stories into a GitHub repo as issues. Criteria render as a clickable task list in each issue body."
        >
          <GitHubConnectionForm />
        </Section>
        <Section
          icon={<Plug size={16} />}
          tone="warn"
          title="Integrations · Slack"
          description="Send unresolved gaps to a Slack channel as a Block Kit message. Webhook is bound to one channel — connect different webhooks for different channels."
        >
          <SlackConnectionForm />
        </Section>
        <Section
          icon={<Plug size={16} />}
          tone="accent"
          title="Integrations · Notion"
          description="Push extracted user stories into a Notion database. Title goes in the database's title column; the rest of the story (As-a / I want / so that, criteria, source quote) renders as page body blocks."
        >
          <NotionConnectionForm />
        </Section>
        <Section
          icon={<Key size={16} />}
          tone="info"
          title="API tokens"
          description="Programmatic access via Bearer tokens — for curl, Zapier, Make, custom scripts. Same scope as your account; tokens never expire but can be revoked any time."
        >
          <ApiTokensSection />
        </Section>
      </div>
    </div>
  )
}
