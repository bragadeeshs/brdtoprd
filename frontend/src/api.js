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

export async function extract({ file, text, filename } = {}) {
  const form = new FormData()
  if (file) form.append('file', file, file.name)
  if (text) form.append('text', text)
  if (filename) form.append('filename', filename)

  const res = await fetch('/api/extract', {
    method: 'POST',
    body: form,
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

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
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}
