import { repairStaffNames } from './staff-names'
import { departmentTemplates, grantsFrom, roleTemplates } from './catalog'
import { clockOpen, defaultLife, freshClock } from '../engine/life'
import { integrationRegistry, mergeIntegrations } from '../integrations/registry'
import { awayPresence, settledPresence } from '../office/presence'
import { nextDesk } from '../office/world'
import type {
  AppState,
  Appearance,
  Department,
  Role,
  Staff,
} from '../types'

const looks: Appearance[] = [
  { skin: '#e6c2a2', hair: '#2b211c', hairStyle: 'crop', shirt: '#1f6f6a', legs: '#243038' },
  { skin: '#c98a62', hair: '#1b1b1b', hairStyle: 'bob', shirt: '#2a628a', legs: '#2c3038' },
  { skin: '#f0d0b4', hair: '#6b4428', hairStyle: 'short', shirt: '#3d6b8a', legs: '#2a3140' },
  { skin: '#d9a679', hair: '#241812', hairStyle: 'bun', shirt: '#3e6d8c', legs: '#2d3138' },
  { skin: '#8d5a3c', hair: '#1a120e', hairStyle: 'crop', shirt: '#b86a1a', legs: '#2e2a28' },
  { skin: '#e8c4a4', hair: '#3a2418', hairStyle: 'bob', shirt: '#c47b4a', legs: '#34302c' },
  { skin: '#f2d2b6', hair: '#111111', hairStyle: 'short', shirt: '#8a4b78', legs: '#2c2830' },
  { skin: '#c9845a', hair: '#2a160e', hairStyle: 'bun', shirt: '#9a5278', legs: '#322c30' },
  { skin: '#e4b894', hair: '#4a3428', hairStyle: 'short', shirt: '#3d6b4f', legs: '#2a332e' },
  { skin: '#a86b45', hair: '#1c1410', hairStyle: 'bob', shirt: '#4e7d62', legs: '#2c332e' },
  { skin: '#f0d0b0', hair: '#d8d2cc', hairStyle: 'crop', shirt: '#8a6232', legs: '#343028' },
  { skin: '#e8c8a8', hair: '#5a4030', hairStyle: 'bun', shirt: '#6b4c7a', legs: '#2e2a34' },
  { skin: '#d7a47c', hair: '#201814', hairStyle: 'bob', shirt: '#2f4f6f', legs: '#2a3038' },
  { skin: '#f3d5ba', hair: '#2c241c', hairStyle: 'crop', shirt: '#3d6284', legs: '#2c3238' },
  { skin: '#b87850', hair: '#1a1210', hairStyle: 'none', shirt: '#3a5a78', legs: '#2a3036' },
  { skin: '#c48a62', hair: '#1c140f', hairStyle: 'bun', shirt: '#1f6f6a', legs: '#243038' },
  { skin: '#e7c3a2', hair: '#2a241c', hairStyle: 'crop', shirt: '#16343a', legs: '#242c32' },
  { skin: '#d9a06a', hair: '#3a2418', hairStyle: 'bob', shirt: '#c2512a', legs: '#2c2826' },
]

function deptId(key: string) {
  return `dept_${key}`
}

function roleId(key: string) {
  return `role_${key}`
}

export function appearanceAt(index: number): Appearance {
  return { ...looks[index % looks.length] }
}

export function blankState(reducedMotion = false): AppState {
  return {
    version: 1,
    company: null,
    departments: [],
    roles: [],
    staff: [],
    tasks: [],
    events: [],
    approvals: [],
    integrations: integrationRegistry(),
    desktop: { agentConnected: false, sessionActive: false, mode: null },
    settings: { reducedMotion, engineRunning: false, showFloor: true, agentsWorking: true, realTime: true, reportCadence: 'monthly' },
    clock: freshClock(0),
    threads: [],
    chat: [],
    designs: [],
    products: [],
    calendar: [],
    reports: [],
    records: [],
    whatsapp: [],
    prices: [],
    customers: [],
    invoices: [],
    calls: [],
    goalProposals: [],
    agentSeen: {},
    agentPulse: 0,
  }
}

export function instantiateDepartments(enabled: Set<string>): Department[] {
  return departmentTemplates.map((template) => ({
    id: deptId(template.key),
    key: template.key,
    name: template.name,
    summary: template.summary,
    roomId: template.roomId,
    color: template.color,
    enabled: enabled.has(template.key),
  }))
}

export function instantiateRoles(enabled: Set<string>): Role[] {
  return roleTemplates.map((template) => ({
    id: roleId(template.key),
    key: template.key,
    title: template.title,
    purpose: template.purpose,
    responsibilities: [...template.responsibilities],
    kpi: template.kpi,
    departmentId: deptId(template.departmentKey),
    reportsToRoleId: template.reportsToKey ? roleId(template.reportsToKey) : null,
    enabled: enabled.has(template.key),
    defaultPermissions: [...template.defaultPermissions],
  }))
}

/** Adds the security pair to a company saved before that department existed. */
export function withSecurityTeam(state: AppState): AppState {
  if (!state.company || state.staff.some((person) => person.id === 'staff_imani')) return state
  const departments = state.departments.some((item) => item.key === 'security')
    ? state.departments
    : [
        ...state.departments,
        {
          id: 'dept_security',
          key: 'security',
          name: 'Security',
          summary: 'Watches this company’s own systems from the operations room. Nothing here reaches an outside network.',
          roomId: 'operations',
          enabled: true,
          color: '#1f6f6a',
        },
      ]
  const techLead = state.roles.find((role) => role.key === 'technology_lead')
  const roles = state.roles.some((role) => role.key === 'cyber')
    ? state.roles
    : [
        ...state.roles,
        {
          id: 'role_cyber',
          key: 'cyber',
          title: 'Cybersecurity Lead',
          purpose: 'Watches the company’s own screens and servers, and brings findings to the owner.',
          responsibilities: ['Watch the operations screens for this company', 'Note anything unusual on the internal servers', 'Keep findings inside Quorum'],
          departmentId: 'dept_security',
          reportsToRoleId: techLead?.id ?? null,
          enabled: true,
          defaultPermissions: ['tech.internal', 'calendar.read'] as Role['defaultPermissions'],
        },
        {
          id: 'role_researcher',
          key: 'researcher',
          title: 'Security Researcher',
          purpose: 'The internal hacker for this company’s own systems. Tests them here and writes up what should be fixed. Does not touch anything outside Quorum.',
          responsibilities: ['Probe the company’s own systems', 'Write the finding in plain language', 'Hand the note to the Cybersecurity Lead'],
          departmentId: 'dept_security',
          reportsToRoleId: 'role_cyber',
          enabled: true,
          defaultPermissions: ['tech.internal'] as Role['defaultPermissions'],
        },
      ]
  const open = state.clock ? clockOpen(state.clock) : true
  const taken = state.staff.map((person) => ({ x: person.deskX, y: person.deskY }))
  const seeds = [
    { id: 'staff_imani', name: 'Imani Okoye', roleKey: 'cyber', managerId: state.staff.some((person) => person.id === 'staff_elise') ? 'staff_elise' : null, look: 15, salary: 2800, balance: 6400 },
    { id: 'staff_jules', name: 'Jules Berger', roleKey: 'researcher', managerId: 'staff_imani', look: 16, salary: 2200, balance: 3100 },
  ]
  const added: Staff[] = []
  for (const seed of seeds) {
    const role = roles.find((item) => item.key === seed.roleKey)
    if (!role) continue
    const desk = nextDesk('operations', taken)
    taken.push(desk)
    const look = looks[seed.look % looks.length]
    added.push({
      id: seed.id,
      name: seed.name,
      title: role.title,
      roleId: role.id,
      departmentId: 'dept_security',
      managerId: seed.managerId,
      purpose: role.purpose,
      responsibilities: [...role.responsibilities],
      grants: grantsFrom(role.defaultPermissions),
      appearance: look,
      deskX: desk.x,
      deskY: desk.y,
      roomId: desk.roomId,
      presence: open ? settledPresence(desk.x, desk.y) : awayPresence(),
      life: { ...defaultLife(state.staff.length + added.length), salary: seed.salary, balance: seed.balance },
      enabled: true,
    })
  }
  return { ...state, departments, roles, staff: [...state.staff, ...added] }
}


const PREVIOUS_PURPOSE: Record<string, string> = {
  marketing_manager:
    'Builds a content calendar for each product or service, names the platform for every post, and reviews copy before anything can be published.',
  social_manager: 'Drafts posts and schedules nothing until the owner approves the exact copy.',
  graphic_designer:
    'Reads the content calendar and designs the post scheduled for that day in Quorum’s studio, in the shape that platform needs. Does not publish.',
}

/** Fills products and calendar on older saves, and updates the three roles when they still have the previous job text. */
export function ensureOfferings(state: AppState): AppState {
  const refreshed = fillRoleKpis(repairStaffNames(refreshRoleCopy(migrateLegacy(state))))
  const integrations = mergeIntegrations(refreshed.integrations)
  const missingProducts = refreshed.products === undefined
  const missingCalendar = refreshed.calendar === undefined
  const missingRecords = refreshed.records === undefined
  const missingGoals = refreshed.goalProposals === undefined
  const missingMemory = refreshed.memory === undefined
  const sameIntegrations = integrations === refreshed.integrations
  if (!missingProducts && !missingCalendar && !missingRecords && !missingGoals && !missingMemory && refreshed === state && sameIntegrations) {
    return state
  }
  const products = refreshed.products ?? []
  return {
    ...refreshed,
    products,
    calendar: refreshed.calendar ?? [],
    records: refreshed.records ?? [],
    goalProposals: refreshed.goalProposals ?? [],
    memory: refreshed.memory ?? [],
    integrations,
  }
}

/** Maps old demo labels onto staff / in-app tooling without wiping the company. */
function migrateLegacy(state: AppState): AppState {
  let changed = false
  const tasks = state.tasks.map((task) => {
    const source = (task.source as string) === 'demo_playbook' ? ('staff' as const) : task.source
    if (source === task.source) return task
    changed = true
    return { ...task, source }
  })
  const integrations = (state.integrations ?? []).map((item) => {
    if ((item.status as string) !== 'demo_data') return item
    changed = true
    return { ...item, status: 'in_app' as const }
  })
  return changed ? { ...state, tasks, integrations } : state
}

function fillRoleKpis(state: AppState): AppState {
  let changed = false
  const roles = state.roles.map((role) => {
    if (role.kpi) return role
    const template = roleTemplates.find((item) => item.key === role.key)
    if (!template) return role
    changed = true
    return { ...role, kpi: template.kpi }
  })
  return changed ? { ...state, roles } : state
}

function refreshRoleCopy(state: AppState): AppState {
  let roles = state.roles
  let staff = state.staff
  let changed = false
  for (const [key, previous] of Object.entries(PREVIOUS_PURPOSE)) {
    const template = roleTemplates.find((item) => item.key === key)
    const role = roles.find((item) => item.key === key)
    if (!template || !role || role.purpose !== previous) continue
    changed = true
    roles = roles.map((item) =>
      item.key === key ? { ...item, purpose: template.purpose, responsibilities: [...template.responsibilities] } : item,
    )
    staff = staff.map((person) =>
      person.roleId === role.id && person.purpose === previous
        ? { ...person, purpose: template.purpose, responsibilities: [...template.responsibilities] }
        : person,
    )
  }
  if (!changed) return state
  return { ...state, roles, staff }
}

/** Adds the graphic designer to a company saved before that role existed. */
export function withDesigner(state: AppState): AppState {
  if (!state.company || state.staff.some((person) => person.id === 'staff_maya' || person.roleId === 'role_graphic_designer')) {
    return { ...state, chat: state.chat ?? [], designs: state.designs ?? [] }
  }
  const marketing = state.roles.find((role) => role.key === 'marketing_manager')
  const roles = state.roles.some((role) => role.key === 'graphic_designer')
    ? state.roles
    : [
        ...state.roles,
        {
          id: 'role_graphic_designer',
          key: 'graphic_designer',
          title: 'Graphic Designer',
          purpose:
            'Designs promotional graphics for products and services (calendar / social after approval), and in-house flyers for meetings and internal notices (DM for approval, then company group). Never posts to social.',
          responsibilities: [
            'Read the content calendar for today’s promotional posts',
            'Design Instagram, TikTok, or YouTube creatives for products and services',
            'Design in-house flyers for meetings and internal information, send them by DM for approval, then to the company group — never to social',
            'Revise a graphic when the owner or marketing manager asks for changes',
          ],
          departmentId: marketing?.departmentId ?? 'dept_marketing',
          reportsToRoleId: marketing?.id ?? null,
          enabled: true,
          defaultPermissions: ['catalog.read', 'campaign.draft'] as Role['defaultPermissions'],
        },
      ]
  const role = roles.find((item) => item.key === 'graphic_designer')
  if (!role) return { ...state, chat: state.chat ?? [], designs: state.designs ?? [], roles }
  const taken = state.staff.map((person) => ({ x: person.deskX, y: person.deskY }))
  const desk = nextDesk('marketing', taken)
  const open = state.clock ? clockOpen(state.clock) : true
  const look = looks[17 % looks.length]
  const person: Staff = {
    id: 'staff_maya',
    name: 'Maya Mensah',
    title: role.title,
    roleId: role.id,
    departmentId: role.departmentId,
    managerId: state.staff.some((item) => item.id === 'staff_samir') ? 'staff_samir' : null,
    purpose: role.purpose,
    responsibilities: [...role.responsibilities],
    grants: grantsFrom(role.defaultPermissions),
    appearance: look,
    deskX: desk.x,
    deskY: desk.y,
    roomId: desk.roomId,
    presence: open ? settledPresence(desk.x, desk.y) : awayPresence(),
    life: { ...defaultLife(state.staff.length), salary: 1700, balance: 2400, commute: 3 },
    enabled: true,
  }
  return { ...state, roles, staff: [...state.staff, person], chat: state.chat ?? [], designs: state.designs ?? [] }
}

/** Adds the markets desk to a company saved before crypto and forex traders existed. */
export function withMarketsTeam(state: AppState): AppState {
  if (!state.company || state.staff.some((person) => person.id === 'staff_ada')) return state
  const departments = state.departments.some((item) => item.key === 'markets')
    ? state.departments
    : [
        ...state.departments,
        {
          id: 'dept_markets',
          key: 'markets',
          name: 'Markets',
          summary: 'Crypto and forex desks. Live orders wait for your approval.',
          roomId: 'finance',
          enabled: true,
          color: '#1c6b4a',
        },
      ]
  const md = state.roles.find((role) => role.key === 'md')
  const specs = [
    {
      id: 'role_markets_head',
      key: 'markets_head',
      title: 'Head of Markets',
      staffId: 'staff_ada',
      name: 'Ada Okonkwo',
      reportsTo: md?.id ?? null,
      managerId: state.staff.some((item) => item.id === 'staff_morgan') ? 'staff_morgan' : null,
      permissions: ['finance.read', 'trade.propose', 'calendar.read'] as Role['defaultPermissions'],
      purpose: 'Sets risk limits for crypto and forex. Does not place orders alone.',
    },
    {
      id: 'role_crypto_trader',
      key: 'crypto_trader',
      title: 'Crypto Trader',
      staffId: 'staff_kenji',
      name: 'Kenji Mori',
      reportsTo: 'role_markets_head',
      managerId: 'staff_ada',
      permissions: ['finance.read', 'trade.propose', 'trade.execute'] as Role['defaultPermissions'],
      purpose: 'Proposes crypto trades on venues that stay connected until you disconnect.',
    },
    {
      id: 'role_forex_trader',
      key: 'forex_trader',
      title: 'Forex Trader',
      staffId: 'staff_nora',
      name: 'Nora Lind',
      reportsTo: 'role_markets_head',
      managerId: 'staff_ada',
      permissions: ['finance.read', 'trade.propose', 'trade.execute'] as Role['defaultPermissions'],
      purpose: 'Proposes forex trades on brokers that stay connected until you disconnect.',
    },
  ]
  let roles = state.roles
  for (const spec of specs) {
    if (roles.some((role) => role.key === spec.key)) continue
    roles = [
      ...roles,
      {
        id: spec.id,
        key: spec.key,
        title: spec.title,
        purpose: spec.purpose,
        responsibilities: ['Propose size and stop', 'Wait for approval before a live order'],
        departmentId: 'dept_markets',
        reportsToRoleId: spec.reportsTo,
        enabled: true,
        defaultPermissions: spec.permissions,
      },
    ]
  }
  const open = state.clock ? clockOpen(state.clock) : true
  const taken = state.staff.map((person) => ({ x: person.deskX, y: person.deskY }))
  const people: Staff[] = []
  specs.forEach((spec, index) => {
    if (state.staff.some((person) => person.id === spec.staffId)) return
    const role = roles.find((item) => item.key === spec.key)
    if (!role) return
    const desk = nextDesk('finance', [...taken, ...people.map((person) => ({ x: person.deskX, y: person.deskY }))])
    const look = looks[(18 + index) % looks.length]
    people.push({
      id: spec.staffId,
      name: spec.name,
      title: role.title,
      roleId: role.id,
      departmentId: 'dept_markets',
      managerId: spec.managerId,
      purpose: role.purpose,
      responsibilities: [...role.responsibilities],
      grants: grantsFrom(role.defaultPermissions),
      appearance: look,
      deskX: desk.x,
      deskY: desk.y,
      roomId: desk.roomId,
      presence: open ? settledPresence(desk.x, desk.y) : awayPresence(),
      life: { ...defaultLife(state.staff.length + index), salary: 2100, balance: 3200, commute: 4 },
      enabled: true,
    })
  })
  return { ...state, departments, roles, staff: [...state.staff, ...people] }
}

/** Adds the sports analyst when a company was saved before that role existed. */
export function withSportsAnalyst(state: AppState): AppState {
  if (!state.company) return state
  const existingRole = state.roles.find((role) => role.key === 'sports_analyst')
  if (existingRole && state.staff.some((person) => person.roleId === existingRole.id)) return state
  if (state.staff.some((person) => person.id === 'staff_sable')) return state
  const departments = state.departments.some((item) => item.key === 'markets')
    ? state.departments
    : [
        ...state.departments,
        {
          id: 'dept_markets',
          key: 'markets',
          name: 'Markets',
          summary: 'Crypto, forex, and sports. Live orders and slips wait for your approval.',
          roomId: 'finance',
          enabled: true,
          color: '#1c6b4a',
        },
      ]
  const head = state.roles.find((role) => role.key === 'markets_head')
  const md = state.roles.find((role) => role.key === 'md')
  const roles = existingRole
    ? state.roles
    : [
        ...state.roles,
        {
          id: 'role_sports_analyst',
          key: 'sports_analyst',
          title: 'Sports Analyst',
          purpose:
            'Coach’s coach for every sport. Publishes only a near-sure slip. Does not call a bet a guaranteed win.',
          responsibilities: [
            'Read game plan, personnel, matchups, and conditions',
            'Name only sport-native plays that clear the near-sure bar',
            'Hold the slip until the owner approves the stake',
          ],
          departmentId: 'dept_markets',
          reportsToRoleId: head?.id ?? md?.id ?? null,
          enabled: true,
          defaultPermissions: ['finance.read', 'bet.propose', 'bet.place', 'calendar.read'] as Role['defaultPermissions'],
        },
      ]
  const role = roles.find((item) => item.key === 'sports_analyst')
  if (!role) return { ...state, departments, roles }
  const open = state.clock ? clockOpen(state.clock) : true
  const taken = state.staff.map((person) => ({ x: person.deskX, y: person.deskY }))
  const desk = nextDesk('finance', taken)
  const person: Staff = {
    id: 'staff_sable',
    name: 'Sable Hart',
    title: role.title,
    roleId: role.id,
    departmentId: 'dept_markets',
    managerId: state.staff.some((item) => item.id === 'staff_ada') ? 'staff_ada' : null,
    purpose: role.purpose,
    responsibilities: [...role.responsibilities],
    grants: grantsFrom(role.defaultPermissions),
    appearance: looks[5 % looks.length],
    deskX: desk.x,
    deskY: desk.y,
    roomId: desk.roomId,
    presence: open ? settledPresence(desk.x, desk.y) : awayPresence(),
    life: { ...defaultLife(state.staff.length), salary: 2200, balance: 3400, commute: 2 },
    enabled: true,
  }
  return { ...state, departments, roles, staff: [...state.staff, person] }
}
