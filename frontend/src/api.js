/* ------------------------------------------------------------------ */
/* Token getter — App.jsx populates this on mount via useAuth().getToken.
   Stashed at module scope so the existing api.* functions stay
   sync-callable. Default returns null so calls before mount don't crash. */
let _tokenGetter = async () => null

export function setTokenGetter(fn) {
  _tokenGetter = fn || (async () => null)
}
/* ------------------------------------------------------------------ */

/** Build per-request headers — just the Clerk bearer.
 *
 *  As of M3.4.5, BYOK key + model_default are stored server-side per user
 *  and pulled at request time inside the route handlers. The frontend no
 *  longer needs to ferry them on every call. The single exception is
 *  `testApiKey` below, which deliberately sends X-Anthropic-Key for a
 *  one-shot key validation that doesn't touch the saved value. */
async function authHeaders() {
  const h = {}
  try {
    const token = await _tokenGetter()
    if (token) h['Authorization'] = `Bearer ${token}`
  } catch {
    /* getToken can throw on session expiry; let the request proceed and 401 */
  }
  return h
}

/**
 * Wrapper around fetch that always attaches auth headers.
 * Call sites pass `headers` for content-type or extras; auth is merged in.
 */
async function apiFetch(path, { headers, ...rest } = {}) {
  const auth = await authHeaders()
  return fetch(path, { ...rest, headers: { ...auth, ...(headers || {}) } })
}

async function readError(res) {
  let detail = `${res.status} ${res.statusText}`
  try {
    const body = await res.json()
    if (body?.detail) detail = body.detail
  } catch {
    /* not JSON */
  }
  return detail
}

/** Raise on non-2xx. Errors carry `.status` so callers can branch on it.
 *
 *  M3.5: paywall responses use a structured `detail: {paywall: true, ...}`
 *  shape (see services/limits.py + DECISIONS.md). When detected, we attach
 *  the whole payload to `err.paywall` so callers can show the upgrade modal
 *  without re-parsing the message string. */
async function jsonOrThrow(res) {
  if (!res.ok) {
    let body = null
    try { body = await res.json() } catch { /* not JSON */ }
    const detail = body?.detail
    const isPaywall = detail && typeof detail === 'object' && detail.paywall === true
    const message = isPaywall
      ? (detail.message || 'Plan limit reached')
      : (typeof detail === 'string' ? detail : `${res.status} ${res.statusText}`)
    const err = new Error(message)
    err.status = res.status
    if (isPaywall) err.paywall = detail
    throw err
  }
  if (res.status === 204) return null
  return res.json()
}

// ---------- extraction ----------

/** Create a new extraction. Backend persists and returns the full ExtractionRecord. */
export async function extract({ file, text, filename, projectId } = {}) {
  const form = new FormData()
  if (file) form.append('file', file, file.name)
  if (text) form.append('text', text)
  if (filename) form.append('filename', filename)
  if (projectId) form.append('project_id', projectId)

  const res = await apiFetch('/api/extract', { method: 'POST', body: form })
  return jsonOrThrow(res)
}

/**
 * Streaming variant of extract (M5.3). Same input shape; instead of
 * returning the final record, dispatches SSE events through callbacks
 * and resolves with the final ExtractionRecord on `complete`.
 *
 * Pre-flight failures (paywall, oversize, bad file type) come back as
 * normal HTTPErrors *before* streaming starts (response.ok=false) — we
 * convert those via jsonOrThrow so callers get the same `err.paywall`
 * shape as the non-streaming endpoint. Stream-time errors (rate limit,
 * model crash) arrive as `error` SSE events and reject with the same
 * Error shape.
 *
 * Callbacks (all optional):
 *   onStart({id, filename})  — fired once when the server confirms
 *   onUsage({input, output, max}) — fired repeatedly as tokens arrive
 */
export async function extractStream({ file, text, filename, projectId } = {}, { onStart, onUsage } = {}) {
  const { readSSE } = await import('./lib/sse.js')

  const form = new FormData()
  if (file) form.append('file', file, file.name)
  if (text) form.append('text', text)
  if (filename) form.append('filename', filename)
  if (projectId) form.append('project_id', projectId)

  const res = await apiFetch('/api/extract/stream', { method: 'POST', body: form })
  if (!res.ok) {
    // Pre-flight error — let jsonOrThrow build the (possibly paywall) Error.
    return jsonOrThrow(res)
  }

  let finalRecord = null
  let streamError = null

  await readSSE(res, (name, data) => {
    if (name === 'start') onStart?.(data)
    else if (name === 'usage') onUsage?.(data)
    else if (name === 'complete') finalRecord = data
    else if (name === 'error') streamError = data
  })

  if (streamError) {
    const err = new Error(streamError.detail || 'Extraction failed')
    err.status = streamError.status || 500
    throw err
  }
  if (!finalRecord) throw new Error('Stream ended without a complete event')
  return finalRecord
}

/** List extraction summaries. Newest first. */
export async function listExtractionsApi({ q, projectId, limit, offset } = {}) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (projectId) params.set('project_id', projectId)
  if (limit != null) params.set('limit', String(limit))
  if (offset != null) params.set('offset', String(offset))
  const qs = params.toString()
  const res = await apiFetch(`/api/extractions${qs ? `?${qs}` : ''}`)
  return jsonOrThrow(res)
}

/** Full record by id. Throws on 404. */
export async function getExtractionApi(id) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(id)}`)
  return jsonOrThrow(res)
}

/** Delete one. Resolves on 204. */
export async function deleteExtractionApi(id) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return jsonOrThrow(res)
}

/** Partial update (filename, project_id). */
export async function patchExtractionApi(id, patch) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return jsonOrThrow(res)
}

/** Bulk-import a localStorage record. Idempotent on the same id. */
export async function importExtractionApi(record) {
  const res = await apiFetch('/api/extractions/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  })
  return jsonOrThrow(res)
}

/** Re-run extraction on the same source. Uses current header model + key. */
export async function rerunExtractionApi(id) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(id)}/rerun`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  return jsonOrThrow(res)
}

/** Regenerate one section (stories / nfrs / gaps) on the same row.
 *  Returns the updated full ExtractionRecord. The other sections + brief
 *  + actors stay as the user has them — the model treats them as stable
 *  context (M4.4). Counts as one Claude call against the user's quota. */
export async function regenSectionApi(id, section) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(id)}/regen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ section }),
  })
  return jsonOrThrow(res)
}

/** All versions in this extraction's chain. Oldest first, 1-indexed. */
export async function listVersionsApi(id) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(id)}/versions`)
  return jsonOrThrow(res)
}

// ---------- gap state ----------

export async function listGapStatesApi(extractionId) {
  const res = await apiFetch(
    `/api/extractions/${encodeURIComponent(extractionId)}/gaps`,
  )
  return jsonOrThrow(res)
}

export async function patchGapStateApi(extractionId, gapIdx, patch) {
  const res = await apiFetch(
    `/api/extractions/${encodeURIComponent(extractionId)}/gaps/${gapIdx}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  )
  return jsonOrThrow(res)
}

// ---------- projects ----------

export async function listProjectsApi() {
  const res = await apiFetch('/api/projects')
  return jsonOrThrow(res)
}

export async function createProjectApi(name) {
  const res = await apiFetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return jsonOrThrow(res)
}

export async function patchProjectApi(id, patch) {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return jsonOrThrow(res)
}

export async function deleteProjectApi(id) {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return jsonOrThrow(res)
}

// ---------- user settings (M3.4.4) ----------

/** Returns `{anthropic_key_set, anthropic_key_preview, model_default, updated_at}`.
 *  Never includes the raw key — server only sends the masked tail. */
export async function getMeSettingsApi() {
  const res = await apiFetch('/api/me/settings')
  return jsonOrThrow(res)
}

/**
 * PUT /api/me/settings. Field semantics:
 *   undefined → don't include in body (no change)
 *   null      → don't include (treated as no change client-side too)
 *   ""        → clear the field server-side
 *   string    → set
 */
export async function putMeSettingsApi({ anthropicKey, modelDefault } = {}) {
  const body = {}
  if (anthropicKey !== undefined && anthropicKey !== null) body.anthropic_key = anthropicKey
  if (modelDefault !== undefined && modelDefault !== null) body.model_default = modelDefault
  const res = await apiFetch('/api/me/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return jsonOrThrow(res)
}

// ---------- plan + usage period (M3.5) ----------

/** Lightweight plan + this-period usage. Drives the sidebar usage bar. */
export async function getMePlanApi() {
  const res = await apiFetch('/api/me/plan')
  return jsonOrThrow(res)
}

// ---------- billing: checkout + portal (M3.6) ----------

/** Mint a Lemon Squeezy hosted-checkout URL for the current user.
 *  Frontend window.location's to the returned URL — LSQ takes it from there. */
export async function createCheckoutApi({ tier, interval = 'monthly' }) {
  const res = await apiFetch('/api/me/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier, interval }),
  })
  return jsonOrThrow(res)  // { url }
}

/** Get the LSQ customer-portal URL — manage card / cancel / view invoices.
 *  404 if user has never subscribed; caller should hide the entry point in that case. */
export async function getPortalApi() {
  const res = await apiFetch('/api/me/portal')
  return jsonOrThrow(res)  // { url }
}

// ---------- account: usage + legacy + export (M3.8) ----------

/** Usage aggregates: this_month, all_time, by_model, last_extraction_at. */
export async function getMeUsageApi() {
  const res = await apiFetch('/api/me/usage')
  return jsonOrThrow(res)
}

/** Counts of orphan `user_id='local'` rows still in the DB. */
export async function getMeLegacyApi() {
  const res = await apiFetch('/api/me/legacy')
  return jsonOrThrow(res)
}

/** One-shot reassign all `user_id='local'` rows to the calling user. */
export async function adoptLegacyApi() {
  const res = await apiFetch('/api/me/legacy/adopt', { method: 'POST' })
  return jsonOrThrow(res)
}

/**
 * Trigger the GDPR export. Streams a ZIP — we read it as a Blob and let the
 * browser save via a synthesised <a download>. Returns nothing (side-effect).
 */
export async function downloadMeExport() {
  const res = await apiFetch('/api/me/export')
  if (!res.ok) {
    const err = new Error(await readError(res))
    err.status = res.status
    throw err
  }
  const blob = await res.blob()
  // Honor server-supplied filename if present.
  const cd = res.headers.get('content-disposition') || ''
  const match = cd.match(/filename="([^"]+)"/)
  const filename = match ? match[1] : 'storyforge-export.zip'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ---------- health + key test ----------

/** Health endpoint is unauth-protected; skip the auth header to avoid noise. */
export async function health() {
  const res = await fetch('/api/health')
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
  return res.json()
}

/** Validate an arbitrary key by hitting /api/test-key. Throws on failure. */
export async function testApiKey(key) {
  const res = await apiFetch('/api/test-key', {
    method: 'POST',
    headers: key ? { 'X-Anthropic-Key': key } : {},
  })
  return jsonOrThrow(res)
}
