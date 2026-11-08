import { useEffect, useRef, useState } from 'react'
import { documentOf } from '../agents/writing'
import { endDesktopServerSession } from '../agents/desktop'
import { clearScreen, subscribeScreen, type ScreenView } from '../agents/screen'
import type { AppState, Command, QuorumScreen as ScreenFrame } from '../types'
import { PdfPreview } from './PdfPreview'
import { ComputerPanel } from './ComputerPanel'

export function QuorumScreen({
  state,
  dispatch,
}: {
  state: AppState
  dispatch: (command: Command) => void
}) {
  const [live, setLive] = useState<ScreenView>({ kind: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const sessionWasOn = useRef(state.desktop.sessionActive)
  useEffect(() => subscribeScreen(setLive), [])

  const stored = state.quorumScreen
  const usingDesk = Boolean(state.desktop.grantedQuorum || state.desktop.grantedStaffId)
  const view: ScreenView | ScreenFrame =
    usingDesk && (live.kind === 'desktop' || live.kind === 'idle')
      ? live.kind === 'desktop'
        ? live
        : { kind: 'desktop', image: '', width: 1280, height: 720, cursor: { x: 614, y: 302 } }
      : stored?.kind === 'pdf'
        ? stored
        : live.kind === 'desktop'
          ? live
          : live.kind !== 'idle'
            ? live
            : stored ?? { kind: 'idle' }
  const screenKey =
    stored?.kind === 'pdf'
      ? `pdf:${stored.messageId}:${state.chat.find((item) => item.id === stored.messageId)?.file?.name ?? ''}`
      : stored
        ? `${stored.kind}:${stored.kind === 'page' ? stored.url : stored.src}`
        : ''

  useEffect(() => {
    if (screenKey) setDismissed(false)
  }, [screenKey])
  useEffect(() => {
    if (state.desktop.grantedQuorum) setDismissed(false)
  }, [state.desktop.grantedQuorum])
  useEffect(() => {
    if (state.desktop.sessionActive && !sessionWasOn.current) setDismissed(false)
    sessionWasOn.current = state.desktop.sessionActive
  }, [state.desktop.sessionActive])

  const needed =
    !dismissed && (view.kind !== 'idle' || state.desktop.sessionActive || Boolean(state.desktop.grantedQuorum))

  const pdfMessage = view.kind === 'pdf' ? state.chat.find((item) => item.id === view.messageId) : undefined
  const pdfFile = pdfMessage?.file?.mime === 'application/pdf' ? pdfMessage.file : undefined
  const pdfDoc = pdfMessage && state.company ? documentOf(pdfMessage, state.company) : undefined

  const endSession = () => {
    void endDesktopServerSession().finally(() => dispatch({ type: 'END_DESKTOP_SESSION' }))
  }

  const close = () => {
    setDismissed(true)
    clearScreen()
    dispatch({ type: 'SET_QUORUM_SCREEN', screen: null })
  }

  if (!needed) return null

  if ((state.desktop.sessionActive || state.desktop.grantedQuorum) && view.kind !== 'pdf') {
    return (
      <aside className="quorum-screen" aria-label="Computer use">
        <ComputerPanel state={state} dispatch={dispatch} />
      </aside>
    )
  }

  const label =
    view.kind === 'page'
      ? hostOf(view.url)
      : view.kind === 'desktop'
        ? 'This computer'
        : view.kind === 'image'
          ? view.made
            ? 'Made for you'
            : 'Picture'
          : view.kind === 'pdf'
            ? view.title || pdfFile?.name || 'PDF'
            : 'This computer'

  return (
    <aside className="quorum-screen" aria-label="Quorum screen">
      <header className="quorum-screen-bar">
        <span className="quorum-screen-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="quorum-screen-url">{label}</span>
        <button type="button" className="quorum-screen-close" aria-label="Close screen" onClick={close}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      <div className={view.kind === 'pdf' ? 'quorum-screen-stage is-pdf' : 'quorum-screen-stage'}>
        {(view.kind === 'desktop' ||
          (view.kind === 'idle' && (state.desktop.grantedQuorum || state.desktop.grantedStaffId))) && (
          <DeskLive
            image={view.kind === 'desktop' ? view.image : undefined}
            width={view.kind === 'desktop' ? view.width : undefined}
            height={view.kind === 'desktop' ? view.height : undefined}
            cursor={view.kind === 'desktop' ? view.cursor : undefined}
            click={view.kind === 'desktop' ? view.click : undefined}
            using={Boolean(state.desktop.grantedQuorum || state.desktop.grantedStaffId)}
            alt={view.kind === 'desktop' ? view.note || 'This computer' : 'This computer'}
          />
        )}
        {view.kind === 'image' && <img src={view.src} alt={view.caption || 'Picture'} />}
        {view.kind === 'page' && view.image && (
          <div className="quorum-screen-page">
            <img src={view.image} alt={view.title || hostOf(view.url)} />
          </div>
        )}
        {view.kind === 'page' && !view.image && (
          <iframe title={view.title || view.url} src={view.url} sandbox="allow-scripts allow-forms allow-popups allow-same-origin" />
        )}
        {view.kind === 'pdf' && pdfDoc && state.company && (
          <PdfPreview
            input={{
              title: pdfDoc.title,
              kind: pdfDoc.kind,
              body: pdfDoc.body,
              brand: state.company.name,
              writerName: state.company.ownerName,
              writerTitle: state.company.ownerTitle,
              website: state.company.website,
              preparedFor: pdfDoc.preparedFor,
              date: new Date().toISOString().slice(0, 10),
            }}
          />
        )}
      </div>
      {view.kind === 'page' && (view.title || view.summary) && (
        <p className="quorum-screen-cap">{view.title || view.summary}</p>
      )}
      {view.kind === 'image' && view.caption && <p className="quorum-screen-cap">{view.caption}</p>}
      {view.kind === 'pdf' && pdfFile && (
        <footer className="quorum-screen-foot">
          <p>{label}</p>
          <a className="btn" href={pdfFile.dataUrl} download={pdfFile.name}>
            Download
          </a>
        </footer>
      )}
      {view.kind !== 'pdf' && state.desktop.sessionActive && (
        <footer className="quorum-screen-foot">
          <p>
            {state.desktop.grantedQuorum || state.desktop.grantedStaffId
              ? 'Quorum is using your Computer'
              : `Desktop session active · ${state.desktop.mode === 'live' ? 'Live' : 'Approved'}`}
          </p>
          <button type="button" className="btn" onClick={endSession}>
            End
          </button>
        </footer>
      )}
    </aside>
  )
}

function DeskLive({
  image,
  width,
  height,
  cursor,
  click,
  using,
  alt,
}: {
  image?: string
  width?: number
  height?: number
  cursor?: { x: number; y: number }
  click?: boolean
  using: boolean
  alt: string
}) {
  const ping = Boolean(click)
  const left = width && cursor ? `${(cursor.x / width) * 100}%` : '48%'
  const top = height && cursor ? `${(cursor.y / height) * 100}%` : '42%'
  const mouse = (
    <span className={ping ? 'desk-mouse is-click' : 'desk-mouse'} style={{ left, top }} aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24">
        <path
          d="M5 2.6v16.2l4.1-3.8 3.4 7.3 2.5-1.2-3.4-7.2L19 12.4z"
          fill="#fff"
          stroke="#17181f"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
  return (
    <div className={using ? 'desk-live is-using' : 'desk-live'}>
      {image ? (
        <div className="desk-frame">
          <img src={image} alt={alt} />
          {mouse}
        </div>
      ) : (
        <div className="desk-frame desk-frame-empty">{using || cursor ? mouse : null}</div>
      )}
      {using && (
        <p className="desk-using" role="status">
          <i />
          Quorum is using your Computer
        </p>
      )}
    </div>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

