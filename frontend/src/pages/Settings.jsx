import React, { useState } from 'react'
import { testApiKey } from '../api.js'
import { getSettings, setSettings } from '../lib/settings.js'
import { useToast } from '../components/Toast.jsx'
import { Badge, Button, Card, IconTile } from '../components/primitives.jsx'
import { Eye, Shield, Sparkles, Sun } from '../components/icons.jsx'

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

function ModelPicker() {
  const { toast } = useToast()
  const [selected, setSelected] = useState(() => getSettings().model)

  const onSelect = (id) => {
    if (id === selected) return
    setSelected(id)
    setSettings({ model: id })
    const opt = MODEL_OPTIONS.find((o) => o.id === id)
    toast.success(`Model set to ${opt.name}`)
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

function ApiKeyForm() {
  const { toast } = useToast()
  const [savedKey, setSavedKey] = useState(() => getSettings().anthropicKey)
  const [key, setKey] = useState(savedKey)
  const [shown, setShown] = useState(false)
  const [testing, setTesting] = useState(false)

  const dirty = key !== savedKey
  const hasSavedKey = !!savedKey
  const trimmed = key.trim()

  const onSave = () => {
    setSettings({ anthropicKey: trimmed })
    setSavedKey(trimmed)
    setKey(trimmed)
    toast.success(trimmed ? 'API key saved' : 'API key cleared')
  }

  const onRemove = () => {
    setSettings({ anthropicKey: '' })
    setSavedKey('')
    setKey('')
    toast.success('API key removed — falling back to server config')
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
            background: hasSavedKey ? 'var(--success)' : 'var(--text-soft)',
          }}
        />
        <span style={{ color: 'var(--text-muted)' }}>
          {hasSavedKey
            ? 'Active — using your key for extractions'
            : 'Inactive — using server config (env key or mock mode)'}
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
          placeholder="sk-ant-api03-…"
          spellCheck={false}
          autoComplete="off"
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
        <Button variant="secondary" size="sm" loading={testing} onClick={onTest} disabled={!trimmed}>
          {testing ? 'Testing…' : 'Test connection'}
        </Button>
        <Button variant="primary" size="sm" disabled={!dirty} onClick={onSave}>
          {dirty ? 'Save' : 'Saved'}
        </Button>
        {hasSavedKey && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
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
        Stored in your browser's localStorage and sent on each extraction via the{' '}
        <code
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            padding: '1px 5px',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 3,
          }}
        >
          X-Anthropic-Key
        </code>{' '}
        header. Get a key at{' '}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
          console.anthropic.com
        </a>
        .
      </p>
    </div>
  )
}

export default function Settings() {
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
          description="Bring your own Anthropic API key. The key is stored locally in your browser and sent on each extraction request."
        >
          <ApiKeyForm />
        </Section>
        <Section
          icon={<Sparkles size={16} />}
          tone="purple"
          title="Model"
          description="Choose which Claude model runs your extractions. Pricing is shown per million tokens of input / output."
        >
          <ModelPicker />
        </Section>
        <Section
          icon={<Sun size={16} />}
          tone="warn"
          title="Appearance"
          description="Light or dark theme. Persists across sessions once M1.4.6 ships."
          comingIn="M1.4.5"
        />
      </div>
    </div>
  )
}
