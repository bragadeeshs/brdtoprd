/**
 * Read a fetch() Response body as a Server-Sent Events stream and dispatch
 * each frame to `onEvent(name, data)`.
 *
 * Why not the built-in EventSource? It's GET-only and offers no way to set
 * Authorization headers or send a multipart body — we need both for the
 * /api/extract/stream endpoint (Clerk bearer + form-data file upload). So
 * we hand-roll a parser over the response body's ReadableStream.
 *
 * SSE framing recap:
 *   event: <name>\n
 *   data: <json or text>\n   (may repeat; concatenated with \n)
 *   \n                       ← blank line terminates the frame
 *
 * We tolerate: trailing whitespace, missing event: line (defaults to
 * "message"), `data:` with or without a leading space. We do NOT parse
 * `id:` or `retry:` (we don't reconnect — caller starts a new request on
 * failure).
 */
export async function readSSE(response, onEvent) {
  if (!response.body) throw new Error('Streaming not supported in this browser')

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buf = ''

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    // Split on the SSE record terminator (\n\n). Anything after the last
    // terminator stays in the buffer for the next chunk.
    let sepIdx
    while ((sepIdx = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, sepIdx)
      buf = buf.slice(sepIdx + 2)
      if (!block.trim()) continue

      let event = 'message'
      let dataLines = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
      }
      const dataStr = dataLines.join('\n')
      let data = dataStr
      if (dataStr) {
        try { data = JSON.parse(dataStr) } catch { /* keep as string */ }
      }
      onEvent(event, data)
    }
  }
}
