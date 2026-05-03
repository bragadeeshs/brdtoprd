/**
 * M14.4 — ChatPanel: floating chat surface for the open dossier.
 *
 * Mounted by DossierPane as a fixed-position pane in the bottom-right of
 * the studio. Two states:
 *   - Collapsed: small "Ask anything about this document" pill (always visible)
 *   - Expanded: full chat panel with message history + input + starter
 *               buttons (Counter-doc / Meeting prep / What if)
 *
 * Streaming: the assistant reply text streams into a live message bubble
 * via SSE; the panel keeps the bubble updating with each `text` event,
 * then reconciles with the persisted message on `complete`.
 *
 * Per-extraction conversation: messages persist server-side (M14.4
 * ChatMessage table). Coming back tomorrow restores the thread. Clear
 * resets it.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { clearChatApi, listChatMessagesApi, sendChatMessageStream } from '../../api.js'
import { useToast } from '../Toast.jsx'

export default function ChatPanel({ extractionId }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  // The in-flight assistant message — its `content` grows as `text` events
  // arrive. On `complete`, we replace it with the persisted version.
  const [streamingText, setStreamingText] = useState('')
  const abortRef = useRef(null)
  const scrollRef = useRef(null)

  // Load history when the panel opens for the first time on this extraction.
  useEffect(() => {
    if (!open || !extractionId) return
    let cancelled = false
    setLoadingHistory(true)
    listChatMessagesApi(extractionId)
      .then((rows) => { if (!cancelled) setMessages(rows || []) })
      .catch(() => { /* unauthed → already toasted; transient → leave empty */ })
      .finally(() => { if (!cancelled) setLoadingHistory(false) })
    return () => { cancelled = true }
  }, [open, extractionId])

  // Reset when extraction changes.
  useEffect(() => {
    setMessages([])
    setStreamingText('')
    setDraft('')
  }, [extractionId])

  // Auto-scroll to bottom when messages change or text streams in.
  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, streamingText, open])

  const send = useCallback(async (content) => {
    const trimmed = (content ?? draft).trim()
    if (!trimmed || streaming || !extractionId) return
    setDraft('')
    setStreaming(true)
    setStreamingText('')
    // Optimistically render the user message.
    const optimisticUser = {
      id: `optimistic_${Date.now()}`,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticUser])

    const controller = new AbortController()
    abortRef.current = controller
    try {
      const final = await sendChatMessageStream(extractionId, trimmed, {
        onText: ({ delta }) => setStreamingText((t) => t + delta),
        signal: controller.signal,
      })
      if (final) {
        setMessages((prev) => [...prev, final])
      }
    } catch (e) {
      if (e?.name !== 'AbortError') {
        toast.error(e.message || 'Chat failed')
      }
    } finally {
      setStreaming(false)
      setStreamingText('')
      abortRef.current = null
    }
  }, [draft, streaming, extractionId, toast])

  const stop = () => abortRef.current?.abort()

  const clear = async () => {
    if (streaming) return
    if (!confirm('Clear the chat thread for this document?')) return
    try {
      await clearChatApi(extractionId)
      setMessages([])
      toast.success('Chat cleared')
    } catch (e) {
      toast.error(e.message || 'Clear failed')
    }
  }

  // M14.4 starter prompts — drafters as pre-filled questions, not separate
  // pipelines. M14.4.b can elevate them to one-click buttons that auto-send.
  const starters = [
    { label: 'Draft response', prompt: 'Draft a response email to the author covering the open questions and decisions in this document.' },
    { label: 'Meeting prep', prompt: 'Generate a 30-minute meeting agenda + 8 questions to lead with, based on this document.' },
    { label: 'What if', prompt: 'What if we negotiated the proposed terms down by 20%? Walk through the likely impact section by section.' },
  ]

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 50,
          padding: '12px 18px',
          borderRadius: 999,
          background: 'var(--accent-strong)',
          color: '#fff',
          border: 0,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: 'var(--shadow-lg)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
        }}
        aria-label="Open chat"
      >
        <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>💬</span>
        Ask anything about this document
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 50,
        width: 'min(440px, calc(100vw - 40px))',
        height: 'min(620px, calc(100vh - 100px))',
        background: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg-subtle)',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', flex: 1 }}>
          Ask the document
        </span>
        {messages.length > 0 && (
          <button type="button" onClick={clear} disabled={streaming} style={iconBtn} title="Clear chat">
            Clear
          </button>
        )}
        <button type="button" onClick={() => setOpen(false)} style={iconBtn} aria-label="Close chat">
          ✕
        </button>
      </header>

      {/* Message list */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && !loadingHistory && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.55, textAlign: 'center', marginTop: 12 }}>
            Ask anything about this document — explanations, drafts, what-ifs.
            Lucid has the full source text + dossier in context.
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} role={m.role} content={m.content} />
        ))}
        {streaming && (
          <MessageBubble role="assistant" content={streamingText || '…'} isStreaming />
        )}
      </div>

      {/* Starter prompts */}
      {messages.length === 0 && !streaming && (
        <div style={{ padding: '0 16px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {starters.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => send(s.prompt)}
              style={starterBtn}
              title={s.prompt}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send() }}
        style={{
          padding: '10px 12px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          background: 'var(--bg-subtle)',
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Ask anything…"
          rows={1}
          disabled={streaming}
          style={{
            flex: 1,
            resize: 'none',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '8px 10px',
            fontSize: 13.5,
            lineHeight: 1.5,
            outline: 'none',
            background: 'var(--bg-elevated)',
            color: 'var(--text-strong)',
            fontFamily: 'inherit',
            minHeight: 36,
            maxHeight: 120,
          }}
        />
        {streaming ? (
          <button type="button" onClick={stop} style={sendBtn}>Stop</button>
        ) : (
          <button type="submit" disabled={!draft.trim()} style={sendBtn}>Send</button>
        )}
      </form>
    </div>
  )
}

function MessageBubble({ role, content, isStreaming }) {
  const isUser = role === 'user'
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          maxWidth: '88%',
          padding: '8px 12px',
          borderRadius: 'var(--radius)',
          background: isUser ? 'var(--accent-strong)' : 'var(--bg-subtle)',
          color: isUser ? '#fff' : 'var(--text-strong)',
          fontSize: 13.5,
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          border: isUser ? 'none' : '1px solid var(--border)',
        }}
      >
        {content}
        {isStreaming && (
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 8,
              height: 14,
              marginLeft: 2,
              background: 'var(--text-muted)',
              animation: 'blink 1s step-end infinite',
              verticalAlign: 'text-bottom',
            }}
          />
        )}
      </div>
    </div>
  )
}

const iconBtn = {
  background: 'transparent',
  border: 0,
  padding: '4px 8px',
  fontSize: 12,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  borderRadius: 'var(--radius-sm)',
}

const starterBtn = {
  padding: '5px 10px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-muted)',
  fontSize: 11.5,
  fontWeight: 500,
  cursor: 'pointer',
}

const sendBtn = {
  padding: '8px 14px',
  borderRadius: 'var(--radius)',
  border: 0,
  background: 'var(--accent-strong)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  flexShrink: 0,
  height: 36,
}
