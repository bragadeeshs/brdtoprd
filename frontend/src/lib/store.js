/**
 * StoryForge — local extractions store (M1.3.1)
 *
 * Persists completed extractions to localStorage so they survive page refreshes
 * and can be listed in the Documents view (M1.3.2). Single-tab, single-user;
 * the real backend store arrives in M2.
 *
 * Record shape:
 *   { id, filename, savedAt: ISO string, payload: ExtractionResult }
 */

const KEY = 'storyforge:extractions'
const CAP = 50

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(records) {
  try {
    localStorage.setItem(KEY, JSON.stringify(records))
  } catch (e) {
    // QuotaExceededError when the store fills the 5 MB localStorage budget.
    // Drop the oldest 5 and retry once. Beyond that we give up silently — by
    // M2 this lives in SQLite and the limit goes away.
    if (records.length > 5) {
      try {
        localStorage.setItem(KEY, JSON.stringify(records.slice(0, records.length - 5)))
      } catch {
        /* swallow — nothing more we can do */
      }
    }
  }
}

function uuid() {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 8)
  return `ext_${t}_${r}`
}

/** Save a completed extraction. Newest first; cap at 50. Returns the record. */
export function saveExtraction(payload) {
  if (!payload || typeof payload !== 'object') return null
  const record = {
    id: uuid(),
    filename: payload.filename || 'untitled',
    savedAt: new Date().toISOString(),
    payload,
  }
  const all = read()
  all.unshift(record)
  if (all.length > CAP) all.length = CAP
  write(all)
  return record
}

/** Newest-first list of saved extractions. Insertion order is trusted —
 *  saveExtraction unshifts so the array is always newest-first. Sorting on
 *  savedAt is unsafe because back-to-back saves can share a millisecond. */
export function listExtractions() {
  return read()
}

/** Lookup by id; null if missing. */
export function getExtraction(id) {
  return read().find((r) => r.id === id) || null
}

/** Remove one record by id. Also clears any per-gap state for that record. */
export function deleteExtraction(id) {
  write(read().filter((r) => r.id !== id))
  clearGapStates(id)
}

/** Insert a record at a specific index, preserving its original id.
 *  Used by undo flows after deleteExtraction. */
export function insertExtraction(record, atIndex = 0) {
  if (!record || !record.id) return
  const all = read()
  const idx = Math.max(0, Math.min(atIndex, all.length))
  // Skip if the record is somehow already present (defensive)
  if (all.some((r) => r.id === record.id)) return
  all.splice(idx, 0, record)
  if (all.length > CAP) all.length = CAP
  write(all)
}

/** Wipe the store (used by future migration to backend in M2.4.5). */
export function clearExtractions() {
  write([])
}

/** Storage budget signal for the Documents view header. */
export function countExtractions() {
  return read().length
}

/* =========================================================================
   Per-gap state (M1.6.1)
   Stored under a separate key per extraction:
     storyforge:gaps:<extractionId> -> { "0": {resolved, ignored, askedAt}, "1": ... }
   ========================================================================= */

const GAP_KEY = (extractionId) => `storyforge:gaps:${extractionId}`

/** All gap states for an extraction, as a {gapIdx: state} map. */
export function getGapStates(extractionId) {
  if (!extractionId) return {}
  try {
    const raw = localStorage.getItem(GAP_KEY(extractionId))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Merge a patch into one gap's state and write it back. Returns the new state. */
export function setGapState(extractionId, gapIdx, patch) {
  if (!extractionId || gapIdx == null) return null
  const all = getGapStates(extractionId)
  const next = { ...(all[gapIdx] || {}), ...patch }
  all[gapIdx] = next
  try {
    localStorage.setItem(GAP_KEY(extractionId), JSON.stringify(all))
  } catch {
    /* swallow quota errors — gap state is tiny, this won't happen in practice */
  }
  return next
}

/** Remove all gap state for an extraction (used by deleteExtraction). */
export function clearGapStates(extractionId) {
  if (!extractionId) return
  try {
    localStorage.removeItem(GAP_KEY(extractionId))
  } catch {
    /* ignore */
  }
}
