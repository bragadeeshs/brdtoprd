import React from 'react'

/* =========================================================================
   Button
   ========================================================================= */
const BUTTON_SIZES = {
  sm: { padding: '6px 10px', fontSize: 12, gap: 6, height: 28 },
  md: { padding: '8px 14px', fontSize: 13, gap: 8, height: 36 },
  lg: { padding: '10px 18px', fontSize: 14, gap: 8, height: 42 },
}

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  fullWidth,
  loading,
  style,
  disabled,
  className,
  ...rest
}) {
  const sz = BUTTON_SIZES[size] ?? BUTTON_SIZES.md
  const isPrimary = variant === 'primary'
  const isGhost = variant === 'ghost'
  // M10.3 — gradient variant for the single hero CTA per surface
  // (Extract requirements, sign-up CTA, etc.). Reserve sparingly.
  const isGradient = variant === 'gradient'

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sz.gap,
    padding: sz.padding,
    height: sz.height,
    fontSize: sz.fontSize,
    fontWeight: 500,
    borderRadius: 'var(--radius)',
    border: '1px solid transparent',
    transition:
      'background var(--dur-fast) var(--ease-out),' +
      ' border-color var(--dur-fast) var(--ease-out),' +
      ' color var(--dur-fast) var(--ease-out),' +
      ' box-shadow var(--dur-fast) var(--ease-out),' +
      ' transform var(--dur-fast) var(--ease-out)',
    width: fullWidth ? '100%' : undefined,
    whiteSpace: 'nowrap',
    opacity: disabled || loading ? 0.55 : 1,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    ...style,
  }

  let variantStyle = {}
  if (isGradient) {
    variantStyle = {
      background: 'var(--gradient-hero)',
      color: 'white',
      borderColor: 'transparent',
      boxShadow: '0 4px 14px -4px rgba(147, 51, 234, 0.45)',
    }
  } else if (isPrimary) {
    variantStyle = {
      background: 'var(--accent-strong)',
      color: 'white',
      borderColor: 'var(--accent-strong)',
      boxShadow: 'var(--shadow-xs)',
    }
  } else if (isGhost) {
    variantStyle = {
      background: 'transparent',
      color: 'var(--text)',
      borderColor: 'transparent',
    }
  } else {
    // secondary
    variantStyle = {
      background: 'var(--surface-1)',
      color: 'var(--text-strong)',
      borderColor: 'var(--border)',
      boxShadow: 'var(--shadow-xs)',
    }
  }

  // Compose className: btn-press always; btn-glow on the gradient hero
  // CTA so it gets the subtle hover halo.
  const classes = ['btn-press']
  if (isGradient) classes.push('btn-glow')
  if (className) classes.push(className)

  return (
    <button
      type="button"
      disabled={disabled || loading}
      {...rest}
      className={classes.join(' ')}
      onMouseEnter={(e) => {
        if (disabled || loading) return
        if (isGradient) {
          e.currentTarget.style.boxShadow = '0 8px 24px -6px rgba(147, 51, 234, 0.55)'
        } else if (isPrimary) {
          e.currentTarget.style.background = 'var(--accent)'
        } else if (isGhost) {
          e.currentTarget.style.background = 'var(--bg-hover)'
        } else {
          e.currentTarget.style.borderColor = 'var(--border-strong)'
        }
      }}
      onMouseLeave={(e) => {
        if (isGradient) {
          e.currentTarget.style.boxShadow = '0 4px 14px -4px rgba(147, 51, 234, 0.45)'
        } else if (isPrimary) {
          e.currentTarget.style.background = 'var(--accent-strong)'
        } else if (isGhost) {
          e.currentTarget.style.background = 'transparent'
        } else {
          e.currentTarget.style.borderColor = 'var(--border)'
        }
      }}
      style={{ ...base, ...variantStyle }}
    >
      {loading ? <Spinner size={14} color={(isPrimary || isGradient) ? 'white' : 'currentColor'} /> : icon}
      {children}
      {iconRight}
    </button>
  )
}

/* =========================================================================
   IconButton — square, icon-only
   ========================================================================= */
export function IconButton({ children, label, size = 32, active, ...rest }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...rest}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)'
        e.currentTarget.style.color = 'var(--text-strong)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active ? 'var(--bg-hover)' : 'transparent'
        e.currentTarget.style.color = active ? 'var(--text-strong)' : 'var(--text-muted)'
      }}
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? 'var(--bg-hover)' : 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        color: active ? 'var(--text-strong)' : 'var(--text-muted)',
        transition: 'background .15s, color .15s',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

/* =========================================================================
   Badge — solid pill with tone + optional dot/icon
   ========================================================================= */
const BADGE_TONES = {
  neutral: { bg: 'var(--bg-subtle)', fg: 'var(--text)', bd: 'var(--border)' },
  accent: { bg: 'var(--accent-soft)', fg: 'var(--accent-ink)', bd: 'transparent' },
  success: { bg: 'var(--success-soft)', fg: 'var(--success-ink)', bd: 'transparent' },
  warn: { bg: 'var(--warn-soft)', fg: 'var(--warn-ink)', bd: 'transparent' },
  danger: { bg: 'var(--danger-soft)', fg: 'var(--danger-ink)', bd: 'transparent' },
  info: { bg: 'var(--info-soft)', fg: 'var(--info-ink)', bd: 'transparent' },
  purple: { bg: 'var(--purple-soft)', fg: 'var(--purple-ink)', bd: 'transparent' },
  outline: { bg: 'transparent', fg: 'var(--text-muted)', bd: 'var(--border-strong)' },
}

export function Badge({ children, tone = 'neutral', icon, dot, size = 'md', style }) {
  const t = BADGE_TONES[tone] ?? BADGE_TONES.neutral
  const sz =
    size === 'sm'
      ? { padding: '2px 8px', fontSize: 11, gap: 5 }
      : { padding: '3px 10px', fontSize: 12, gap: 6 }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: sz.gap,
        padding: sz.padding,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
        borderRadius: 'var(--radius-pill)',
        fontSize: sz.fontSize,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
        ...style,
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: 'currentColor',
          }}
        />
      )}
      {icon}
      {children}
    </span>
  )
}

/* =========================================================================
   Card — surface with optional hover lift
   ========================================================================= */
export function Card({ children, hover, accent, className, style, padding = 16, as: Tag = 'div', ...rest }) {
  const baseCls = `card${hover ? ' hover' : ''}${accent ? ' accent' : ''}`
  const cls = className ? `${baseCls} ${className}` : baseCls
  return (
    <Tag className={cls} style={{ padding, ...style }} {...rest}>
      {children}
    </Tag>
  )
}

/* =========================================================================
   IconTile — pastel-tinted square holding an icon
   ========================================================================= */
const TILE_TONES = {
  accent: { bg: 'var(--accent-soft)', fg: 'var(--accent-strong)' },
  success: { bg: 'var(--success-soft)', fg: 'var(--success-ink)' },
  warn: { bg: 'var(--warn-soft)', fg: 'var(--warn-ink)' },
  danger: { bg: 'var(--danger-soft)', fg: 'var(--danger-ink)' },
  info: { bg: 'var(--info-soft)', fg: 'var(--info-ink)' },
  purple: { bg: 'var(--purple-soft)', fg: 'var(--purple-ink)' },
  pink: { bg: 'var(--pink-soft)', fg: 'var(--pink-ink)' },
  neutral: { bg: 'var(--bg-subtle)', fg: 'var(--text-muted)' },
}

export function IconTile({ children, tone = 'accent', size = 36, style }) {
  const t = TILE_TONES[tone] ?? TILE_TONES.accent
  return (
    <span
      className="icon-tile"
      style={{
        width: size,
        height: size,
        background: t.bg,
        color: t.fg,
        ...style,
      }}
    >
      {children}
    </span>
  )
}

/* =========================================================================
   StatCard — KPI surface with bold value + uppercase label + corner icon
   =========================================================================
 *
 * M12.2 — pattern lifted from the reference dashboard. Pastel-tinted
 * background, label uppercase top, big bold value below, optional icon
 * tucked into the top-right corner. Designed to drop into a 4-up grid
 * on Account / future Dashboard pages.
 *
 *   <StatCard label="Extractions this month" value="42" icon={<Zap />} />
 *
 * `tone` picks the background tint (defaults to accent). `value` can be
 * any node — usually a string or pre-formatted number; we render it big
 * and bold. `sublabel` is a small secondary line under the value.
 */
const STATCARD_TONES = {
  accent: { bg: 'var(--accent-soft)', ink: 'var(--accent-ink)', icon: 'var(--accent-strong)' },
  success: { bg: 'var(--success-soft)', ink: 'var(--success-ink)', icon: 'var(--success-ink)' },
  warn: { bg: 'var(--warn-soft)', ink: 'var(--warn-ink)', icon: 'var(--warn-ink)' },
  neutral: { bg: 'var(--bg-subtle)', ink: 'var(--text-strong)', icon: 'var(--text-muted)' },
}

export function StatCard({ label, value, sublabel, icon, tone = 'accent', style }) {
  const t = STATCARD_TONES[tone] ?? STATCARD_TONES.accent
  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        minWidth: 180,
        padding: 'var(--space-5)',
        borderRadius: 'var(--radius-md)',
        background: t.bg,
        border: '1px solid transparent',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        ...style,
      }}
    >
      {icon && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 'var(--space-4)',
            right: 'var(--space-4)',
            color: t.icon,
            opacity: 0.55,
            display: 'inline-flex',
          }}
        >
          {icon}
        </span>
      )}
      <div
        style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          letterSpacing: 'var(--tracking-wide)',
          textTransform: 'uppercase',
          color: t.ink,
          opacity: 0.75,
          // Padding so a long label doesn't run into the corner icon.
          paddingRight: icon ? 26 : 0,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-3xl)',
          fontWeight: 700,
          color: 'var(--text-strong)',
          lineHeight: 'var(--leading-tight)',
          letterSpacing: 'var(--tracking-tight)',
          // Allow a long formatted value to wrap rather than overflow the card.
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
      {sublabel && (
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            lineHeight: 'var(--leading-base)',
          }}
        >
          {sublabel}
        </div>
      )}
    </div>
  )
}

/* =========================================================================
   Spinner
   ========================================================================= */
export function Spinner({ size = 16, color = 'var(--accent-strong)', strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'spin 0.9s linear infinite' }}>
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke={color}
        strokeOpacity="0.18"
        strokeWidth={strokeWidth}
      />
      <path
        d="M21 12a9 9 0 0 1-9 9"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  )
}

/* =========================================================================
   Section divider w/ centered label
   ========================================================================= */
export function Divider({ label, style }) {
  if (!label) {
    return <div style={{ height: 1, background: 'var(--border)', ...style }} />
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-soft)', fontSize: 11, ...style }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

/* =========================================================================
   Section label (small uppercase header used in sidebars / artifact headings)
   ========================================================================= */
export function SectionLabel({ children, action, style }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        marginBottom: 6,
        ...style,
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: 'var(--text-soft)',
          fontWeight: 600,
        }}
      >
        {children}
      </span>
      {action}
    </div>
  )
}
