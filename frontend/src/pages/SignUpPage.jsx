import React from 'react'
import { SignUp } from '@clerk/clerk-react'
import { Logo } from '../components/icons.jsx'

/** M10.2 — same hero treatment as SignInPage so the entry pages feel
 *  paired and unmistakably Lucid. */
export default function SignUpPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--surface-0)',
        padding: 'var(--space-6)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: '60%',
          background: 'var(--gradient-soft)',
          pointerEvents: 'none',
        }}
      />
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
