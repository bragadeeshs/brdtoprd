/* M7.6 — extraction diff helpers.
 *
 * Pure functions, no React, no fetch. Compute the difference between two
 * ExtractionRecord shapes (typically two rerun versions of the same source).
 *
 * Public surface:
 *   - diffExtractions(oldRec, newRec) → {brief, actors, stories, nfrs, gaps}
 *
 * Each section result has a normalized shape:
 *   {
 *     added:     [item, ...]        (in new, not in old)
 *     removed:   [item, ...]        (in old, not in new)
 *     changed:   [{old, new, fields}, ...]   (same key, different content)
 *     unchanged: [item, ...]        (same key + same content)
 *   }
 *
 * "Key" varies by section:
 *   - stories: id (US-NN, stable across reruns when the model keeps the
 *              same numbering — usually does)
 *   - nfrs:    category (no stable id; close enough — most reruns keep
 *              the same NFR categories)
 *   - gaps:    question (no stable id; near-identical questions are
 *              treated as "the same gap with edited context")
 *   - actors:  the actor string itself (set semantics)
 *
 * The unstable-key sections (nfrs, gaps) accept some false-positive
 * "removed + added" pairs when the model paraphrases the key field. We
 * accept that for v1 — adding stable IDs to nfrs/gaps is M4.5.2 territory.
 */

/* Generic list differ. `keyFn(item)` produces a stable join key.
 * `equalsFn(a, b)` returns true when two same-keyed items are unchanged
 * (default: deep JSON equality). When unequal, the result includes a
 * `fields` array listing which top-level keys differ.
 */
function diffByKey(oldList, newList, keyFn, equalsFn) {
  const eq = equalsFn || ((a, b) => JSON.stringify(a) === JSON.stringify(b))
  const oldByKey = new Map((oldList || []).map((it) => [keyFn(it), it]))
  const newByKey = new Map((newList || []).map((it) => [keyFn(it), it]))

  const added = []
  const removed = []
  const changed = []
  const unchanged = []

  for (const [k, newItem] of newByKey) {
    if (oldByKey.has(k)) {
      const oldItem = oldByKey.get(k)
      if (eq(oldItem, newItem)) {
        unchanged.push(newItem)
      } else {
        changed.push({ old: oldItem, new: newItem, fields: changedFields(oldItem, newItem) })
      }
    } else {
      added.push(newItem)
    }
  }
  for (const [k, oldItem] of oldByKey) {
    if (!newByKey.has(k)) removed.push(oldItem)
  }
  return { added, removed, changed, unchanged }
}

/* Which top-level keys differ between two objects. Uses JSON-stringify
 * comparison so nested arrays + objects work. Skips keys whose value is
 * the same in both. */
function changedFields(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})])
  const out = []
  for (const k of keys) {
    if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) out.push(k)
  }
  return out
}

export function diffStories(oldList, newList) {
  return diffByKey(oldList, newList, (s) => s.id || `__noid__${Math.random()}`)
}

export function diffNfrs(oldList, newList) {
  // Category as key — not stable but the best we have without M4.5.2 ids.
  // Empty categories collapse to a single bucket to avoid Map collisions.
  return diffByKey(oldList, newList, (n, i) => (n.category || `__empty${i}__`).toLowerCase())
}

export function diffGaps(oldList, newList) {
  // Question (lowercased, whitespace-collapsed) as key. Near-identical
  // questions (e.g. trailing punctuation) collide → treated as "changed".
  // Fully different questions → "removed + added" (acceptable false
  // positive when the regen rephrases).
  const norm = (g) => (g.question || '').trim().replace(/\s+/g, ' ').toLowerCase()
  return diffByKey(oldList, newList, norm)
}

/* Actors are bare strings; set semantics. */
export function diffActors(oldList, newList) {
  const oldSet = new Set(oldList || [])
  const newSet = new Set(newList || [])
  const added = (newList || []).filter((a) => !oldSet.has(a))
  const removed = (oldList || []).filter((a) => !newSet.has(a))
  const unchanged = (newList || []).filter((a) => oldSet.has(a))
  return { added, removed, changed: [], unchanged }
}

/* Brief is a single object; we report whether summary or tags changed. */
export function diffBrief(oldBrief, newBrief) {
  const o = oldBrief || { summary: '', tags: [] }
  const n = newBrief || { summary: '', tags: [] }
  const changed = []
  if (o.summary !== n.summary) changed.push('summary')
  if (JSON.stringify(o.tags || []) !== JSON.stringify(n.tags || [])) changed.push('tags')
  return { old: o, new: n, fields: changed }
}

export function diffExtractions(oldRec, newRec) {
  return {
    brief: diffBrief(oldRec.brief, newRec.brief),
    actors: diffActors(oldRec.actors, newRec.actors),
    stories: diffStories(oldRec.stories, newRec.stories),
    nfrs: diffNfrs(oldRec.nfrs, newRec.nfrs),
    gaps: diffGaps(oldRec.gaps, newRec.gaps),
  }
}

/* Convenience: render the per-section count badge (e.g. "+3 -1 ~2"). */
export function diffSummary(sec) {
  const parts = []
  if (sec.added?.length) parts.push(`+${sec.added.length}`)
  if (sec.removed?.length) parts.push(`-${sec.removed.length}`)
  if (sec.changed?.length) parts.push(`~${sec.changed.length}`)
  return parts.join(' ') || 'no changes'
}
