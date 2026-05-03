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

/** Build the multipart form body shared by extract + extractStream.
 *  M7.5: `file` accepts a single File, an array of Files, or a FileList —
 *  each file is appended as a separate `file` form field, which FastAPI
 *  parses into a list[UploadFile] on the backend. Single-file uploads
 *  produce a one-element list (backward compatible). */
function buildExtractForm({ file, text, filename, projectId, lens } = {}) {
  const form = new FormData()
  const files = file == null ? [] : (Array.isArray(file) || file instanceof FileList) ? Array.from(file) : [file]
  for (const f of files) {
    if (f) form.append('file', f, f.name)
  }
  if (text) form.append('text', text)
  if (filename) form.append('filename', filename)
  if (projectId) form.append('project_id', projectId)
  // M14.1.b — lens dispatcher. Backend defaults to 'dossier' for new uploads
  // (the M14 narrated dossier); 'stories' kept for back-compat with any
  // caller that explicitly wants the legacy user-stories shape.
  if (lens) form.append('lens', lens)
  return form
}

/** Create a new extraction. Backend persists and returns the full ExtractionRecord. */
export async function extract({ file, text, filename, projectId, lens } = {}) {
  const res = await apiFetch('/api/extract', {
    method: 'POST',
    body: buildExtractForm({ file, text, filename, projectId, lens }),
  })
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
 *
 * M5.4.2 — pass `signal` (an AbortController.signal) to support a Stop
 * button. When aborted: fetch rejects, the SSE reader unwinds, we throw
 * an Error with `name: 'AbortError'` so the caller can show "Stopped"
 * instead of "Failed". Backend sees the disconnected client + cleans up
 * the Anthropic stream as the generator's `with` block exits.
 */
export async function extractStream(
  { file, text, filename, projectId, lens } = {},
  { onStart, onUsage, signal } = {},
) {
  const { readSSE } = await import('./lib/sse.js')

  const form = buildExtractForm({ file, text, filename, projectId, lens })
  const res = await apiFetch('/api/extract/stream', { method: 'POST', body: form, signal })
  if (!res.ok) {
    // Pre-flight error — let jsonOrThrow build the (possibly paywall) Error.
    return jsonOrThrow(res)
  }

  let finalRecord = null
  let streamError = null

  try {
    await readSSE(res, (name, data) => {
      if (name === 'start') onStart?.(data)
      else if (name === 'usage') onUsage?.(data)
      else if (name === 'complete') finalRecord = data
      else if (name === 'error') streamError = data
    })
  } catch (err) {
    // Abort flows through here as a DOMException with name "AbortError".
    // Re-throw with the standard contract so the caller can branch.
    if (err?.name === 'AbortError') throw err
    throw err
  }

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

// ============================================================================
// M14.4 — chat with a document
// ============================================================================

/** List the chat thread for an extraction. Returns array ordered by
 *  created_at ASC. */
export async function listChatMessagesApi(id) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(id)}/chat`)
  return jsonOrThrow(res)
}

/** Stream a chat reply. SSE events:
 *    onText({delta})   — partial text as it streams
 *    onComplete(msg)   — full assistant message persisted server-side
 *  Returns a Promise that resolves on `complete` or rejects on `error` /
 *  network failure. Pass an AbortController.signal to support a Stop button.
 */
export async function sendChatMessageStream(
  id,
  content,
  { onText, onComplete, signal } = {},
) {
  const { readSSE } = await import('./lib/sse.js')
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(id)}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
    signal,
  })
  if (!res.ok) return jsonOrThrow(res)
  let final = null
  await readSSE(res, (eventName, data) => {
    if (eventName === 'text') onText?.(data)
    else if (eventName === 'complete') {
      final = data
      onComplete?.(data)
    } else if (eventName === 'error') {
      const err = new Error(data.detail || 'Chat failed')
      err.status = data.status
      throw err
    }
  })
  return final
}

/** Clear all messages in the chat thread for an extraction. */
export async function clearChatApi(id) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(id)}/chat`, { method: 'DELETE' })
  if (!res.ok) await jsonOrThrow(res)
  return null
}

/** M4.5.3.b — mark an extraction as read for the calling user. Upserts
 *  the (user, extraction) ExtractionView row with last_seen_at = now.
 *  Returns nothing; subsequent GET /api/extractions/{id} responses will
 *  show unread_comment_count: 0 until a new comment lands. */
export async function markExtractionSeenApi(id) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(id)}/seen`, { method: 'POST' })
  if (!res.ok) await jsonOrThrow(res)
  return null
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

/** M6.1 — fetch a DOCX rendering of an extraction and trigger save.
 *  Server-side because python-docx is already installed (vs a 250 KB
 *  client-side lib). Returns nothing (side-effect: download). */
export async function downloadExtractionDocxApi(id) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(id)}/export.docx`)
  if (!res.ok) {
    const err = new Error(await readError(res))
    err.status = res.status
    throw err
  }
  const blob = await res.blob()
  const cd = res.headers.get('content-disposition') || ''
  const match = cd.match(/filename="([^"]+)"/)
  const filename = match ? match[1] : 'extraction.docx'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Download an original uploaded source file (M7.5.b — multi-doc).
 *
 *  Path: GET /api/extractions/{id}/sources/{idx} — 0-based index into
 *  `extraction.source_file_paths`. Backend either streams the file (local-
 *  disk) or 302-redirects to a presigned R2 URL (`fetch` follows the redirect
 *  with Authorization stripped on cross-origin, which is exactly what we
 *  want — the presign doesn't need auth).
 *
 *  Filename comes from Content-Disposition. Returns nothing (side-effect:
 *  triggers a browser download). Throws on non-2xx so callers can toast.
 */
export async function downloadExtractionSourceApi(id, idx, fallbackName = 'source') {
  const res = await apiFetch(
    `/api/extractions/${encodeURIComponent(id)}/sources/${idx}`,
  )
  if (!res.ok) {
    const err = new Error(await readError(res))
    err.status = res.status
    throw err
  }
  const blob = await res.blob()
  const cd = res.headers.get('content-disposition') || ''
  const match = cd.match(/filename="([^"]+)"/)
  const filename = match ? match[1] : fallbackName
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
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

// ---------- share links (M4.6) ----------

/** Get the active share token for an extraction, or null if none exists.
 *  Owner-side; requires Clerk auth + ownership of the extraction. */
export async function getShareApi(extractionId) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(extractionId)}/share`)
  return jsonOrThrow(res)
}

/** Create or rotate the share token. Any existing active token is revoked
 *  (single-active-token model). Returns the new {token, ...} record. */
export async function createShareApi(extractionId) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(extractionId)}/share`, {
    method: 'POST',
  })
  return jsonOrThrow(res)
}

/** Revoke all active tokens for this extraction. Idempotent. */
export async function revokeShareApi(extractionId) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(extractionId)}/share`, {
    method: 'DELETE',
  })
  if (!res.ok) await jsonOrThrow(res)
  return null
}

/** Public read of a shared extraction by token. NO auth header.
 *  We hit `fetch` directly (not apiFetch) so we don't accidentally send a
 *  stale Clerk JWT and confuse the public route. */
export async function fetchSharedExtraction(token) {
  const res = await fetch(`/api/share/${encodeURIComponent(token)}`)
  return jsonOrThrow(res)
}

// ---------- integrations: Jira (M6.2) ----------

/** Get the saved Jira connection for the current user, or null. The
 *  response carries `api_token_preview` (••••XYZK) but never the token
 *  itself — backend strips it. */
export async function getJiraConnectionApi() {
  const res = await apiFetch('/api/integrations/jira/connection')
  return jsonOrThrow(res)
}

/** Save / replace the Jira connection. Body: {base_url, email, api_token, default_project_key?}. */
export async function putJiraConnectionApi(body) {
  const res = await apiFetch('/api/integrations/jira/connection', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return jsonOrThrow(res)
}

/** M6.2.d — whether server-side Jira OAuth (CLIENT_ID/SECRET) is configured.
 *  Frontend uses this to decide whether to render the "Connect with
 *  Atlassian" button next to the existing API-token form. */
export async function getJiraOAuthStatusApi() {
  const res = await apiFetch('/api/integrations/jira/oauth/status')
  return jsonOrThrow(res)
}

/** Begin the Jira OAuth flow. Returns {url, state}; frontend redirects
 *  the browser to `url`. Atlassian's callback lands on
 *  /api/integrations/jira/oauth/callback (handled server-side) and then
 *  bounces back to /settings. */
export async function startJiraOAuthApi() {
  const res = await apiFetch('/api/integrations/jira/oauth/start', { method: 'POST' })
  return jsonOrThrow(res)
}

/** Delete the saved Jira connection. */
export async function deleteJiraConnectionApi({ scope = 'user' } = {}) {
  const res = await apiFetch(
    `/api/integrations/jira/connection?scope=${encodeURIComponent(scope)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) await jsonOrThrow(res)
  return null
}

/** List the user's Jira projects (live fetch — doubles as a "test
 *  connection" probe). 401 → token rejected; 502 → URL/network bad. */
export async function listJiraProjectsApi() {
  const res = await apiFetch('/api/integrations/jira/projects')
  return jsonOrThrow(res)
}

/** Push every story in the extraction as a Jira issue. Returns
 *  {pushed: [{story_id, issue_key, issue_url}], failed: [{story_id, error}]}.
 *
 *  M6.2.b: pass `create_subtasks: true` to also create one sub-task per
 *  acceptance criterion linked to each story's parent issue. */
export async function pushToJiraApi(
  extractionId,
  { project_key, issue_type = 'Story', create_subtasks = false },
) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(extractionId)}/push/jira`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_key, issue_type, create_subtasks }),
  })
  return jsonOrThrow(res)
}

// ---------- integrations: Linear (M6.3) ----------

/** Get the saved Linear connection (preview only — never the raw key). */
export async function getLinearConnectionApi() {
  const res = await apiFetch('/api/integrations/linear/connection')
  return jsonOrThrow(res)
}

/** Save / replace. Body: {api_key, default_team_id?}. */
export async function putLinearConnectionApi(body) {
  const res = await apiFetch('/api/integrations/linear/connection', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return jsonOrThrow(res)
}

export async function deleteLinearConnectionApi({ scope = 'user' } = {}) {
  const res = await apiFetch(
    `/api/integrations/linear/connection?scope=${encodeURIComponent(scope)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) await jsonOrThrow(res)
  return null
}

/** List teams (live fetch — doubles as test connection probe). */
export async function listLinearTeamsApi() {
  const res = await apiFetch('/api/integrations/linear/teams')
  return jsonOrThrow(res)
}

/** Push every story as a Linear issue. Same return shape as pushToJiraApi
 *  — issue_key carries Linear's identifier (e.g. ENG-42). */
export async function pushToLinearApi(extractionId, { team_id }) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(extractionId)}/push/linear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team_id }),
  })
  return jsonOrThrow(res)
}

// ---------- integrations: GitHub Issues (M6.4) ----------

export async function getGitHubConnectionApi() {
  const res = await apiFetch('/api/integrations/github/connection')
  return jsonOrThrow(res)
}

/** Save / replace. Body: {api_token, default_repo?}. */
export async function putGitHubConnectionApi(body) {
  const res = await apiFetch('/api/integrations/github/connection', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return jsonOrThrow(res)
}

export async function deleteGitHubConnectionApi({ scope = 'user' } = {}) {
  const res = await apiFetch(
    `/api/integrations/github/connection?scope=${encodeURIComponent(scope)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) await jsonOrThrow(res)
  return null
}

/** First 100 repos sorted by recent activity. Doubles as test-connection probe. */
export async function listGitHubReposApi() {
  const res = await apiFetch('/api/integrations/github/repos')
  return jsonOrThrow(res)
}

/** M6.4.b — list labels defined on a specific repo. One round-trip per
 *  repo pick; the frontend caches per (owner, repo). */
export async function listGitHubLabelsApi(owner, repo) {
  const qs = new URLSearchParams({ owner, repo }).toString()
  const res = await apiFetch(`/api/integrations/github/labels?${qs}`)
  return jsonOrThrow(res)
}

/** Push every story as a GitHub issue. issue_key uses `owner/repo#N`.
 *  M6.4.b: `labels` is an array of label names applied to every issue. */
export async function pushToGitHubApi(extractionId, { owner, repo, labels = [] }) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(extractionId)}/push/github`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, repo, labels }),
  })
  return jsonOrThrow(res)
}

// ---------- integrations: Slack (M6.6) ----------

export async function getSlackConnectionApi() {
  const res = await apiFetch('/api/integrations/slack/connection')
  return jsonOrThrow(res)
}

/** Save / replace. Body: {webhook_url, channel_label?}. */
export async function putSlackConnectionApi(body) {
  const res = await apiFetch('/api/integrations/slack/connection', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return jsonOrThrow(res)
}

export async function deleteSlackConnectionApi({ scope = 'user' } = {}) {
  const res = await apiFetch(
    `/api/integrations/slack/connection?scope=${encodeURIComponent(scope)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) await jsonOrThrow(res)
  return null
}

/** Send unresolved gaps to the connected Slack channel.
 *  Returns {posted_gap_count: number}. include_resolved=true to send all.
 *  M6.6.b: webhook_id picks one of the named additional destinations;
 *  omit/null to use the primary. */
export async function pushToSlackApi(
  extractionId,
  { include_resolved = false, webhook_id = null } = {},
) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(extractionId)}/push/slack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ include_resolved, webhook_id }),
  })
  return jsonOrThrow(res)
}

/** M6.6.b — list every Slack destination on the active connection.
 *  Returns [{id, name, webhook_url_preview, channel_label, is_primary}]. */
export async function listSlackWebhooksApi() {
  const res = await apiFetch('/api/integrations/slack/webhooks')
  return jsonOrThrow(res)
}

/** Add a named additional Slack destination. Body: {name, webhook_url, channel_label?}. */
export async function addSlackWebhookApi(body) {
  const res = await apiFetch('/api/integrations/slack/webhooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return jsonOrThrow(res)
}

/** Remove an additional destination by id. The primary is removed via
 *  the connection-level Disconnect (deleteSlackConnectionApi). */
export async function deleteSlackWebhookApi(webhookId) {
  const res = await apiFetch(
    `/api/integrations/slack/webhooks/${encodeURIComponent(webhookId)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) await jsonOrThrow(res)
  return null
}

// ---------- integrations: Notion (M6.5) ----------

export async function getNotionConnectionApi() {
  const res = await apiFetch('/api/integrations/notion/connection')
  return jsonOrThrow(res)
}

/** Save / replace. Body: {token, default_database_id?}. */
export async function putNotionConnectionApi(body) {
  const res = await apiFetch('/api/integrations/notion/connection', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return jsonOrThrow(res)
}

export async function deleteNotionConnectionApi({ scope = 'user' } = {}) {
  const res = await apiFetch(
    `/api/integrations/notion/connection?scope=${encodeURIComponent(scope)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) await jsonOrThrow(res)
  return null
}

/** Databases visible to the integration. Empty list usually means the
 *  user hasn't shared any databases with the integration in Notion yet. */
export async function listNotionDatabasesApi() {
  const res = await apiFetch('/api/integrations/notion/databases')
  return jsonOrThrow(res)
}

/** M6.5.b — full property list for one Notion database. Used by the
 *  push modal's mapping picker. Returns [{name, type}]. */
export async function getNotionDatabaseSchemaApi(databaseId) {
  const res = await apiFetch(
    `/api/integrations/notion/databases/${encodeURIComponent(databaseId)}/schema`,
  )
  return jsonOrThrow(res)
}

/** Push every story as a Notion page in `database_id`. `title_prop` comes
 *  back from listNotionDatabasesApi — we forward it unchanged so the
 *  backend doesn't have to re-fetch the database schema.
 *
 *  M6.5.b: `property_map` routes story fields into Notion columns:
 *    {actor: {name: "Actor", type: "select"}, criteria: {name: "AC", type: "multi_select"}}
 *  Empty/omitted = legacy behaviour (everything in body blocks).
 */
export async function pushToNotionApi(
  extractionId,
  { database_id, title_prop, property_map = {} },
) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(extractionId)}/push/notion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ database_id, title_prop, property_map }),
  })
  return jsonOrThrow(res)
}

// ---------- prompt templates (M7.1.b) ----------

export async function listPromptTemplatesApi() {
  const res = await apiFetch('/api/me/prompt-templates')
  return jsonOrThrow(res)
}

/** Body: {name, content, is_active?, org_id?} — pass org_id to create
 *  an org-shared template (must match your active Clerk org context). */
export async function createPromptTemplateApi(body) {
  const res = await apiFetch('/api/me/prompt-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return jsonOrThrow(res)
}

export async function patchPromptTemplateApi(id, patch) {
  const res = await apiFetch(`/api/me/prompt-templates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return jsonOrThrow(res)
}

export async function deletePromptTemplateApi(id) {
  const res = await apiFetch(`/api/me/prompt-templates/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) await jsonOrThrow(res)
  return null
}

// ---------- few-shot examples (M7.2) ----------

/** List the user's saved few-shot examples (enabled + disabled). */
export async function listFewShotExamplesApi() {
  const res = await apiFetch('/api/me/few-shot-examples')
  return jsonOrThrow(res)
}

/** Author by hand. Body: {name, input_text, expected_payload, enabled?}. */
export async function createFewShotExampleApi(body) {
  const res = await apiFetch('/api/me/few-shot-examples', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return jsonOrThrow(res)
}

/** Capture from an existing extraction. Primary UX path.
 *  Pass `org_id` to share with the active org (must match Clerk's
 *  active org context; backend rejects mismatches). */
export async function captureFewShotFromExtractionApi(extractionId, name, enabled = true, orgId = null) {
  const res = await apiFetch('/api/me/few-shot-examples/from-extraction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extraction_id: extractionId, name, enabled, org_id: orgId }),
  })
  return jsonOrThrow(res)
}

/** Patch any subset of name / input_text / expected_payload / enabled. */
export async function patchFewShotExampleApi(id, patch) {
  const res = await apiFetch(`/api/me/few-shot-examples/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return jsonOrThrow(res)
}

export async function deleteFewShotExampleApi(id) {
  const res = await apiFetch(`/api/me/few-shot-examples/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) await jsonOrThrow(res)
  return null
}

// ---------- API tokens (M6.7) ----------

/** List the caller's API tokens (preview only — never plaintext). Includes
 *  revoked rows so users have a complete audit trail. Newest first. */
export async function listApiTokensApi() {
  const res = await apiFetch('/api/me/api-tokens')
  return jsonOrThrow(res)
}

/** Create a new API token. Response carries the plaintext ONCE — frontend
 *  must surface a "save this now — you won't see it again" UX.
 *  M6.7.b: `scope` is 'rw' (default, full access) or 'ro' (GET-only). */
export async function createApiTokenApi({ name, scope = 'rw' }) {
  const res = await apiFetch('/api/me/api-tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, scope }),
  })
  return jsonOrThrow(res)
}

/** Soft-revoke a token. The row stays in the list as 'Revoked' so
 *  bookmarked CI configs that still reference it get a clean 401. */
export async function revokeApiTokenApi(id) {
  const res = await apiFetch(`/api/me/api-tokens/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) await jsonOrThrow(res)
  return null
}

// ---------- comments (M4.5) ----------

/** All comments on an extraction. Oldest first. */
export async function listCommentsApi(extractionId) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(extractionId)}/comments`)
  return jsonOrThrow(res)
}

/** Create a comment on a specific artifact. target_kind: 'brief' | 'story'. */
export async function createCommentApi(extractionId, { target_kind, target_key = '', body }) {
  const res = await apiFetch(`/api/extractions/${encodeURIComponent(extractionId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_kind, target_key, body }),
  })
  return jsonOrThrow(res)
}

/** Edit own comment. Backend stamps edited_at. */
export async function patchCommentApi(commentId, body) {
  const res = await apiFetch(`/api/comments/${encodeURIComponent(commentId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  return jsonOrThrow(res)
}

/** Delete own comment. */
export async function deleteCommentApi(commentId) {
  const res = await apiFetch(`/api/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
  })
  if (!res.ok) await jsonOrThrow(res)
  return null
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
  const filename = match ? match[1] : 'lucid-export.zip'
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
