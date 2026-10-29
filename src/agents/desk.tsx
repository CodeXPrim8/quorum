import { useEffect, useRef } from 'react'
import { ensureChat } from '../chat/threads'
import type { AppState, Command } from '../types'
import { answerAs } from './answer'
import { nextJob } from './jobs'
import { reviewGraphic } from './review'
import { setTyping } from './status'

/** While the company is open, tagged staff reply and one person at a time does role work. */
export function AgentDesk({ state, dispatch }: { state: AppState; dispatch: (command: Command) => void }) {
  const stateRef = useRef(state)
  const dispatchRef = useRef(dispatch)
  stateRef.current = state
  dispatchRef.current = dispatch

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
        dispatchRef.current({ type: 'PLAN_CALENDAR' })
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
      })
      if (cancel || !turn.text) return
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
