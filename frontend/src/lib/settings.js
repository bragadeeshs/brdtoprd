/**
 * Frontend-only settings — theme preference.
 *
 * As of M3.4.4 the BYOK Anthropic key + model preference live on the backend
 * (`/api/me/settings`). Theme stays here because (a) it's UX-only, (b) we
 * apply it before any auth check fires (otherwise dark-mode users would see
 * a light-mode flash on every reload), and (c) it doesn't need to follow the
 * user across browsers.
 *
 * The `getSettings`/`setSettings` shape is preserved as a thin shim so
 * existing call sites (App.jsx reads `getSettings().theme`) keep working
 * without changes. BYOK / model fields in those shims are now no-ops.
 */

const THEME_KEY = 'storyforge:theme'

export function getTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'light'
  } catch {
    return 'light'
  }
}

export function setTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* ignore quota / private-mode errors */
  }
}

// ---- back-compat shims ----

export function getSettings() {
  return { theme: getTheme(), model: '', anthropicKey: '' }
}

export function setSettings(patch) {
  if (patch && typeof patch.theme === 'string') setTheme(patch.theme)
  // BYOK key + model are server-side now; silently ignore if passed.
}
