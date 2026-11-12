import { useState } from 'react'
import type { AppState, Command } from '../types'
import { formatWhen } from '../lib/format'

export function Calls({ state, dispatch, now }: { state: AppState; dispatch: (command: Command) => void; now: number }) {
  const calls = state.calls ?? []
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">No deal dropped</p>
          <h1>Call room</h1>
          <p className="lede">A customer who will not take the lowest price waits here until you call, or you approve an agent to call.</p>
        </div>
      </header>
      {calls.length === 0 ? (
        <div className="empty">
          <h2>No calls</h2>
          <p>When a WhatsApp customer refuses the lowest price, their number appears here.</p>
        </div>
      ) : (
        <ul className="plain">
          {calls.map((call) => (
            <CallRow key={call.id} call={call} dispatch={dispatch} now={now} />
          ))}
        </ul>
      )}
    </div>
  )
}

function CallRow({
  call,
  dispatch,
  now,
}: {
  call: NonNullable<AppState['calls']>[number]
  dispatch: (command: Command) => void
  now: number
}) {
  const [conclusion, setConclusion] = useState(call.conclusion ?? '')
  const [amount, setAmount] = useState(call.agreedAmount ?? '')
  const [voiceNote, setVoiceNote] = useState<string | undefined>()
  const waiting = call.status === 'approved_agent' || call.status === 'owner_calling'
  return (
    <li className="panel">
      <p className="fine">
        {call.name} · {call.phone}
        {call.item ? ` · ${call.item}` : ''} · {formatWhen(call.at, now)}
        {call.brief ? ` · ${call.brief}` : ''}
      </p>
      <p>
        {call.status === 'pending_approval' && 'Waiting for you to approve the call.'}
        {call.status === 'approved_agent' && 'Call this customer. An agent is approved to phone them.'}
        {call.status === 'owner_calling' && 'Call this customer yourself.'}
        {call.status === 'called' && 'Called.'}
      </p>
      {call.status === 'pending_approval' && (
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'DECIDE_CALL', callId: call.id, decision: 'agent' })}>
            Approve agents to call
          </button>
          <button type="button" className="btn" onClick={() => dispatch({ type: 'DECIDE_CALL', callId: call.id, decision: 'owner' })}>
            I will call the customer
          </button>
        </div>
      )}
      {waiting && (
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault()
            if (!conclusion.trim()) return
            dispatch({
              type: 'COMPLETE_CALL',
              callId: call.id,
              conclusion: conclusion.trim(),
              amount: amount.trim() || undefined,
              voiceNote,
            })
          }}
        >
          <label>
            What you agreed
            <textarea rows={3} value={conclusion} onChange={(event) => setConclusion(event.target.value)} placeholder="I spoke with the customer. They agreed to pay 850000." />
          </label>
          <label>
            Agreed price
            <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="850000" inputMode="decimal" />
          </label>
          <label>
            Voice note
            <input
              type="file"
              accept="audio/*"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file || file.size > 1_200_000) return
                const reader = new FileReader()
                reader.onload = () => setVoiceNote(typeof reader.result === 'string' ? reader.result : undefined)
                reader.readAsDataURL(file)
              }}
            />
          </label>
          <button type="submit" className="btn btn-primary">
            I’ve called
          </button>
        </form>
      )}
      {call.status === 'called' && (
        <p>
          {call.conclusion}
          {call.agreedAmount ? ` Agreed ${call.agreedAmount}.` : ''}
        </p>
      )}
    </li>
  )
}

export function CallPrompt({ state, dispatch }: { state: AppState; dispatch: (command: Command) => void }) {
  const call = (state.calls ?? []).find((item) => item.status === 'pending_approval')
  if (!call) return null
  return (
    <div className="wa-panel" style={{ position: 'fixed', right: '1rem', bottom: '1rem', zIndex: 20, width: 'min(360px, calc(100% - 2rem))', background: '#fff' }}>
      <strong>Call customer</strong>
      <p>
        {call.name} would not take the lowest price{call.item ? ` for the ${call.item}` : ''}. Number {call.phone}.
      </p>
      <div className="button-row">
        <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'DECIDE_CALL', callId: call.id, decision: 'agent' })}>
          Approve agents to call
        </button>
        <button type="button" className="btn" onClick={() => dispatch({ type: 'DECIDE_CALL', callId: call.id, decision: 'owner' })}>
          I will call the customer
        </button>
      </div>
    </div>
  )
}
