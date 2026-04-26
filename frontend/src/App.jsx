import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { SignedIn, SignedOut, useAuth, useOrganization, useUser } from '@clerk/clerk-react'
import { extractStream, getMePlanApi, listCommentsApi, listProjectsApi, patchExtractionApi, regenSectionApi, rerunExtractionApi, setTokenGetter } from './api.js'
import { getExtraction } from './lib/store.js'
import { migrateLocalStorageOnce } from './lib/migrate.js'
import { getSettings, setSettings } from './lib/settings.js'
import { AppProvider } from './lib/AppContext.jsx'
import { useToast } from './components/Toast.jsx'
import ShareModal from './components/ShareModal.jsx'
import PushToJiraModal from './components/PushToJiraModal.jsx'
import PushToLinearModal from './components/PushToLinearModal.jsx'
import PushToGitHubModal from './components/PushToGitHubModal.jsx'
import { setSentryUser } from './lib/sentry.js'
import { identifyUser, track } from './lib/analytics.js'
import Account from './pages/Account.jsx'
import Documents from './pages/Documents.jsx'
import Project from './pages/Project.jsx'
import Settings from './pages/Settings.jsx'
import ShareView from './pages/ShareView.jsx'
import SignInPage from './pages/SignInPage.jsx'
import SignUpPage from './pages/SignUpPage.jsx'
import PaywallModal from './components/PaywallModal.jsx'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import EmptyState from './components/EmptyState.jsx'
import SourcePane from './components/SourcePane.jsx'
import ArtifactsPane from './components/ArtifactsPane.jsx'
import GapsRail from './components/GapsRail.jsx'
import { Card, IconTile, Spinner } from './components/primitives.jsx'
import { Sparkles, Check } from './components/icons.jsx'

/* M5.3 — progress card for an in-flight streaming extraction. `usage` is
 * `{input, output, max}` from the backend's SSE `usage` events; null until
 * the first frame arrives (then we show "Connecting to Claude…" instead of
 * a fake spinner). Stage markers tick as cumulative output_tokens cross
 * eyeballed thresholds — not perfectly accurate (model writes sections in
 * a slightly different order on different inputs) but accurate enough that
 * users see real progress, not theatre. */
const STAGES = [
  { key: 'brief',   label: 'Reading source + drafting brief', threshold: 0 },
  { key: 'actors',  label: 'Extracting actors',              threshold: 200 },
  { key: 'stories', label: 'Composing user stories',         threshold: 500 },
  { key: 'nfrs',    label: 'Capturing non-functional reqs',  threshold: 4000 },
  { key: 'gaps',    label: 'Identifying gaps + questions',   threshold: 5500 },
]

function LoadingState({ filename, usage, onStop }) {
  const out = usage?.output ?? 0
  const inn = usage?.input ?? 0
  const max = usage?.max ?? 16000
  // Determinate progress when we have data; while null, fall back to the
  // indeterminate slide animation so the bar isn't stuck at 0%.
  const pct = usage ? Math.min(100, Math.round((out / max) * 100)) : null

  // For the stage list: every stage whose threshold is at or below the current
  // output is "done"; the next one above is "active"; everything above that is
  // pending. Once everything is done (out > last threshold), show the last one
  // as still active — we don't know exactly when the response finishes from the
  // client's POV until `complete` arrives.
  const lastDoneIdx = STAGES.reduce(
    (acc, s, i) => (out > s.threshold ? i : acc),
    -1,
  )
  const activeIdx = Math.min(lastDoneIdx + 1, STAGES.length - 1)

  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'var(--bg)',
      }}
    >
      <Card padding={24} style={{ width: 460, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <IconTile tone="accent" size={40}>
            <Sparkles size={18} />
          </IconTile>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--text-strong)',
                marginBottom: 2,
                wordBreak: 'break-word',
              }}
            >
              Reading {filename || 'your document'}…
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              {usage
                ? `Claude is writing — ${out.toLocaleString()} of ${max.toLocaleString()} output tokens`
                : 'Connecting to Claude…'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          {STAGES.map((s, i) => {
            const state = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending'
            return (
              <div
                key={s.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontSize: 13,
                  color: state === 'pending' ? 'var(--text-soft)' : 'var(--text)',
                }}
              >
                {state === 'done' ? (
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      background: 'var(--success)',
                      color: 'white',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Check size={12} />
                  </span>
                ) : state === 'active' ? (
                  <Spinner size={18} />
                ) : (
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      border: '1.5px solid var(--border-strong)',
                      flexShrink: 0,
                    }}
                  />
                )}
                <span>{s.label}</span>
              </div>
            )
          })}
        </div>

        {/* Progress bar: determinate (fill width) once we have token data,
         *  indeterminate slide before the first `usage` event arrives. */}
        <div
          style={{
            height: 6,
            borderRadius: 999,
            background: 'var(--bg-hover)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {pct != null ? (
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: 'var(--accent)',
                transition: 'width .25s ease-out',
              }}
            />
          ) : (
            <div
              style={{
                position: 'absolute',
                left: '-30%',
                width: '40%',
                height: '100%',
                background:
                  'linear-gradient(90deg, transparent, var(--accent), transparent)',
                animation: 'slide 1.6s ease-in-out infinite',
              }}
            />
          )}
        </div>

        {usage && (
          <div
            style={{
              marginTop: 10,
              fontSize: 11,
              color: 'var(--text-soft)',
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span>in: {inn.toLocaleString()}</span>
            <span>out: {out.toLocaleString()} / {max.toLocaleString()}</span>
          </div>
        )}

        {/* M5.4.2 — Stop button. Aborts the SSE fetch; backend cleans up
         *  the Anthropic stream as the FastAPI generator unwinds. */}
        {typeof onStop === 'function' && (
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onStop}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 11.5,
                fontWeight: 500,
                padding: '4px 12px',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--danger-strong, #b91c1c)'
                e.currentTarget.style.borderColor = 'var(--danger-strong, #b91c1c)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)'
                e.currentTarget.style.borderColor = 'var(--border-strong)'
              }}
            >
              Stop
            </button>
          </div>
        )}

        <style>{`@keyframes slide { 0%{left:-40%} 50%{left:50%} 100%{left:120%} }`}</style>
      </Card>
    </div>
  )
}

/** Inner app — only mounts once the user is signed in. */
function AuthedApp() {
  const { getToken } = useAuth()
  // Wire api.js so every fetch carries Authorization: Bearer <jwt>.
  // Re-runs whenever Clerk swaps the getToken closure (e.g. after sign-out/in).
  useEffect(() => {
    setTokenGetter(getToken)
    return () => setTokenGetter(null)
  }, [getToken])

  // M3.3 — track active workspace. Switching org via Clerk's
  // <OrganizationSwitcher> re-issues the JWT with the new org_id claim;
  // we refresh cached data + reset the open studio so the user doesn't see
  // rows from the previous scope. Clerk also navigates to "/" on switch
  // (afterSelectOrganizationUrl), which triggers Documents/Project pages
  // to unmount and refetch on next mount.
  const { organization, isLoaded: orgLoaded } = useOrganization()
  const orgId = organization?.id || null

  // M0.3.4 — tag Sentry events with the active user + org so issues are
  // attributable. No PII (just ids); the helper is a no-op if Sentry isn't
  // configured. Same call pattern wires PostHog (M0.3.5).
  const { user: clerkUser } = useUser()
  useEffect(() => {
    setSentryUser(clerkUser?.id || null, orgId)
    identifyUser(clerkUser?.id || null, orgId)
  }, [clerkUser?.id, orgId])

  const [extraction, setExtraction] = useState(null)
  const [extractionId, setExtractionId] = useState(null)
  const [loading, setLoading] = useState(false)
  // M5.3 — streaming progress for the in-flight extract. {input, output, max}
  // is updated as the SSE `usage` events arrive; cleared on done/error.
  const [streamUsage, setStreamUsage] = useState(null)
  const [rerunning, setRerunning] = useState(false)
  const [showGaps, setShowGaps] = useState(true)
  // M5.2 — when a user clicks a source_quote on an artifact, this gets set
  // and SourcePane scrolls + flashes the matching <mark>. We re-set even
  // when the same quote is picked twice (object wrapper with a nonce so the
  // SourcePane effect re-fires) — useful when the user clicks a quote again
  // after scrolling away.
  const [selectedQuote, setSelectedQuote] = useState(null)
  const pickQuote = (text) => {
    if (!text) return
    setSelectedQuote({ text, nonce: Date.now() })
  }
  const [theme, setThemeRaw] = useState(() => getSettings().theme || 'light')
  const [pendingName, setPendingName] = useState('')
  const [projects, setProjects] = useState([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  // M3.5: plan + usage-this-period for the sidebar bar; refreshed after each
  // successful extract/rerun so the count stays live without a page reload.
  const [plan, setPlan] = useState(null)
  const [paywall, setPaywall] = useState(null)  // {paywall: true, reason, message, ...} from a 4xx response

  const location = useLocation()
  const navigate = useNavigate()
  const { toast } = useToast()
  const isHome = location.pathname === '/'

  // Centralized theme setter: persists to settings + lets useEffect apply it.
  const setTheme = (next) => {
    setThemeRaw(next)
    setSettings({ theme: next })
  }

  // Apply theme to <html data-theme>. 'system' resolves via prefers-color-scheme,
  // and we listen for OS-level theme changes while 'system' is selected.
  useEffect(() => {
    const apply = (mode) => {
      if (mode === 'system') {
        const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
      } else {
        document.documentElement.setAttribute('data-theme', mode)
      }
    }
    apply(theme)

    if (theme !== 'system' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  // One-shot migration of any leftover localStorage records to the backend.
  // Runs on first mount; the helper marks itself done so reruns are no-ops.
  useEffect(() => {
    migrateLocalStorageOnce().then((res) => {
      if (res.migrated > 0) {
        toast.success(`Migrated ${res.migrated} document${res.migrated === 1 ? '' : 's'} to the new store`)
      }
      if (res.failed > 0) {
        toast.warn(`${res.failed} document${res.failed === 1 ? '' : 's'} failed to migrate — they remain in local storage`)
      }
    }).catch((e) => console.warn('migration failed', e))
  }, [])

  const refreshProjects = useCallback(async () => {
    setProjectsLoading(true)
    try {
      setProjects(await listProjectsApi())
    } catch (e) {
      console.warn('failed to load projects', e)
    } finally {
      setProjectsLoading(false)
    }
  }, [])

  const refreshPlan = useCallback(async () => {
    try {
      setPlan(await getMePlanApi())
    } catch (e) {
      console.warn('failed to load plan', e)
    }
  }, [])

  useEffect(() => { refreshProjects() }, [refreshProjects])
  useEffect(() => { refreshPlan() }, [refreshPlan])

  // Re-fetch + reset whenever the active workspace changes. orgId is null
  // for personal context. Skipped until Clerk's org info has loaded so we
  // don't fire a redundant fetch immediately after the bootstrap one.
  // Plan/usage is per-scope too — switching org changes the count window.
  useEffect(() => {
    if (!orgLoaded) return
    refreshProjects()
    refreshPlan()
    setExtraction(null)
    setExtractionId(null)
  }, [orgId, orgLoaded, refreshProjects, refreshPlan])

  const projectById = useMemo(() => {
    const m = {}
    for (const p of projects) m[p.id] = p
    return m
  }, [projects])

  // M5.4.2 — AbortController for the in-flight extract. Held in a ref so
  // re-renders don't reset it; the Stop button calls .abort() to cancel
  // the SSE stream. Backend cleanup happens automatically when fetch
  // disconnects (FastAPI's StreamingResponse generator unwinds, the
  // `with anthropic.messages.stream(...)` block exits, Anthropic call
  // is dropped).
  const extractAbortRef = useRef(null)
  const handleStopExtract = () => {
    extractAbortRef.current?.abort()
  }

  const handleExtract = async ({ file, text, filename }) => {
    setLoading(true)
    setStreamUsage(null)
    setPendingName(file ? file.name : filename)
    const inputChars = (text?.length) || (file?.size || 0)
    const startedAt = Date.now()
    track('extraction_started', { input_chars: inputChars })
    const controller = new AbortController()
    extractAbortRef.current = controller
    try {
      // M5.3 — streaming variant. Backend still persists + returns the
      // canonical full record on `complete`; we just get usage ticks along
      // the way which feed the LoadingState progress card.
      const record = await extractStream(
        { file, text, filename },
        { onUsage: (u) => setStreamUsage(u), signal: controller.signal },
      )
      setExtraction(record)
      setExtractionId(record?.id || null)
      refreshPlan()  // M3.5 — usage count just bumped; refresh sidebar bar
      if (location.pathname !== '/') navigate('/')
      track('extraction_finished', {
        model: record?.model_used,
        input_chars: inputChars,
        live: !!record?.live,
        duration_ms: Date.now() - startedAt,
      })
    } catch (e) {
      // M5.4.2 — abort lands here as DOMException(name='AbortError'). User
      // hit Stop on purpose, so don't toast it as a failure; just clean up.
      if (e?.name === 'AbortError') {
        toast.success('Extraction cancelled')
        track('extraction_failed', { reason: 'aborted', status: 0 })
      } else if (e.paywall) {
        setPaywall(e.paywall)
        track('extraction_failed', { reason: e.paywall?.reason || 'paywall', status: e.status || 0 })
      } else {
        toast.error(e.message || 'Extraction failed')
        track('extraction_failed', { reason: 'error', status: e.status || 0 })
      }
    } finally {
      setLoading(false)
      setStreamUsage(null)
      setPendingName('')
      extractAbortRef.current = null
    }
  }

  const reset = () => {
    setExtraction(null)
    setExtractionId(null)
    if (!isHome) navigate('/')
  }

  // M4.1 — patch artifact fields (brief / actors / stories / nfrs / gaps)
  // and reflect the canonical record back from the server. Optimistic update
  // up front so the UI feels instant; revert on error.
  const updateExtraction = async (patch) => {
    if (!extractionId) return
    const prev = extraction
    setExtraction((cur) => (cur ? { ...cur, ...patch } : cur))
    try {
      const updated = await patchExtractionApi(extractionId, patch)
      setExtraction(updated)
    } catch (e) {
      setExtraction(prev)
      toast.error(e.message || 'Could not save')
    }
  }

  // M4.4 — regenerate one section (stories / nfrs / gaps). The backend
  // sends the brief + actors + other sections to the model as stable
  // context, so any inline edits (M4.1) are respected. `regenBusy` is the
  // section name in flight (or null) so each section can show its own
  // spinner without blocking edits elsewhere.
  const [regenBusy, setRegenBusy] = useState(null)

  // M4.5 — comments on the open extraction. Fetched once when the
  // extraction is opened; mutations (create/edit/delete) update this
  // master list locally so all per-artifact popovers stay in sync without
  // refetching. Per-artifact popovers receive the filtered slice they care
  // about via props.
  const [comments, setComments] = useState([])
  useEffect(() => {
    if (!extractionId) {
      setComments([])
      return
    }
    let cancelled = false
    listCommentsApi(extractionId)
      .then((rows) => { if (!cancelled) setComments(rows || []) })
      .catch(() => { /* unauth → already toasted; transient → leave empty */ })
    return () => { cancelled = true }
  }, [extractionId])
  const onCommentCreate = (c) => setComments((prev) => [...prev, c])
  const onCommentPatch = (c) => setComments((prev) => prev.map((x) => (x.id === c.id ? c : x)))
  const onCommentDelete = (id) => setComments((prev) => prev.filter((x) => x.id !== id))

  // M4.6 — share modal toggle. Owner-only since it's mounted in TopBar
  // alongside other owner controls; the public viewer renders ShareView
  // (a different page) and never sees this state.
  const [shareOpen, setShareOpen] = useState(false)
  // M6.2 — push-to-Jira modal toggle. Same pattern as ShareModal.
  const [pushJiraOpen, setPushJiraOpen] = useState(false)
  // M6.3 — push-to-Linear modal toggle. Parallel to Jira.
  const [pushLinearOpen, setPushLinearOpen] = useState(false)
  // M6.4 — push-to-GitHub modal toggle. Same pattern.
  const [pushGitHubOpen, setPushGitHubOpen] = useState(false)
  const handleRegenSection = async (section) => {
    if (!extractionId || regenBusy) return
    if (!window.confirm(`Replace your ${section} with a fresh draft from Claude?`)) return
    setRegenBusy(section)
    track('regen_clicked', { section })
    try {
      const updated = await regenSectionApi(extractionId, section)
      setExtraction(updated)
      refreshPlan()
      toast.success(`${section} regenerated`)
    } catch (e) {
      if (e.paywall) setPaywall(e.paywall)
      else toast.error(e.message || 'Regen failed')
    } finally {
      setRegenBusy(null)
    }
  }

  // Documents page passes a summary row; hydrate the full record from the API
  // before opening the studio so brief/actors/stories/nfrs/gaps are present.
  const restoreExtraction = async (rowOrRecord) => {
    // If it's already a full record (has stories), open immediately.
    if (rowOrRecord && Array.isArray(rowOrRecord.stories)) {
      setExtraction(rowOrRecord)
      setExtractionId(rowOrRecord.id)
      if (!isHome) navigate('/')
      return
    }
    try {
      const full = await getExtraction(rowOrRecord.id)
      if (!full) {
        toast.error('That document is no longer available')
        return
      }
      setExtraction(full)
      setExtractionId(full.id)
      if (!isHome) navigate('/')
    } catch (e) {
      toast.error(e.message || 'Could not open document')
    }
  }

  // Switch to a different version of the currently-open extraction.
  // Always hydrates from the backend so we don't carry stale state.
  const switchVersion = async (id) => {
    if (!id || id === extractionId) return
    try {
      const full = await getExtraction(id)
      if (!full) {
        toast.error('That version is no longer available')
        return
      }
      setExtraction(full)
      setExtractionId(full.id)
    } catch (e) {
      toast.error(e.message || 'Could not load version')
    }
  }

  const handleRerun = async () => {
    if (!extractionId || rerunning) return
    setRerunning(true)
    try {
      const newRecord = await rerunExtractionApi(extractionId)
      setExtraction(newRecord)
      setExtractionId(newRecord.id)
      refreshPlan()  // M3.5 — re-runs count against the quota too
      toast.success('Re-extracted — new version saved')
    } catch (e) {
      if (e.paywall) setPaywall(e.paywall)
      else toast.error(e.message || 'Re-run failed')
    } finally {
      setRerunning(false)
    }
  }

  const appCtx = {
    restoreExtraction,
    reset,
    theme,
    setTheme,
    projects,
    projectsLoading,
    refreshProjects,
    projectById,
    plan,                              // M3.5 — null until first /api/me/plan response
    refreshPlan,
    showPaywall: setPaywall,           // imperative trigger if any other component needs it
  }

  return (
    <AppProvider value={appCtx}>
    <div className="app">
      <Sidebar onNew={reset} />
      <main className="main">
        <TopBar
          extraction={extraction}
          extractionId={extractionId}
          loading={loading}
          rerunning={rerunning}
          theme={theme}
          onTheme={setTheme}
          showGaps={showGaps}
          onToggleGaps={() => setShowGaps((x) => !x)}
          onReset={reset}
          onRerun={handleRerun}
          onSwitchVersion={switchVersion}
          onShare={extractionId ? () => setShareOpen(true) : undefined}
          onPushToJira={extractionId ? () => setPushJiraOpen(true) : undefined}
          onPushToLinear={extractionId ? () => setPushLinearOpen(true) : undefined}
          onPushToGitHub={extractionId ? () => setPushGitHubOpen(true) : undefined}
        />
        <Routes>
          <Route
            path="/"
            element={
              <>
                {!extraction && !loading && (
                  <EmptyState onSubmit={handleExtract} loading={loading} />
                )}
                {loading && (
                  <LoadingState
                    filename={pendingName}
                    usage={streamUsage}
                    onStop={handleStopExtract}
                  />
                )}
                {extraction && !loading && (
                  <div className="body">
                    <SourcePane extraction={extraction} selectedQuote={selectedQuote} />
                    <ArtifactsPane
                      extraction={extraction}
                      onPickQuote={pickQuote}
                      onUpdate={updateExtraction}
                      onRegenSection={handleRegenSection}
                      regenBusy={regenBusy}
                      comments={comments}
                      onCommentCreate={onCommentCreate}
                      onCommentPatch={onCommentPatch}
                      onCommentDelete={onCommentDelete}
                    />
                  </div>
                )}
              </>
            }
          />
          <Route path="/documents" element={<Documents />} />
          <Route path="/projects/:id" element={<Project />} />
          {/* Account uses hash routing inside Clerk's UserProfile, so the
              react-router path matches both /account and /account/* */}
          <Route path="/account/*" element={<Account />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {isHome && extraction && !loading && showGaps && (
        <GapsRail
          gaps={extraction.gaps}
          extractionId={extractionId}
          onPickQuote={pickQuote}
          onUpdate={(nextGaps) => updateExtraction({ gaps: nextGaps })}
          onRegen={() => handleRegenSection('gaps')}
          regenBusy={regenBusy === 'gaps'}
        />
      )}
      <PaywallModal paywall={paywall} onClose={() => setPaywall(null)} />
      {shareOpen && extractionId && (
        <ShareModal extractionId={extractionId} onClose={() => setShareOpen(false)} />
      )}
      {pushJiraOpen && extraction && (
        <PushToJiraModal extraction={extraction} onClose={() => setPushJiraOpen(false)} />
      )}
      {pushLinearOpen && extraction && (
        <PushToLinearModal extraction={extraction} onClose={() => setPushLinearOpen(false)} />
      )}
      {pushGitHubOpen && extraction && (
        <PushToGitHubModal extraction={extraction} onClose={() => setPushGitHubOpen(false)} />
      )}
    </div>
    </AppProvider>
  )
}


/**
 * Top-level router gate. /sign-in/* and /sign-up/* are always public.
 * Everything else: signed-in users get the studio, signed-out users get
 * redirected to /sign-in. The Clerk widgets handle redirect-back-to-app
 * after success via the fallback URLs configured in main.jsx.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />
      {/* M4.6 — public share view; outside the SignedIn gate so visitors
          without a Clerk account can read shared documents by URL. */}
      <Route path="/share/:token" element={<ShareView />} />
      <Route
        path="*"
        element={
          <>
            <SignedIn>
              <AuthedApp />
            </SignedIn>
            <SignedOut>
              <Navigate to="/sign-in" replace />
            </SignedOut>
          </>
        }
      />
    </Routes>
  )
}
