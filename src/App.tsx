import { useEffect, useState } from 'react'
import { holdMicrophone } from './agents/speak'
import { ActivityLog } from './components/ActivityLog'
import { Approvals } from './components/Approvals'
import { AgentDesk } from './agents/desk'
import { ChatView } from './components/ChatView'
import { IntegrationsPanel } from './components/IntegrationsPanel'
import { OrgChart } from './components/OrgChart'
import { Overview } from './components/Overview'
import { People } from './components/People'
import { Settings } from './components/Settings'
import { Billing } from './components/Billing'
import { ErrorState, LoadingState, Shell } from './components/Shell'
import { Setup } from './components/Setup'
import { SignIn } from './components/SignIn'
import { Tasks } from './components/Tasks'
import { VoiceCall } from './components/VoiceCall'
import { QuorumVoice } from './components/QuorumVoice'
import { InstagramDesk } from './agents/instagram-desk'
import { WhatsAppDesk } from './agents/whatsapp-desk'
import { WhatsAppView } from './components/WhatsAppView'
import { OfficeView } from './office/OfficeView'
import { useStore } from './store/Store'
import { isStaffActive } from './domain/active'
import type { ReactNode } from 'react'

type Route = { view: string; id?: string; extra?: string }

function parseHash(hash: string): Route {
  const cleaned = hash.replace(/^#\/?/, '').split('?')[0]
  const parts = cleaned.split('/').filter(Boolean)
  return { view: parts[0] || 'overview', id: parts[1], extra: parts[2] }
}

export function App() {
  const { state, ready, error, dispatch, clearSaved, session, cloud, signOut } = useStore()
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  const [now, setNow] = useState(() => Date.now())
  const [call, setCall] = useState<{ threadId: string; memberIds: string[]; docked: boolean } | null>(null)
  const [quorumCall, setQuorumCall] = useState<string | null>(null)

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  if (!ready) return <LoadingState />
  if (cloud && !session) return <SignIn />
  if (error || !state) return <ErrorState message={error ?? 'The company could not be loaded.'} onReset={clearSaved} />
  if (!state.company || route.view === 'setup') {
    return <Setup dispatch={dispatch} />
  }

  const goStaff = (id: string) => {
    window.location.hash = `#/people/${id}`
  }
  const goTask = (id: string) => {
    window.location.hash = `#/tasks/${id}`
  }

  let content: ReactNode
  switch (route.view) {
    case 'office':
      content = <OfficeView state={state} dispatch={dispatch} onOpenStaff={goStaff} onOpenTask={goTask} />
      break
    case 'org':
      content = <OrgChart state={state} />
      break
    case 'tasks':
      content = <Tasks state={state} dispatch={dispatch} selectedId={route.id} now={now} />
      break
    case 'people':
      content = (
        <People
          state={state}
          dispatch={dispatch}
          selectedId={route.id}
          roleId={route.extra}
          now={now}
          onJoinCall={startCall}
        />
      )
      break
    case 'approvals':
      content = <Approvals state={state} dispatch={dispatch} now={now} />
      break
    case 'chat':
      content = <ChatView state={state} dispatch={dispatch} now={now} selectedId={route.id} onJoinCall={startCall} />
      break
    case 'whatsapp':
      content = <WhatsAppView state={state} dispatch={dispatch} selectedId={route.id} />
      break
    case 'activity':
      content = <ActivityLog state={state} now={now} />
      break
    case 'integrations':
      content = <IntegrationsPanel state={state} dispatch={dispatch} />
      break
    case 'company':
      content = <Settings state={state} dispatch={dispatch} />
      break
    case 'billing':
      content = <Billing company={state.company} dispatch={dispatch} />
      break
    case 'history':
      content = (
        <Overview
          state={state}
          dispatch={dispatch}
          talking
          threadId={route.id}
          onVoice={(id) => {
            setQuorumCall(id)
            void holdMicrophone()
          }}
        />
      )
      break
    default:
      content = (
        <Overview
          state={state}
          dispatch={dispatch}
          onVoice={(id) => {
            setQuorumCall(id)
            void holdMicrophone()
          }}
        />
      )
  }

  return (
    <Shell
      state={state}
      view={route.view === 'company' ? 'company' : route.view}
      historyId={route.view === 'history' ? route.id : undefined}
      account={session?.email}
      onSignOut={cloud ? signOut : undefined}
      dispatch={dispatch}
    >
      <AgentDesk state={state} dispatch={dispatch} />
      <WhatsAppDesk state={state} dispatch={dispatch} />
      <InstagramDesk state={state} dispatch={dispatch} />
      {content}
      {call && (
        <VoiceCall
          people={state.staff.filter((person) => call.memberIds.includes(person.id) && isStaffActive(state, person))}
          threadId={call.threadId}
          state={state}
          dispatch={dispatch}               
          docked={call.docked}
          onClose={() => {
            dispatch({ type: 'SET_ON_CALL', staffIds: [] })
            setCall(null)
          }}
          onViewOffice={() => {
            setCall({ ...call, docked: true })
            window.location.hash = '#/office'
          }}
          onNavigate={(view) => {
            setCall({ ...call, docked: true })
            window.location.hash = `#/${view}`
          }}
          onExpand={() => setCall({ ...call, docked: false })}
        />
      )}
      {quorumCall && (
        <QuorumVoice threadId={quorumCall} state={state} dispatch={dispatch} onClose={() => setQuorumCall(null)} />
      )}
    </Shell>
  )

  function startCall(threadId: string, memberIds: string[]) {
    setCall({ threadId, memberIds, docked: false })
    dispatch({ type: 'SET_ON_CALL', staffIds: memberIds })
    void holdMicrophone()
  }
}
