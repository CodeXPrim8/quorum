import { useEffect, useRef } from 'react'
import { ensureChat } from '../chat/threads'
import type { AppState, Command } from '../types'
import { answerAs } from './answer'
import { draftMonth, polishCalendar } from './calendar-plan'
import { nextJob } from './jobs'
import { reviewGraphic } from './review'
import { setTyping } from './status'
import { artCommand, designStudioReady, pendingArt, requestDesignArt, requestQuorumPicture } from './studio'
import { allowQuorumDesktop, endDesktopUsing, probeDesktopAgent, runDesktopGrant, runQuorumDesktop, startDesktopServerSession, writeDesktopToken } from './desktop'
import {
  answerQuorum,
  desktopReasonFor,
  earlierDesktopPrompt,
  grantsDesktop,
  needsDesktop,
  pendingQuorumPrompt,
  wantsProgram,
  threadAlreadyAllowed,
} from './quorum'
import { draftGoal, draftManagerTask, goalIdFor } from './initiative'
import { produceStaffWork } from './work'

const deskStakeRuns = new Set<string>()

/** While the company is open, tagged staff reply and one person at a time does role work. */
export function AgentDesk({ state, dispatch }: { state: AppState; dispatch: (command: Command) => void }) {
  const stateRef = useRef(state)
  const dispatchRef = useRef(dispatch)
  stateRef.current = state
  dispatchRef.current = dispatch

  useEffect(() => {
    let cancel = false
    const probe = async () => {
      const ready = await probeDesktopAgent()
      if (cancel) return
      const current = stateRef.current
      if (current.desktop.agentConnected !== ready) {
        dispatchRef.current({ type: 'SET_DESKTOP_AGENT', connected: ready })
      }
    }
    void probe()
    const id = window.setInterval(() => void probe(), 12_000)
    return () => {
      cancel = true
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    if (state.desktop.sessionActive) return
    writeDesktopToken(null)
  }, [state.desktop.sessionActive])

  useEffect(() => {
    const ask = state.quorumAsk
    if (ask?.status !== 'granted') return
    if (state.desktop.sessionActive && state.desktop.grantedQuorum) return
    dispatchRef.current({
      type: 'ASK_QUORUM_DESKTOP',
      reason: ask.reason,
      prompt: ask.prompt,
      threadId: ask.threadId,
      steps: ask.steps,
    })
  }, [state.quorumAsk, state.desktop.sessionActive, state.desktop.grantedQuorum])

  useEffect(() => {
    let cancel = false
    let busy = false
    const runQuorum = async () => {
      if (busy || cancel) return
      const current = ensureChat(stateRef.current)
      const pending = pendingQuorumPrompt(current)
      if (!pending) return
      busy = true
      setTyping({ threadId: pending.threadId, name: 'Quorum' })
      try {
        if (grantsDesktop(pending.text)) {
          const task = earlierDesktopPrompt(current, pending.threadId, pending.text)
          if (!task) {
            dispatchRef.current({
              type: 'QUORUM_MESSAGE',
              text: 'Tell me what to do on this computer. For example, draft the reply in the Zoho window you already opened. I will not send it.',
              threadId: pending.threadId,
            })
            return
          }
          dispatchRef.current({
            type: 'QUORUM_MESSAGE',
            text: 'I will use the window already open and draft there. I will not send it.',
            threadId: pending.threadId,
          })
          if (current.quorumAsk?.status !== 'pending' || current.quorumAsk.prompt !== task) {
            dispatchRef.current({
              type: 'ASK_QUORUM_DESKTOP',
              reason: desktopReasonFor(task),
              prompt: task,
              threadId: pending.threadId,
            })
          }
          try {
            await allowQuorumDesktop(dispatchRef.current, stateRef.current.desktop)
          } catch (error) {
            if (!cancel) {
              dispatchRef.current({
                type: 'QUORUM_MESSAGE',
                text: error instanceof Error ? error.message : 'Desktop access could not start.',
                threadId: pending.threadId,
              })
            }
          }
          return
        }
        const turn = await answerQuorum(current, pending.text, pending.threadId)
        if (cancel) return
        const alreadyAllowed = needsDesktop(pending.text) && threadAlreadyAllowed(current, pending.threadId)
        dispatchRef.current({
          type: 'QUORUM_MESSAGE',
          text: alreadyAllowed
            ? wantsProgram(pending.text)
              ? `You already allowed this computer. I will open the program and do this there: ${pending.text}`
              : `You already allowed this computer. I will follow this in the open window, and I will not send it: ${pending.text}`
            : turn.text,
          threadId: pending.threadId,
        })
        if (turn.slip) {
          let bookLine = 'No bookmaker is connected. Connect one under Integrations before this can be placed.'
          const companyId = current.company?.id
          if (companyId) {
            try {
              const response = await fetch(`/api/venues/status?companyId=${encodeURIComponent(companyId)}`)
              const data = (await response.json()) as {
                venues?: Array<{ name: string; market: string; connected: boolean; loginUrl: string }>
              }
              const book = (data.venues ?? []).find((item) => item.market === 'sports' && item.connected && item.loginUrl)
              if (book) bookLine = `Book: ${book.name} ${book.loginUrl}`
            } catch {
              bookLine = 'The bookmaker list could not be read. Connect one under Integrations.'
            }
          }
          dispatchRef.current({
            type: 'FILE_SPORTS_SLIP',
            title: turn.slip.event,
            detail: `${bookLine}\n\n${turn.text}`,
          })
        }
        if (turn.screen) dispatchRef.current({ type: 'SET_QUORUM_SCREEN', screen: turn.screen })
        if (turn.generate) {
          try {
            const image = await requestQuorumPicture(turn.generate, current.company?.name ?? 'Quorum')
            if (!cancel) {
              dispatchRef.current({
                type: 'SET_QUORUM_SCREEN',
                screen: { kind: 'image', src: image, caption: turn.generate, made: true },
              })
            }
          } catch {
            // The chat reply still stands if a picture cannot be made.
          }
        }
        if (turn.desktopReason || needsDesktop(pending.text)) {
          dispatchRef.current({
            type: 'ASK_QUORUM_DESKTOP',
            reason: turn.desktopReason || desktopReasonFor(pending.text),
            prompt: pending.text,
            threadId: pending.threadId,
          })
          if (alreadyAllowed) {
            try {
              await allowQuorumDesktop(dispatchRef.current, stateRef.current.desktop)
            } catch (error) {
              if (!cancel) {
                dispatchRef.current({
                  type: 'QUORUM_MESSAGE',
                  text: error instanceof Error ? error.message : 'Desktop access could not start.',
                  threadId: pending.threadId,
                })
              }
            }
          }
        }
      } catch {
        if (!cancel) {
          dispatchRef.current({
            type: 'QUORUM_MESSAGE',
            text: 'I could not answer just then. Ask again in a moment.',
            threadId: pending.threadId,
          })
        }
      } finally {
        busy = false
        if (!cancel) setTyping(null)
      }
    }
    const id = window.setInterval(() => void runQuorum(), 800)
    void runQuorum()
    return () => {
      cancel = true
      window.clearInterval(id)
    }
  }, [])

  const stakeId = state.pendingStake?.taskId ?? ''

  useEffect(() => {
    if (!stakeId) return
    const stakesStarted = (deskStakeRuns as Set<string>)
    if (stakesStarted.has(stakeId)) return
    stakesStarted.add(stakeId)
    const place = async () => {
      const current = stateRef.current
      const stake = current.pendingStake
      if (!stake || stake.taskId !== stakeId) return
      const threadId = current.threads.find((item) => item.kind === 'quorum')?.id
      setTyping({ threadId: threadId ?? 'thread_quorum', name: 'Quorum' })
      try {
        if (!current.desktop.sessionActive) {
          await startDesktopServerSession()
          dispatchRef.current({ type: 'SET_DESKTOP_AGENT', connected: true })
          dispatchRef.current({ type: 'START_DESKTOP_SESSION', mode: 'live' })
        }
        const placed = await runQuorumDesktop(stateRef.current, stake.instruction)
        dispatchRef.current({
          type: 'QUORUM_MESSAGE',
          text: placed.text,
          threadId,
        })
        dispatchRef.current({ type: 'FINISH_STAKE', taskId: stake.taskId, result: placed.result })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Quorum Desktop could not place the slip.'
        dispatchRef.current({
          type: 'QUORUM_MESSAGE',
          text: `${message} Download Quorum Desktop from the top bar, open that file, and ask for the slip again.`,
          threadId,
        })
        dispatchRef.current({ type: 'FINISH_STAKE', taskId: stakeId, result: message })
      } finally {
        setTyping(null)
      }
    }
    void place()
  }, [stakeId])

  const quorumGrant =
    state.desktop.grantedQuorum && state.quorumAsk?.status === 'granted'
      ? `${state.quorumAsk.threadId ?? ''}:${state.quorumAsk.at}`
      : ''

  useEffect(() => {
    if (!quorumGrant) return
    let cancel = false
    const runQuorumDesk = async () => {
      const current = stateRef.current
      if (!current.desktop.grantedQuorum) return
      const ask = current.quorumAsk
      if (!ask || ask.status !== 'granted') return
      setTyping({ threadId: ask.threadId ?? 'thread_quorum', name: 'Quorum' })
      try {
        const deliverable = await runQuorumDesktop(current, ask.prompt, ask.steps ?? [])
        if (cancel) return
        if (deliverable.ask) {
          dispatchRef.current({ type: 'QUORUM_MESSAGE', text: deliverable.text, threadId: ask.threadId })
          dispatchRef.current({
            type: 'ASK_QUORUM_DESKTOP',
            reason: deliverable.ask.reason,
            prompt: ask.prompt,
            threadId: ask.threadId,
            steps: deliverable.ask.steps,
          })
          return
        }
        dispatchRef.current({ type: 'QUORUM_MESSAGE', text: deliverable.text, threadId: ask.threadId })
        dispatchRef.current({ type: 'FINISH_QUORUM_DESKTOP' })
        void endDesktopUsing()
      } catch (error) {
        if (cancel) return
        const message = error instanceof Error ? error.message : 'Desktop run failed.'
        dispatchRef.current({
          type: 'QUORUM_MESSAGE',
          text: `I stopped using the computer: ${message}`,
          threadId: ask.threadId,
        })
        dispatchRef.current({ type: 'FINISH_QUORUM_DESKTOP' })
        void endDesktopUsing()
      } finally {
        if (!cancel) setTyping(null)
      }
    }
    void runQuorumDesk()
    return () => {
      cancel = true
    }
  }, [quorumGrant])

  const staffGrant =
    state.desktop.sessionActive && state.desktop.grantedStaffId && state.desktop.grantedTaskId
      ? `${state.desktop.grantedStaffId}:${state.desktop.grantedTaskId}`
      : ''

  useEffect(() => {
    if (!staffGrant) return
    let cancel = false
    const runGrant = async () => {
      const current = stateRef.current
      const { grantedStaffId, grantedTaskId, sessionActive } = current.desktop
      if (!sessionActive || !grantedStaffId || !grantedTaskId) return
      const person = current.staff.find((item) => item.id === grantedStaffId)
      const task = current.tasks.find((item) => item.id === grantedTaskId)
      if (!person || !task) {
        dispatchRef.current({ type: 'CLEAR_DESKTOP_GRANT' })
        return
      }
      setTyping({ threadId: `direct:${person.id}`, name: person.name })
      try {
        const deliverable = await runDesktopGrant(current, person, task)
        if (cancel) return
        dispatchRef.current({
          type: 'COMPLETE_WORK',
          taskId: task.id,
          staffId: person.id,
          text: deliverable.text,
          result: deliverable.result,
        })
        dispatchRef.current({ type: 'CLEAR_DESKTOP_GRANT' })
        void endDesktopUsing()
      } catch (error) {
        if (cancel) return
        const message = error instanceof Error ? error.message : 'Desktop run failed.'
        dispatchRef.current({
          type: 'COMPLETE_WORK',
          taskId: task.id,
          staffId: person.id,
          text: `Desktop control stopped: ${message}`,
          result: 'Desktop run failed.',
        })
        dispatchRef.current({ type: 'CLEAR_DESKTOP_GRANT' })
        void endDesktopUsing()
      } finally {
        if (!cancel) setTyping(null)
      }
    }
    void runGrant()
    return () => {
      cancel = true
    }
  }, [staffGrant])
  useEffect(() => {
    let cancel = false
    let busy = false
    const paint = async () => {
      if (busy || cancel) return
      const current = stateRef.current
      const design = pendingArt(current)
      if (!design) return
      busy = true
      try {
        const ready = await designStudioReady()
        if (cancel) return
        if (!ready) {
          dispatchRef.current(artCommand(design.id))
          return
        }
        const product = current.products.find((item) => item.name === design.productName)
        const image = await requestDesignArt(design, current.company?.name ?? 'Quorum', product)
        if (cancel) return
        dispatchRef.current(artCommand(design.id, image))
      } catch {
        if (!cancel) dispatchRef.current(artCommand(design.id))
      } finally {
        busy = false
      }
    }
    const id = window.setInterval(() => void paint(), 4000)
    void paint()
    return () => {
      cancel = true
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    let cancel = false
    let busy = false
    const run = async () => {
      if (busy || cancel) return
      const current = ensureChat(stateRef.current)
      const job = nextJob(current, Date.now())
      if (!job) return
      const person = current.staff.find((item) => item.id === job.staffId)
      if (!person) return
      busy = true
      setTyping({ threadId: job.threadId, name: person.name })
      try {
        if (job.intent === 'calendar') {
          const { products, drafts } = draftMonth(current)
          if (drafts.length === 0) return
          const polished = await polishCalendar(current, person, drafts, products)
          if (cancel) return
          dispatchRef.current({ type: 'PLAN_CALENDAR', drafts: polished })
          return
        }
        if (job.intent === 'review' && job.designId) {
          const design = current.designs.find((item) => item.id === job.designId)
          if (!design) return
          const verdict = await reviewGraphic(current, person, design)
          if (cancel) return
          dispatchRef.current({
            type: 'REVIEW_DESIGN',
            designId: design.id,
            decision: verdict.decision,
            note: verdict.note,
            by: 'marketing',
          })
          return
        }
        if (job.intent === 'spawn') {
          const drafted = await draftManagerTask(current, person, job.prompt)
          if (cancel || !drafted) return
          dispatchRef.current({
            type: 'STAFF_CREATE_TASK',
            staffId: person.id,
            input: drafted,
            goalId: goalIdFor(current, job.prompt),
          })
          dispatchRef.current({
            type: 'AGENT_MESSAGE',
            threadId: job.threadId,
            staffId: person.id,
            text: `I opened “${drafted.title}” so we keep moving on “${job.prompt}”.`,
            initiative: true,
          })
          return
        }
        if (job.intent === 'propose_goal') {
          const text = await draftGoal(current, person)
          if (cancel) return
          dispatchRef.current({ type: 'PROPOSE_GOAL', staffId: person.id, text })
          dispatchRef.current({
            type: 'AGENT_MESSAGE',
            threadId: job.threadId,
            staffId: person.id,
            text: `I proposed a company goal for your approval: ${text}`,
            initiative: true,
          })
          return
        }
        if (job.intent === 'start' && job.taskId) {
          dispatchRef.current({ type: 'START_TASK', taskId: job.taskId })
          return
        }
        if (job.intent === 'work' && job.taskId) {
          const task = current.tasks.find((item) => item.id === job.taskId)
          if (!task) return
          if (current.desktop.grantedTaskId === task.id) return
          const deliverable = await produceStaffWork(current, person, task)
          if (cancel) return
          dispatchRef.current({
            type: 'COMPLETE_WORK',
            taskId: task.id,
            staffId: person.id,
            text: deliverable.text,
            result: deliverable.result,
          })
          return
        }
        if (job.calendarId) {
          dispatchRef.current({
            type: 'AGENT_MESSAGE',
            threadId: job.threadId,
            staffId: person.id,
            text: job.prompt,
            designBrief: job.designBrief,
            calendarId: job.calendarId,
            initiative: true,
          })
          return
        }
        const turn = await answerAs({
          state: current,
          person,
          prompt: job.kind === 'initiative' ? `Do this without being asked: ${job.prompt}` : job.prompt,
          history: job.history,
          intent: job.intent === 'update' ? 'update' : job.intent === 'design' ? 'design' : 'reply',
          taskTitle: job.taskTitle,
          threadId: job.threadId,
        })
        if (cancel || !turn.text) return
        if (turn.learned) {
          dispatchRef.current({ type: 'REMEMBER', kind: 'site', text: turn.learned })
        }
        dispatchRef.current({
          type: 'AGENT_MESSAGE',
          threadId: job.threadId,
          staffId: person.id,
          text: turn.text,
          designBrief: turn.designBrief,
          initiative: job.kind === 'initiative',
        })
      } finally {
        busy = false
        if (!cancel) setTyping(null)
      }
    }
    const id = window.setInterval(() => void run(), 2800)
    void run()
    return () => {
      cancel = true
      window.clearInterval(id)
      setTyping(null)
    }
  }, [])

  return null
}
