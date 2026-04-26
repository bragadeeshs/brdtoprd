/* M0.1.2 — Vitest setup file.
 *
 * - Loads @testing-library/jest-dom so we get matchers like
 *   `toBeInTheDocument` / `toHaveTextContent`.
 * - Stubs the fetch API to a noisy default so an accidental network call
 *   from a test fails loudly. Tests that need to hit "the network" should
 *   spyOn it explicitly.
 * - Provides VITE_CLERK_PUBLISHABLE_KEY so main-side imports that read it
 *   at module load don't blow up under Vitest.
 */

import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Tests should not hit the network by accident. Override per-test if needed.
globalThis.fetch = vi.fn(() => {
  throw new Error('Unexpected network call in test — stub fetch in your test if needed')
})

// matchMedia is used by some component libraries; jsdom doesn't ship it.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
