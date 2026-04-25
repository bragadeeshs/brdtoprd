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

/** Raise on non-2xx. Errors carry `.status` so callers can branch on it. */
async function jsonOrThrow(res) {
  if (!res.ok) {
    const err = new Error(await readError(res))
    err.status = res.status
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
