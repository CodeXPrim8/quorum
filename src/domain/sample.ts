import { northlineProducts } from './calendar'
import { departmentTemplates, grantsFrom, roleTemplates } from './catalog'
import { clockOpen, defaultLife, freshClock } from '../engine/life'
import { integrationRegistry } from '../integrations/registry'
import { iso } from '../lib/format'
import { awayPresence, settledPresence } from '../office/presence'
import { nextDesk } from '../office/world'
import type {
  ActivityEvent,
  AppState,
  Appearance,
  Department,
  HairStyle,
  Role,
  Staff,
  StaffLife,
  Task,
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
    desktop: { agentConnected: false, sessionActive: false },
    settings: { reducedMotion, engineRunning: false, showFloor: true, agentsWorking: true },
    clock: freshClock(0),
    threads: [],
    chat: [],
    designs: [],
    products: [],
    calendar: [],
    reports: [],
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
    departmentId: deptId(template.departmentKey),
    reportsToRoleId: template.reportsToKey ? roleId(template.reportsToKey) : null,
    enabled: enabled.has(template.key),
    defaultPermissions: [...template.defaultPermissions],
  }))
}

type Seed = {
  id: string
  name: string
  roleKey: string
  managerId: string | null
  look: number
  responsibilities?: string[]
  life?: Partial<StaffLife>
}

const cast: Seed[] = [
  { id: 'staff_morgan', name: 'Morgan Hale', roleKey: 'md', managerId: null, look: 0, life: { salary: 3200, balance: 6400, marital: 'married', spouse: 'Jordan Hale', commute: 0 } },
  { id: 'staff_priya', name: 'Priya Shah', roleKey: 'sales_manager', managerId: 'staff_morgan', look: 1, life: { salary: 2400, balance: 4100, marital: 'married', spouse: 'Arun Shah', commute: 1 } },
  { id: 'staff_jonah', name: 'Jonah Ellis', roleKey: 'account_executive', managerId: 'staff_priya', look: 2, life: { salary: 1600, balance: 1800, commute: 2 } },
  { id: 'staff_lena', name: 'Lena Cho', roleKey: 'quote_specialist', managerId: 'staff_priya', look: 3, life: { salary: 1500, balance: 2600, commute: 3 } },
  { id: 'staff_samir', name: 'Samir Adeyemi', roleKey: 'marketing_manager', managerId: 'staff_morgan', look: 4, life: { salary: 2300, balance: 5200, marital: 'married', spouse: 'Ada Adeyemi', commute: 0 } },
  { id: 'staff_nina', name: 'Nina Petrov', roleKey: 'campaign_producer', managerId: 'staff_samir', look: 5, life: { salary: 1500, balance: 1900, commute: 4 } },
  { id: 'staff_maya', name: 'Maya Mensah', roleKey: 'graphic_designer', managerId: 'staff_samir', look: 17, life: { salary: 1700, balance: 2400, commute: 3 } },
  { id: 'staff_casey', name: 'Casey Nguyen', roleKey: 'social_manager', managerId: 'staff_samir', look: 6, life: { salary: 1600, balance: 2100, commute: 2 } },
  { id: 'staff_helen', name: 'Helen Okonkwo', roleKey: 'pr_manager', managerId: 'staff_samir', look: 7, life: { salary: 1700, balance: 2400, commute: 1 } },
  { id: 'staff_marco', name: 'Marco Bianchi', roleKey: 'procurement_manager', managerId: 'staff_morgan', look: 8, life: { salary: 2400, balance: 18600, marital: 'married', spouse: 'Giulia Bianchi', commute: 2 } },
  { id: 'staff_aisha', name: 'Aisha Rahman', roleKey: 'buyer', managerId: 'staff_marco', look: 9, life: { salary: 1500, balance: 1600, commute: 5 } },
  { id: 'staff_david', name: 'David Chen', roleKey: 'finance_manager', managerId: 'staff_morgan', look: 10, life: { salary: 2500, balance: 7300, marital: 'married', spouse: 'Mei Chen', commute: 0 } },
  { id: 'staff_ruth', name: 'Ruth Adler', roleKey: 'hr_manager', managerId: 'staff_morgan', look: 11, life: { salary: 2100, balance: 4800, marital: 'married', spouse: 'Paul Adler', commute: 1 } },
  { id: 'staff_elise', name: 'Elise Moreau', roleKey: 'technology_lead', managerId: 'staff_morgan', look: 12, life: { salary: 3000, balance: 117500, commute: 0 } },
  { id: 'staff_tom', name: 'Tom Becker', roleKey: 'release_engineer', managerId: 'staff_elise', look: 13, life: { salary: 1700, balance: 2200, commute: 3 } },
  { id: 'staff_sofia', name: 'Sofia Alvarez', roleKey: 'systems_engineer', managerId: 'staff_elise', look: 14, life: { salary: 1700, balance: 900, commute: 4 } },
  { id: 'staff_imani', name: 'Imani Okoye', roleKey: 'cyber', managerId: 'staff_elise', look: 15, life: { salary: 2800, balance: 6400, commute: 2 } },
  { id: 'staff_jules', name: 'Jules Berger', roleKey: 'researcher', managerId: 'staff_imani', look: 16, life: { salary: 2200, balance: 3100, commute: 5 } },
]

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
          responsibilities: ['Probe the company’s own demo systems', 'Write the finding in plain language', 'Hand the note to the Cybersecurity Lead'],
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

function roomForRole(roleKey: string): string {
  const role = roleTemplates.find((item) => item.key === roleKey)
  const department = departmentTemplates.find((item) => item.key === role?.departmentKey)
  return department?.roomId ?? 'flex'
}

export function bareSample(now: number): AppState {
  const roles = instantiateRoles(new Set(roleTemplates.map((item) => item.key)))
  const taken: { x: number; y: number }[] = []
  const staff: Staff[] = cast.map((person, index) => {
    const role = roles.find((item) => item.key === person.roleKey)
    if (!role) throw new Error(`Missing role ${person.roleKey}`)
    const look = looks[person.look]
    const roomId = roomForRole(person.roleKey)
    const desk = nextDesk(roomId, taken)
    taken.push(desk)
    return {
      id: person.id,
      name: person.name,
      title: role.title,
      roleId: role.id,
      departmentId: role.departmentId,
      managerId: person.managerId,
      purpose: role.purpose,
      responsibilities: person.responsibilities ? person.responsibilities : [...role.responsibilities],
      grants: grantsFrom(role.defaultPermissions),
      appearance: { ...look, hairStyle: look.hairStyle as HairStyle },
      deskX: desk.x,
      deskY: desk.y,
      roomId: desk.roomId,
      presence: awayPresence(),
      life: { ...defaultLife(index), ...person.life, commute: index * 2 },
      enabled: true,
    }
  })

  const tasks: Task[] = [
    task(now, {
      id: 'task_coordinate',
      title: 'Coordinate the Riverside reply',
      description:
        'Keep Sales, Procurement, and Technology aligned on the Riverside Academy request. This is coordination inside Quorum, not a message to the school.',
      status: 'ready',
      priority: 'high',
      assigneeId: 'staff_morgan',
      departmentId: deptId('executive'),
      playbook: [
        {
          kind: 'work',
          startDetail: 'Morgan is lining up who owns the Riverside reply.',
          doneDetail: 'Morgan has a named owner for each part of the Riverside reply.',
          durationMs: 18_000,
        },
        {
          kind: 'report',
          detail: 'Bring the coordination note to the owner.',
          result: 'Sample note: Sales owns the reply, Procurement owns stock, Technology owns the Classroom OS checklist. No message was sent to the school.',
        },
      ],
    }),
    task(now, {
      id: 'task_riverside',
      title: 'Respond to the Riverside Academy laptop lead',
      description:
        'Riverside Academy asked for pricing on 40 classroom laptops and docks. Figures below are sample data. Sending the reply is an external email and needs your approval.',
      status: 'ready',
      priority: 'high',
      assigneeId: 'staff_priya',
      departmentId: deptId('sales'),
      consequential: {
        action: 'send_external',
        summary: 'Send Riverside Academy a quote email for 40 laptops and docks.',
      },
      playbook: [
        {
          kind: 'work',
          startDetail: 'Priya is matching the Riverside lead to the Classroom laptop bundle in the sample catalog.',
          doneDetail: 'Priya matched the lead to the sample Classroom laptop bundle. No email was sent.',
          durationMs: 12_000,
        },
        {
          kind: 'handoff',
          toStaffId: 'staff_marco',
          detail: 'Priya asked Procurement to confirm sample stock for 40 laptops and docks.',
          walkMs: 3800,
        },
        {
          kind: 'work',
          startDetail: 'Marco is checking the sample stock note for Classroom laptops and docks.',
          doneDetail:
            'Sample stock note: 22 Classroom laptops on hand and 18 on a sample purchase order. This is not a live warehouse.',
          durationMs: 16_000,
        },
        {
          kind: 'handoff',
          toStaffId: 'staff_priya',
          detail: 'Marco walked the sample stock note back to Sales.',
          walkMs: 3800,
        },
        {
          kind: 'approval',
          action: 'send_external',
          summary: 'Send Riverside Academy a quote email for 40 laptops and docks.',
          detail:
            'The draft uses sample education pricing. Approving records your decision in Quorum. It does not send email, because email is not connected.',
        },
      ],
    }),
    task(now, {
      id: 'task_campaign',
      title: 'Prepare the Dock Pro campaign',
      description:
        'Marketing is drafting the Dock Pro launch kit for schools. Nothing in this task publishes the campaign.',
      status: 'ready',
      priority: 'medium',
      assigneeId: 'staff_samir',
      departmentId: deptId('marketing'),
      playbook: [
        {
          kind: 'work',
          startDetail: 'Samir is drafting the Dock Pro campaign outline inside Quorum.',
          doneDetail: 'Sample outline drafted: three claims, each tied to a catalog fact. Nothing was published.',
          durationMs: 18_000,
        },
        {
          kind: 'handoff',
          toStaffId: 'staff_casey',
          detail: 'Samir handed the sample outline to Social to draft posts.',
          walkMs: 3800,
        },
        {
          kind: 'report',
          detail: 'Bring the campaign outline to the owner.',
          result: 'Sample campaign outline is ready for review. Nothing was published.',
        },
      ],
    }),
    task(now, {
      id: 'task_social',
      title: 'Approve Dock Pro launch posts',
      description:
        'Casey drafted three posts from the campaign brief. They are waiting for you. No account is connected, so approval cannot publish them.',
      status: 'ready',
      priority: 'high',
      assigneeId: 'staff_casey',
      departmentId: deptId('communications'),
      consequential: { action: 'publish_public', summary: 'Publish three Dock Pro launch posts.' },
      playbook: [
        {
          kind: 'approval',
          action: 'publish_public',
          summary: 'Publish three Dock Pro launch posts.',
          detail:
            'Sample copy mentions dock compatibility and a two-year warranty. Approving does not post anywhere, because social platforms are not connected.',
        },
      ],
    }),
    task(now, {
      id: 'task_pr',
      title: 'Draft the Classroom OS 2.1 announcement',
      description: 'Helen is preparing a press note. Releasing it is a separate approval, and PR distribution is not connected.',
      status: 'ready',
      priority: 'medium',
      assigneeId: 'staff_helen',
      departmentId: deptId('communications'),
      playbook: [
        {
          kind: 'work',
          startDetail: 'Helen is drafting the Classroom OS 2.1 press note inside Quorum.',
          doneDetail: 'Sample press note drafted. Nothing was released.',
          durationMs: 12_000,
        },
        {
          kind: 'report',
          detail: 'Bring the draft press note to the owner.',
          result:
            'Sample press note: Classroom OS 2.1 adds offline quiz sync for the sample education bundle. Nothing was released.',
        },
      ],
    }),
    task(now, {
      id: 'task_quotes',
      title: 'Compare supplier quotes for 27-inch monitors',
      description:
        'Aisha is comparing two sample quotes. Placing an order needs your approval, and supplier systems are not connected.',
      status: 'ready',
      priority: 'urgent',
      assigneeId: 'staff_aisha',
      departmentId: deptId('procurement'),
      consequential: { action: 'purchase', summary: 'Place a sample purchase for 27-inch monitors.' },
      playbook: [
        {
          kind: 'work',
          startDetail: 'Aisha is comparing two sample monitor quotes.',
          doneDetail: 'Sample comparison: the quotes differ by 4% and 6 days of lead time. No order was placed.',
          durationMs: 18_000,
        },
        {
          kind: 'approval',
          action: 'purchase',
          summary: 'Place a purchase order for 27-inch monitors at the lower sample quote.',
          detail:
            'Approving records the decision only. Supplier systems are not connected, so no purchase order can be sent.',
        },
      ],
    }),
    task(now, {
      id: 'task_checklist',
      title: 'Prepare the Classroom OS launch checklist',
      description: 'Elise is updating the internal launch checklist. This does not change a production system.',
      status: 'ready',
      priority: 'medium',
      assigneeId: 'staff_elise',
      departmentId: deptId('technology'),
      playbook: [
        {
          kind: 'work',
          startDetail: 'Elise is updating the Classroom OS launch checklist.',
          doneDetail: 'Sample checklist: install notes, rollback, and a known-issue line are filled in. No production system was changed.',
          durationMs: 18_000,
        },
        {
          kind: 'report',
          detail: 'Bring the launch checklist to the owner.',
          result: 'Sample launch checklist is ready for review. No production system was changed.',
        },
      ],
    }),
    task(now, {
      id: 'task_margin',
      title: 'Review hardware margin notes',
      description: 'David is writing margin notes from sample figures. The finance system is not connected.',
      status: 'ready',
      priority: 'medium',
      assigneeId: 'staff_david',
      departmentId: deptId('finance'),
      playbook: [
        {
          kind: 'work',
          startDetail: 'David is drafting margin notes from sample hardware figures.',
          doneDetail: 'Sample margin note drafted. No financial records were changed.',
          durationMs: 18_000,
        },
        {
          kind: 'report',
          detail: 'Bring the margin note to the owner.',
          result: 'Sample note: education bundles clear the target margin in the demo figures. No financial records were changed.',
        },
      ],
    }),
    task(now, {
      id: 'task_hire',
      title: 'Request a support specialist',
      description:
        'Ruth prepared a hiring request for a support specialist to cover education-season setup. No offer can be sent from this build.',
      status: 'ready',
      priority: 'high',
      assigneeId: 'staff_ruth',
      departmentId: deptId('people'),
      consequential: { action: 'hiring', summary: 'Approve hiring a support specialist.' },
      playbook: [
        {
          kind: 'approval',
          action: 'hiring',
          summary: 'Approve hiring a support specialist.',
          detail:
            'The request is a sample role for launch-season setup. Approving does not send an offer, and no HR system is connected.',
        },
      ],
    }),
    task(now, {
      id: 'task_standup',
      title: 'Commercial standup',
      description:
        'A short meeting for Morgan, Priya, and Elise on the Riverside lead and the launch checklist. It starts only when you start the task. People who are mid-handoff stay on that handoff.',
      status: 'ready',
      priority: 'medium',
      assigneeId: 'staff_morgan',
      departmentId: deptId('executive'),
      playbook: [
        {
          kind: 'meet',
          participantIds: ['staff_morgan', 'staff_priya', 'staff_elise'],
          detail: 'Commercial standup on the Riverside lead and the launch checklist.',
          durationMs: 12_000,
        },
        {
          kind: 'report',
          detail: 'Bring the standup note to the owner.',
          result: 'Sample standup note recorded in Quorum. No calendar invite was sent.',
        },
      ],
    }),
    task(now, {
      id: 'task_paused',
      title: 'Trade-show booth copy',
      description: 'You paused this before Nina started. The booth copy has not been drafted.',
      status: 'paused',
      priority: 'low',
      assigneeId: 'staff_nina',
      departmentId: deptId('marketing'),
      playbook: [
        {
          kind: 'work',
          startDetail: 'Nina is drafting trade-show booth copy.',
          doneDetail: 'Sample booth copy drafted. Nothing was printed or published.',
          durationMs: 16_000,
        },
      ],
    }),
    task(now, {
      id: 'task_blocked',
      title: 'Import the supplier price list',
      description: 'Sofia cannot import a price list because the sample supplier file is missing.',
      status: 'blocked',
      priority: 'medium',
      assigneeId: 'staff_sofia',
      departmentId: deptId('technology'),
      blockers: [
        {
          id: 'blk_erp',
          text: 'The sample supplier file is missing, so the price list cannot be imported.',
          at: iso(now, -3_600_000),
        },
      ],
      playbook: [],
    }),
    task(now, {
      id: 'task_desktop',
      title: 'Ask Technology to use this computer for the checklist',
      description:
        'Elise could request a desktop session to click through the launch checklist on your machine. Desktop permission is off, and this build has no desktop agent.',
      status: 'blocked',
      priority: 'low',
      assigneeId: 'staff_elise',
      departmentId: deptId('technology'),
      consequential: {
        action: 'desktop_control',
        summary: 'Let Elise use this computer for the launch checklist.',
      },
      blockers: [
        {
          id: 'blk_desktop',
          text: 'Desktop permission is off. This build also has no desktop agent, so the computer cannot be viewed or controlled.',
          at: iso(now, -86_400_000),
        },
      ],
      playbook: [],
    }),
    task(now, {
      id: 'task_webcam',
      title: 'Internal price sheet for webcams',
      description: 'Lena recorded a sample price sheet for the owner. It was not sent to a customer.',
      status: 'done',
      priority: 'low',
      assigneeId: 'staff_lena',
      departmentId: deptId('sales'),
      result: 'Sample price sheet recorded in Quorum. No customer received it.',
      playbook: [],
      updatedAt: iso(now, -26 * 3_600_000),
    }),
  ]

  const events: ActivityEvent[] = [
    {
      id: 'evt_company',
      at: iso(now, -2 * 86_400_000),
      actorId: 'owner',
      actorName: 'Riley Chen',
      kind: 'company',
      message: 'Riley Chen opened Northline Supply Co. in Quorum and appointed Morgan Hale as Managing Director.',
      audit: true,
    },
    {
      id: 'evt_webcam',
      at: iso(now, -26 * 3_600_000),
      actorId: 'staff_lena',
      actorName: 'Lena Cho',
      kind: 'result',
      taskId: 'task_webcam',
      staffId: 'staff_lena',
      message: 'Lena recorded a sample webcam price sheet. No customer received it.',
      audit: true,
    },
    {
      id: 'evt_paused',
      at: iso(now, -5 * 3_600_000),
      actorId: 'owner',
      actorName: 'Riley Chen',
      kind: 'task',
      taskId: 'task_paused',
      message: 'You paused the trade-show booth copy before Nina started.',
      audit: true,
    },
    {
      id: 'evt_blocked',
      at: iso(now, -3_600_000),
      actorId: 'staff_sofia',
      actorName: 'Sofia Alvarez',
      kind: 'task',
      taskId: 'task_blocked',
      staffId: 'staff_sofia',
      message: 'Sofia blocked the price-list import. The sample supplier file is missing.',
      audit: true,
    },
  ]

  return {
    version: 1,
    company: {
      id: 'co_northline',
      name: 'Northline Supply Co.',
      businessType: 'IT hardware, devices, and software',
      goals: [
        { id: 'goal_launch', text: 'Launch the Dock Pro and Classroom OS bundle this quarter.' },
        { id: 'goal_stock', text: 'Keep education-season hardware quotable within two days.' },
        { id: 'goal_approval', text: 'Publish nothing externally until you approve the exact copy.' },
      ],
      ownerName: 'Riley Chen',
      ownerTitle: 'Chairman',
      management: 'managing_director',
      createdAt: iso(now, -2 * 86_400_000),
    },
    departments: instantiateDepartments(new Set(departmentTemplates.map((item) => item.key))),
    roles,
    staff,
    tasks,
    events,
    approvals: [],
    integrations: integrationRegistry(),
    desktop: { agentConnected: false, sessionActive: false },
    settings: { reducedMotion: false, engineRunning: false, showFloor: true, agentsWorking: true },
    clock: freshClock(now),
    threads: [],
    chat: [],
    designs: [],
    products: northlineProducts(),
    calendar: [],
    reports: [],
    agentSeen: {},
    agentPulse: 0,
  }
}

const PREVIOUS_PURPOSE: Record<string, string> = {
  marketing_manager: 'Plans campaigns and reviews copy before it can be published.',
  social_manager: 'Drafts posts and schedules nothing until the owner approves the exact copy.',
  graphic_designer: 'Designs campaign graphics inside Quorum and sends them to the group chat for review. Does not publish.',
}

/** Fills products and calendar on older saves, and updates the three roles when they still have the previous job text. */
export function ensureOfferings(state: AppState): AppState {
  const refreshed = refreshRoleCopy(state)
  const missingProducts = refreshed.products === undefined
  const missingCalendar = refreshed.calendar === undefined
  if (!missingProducts && !missingCalendar && refreshed === state) return state
  const products = missingProducts && refreshed.company?.id === 'co_northline' ? northlineProducts() : (refreshed.products ?? [])
  return { ...refreshed, products, calendar: refreshed.calendar ?? [] }
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
          purpose: 'Reads the content calendar and designs the post scheduled for that day, in the shape that platform needs. Does not publish.',
          responsibilities: [
            'Read the content calendar for today’s posts',
            'Design the Instagram flyer, the TikTok cover, or the YouTube thumbnail named there',
            'Send the finished graphic to the company chat',
            'Revise it when the owner asks for changes',
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

function task(
  now: number,
  input: Pick<Task, 'id' | 'title' | 'description' | 'status' | 'priority' | 'assigneeId' | 'departmentId' | 'playbook'> &
    Partial<Pick<Task, 'blockers' | 'result' | 'consequential' | 'updatedAt'>>,
): Task {
  return {
    id: input.id,
    title: input.title,
    description: input.description,
    status: input.status,
    priority: input.priority,
    assigneeId: input.assigneeId,
    departmentId: input.departmentId,
    playbook: input.playbook,
    blockers: input.blockers ?? [],
    result: input.result ?? null,
    consequential: input.consequential ?? null,
    source: input.playbook.length > 0 ? 'demo_playbook' : 'owner',
    stepIndex: 0,
    stepStartedAt: null,
    handoff: null,
    createdAt: iso(now, -2 * 86_400_000),
    updatedAt: input.updatedAt ?? iso(now, -2 * 86_400_000),
  }
}
