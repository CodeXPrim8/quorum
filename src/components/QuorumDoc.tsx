import { useEffect, useState } from 'react'
import { documentOf } from '../agents/writing'
import type { ChatMessage, Command, Company } from '../types'

export function QuorumDoc({
  message,
  company,
  dispatch,
}: {
  message: ChatMessage
  company: Company
  dispatch: (command: Command) => void
}) {
  const document = documentOf(message, company)
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(document?.body ?? '')
  useEffect(() => {
    if (!editing && document) setDraft(document.body)
  }, [document?.body, editing])
  if (!document) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(editing ? draft : document.body)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  const save = () => {
    dispatch({ type: 'EDIT_QUORUM_DOCUMENT', messageId: message.id, body: draft, title: document.title })
    setEditing(false)
  }

  const convert = () => {
    if (editing) save()
    dispatch({ type: 'MAKE_QUORUM_PDF', messageId: message.id })
  }

  return (
    <article className="quorum-doc">
      <header className="quorum-doc-bar">
        <div>
          <strong>{document.title}</strong>
          {document.preparedFor && <small>Prepared for {document.preparedFor}</small>}
        </div>
        <div className="quorum-doc-actions">
          <button type="button" className="quorum-doc-icon" aria-label={copied ? 'Copied' : 'Copy'} title={copied ? 'Copied' : 'Copy'} onClick={() => void copy()}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
          <button
            type="button"
            className="quorum-doc-icon"
            aria-label={editing ? 'Save' : 'Edit'}
            title={editing ? 'Save' : 'Edit'}
            onClick={() => (editing ? save() : setEditing(true))}
          >
            {editing ? <CheckIcon /> : <EditIcon />}
          </button>
          <button type="button" className="quorum-doc-pdf" onClick={convert}>
            Convert to PDF
          </button>
        </div>
      </header>
      {editing ? (
        <textarea className="quorum-doc-editor" value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Edit document" />
      ) : (
        <pre className="quorum-doc-body">{document.body}</pre>
      )}
    </article>
  )
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="9" y="9" width="11" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
