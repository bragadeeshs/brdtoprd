import React from 'react'
import { Badge, Card, IconTile } from '../components/primitives.jsx'
import { Shield, Sparkles, Sun } from '../components/icons.jsx'

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
          comingIn="M1.4.2"
        />
        <Section
          icon={<Sparkles size={16} />}
          tone="purple"
          title="Model"
          description="Choose which Claude model runs your extractions. Opus is most capable; Sonnet is the cost-quality sweet spot; Haiku is fastest."
          comingIn="M1.4.4"
        />
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
