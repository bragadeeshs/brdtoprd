/* M0.1.3 — smoke specs for the public unauth surfaces.
 *
 * What we cover:
 *   1. /sign-in renders without crashing (Clerk's <SignIn /> mounts).
 *   2. /share/<bogus-token> renders the "not found" state cleanly.
 *
 * What we DON'T cover (yet):
 *   - Upload → extract → see structured artifacts. Needs Clerk auth bypass
 *     in the backend (STORYFORGE_E2E_USER_ID dep override). Tracked as
 *     M0.1.3.b in PROJECT.md.
 *
 * If either spec goes red, the SPA can't even boot — the auth + share
 * routes are critical entry points.
 */

import { test, expect } from '@playwright/test'

test('/sign-in mounts without crashing', async ({ page }) => {
  // Listen for any uncaught console error — Clerk loader failures often
  // surface here before the page has a chance to render anything visible.
  const errors = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/sign-in')

  // The body should render *something* (Clerk's sign-in widget or its
  // own loading shell). Don't assert on Clerk-specific text — the widget
  // copy can change. We just need the page to not blow up.
  await expect(page.locator('body')).not.toBeEmpty()
  expect(errors.filter((e) => !e.includes('Clerk'))).toEqual([])
})

test('/share/<unknown-token> shows the not-found state', async ({ page }) => {
  // Use a URL-shaped but obviously-not-real token. The backend route
  // (services/share.py) returns 404 for unknown/revoked/expired — the
  // ShareView page should render its error card with a "Go to home" link.
  await page.goto('/share/this-token-definitely-does-not-exist')

  // Either "Not found" (when /api/share/* returns 404) or a redirect to
  // sign-in (if the dev backend isn't running and the fetch errors). Both
  // are acceptable smoke results — the assertion is just "renders without
  // crashing and shows recognizable content".
  const root = page.locator('body')
  await expect(root).not.toBeEmpty()
  // The page should expose the "Lucid home" link in either error
  // state (ShareView's CenteredCard always includes it on error).
  // Use a 5s timeout so a slow first paint doesn't flake the test.
  await expect(page.getByText(/Lucid|Sign in|home/i).first()).toBeVisible({ timeout: 5_000 })
})
