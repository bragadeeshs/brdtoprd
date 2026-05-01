import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { SignIn } from '@clerk/clerk-react'

/**
 * M13.2 — bulb-and-cord SignInPage.
 *
 * Page boots dim (lights off): a bulb hangs from a long cord, surrounded
 * by an explainer about what Lucid does. Clicking the cord (or
 * focusing it + pressing Space/Enter) "pulls" it — the cord briefly
 * stretches, the bulb glows warm, the page background lifts to a
 * lit-room cream, and the Clerk SignIn widget fades up below the bulb.
 *
 * Trade-off: this adds one click of friction before the form. Mitigated
 * by:
 *   - a "Use the form directly →" skip link at the bottom
 *   - prefers-reduced-motion users skip every animation (instant lit)
 *   - the SignIn widget is in the DOM throughout — only its CSS opacity
 *     gates it — so screen readers can still tab to it pre-click; the
 *     `is-lit` class just unhides it visually for sighted users
 *
 * Animations live in styles.css (`.bulbpage`, `.bulb-*`); JSX only
 * toggles two classes (is-lit / is-tugging) to keep render cheap.
 */
export default function SignInPage() {
  const [lit, setLit] = useState(false)
  const [tugging, setTugging] = useState(false)

  const pull = (e) => {
    if (lit) return
    setTugging(true)
    // ~250ms is the cord-snap-back duration in CSS; light up just after
    // the snap so the bulb-glow chases the cord motion (feels causal).
    window.setTimeout(() => setTugging(false), 250)
    window.setTimeout(() => setLit(true), 200)
    // Blur the cord button so its focus ring doesn't linger as a "cage"
    // around the lit bulb. Keyboard users land on the Clerk widget on
    // their next Tab.
    if (e?.currentTarget && typeof e.currentTarget.blur === 'function') {
      e.currentTarget.blur()
    }
  }

  return (
    <div className={'bulbpage' + (lit ? ' is-lit' : '')}>
      <div className="bulb-stage">
        <div className="bulb-stage-left">
          <button
            type="button"
            className={'bulb-cord-btn' + (tugging ? ' is-tugging' : '')}
            onClick={pull}
            aria-label={lit ? 'Light is on' : 'Pull the cord to sign in'}
            aria-pressed={lit}
          >
            <span className="bulb-cord-line" aria-hidden />
            <span className="bulb-svg-wrap">
              <span className="bulb-halo" aria-hidden />
              <Bulb />
            </span>
          </button>

          <div className="bulb-explainer" style={{ marginTop: 8 }}>
            <h1
              style={{
                fontFamily: 'Fraunces, Georgia, serif',
                fontSize: 'clamp(28px, 4vw, 40px)',
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                fontWeight: 600,
                margin: 0,
              }}
            >
              Lucid
            </h1>
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.6,
                marginTop: 14,
                marginBottom: 0,
              }}
            >
              Drop in any document — BRD, contract, research paper, transcript.
              Lucid reads it like an expert analyst: structure, hidden
              assumptions, root causes, the questions you should be asking,
              and the actions to take next. Every insight sourced.
            </p>
            <span className="bulb-pull-hint" aria-hidden>
              <span style={{ fontSize: 18, lineHeight: 1 }}>↑</span> Pull the cord — sign-in appears on the right
            </span>
          </div>
        </div>

        <div className="bulb-stage-right">
          <div className="bulb-clerk">
            <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
          </div>
        </div>
      </div>

      <div className="bulb-skip">
        Or <a href="#" onClick={(e) => { e.preventDefault(); pull() }}>turn on the light</a> · New here?{' '}
        <Link to="/sign-up" style={{ color: 'inherit' }}>Create an account</Link>
      </div>
    </div>
  )
}

/**
 * Bulb SVG — glass envelope, screw cap, two-loop filament. Roughly 90px
 * wide; styled by .bulb-glass / .bulb-cap / .bulb-filament classes so the
 * lit state lives entirely in CSS.
 */
function Bulb() {
  return (
    <svg width="150" height="216" viewBox="0 0 90 130" aria-hidden style={{ display: 'block' }}>
      {/* Glass envelope — round top tapering into the neck. */}
      <path
        className="bulb-glass"
        d="M 45 8
           C 70 8, 80 30, 76 56
           C 73 75, 60 86, 60 96
           L 30 96
           C 30 86, 17 75, 14 56
           C 10 30, 20 8, 45 8 Z"
      />
      {/* Filament: two horizontal loops connected by a rising line. */}
      <path
        className="bulb-filament"
        d="M 32 60
           C 32 50, 42 50, 42 60
           C 42 70, 52 70, 52 60
           C 52 50, 62 50, 58 60"
      />
      {/* Filament leads down to the cap. */}
      <line className="bulb-filament" x1="34" y1="68" x2="34" y2="92" />
      <line className="bulb-filament" x1="56" y1="68" x2="56" y2="92" />
      {/* Screw cap — three ridges + a rounded tip. */}
      <rect className="bulb-cap" x="30" y="96" width="30" height="6" rx="1" />
      <rect className="bulb-cap" x="32" y="104" width="26" height="5" rx="1" />
      <rect className="bulb-cap" x="34" y="111" width="22" height="5" rx="1" />
      <path className="bulb-cap" d="M 36 118 L 54 118 L 50 124 L 40 124 Z" />
    </svg>
  )
}
