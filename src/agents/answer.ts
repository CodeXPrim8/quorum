import { floorPrompt } from '../domain/call-scene'
import { ownerHonorific } from '../domain/meeting'
import type { AppState, Staff } from '../types'
import { isDesigner, localTurn, type AgentTurn } from './local'
import { askModel, readModelLink, splitDesign } from './model'
import { setAgentNotice } from './status'

export async function answerAs(input: {
  state: AppState
  person: Staff
  prompt: string
  history: { role: 'user' | 'assistant'; content: string }[]
  intent: 'reply' | 'design' | 'update'
  taskTitle?: string
  spoken?: boolean
}): Promise<AgentTurn> {
  const company = input.state.company
  const local = localTurn({
    person: input.person,
    companyName: company?.name ?? 'the company',
    ownerName: company?.ownerName ?? 'there',
    ownerGender: company?.ownerGender,
    text: input.prompt,
    intent: input.intent,
    taskTitle: input.taskTitle,
  })
  const link = readModelLink()
  if (!link) return local
  const designer = isDesigner(input.person, input.state.roles)
  try {
    const raw = await askModel(link, [
      {
        role: 'system',
        content: [
          `You are ${input.person.name}, ${input.person.title} at ${company?.name ?? 'the company'} (${company?.businessType ?? 'a company'}).`,
          `The owner is ${company?.ownerName ?? 'the owner'} (${company?.ownerTitle ?? 'the owner'}).`,
          ownerHonorific(company?.ownerGender)
            ? `Address them as ${ownerHonorific(company?.ownerGender)}. They are ${company?.ownerGender === 'female' ? 'a woman' : 'a man'}.`
            : 'Do not guess whether the owner is a woman or a man.',
          `Your purpose: ${input.person.purpose}`,
          `You do: ${input.person.responsibilities.join('; ')}`,
          input.spoken
            ? [
                'You are on a live voice call in the office, headset on, laptop open. Speak in one or two short sentences the way a colleague talks — messy, warm, with feeling.',
                'Do not follow a script. Do not announce your title unless asked. Greet the owner and colleagues by first name when it fits.',
                'If the floor is tense, say so. If it is a beautiful morning, say so. If work is stuck, sound unhappy. If they ask whether you can hear them, say yes.',
                floorPrompt(input.state, input.person),
                'No markdown and no lists.',
              ].join(' ')
            : 'Write like a colleague in a phone chat: 1 to 3 short sentences. Friendly small talk is welcome. No headings and no bullet lists.',
          'You only work inside Quorum. You cannot send email, publish to social networks, pay anyone, or control the computer.',
          'If asked to do those, say they are not connected and offer to draft the work in this chat.',
          'Security work stays on this company’s own systems inside the app. Refuse hacking, exploits, and attacks.',
          designer ? 'If a graphic is wanted, end with a new line exactly like DESIGN: short title' : 'Do not include a DESIGN line.',
        ].join('\n'),
      },
      ...input.history,
      { role: 'user', content: input.prompt },
    ])
    const parsed = splitDesign(raw, designer && (input.intent === 'design' || /design|graphic|poster|logo/i.test(input.prompt)))
    if (input.intent === 'design' && !parsed.designBrief) parsed.designBrief = local.designBrief
    if (!parsed.text) parsed.text = local.text
    setAgentNotice('')
    return parsed
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'The model did not answer.'
    setAgentNotice(`${input.person.name} could not reach the model (${reason}). They answered from their role.`)
    return local
  }
}
