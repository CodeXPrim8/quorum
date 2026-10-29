import { PERMISSIONS, type Department, type PermissionId, type Role } from '../types'

export type DepartmentTemplate = Omit<Department, 'id' | 'enabled'>
export type RoleTemplate = Omit<Role, 'id' | 'departmentId' | 'reportsToRoleId' | 'enabled'> & {
  departmentKey: string
  reportsToKey: string | null
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
    summary: 'Checks sample stock, compares supplier quotes, and prepares purchase requests.',
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
    defaultPermissions: ['catalog.read', 'crm.read', 'email.draft', 'email.send_external', 'calendar.read'],
  },
  {
    key: 'marketing_manager',
    title: 'Marketing Manager',
    departmentKey: 'marketing',
    reportsToKey: 'md',
    purpose: 'Builds a content calendar for each product or service, names the platform for every post, and reviews copy before anything can be published.',
    responsibilities: [
      'Write a content calendar for each product, with the day, the point, and the platform',
      'Put product stills on Instagram, short demos on TikTok, and explainers on YouTube',
      'Keep every claim inside an approved product fact',
      'Review social and PR drafts',
    ],
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
    defaultPermissions: ['finance.read', 'finance.write', 'supplier.read'],
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
    defaultPermissions: ['tech.internal', 'catalog.read', 'calendar.read'],
  },
  {
    key: 'account_executive',
    title: 'Account Executive',
    departmentKey: 'sales',
    reportsToKey: 'sales_manager',
    purpose: 'Works named accounts and brings quotes back to the Sales Manager.',
    responsibilities: ['Keep the lead record current', 'Collect the buyer’s requirements', 'Hand pricing questions to the quote specialist'],
    defaultPermissions: ['catalog.read', 'crm.read'],
  },
  {
    key: 'quote_specialist',
    title: 'Quote Specialist',
    departmentKey: 'sales',
    reportsToKey: 'sales_manager',
    purpose: 'Builds quote drafts from catalog prices and procurement notes.',
    responsibilities: ['Draft quotes for the Sales Manager to review', 'Check bundle contents against the catalog', 'Never send a quote without approval'],
    defaultPermissions: ['catalog.read', 'email.draft'],
  },
  {
    key: 'graphic_designer',
    title: 'Graphic Designer',
    departmentKey: 'marketing',
    reportsToKey: 'marketing_manager',
    purpose: 'Reads the content calendar and designs the post scheduled for that day, in the shape that platform needs. Does not publish.',
    responsibilities: [
      'Read the content calendar for today’s posts',
      'Design the Instagram flyer, the TikTok cover, or the YouTube thumbnail named there',
      'Send the finished graphic to the company chat',
      'Revise it when the owner asks for changes',
    ],
    defaultPermissions: ['catalog.read', 'campaign.draft'],
  },
  {
    key: 'campaign_producer',
    title: 'Campaign Producer',
    departmentKey: 'marketing',
    reportsToKey: 'marketing_manager',
    purpose: 'Turns a campaign brief into drafts the Marketing Manager can review.',
    responsibilities: ['Assemble the campaign kit', 'Track which claims are still unverified', 'Hand finished drafts to Communications'],
    defaultPermissions: ['catalog.read', 'campaign.draft'],
  },
  {
    key: 'buyer',
    title: 'Buyer',
    departmentKey: 'procurement',
    reportsToKey: 'procurement_manager',
    purpose: 'Compares supplier quotes and prepares the purchase request.',
    responsibilities: ['Line up sample quotes', 'Note lead times and payment terms', 'Stop before any order is placed'],
    defaultPermissions: ['catalog.read', 'supplier.read', 'purchase.create'],
  },
  {
    key: 'release_engineer',
    title: 'Release Engineer',
    departmentKey: 'technology',
    reportsToKey: 'technology_lead',
    purpose: 'Ticks through the launch checklist the Head of Technology owns.',
    responsibilities: ['Update the checklist', 'Flag a failed check immediately', 'Stay inside internal systems'],
    defaultPermissions: ['tech.internal'],
  },
  {
    key: 'systems_engineer',
    title: 'Systems Engineer',
    departmentKey: 'technology',
    reportsToKey: 'technology_lead',
    purpose: 'Looks after internal imports and environment notes.',
    responsibilities: ['Prepare internal import steps', 'Record missing files as blockers', 'Avoid production changes without a task'],
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
    defaultPermissions: ['tech.internal', 'calendar.read'],
  },
  {
    key: 'researcher',
    title: 'Security Researcher',
    departmentKey: 'security',
    reportsToKey: 'cyber',
    purpose: 'The internal hacker for this company’s own systems. Tests them here and writes up what should be fixed. Does not touch anything outside Quorum.',
    responsibilities: [
      'Probe the company’s own demo systems',
      'Write the finding in plain language',
      'Hand the note to the Cybersecurity Lead',
    ],
    defaultPermissions: ['tech.internal'],
  },
]

export const businessTypePresets = [
  'IT hardware, devices, and software',
  'Professional services',
  'Retail',
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
