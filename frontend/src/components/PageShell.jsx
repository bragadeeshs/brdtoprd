import React from 'react'
import { IconTile } from './primitives.jsx'

/* M10.7 — extracted from Settings.jsx to a shared component so Account,
 * Project, and any future top-level page can land on the same layout
 * rhythm.
 *
 * History:
 *   M10.2 — first introduced inline in Settings.jsx (heading + accent
 *           line + ambient gradient backdrop).
 *   M10.6 — content column centered (was left-aligned with orphan-right
 *           whitespace); `wide` prop bumps max-width to 960; gradient
 *           extended to 480px and faded with mask-image so the edge
 *           doesn't read as a hard transition cliff.
 *   M10.7 — promoted to its own file. No behavioural change.
 *
 * Use:
 *   <PageShell title="Models" description="…" eyebrow="Settings">
 *     <Section ... />
 *   </PageShell>
 *
 * Set `wide` to `true` on pages with inherently-wide content (rows,
 * forms with picker dropdowns, multi-column tables). Default is the
 * comfortable 720px reading column for most pages.
 */
/* M12.4 — added optional `icon` (renders a 36px IconTile next to the
 * title — visual anchor for the page) and `actions` (right-aligned slot
 * in the title row for buttons, dropdowns, primary CTAs). Both props
 * are optional and back-compat with M10.7 callers.
 */
export default function PageShell({ title, description, eyebrow, icon, actions, children, wide = false }) {
  const maxWidth = wide ? 960 : 720
  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        position: 'relative',
        background: 'var(--surface-0)',
      }}
    >
      {/* Ambient brand wash. Faded to transparent via mask so the bottom
          edge doesn't read as a hard line. -webkit- prefix kept for
          Safari, which still requires it as of 2026. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 480,
          background: 'var(--gradient-soft)',
          maskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 100%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          padding: 'var(--space-7) var(--space-7) var(--space-8)',
          maxWidth,
          margin: '0 auto',
        }}
      >
        {/* M10.7 — title is optional. Pages with a custom header (IconTile +
            inline editor + actions in the same row, like Project) skip
            the standard title block and render their own header as the
            first child. They get the same wrapper + centering + gradient
            backdrop without coercing their layout into a heading string. */}
        {title && (
          <>
            {eyebrow && (
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  letterSpacing: 'var(--tracking-wide)',
                  textTransform: 'uppercase',
                  color: 'var(--accent-strong)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                {eyebrow}
              </div>
            )}
            {/* M12.4 — title row now supports an optional left icon
                (visual anchor for the page) and a right-aligned actions
                slot (primary CTA / dropdowns / refresh button). */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                flexWrap: 'wrap',
              }}
            >
              {icon && (
                <IconTile tone="accent" size={36}>
                  {icon}
                </IconTile>
              )}
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--text-3xl)',
                  fontWeight: 600,
                  color: 'var(--text-strong)',
                  margin: 0,
                  lineHeight: 'var(--leading-tight)',
                  letterSpacing: 'var(--tracking-tight)',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {title}
              </h1>
              {actions && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
                  {actions}
                </div>
              )}
            </div>
            {/* Thin gradient accent — quietly carries the brand. */}
            <div
              aria-hidden
              style={{
                width: 56,
                height: 3,
                borderRadius: 'var(--radius-pill)',
                background: 'var(--gradient-hero)',
                marginTop: 'var(--space-3)',
                marginBottom: description ? 'var(--space-3)' : 'var(--space-6)',
              }}
            />
            {description && (
              <p
                style={{
                  fontSize: 'var(--text-md)',
                  color: 'var(--text-muted)',
                  margin: '0 0 var(--space-6)',
                  maxWidth: 640,
                  lineHeight: 'var(--leading-base)',
                }}
              >
                {description}
              </p>
            )}
          </>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
