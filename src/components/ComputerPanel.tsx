import { useEffect, useState } from 'react'
import { endDesktopServerSession, startDesktopServerSession } from '../agents/desktop'
import {
  clearComputerSession,
  computerLog,
  computerPending,
  computerScope,
  computerView,
  decideComputerApproval,
  stopComputerBridge,
  subscribeComputer,
} from '../agents/computer'
import { UNTRUSTED_SCREEN } from '../computer/policy'
import type { AppState, Command } from '../types'

export function ComputerPanel({
  state,
  dispatch,
}: {
  state: AppState
  dispatch: (command: Command) => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [, setTick] = useState(0)
  const scope = computerScope()
  const view = computerView()
  const pending = computerPending()
  const active = state.desktop.sessionActive
  const plan = state.quorumAsk?.prompt

  useEffect(() => subscribeComputer(() => setTick((n) => n + 1)), [])

  const stop = async () => {
    setBusy(true)
    clearComputerSession()
    try {
      await stopComputerBridge()
      await endDesktopServerSession()
    } finally {
      dispatch({ type: 'END_DESKTOP_SESSION' })
      setBusy(false)
    }
  }

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      await startDesktopServerSession()
      dispatch({ type: 'SET_DESKTOP_AGENT', connected: true })
      dispatch({ type: 'START_DESKTOP_SESSION', mode: 'live' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Computer access could not start.')
    } finally {
      setBusy(false)
    }
  }

  const title = scope?.title || view?.title || 'Quorum'
  const doing = computerLog().at(-1)?.text || 'Opening the window from your instruction.'

  return (
    <div className="computer-panel">
      <header className="computer-toolbar">
        <span className={active ? 'computer-live is-on' : 'computer-live'} aria-hidden="true" />
        <p className="computer-address">{title}</p>
        {active ? (
          <button type="button" className="computer-stop" disabled={busy} onClick={() => void stop()}>
            Stop
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void start()}>
            Start
          </button>
        )}
      </header>
      <div className="computer-stage">
        {view?.image ? (
          <img src={view.image} alt={view.title || 'The window Quorum is using'} />
        ) : (
          <div className="computer-pick">
            <p>{active ? doing : 'Start computer access on this Windows PC.'}</p>
            {error && <p className="fine">{error}</p>}
          </div>
        )}
        {active && scope && (
          <p className="computer-using" role="status">
            <i />
            Quorum is using your Computer
          </p>
        )}
      </div>
      <footer className="computer-foot">
        {plan && (
          <p>
            <strong>Plan. </strong>
            {plan}
          </p>
        )}
        {scope && (
          <p>
            In scope: {scope.processName} — {scope.title}
          </p>
        )}
        <p className="fine">{UNTRUSTED_SCREEN} Screenshots stay in this session until you stop.</p>
        {pending && (
          <div className="computer-approve">
            <p>{pending.reason}</p>
            <button type="button" className="btn btn-primary" onClick={() => decideComputerApproval(true)}>
              Approve
            </button>
            <button type="button" className="btn" onClick={() => decideComputerApproval(false)}>
              Reject
            </button>
          </div>
        )}
        <ol className="computer-log">
          {computerLog().map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ol>
      </footer>
    </div>
  )
}
