import React from 'react'
import { SignUp } from '@clerk/clerk-react'
import { Logo } from '../components/icons.jsx'

/**
 * M14.5.i — SignUpPage refresh matching the design replica.
 * Centered Logo + "Lucid" wordmark above the Clerk SignUp widget on
 * a clean near-white page. Decorative teal blob in the top-left and
 * bottom-right; subtle dot grids in the opposite corners. Lightweight
 * brand chrome that doesn't compete with the form.
 */
export default function SignUpPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg)',
        padding: 'var(--space-6)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative blobs — matched to the screenshot's corners.
          aria-hidden + pointer-events: none so they're invisible to AT
          and don't intercept clicks. */}
      <div aria-hidden style={blobTopLeft} />
      <div aria-hidden style={blobBottomRight} />
      <div aria-hidden style={dotsTopRight} />
      <div aria-hidden style={dotsBottomLeft} />

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Logo size={40} />
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-2xl)',
              fontWeight: 600,
              color: 'var(--text-strong)',
              letterSpacing: 'var(--tracking-tight)',
            }}
          >
            Lucid
          </span>
        </div>
        <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
      </div>
    </div>
  )
}

const blobBase = {
  position: 'absolute',
  width: 320,
  height: 320,
  borderRadius: '50%',
  background: 'radial-gradient(circle at 30% 30%, rgba(99, 102, 241, 0.20), rgba(139, 92, 246, 0.05) 60%, transparent)',
  filter: 'blur(40px)',
  pointerEvents: 'none',
  zIndex: 0,
}

const blobTopLeft = {
  ...blobBase,
  top: -120,
  left: -120,
}

const blobBottomRight = {
  ...blobBase,
  bottom: -120,
  right: -120,
  background: 'radial-gradient(circle at 70% 70%, rgba(139, 92, 246, 0.18), rgba(168, 85, 247, 0.05) 60%, transparent)',
}

// SVG dot grid, repeated as a CSS background-image so we don't ship
// a static asset. ~6 cols × 5 rows of 2px dots, 16px spacing.
const dotsBg = {
  backgroundImage: 'radial-gradient(circle, rgba(0, 0, 0, 0.18) 1px, transparent 1px)',
  backgroundSize: '14px 14px',
  pointerEvents: 'none',
  position: 'absolute',
  width: 96,
  height: 80,
  zIndex: 0,
}

const dotsTopRight = {
  ...dotsBg,
  top: 56,
  right: 80,
}

const dotsBottomLeft = {
  ...dotsBg,
  bottom: 56,
  left: 80,
}
