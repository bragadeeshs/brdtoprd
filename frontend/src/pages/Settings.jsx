import React, { useEffect, useState } from 'react'
import { getMeSettingsApi, putMeSettingsApi, testApiKey } from '../api.js'
import { useApp } from '../lib/AppContext.jsx'
import { useToast } from '../components/Toast.jsx'
import { Badge, Button, Card, IconTile, Spinner } from '../components/primitives.jsx'
import { Eye, Monitor, Moon, Shield, Sparkles, Sun } from '../components/icons.jsx'

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
          icon={<Sun size={16} />}
          tone="warn"
          title="Appearance"
          description="Light, dark, or follow your system preference. Persists across sessions."
        >
          <ThemePicker />
        </Section>
      </div>
    </div>
  )
}
