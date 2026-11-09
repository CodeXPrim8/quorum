import { floorPrompt } from '../domain/call-scene'
import { kpiOf } from '../domain/authority'
import { ownerHonorific } from '../domain/meeting'
import { websiteLine } from '../domain/website'
import { socialAccounts } from '../domain/social'
import { memoryBrief, siteLesson } from '../domain/memory'
import { withoutSpeaker } from '../chat/threads'
import type { AppState, Staff } from '../types'
import { readPublicPage, readingRequest } from './company-site'
import { isDesigner, localTurn, type AgentTurn } from './local'
import { askModel, readModelLink, splitDesign } from './model'
import { setAgentNotice } from './status'

async function pagesForMd(website: string | undefined, prompt: string): Promise<string> {
  const request = readingRequest(website, prompt)
  if (!request.missing && request.urls.length === 0) return ''
  if (request.missing) {
    return 'The company website is not saved yet. Tell the owner you can read it once the public link is on the company profile. Do not say you are unable to browse.'
  }
  const pages = await Promise.all(request.urls.map((url) => readPublicPage(url)))
  return pages.filter(Boolean).join('\n\n')
}

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
  const accounts = socialAccounts(company?.social)
  const roleKey = input.state.roles.find((role) => role.id === input.person.roleId)?.key
  const reading = roleKey === 'md' ? await pagesForMd(company?.website, input.prompt) : ''
  const learned = siteLesson(reading)
  const local = localTurn({
    person: input.person,
    companyName: company?.name ?? 'the company',
    ownerName: company?.ownerName ?? 'there',
    ownerGender: company?.ownerGender,
    text: input.prompt,
    intent: input.intent,
    taskTitle: input.taskTitle,
    socialNote: accounts,
    siteNote: reading,
  })
  const link = readModelLink()
  if (!link) return { ...local, learned }
  const designer = isDesigner(input.person, input.state.roles)
  const posting = designer || roleKey === 'social_manager'
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
          kpiOf(input.state, input.person.roleId) ? `Your KPI: ${kpiOf(input.state, input.person.roleId)}` : '',
          `Company goals: ${(company?.goals ?? []).map((goal) => goal.text).join(' | ') || 'none yet'}`,
          websiteLine(company?.website),
          memoryBrief(input.state.memory),
          reading,
          reading
            ? 'You can read a public website. The reading above is the page you opened. Answer from it. Do not say you cannot browse, and do not ask the owner to paste the page.'
            : '',
          posting ? accounts : '',
          posting
            ? 'When a post is needed, use a connected social account and name that link. File the draft in Quorum after approval. Do not claim it is live on the network.'
            : '',
          'Speak and write as a senior who has done this job for years. Be specific. Do not invent customers, vendors, or numbers you were not given.',
          input.spoken
            ? [
                'You are on a live voice call in the office, headset on, laptop open. Speak in one or two short sentences the way a colleague talks — messy, warm, with feeling.',
                'Do not follow a script. Do not announce your title unless asked. Greet the owner and colleagues by first name when it fits.',
                'If the floor is tense, say so. If it is a beautiful morning, say so. If work is stuck, sound unhappy. If they ask whether you can hear them, say yes.',
                floorPrompt(input.state, input.person),
                'No markdown and no lists.',
              ].join(' ')
            : 'Write like a colleague in a phone chat: 1 to 3 short sentences. Friendly small talk is welcome. No headings and no bullet lists. Do not start with your name.',
          'You only work inside Quorum. You cannot send email, publish to social networks, pay anyone, or control the computer. You can read a public website when a page reading is included above.',
          'If asked to send email, publish, pay, or control the computer, say that stays inside Quorum until you approve it, and offer to draft the work in this chat.',
          'Do the real work of your role here: drafts, comparisons, captions, checklists, and notes the owner can review.',
          'Security work stays on this company’s own systems inside the app. Refuse hacking, exploits, and attacks.',
          roleKey === 'sports_analyst'
            ? 'You are the coach’s coach for every sport. Reply with only near-sure, sport-native plays. If the pattern is weak, say there is no stake. Never say guaranteed win.'
            : '',
          designer
            ? 'If a graphic is wanted, end with a new line exactly like DESIGN: short title. Meetings, agendas, and other in-house notices are internal flyers (DM for approval, then company group, never social). Product and service promos are for social after approval.'
            : 'Do not include a DESIGN line.',
        ].join('\n'),
      },
      ...input.history,
      { role: 'user', content: input.prompt },
    ])
    const parsed = splitDesign(raw, designer && (input.intent === 'design' || /design|graphic|poster|logo/i.test(input.prompt)))
    if (input.intent === 'design' && !parsed.designBrief) parsed.designBrief = local.designBrief
    if (!parsed.text) parsed.text = local.text
    parsed.text = withoutSpeaker(input.person.name, parsed.text)
    setAgentNotice('')
    return { ...parsed, learned }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'The model did not answer.'
    setAgentNotice(`${input.person.name} could not reach the model (${reason}). They answered from their role.`)
    return { ...local, learned }
  }
}
