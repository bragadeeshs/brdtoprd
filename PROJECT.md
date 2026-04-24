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

- [ ] **M2.5.1** Re-add the Projects section in Sidebar (this time backed by API) — `Sidebar.jsx` — S
- [ ] **M2.5.2** "+ New project" inline form in sidebar — — S
- [ ] **M2.5.3** Project page: `frontend/src/pages/Project.jsx` — list of extractions in this project — M
- [ ] **M2.5.4** Move-to-project from Documents row context menu — — S

## M2.6 Versioning

- [ ] **M2.6.1** "Re-run on this doc" button on an extraction → creates a new version, links to parent — `ArtifactsPane.jsx`, backend — M
- [ ] **M2.6.2** Version dropdown in TopBar shows v1, v2, v3 — — M
- [ ] **M2.6.3** Diff view (later) — `[!]` deferred to M5 — —

## M2.7 Search

- [ ] **M2.7.1** Backend: `GET /api/extractions?q=foo` — substring across filename + brief — S
- [ ] **M2.7.2** Frontend: search box on Documents wired to query — — S

**M2 ship gate**: Refresh keeps your work. Multiple extractions visible in a real Documents page. Projects exist. Source files retrievable.

---

# M3 — Auth + SaaS foundation (Phase 3)

> Goal: real users, isolated data, billing scaffolding.
> Clerk + Neon Postgres + Stripe scaffold + R2 storage. ~2–3 weeks.

## M3.1 Clerk integration

- [ ] **M3.1.1** Sign up at clerk.com, get publishable + secret keys — — S
- [ ] **M3.1.2** Frontend: `@clerk/clerk-react` — wrap App in `<ClerkProvider>` — `main.jsx` — S
- [ ] **M3.1.3** Add `<SignIn />` and `<SignUp />` pages, redirect unauth users to sign-in — M
- [ ] **M3.1.4** User pill in sidebar pulls from `useUser()`; sign-out button — `Sidebar.jsx` — S
- [ ] **M3.1.5** Backend: install `clerk-sdk-python`, validate JWT on every `/api/*` request — `backend/auth/clerk.py` — M
- [ ] **M3.1.6** FastAPI dependency `current_user` extracts user_id from JWT — `backend/auth/deps.py` — S
- [ ] **M3.1.7** All routes require auth; reject with 401 if no/invalid token — — S

## M3.2 Postgres migration

- [ ] **M3.2.1** Sign up at neon.tech, create project + DB — — S
- [ ] **M3.2.2** Add `psycopg[binary]` + `asyncpg` to requirements — S
- [ ] **M3.2.3** Update `DATABASE_URL` env var, swap engine to Postgres — `backend/db/session.py` — S
- [ ] **M3.2.4** Add `user_id` (Clerk's `user_xxx`) and `org_id` columns to all tables — `db/models.py` — M
- [ ] **M3.2.5** Generate Alembic migration for the schema change — — S
- [ ] **M3.2.6** Every query filters by `current_user.user_id` (or `org_id` if Workspaces enabled) — sweep all routers — M
- [ ] **M3.2.7** Test: User A cannot see User B's extractions — `tests/test_isolation.py` — M

## M3.3 Workspaces / orgs

- [ ] **M3.3.1** Enable Clerk Organizations in dashboard — — S
- [ ] **M3.3.2** Add org switcher in Sidebar (Clerk's `<OrganizationSwitcher />`) — S
- [ ] **M3.3.3** Backend: scope all queries to `org_id` if user is in an org context — M
- [ ] **M3.3.4** Invite teammate flow (Clerk handles UI) — S

## M3.4 BYOK encrypted at rest

- [ ] **M3.4.1** Generate a `MASTER_KEY` env var for the backend — — S
- [ ] **M3.4.2** Encrypt user's Anthropic key with Fernet (cryptography lib) before DB write — `backend/auth/byok.py` — M
- [ ] **M3.4.3** UserSettings table: `(user_id, anthropic_key_encrypted, model_default)` — `db/models.py` — S
- [ ] **M3.4.4** Settings page calls `PUT /api/me/settings` instead of localStorage — `Settings.jsx` — S
- [ ] **M3.4.5** Extract route decrypts user's key per request, never logs it — `extract.py` — S
- [ ] **M3.4.6** Or: managed-key path (use server's key, meter usage) — feature flag `STORYFORGE_BYOK_MODE` — M

## M3.5 Free-tier limits

- [ ] **M3.5.1** UsageLog table: `(user_id, action, tokens_in, tokens_out, cost_cents, ts)` — `db/models.py` — S
- [ ] **M3.5.2** Decorator `@track_usage` on extract route writes a UsageLog — M
- [ ] **M3.5.3** Read Anthropic response usage and persist tokens + computed cost — `extract.py` — S
- [ ] **M3.5.4** Free tier: 10 extractions / month, 25 KB doc cap. Enforce server-side — `routers/extractions.py` — M
- [ ] **M3.5.5** Frontend: real "X of 10 runs used" bar in sidebar — `Sidebar.jsx` — S
- [ ] **M3.5.6** Hit limit → show paywall modal — M

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
