import React from 'react'
import { SignIn } from '@clerk/clerk-react'
import { Logo } from '../components/icons.jsx'

/** Hosts Clerk's <SignIn> widget. Path-based routing so /sign-in/factor-one
 *  etc resolve correctly. signUpUrl points to our local /sign-up route.
 *
 *  M10.2: hero gradient backdrop + brand mark above the form so the page
 *  reads as our app, not Clerk's default chrome. */
export default function SignInPage() {
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
      {/* Ambient gradient — hero moment. Sits behind the form; soft
          radial bloom from the top so the form itself stays clean. */}
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
            StoryForge
          </span>
        </div>
        <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
      </div>
    </div>
  )
}
