import { getSettings } from './lib/settings.js'

/** Build per-request headers from current settings (BYOK + model override). */
function authHeaders() {
  const { anthropicKey, model } = getSettings()
  const h = {}
  if (anthropicKey) h['X-Anthropic-Key'] = anthropicKey
  if (model) h['X-Storyforge-Model'] = model
  return h
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

  const res = await fetch('/api/extract', {
    method: 'POST',
    body: form,
    headers: authHeaders(),
  })
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
  const res = await fetch(`/api/extractions${qs ? `?${qs}` : ''}`)
  return jsonOrThrow(res)
}

/** Full record by id. Throws on 404. */
export async function getExtractionApi(id) {
  const res = await fetch(`/api/extractions/${encodeURIComponent(id)}`)
  return jsonOrThrow(res)
}

/** Delete one. Resolves on 204. */
export async function deleteExtractionApi(id) {
  const res = await fetch(`/api/extractions/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return jsonOrThrow(res)
}

/** Partial update (filename, project_id). */
export async function patchExtractionApi(id, patch) {
  const res = await fetch(`/api/extractions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return jsonOrThrow(res)
}

/** Bulk-import a localStorage record. Idempotent on the same id. */
export async function importExtractionApi(record) {
  const res = await fetch('/api/extractions/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  })
  return jsonOrThrow(res)
}

// ---------- gap state ----------

/** All gap states for an extraction (only persisted ones — others default to {}). */
export async function listGapStatesApi(extractionId) {
  const res = await fetch(
    `/api/extractions/${encodeURIComponent(extractionId)}/gaps`,
  )
  return jsonOrThrow(res)
}

/** Upsert one gap's state (resolved/ignored/asked_at). */
export async function patchGapStateApi(extractionId, gapIdx, patch) {
  const res = await fetch(
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
  const res = await fetch('/api/projects')
  return jsonOrThrow(res)
}

export async function createProjectApi(name) {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return jsonOrThrow(res)
}

export async function patchProjectApi(id, patch) {
  const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return jsonOrThrow(res)
}

export async function deleteProjectApi(id) {
  const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return jsonOrThrow(res)
}

// ---------- health + key test ----------

export async function health() {
  const res = await fetch('/api/health')
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
  return res.json()
}

/** Validate an arbitrary key by hitting /api/test-key. Throws on failure. */
export async function testApiKey(key) {
  const res = await fetch('/api/test-key', {
    method: 'POST',
    headers: key ? { 'X-Anthropic-Key': key } : {},
  })
  return jsonOrThrow(res)
}
