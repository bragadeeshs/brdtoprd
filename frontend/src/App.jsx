import React, { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { extract } from './api.js'
import { saveExtraction } from './lib/store.js'
import { AppProvider } from './lib/AppContext.jsx'
import { useToast } from './components/Toast.jsx'
import Documents from './pages/Documents.jsx'
import Settings from './pages/Settings.jsx'
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

export default function App() {
  const [extraction, setExtraction] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showGaps, setShowGaps] = useState(true)
  const [theme, setTheme] = useState('light')
  const [pendingName, setPendingName] = useState('')

  const location = useLocation()
  const navigate = useNavigate()
  const { toast } = useToast()
  const isHome = location.pathname === '/'

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const handleExtract = async ({ file, text, filename }) => {
    setLoading(true)
    setPendingName(file ? file.name : filename)
    try {
      const result = await extract({ file, text, filename })
      saveExtraction(result)
      setExtraction(result)
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
    if (!isHome) navigate('/')
  }

  const restoreExtraction = (payload) => {
    setExtraction(payload)
    if (!isHome) navigate('/')
  }

  const appCtx = { restoreExtraction, reset }

  return (
    <AppProvider value={appCtx}>
    <div className="app">
      <Sidebar onNew={reset} />
      <main className="main">
        <TopBar
          extraction={extraction}
          loading={loading}
          theme={theme}
          onTheme={setTheme}
          showGaps={showGaps}
          onToggleGaps={() => setShowGaps((x) => !x)}
          onReset={reset}
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
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {isHome && extraction && !loading && showGaps && <GapsRail gaps={extraction.gaps} />}
    </div>
    </AppProvider>
  )
}
