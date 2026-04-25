import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { SignedIn, SignedOut, useAuth, useOrganization } from '@clerk/clerk-react'
import { extract, listProjectsApi, rerunExtractionApi, setTokenGetter } from './api.js'
import { getExtraction } from './lib/store.js'
import { migrateLocalStorageOnce } from './lib/migrate.js'
import { getSettings, setSettings } from './lib/settings.js'
import { AppProvider } from './lib/AppContext.jsx'
import { useToast } from './components/Toast.jsx'
import Account from './pages/Account.jsx'
import Documents from './pages/Documents.jsx'
import Project from './pages/Project.jsx'
import Settings from './pages/Settings.jsx'
import SignInPage from './pages/SignInPage.jsx'
import SignUpPage from './pages/SignUpPage.jsx'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import EmptyState from './components/EmptyState.jsx'
import SourcePane from './components/SourcePane.jsx'
import ArtifactsPane from './components/ArtifactsPane.jsx'
import GapsRail from './components/GapsRail.jsx'
import { Card, IconTile, Spinner } from './components/primitives.jsx'
import { Sparkles, Check } from './components/icons.jsx'

function LoadingState({ filename }) {
  const steps = [
    ['Parsing document', true],
    ['Extracting actors & scope', true],
    ['Drafting user stories', 'active'],
    ['Checking for gaps & ambiguities', false],
    ['Composing acceptance criteria', false],
  ]
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
              Claude is structuring the source into a clean brief.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          {steps.map(([label, state], i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontSize: 13,
                color: state === false ? 'var(--text-soft)' : 'var(--text)',
              }}
            >
              {state === true ? (
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
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div
          style={{
            height: 6,
            borderRadius: 999,
            background: 'var(--bg-hover)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
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
        </div>
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

  const [extraction, setExtraction] = useState(null)
  const [extractionId, setExtractionId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [rerunning, setRerunning] = useState(false)
  const [showGaps, setShowGaps] = useState(true)
  const [theme, setThemeRaw] = useState(() => getSettings().theme || 'light')
  const [pendingName, setPendingName] = useState('')
  const [projects, setProjects] = useState([])
  const [projectsLoading, setProjectsLoading] = useState(true)

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

  useEffect(() => { refreshProjects() }, [refreshProjects])

  // Re-fetch + reset whenever the active workspace changes. orgId is null
  // for personal context. Skipped until Clerk's org info has loaded so we
  // don't fire a redundant fetch immediately after the bootstrap one.
  useEffect(() => {
    if (!orgLoaded) return
    refreshProjects()
    setExtraction(null)
    setExtractionId(null)
  }, [orgId, orgLoaded, refreshProjects])

  const projectById = useMemo(() => {
    const m = {}
    for (const p of projects) m[p.id] = p
    return m
  }, [projects])

  const handleExtract = async ({ file, text, filename }) => {
    setLoading(true)
    setPendingName(file ? file.name : filename)
    try {
      // Backend persists and returns the full record (with id + provenance).
      const record = await extract({ file, text, filename })
      setExtraction(record)
      setExtractionId(record?.id || null)
      // Ensure the result view is visible no matter where the extraction was triggered from
      if (location.pathname !== '/') navigate('/')
    } catch (e) {
      toast.error(e.message || 'Extraction failed')
    } finally {
      setLoading(false)
      setPendingName('')
    }
  }

  const reset = () => {
    setExtraction(null)
    setExtractionId(null)
    if (!isHome) navigate('/')
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
      toast.success('Re-extracted — new version saved')
    } catch (e) {
      toast.error(e.message || 'Re-run failed')
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
        />
        <Routes>
          <Route
            path="/"
            element={
              <>
                {!extraction && !loading && (
                  <EmptyState onSubmit={handleExtract} loading={loading} />
                )}
                {loading && <LoadingState filename={pendingName} />}
                {extraction && !loading && (
                  <div className="body">
                    <SourcePane extraction={extraction} />
                    <ArtifactsPane extraction={extraction} />
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
        <GapsRail gaps={extraction.gaps} extractionId={extractionId} />
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
