import type { AppState, Staff, Task } from '../types'
import { kpiOf } from '../domain/authority'
import { memoryBrief } from '../domain/memory'
import { socialAccounts } from '../domain/social'
import { websiteLine } from '../domain/website'
import { learnCompany } from './company-site'
import { askModel, readModelLink } from './model'

export type StaffDeliverable = {
  text: string
  result?: string
}

function roleKey(state: AppState, person: Staff): string {
  return state.roles.find((role) => role.id === person.roleId)?.key ?? ''
}

function localDeliverable(state: AppState, person: Staff, task: Task): StaffDeliverable {
  const company = state.company?.name ?? 'the company'
  const key = roleKey(state, person)
  const product = state.products[0]
  const fact = product ? `${product.name}: ${product.fact}` : 'Use only approved product facts.'
  if (key === 'sales_manager' || key === 'account_executive' || key === 'quote_specialist') {
    return {
      text: `I drafted the sales note for “${task.title}” inside Quorum. ${fact} After you approve a send, it files to the Quorum email outbox — not a live mailbox.`,
      result: `Sales draft for ${task.title}. Holds in Quorum until you approve any external send.`,
    }
  }
  if (key === 'graphic_designer') {
    const accounts = socialAccounts(state.company?.social)
    return {
      text: accounts
        ? `Graphic for “${task.title}” is ready for review.\n${accounts}\nAfter you approve a promo, it is filed for that account inside Quorum.`
        : `Graphic for “${task.title}” is ready for review. No social account is connected, so nothing is posted.`,
      result: `Graphic for ${task.title}.`,
    }
  }
  if (key === 'social_manager') {
    return {
      text: `Caption draft for “${task.title}”: “${product?.name ?? company} — ready when you are.” ${
        socialAccounts(state.company?.social)
          ? `It is filed for the connected account inside Quorum.\n${socialAccounts(state.company?.social)}`
          : 'After approval it holds in Quorum; nothing posts to a live network from here.'
      }`,
      result: `Social captions held in Quorum for ${task.title}.`,
    }
  }
  if (key === 'pr_manager') {
    return {
      text: `Press note draft for “${task.title}” is ready in this chat. ${fact} After approval it holds as a Quorum PR record — not released on a newswire.`,
      result: `PR draft for ${task.title}. Held in Quorum.`,
    }
  }
  if (key === 'procurement_manager' || key === 'buyer') {
    return {
      text: `I compared the supplier options for “${task.title}” and wrote the recommendation here. After your purchase approval the note files in Quorum; no supplier portal receives an order.`,
      result: `Procurement comparison for ${task.title}. Awaiting your purchase approval if needed.`,
    }
  }
  if (key === 'finance_manager') {
    return {
      text: `Margin note for “${task.title}” is ready. After approval, finance entries file in Quorum’s ledger — no bank SaaS is changed.`,
      result: `Finance note for ${task.title}. Filed inside Quorum when approved.`,
    }
  }
  if (key === 'hr_manager') {
    return {
      text: `Hiring pack for “${task.title}” is ready for your decision. After approval it files in Quorum; no offer email leaves this computer.`,
      result: `Hiring pack for ${task.title}. Awaiting approval.`,
    }
  }
  if (key === 'technology_lead' || key === 'release_engineer' || key === 'systems_analyst') {
    return {
      text: `Internal checklist for “${task.title}” is updated in Quorum. No production system was changed, and desktop control stays off.`,
      result: `Technical checklist for ${task.title}.`,
    }
  }
  if (key === 'campaign_producer' || key === 'marketing_manager') {
    return {
      text: `Campaign draft for “${task.title}” is ready for review. ${fact} Nothing was published.`,
      result: `Campaign draft for ${task.title}.`,
    }
  }
  if (key === 'md') {
    return {
      text: `Coordination note for “${task.title}”: owners are lined up inside ${company}. Decisions that leave Quorum still need your approval.`,
      result: `MD coordination note for ${task.title}.`,
    }
  }
  if (key === 'cyber_analyst' || key === 'security_researcher') {
    return {
      text: `Internal security note for “${task.title}” stays on ${company}’s own systems in Quorum. I will not help with outside attacks.`,
      result: `Internal security note for ${task.title}.`,
    }
  }
  return {
    text: `I finished my part of “${task.title}” inside Quorum. Nothing was sent outside.`,
    result: `Work note for ${task.title}.`,
  }
}

/** Produce real staff output with the linked model (DeepSeek). Falls back to a role template. */
export async function produceStaffWork(state: AppState, person: Staff, task: Task): Promise<StaffDeliverable> {
  const local = localDeliverable(state, person, task)
  const link = readModelLink()
  if (!link) return local
  const products = state.products
    .map((product) => `${product.name} (${product.kind}): ${product.fact}`)
    .join('\n')
  const role = roleKey(state, person)
  const taxWork = role === 'finance_manager' || /\btax\b/i.test(`${task.title} ${task.description}`)
  const posting = role === 'graphic_designer' || role === 'social_manager'
  const accounts = posting ? socialAccounts(state.company?.social) : ''
  const learned = taxWork ? await learnCompany(state.company?.website) : ''
  try {
    const raw = await askModel(link, [
      {
        role: 'system',
        content: [
          `You are ${person.name}, ${person.title} at ${state.company?.name ?? 'the company'}.`,
          `Purpose: ${person.purpose}`,
          `You do: ${person.responsibilities.join('; ')}`,
          kpiOf(state, person.roleId) ? `Your KPI: ${kpiOf(state, person.roleId)}` : '',
          websiteLine(state.company?.website),
          memoryBrief(state.memory),
          accounts,
          posting
            ? 'When a post is needed, use a connected account above and draft the graphic or caption for that link. After the owner approves, file it in Quorum for that account. Do not claim it is live on the network.'
            : '',
          taxWork
            ? 'When this is a tax or finance entry, use the website summary to understand what the company does, then draft the entry for that business. File it in Quorum. Do not send it to a live tax authority.'
            : '',
          'Write the actual work product for this task the way a senior in this role would: specific, calm, and useful. 2 to 5 short paragraphs or a tight bullet list.',
          'Use this company’s real business, website, and goal. Do not invent another company, product, or client.',
          'Stay inside Quorum. Do not claim you emailed, posted, paid, hired, or controlled a computer.',
          'If the work would need an outside system, say it is drafted here and waiting on a connection or owner approval.',
          'End with a line exactly like RESULT: one-sentence summary for the owner.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Task: ${task.title}`,
          `Description: ${task.description}`,
          products ? `Products:\n${products}` : 'Products: none listed yet',
          learned ? `What the company website says:\n${learned}` : '',
          task.consequential ? `Would need approval for: ${task.consequential.summary}` : 'No consequential action yet.',
        ].join('\n'),
      },
    ])
    const match = raw.match(/(?:^|\n)\s*RESULT:\s*(.+)\s*$/i)
    const result = match?.[1]?.trim().slice(0, 220)
    const text = raw.replace(/(?:^|\n)\s*RESULT:\s*.+\s*$/i, '').trim().slice(0, 1200)
    if (!text) return local
    return { text, result: result || local.result }
  } catch {
    return local
  }
}
