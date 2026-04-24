/**
 * One-shot localStorage → backend migration (M2.4.5).
 *
 * Reads any extractions left over from M1's localStorage store, pushes each to
 * `/api/extractions/import`, then clears the local keys. Records keep their
 * original ids so the import endpoint is idempotent — a partial migration that
 * resumes never duplicates rows.
 */

import { importExtractionApi } from '../api.js'

const EXT_KEY = 'storyforge:extractions'
const GAP_KEY_PREFIX = 'storyforge:gaps:'
const FLAG_KEY = 'storyforge:migrated:v1'

function readExtractions() {
  try {
    const raw = localStorage.getItem(EXT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Wipe localStorage extraction + gap-state keys. Idempotent. */
function clearLocal() {
  try {
    localStorage.removeItem(EXT_KEY)
    // Sweep any per-extraction gap-state keys.
    const drop = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(GAP_KEY_PREFIX)) drop.push(k)
    }
    for (const k of drop) localStorage.removeItem(k)
  } catch {
    /* ignore */
  }
}

/**
 * Run once on app boot. Returns `{migrated, failed}` so the UI can toast the user.
 * Marks itself done via a sticky flag — reruns are skipped unless the flag is cleared.
 */
export async function migrateLocalStorageOnce() {
  if (localStorage.getItem(FLAG_KEY)) return { migrated: 0, failed: 0, skipped: true }

  const records = readExtractions()
  if (records.length === 0) {
    localStorage.setItem(FLAG_KEY, '1')
    return { migrated: 0, failed: 0, skipped: false }
  }

  let migrated = 0
  let failed = 0
  for (const r of records) {
    try {
      // Old shape: {id, filename, savedAt, payload: ExtractionResult}
      await importExtractionApi({
        id: r.id,
        filename: r.filename,
        saved_at: r.savedAt,
        payload: r.payload,
      })
      migrated += 1
    } catch (e) {
      console.warn('storyforge migrate: failed for', r.id, e)
      failed += 1
    }
  }

  // Only clear when every record was accepted — preserve unmigrated ones for retry.
  if (failed === 0) {
    clearLocal()
    localStorage.setItem(FLAG_KEY, '1')
  }
  return { migrated, failed, skipped: false }
}
