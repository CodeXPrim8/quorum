import { useState } from 'react'
import { markParts } from '../chat/threads'
import { documentOf, turnOf } from '../agents/writing'
import type { ChatMessage, Command, Company } from '../types'
import { QuorumDoc } from './QuorumDoc'

export function QuorumTurn({
  message,
  company,
  dispatch,
  canRetry,
}: {
  message: ChatMessage
  company: Company
  dispatch: (command: Command) => void
  canRetry: boolean
}) {
  const yours = message.authorId === 'owner'
  const turn = yours ? { note: message.text, document: undefined } : turnOf(message, company)
  const document = yours ? undefined : documentOf(message, company)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.text)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const text = (turn.note || document?.body || message.text).trim()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  const save = () => {
    const next = draft.trim()
    if (!next || next === message.text) {
      setEditing(false)
      setDraft(message.text)
      return
    }
    dispatch({ type: 'EDIT_OWNER_MESSAGE', messageId: message.id, text: next })
    setEditing(false)
  }

  return (
    <div className={yours ? 'quorum-turn is-you' : 'quorum-turn'}>
      {editing ? (
        <div className="quorum-edit">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Edit message"
            rows={Math.min(8, Math.max(2, draft.split('\n').length))}
          />
          <div className="quorum-edit-row">
            <button type="button" className="btn" onClick={() => { setEditing(false); setDraft(message.text) }}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={!draft.trim()}>
              Send
            </button>
          </div>
        </div>
      ) : (
        <>
          {turn.note ? (
            <p className={yours ? 'quorum-bubble is-you' : 'quorum-bubble'}>
              {markParts(turn.note).map((part, index) =>
                part.strong ? <strong key={index}>{part.text}</strong> : <span key={index}>{part.text}</span>,
              )}
            </p>
          ) : null}
          {document && <QuorumDoc message={message} company={company} dispatch={dispatch} />}
          <div className="quorum-actions">
            <button type="button" className="quorum-action" aria-label={copied ? 'Copied' : 'Copy'} title={copied ? 'Copied' : 'Copy'} onClick={() => void copy()}>
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
            {yours && (
              <button type="button" className="quorum-action" aria-label="Edit" title="Edit" onClick={() => setEditing(true)}>
                <EditIcon />
              </button>
            )}
            {canRetry && (
              <button
                type="button"
                className="quorum-action"
                aria-label="Retry"
                title="Retry"
                onClick={() => dispatch({ type: 'RETRY_QUORUM', threadId: message.threadId })}
              >
                <RetryIcon />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="9" y="9" width="11" height="13" rx="2" />
      <rect x="4" y="2" width="11" height="13" rx="2" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 12l5 5L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16v4z" strokeLinejoin="round" />
    </svg>
  )
}

function RetryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 12a8 8 0 0 1 13.7-5.7L20 8" strokeLinecap="round" />
      <path d="M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16" strokeLinecap="round" />
      <path d="M4 20v-4h4" strokeLinecap="round" />
    </svg>
  )
}
