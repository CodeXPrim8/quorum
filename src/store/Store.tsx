import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { deleteCloudState, loadCloudState, saveCloudState } from '../cloud/save'
import { getSupabase, sessionFrom, supabaseConfigured, type CloudSession } from '../cloud/supabase'
import { applyCommand } from '../engine/apply'
import { defaultLife, freshClock } from '../engine/life'
import { ensureChat } from '../chat/threads'
import { isOfficeLife } from '../domain/reports'
import { blankState, withDesigner, withSecurityTeam } from '../domain/sample'
import { settledPresence } from '../office/presence'
import { nextDesk } from '../office/world'
import type { AppState, Command, Staff } from '../types'

const STORAGE_KEY = 'quorum.state.v1'

type StoreValue = {
  state: AppState | null
  ready: boolean
  error: string | null
  session: CloudSession | null
  cloud: boolean
  dispatch: (command: Command) => void
  clearSaved: () => void
  signOut: () => void
}

const StoreContext = createContext<StoreValue | null>(null)

/** Sessions never survive reload; agent reachability is probed again by the UI. */
export function clearedDesktop(_desktop?: AppState['desktop']): AppState['desktop'] {
  return {
    agentConnected: false,
    sessionActive: false,
    mode: null,
  }
}

function hydrate(parsed: AppState, now: number): AppState {
  const legacyFloor = !parsed.clock
  const taken: { x: number; y: number }[] = []
  const staff: Staff[] = (parsed.staff ?? []).map((person, index) => {
    const desk = legacyFloor ? nextDesk(person.roomId || 'flex', taken) : null
    if (desk) taken.push(desk)
    const x = desk?.x ?? person.deskX
    const y = desk?.y ?? person.deskY
    const presence = person.presence?.path
      ? person.presence
      : settledPresence(x, y, person.presence?.mode ?? 'desk', person.presence?.label ?? 'At desk')
    return {
      ...person,
      deskX: x,
      deskY: y,
      roomId: desk?.roomId ?? person.roomId,
      presence,
      life: { ...defaultLife(index), ...(person.life ?? {}) },
    }
  })
  const events = (parsed.events ?? []).filter((event) => event.kind !== 'life' && !isOfficeLife(event.message))
  const reports = (parsed.reports ?? []).filter((item) => item.text.trim() && !isOfficeLife(item.text))
  const chat = (parsed.chat ?? []).filter((message) => !isOfficeLife(message.text))
  return ensureChat(
    withDesigner(
    withSecurityTeam({
      ...parsed,
      events,
      reports,
      chat,
      desktop: clearedDesktop(parsed.desktop),
      quorumAsk:
        parsed.quorumAsk?.status === 'granted'
          ? { ...parsed.quorumAsk, status: 'pending' }
          : parsed.quorumAsk,
      staff,
      designs: parsed.designs ?? [],
      records: parsed.records ?? [],
      whatsapp: parsed.whatsapp ?? [],
      goalProposals: parsed.goalProposals ?? [],
      clock: parsed.clock
        ? {
            ...parsed.clock,
            socialMark: parsed.clock.socialMark ?? -1,
            filedDay: parsed.clock.filedDay ?? parsed.clock.day,
            ownerReportDay: parsed.clock.ownerReportDay ?? parsed.clock.day,
          }
        : freshClock(now, 9 * 60 + 10),
    }),
  ),
  )
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function readLocal(reducedMotion: boolean): { state: AppState | null; error: string | null } {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return { state: blankState(reducedMotion), error: null }
  try {
    const parsed = JSON.parse(raw) as AppState
    if (!parsed || parsed.version !== 1 || !parsed.settings || !parsed.desktop) {
      return { state: null, error: 'Saved company data is from a different version of Quorum.' }
    }
    if (parsed.company?.id === 'co_northline' || parsed.company?.name === 'Northline Supply Co.') {
      return { state: blankState(reducedMotion), error: null }
    }
    const now = Date.now()
    return { state: applyCommand(hydrate(parsed, now), { type: 'TICK' }, now), error: null }
  } catch {
    return { state: null, error: 'Saved company data could not be read.' }
  }
}

function openState(source: AppState | null, reducedMotion: boolean): { state: AppState | null; error: string | null } {
  if (source?.company?.id === 'co_northline' || source?.company?.name === 'Northline Supply Co.') {
    return { state: blankState(reducedMotion), error: null }
  }
  if (!source) return readLocal(reducedMotion)
  try {
    const now = Date.now()
    return { state: applyCommand(hydrate(source, now), { type: 'TICK' }, now), error: null }
  } catch {
    return { state: null, error: 'The company saved in the cloud could not be read.' }
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const cloud = supabaseConfigured()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<AppState | null>(null)
  const [session, setSession] = useState<CloudSession | null>(null)
  const saveTimer = useRef(0)
  const userRef = useRef<string | null>(null)
  userRef.current = session?.userId ?? null

  useEffect(() => {
    const reduced = prefersReducedMotion()
    const db = getSupabase()
    if (!db) {
      const loaded = readLocal(reduced)
      setError(loaded.error)
      setState(loaded.state)
      setReady(true)
      return
    }
    let gone = false
    const boot = async () => {
      const { data } = await db.auth.getSession()
      if (gone) return
      const next = sessionFrom(data.session)
      setSession(next)
      if (!next) {
        setState(null)
        setReady(true)
        return
      }
      try {
        const remote = await loadCloudState(next.userId)
        if (gone) return
        const loaded = openState(remote, reduced)
        setError(loaded.error)
        setState(loaded.state)
        if (!remote && loaded.state?.company) {
          void saveCloudState(next.userId, loaded.state)
        }
      } catch (err) {
        if (gone) return
        setError(err instanceof Error ? err.message : 'The company could not be loaded from Supabase.')
        setState(null)
      }
      setReady(true)
    }
    void boot()
    const { data } = db.auth.onAuthStateChange((event, raw) => {
      if (event === 'INITIAL_SESSION') return
      const next = sessionFrom(raw)
      setSession(next)
      if (!next) {
        setState(null)
        setReady(true)
        return
      }
      setReady(false)
      void loadCloudState(next.userId)
        .then((remote) => {
          const loaded = openState(remote, reduced)
          setError(loaded.error)
          setState(loaded.state)
          if (!remote && loaded.state?.company) void saveCloudState(next.userId, loaded.state)
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'The company could not be loaded from Supabase.')
          setState(null)
        })
        .finally(() => setReady(true))
    })
    return () => {
      gone = true
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!ready || error || !state) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // A full disk should not block the session. The company stays in memory.
    }
  }, [ready, error, state])

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((current) => {
        if (!current) return current
        const next = applyCommand(current, { type: 'TICK' }, Date.now())
        return next === current ? current : next
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  const queueCloudSave = (next: AppState) => {
    const userId = userRef.current
    if (!userId) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void saveCloudState(userId, next).catch(() => {
        /* keep working locally; the next save retries */
      })
    }, 1600)
  }

  const value = useMemo<StoreValue>(
    () => ({
      state,
      ready,
      error,
      session,
      cloud,
      dispatch: (command) => {
        setError(null)
        setState((current) => {
          const base = current ?? blankState(prefersReducedMotion())
          const next = applyCommand(base, command, Date.now())
          if (command.type !== 'TICK') queueCloudSave(next)
          return next
        })
      },
      clearSaved: () => {
        const userId = userRef.current
        localStorage.removeItem(STORAGE_KEY)
        setError(null)
        setState(blankState(prefersReducedMotion()))
        window.location.hash = '#/setup'
        if (userId) void deleteCloudState(userId)
      },
      signOut: () => {
        window.clearTimeout(saveTimer.current)
        const db = getSupabase()
        void db?.auth.signOut()
        setSession(null)
        setState(null)
      },
    }),
    [state, ready, error, session, cloud],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside StoreProvider')
  return value
}
