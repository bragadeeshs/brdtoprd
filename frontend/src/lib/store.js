/**
 * Backend-backed extraction store (M2.4).
 *
 * Thin async wrapper over `../api.js`. Replaces the localStorage-based store
 * shipped in M1 — those responsibilities moved server-side in M2.1/M2.2.
 *
 * Records returned by `listExtractions` are now *summaries* (no `payload`,
 * no `raw_text`); call `getExtraction(id)` to hydrate the full record before
 * opening it in the studio.
 */

import {
  deleteExtractionApi,
  getExtractionApi,
  importExtractionApi,
  listExtractionsApi,
  listGapStatesApi,
  patchGapStateApi,
} from '../api.js'

// ---------- extractions ----------

/** Newest-first list of extractions (summary shape). */
export async function listExtractions(opts) {
  return listExtractionsApi(opts)
}

/** Full record by id, or null if 404. */
export async function getExtraction(id) {
  try {
    return await getExtractionApi(id)
  } catch (e) {
    if (e.status === 404) return null
    throw e
  }
}

/** Delete one. Cascades gap states server-side. */
export async function deleteExtraction(id) {
  return deleteExtractionApi(id)
}

/** Re-insert a full record (used by undo after delete). Idempotent. */
export async function insertExtraction(record) {
  // The backend `import` endpoint takes {id, filename, saved_at, payload}.
  // We pass the cached full record as the payload so it round-trips intact.
  return importExtractionApi({
    id: record.id,
    filename: record.filename,
    saved_at: record.created_at,
    payload: {
      filename: record.filename,
      raw_text: record.raw_text || '',
      live: !!record.live,
      brief: record.brief,
      actors: record.actors || [],
      stories: record.stories || [],
      nfrs: record.nfrs || [],
      gaps: record.gaps || [],
    },
  })
}

// ---------- per-gap state ----------

/** All gap states for an extraction as a {gapIdx: {resolved, ignored, askedAt}} map. */
export async function getGapStates(extractionId) {
  if (!extractionId) return {}
  const rows = await listGapStatesApi(extractionId)
  const out = {}
  for (const r of rows) {
    out[r.gap_idx] = {
      resolved: !!r.resolved,
      ignored: !!r.ignored,
      askedAt: r.asked_at,
    }
  }
  return out
}

/** Upsert one gap's state. Returns the new state in the {resolved, ignored, askedAt} shape. */
export async function setGapState(extractionId, gapIdx, patch) {
  if (!extractionId || gapIdx == null) return null
  // Translate camelCase patch -> snake_case API body.
  const body = {}
  if ('resolved' in patch) body.resolved = patch.resolved
  if ('ignored' in patch) body.ignored = patch.ignored
  if ('askedAt' in patch) body.asked_at = patch.askedAt
  const r = await patchGapStateApi(extractionId, gapIdx, body)
  return { resolved: !!r.resolved, ignored: !!r.ignored, askedAt: r.asked_at }
}
