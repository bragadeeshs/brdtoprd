# StoryForge — Build Plan

> **Source of truth for what we're building, in what order, and what's done.**
> Update this file as we go. Ship one task at a time.

## Status legend

- `[ ]` pending
- `[~]` in progress
- `[x]` done
- `[!]` blocked
- `[-]` dropped / deprioritized

Effort tags: `S` (≤2h), `M` (half-day), `L` (1–2 days), `XL` (3+ days)

---

## Decisions made

- **Build mode**: SaaS (Option C)
- **Auth**: Clerk
- **DB**: SQLite (Phase 2) → Neon Postgres (Phase 3)
- **ORM**: SQLModel
- **File storage**: Cloudflare R2 in Phase 3 (local disk in Phase 2)
- **Frontend host**: Vercel
- **Backend host**: Render
- **Payments**: Stripe (scaffold in M3, enable later)
- **Default Claude model**: `claude-sonnet-4-6` (override via `STORYFORGE_MODEL`)

## Decisions pending (answer before M3)

- [ ] **D1**: Target user — PMs / BAs / Eng managers / Founders? (Drives templates + integrations.)
- [ ] **D2**: Wedge — what makes us non-commodity? (Custom templates? Source citations? Multi-doc? Workflow?)
- [ ] **D3**: BYOK or managed Anthropic key? (Drives billing model.)
- [ ] **D4**: Free-tier limits — runs/month? doc size cap? feature gates?
- [ ] **D5**: Pricing — per-seat vs per-run vs per-doc?

---

# M0 — Operations (cross-cutting)

> Start in M2. Don't wait until the end.

## M0.1 Testing

- [ ] **M0.1.1** Add `pytest` to backend, write smoke test for `/api/extract` mock path — `backend/tests/` — S
- [ ] **M0.1.2** Add Vitest + React Testing Library to frontend, write a render test for `App.jsx` — `frontend/` — S
- [ ] **M0.1.3** Add Playwright for one happy-path e2e (upload → see extraction) — `e2e/` — M
- [ ] **M0.1.4** Coverage gate: 60%+ on backend extract logic before M3 — — S

## M0.2 CI/CD

- [ ] **M0.2.1** GitHub Actions: backend test + lint on PR — `.github/workflows/backend.yml` — S
- [ ] **M0.2.2** GitHub Actions: frontend test + build on PR — `.github/workflows/frontend.yml` — S
- [ ] **M0.2.3** Auto-deploy to Render (backend) + Vercel (frontend) on `main` — — S
- [ ] **M0.2.4** Block merge if tests fail — repo settings — S

## M0.3 Observability

- [ ] **M0.3.1** Structured logging in FastAPI (JSON logs) — `backend/main.py` — S
- [ ] **M0.3.2** Request ID middleware — `backend/main.py` — S
- [ ] **M0.3.3** Anthropic token usage logged per request — `backend/extract.py` — S
- [ ] **M0.3.4** Sentry (frontend + backend) — — S
- [ ] **M0.3.5** PostHog analytics on key events (extraction started/finished, export clicked) — `frontend/` — M

## M0.4 Documentation

- [x] **M0.4.1** `README.md` at root — quickstart, dev loop, env vars — — S
- [ ] **M0.4.2** `CONTRIBUTING.md` — branch model, commit style, PR template — — S
- [ ] **M0.4.3** `.gitignore` — `node_modules`, `.venv`, `.env`, `dist`, etc. — — S
- [ ] **M0.4.4** Architecture diagram (Mermaid in README) — — S

---

# M1 — Foundations / UI honesty (Phase 1)

> Goal: stop showing controls that lie. Make every visible thing work, even if minimally.
> Frontend-only, localStorage backed. ~3–5 days.

## M1.1 Slim the sidebar

- [x] **M1.1.1** Remove decorative sidebar items: Chats, Templates, Projects section, Recent uploads, free-trial progress bar, account-picker dropdown affordance — `frontend/src/components/Sidebar.jsx` — S
- [x] **M1.1.2** Keep: logo, app name, search icon (stub w/ tooltip "Coming soon"), `+ New` icon (resets to upload screen), Documents nav, Settings nav, user pill — `Sidebar.jsx` — S
- [x] **M1.1.3** Add active state when route is `/documents` or `/settings` (lift the active prop from App) — `Sidebar.jsx`, `App.jsx` — S _(rolled into M1.2.2; NavLink derives active state from route, `active` prop dropped entirely)_
- [ ] **M1.1.4** User pill click opens a small popover with "Sign out" (no-op for now), "Settings" link — `Sidebar.jsx` — S

## M1.2 Routing (lightweight)

- [x] **M1.2.1** Add `react-router-dom@6` and wire 3 routes: `/` (home/extract), `/documents`, `/settings` — `frontend/package.json`, `App.jsx`, `main.jsx` — S _(landed v7.14.2 — same API surface)_
- [x] **M1.2.2** Sidebar nav items become `<NavLink>`s — `Sidebar.jsx` — S
- [x] **M1.2.3** `/` redirects to last extraction if one is loaded, else shows EmptyState — `App.jsx` — S _(behavior already implicit in the `/` route's conditional render; added defensive `navigate('/')` on extraction success so a future trigger from `/documents` lands the user on the result)_

## M1.3 Documents view (localStorage MVP)

- [x] **M1.3.1** On extraction success, persist `{id, filename, savedAt, payload}` to `localStorage['storyforge:extractions']` (cap at 50) — `App.jsx` or new `frontend/src/lib/store.js` — M
- [x] **M1.3.2** Build `frontend/src/pages/Documents.jsx` — list view: filename, savedAt, story count, gaps count — M
- [x] **M1.3.3** Click row → restore extraction into App state, navigate to `/` — — S
- [x] **M1.3.4** Row hover: show delete icon; click confirms via toast (undo for 5s) — — M
- [x] **M1.3.5** Empty state on Documents page (no uploads yet) with CTA back to `/` — — S _(shipped as part of M1.3.2 — `<EmptyState>` component inside Documents.jsx with "No documents yet" + primary "New extraction" button)_
- [x] **M1.3.6** Search box filters by filename or any text in the brief — — S _(also matches against brief tags)_

## M1.4 Settings page

- [x] **M1.4.1** Build `frontend/src/pages/Settings.jsx` — three sections: API, Model, Appearance — M
- [x] **M1.4.2** API section: text field for `ANTHROPIC_API_KEY` (BYOK mode), masked, "Test connection" button hits `/api/health` — M _(button hits new `/api/test-key` for an actual auth round-trip rather than just `/api/health` which only checks env presence; also added show/hide toggle, status dot, and Remove action)_
- [x] **M1.4.3** Backend: accept BYOK via `X-Anthropic-Key` header on `/api/extract`, override env key per request — `backend/main.py`, `backend/extract.py` — M
- [x] **M1.4.4** Model section: radio group with Opus 4.7 / Sonnet 4.6 / Haiku 4.5 — pricing shown per option — S _(card-style radio with 4 options including "Server default"; per-request override via new `X-Storyforge-Model` header)_
- [x] **M1.4.5** Appearance section: theme radio (light/dark/system) — S _(card-row picker w/ Sun/Moon/Monitor icons; system mode follows `prefers-color-scheme` and reacts to OS-level theme changes via mediaQuery listener)_
- [x] **M1.4.6** Persist all settings to `localStorage['storyforge:settings']` and read on app boot — `frontend/src/lib/settings.js` — S _(persistence layer existed since M1.4.2; M1.4.5 wired the boot-read for theme. API key + model already read on each request via `authHeaders()`)_

## M1.5 Active tab pills (artifacts pane)

- [x] **M1.5.1** Tab pills become buttons that scroll the corresponding section into view (smooth) — `ArtifactsPane.jsx` — S _(also dropped the misleading "Gaps" tab — gaps live in the rail, not the pane)_
- [x] **M1.5.2** Active tab highlights as user scrolls (IntersectionObserver) — `ArtifactsPane.jsx` — M _(IO with `rootMargin: '-30% 0px -65% 0px'` — 5% trigger band 30% from the top; tab pills are sticky to top so they stay visible while scrolling)_

## M1.6 Gap actions (resolve / ignore / ask)

- [x] **M1.6.1** Per-gap state in localStorage keyed by extraction id + gap index: `{resolved: bool, ignored: bool, askedAt: ts}` — `lib/store.js` — S
- [x] **M1.6.2** Resolved gap: strikethrough + green check, count in header subtracts — `GapsRail.jsx` — S _(also resolved gaps sink to bottom of active list, dimmed; "Reopen" link to undo)_
- [x] **M1.6.3** Ignored gap: collapses into a "3 ignored" footer that expands on click — `GapsRail.jsx` — M _(footer is a dashed-border button; expanded list shows compact rows with Restore link)_
- [x] **M1.6.4** Ask stakeholder: copies a formatted markdown question to clipboard, shows toast — `GapsRail.jsx` — S _(markdown includes Question/Severity/Source/Context; sets askedAt + shows "Asked" badge; copy fallback for legacy browsers via execCommand)_

## M1.7 Toasts + tooltips

- [x] **M1.7.1** Build `frontend/src/components/Toast.jsx` (provider + `useToast()` hook) — M
- [x] **M1.7.2** Replace all inline error spans with `toast.error(...)` — sweep of all components — S
- [x] **M1.7.3** Add `title` attr to every IconButton for tooltips (free, native) — sweep — S _(IconButton primitive already wires `title={label}` + `aria-label={label}` from M1.7.1; sweep found one raw `<button>` (file-chip × in EmptyState) missing — added)_

## M1.8 Mobile responsive

- [-] **M1.8.1** Below 1024px: sidebar collapses behind a hamburger; off-canvas overlay — `Sidebar.jsx`, `App.jsx` — L _(deferred 2026-04-23 — desktop-first for v1; revisit when mobile users become a target)_
- [-] **M1.8.2** Below 768px: source pane and artifacts pane stack vertically with a tab switch — `App.jsx` — L _(deferred 2026-04-23 — same)_
- [-] **M1.8.3** Gaps rail becomes a bottom-sheet on mobile — `GapsRail.jsx` — M _(deferred 2026-04-23 — same)_

## M1.9 Polish

- [x] **M1.9.1** Empty state inside ArtifactsPane when one section returns 0 items — already partial; sweep — S _(verified: Actors / Stories / NFRs all use `<EmptySection>`; Brief is schema-required so always renders)_
- [x] **M1.9.2** Sort gaps by severity already done — verify and add a "filter by severity" pill row — S _(All / High / Medium / Low pill row with per-bucket counts; pill disabled at count 0; appears only when more than 1 active gap exists)_
- [x] **M1.9.3** Copy-per-artifact: hover any story/gap reveals a copy icon — `ArtifactsPane.jsx`, `GapsRail.jsx` — M _(generic `.has-action`/`.row-action` CSS class; copy buttons emit markdown via shared `lib/clipboard.js`; story copy includes ID/actor/want/so-that/section/criteria; gap copy uses the same markdown as Ask but doesn't set askedAt)_

**M1 ship gate**: all sidebar items either work or are removed. Documents page lists past extractions. Settings persists API key + model. No fake controls.

**M1 status (2026-04-23):** ✅ **Shipped (27/30)** — all 8 active sub-modules complete. M1.8 (mobile responsive, 3 tasks) deferred per user decision; revisit when mobile users become a target.

---

# M2 — Persistence (Phase 2)

> Goal: your work survives a refresh and is the seed of a real backend data model.
> SQLite. Single file. Zero infra cost. ~1–2 weeks.

## M2.1 SQLite + SQLModel schema

- [x] **M2.1.1** Add `sqlmodel`, `aiosqlite` to `backend/requirements.txt`; install — S _(installed `sqlmodel 0.0.38`; skipped `aiosqlite` — using sync sessions on FastAPI's threadpool, simpler for our load. Trivial to add later if we go async)_
- [x] **M2.1.2** Define schema in `backend/db/models.py`: `Extraction(id, filename, raw_text, brief_json, actors_json, stories_json, nfrs_json, gaps_json, created_at, model_used, project_id?, source_file_path?)` — M
- [x] **M2.1.3** Define `Project(id, name, created_at)` and `GapState(id, extraction_id, gap_idx, resolved, ignored, asked_at)` — S _(GapState uses composite PK on `(extraction_id, gap_idx)` — gaps have no stable id from the model)_
- [x] **M2.1.4** SQLite engine + session dependency in `backend/db/session.py` — S
- [x] **M2.1.5** Auto-create tables on startup (FastAPI lifespan event) — `main.py` — S
- [-] **M2.1.6** Add `alembic` for future migrations — `backend/alembic/` — M _(deferred 2026-04-23 — `SQLModel.metadata.create_all()` is sufficient until our first schema change in production. Real need is the Postgres migration at M3.2 — set up alembic then)_

## M2.2 Backend CRUD routes

- [x] **M2.2.1** `POST /api/extract` writes to DB, returns `Extraction` with `id` — `main.py`, `extract.py` — S
- [x] **M2.2.2** `GET /api/extractions` paginated list — `backend/routers/extractions.py` — M _(supports `q`, `project_id`, `limit`, `offset`; returns `ExtractionSummary` rows — no `raw_text`/payload to keep the list lean)_
- [x] **M2.2.3** `GET /api/extractions/{id}` — — S
- [x] **M2.2.4** `DELETE /api/extractions/{id}` — — S _(cascades gap states manually since the schema has no SA cascade)_
- [x] **M2.2.5** `PATCH /api/extractions/{id}` (rename, move to project) — — S _(empty `project_id` clears the link; non-empty validated against existing project)_
- [x] **M2.2.6** `PATCH /api/extractions/{id}/gaps/{idx}` — resolve/ignore — — S _(upserts the GapState row; bounds-checked against `extraction.gaps`)_
- [x] **M2.2.7** Project routes: `GET / POST /api/projects`, `DELETE /api/projects/{id}`, `PATCH /api/projects/{id}` — M _(delete detaches extractions rather than cascading — losing a project shouldn't lose work)_

## M2.3 Source-file storage

- [x] **M2.3.1** Save uploaded file to `backend/uploads/{extraction_id}/{filename}` — `main.py` — S _(extraction id minted up front so the path is known before the row exists; disk write happens before persist so a save failure 500s without leaving an orphan row)_
- [x] **M2.3.2** `GET /api/extractions/{id}/source` returns the original file with correct mimetype — — S _(mimetypes.guess_type with `.md`/`.markdown`/`.rst` registered explicitly; 404 for missing row, paste-mode extraction, or vanished file — same user-facing answer)_
- [x] **M2.3.3** Cleanup hook on delete — — S _(`delete_extraction` calls `remove_upload_dir` after the row is gone — best-effort, non-blocking)_

## M2.4 Frontend Documents view (server-backed)

- [x] **M2.4.1** Replace localStorage reads with calls to `/api/extractions` — `Documents.jsx` — S
- [-] **M2.4.2** Add `react-query` (TanStack Query) for caching + refetch — `frontend/package.json` — M _(deferred 2026-04-24 — plain `useEffect` + a refresh helper covers the current surface area: a single list view, a detail fetch on open, and per-gap optimistic patches. Add react-query when we hit M2.5/M2.6 and need cross-page cache invalidation)_
- [x] **M2.4.3** Loading + error skeletons on Documents page — — S
- [x] **M2.4.4** Restore extraction → fetches `/api/extractions/{id}` → hydrates App state — — S _(App.restoreExtraction now branches: full record opens immediately; summary row triggers `getExtraction(id)` and toasts on 404)_
- [x] **M2.4.5** Migration helper: on first load, push localStorage extractions to backend, clear localStorage — `lib/migrate.js` — M _(idempotent — preserves original ids; sticky `storyforge:migrated:v1` flag prevents reruns; only clears local on full success)_

## M2.5 Projects (group extractions)

- [x] **M2.5.1** Re-add the Projects section in Sidebar (this time backed by API) — `Sidebar.jsx` — S _(`AppContext` now caches `{projects, projectsLoading, refreshProjects, projectById}` so the sidebar, Documents pill, and Project page all share one source of truth)_
- [x] **M2.5.2** "+ New project" inline form in sidebar — — S _(small +/× toggle on the section header; Enter submits, Esc/× cancel; auto-focuses input on open)_
- [x] **M2.5.3** Project page: `frontend/src/pages/Project.jsx` — list of extractions in this project — M _(inline-rename header, ghost Delete project button with confirm prompt — delete *detaches* extractions per backend, doesn't cascade; per-row "Remove from project" + Delete actions; reuses the Documents row layout)_
- [x] **M2.5.4** Move-to-project from Documents row context menu — — S _(MoreHorizontal "…" button per row → popover with project list + "Remove from project" footer; click-outside catcher + Esc to close; row also gets an accent-pill linking to the parent project)_

## M2.6 Versioning

- [x] **M2.6.1** "Re-run on this doc" button on an extraction → creates a new version, links to parent — `ArtifactsPane.jsx`, backend — M _(landed in TopBar instead of ArtifactsPane — better with the existing breadcrumb context. New `POST /api/extractions/{id}/rerun` reuses the saved `raw_text`+`filename` and applies the current request's API key + model so users can re-run with a different model)_
- [x] **M2.6.2** Version dropdown in TopBar shows v1, v2, v3 — — M _(badge "v{N} of {total}" only renders when total > 1; click opens a popover with each version's id, timestamp, model, and a Check next to current; click any to switch — the studio re-hydrates from the backend so no stale state carries over)_
- [!] **M2.6.3** Diff view (later) — `[!]` deferred to M5 — —

## M2.7 Search

- [x] **M2.7.1** Backend: `GET /api/extractions?q=foo` — substring across filename + brief — S _(case-insensitive substring on filename + `json_extract(brief, '$.summary')` via `func.json_extract`; tag search left out — JSON-array LIKE in SQLite is fiddly, revisit if usage shows demand)_
- [x] **M2.7.2** Frontend: search box on Documents wired to query — — S _(replaced the client-side useMemo filter with a 200 ms debounced effect that re-queries `/api/extractions?q=...`; inline Spinner next to the count badge while a search is in flight; "no docs yet" hero only shows when the store is genuinely empty, not when a search returns 0)_

**M2 ship gate**: Refresh keeps your work. Multiple extractions visible in a real Documents page. Projects exist. Source files retrievable.

---

# M3 — Auth + SaaS foundation (Phase 3)

> Goal: real users, isolated data, billing scaffolding.
> Clerk + Neon Postgres + Stripe scaffold + R2 storage. ~2–3 weeks.

## M3.1 Clerk integration

- [x] **M3.1.1** Sign up at clerk.com, get publishable + secret keys — — S _(Clerk app `sweeping-fawn-26`; keys live in `backend/.env` (`CLERK_SECRET_KEY`) + `frontend/.env` (`VITE_CLERK_PUBLISHABLE_KEY`); secret verified via `GET https://api.clerk.com/v1/users` → 200)_
- [x] **M3.1.2** Frontend: `@clerk/clerk-react` — wrap App in `<ClerkProvider>` — `main.jsx` — S _(via `ClerkRouterAdapter` so Clerk uses react-router's navigate instead of full-page reloads)_
- [x] **M3.1.3** Add `<SignIn />` and `<SignUp />` pages, redirect unauth users to sign-in — M _(`pages/SignInPage.jsx` + `pages/SignUpPage.jsx` mount Clerk's hosted widgets; `<SignedIn>`/`<SignedOut>` gate at the route level — anything except `/sign-in/*` and `/sign-up/*` redirects when signed out)_
- [x] **M3.1.4** User pill in sidebar pulls from `useUser()`; sign-out button — `Sidebar.jsx` — S _(new `UserPill` reads name/email via `useUser()`; Clerk's `<UserButton>` renders a 28px avatar with the manage-account + sign-out dropdown built in, `afterSignOutUrl="/sign-in"`)_
- [x] **M3.1.5** Backend: install `clerk-sdk-python`, validate JWT on every `/api/*` request — `backend/auth/clerk.py` — M _(switched to **PyJWT + JWKS verification** — `clerk-sdk-python` adds churn risk for what's effectively 30 lines of JWT code. `_derive_issuer_from_pk` decodes the publishable key's base64-encoded host to get the JWKS URL. Issuer + algorithm checked; aud verification disabled because Clerk doesn't set it. New dep: `pyjwt[crypto]>=2.8.0`)_
- [x] **M3.1.6** FastAPI dependency `current_user` extracts user_id from JWT — `backend/auth/deps.py` — S _(returns frozen `CurrentUser(user_id, org_id, org_role)` dataclass; routes that need the user parametrise, routes that just need auth-gating use `dependencies=[Depends(current_user)]`)_
- [x] **M3.1.7** All routes require auth; reject with 401 if no/invalid token — — S _(router-level dependency on `extractions_router` and `projects_router` covers everything under `/api/extractions` and `/api/projects`; explicit `Depends(current_user)` on `/api/extract` and `/api/test-key` in main.py; `/api/health` deliberately left open for infra probes. **Note**: data is not yet user-filtered — all signed-in users see all rows. M3.2 adds the user_id column + per-query filtering)_

## M3.2 Postgres migration + isolation

- [x] **M3.2.1** Sign up at neon.tech, create project + DB — — S _(switched to **Supabase** instead — same Postgres under the hood. Connection string in gitignored `backend/.env` as `DATABASE_URL`. Free tier: 500 MB, pauses after 1 week inactivity (5s wake on first request). PostgreSQL 17.6.)_
- [x] **M3.2.2** Add `psycopg[binary]` + `asyncpg` to requirements — S _(only `psycopg[binary]>=3.1.0` — `asyncpg` not needed since SQLModel sessions are sync. Async swap is a future optimisation)_
- [x] **M3.2.3** Update `DATABASE_URL` env var, swap engine to Postgres — `backend/db/session.py` — S _(dialect-aware: `DATABASE_URL` env var picks Postgres (forces `postgresql+psycopg://` so SQLAlchemy doesn't default to legacy psycopg2); unset falls back to SQLite at `STORYFORGE_DB`. `connect_args` differ per dialect (`check_same_thread=False` for SQLite only). `pool_pre_ping=True` on Postgres so dropped connections to Supabase reconnect cleanly. Soft migrations gated to SQLite — Postgres goes through Alembic when M3.2.5 lands)_
- [x] **M3.2.4** Add `user_id` (Clerk's `user_xxx`) column to all tables — `db/models.py` — M _(landed on SQLite ahead of Postgres migration. Soft `ALTER TABLE` adds `extraction.user_id` and `project.user_id` with `DEFAULT 'local'` — existing rows backfill to "local". `usage_log.user_id` and `user_settings.user_id` already existed from M3.0. `org_id` deferred to M3.3 with workspaces)_
- [-] **M3.2.5** Generate Alembic migration for the schema change — — S _(deferred — `create_all` bootstrapped Postgres cleanly with the M3.0/3.1/3.2 schema baked in, so there's no schema *change* to migrate yet. Set up Alembic when the next column lands (likely M3.4.4 user-settings PUT route or M3.5.4 free-tier limits). Until then, Postgres tracks SQLModel's metadata directly)_
- [x] **M3.2.6** Every query filters by `current_user.user_id` (or `org_id` if Workspaces enabled) — sweep all routers — M _(every route in `routers/extractions.py` + `routers/projects.py` + `/api/extract` + `/api/extractions/import` now filters by `current_user.user_id`. Cross-user reads return **404 not 403** to avoid existence leaks. Project ownership validated before LLM call so we don't waste tokens. New `_owned_extraction()` + `_owned_project()` helpers centralise the check)_
- [x] **M3.2.7** Test: User A cannot see User B's extractions — `tests/test_isolation.py` — M _(22-assertion script; uses TestClient + `dependency_overrides` on `current_user` so no real Clerk JWT needed. Throwaway DB via `STORYFORGE_DB` env var. Runs as `python -m tests.test_isolation`. All checks pass — A's project + extraction invisible to B in list / detail / versions / gaps / source; B can't PATCH/DELETE/rerun A's rows; B can't attach new extraction to A's project; B's import to A's id returns 409 collision)_

## M3.3 Workspaces / orgs

- [ ] **M3.3.1** Enable Clerk Organizations in dashboard — — S
- [ ] **M3.3.2** Add org switcher in Sidebar (Clerk's `<OrganizationSwitcher />`) — S
- [ ] **M3.3.3** Backend: scope all queries to `org_id` if user is in an org context — M
- [ ] **M3.3.4** Invite teammate flow (Clerk handles UI) — S

## M3.4 BYOK encrypted at rest

- [x] **M3.4.1** Generate a `MASTER_KEY` env var for the backend — — S _(M3.0 — `STORYFORGE_MASTER_KEY` env var; dev fallback generates an ephemeral key + warns)_
- [x] **M3.4.2** Encrypt user's Anthropic key with Fernet (cryptography lib) before DB write — `backend/services/byok.py` — M _(M3.0 — `encrypt_secret`/`decrypt_secret`, lru-cached cipher, InvalidToken returns None for graceful key-rotation handling)_
- [x] **M3.4.3** UserSettings table: `(user_id, anthropic_key_encrypted, model_default)` — `db/models.py` — S _(M3.0 — schema only, default `user_id="local"`. Routes land with M3.4.4)_
- [x] **M3.4.4** Settings page calls `PUT /api/me/settings` instead of localStorage — `Settings.jsx` — S _(new `routers/me.py` with `GET /api/me/settings` (returns `{anthropic_key_set, anthropic_key_preview, model_default, updated_at}` — never raw key) and `PUT /api/me/settings` (Fernet-encrypted before write). [Settings.jsx](frontend/src/pages/Settings.jsx) ApiKeyForm + ModelPicker now read/write via the API; raw key only lives in component state during edit, dropped on Save. [lib/settings.js](frontend/src/lib/settings.js) shrunk to theme-only with back-compat shims. Status pill shows ••••XYZK preview)_
- [x] **M3.4.5** Extract route decrypts user's key per request, never logs it — `extract.py` — S _(new `services/byok.resolve_user_byok(session, user_id, header_override)` returns `(api_key, model)` with precedence: request header > stored UserSettings > env. Wired into `/api/extract` (main.py) and `/api/extractions/{id}/rerun`. The header path is preserved so `Test connection` keeps working without saving. Frontend [api.js](frontend/src/api.js) no longer sends `X-Anthropic-Key`/`X-Storyforge-Model` on regular requests — only `testApiKey` sends header for one-shot validation)_
- [ ] **M3.4.6** Or: managed-key path (use server's key, meter usage) — feature flag `STORYFORGE_BYOK_MODE` — M _(blocked on D3)_

## M3.5 Free-tier limits

- [x] **M3.5.1** UsageLog table: `(user_id, action, tokens_in, tokens_out, cost_cents, ts)` — `db/models.py` — S _(M3.0 — also tracks cache_creation/cache_read tokens, action enum extract|rerun, FK to extraction_id (nullable))_
- [-] **M3.5.2** Decorator `@track_usage` on extract route writes a UsageLog — M _(skipped — explicit `record_usage(...)` call inside the route is one line and easier to read than a decorator. Revisit if we hit 5+ call sites)_
- [x] **M3.5.3** Read Anthropic response usage and persist tokens + computed cost — `extract.py` — S _(M3.0 — `extract_requirements` returns `(result, usage)`; cost compute in `services/cost.py` with PRICING_USD_PER_M for all 4 models, cache-aware approximation)_
- [ ] **M3.5.4** Free tier: 10 extractions / month, 25 KB doc cap. Enforce server-side — `routers/extractions.py` — M _(blocked on D4)_
- [ ] **M3.5.5** Frontend: real "X of 10 runs used" bar in sidebar — `Sidebar.jsx` — S _(blocked on M3.5.4 + D4)_
- [ ] **M3.5.6** Hit limit → show paywall modal — M _(blocked on M3.5.4)_

## M3.6 Stripe scaffolding (no charging yet)

- [ ] **M3.6.1** Stripe account, products: Free / Pro $19 / Team $49 — — S
- [ ] **M3.6.2** Backend webhook handler `POST /api/stripe/webhook` — `routers/billing.py` — M
- [ ] **M3.6.3** Plan column on User table; webhook updates plan on `customer.subscription.*` events — M
- [ ] **M3.6.4** Frontend: `/upgrade` page with Stripe Checkout link — M
- [ ] **M3.6.5** Test mode only; flip to live before launch — — S

## M3.7 Email (Resend)

- [ ] **M3.7.1** Resend account + API key — — S
- [ ] **M3.7.2** Welcome email on signup (Clerk webhook → backend → Resend) — `routers/webhooks.py` — M
- [ ] **M3.7.3** Email template: "your extraction is ready" if a long-running job lands — defer until streaming — `[!]`

## M3.8 Account / billing page

- [ ] **M3.8.1** `/account` page: profile (Clerk's `<UserProfile />`) + plan + usage — `pages/Account.jsx` — M
- [ ] **M3.8.2** Cancel subscription button (Stripe Customer Portal) — — S
- [ ] **M3.8.3** Download all data button (GDPR) — backend `GET /api/me/export` returns ZIP — M

## M3.9 R2 file storage

- [ ] **M3.9.1** Cloudflare R2 bucket + API token — — S
- [ ] **M3.9.2** Backend uploads source files to R2 instead of local disk — `routers/extractions.py` — M
- [ ] **M3.9.3** Pre-signed URLs for source download — — S

## M3.10 Hosting

- [ ] **M3.10.1** Frontend deploys to Vercel from GitHub `main` — `vercel.json` — S
- [ ] **M3.10.2** Backend deploys to Render from `Dockerfile` — `render.yaml` — S
- [ ] **M3.10.3** Env vars set in Render + Vercel dashboards (Clerk, Anthropic, Neon, R2, Stripe, Resend, Sentry) — — S
- [ ] **M3.10.4** Custom domain + SSL — — S

**M3 ship gate**: Sign up, log in, run extraction, hit free-tier limit, see your usage, isolated from other users, source files in R2, app live on a real domain.

---

# M4 — Editing + collaboration (Phase 4)

> Goal: artifacts become living docs.
> ~2–3 weeks. Full task breakdown when M3 ships.

Scope:
- Inline edit on story title, want, so-that, criteria
- Drag-reorder stories
- Regenerate per section ("regen stories", "regen gaps") with current structure as context
- Add custom story / gap / NFR manually
- Comments on artifacts (multi-user from M3)
- Share read-only link

---

# M5 — Streaming + source citations (Phase 5)

> Goal: extraction feels alive; every artifact links to its source.
> ~1 week. Full task breakdown when M4 ships.

Scope:
- Convert `/api/extract` to SSE; sections appear as Claude generates them
- Each artifact has a `source_quote` field; click → scroll source pane to it
- Click highlight in source pane → scroll to artifact
- Real progress bar with token counts

---

# M6 — Integrations + export (Phase 6)

> Goal: app fits inside existing workflows.
> ~2–4 weeks. Prioritize by D1 (target user) once decided.

Scope (rank by user research):
- Jira push (story → ticket, criteria → sub-tasks)
- Linear push
- GitHub Issues
- Notion / Confluence export
- Slack send-gaps-to-channel
- Public API (extraction triggered from external tools)
- CSV / JSON / DOCX export

---

# M7 — Templates + advanced extraction (Phase 7)

> Goal: workspace-specific value.
> ~2–3 weeks. Detail when M6 ships.

Scope:
- Custom templates (system-prompt blocks per workspace)
- Few-shot examples per workspace
- OCR for scanned PDFs (Claude vision)
- Image / screenshot input
- Multi-doc extraction (folder → unified brief)
- Compare versions (diff between v1 and v2)

---

# Done log

Working tally of tasks shipped, newest first.

- **2026-04-25 · M3.4.4 + M3.4.5** BYOK key + model preference moved server-side, encrypted at rest, decrypted only at extract time. **Backend**: new [routers/me.py](backend/routers/me.py) with `GET /api/me/settings` (returns `{anthropic_key_set, anthropic_key_preview, model_default, updated_at}` — raw key never leaves the server) and `PUT /api/me/settings` (Fernet-encrypted via `services/byok.encrypt_secret` before write). New `services/byok.resolve_user_byok(session, user_id, header_override)` returns `(api_key, model)` with precedence header > stored > env. Wired into `/api/extract` (main.py) and `/api/extractions/{id}/rerun` ([routers/extractions.py](backend/routers/extractions.py)) — both routes now use the stored key when no header is sent. New `services/byok.key_preview()` produces `••••<last4>` for UI display. New `STORYFORGE_MASTER_KEY` env var added to `.env` (Fernet generated; persistent across restarts now — without it the dev fallback gen'd ephemeral keys that broke decryption every reload). New schemas `UserSettingsRead` + `UserSettingsPatch` in [models.py](backend/models.py). **Frontend**: [api.js](frontend/src/api.js) `authHeaders` no longer sends `X-Anthropic-Key`/`X-Storyforge-Model` on regular requests — backend pulls from UserSettings; only `testApiKey` keeps header for one-shot validation. New `getMeSettingsApi`/`putMeSettingsApi` clients. [lib/settings.js](frontend/src/lib/settings.js) shrunk to theme-only with back-compat `getSettings`/`setSettings` shims so App.jsx didn't need touching. [Settings.jsx](frontend/src/pages/Settings.jsx) `ApiKeyForm` + `ModelPicker` now read/write via API; raw key only in component state during edit, cleared on Save; status pill shows ••••XYZK preview when key is set; saving label switches to "Replace" once a key exists. Spinner during initial load. **Smoke ✓ end-to-end**: 6-check backend test (initial empty GET → PUT key+model → preview match → extract uses stored key (Anthropic 401 confirms server resolved it) → clear → cross-user isolation). Vite build clean (119 modules, 101.9 KB JS gzipped). Cleaned 6 orphan test rows from earlier broken test runs that accidentally hit Supabase. **Bonus fix in [tests/test_isolation.py](backend/tests/test_isolation.py)**: explicitly blank `DATABASE_URL` before app import so the test never targets the real Postgres again. 22-assertion isolation test still green.
- **2026-04-25 · M3.2 Half B (M3.2.1 + .2 + .3)** Postgres swap landed. Switched plan from Neon → **Supabase** at user's request — both are vanilla Postgres, swap is a connection-string change either way. **Engine** ([db/session.py](backend/db/session.py)) rewritten dialect-aware: `DATABASE_URL` env var picks Postgres (forces `postgresql+psycopg://` so SQLAlchemy doesn't default to the legacy psycopg2), unset falls back to SQLite at `STORYFORGE_DB`. `connect_args` per dialect (`check_same_thread=False` is SQLite-only). `pool_pre_ping=True` on Postgres so dropped connections to Supabase reconnect cleanly (matters because the free tier pauses after 1 week of inactivity). Soft migrations gated to SQLite — Postgres got a clean schema via `create_all` on first boot. New dep: `psycopg[binary]>=3.1.0` (no asyncpg — sessions stay sync). Connection string masked in startup log via `URL.render_as_string(hide_password=True)`. **Smoke ✓**: tables created end-to-end on Supabase (extraction/gap_state/project/usage_log/user_settings — verified via `pg_tables` query); extraction.user_id/root_id/project_id columns all present; live SQLAlchemy round-trip (insert → read → delete a Project row) succeeded; `/api/health` 200, `/api/extractions` 401 unauth (auth gate still firing); 22-assertion isolation test still green (runs on temp SQLite via STORYFORGE_DB override). PostgreSQL 17.6 confirmed. **M3.2.5 (Alembic) deferred** — no schema *change* to migrate yet; bring it in with the next column addition (likely M3.4.4 or M3.5.4). **Caveat**: existing dev SQLite rows did NOT migrate to Postgres — file at `backend/storyforge.db` stays for safekeeping but is no longer connected. Any test data needs to be re-created on Postgres.
- **2026-04-24 · M3.2 Half A (M3.2.4 + .6 + .7)** Per-user data isolation on SQLite, ahead of the Postgres migration. Closes the "all signed-in users see all rows" caveat from M3.1. **Schema** ([db/models.py](backend/db/models.py)): `extraction.user_id` and `project.user_id` columns added (indexed, default `"local"`). `usage_log.user_id` and `user_settings.user_id` already existed from M3.0. `org_id` deferred to M3.3 (workspaces). **Migration** ([db/session.py](backend/db/session.py)): `_apply_soft_migrations` extended to ALTER both tables in place — existing dev rows backfill to `"local"`. Verified via `PRAGMA table_info` after restart. **Service helpers** ([services/extractions.py](backend/services/extractions.py)): `persist_extraction` takes `user_id`, `delete_extraction` and `list_versions` are user-scoped (404 on foreign), `count_extractions_for_project` user-scoped, `record_usage` requires `user_id` (no more "local" default). **Routes**: every endpoint in [routers/extractions.py](backend/routers/extractions.py) and [routers/projects.py](backend/routers/projects.py) now takes `user: CurrentUser = Depends(current_user)` and filters by `user.user_id`. New `_owned_extraction()` + `_owned_project()` helpers centralise the ownership check; cross-user lookups return **404 not 403** so we don't leak existence. `/api/extract` validates project ownership *before* the LLM call (no wasted tokens on 400s). `/api/extractions/import` returns 409 on cross-user id collision. **Test** ([tests/test_isolation.py](backend/tests/test_isolation.py)): 22-assertion isolation regression. Uses `TestClient` + `dependency_overrides` on `current_user` instead of minting real Clerk JWTs — same code path the real routes hit, just stubbed identity. Throwaway DB via `STORYFORGE_DB` env var. Runs standalone (`.venv/bin/python -m tests.test_isolation`); pytest scaffolding deferred to M0. **Result**: 22/22 pass — A's row invisible to B in list/detail/versions/gaps/source; B can't PATCH/DELETE/rerun A's rows; B can't attach to A's project; B's import to A's id → 409. **Postgres half (M3.2.1/.2/.3/.5)** still pending Neon signup.
- **2026-04-24 · M3.1.2 → M3.1.7** Auth wired end-to-end. Unsigned-in visitors hit `/sign-in`; the rest of the app is locked behind a Clerk session. **Backend**: new [auth/clerk.py](backend/auth/clerk.py) verifies JWTs locally via PyJWT against the JWKS at `<derived-issuer>/.well-known/jwks.json` (issuer derived by base64-decoding the publishable key — same algorithm Clerk's frontend SDK uses). PyJWKClient handles JWKS fetch + 1 h cache + key rotation; `aud` verification disabled because Clerk doesn't set the claim. New [auth/deps.py](backend/auth/deps.py): `current_user` FastAPI dep returns a frozen `CurrentUser(user_id, org_id, org_role)` dataclass. Routes wired three ways: router-level `dependencies=[Depends(current_user)]` for [extractions](backend/routers/extractions.py)/[projects](backend/routers/projects.py); inline `_user: Annotated[CurrentUser, Depends(current_user)]` on `/api/extract` + `/api/test-key`; `/api/health` left open. New dep: `pyjwt[crypto]>=2.8.0`. Deliberately *did not* use `clerk-sdk-python`/`clerk-backend-api` — JWKS verification is 30 lines of stable code, no point coupling to SDK release cadence. **Frontend**: `@clerk/clerk-react` v5.61.6 added. [main.jsx](frontend/src/main.jsx) wraps `<App>` in `<ClerkProvider>` via a `ClerkRouterAdapter` so navigation uses react-router's `navigate` (no full-page reloads). New [pages/SignInPage.jsx](frontend/src/pages/SignInPage.jsx) + [pages/SignUpPage.jsx](frontend/src/pages/SignUpPage.jsx) host Clerk's `<SignIn>`/`<SignUp>` widgets with path-based routing. [App.jsx](frontend/src/App.jsx) restructured: outer `App` is a route gate (`/sign-in/*`, `/sign-up/*` public; everything else wrapped in `<SignedIn>`/`<SignedOut>` with redirect-to-sign-in fallback); inner `AuthedApp` holds the existing studio logic + a `useEffect(setTokenGetter(getToken))` that wires every `api.*` call to attach `Authorization: Bearer <jwt>`. [api.js](frontend/src/api.js) refactored: new module-level `_tokenGetter` populated by `setTokenGetter` (avoids hook-ifying every call site); new `apiFetch` wrapper merges auth + BYOK + model headers on every request; `/api/health` skips auth header. [Sidebar.jsx](frontend/src/components/Sidebar.jsx) hardcoded "Bragadeesh" pill replaced with `<UserPill>`: Clerk's `<UserButton>` (avatar + manage-account + sign-out dropdown) + `useUser()` for name/email, `afterSignOutUrl="/sign-in"`. **Smoke ✓**: backend gates verified end-to-end (`/api/health` 200, `/api/extractions` 401 without bearer, 401 with bogus bearer); frontend builds clean (119 modules, 101.3 KB JS gzipped — +21 KB from Clerk SDK, acceptable). **Caveat**: signed-in users currently see *all* data (existing rows have `user_id="local"`); per-user data isolation lands in M3.2 with the Postgres migration + user_id columns. Browser flow needs your verification — sign in, run an extraction, sign out, sign back in, confirm Documents shows the run.
- **2026-04-24 · M3.1.1** Clerk app provisioned (`sweeping-fawn-26`). Test publishable + secret keys placed in gitignored `frontend/.env` and `backend/.env`. Secret verified via `GET https://api.clerk.com/v1/users` (200, empty list — no users yet, expected). Fixed a `==` typo in the Vite env file. Keys are test-mode; rotate post-session if you'd like to keep the blast radius minimal. Code wiring (M3.1.2 → M3.1.7) waits on user confirmation re: combined push + enabling Clerk Organizations upfront.
- **2026-04-24 · M3.0 (M3.4.1 + M3.4.2 + M3.4.3 + M3.5.1 + M3.5.3)** Local SaaS groundwork — schema stubs, encryption helper, real cost data. Lands ahead of auth so the rest of M3 can drop in cleanly. **New** [services/byok.py](backend/services/byok.py): Fernet-based `encrypt_secret`/`decrypt_secret`, `STORYFORGE_MASTER_KEY` env var (dev fallback generates ephemeral key + warns), lru-cached cipher, InvalidToken returns None for graceful key rotation. **New** [services/cost.py](backend/services/cost.py): `PRICING_USD_PER_M` table (Opus 4.7 / 4.6 $5/$25, Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5), `TokenUsage` dataclass, `compute_cost_cents` with cache-rate approximation (read at 10%, write at 125%). **Schema** ([db/models.py](backend/db/models.py)): two new tables both defaulting `user_id="local"` until M3.1 wires real users. `UserSettings(user_id PK, anthropic_key_encrypted, model_default, created_at, updated_at)` — schema only, no routes yet. `UsageLog(id PK, user_id, extraction_id FK, action, model, live, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cost_cents, ts)` — one row per LLM call, FK is nullable so non-extraction calls can log later. `create_all` picked up both tables on next startup; no ALTER needed. **[extract.py](backend/extract.py)** signature changed: `extract_requirements(...)` now returns `(ExtractionResult, TokenUsage | None)` — mock returns None usage; live calls extract `usage.input_tokens`/`output_tokens`/`cache_*` via `getattr` so missing cache fields don't crash. **[services/extractions.py](backend/services/extractions.py)** `call_claude` now returns `(result, model_used, usage)`; new `record_usage(...)` helper writes a UsageLog row in one call. **Routes** ([main.py](backend/main.py) `/api/extract`, [routers/extractions.py](backend/routers/extractions.py) `/rerun`) call `record_usage` after every extract — both real and mock-mode (mock logs as live=False, cost=0) so call counts stay accurate. Mock-mode usage is also recorded with cost=0. New dep: `cryptography>=42.0.0`. **M3.5.2 (decorator) skipped**: explicit `record_usage(...)` call is one line and easier to read at the route level than a decorator wrapper. **Smoke ✓**: byok round-trip (encrypt → decrypt → match; bad ct → None); cost compute (Sonnet 1k/500=1¢, Opus 1k/500=2¢, mock=0¢, Sonnet 100k/5k=38¢); live extract created `UsageLog(id=1, action=extract, model=sonnet, in=1522, out=551, cost=1¢)`; re-run created `UsageLog(id=2, action=rerun, in=1522, out=703, cost=2¢)`; total $0.03 for 2 calls. UsageLog rows survive after extraction delete (intentional — usage records what cost money even if the artifact is gone).
- **2026-04-24 · M2.7 (M2.7.1 + M2.7.2)** Server-backed search. **Backend** ([routers/extractions.py](backend/routers/extractions.py)): `?q=` now matches case-insensitive substrings against both `filename` and `json_extract(brief, '$.summary')` joined by `OR`. Tag search intentionally left out — JSON-array LIKE in SQLite is fiddly; revisit if usage shows demand. **Frontend** ([pages/Documents.jsx](frontend/src/pages/Documents.jsx)): replaced the client-side `useMemo` filter (which scanned in-memory `brief_summary`/`brief_tags`) with a 200 ms debounced effect that re-queries `listExtractions({q})`. Initial-load skeleton stays for the first fetch only; subsequent searches use a small inline `Spinner` next to the count badge so the list doesn't blank out while typing. The "no documents yet" hero now only shows when the store is genuinely empty (no query) — empty searches fall through to the inline "no matches for X" state. Header badge changes to "N matches" / "1 match" when a query is active. **M2 milestone complete (excluding deferred M2.4.2 + M2.6.3).** Smoke ✓: seeded 3 docs (Login, Refunds, ChEcKoUt), `q=cart` → 1 match (summary only), `q=admin` → 1 (summary), `q=checkout` → 1 (filename, case-insensitive), `q=zzznopenope` → 0. Build clean (58 modules, 79.8 KB JS / 2.0 KB CSS gzipped).
- **2026-04-24 · M2.6 (M2.6.1 + M2.6.2)** Versioning end-to-end. **Schema**: new `extraction.root_id` column (FK to `extraction.id`, nullable, indexed). v1 has `root_id=NULL`; every re-run carries `root_id=<original.id>` — *star* topology, not chain, so "list all versions" is a single query and a re-run-of-a-re-run still rolls up to the same root. Soft `ALTER TABLE` migration in [db/session.py](backend/db/session.py) reads `PRAGMA table_info(extraction)` and adds the column + index if missing — existing dev DBs migrate on next startup. **Backend**: new helpers in [services/extractions.py](backend/services/extractions.py) — `root_id_for(row)` (centralises the null-check), `list_versions(session, id)` (oldest-first, 1-indexed). New `call_claude(...)` wrapper that runs `extract_requirements` and translates Anthropic errors into HTTPExceptions in one place — both `/api/extract` and the new rerun route share it now ([main.py](backend/main.py) shed ~50 lines of duplicate try/except). New `ExtractionVersion` + `ExtractionRerunRequest` Pydantic schemas; `root_id` added to `ExtractionRecord` and `ExtractionSummary`. New routes in [routers/extractions.py](backend/routers/extractions.py): `GET /api/extractions/{id}/versions` (404 only when the id itself doesn't exist), `POST /api/extractions/{id}/rerun` (uses saved `raw_text`+`filename`, inherits `project_id`, applies the current request's API key + model). **Frontend**: [api.js](frontend/src/api.js) gains `rerunExtractionApi(id)` + `listVersionsApi(id)`. [TopBar](frontend/src/components/TopBar.jsx) refetches `/versions` on `extractionId` change; `VersionPicker` shows a clickable `v{N} of {total}` badge (hidden when total ≤ 1) with a popover dropdown listing every version (id, timestamp, model, Check on current). New "Re-run" button next to "New" — disabled while `rerunning || loading`, swaps label to "Re-running…" with the existing loading badge. [App.jsx](frontend/src/App.jsx) gains `rerunning` state, `handleRerun()` (calls `rerunExtractionApi`, opens new record), and `switchVersion(id)` (re-hydrates via `getExtraction` so no stale data sneaks in). Smoke ✓: v1 → re-run → v2 with `root_id=v1.id`; re-run on v2 → v3 also rooted at v1; versions endpoint returns chain oldest-first; orphan handling verified (delete root → surviving children renumber as v1/v2). Build clean (58 modules, 79.6 KB JS / 2.0 KB CSS gzipped). M2.6.3 (diff view) stays deferred to M5.
- **2026-04-24 · M2.5 (M2.5.1 → M2.5.4)** Projects fully wired in the UI. **AppContext** now exposes `{projects, projectsLoading, refreshProjects, projectById}` — fetched once on app mount via `listProjectsApi`, refreshed after every create/rename/delete/move so the sidebar, the row pill on Documents, and the Project page all stay in sync. **Sidebar** ([Sidebar.jsx](frontend/src/components/Sidebar.jsx)) gains a Projects section between Documents and Settings — uppercase label + +/× toggle on the right; click + opens an inline focused input (Enter submits, Esc/× cancels); each project renders as a NavLink with FolderClosed icon and `extraction_count` badge. Empty-state hint when no projects + not creating. **New page** [pages/Project.jsx](frontend/src/pages/Project.jsx) — header has a click-to-edit name (Edit icon hint, Enter saves, Esc cancels, blur commits), badge with extraction count, ghost "Delete project" button with confirm prompt (delete *detaches* extractions per the backend, not cascades). Body filters via `listExtractions({projectId})` — same row layout as Documents, plus a per-row "Remove from project" (X) action alongside the Trash. NotFound state when an unknown id loads. **Documents** ([pages/Documents.jsx](frontend/src/pages/Documents.jsx)) gets per-row pieces: an accent project pill (links to the project page on click), a `MoreHorizontal "…"` button that opens a `MoveMenu` popover anchored to the row (`position: relative` on the Card; full-screen click-catcher closes on outside click; Esc handler also closes). Menu lists all projects with a `Check` next to the current one, plus a "Remove from project" footer when assigned. Move calls `patchExtractionApi(id, {project_id})` and refreshes both the local rows and the projects cache so counts stay accurate. New `MoreHorizontal` icon in [icons.jsx](frontend/src/components/icons.jsx). New CSS rule extends `.row-action` hover-reveal to `.doc-row` (so the new "…" button uses the same fade pattern as the trash button). Smoke test ✓: create 2 projects → extract → move to P1 → list filters correctly → rename P1 → move to P2 → remove → delete both projects → extraction survives with `project_id=None`. Build clean: 58 modules, 79.0KB JS / 2.0KB CSS gzipped.
- **2026-04-24 · M2.3 (M2.3.1 → M2.3.3)** Source-file storage. Uploads land at `backend/uploads/<extraction_id>/<safe_filename>` (extraction id minted up front so the disk write happens *before* persist — a write failure 500s without orphaning a row). New helpers in [services/extractions.py](backend/services/extractions.py): `_safe_filename` (strip path separators + control chars, fall back to "uploaded"), `upload_dir_for` (path-traversal guard via `Path.resolve()` + root-prefix check), `save_upload`, `remove_upload_dir`. New `STORYFORGE_UPLOAD_DIR` env var (default `backend/uploads`). New `GET /api/extractions/{id}/source` in [routers/extractions.py](backend/routers/extractions.py) returns `FileResponse` with `mimetypes.guess_type`-derived content-type; explicit registrations for `.md`/`.markdown`/`.rst` since the platform db varies by host. 404 covers all three "nothing to show" cases (missing row, paste-mode extraction, file vanished). `delete_extraction` now calls `remove_upload_dir` post-delete (best-effort, non-blocking — the row is already gone). Smoke test ✓: upload→/source returns identical bytes (76/76, `text/plain; charset=utf-8`)→delete→directory removed→/source 404; paste-mode extraction returns 404 on /source as expected. No frontend wiring yet — a "Download original" button in the studio is a separate task.
- **2026-04-24 · M2.2 (M2.2.1 → M2.2.7) + M2.4 (M2.4.1, .3, .4, .5)** Full backend↔frontend swap — Documents view is now server-backed. **Backend** — new [models.py](backend/models.py) request/response schemas (`ExtractionRecord`, `ExtractionSummary`, `ExtractionPatch`, `ExtractionImport`, `GapStateRead`, `GapStatePatch`, `ProjectRead/Create/Patch`); new [services/extractions.py](backend/services/extractions.py) with `_mint_id()` matching the JS shape (`<prefix>_<base36-ts>_<rand6>`), Pydantic↔SQLModel converters, `persist_extraction`, `delete_extraction` (manual gap-state cascade); new [routers/extractions.py](backend/routers/extractions.py) — list/get/patch/delete + per-gap upsert + `POST /import` (idempotent migration endpoint, returns existing row on duplicate id); new [routers/projects.py](backend/routers/projects.py) — CRUD where delete *detaches* extractions rather than cascading. [main.py](backend/main.py) /api/extract now persists every run, recording `model_used="mock"` when no key was set, and returns the full `ExtractionRecord` (with id) so the frontend never has to round-trip again. Smoke test ✓ end-to-end: project create→list→delete; extraction create (live Sonnet)→list summary→get full→patch filename→delete (404 after); gap-state upsert; import idempotency (re-POST same id returns 201 with existing row). **Frontend** — [api.js](frontend/src/api.js) rewritten as a typed client (`listExtractionsApi`, `getExtractionApi`, `patchExtractionApi`, `deleteExtractionApi`, `importExtractionApi`, `listGapStatesApi`, `patchGapStateApi`, project CRUD, `health`, `testApiKey`); errors now carry `.status` so callers can branch on 404. [lib/store.js](frontend/src/lib/store.js) is a thin async wrapper — `listExtractions/getExtraction/deleteExtraction/insertExtraction/getGapStates/setGapState`. New [lib/migrate.js](frontend/src/lib/migrate.js) runs once on boot, pushes any leftover `storyforge:extractions` records to `/api/extractions/import` preserving original ids, only clears local on full success, sticky `storyforge:migrated:v1` flag prevents reruns. [App.jsx](frontend/src/App.jsx) `restoreExtraction` now branches: full record (e.g. fresh extraction) opens immediately; summary row triggers `getExtraction(id)` and toasts on 404. New `useEffect` calls `migrateLocalStorageOnce` and toasts results. [pages/Documents.jsx](frontend/src/pages/Documents.jsx) consumes `ExtractionSummary` rows (counts inline as `actor_count`/`story_count`/`gap_count`, search switched to `brief_summary`/`brief_tags`); added 4-row skeleton loader and an error card with a Retry button; delete fetches the full record first so undo can re-import via `insertExtraction`. [components/GapsRail.jsx](frontend/src/components/GapsRail.jsx) gap-state actions are now optimistic — write local state, call backend, settle on success or revert with an error toast on failure; mount effect uses an `alive` flag to ignore stale fetches when the user clicks between extractions. **M2.4.2 (react-query) deferred** — current surface (one list, one detail, optimistic gap patches) doesn't need a cache layer; revisit at M2.5/M2.6 when projects + versioning bring cross-page invalidation. Build clean: 57 modules, 249.9KB JS / 5.92KB CSS gzipped to 76.4KB / 2.0KB.
- **2026-04-23 · M2.1 (M2.1.1 → M2.1.5)** SQLite + SQLModel schema landed. New [backend/db/models.py](backend/db/models.py): `Project(id, name, created_at)`, `Extraction(id, filename, raw_text, model_used, live, project_id?, source_file_path?, created_at, brief, actors, stories, nfrs, gaps)` — structured payload as JSON columns; not normalised because we render as a unit, not query into. `GapState(extraction_id, gap_idx, resolved, ignored, asked_at, updated_at)` with composite PK. New [backend/db/session.py](backend/db/session.py): sync `Session` engine over `sqlite:///$STORYFORGE_DB` (default `backend/storyforge.db`), `init_db()` idempotent table-create, `get_session()` FastAPI dependency. [main.py](backend/main.py): added `lifespan` context manager that runs `init_db()` on startup. Bumped to v0.3.0. Verified — backend starts, log shows `DB ready at … — tables: ['extraction', 'gap_state', 'project']`, all 13 + 6 + 3 columns present. **M2.1.6 (alembic) deferred** — `create_all` is sufficient until M3's Postgres migration, where we'll set up alembic properly. M2.1 ships 5/6.
- **2026-04-23 · M0.4.1** New [README.md](README.md) at the repo root — what it does, quickstart (local + Docker), architecture diagram, tech stack table, env-var table, project-structure tree, dev workflow, common gotchas, and a roadmap section pointing at PROJECT.md. Repo no longer looks unmaintained from outside.
- **2026-04-23 · M1.9.1 + M1.9.2 + M1.9.3 + M1.7.3** Polish sub-module + tooltip sweep. **M1.9.1** verified all 3 list sections in ArtifactsPane have empty states. **M1.9.2**: severity filter row above active gaps in [GapsRail.jsx](frontend/src/components/GapsRail.jsx) — All / High / Medium / Low pills with per-bucket counts (only shown when more than 1 active gap; disabled when bucket count is 0). State resets when extraction changes. **M1.9.3**: shared [lib/clipboard.js](frontend/src/lib/clipboard.js) (`copyToClipboard` with execCommand fallback) used by both Story and Gap copy buttons. New `Copy` icon. New CSS rules `.has-action .row-action { opacity: 0 }` + `.has-action:hover .row-action { opacity: 1 }` give a generic hover-reveal pattern. StoryCard in [ArtifactsPane.jsx](frontend/src/components/ArtifactsPane.jsx) now has a top-right copy button → emits `### US-NN — actor / **As a** ... / criteria list / *Source: §x.y*` markdown. GapCard in GapsRail also has a copy button (uses the same markdown formatter as Ask but doesn't set askedAt). GapsRail dropped its inline copy helper. **M1.7.3**: tooltip sweep — IconButton primitive already wires `title`+`aria-label` from `label`; found one raw button (the × on the file chip in EmptyState) missing both, added them. 56 modules, +3.2KB JS, +0.3KB CSS.
- **2026-04-23 · M1.6.1 → M1.6.4** Full gap-action wiring. **Store** ([lib/store.js](frontend/src/lib/store.js)): new `getGapStates(extractionId)` / `setGapState(extractionId, gapIdx, patch)` / `clearGapStates(extractionId)`. Stored under `storyforge:gaps:<id>` per-extraction key. `deleteExtraction` also calls `clearGapStates`. **App.jsx**: now tracks `extractionId` alongside `extraction`; passed to `<GapsRail extractionId={...} />`. `restoreExtraction` signature changed to take the full record (so we get the id). **AppContext** + **Documents.jsx** updated to match. **GapsRail.jsx** rewritten: each gap card has Resolve / Ask stakeholder / Ignore actions (or just "Reopen" when resolved). Resolved gaps get a green "Resolved" badge + strike-through question + 0.65 opacity, sink to bottom of active list. Ignored gaps move to a collapsed "X ignored" dashed-button footer that expands on click and shows compact rows with a Restore link. Ask stakeholder formats a markdown block (Question/Severity/Source/Context), copies to clipboard via `navigator.clipboard.writeText` with `execCommand` fallback, sets `askedAt`, shows "Asked" info badge. Header subline now shows "X open · Y resolved · Z ignored" (success-green for resolved). Verified the gap-state store with a Node round-trip (8 assertions, including merge-preserve and delete-cascade). 55 modules, +3.8KB JS.
- **2026-04-23 · M1.5.1 + M1.5.2** Active tab pills with scroll-spy in [ArtifactsPane.jsx](frontend/src/components/ArtifactsPane.jsx). New `SECTIONS` constant (Brief / Actors / Stories / NFRs — dropped misleading Gaps tab since gaps live in the rail). Each section wrapper gets `id="sec-{id}"` + `data-section="{id}"` + `scrollMarginTop: 60` (so it lands below the sticky tab row). Pills now real `<button>`s — onClick: `scrollIntoView({behavior:'smooth'})` + `setActiveTab` + a 600ms `userClickRef` flag that suppresses the IntersectionObserver from flickering through every section the page passes during the smooth scroll. Active pill: white background + `--shadow-xs` (segmented-control look); count number turns accent-colored when active. The pill row is `position: sticky; top: 0` with a 4px shadow ring matching the page bg so it floats cleanly. IntersectionObserver: `root: containerRef.current`, `rootMargin: '-30% 0px -65% 0px'` (5% trigger band 30% down from top — typical scroll-spy pattern). 55 modules, +1.2KB JS.
- **2026-04-23 · M1.4.5 + M1.4.6** Theme picker + persistence boot. New `Monitor` icon. **App.jsx**: `theme` initialized from `getSettings().theme || 'light'`; `setTheme` setter persists via `setSettings({theme})`. New `useEffect` resolves `'system'` against `window.matchMedia('(prefers-color-scheme: dark)')` and listens for OS-level theme changes while `'system'` is active. `theme` + `setTheme` exposed via AppContext alongside `restoreExtraction` + `reset`. **Settings.jsx**: new `THEME_OPTIONS` (Light · Dark · System) + `ThemePicker` card-row component using `useApp().setTheme`. Each option pairs the radio dot with an `IconTile` (Sun/Moon/Monitor). TopBar's existing toggle still works (cycles light↔dark) and persists through the same setter. **M1.4 sub-module fully done (6/6).** 55 modules, +2.5KB JS.
- **2026-04-23 · M1.4.4** Model picker shipped end-to-end. **Backend** ([extract.py](backend/extract.py)): `extract_requirements(..., model=None)` resolves model in order header → `STORYFORGE_MODEL` env → `DEFAULT_MODEL` constant. Removed module-level `MODEL` constant. New `ALLOWED_MODELS` set for future validation. **Backend** ([main.py](backend/main.py)): new `X-Storyforge-Model` header on `/api/extract` passed through to extract_requirements. **Frontend** ([api.js](frontend/src/api.js)): adds `X-Storyforge-Model` header when set. **Frontend** ([Settings.jsx](frontend/src/pages/Settings.jsx)): new `MODEL_OPTIONS` array (Server default + Opus 4.7 + Sonnet 4.6 + Haiku 4.5) with descriptions, per-million pricing, and tone-coded badges (Best quality / Recommended / Fastest). New `ModelPicker` component renders card-style radio with accent-tinted selected state, click-to-select with toast confirmation, persists immediately to localStorage. Verified: bogus model id reaches Claude and surfaces the 404 message back to the user. 55 modules, +2.5KB JS.
- **2026-04-23 · M1.4.2 + M1.4.3** Full BYOK end-to-end. **Backend** ([extract.py](backend/extract.py), [main.py](backend/main.py)): `extract_requirements(filename, raw_text, api_key=None)` — header key takes precedence over env. New `POST /api/test-key` validates a key with one `client.models.list()` call (zero token usage), returns `{ok, models_visible, source}`. `/api/extract` now reads `X-Anthropic-Key` via FastAPI `Header(...)`. Auth-error message is now context-aware (says "Update key in Settings" when from header, "Check backend/.env" when from env). **Frontend**: new [lib/settings.js](frontend/src/lib/settings.js) (`getSettings`/`setSettings` against `localStorage['storyforge:settings']`), new `testApiKey(key)` in [api.js](frontend/src/api.js), and [extract](frontend/src/api.js) now sends the X-Anthropic-Key header when set. [Settings.jsx](frontend/src/pages/Settings.jsx) API section: masked input + Eye toggle, status dot ("Active" green / "Inactive" gray), "Test connection" / "Save" / "Remove" buttons, `<code>` styled X-Anthropic-Key chip with link to console.anthropic.com. Verified: bogus key → 401 with Settings hint; real key → 200 with model count. 55 modules, +3.3KB JS.
- **2026-04-23 · M1.4.1** New [pages/Settings.jsx](frontend/src/pages/Settings.jsx) — page header + 3 section cards (API · Model · Appearance) each with an `IconTile` (Shield blue / Sparkles purple / Sun amber), title, description, and a "Coming in M1.4.x" badge marking which task fills the section. Internal `Section` helper accepts `children` so M1.4.2/4/5 just slot inputs in. App.jsx: imports `Settings`, /settings route now renders `<Settings />`, dropped the `PlaceholderPage` helper (was only used here) and the `SettingsIcon` import. 54 modules, +1.2KB JS.
- **2026-04-23 · M1.3.6** Search box on [Documents.jsx](frontend/src/pages/Documents.jsx) — filters by filename, brief summary, or any tag (case-insensitive substring). Header badge shows `X of Y` while searching, raw count otherwise. Empty-search state shows "No documents match 'X'" with a "Clear search" link. Search input has accent focus ring + clear-X button when text exists. Bonus: fixed undo bug — `onDelete` now derives the original index from the unfiltered list so deleting from filtered results restores at the right position. **M1.3 sub-module fully done (6/6).**
- **2026-04-23 · M1.3.4** Hover-reveal delete on Documents rows. New `Trash` icon in [icons.jsx](frontend/src/components/icons.jsx). New `insertExtraction(record, atIndex)` in [lib/store.js](frontend/src/lib/store.js) — preserves original id, dedupes, capped. Card primitive now merges user `className`. Documents row gets `className="doc-row"` + a `<button class="row-delete">` with the trash icon (CSS rules in [styles.css](frontend/src/styles.css) hide it by default, fade in on row hover or button focus, danger-tinted on hover). Click → `e.stopPropagation()` (don't open the row), `deleteExtraction`, refresh state, fire 5s toast `Deleted "{filename}"` with **Undo** action that calls `insertExtraction(record, originalIdx)` and re-reads. Verified end-to-end with a Node round-trip — id preserved, position restored, defensive guards hold. 53 modules, +0.2KB CSS, +1KB JS.
- **2026-04-23 · M1.7.1 + M1.7.2** New [components/Toast.jsx](frontend/src/components/Toast.jsx): `<ToastProvider>` + `useToast()` hook, 4 tones (success/error/warn/info) with matching icon + accent border, optional action button (e.g. "Undo"), `dismiss()` for programmatic kill, auto-dismiss 4s default (Infinity supported), bottom-right stack with `aria-live=polite`. New `toast-in` keyframe in styles.css. Provider wired in [main.jsx](frontend/src/main.jsx) outside the Router. **Sweep**: removed `error` state from App.jsx, dropped `error` prop from EmptyState, deleted the inline error span + the `AlertCircle` import that was only feeding it. Failed extractions now surface as a red toast. 53 modules, +2.5KB JS, +0.1KB CSS.
- **2026-04-23 · M1.3.3** New tiny app context [lib/AppContext.jsx](frontend/src/lib/AppContext.jsx) with `<AppProvider>` + `useApp()` hook. Exposes `restoreExtraction(payload)` and `reset()`. App.jsx wraps the whole tree in the provider. Documents.jsx pulls `restoreExtraction` from the context, attaches `onClick={() => onOpen(r)}` on each row → sets the extraction state and `navigate('/')`. Card hover already telegraphed clickability; tooltip changed from "wires up later" to "Open {filename}". 52 modules, JS +0.4KB.
- **2026-04-23 · M1.3.2** New [pages/Documents.jsx](frontend/src/pages/Documents.jsx) renders the saved-extractions list. Each row: green/warn `IconTile` (live vs mock) + filename + relative `savedAt` (Just now / X mins ago / Yesterday / Apr 22 fallback) + actor count + story count + gap count (gap meta turns warn-color when >0) + Mock badge if not live. Header: title + count badge + primary "New extraction" button. Empty state: centered card with "No documents yet" + CTA. Card-hover lift. /documents route now renders `<Documents />` instead of the placeholder; unused `FileText` import dropped from App.jsx.
- **2026-04-23 · M1.3.1** New [lib/store.js](frontend/src/lib/store.js) with `saveExtraction` / `listExtractions` / `getExtraction` / `deleteExtraction` / `clearExtractions` / `countExtractions`. Records: `{id, filename, savedAt, payload}`. Cap 50, newest-first via `unshift` (no sort — back-to-back saves can share a millisecond). Quota-exceeded falls back to dropping the oldest 5. App.jsx now calls `saveExtraction(result)` after extraction; the dead `recents` state is gone. Verified with a Node localStorage shim — 8/8 assertions pass.
- **2026-04-23 · M1.2.3** Defensive `navigate('/')` on extraction success in [App.jsx](frontend/src/App.jsx) — guarantees the result view is shown even if extraction was triggered from `/documents` (future). The "redirect to last extraction" was already true via the `/` route's conditional render. **M1.2 sub-module fully done.**
- **2026-04-23 · M1.2.2 + M1.1.3** Sidebar `NavItem` now renders `<NavLink>`; clicking Documents / Settings navigates. Active styling driven by NavLink's `isActive` via a new `.nav-link` / `.nav-link.active` CSS class in [styles.css](frontend/src/styles.css) — JS hover handlers gone, `active` prop dropped from `<Sidebar>`. Bundle CSS 4.93KB → 5.32KB; JS unchanged.
- **2026-04-23 · M1.2.1** Installed `react-router-dom@7.14.2`, wrapped App in `BrowserRouter` ([main.jsx](frontend/src/main.jsx)), wired 3 routes in [App.jsx](frontend/src/App.jsx): `/` (home/extract), `/documents` (placeholder), `/settings` (placeholder), `*` → redirect to `/`. `+ New` (sidebar) and `New` (top bar) reset state and `navigate('/')`. GapsRail now also gated on `isHome`. Bundle: 180KB → 219KB JS (router adds ~38KB).
- **2026-04-23 · M1.1.2** Wired the kept sidebar items: search icon → `disabled` + tooltip "Search · coming soon"; `+ New` icon now calls `onNew={reset}` from App. Active state goes to `null` (no nav highlighted) on the empty-state screen, `Documents` once an extraction is loaded.
- **2026-04-23 · M1.1.1** Removed decorative sidebar items. Sidebar now shows: brand row (logo + name + search + new icons), Documents nav, Settings nav, user pill. Bundle dropped 184KB → 180KB JS.
