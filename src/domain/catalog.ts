import { PERMISSIONS, type Department, type PermissionId, type Role } from '../types'

export type DepartmentTemplate = Omit<Department, 'id' | 'enabled'>
export type RoleTemplate = Omit<Role, 'id' | 'departmentId' | 'reportsToRoleId' | 'enabled'> & {
  departmentKey: string
  reportsToKey: string | null
  kpi: string
}

export const departmentTemplates: DepartmentTemplate[] = [
  {
    key: 'executive',
    name: 'Executive',
    summary: 'Runs the operating rhythm and keeps every other desk pointed at the company goals.',
    roomId: 'executive',
    color: '#1f6f6a',
  },
  {
    key: 'sales',
    name: 'Sales',
    summary: 'Turns inbound leads into quotes and keeps customer promises specific.',
    roomId: 'sales',
    color: '#2a628a',
  },
  {
    key: 'marketing',
    name: 'Marketing',
    summary: 'Plans campaigns and the story around products before anything is published.',
    roomId: 'marketing',
    color: '#b86a1a',
  },
  {
    key: 'communications',
    name: 'Communications',
    summary: 'Drafts social posts and public announcements for the owner to approve.',
    roomId: 'comms',
    color: '#8a4b78',
  },
  {
    key: 'procurement',
    name: 'Procurement',
    summary: 'Checks stock notes, compares supplier quotes, and prepares purchase requests.',
    roomId: 'procurement',
    color: '#3d6b4f',
  },
  {
    key: 'finance',
    name: 'Finance',
    summary: 'Reads margins and payment terms. Cannot change the books without approval.',
    roomId: 'finance',
    color: '#8a6232',
  },
  {
    key: 'people',
    name: 'People',
    summary: 'Prepares hiring requests and keeps role descriptions current.',
    roomId: 'people',
    color: '#6b4c7a',
  },
  {
    key: 'technology',
    name: 'Technology',
    summary: 'Owns launch checklists and internal technical readiness.',
    roomId: 'technology',
    color: '#2f4f6f',
  },
  {
    key: 'markets',
    name: 'Markets',
    summary: 'Crypto, forex, and sports. They propose trades and slips. Live orders wait for your approval. Quorum stays linked until you disconnect.',
    roomId: 'finance',
    color: '#1c6b4a',
  },
  {
    key: 'security',
    name: 'Security',
    summary: 'Watches this company’s own systems from the operations room. Nothing here reaches an outside network.',
    roomId: 'operations',
    color: '#1f6f6a',
  },
]

export const roleTemplates: RoleTemplate[] = [
  {
    key: 'md',
    title: 'Managing Director',
    departmentKey: 'executive',
    reportsToKey: null,
    purpose: 'Coordinates the managers so the owner sees decisions, not noise.',
    responsibilities: [
      'Turn company goals into work for each manager',
      'Chase blockers that cross departments',
      'Bring consequential decisions to the owner',
    ],
    kpi: 'Every approved goal has an owner and a next task within the week.',
    defaultPermissions: ['catalog.read', 'crm.read', 'finance.read', 'hr.read', 'calendar.read', 'supplier.read'],
  },
  {
    key: 'sales_manager',
    title: 'Sales Manager',
    departmentKey: 'sales',
    reportsToKey: 'md',
    purpose: 'Owns leads, quotes, and the promise Sales makes to a buyer.',
    responsibilities: [
      'Qualify inbound leads',
      'Match products to the request',
      'Ask Procurement and Finance for facts before a quote goes out',
    ],
    kpi: 'A qualified lead has a quote draft within two business days.',
    defaultPermissions: ['catalog.read', 'crm.read', 'email.draft', 'email.send_external', 'calendar.read'],
  },
  {
    key: 'marketing_manager',
    title: 'Marketing Manager',
    departmentKey: 'marketing',
    reportsToKey: 'md',
    purpose:
      'Builds a detailed monthly content calendar for each product or service (weekdays, formats, pixel sizes, captions), files it as a PDF, and reviews promotional graphics before anything can be published.',
    responsibilities: [
      'Plan a full month of posts with Monday–Friday slots',
      'Name Instagram Feed, Carousel, Reels, TikTok, and YouTube sizes for every post',
      'Write caption drafts and objectives; keep every claim inside an approved product fact',
      'File the calendar PDF in the company chat and review promotional graphics',
    ],
    kpi: 'Each product has a weekday content calendar filed before the month starts.',
    defaultPermissions: ['catalog.read', 'campaign.draft', 'calendar.read'],
  },
  {
    key: 'social_manager',
    title: 'Social Media Manager',
    departmentKey: 'communications',
    reportsToKey: 'marketing_manager',
    purpose: 'Takes an approved graphic, writes the caption for the platform on the content calendar, and holds the post until a social account is connected.',
    responsibilities: [
      'Write the caption in the voice of the platform named on the calendar',
      'Hold the post in Quorum when no social account is connected',
      'Flag claims that need a source',
    ],
    kpi: 'Every scheduled post has a caption held for approval before its calendar day.',
    defaultPermissions: ['campaign.draft', 'social.draft', 'social.publish'],
  },
  {
    key: 'pr_manager',
    title: 'PR Manager',
    departmentKey: 'communications',
    reportsToKey: 'marketing_manager',
    purpose: 'Drafts announcements and media notes. Does not release them.',
    responsibilities: [
      'Draft announcements from product facts',
      'Prepare a short Q&A for the owner',
      'Submit release requests for approval',
    ],
    kpi: 'An announcement is drafted and submitted for approval before its release date.',
    defaultPermissions: ['catalog.read', 'pr.draft', 'pr.publish'],
  },
  {
    key: 'procurement_manager',
    title: 'Procurement Manager',
    departmentKey: 'procurement',
    reportsToKey: 'md',
    purpose: 'Keeps quote and stock requests moving, and stops purchases that lack approval.',
    responsibilities: [
      'Answer stock questions from Sales',
      'Compare supplier quotes',
      'Submit purchase requests for approval',
    ],
    kpi: 'Sales gets a stock or supplier answer within one business day, and no purchase moves without approval.',
    defaultPermissions: ['catalog.read', 'supplier.read', 'purchase.create'],
  },
  {
    key: 'hr_manager',
    title: 'HR Manager',
    departmentKey: 'people',
    reportsToKey: 'md',
    purpose: 'Prepares role requests and hiring packs. Does not hire alone.',
    responsibilities: [
      'Write the role and the reason to hire',
      'Keep responsibilities aligned with the org chart',
      'Submit hiring decisions for approval',
    ],
    kpi: 'Every open role request states why the hire is needed and waits for the owner.',
    defaultPermissions: ['hr.read', 'hr.hire', 'calendar.read'],
  },
  {
    key: 'finance_manager',
    title: 'Finance Manager',
    departmentKey: 'finance',
    reportsToKey: 'md',
    purpose: 'Explains margin, terms, and whether a quote is safe. Does not edit the books alone.',
    responsibilities: [
      'Review payment terms on supplier quotes',
      'Prepare margin notes for the owner',
      'Flag any change that would touch financial records',
    ],
    kpi: 'A quote is not called safe until it has a margin note.',
    defaultPermissions: ['finance.read', 'finance.write', 'supplier.read'],
  },
  {
    key: 'markets_head',
    title: 'Head of Markets',
    departmentKey: 'markets',
    reportsToKey: 'md',
    purpose: 'Sets risk limits for crypto and forex. Blocks a trade that has no stop or is too large. Does not place orders alone.',
    responsibilities: [
      'Keep the daily markets brief',
      'Reject proposals that break size or stop rules',
      'Bring every live order to the owner',
    ],
    kpi: 'No live order is requested without a stop and a size inside the company limit.',
    defaultPermissions: ['finance.read', 'trade.propose', 'calendar.read'],
  },
  {
    key: 'crypto_trader',
    title: 'Crypto Trader',
    departmentKey: 'markets',
    reportsToKey: 'markets_head',
    purpose: 'Watches linked crypto venues and writes trade proposals. A connected account stays logged in until you disconnect.',
    responsibilities: [
      'Watch the linked exchange',
      'Propose entry, size, and stop',
      'Ask to place or cancel only after the owner approves',
    ],
    kpi: 'Every crypto proposal names the venue, size, and stop.',
    defaultPermissions: ['finance.read', 'trade.propose', 'trade.execute'],
  },
  {
    key: 'forex_trader',
    title: 'Forex Trader',
    departmentKey: 'markets',
    reportsToKey: 'markets_head',
    purpose: 'Watches linked forex brokers and writes trade proposals with session and stop.',
    responsibilities: [
      'Watch the linked broker',
      'Propose pair, size, and stop',
      'Ask to place or cancel only after the owner approves',
    ],
    kpi: 'Every forex proposal names the pair, size, and stop.',
    defaultPermissions: ['finance.read', 'trade.propose', 'trade.execute'],
  },
  {
    key: 'sports_analyst',
    title: 'Sports Analyst',
    departmentKey: 'markets',
    reportsToKey: 'markets_head',
    purpose:
      'Coach’s coach for every sport. Publishes only a near-sure, sport-native slip after professional research. Does not call a bet a guaranteed win.',
    responsibilities: [
      'Read the event the way a head coach’s coach would: game plan, personnel, matchups, and conditions',
      'Name only the markets whose pattern clears the near-sure bar, in that sport’s own language',
      'Hold the slip until the owner approves the stake',
    ],
    kpi: 'A slip ships only when every play is specific, sport-native, and near-sure. Otherwise there is no stake.',
    defaultPermissions: ['finance.read', 'bet.propose', 'bet.place', 'calendar.read'],
  },
  {
    key: 'technology_lead',
    title: 'Head of Technology',
    departmentKey: 'technology',
    reportsToKey: 'md',
    purpose: 'Keeps launch checklists honest. Desktop control is separate and off unless granted.',
    responsibilities: [
      'Maintain the software launch checklist',
      'Call out technical blockers before a launch date is promised',
      'Request desktop access only for a named, visible session',
    ],
    kpi: 'The launch checklist is current, and blockers are named before a date is promised.',
    defaultPermissions: ['tech.internal', 'catalog.read', 'calendar.read'],
  },
  {
    key: 'account_executive',
    title: 'Account Executive',
    departmentKey: 'sales',
    reportsToKey: 'sales_manager',
    purpose: 'Works named accounts and brings quotes back to the Sales Manager.',
    responsibilities: ['Keep the lead record current', 'Collect the buyer’s requirements', 'Hand pricing questions to the quote specialist'],
    kpi: 'Each named account has current requirements on its lead record.',
    defaultPermissions: ['catalog.read', 'crm.read'],
  },
  {
    key: 'quote_specialist',
    title: 'Quote Specialist',
    departmentKey: 'sales',
    reportsToKey: 'sales_manager',
    purpose: 'Builds quote drafts from catalog prices and procurement notes.',
    responsibilities: ['Draft quotes for the Sales Manager to review', 'Check bundle contents against the catalog', 'Never send a quote without approval'],
    kpi: 'Quote drafts match the catalog and wait for the Sales Manager.',
    defaultPermissions: ['catalog.read', 'email.draft'],
  },
  {
    key: 'graphic_designer',
    title: 'Graphic Designer',
    departmentKey: 'marketing',
    reportsToKey: 'marketing_manager',
    purpose:
      'Designs promotional graphics for products and services (calendar / social after approval), and in-house flyers for meetings and internal notices (DM for approval, then company group). Never posts to social.',
    responsibilities: [
      'Read the content calendar for today’s promotional posts',
      'Design Instagram, TikTok, or YouTube creatives for products and services',
      'Design in-house flyers for meetings and internal information, send them by DM for approval, then to the company group — never to social',
      'Revise a graphic when the owner or marketing manager asks for changes',
    ],
    kpi: 'Today’s calendar graphic is in review before the day ends.',
    defaultPermissions: ['catalog.read', 'campaign.draft'],
  },
  {
    key: 'campaign_producer',
    title: 'Campaign Producer',
    departmentKey: 'marketing',
    reportsToKey: 'marketing_manager',
    purpose: 'Turns a campaign brief into drafts the Marketing Manager can review.',
    responsibilities: ['Assemble the campaign kit', 'Track which claims are still unverified', 'Hand finished drafts to Communications'],
    kpi: 'Each campaign draft lists which claims are still unverified.',
    defaultPermissions: ['catalog.read', 'campaign.draft'],
  },
  {
    key: 'buyer',
    title: 'Buyer',
    departmentKey: 'procurement',
    reportsToKey: 'procurement_manager',
    purpose: 'Compares supplier quotes and prepares the purchase request.',
    responsibilities: ['Line up supplier quotes', 'Note lead times and payment terms', 'Stop before any order is placed'],
    kpi: 'A purchase request lists lead time, payment terms, and at least two supplier quotes.',
    defaultPermissions: ['catalog.read', 'supplier.read', 'purchase.create'],
  },
  {
    key: 'release_engineer',
    title: 'Release Engineer',
    departmentKey: 'technology',
    reportsToKey: 'technology_lead',
    purpose: 'Ticks through the launch checklist the Head of Technology owns.',
    responsibilities: ['Update the checklist', 'Flag a failed check immediately', 'Stay inside internal systems'],
    kpi: 'A failed launch check is flagged the same day.',
    defaultPermissions: ['tech.internal'],
  },
  {
    key: 'systems_engineer',
    title: 'Systems Engineer',
    departmentKey: 'technology',
    reportsToKey: 'technology_lead',
    purpose: 'Looks after internal imports and environment notes.',
    responsibilities: ['Prepare internal import steps', 'Record missing files as blockers', 'Avoid production changes without a task'],
    kpi: 'Missing import files are recorded as blockers before a run is called ready.',
    defaultPermissions: ['tech.internal'],
  },
  {
    key: 'cyber',
    title: 'Cybersecurity Lead',
    departmentKey: 'security',
    reportsToKey: 'technology_lead',
    purpose: 'Watches the company’s own screens and servers, and brings findings to the owner.',
    responsibilities: [
      'Watch the operations screens for this company',
      'Note anything unusual on the internal servers',
      'Keep findings inside Quorum',
    ],
    kpi: 'A finding on this company’s own systems is written up the day it is seen.',
    defaultPermissions: ['tech.internal', 'calendar.read'],
  },
  {
    key: 'researcher',
    title: 'Security Researcher',
    departmentKey: 'security',
    reportsToKey: 'cyber',
    purpose: 'The internal hacker for this company’s own systems. Tests them here and writes up what should be fixed. Does not touch anything outside Quorum.',
    responsibilities: [
      'Probe the company’s own systems',
      'Write the finding in plain language',
      'Hand the note to the Cybersecurity Lead',
    ],
    kpi: 'Each test of this company’s own systems ends as a plain-language finding.',
    defaultPermissions: ['tech.internal'],
  },
]

export const businessTypePresets = [
  'IT hardware, devices, and software',
  'Software and SaaS',
  'Professional services',
  'Consulting',
  'Retail',
  'Food and beverage',
  'Hospitality',
  'Construction and real estate',
  'Manufacturing',
  'Logistics and transport',
  'Healthcare',
  'Education',
  'Finance and insurance',
  'Media and creative',
  'Agriculture',
  'Energy',
  'Legal',
  'Nonprofit',
  'Other',
]

export function permissionMeta(id: PermissionId) {
  const found = PERMISSIONS.find((item) => item.id === id)
  if (!found) throw new Error(`Unknown permission ${id}`)
  return found
}

export function grantsFrom(ids: PermissionId[]): Partial<Record<PermissionId, boolean>> {
  const grants: Partial<Record<PermissionId, boolean>> = {}
  for (const permission of PERMISSIONS) {
    grants[permission.id] = ids.includes(permission.id)
  }
  grants['desktop.control'] = false
  return grants
}
