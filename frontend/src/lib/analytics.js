/* M0.3.5 — PostHog product analytics.
 *
 * Mirrors the Sentry pattern: silent no-op when VITE_POSTHOG_KEY is unset
 * so dev + preview builds don't ship events to a live project. When set,
 * initializes posthog-js with privacy-respecting defaults — no
 * autocapture (we instrument explicit events only; reduces noise + token
 * volume), no session recording, no cross-domain.
 *
 * The posthog-js SDK is ~60 KB gzipped, which would bloat the initial
 * bundle. We dynamically `import()` it inside `initAnalytics()` so it
 * splits into its own chunk and only loads when the env key is present.
 * Events captured before the SDK finishes loading are queued and flushed
 * once it resolves — matters less for product analytics (we're not racing
 * a checkout flow) but worth a few lines to get right.
 *
 * Public surface:
 *   - initAnalytics()              — call once, before mount
 *   - identifyUser(userId, orgId)  — tag the active user (no PII)
 *   - track(event, props?)         — explicit event capture
 *   - resetAnalytics()             — on sign-out, clear identification
 *
 * Event taxonomy (start small — add as we measure):
 *   extraction_started     {input_chars}
 *   extraction_finished    {model, input_chars, live, duration_ms}
 *   extraction_failed      {reason, status}
 *   export_clicked         {format: 'md'}
 *   share_link_created     {rotated: bool}
 *   regen_clicked          {section}
 *   comment_posted         {target_kind}
 *
 * Anything not in this list shouldn't be tracked yet — add a line above
 * + use `track()` so the taxonomy stays grep-able.
 */

let _posthog = null
let _enabled = false
const _queue = []

export function initAnalytics() {
  const key = import.meta.env.VITE_POSTHOG_KEY
  if (!key) return  // dev / preview / no creds → no-op

  _enabled = true
  // Dynamic import keeps posthog-js out of the initial chunk.
  import('posthog-js').then(({ default: ph }) => {
    ph.init(key, {
      api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com',
      // Explicit events only — autocapture would record every click + page
      // load, which is noisy at our stage and burns token quota fast.
      autocapture: false,
      capture_pageview: true,        // SPA route changes do count
      capture_pageleave: false,
      disable_session_recording: true,
      persistence: 'localStorage',
    })
    _posthog = ph
    // Drain anything captured before the SDK finished loading.
    while (_queue.length) {
      const item = _queue.shift()
      if (item.type === 'identify') ph.identify(item.userId, item.props)
      else if (item.type === 'event') ph.capture(item.event, item.props)
      else if (item.type === 'reset') ph.reset()
    }
  }).catch(() => {
    // Fail silently — analytics outage shouldn't break the app.
    _enabled = false
  })
}

/** Tag the active user. Called from App.jsx via useUser. No PII — just
 *  the Clerk user_id + active org context. */
export function identifyUser(userId, orgId) {
  if (!_enabled) return
  if (!userId) {
    if (_posthog) _posthog.reset()
    else _queue.push({ type: 'reset' })
    return
  }
  const props = { org_id: orgId || 'personal' }
  if (_posthog) _posthog.identify(userId, props)
  else _queue.push({ type: 'identify', userId, props })
}

/** Capture an explicit event. Props should be primitives only — no
 *  PII, no tokens, no full extraction payloads (PostHog truncates at
 *  ~500KB but we shouldn't get close). */
export function track(event, props) {
  if (!_enabled) return
  if (_posthog) _posthog.capture(event, props || {})
  else _queue.push({ type: 'event', event, props })
}

/** Clear identification on sign-out so the next user gets a fresh
 *  anonymous session. */
export function resetAnalytics() {
  if (!_enabled) return
  if (_posthog) _posthog.reset()
  else _queue.push({ type: 'reset' })
}
