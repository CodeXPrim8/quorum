import { useEffect, useState } from 'react'
import { type AgentDevice, readAgentDevice, writeAgentDevice } from '../agents/agent-link'
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
import { currentScreen, subscribeScreen, type ScreenView } from '../agents/screen'
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
  const [devices, setDevices] = useState<AgentDevice[]>([])
  const [devicesLoaded, setDevicesLoaded] = useState(false)
  const [deviceId, setDeviceId] = useState(() => readAgentDevice() ?? '')
  const [, setTick] = useState(0)
  const [live, setLive] = useState<ScreenView>(currentScreen())
  const scope = computerScope()
  const view = computerView()
  const pending = computerPending()
  const active = state.desktop.sessionActive
  const plan = state.quorumAsk?.prompt
  const selected = devices.find((item) => item.id === deviceId) ?? null

  useEffect(() => subscribeComputer(() => setTick((n) => n + 1)), [])
  useEffect(() => subscribeScreen((next) => setLive(next)), [])

  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const response = await fetch('/api/agent/devices')
        if (!response.ok || stop) return
        const data = (await response.json()) as { devices?: AgentDevice[] }
        if (!stop) {
          setDevices(data.devices ?? [])
          setDevicesLoaded(true)
        }
      } catch {
        if (!stop) setDevicesLoaded(true)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 3000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!devicesLoaded) return
    const online = devices.filter((item) => item.online)
    if (online.length === 0) {
      if (deviceId) {
        setDeviceId('')
        writeAgentDevice(null)
      }
      return
    }
    const current = online.find((item) => item.id === deviceId)
    const next = current ?? online[0]
    if (!next || next.id === deviceId) return
    setDeviceId(next.id)
    writeAgentDevice(next.id)
  }, [devices, deviceId, devicesLoaded])

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
  const picture = live.kind === 'desktop' && live.image ? live.image : view?.image || ''
  const doing = (live.kind === 'desktop' && live.note) || view?.note || computerLog().at(-1)?.text || 'Opening the window from your instruction.'

  return (
    <div className={picture ? 'computer-panel is-live' : 'computer-panel'}>
      <section className="computer-agent">
        <p>
          <strong>Quorum Desktop. </strong>
          {selected?.online
            ? `${selected.name} is online. Allow computer use and Quorum will move that PC’s real mouse.`
            : 'Download Quorum Desktop and open the file. This website connects to that PC on its own.'}
        </p>
        {!selected?.online && (
          <a className="btn btn-primary" href="/api/agent/download">
            Download Quorum Desktop
          </a>
        )}
      </section>
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
        {picture ? (
          <>
            <img src={picture} alt="What Quorum is doing on the PC" />
            {active && doing && <p className="computer-caption">{doing}</p>}
          </>
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
