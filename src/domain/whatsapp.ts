import type { Priority } from '../types'

export type ClientLane = {
  keys: string[]
  priority: Priority
  refused: boolean
}

const LANES: { keys: string[]; priority: Priority; pattern: RegExp }[] = [
  { keys: ['quote_specialist', 'account_executive', 'sales_manager'], priority: 'high', pattern: /\b(quote|price|pricing|order|solar|invoice|po)\b/i },
  { keys: ['finance_manager'], priority: 'high', pattern: /\b(payment|refund|receipt|bank|payroll)\b/i },
  { keys: ['hr_manager'], priority: 'medium', pattern: /\b(hire|hiring|job|cv|resume|vacancy|recruit)\b/i },
  { keys: ['graphic_designer'], priority: 'medium', pattern: /\b(design|logo|poster|flyer|graphic)\b/i },
  { keys: ['social_manager'], priority: 'medium', pattern: /\b(instagram|tiktok|youtube|caption|social post)\b/i },
  { keys: ['pr_manager'], priority: 'medium', pattern: /\b(press|journalist|announcement|\bpr\b)\b/i },
  { keys: ['buyer', 'procurement_manager'], priority: 'medium', pattern: /\b(supplier|stock|procurement)\b/i },
  { keys: ['systems_engineer', 'technology_lead', 'release_engineer'], priority: 'medium', pattern: /\b(website|login|bug|system|app)\b/i },
]

/** Which desk should take a client message. A general hello goes to Sales. */
export function clientLane(text: string): ClientLane {
  if (/\b(hack|exploit|malware|phish|ransomware)\b/i.test(text)) {
    return { keys: [], priority: 'low', refused: true }
  }
  const hit = LANES.find((lane) => lane.pattern.test(text))
  if (hit) return { keys: hit.keys, priority: hit.priority, refused: false }
  return { keys: ['account_executive', 'sales_manager'], priority: 'medium', refused: false }
}

export function pickStaff<T extends { roleKey: string; active: boolean }>(people: T[], keys: string[]): T | null {
  for (const key of keys) {
    const person = people.find((item) => item.active && item.roleKey === key)
    if (person) return person
  }
  return null
}

/** A short reply when the conversation planner is not used. */
export function clientReply(company: string, person: { name: string; title: string } | null, refused: boolean): string {
  if (refused) return `${company} only handles requests for this company. I can’t help with breaking into anything.`
  if (!person) return `Hello, this is ${company}. Thank you for writing. I have kept your message for the owner.`
  return `Hello, this is ${person.name} from ${company}. How can I help you today?`
}
