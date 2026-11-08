import { ensureChat } from '../chat/threads'
import { northlineProducts } from '../domain/calendar'
import { departmentTemplates, grantsFrom, roleTemplates } from '../domain/catalog'
import { appearanceAt, instantiateDepartments, instantiateRoles } from '../domain/sample'
import { integrationRegistry } from '../integrations/registry'
import { iso } from '../lib/format'
import { awayPresence } from '../office/presence'
import { nextDesk } from '../office/world'
import type { ActivityEvent, AppState, Settings, Staff, StaffLife, Task } from '../types'
import { defaultLife, freshClock } from './life'
import { prime, resolvePresence } from './apply'

function deptId(key: string) {
  return `dept_${key}`
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
    const look = appearanceAt(person.look)
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
      appearance: look,
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
          result: 'Draft note: Sales owns the reply, Procurement owns stock, Technology owns the Classroom OS checklist. No message was sent to the school.',
        },
      ],
    }),
    task(now, {
      id: 'task_riverside',
      title: 'Respond to the Riverside Academy laptop lead',
      description:
        'Riverside Academy asked for pricing on 40 classroom laptops and docks. Sending the reply is an external email and needs your approval.',
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
          startDetail: 'Priya is matching the Riverside lead to the Classroom laptop bundle in the catalog.',
          doneDetail: 'Priya matched the lead to the Classroom laptop bundle. No email was sent.',
          durationMs: 12_000,
        },
        {
          kind: 'handoff',
          toStaffId: 'staff_marco',
          detail: 'Priya asked Procurement to confirm stock for 40 laptops and docks.',
          walkMs: 3800,
        },
        {
          kind: 'work',
          startDetail: 'Marco is checking the stock note for Classroom laptops and docks.',
          doneDetail:
            'Stock note: 22 Classroom laptops on hand and 18 on a purchase order. Confirm against a connected warehouse when one is linked.',
          durationMs: 16_000,
        },
        {
          kind: 'handoff',
          toStaffId: 'staff_priya',
          detail: 'Marco walked the stock note back to Sales.',
          walkMs: 3800,
        },
        {
          kind: 'approval',
          action: 'send_external',
          summary: 'Send Riverside Academy a quote email for 40 laptops and docks.',
          detail:
            'The draft uses education pricing. Approving records your decision in Quorum. It does not send email, because email is not connected.',
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
          doneDetail: 'Draft outline drafted: three claims, each tied to a catalog fact. Nothing was published.',
          durationMs: 18_000,
        },
        {
          kind: 'handoff',
          toStaffId: 'staff_casey',
          detail: 'Samir handed the outline to Social to draft posts.',
          walkMs: 3800,
        },
        {
          kind: 'report',
          detail: 'Bring the campaign outline to the owner.',
          result: 'Draft campaign outline is ready for review. Nothing was published.',
        },
      ],
    }),
    task(now, {
      id: 'task_social',
      title: 'Approve Dock Pro launch posts',
      description:
        'Casey drafted three posts from the campaign brief. They are waiting for you. Approval files them into Quorum’s social hold; nothing goes live from here.',
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
            'Draft copy mentions dock compatibility and a two-year warranty. Approving holds the posts in Quorum; it does not post to a live network.',
        },
      ],
    }),
    task(now, {
      id: 'task_pr',
      title: 'Draft the Classroom OS 2.1 announcement',
      description: 'Helen is preparing a press note. Releasing it is a separate approval filed as a Quorum PR hold.',
      status: 'ready',
      priority: 'medium',
      assigneeId: 'staff_helen',
      departmentId: deptId('communications'),
      playbook: [
        {
          kind: 'work',
          startDetail: 'Helen is drafting the Classroom OS 2.1 press note inside Quorum.',
          doneDetail: 'Draft press note drafted. Nothing was released.',
          durationMs: 12_000,
        },
        {
          kind: 'report',
          detail: 'Bring the draft press note to the owner.',
          result:
            'Draft press note: Classroom OS 2.1 adds offline quiz sync for the education bundle. Nothing was released.',
        },
      ],
    }),
    task(now, {
      id: 'task_quotes',
      title: 'Compare supplier quotes for 27-inch monitors',
      description:
        'Aisha is comparing two quotes. Placing an order needs your approval, and supplier systems are not connected.',
      status: 'ready',
      priority: 'urgent',
      assigneeId: 'staff_aisha',
      departmentId: deptId('procurement'),
      consequential: { action: 'purchase', summary: 'Place a purchase for 27-inch monitors.' },
      playbook: [
        {
          kind: 'work',
          startDetail: 'Aisha is comparing two monitor quotes.',
          doneDetail: 'Draft comparison: the quotes differ by 4% and 6 days of lead time. No order was placed.',
          durationMs: 18_000,
        },
        {
          kind: 'approval',
          action: 'purchase',
          summary: 'Place a purchase order for 27-inch monitors at the lower quote.',
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
          doneDetail: 'Draft checklist: install notes, rollback, and a known-issue line are filled in. No production system was changed.',
          durationMs: 18_000,
        },
        {
          kind: 'report',
          detail: 'Bring the launch checklist to the owner.',
          result: 'Draft launch checklist is ready for review. No production system was changed.',
        },
      ],
    }),
    task(now, {
      id: 'task_margin',
      title: 'Review hardware margin notes',
      description: 'David is writing margin notes from internal figures. The finance system is not connected.',
      status: 'ready',
      priority: 'medium',
      assigneeId: 'staff_david',
      departmentId: deptId('finance'),
      playbook: [
        {
          kind: 'work',
          startDetail: 'David is drafting margin notes from hardware figures.',
          doneDetail: 'Draft margin note drafted. No financial records were changed.',
          durationMs: 18_000,
        },
        {
          kind: 'report',
          detail: 'Bring the margin note to the owner.',
          result: 'Draft note: education bundles clear the target margin in. No financial records were changed.',
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
            'The request is a role for launch-season setup. Approving does not send an offer, and no HR system is connected.',
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
          result: 'Draft standup note recorded in Quorum. No calendar invite was sent.',
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
          doneDetail: 'Draft booth copy drafted. Nothing was printed or published.',
          durationMs: 16_000,
        },
      ],
    }),
    task(now, {
      id: 'task_blocked',
      title: 'Import the supplier price list',
      description: 'Sofia cannot import a price list because the supplier file is missing.',
      status: 'blocked',
      priority: 'medium',
      assigneeId: 'staff_sofia',
      departmentId: deptId('technology'),
      blockers: [
        {
          id: 'blk_erp',
          text: 'The supplier file is missing, so the price list cannot be imported.',
          at: iso(now, -3_600_000),
        },
      ],
      playbook: [],
    }),
    task(now, {
      id: 'task_desktop',
      title: 'Ask Technology to use this computer for the checklist',
      description:
        'Elise could request desktop control to click through the launch checklist on your machine. She needs desktop permission, and you must start a desktop session first.',
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
          text: 'Desktop permission is off. Start a desktop session on Integrations after you grant permission.',
          at: iso(now, -86_400_000),
        },
      ],
      playbook: [],
    }),
    task(now, {
      id: 'task_webcam',
      title: 'Internal price sheet for webcams',
      description: 'Lena recorded a price sheet for the owner. It was not sent to a customer.',
      status: 'done',
      priority: 'low',
      assigneeId: 'staff_lena',
      departmentId: deptId('sales'),
      result: 'Draft price sheet recorded in Quorum. No customer received it.',
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
      message: 'Lena recorded a webcam price sheet. No customer received it.',
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
      message: 'Sofia blocked the price-list import. The supplier file is missing.',
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
    desktop: { agentConnected: false, sessionActive: false, mode: null },
    settings: { reducedMotion: false, engineRunning: false, showFloor: true, agentsWorking: true },
    clock: freshClock(now),
    threads: [],
    chat: [],
    designs: [],
    products: northlineProducts(),
    calendar: [],
    reports: [],
    records: [],
    goalProposals: [],
    agentSeen: {},
    agentPulse: 0,
  }
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
    source: input.playbook.length > 0 ? 'staff' : 'owner',
    stepIndex: 0,
    stepStartedAt: null,
    handoff: null,
    createdAt: iso(now, -2 * 86_400_000),
    updatedAt: input.updatedAt ?? iso(now, -2 * 86_400_000),
  }
}
export function createSampleState(now: number, prefs?: Partial<Settings>): AppState {
  const state: AppState = {
    ...bareSample(now),
    settings: {
      reducedMotion: prefs?.reducedMotion ?? false,
      showFloor: prefs?.showFloor ?? true,
      engineRunning: false,
      agentsWorking: prefs?.agentsWorking ?? true,
    },
  }
  const primed = prime(ensureChat(state), now)
  return primed.settings.reducedMotion ? resolvePresence(primed, now) : primed
}
