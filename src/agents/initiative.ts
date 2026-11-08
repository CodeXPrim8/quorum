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

export async function draftGoal(state: AppState, person: Staff): Promise<string> {
  const company = state.company
  const fallback = `Advance ${company?.name ?? 'the company'}’s ${company?.businessType ?? 'work'} this month with a clear owner-approved outcome.`
  const link = readModelLink()
  if (!link || !company) return fallback
  const learned = await learnCompany(company.website)
  try {
    const raw = await askModel(link, [
      {
        role: 'system',
        content: [
          `You are ${person.name}, an experienced managing director.`,
          'Propose one company goal in a single sentence. No preamble.',
          'Base it on what this company actually does. If a website summary is included, use that. Do not invent a different business.',
          memoryBrief(state.memory),
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `${company.name} — ${company.businessType}`,
          websiteLine(company.website),
          learned ? `What the website says:\n${learned}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ])
    return raw.replace(/\s+/g, ' ').trim().slice(0, 180) || fallback
  } catch {
    return fallback
  }
}

export function goalIdFor(state: AppState, text: string): string | undefined {
  return state.company?.goals.find((goal) => goal.text === text)?.id ?? state.company?.goals[0]?.id
}
