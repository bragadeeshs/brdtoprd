/* M0.3.4 — frontend Sentry init.
 *
 * Mirrors the backend pattern (services/obs.py): silent no-op when
 * VITE_SENTRY_DSN isn't set so dev + preview builds never break for lack
 * of creds. When the DSN is present, initializes @sentry/react with sane
 * defaults (no PII, no perf tracing unless opted in, env tag from
 * VITE_SENTRY_ENV or "dev").
 *
 * Called once from main.jsx BEFORE ReactDOM.createRoot so import-time
 * crashes are captured.
 */

import * as Sentry from '@sentry/react'

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return  // dev / preview / no creds → silent no-op

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENV || 'dev',
    // Trace sampling kept off by default — flip via VITE_SENTRY_TRACES_RATE
    // when we want perf traces. Tracing has overhead and we'd rather opt in
    // per-environment than pay it always (mirrors backend default).
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_RATE || 0),
    // No PII without an explicit decision (Clerk session tokens, emails, etc).
    sendDefaultPii: false,
    // Keep the bundle lean — skip Replay + Profiling by default. Add via
    // integrations if/when product asks for session replay.
  })
}

/* Tag the active Sentry scope with the Clerk user id so events are
 * attributable. Called from App.jsx once Clerk's `user` resolves. We
 * intentionally don't send email/name — keeps PII out unless explicitly
 * needed. */
export function setSentryUser(userId, orgId) {
  if (!import.meta.env.VITE_SENTRY_DSN) return
  Sentry.setUser(userId ? { id: userId } : null)
  Sentry.setTag('org_id', orgId || 'personal')
}
