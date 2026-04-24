import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, useNavigate } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import App from './App.jsx'
import { ToastProvider } from './components/Toast.jsx'
import './styles.css'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!PUBLISHABLE_KEY) {
  // Fail loud, not silent — the app is unusable without Clerk wired up.
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY (frontend/.env)')
}

/** Wrap ClerkProvider so it can use react-router's navigate instead of full-page reloads. */
function ClerkRouterAdapter({ children }) {
  const navigate = useNavigate()
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      {children}
    </ClerkProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <ClerkRouterAdapter>
          <App />
        </ClerkRouterAdapter>
      </BrowserRouter>
    </ToastProvider>
  </React.StrictMode>,
)
