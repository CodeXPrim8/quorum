import { kpiOf, roleKeyOf } from '../domain/authority'
import { memoryBrief } from '../domain/memory'
import { websiteLine } from '../domain/website'
import type { AppState, Staff, TaskInput } from '../types'
import { learnCompany } from './company-site'
import { askModel, readModelLink } from './model'

/** A senior in this role opens one concrete day-to-day task under an approved goal. */
export async function draftManagerTask(state: AppState, person: Staff, goalText: string): Promise<TaskInput | null> {
  const reports = state.staff.filter((item) => item.managerId === person.id && item.enabled)
  const assignee = reports[0] ?? person
  const fallback: TaskInput = {
    title: `${person.title}: ${goalText.slice(0, 72)}`,
    description: `Day-to-day work for “${goalText}”. Stay inside ${person.title}’s responsibilities and file the result in Quorum.`,
    priority: 'medium',
    assigneeId: assignee.id,
    departmentId: roleKeyOf(state, person) === 'md' ? assignee.departmentId : person.departmentId,
    consequential: null,
  }
  const link = readModelLink()
  if (!link) return fallback
  try {
    const raw = await askModel(link, [
      {
        role: 'system',
        content: [
          `You are ${person.name}, an experienced ${person.title}.`,
          `Purpose: ${person.purpose}`,
          `You do: ${person.responsibilities.join('; ')}`,
          kpiOf(state, person.roleId) ? `Your KPI: ${kpiOf(state, person.roleId)}` : '',
          memoryBrief(state.memory),
          'Write ONE day-to-day task a senior would assign. No email, no posting, no payment.',
          'Reply with exactly two lines:',
          'TITLE: short title',
          'DETAIL: one sentence',
        ].join('\n'),
      },
      { role: 'user', content: [`Company goal: ${goalText}`, websiteLine(state.company?.website)].filter(Boolean).join('\n') },
    ])
    const title = raw.match(/TITLE:\s*(.+)/i)?.[1]?.trim().slice(0, 90)
    const detail = raw.match(/DETAIL:\s*(.+)/i)?.[1]?.trim().slice(0, 280)
    if (!title) return fallback
    return { ...fallback, title, description: detail || fallback.description }
  } catch {
    return fallback
  }
}

const GOAL_ANGLES = [
  'which customers to win next',
  'making delivery more reliable this quarter',
  'a margin or cost the owner can measure',
  'a product change buyers would notice',
  'an operating habit that is slowing the company',
]

/** Goals the owner already turned down. The same sentence is kept once. */
export function declinedGoalTexts(state: AppState): string[] {
  const seen = new Set<string>()
  const texts: string[] = []
  for (const item of state.goalProposals ?? []) {
    if (item.status !== 'rejected') continue
    const text = item.text.trim()
    if (!text || seen.has(text.toLowerCase())) continue
    seen.add(text.toLowerCase())
    texts.push(text)
  }
  return texts
}

function goalWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter((word) => word.length > 3),
  )
}

/** True when a new sentence is the same goal as one already declined, including a light rephrase. */
export function goalRepeats(candidate: string, prior: string[]): boolean {
  const next = goalWords(candidate)
  if (next.size === 0) return false
  return prior.some((item) => {
    const old = goalWords(item)
    if (old.size === 0) return false
    let shared = 0
    for (const word of next) if (old.has(word)) shared += 1
    return shared / Math.min(next.size, old.size) >= 0.72
  })
}

export function goalAngle(declinedCount: number): string {
  return GOAL_ANGLES[Math.abs(declinedCount) % GOAL_ANGLES.length]
}

function composedGoal(name: string, businessType: string, angle: string): string {
  return `Set a measurable outcome for ${name} this quarter around ${angle}, staying inside ${businessType}.`.slice(0, 180)
}

export async function draftGoal(state: AppState, person: Staff): Promise<string> {
  const company = state.company
  const declined = declinedGoalTexts(state)
  const angle = goalAngle(declined.length)
  const fallback = company
    ? declined.length > 0
      ? composedGoal(company.name, company.businessType, angle)
      : `Advance ${company.name}’s ${company.businessType} this month with a clear owner-approved outcome.`
    : `Advance the company’s work this month with a clear owner-approved outcome.`
  const link = readModelLink()
  if (!link || !company) return fallback
  const learned = await learnCompany(company.website)
  const ask = async (steer: string) => {
    const raw = await askModel(link, [
      {
        role: 'system',
        content: [
          `You are ${person.name}, an experienced managing director.`,
          'Propose one company goal in a single sentence. No preamble.',
          'Base it on what this company actually does. If a website summary is included, use that as context. Do not invent a different business.',
          declined.length > 0
            ? [
                'The owner already declined these goals. Do not repeat them or lightly rephrase them:',
                ...declined.map((text) => `- ${text}`),
                `Propose a different goal about ${steer || angle}.`,
              ].join('\n')
            : '',
          memoryBrief(state.memory),
        ]
          .filter(Boolean)
          .join('\n'),
      },
      {
        role: 'user',
        content: [
          `${company.name} — ${company.businessType}`,
          websiteLine(company.website),
          learned ? `What the website says:\n${learned}` : '',
          steer ? `Write about ${steer}.` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ])
    return raw.replace(/\s+/g, ' ').trim().slice(0, 180)
  }
  try {
    let text = await ask(declined.length > 0 ? angle : '')
    if (declined.length > 0 && goalRepeats(text, declined)) {
      text = await ask(goalAngle(declined.length + 1))
    }
    if (!text || goalRepeats(text, declined)) return fallback
    return text
  } catch {
    return fallback
  }
}

export function goalIdFor(state: AppState, text: string): string | undefined {
  return state.company?.goals.find((goal) => goal.text === text)?.id ?? state.company?.goals[0]?.id
}
