import type { Integration } from '../types'

/**
 * Connection registry. in_app means the tool runs inside Quorum (staff AI, studio,
 * desktop agent, or Quorum hold/ledger). Outside networks (live social APIs, SMTP)
 * are not claimed — approved work is filed here first.
 */
export function mergeIntegrations(current: Integration[] | undefined): Integration[] {
  const catalog = integrationRegistry()
  const byId = new Map((current ?? []).map((item) => [item.id, item]))
  let changed = !current || current.length !== catalog.length
  const next = catalog.map((item) => {
    const existing = byId.get(item.id)
    if (!existing) {
      changed = true
      return item
    }
    // Catalog is source of truth so upgrades from not_connected stick.
    if (
      existing.name === item.name &&
      existing.summary === item.summary &&
      existing.connectionPoint === item.connectionPoint &&
      existing.status === item.status
    ) {
      return existing
    }
    changed = true
    return { ...item }
  })
  return changed ? next : current!
}

export function integrationRegistry(): Integration[] {
  return [
    {
      id: 'staff_brain',
      name: 'Staff AI brain',
      category: 'AI',
      status: 'in_app',
      summary:
        'Every role uses the chat model you link under Chat (DeepSeek recommended) to draft real work: quotes, captions, PR, procurement notes, finance, HR packs, and tech checklists. Results stay in Quorum.',
      connectionPoint: 'Chat → Link a model. Without a link, staff still answer from their roles with built-in drafts.',
      usedBy: 'All staff',
    },
    {
      id: 'catalog',
      name: 'Product catalog',
      category: 'Catalog',
      status: 'in_app',
      summary: 'Products come from this company’s offerings and goals inside Quorum. Not a separate PIM.',
      connectionPoint: 'Products come from this company’s goals inside Quorum.',
      usedBy: 'Sales, Marketing, Technology',
    },
    {
      id: 'crm',
      name: 'CRM',
      category: 'Sales',
      status: 'in_app',
      summary: 'Sales files lead and account notes in Quorum. No Salesforce-style cloud CRM is linked.',
      connectionPoint: 'Staff AI drafts CRM notes in chat and on tasks. Approved external mail still goes through Email.',
      usedBy: 'Sales',
    },
    {
      id: 'whatsapp',
      name: 'Company WhatsApp',
      category: 'Messages',
      status: 'in_app',
      summary:
        'A client messages this company’s WhatsApp Cloud API number. The assigned staff member replies in a normal sales conversation. A price is sent only after you confirm it, and a price older than two days is checked with you again. Each company connects its own line.',
      connectionPoint:
        'Integrations → Company WhatsApp: paste this company’s Cloud API token and phone number id. Or set WHATSAPP_* in .env for a single-tenant fallback. Webhook: public https + /api/whatsapp/webhook with WHATSAPP_VERIFY_TOKEN.',
      usedBy: 'Quorum, then the staff agent for the request',
    },
    {
      id: 'email',
      name: 'Email',
      category: 'Messages',
      status: 'in_app',
      summary:
        'Approved external messages are held in Quorum’s outbox. Nothing leaves this computer until a mailbox adapter is added later.',
      connectionPoint: 'Approve a send_external request. The exact copy is filed under Company records as held mail.',
      usedBy: 'Sales',
    },
    {
      id: 'content_calendar',
      name: 'Content calendar',
      category: 'Marketing',
      status: 'in_app',
      summary:
        'Marketing builds a monthly calendar (weekdays, Feed / Carousel / Reels / TikTok / YouTube sizes, captions) and files a branded PDF. The linked model polishes titles and captions.',
      connectionPoint: 'Link DeepSeek under Chat for richer captions. The calendar and PDF already run in Quorum.',
      usedBy: 'Marketing Manager',
    },
    {
      id: 'graphics',
      name: 'Graphics studio',
      category: 'Design',
      status: 'in_app',
      summary:
        'Maya designs promotional and in-house graphics in Quorum. OPENAI_API_KEY on the server adds a photograph layer. Nothing is posted.',
      connectionPoint: 'Put OPENAI_API_KEY in .env for photos. Studio layouts work without it.',
      usedBy: 'Graphic Designer',
    },
    {
      id: 'social',
      name: 'Social platforms',
      category: 'Publishing',
      status: 'in_app',
      summary:
        'The social media agent publishes approved Instagram feed posts to this company’s connected Business account. TikTok and LinkedIn stay held until those lines are added.',
      connectionPoint:
        'Integrations → Social platforms → Connect Instagram (OAuth). Platform needs META_APP_* and META_PUBLIC_BASE. Or set INSTAGRAM_* in .env for a single-tenant fallback. Approve a graphic in chat to publish.',
      usedBy: 'Social Media',
    },
    {
      id: 'pr',
      name: 'PR / newswire',
      category: 'Publishing',
      status: 'in_app',
      summary:
        'Approved announcements are held in Quorum. No newswire is linked, so nothing is released outside the company.',
      connectionPoint: 'Approve a PR publish request. The release text is stored as a held PR record.',
      usedBy: 'PR',
    },
    {
      id: 'calendar',
      name: 'External calendar',
      category: 'Planning',
      status: 'in_app',
      summary:
        'Standups and planning notes are kept in Quorum. Google/Outlook sync is not linked; the marketing content calendar is separate and already works.',
      connectionPoint: 'Managers plan in Chat and tasks. Events can be filed as calendar records when approved work needs a date.',
      usedBy: 'Managing Director, managers',
    },
    {
      id: 'suppliers',
      name: 'Supplier systems',
      category: 'Procurement',
      status: 'in_app',
      summary:
        'Procurement comparisons and approved purchase notes are filed in Quorum. Live supplier portals are not linked, so no PO is placed outside.',
      connectionPoint: 'Approve a purchase request. The order note is stored as a purchase record.',
      usedBy: 'Procurement',
    },
    {
      id: 'finance',
      name: 'Finance system',
      category: 'Finance',
      status: 'in_app',
      summary:
        'Margin notes and approved finance changes are filed in Quorum’s ledger. No bank or accounting SaaS is linked.',
      connectionPoint: 'Approve a finance_change request. The entry is stored as a finance record.',
      usedBy: 'Finance',
    },
    {
      id: 'hr',
      name: 'HR system',
      category: 'People',
      status: 'in_app',
      summary:
        'Hiring packs and approved offer decisions are filed in Quorum. No external HRIS sends mail or updates itself.',
      connectionPoint: 'Approve a hiring request. The pack is stored as an HR record.',
      usedBy: 'HR',
    },
    {
      id: 'desktop',
      name: 'Desktop control',
      category: 'This computer',
      status: 'in_app',
      summary:
        'Local agent on this Windows PC. Allowing Quorum from chat starts a Live session: it stays on the computer until the work is done, and asks again when extra permission is needed. Staff tasks can still use Approved (one bounded run) or Live.',
      connectionPoint:
        'Ask Quorum in chat, then Allow. Or Integrations → Desktop control → pick Approved or Live → Start session. End the session anytime; sessions do not survive refresh.',
      usedBy: 'Only staff with desktop permission, and only after approval',
    },
  ]
}
