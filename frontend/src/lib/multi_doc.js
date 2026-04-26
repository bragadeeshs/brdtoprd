/* M7.5.c — pull per-doc names from a multi-doc raw_text.
 *
 * Backend stitches multi-doc inputs as:
 *   ===== DOC 1: spec.pdf =====
 *   <text>
 *
 *   ===== DOC 2: notes.docx =====
 *   <text>
 *
 * `parseDocNames(raw_text)` returns an array indexed by 1-based doc number
 * (so result[0] is "" — sentinel for `source_doc=0` = unknown / synthesized).
 * Single-doc inputs return [""] (no markers found).
 */

export function parseDocNames(rawText) {
  const out = ['']  // index 0 reserved for "synthesized / single-doc"
  if (!rawText) return out
  const re = /^=====\s*DOC\s+(\d+):\s*(.+?)\s*=====$/gm
  let m
  while ((m = re.exec(rawText)) !== null) {
    const idx = parseInt(m[1], 10)
    while (out.length <= idx) out.push('')
    out[idx] = m[2]
  }
  return out
}

/* Resolve a source_doc int to its display name (or empty string when not
 * applicable). 0 → "" (single-doc / synthesized — no badge needed). */
export function docNameFor(docNames, sourceDoc) {
  if (!sourceDoc || sourceDoc <= 0) return ''
  return docNames[sourceDoc] || `Doc ${sourceDoc}`
}
