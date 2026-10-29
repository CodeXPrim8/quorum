export const PERMISSIONS = [
  { id: 'catalog.read', label: 'Read the product catalog', group: 'everyday' },
  { id: 'crm.read', label: 'Read sales leads', group: 'everyday' },
  { id: 'email.draft', label: 'Draft emails', group: 'everyday' },
  { id: 'campaign.draft', label: 'Draft campaign material', group: 'everyday' },
  { id: 'social.draft', label: 'Draft social posts', group: 'everyday' },
  { id: 'pr.draft', label: 'Draft PR material', group: 'everyday' },
  { id: 'supplier.read', label: 'Read supplier quotes and stock notes', group: 'everyday' },
  { id: 'finance.read', label: 'Read financial summaries', group: 'everyday' },
  { id: 'hr.read', label: 'Read staff records', group: 'everyday' },
  { id: 'tech.internal', label: 'Read internal technical checklists', group: 'everyday' },
  { id: 'calendar.read', label: 'Read calendars', group: 'everyday' },
  { id: 'email.send_external', label: 'Send external email', group: 'consequential', action: 'send_external' },
  { id: 'social.publish', label: 'Publish social posts', group: 'consequential', action: 'publish_public' },
  { id: 'pr.publish', label: 'Publish PR announcements', group: 'consequential', action: 'publish_public' },
  { id: 'purchase.create', label: 'Place purchase orders', group: 'consequential', action: 'purchase' },
  { id: 'finance.write', label: 'Change financial records', group: 'consequential', action: 'finance_change' },
  { id: 'hr.hire', label: 'Make hiring decisions', group: 'consequential', action: 'hiring' },
  { id: 'desktop.control', label: 'Control this computer', group: 'desktop', action: 'desktop_control' },
] as const

export type PermissionId = (typeof PERMISSIONS)[number]['id']

export type ConsequentialAction =
  | 'publish_public'
  | 'send_external'
  | 'purchase'
  | 'finance_change'
  | 'hiring'
  | 'desktop_control'

export type TaskStatus =
  | 'ready'
  | 'in_progress'
  | 'paused'
  | 'blocked'
  | 'waiting_for_owner'
  | 'in_review'
  | 'done'

export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export type PresenceMode = 'desk' | 'meeting' | 'waiting' | 'reporting'

export type Pose = 'sit' | 'stand' | 'walk' | 'drink' | 'away' | 'call'

export type LifeIntent = 'none' | 'water' | 'arrive' | 'leave' | 'chat' | 'errand'

export type Ride = 'drive' | 'drop' | 'bus'

export type HairStyle = 'short' | 'bob' | 'bun' | 'crop' | 'none'

export type EventKind =
  | 'company'
  | 'task'
  | 'handoff'
  | 'arrival'
  | 'meeting'
  | 'approval'
  | 'result'
  | 'permission'
  | 'desktop'
  | 'system'
  | 'life'

export type PlaybookStep =
  | { kind: 'work'; startDetail: string; doneDetail: string; durationMs: number }
  | { kind: 'handoff'; toStaffId: string; detail: string; walkMs: number }
  | { kind: 'meet'; participantIds: string[]; detail: string; durationMs: number }
  | { kind: 'approval'; action: ConsequentialAction; summary: string; detail: string }
  | { kind: 'report'; detail: string; result: string }

export type Handoff = {
  fromStaffId: string
  toStaffId: string
  phase: 'delivering' | 'returning'
  walkerId: string
  arriveAt: number
  detail: string
  /** Playbook handoffs move the script forward. Manual reassignment does not. */
  advancesPlaybook: boolean
}

export type Presence = {
  mode: PresenceMode
  /** Destination, in metres on the floor plan. */
  x: number
  y: number
  /** Where the walk started. Equals x/y when the person is settled. */
  originX: number
  originY: number
  /** While Date.now() is below this, the person is walking along `path`. */
  movingUntil: number
  label: string
  meetingTaskId: string | null
  /** Door-to-door route in floor metres. `x`/`y` stay the destination. */
  path: { x: number; y: number }[]
  pathFrom: number
  /** Pose once the walk finishes. Walking itself is derived from `movingUntil`. */
  pose: Pose
  lifeIntent: LifeIntent
  dwellUntil: number
}

export type MaritalStatus = 'single' | 'married'

export type StaffLife = {
  salary: number
  balance: number
  marital: MaritalStatus
  spouse: string | null
  car: boolean
  house: boolean
  /** Office-clock minute of the next water break. */
  nextBreak: number
  /** Minutes after opening before this person comes in, and after closing before they leave. */
  commute: number
  /** How they reach the door. The street is part of the office scene, not a live traffic feed. */
  ride: Ride
  spentDay: number
  /** Office-clock minute of the next lounge, cafeteria, toilet, or technical visit. */
  nextErrand: number
}

export type OfficeClock = {
  /** Minutes from midnight on the office clock, not the wall clock. */
  minute: number
  day: number
  /** Office minutes advanced per real second. */
  speed: number
  openMinute: number
  closeMinute: number
  paidDay: number
  /** Last office-hour slot that already started a conversation. */
  socialMark: number
  /** Office day whose close already collected staff notes for managers. */
  filedDay: number
  /** Office day whose close already sent compiled reports to the owner. */
  ownerReportDay: number
  updatedAt: number
}

export type OwnerGender = 'female' | 'male'

export type Company = {
  id: string
  name: string
  businessType: string
  goals: { id: string; text: string }[]
  ownerName: string
  ownerTitle: 'Chairman' | 'CEO'
  /** How staff address you on a call: sir or ma. Missing on older saves until you set it. */
  ownerGender?: OwnerGender
  management: 'direct' | 'managing_director'
  createdAt: string
}

export type Department = {
  id: string
  key: string
  name: string
  summary: string
  roomId: string
  enabled: boolean
  color: string
}

export type Role = {
  id: string
  key: string
  title: string
  purpose: string
  responsibilities: string[]
  departmentId: string
  reportsToRoleId: string | null
  enabled: boolean
  defaultPermissions: PermissionId[]
}

export type Appearance = {
  skin: string
  hair: string
  hairStyle: HairStyle
  shirt: string
  legs: string
}

export type Staff = {
  id: string
  name: string
  title: string
  roleId: string
  departmentId: string
  managerId: string | null
  purpose: string
  responsibilities: string[]
  /** Standing grants. Consequential tools still require an approval each time. */
  grants: Partial<Record<PermissionId, boolean>>
  appearance: Appearance
  /** Square portrait the person (or the owner) set. Data URL. */
  photo?: string
  deskX: number
  deskY: number
  roomId: string
  presence: Presence
  life: StaffLife
  /** Owner's choice for this person. Department and role toggles can still hide them. */
  enabled: boolean
}

export type Blocker = {
  id: string
  text: string
  at: string
}

export type Task = {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  assigneeId: string | null
  departmentId: string
  source: 'demo_playbook' | 'owner'
  playbook: PlaybookStep[]
  stepIndex: number
  stepStartedAt: number | null
  handoff: Handoff | null
  blockers: Blocker[]
  result: string | null
  consequential: null | { action: ConsequentialAction; summary: string }
  createdAt: string
  updatedAt: string
}

export type ActivityEvent = {
  id: string
  at: string
  actorId: string
  actorName: string
  kind: EventKind
  taskId?: string
  staffId?: string
  message: string
  audit: boolean
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export type Approval = {
  id: string
  taskId: string
  action: ConsequentialAction
  requestedById: string
  summary: string
  detail: string
  status: ApprovalStatus
  createdAt: string
  decidedAt?: string
  note?: string
  outcome?: string
}

export type IntegrationStatus = 'not_connected' | 'demo_data'

export type Integration = {
  id: string
  name: string
  category: string
  status: IntegrationStatus
  summary: string
  connectionPoint: string
  usedBy: string
}

export type DesktopAccess = {
  /**
   * This build has no desktop agent. The flag is a literal so a UI change
   * cannot imply the computer is being viewed or controlled.
   */
  agentConnected: false
  sessionActive: false
}

export type Settings = {
  reducedMotion: boolean
  engineRunning: boolean
  showFloor: boolean
  /** Staff answer chats and keep doing role work while this is on. */
  agentsWorking: boolean
  /**
   * When this is not false, the marketing manager reviews a graphic
   * before you give the final approval. Turn it off to review them yourself.
   */
  marketingReviews?: boolean
  /**
   * How often line managers send the compiled report to you.
   * Staff still file to their manager at the close of every office day.
   * Missing means daily.
   */
  reportCadence?: ReportCadence
}

export type ReportCadence = 'daily' | 'weekly' | 'monthly'

/** One person's note to their manager for one office day. It stays in this browser. */
export type StaffReport = {
  id: string
  staffId: string
  managerId: string | null
  day: number
  text: string
}

export type DesignStatus = 'in_review' | 'changes' | 'approved' | 'held' | 'declined'

export type ProductKind = 'hardware' | 'software' | 'service'

/** Something the company sells. The content calendar is built from this list. */
export type Product = {
  id: string
  name: string
  kind: ProductKind
  /** The only claim the calendar is allowed to repeat. */
  fact: string
}

export type SocialPlatform = 'instagram' | 'tiktok' | 'youtube'

export type PostFormat = 'flyer' | 'carousel' | 'cover' | 'thumbnail'

export type CalendarStatus = 'planned' | 'in_review' | 'held' | 'declined'

/** One post on one platform, written by the marketing manager. */
export type CalendarPost = {
  id: string
  productId: string
  /** Office-clock day this post is scheduled. */
  day: number
  title: string
  brief: string
  platform: SocialPlatform
  format: PostFormat
  status: CalendarStatus
  designId?: string
}

/** A graphic made inside Quorum. It is not a file from a design tool. */
export type Design = {
  id: string
  title: string
  brief: string
  caption: string
  svg: string
  createdById: string
  status: DesignStatus
  revision: number
  calendarId?: string
  platform?: SocialPlatform
  format?: PostFormat
  /** Who looks at this graphic next. The owner can still approve either way. */
  reviewer?: 'marketing' | 'owner'
}

export type ChatThreadKind = 'company' | 'direct' | 'group' | 'line'

export type ChatThread = {
  id: string
  kind: ChatThreadKind
  name: string
  /** Staff in the thread. The owner is always included and is not listed here. */
  memberIds: string[]
  createdAt: string
}

export type ChatFile = {
  name: string
  mime: string
  dataUrl: string
}

export type ChatMessage = {
  id: string
  threadId: string
  at: string
  authorId: string
  authorName: string
  text: string
  designId?: string
  file?: ChatFile
  /** Staff ids this message prompts. `all` is expanded to those ids before it is stored. */
  mentions: string[]
}

export type AppState = {
  version: 1
  company: Company | null
  departments: Department[]
  roles: Role[]
  staff: Staff[]
  tasks: Task[]
  events: ActivityEvent[]
  approvals: Approval[]
  integrations: Integration[]
  desktop: DesktopAccess
  settings: Settings
  clock: OfficeClock
  threads: ChatThread[]
  chat: ChatMessage[]
  designs: Design[]
  /** What the company sells. The marketing manager builds a calendar from this. */
  products: Product[]
  /** Posts by day and platform. The graphic designer reads today’s entries. */
  calendar: CalendarPost[]
  /** Daily notes staff filed to their managers. The owner sees the compiled version on cadence. */
  reports: StaffReport[]
  /** Last time each staff member spoke, in epoch ms. Stops the same person repeating. */
  agentSeen: Record<string, number>
  /** Last time someone started work on their own. */
  agentPulse: number
}

export type CompanyInput = {
  name: string
  businessType: string
  goals: string[]
  ownerName: string
  ownerTitle: 'Chairman' | 'CEO'
  ownerGender: OwnerGender
  appointMd: boolean
  enabledDepartmentKeys: string[]
  enabledRoleKeys: string[]
}

export type RoleInput = {
  title: string
  purpose: string
  responsibilities: string[]
  departmentId: string
  reportsToRoleId: string | null
}

export type StaffInput = {
  name: string
  title: string
  roleId: string
  departmentId: string
  managerId: string | null
  purpose: string
  responsibilities: string[]
}

export type TaskInput = {
  title: string
  description: string
  priority: Priority
  assigneeId: string
  departmentId: string
  consequential: null | { action: ConsequentialAction; summary: string }
}

export type Command =
  | { type: 'TICK' }
  | { type: 'LOAD_SAMPLE' }
  | { type: 'RESET' }
  | { type: 'CREATE_COMPANY'; input: CompanyInput }
  | {
      type: 'UPDATE_COMPANY'
      patch: Partial<Pick<Company, 'name' | 'businessType' | 'ownerName' | 'ownerTitle' | 'ownerGender'>>
    }
  | { type: 'ADD_GOAL'; text: string }
  | { type: 'REMOVE_GOAL'; goalId: string }
  | { type: 'SET_MANAGEMENT'; mode: Company['management'] }
  | { type: 'SET_DEPARTMENT'; departmentId: string; enabled: boolean }
  | { type: 'ADD_DEPARTMENT'; name: string; summary: string; roomId: string }
  | { type: 'SET_ROLE'; roleId: string; enabled: boolean }
  | { type: 'ADD_ROLE'; input: RoleInput }
  | { type: 'ADD_STAFF'; input: StaffInput }
  | {
      type: 'UPDATE_STAFF'
      staffId: string
      patch: {
        name?: string
        title?: string
        purpose?: string
        responsibilities?: string[]
        managerId?: string | null
        photo?: string | null
      }
    }
  | { type: 'SET_STAFF_ENABLED'; staffId: string; enabled: boolean }
  | { type: 'SET_PERMISSION'; staffId: string; permissionId: PermissionId; granted: boolean }
  | { type: 'CREATE_TASK'; input: TaskInput }
  | { type: 'SET_PRIORITY'; taskId: string; priority: Priority }
  | { type: 'PAUSE_TASK'; taskId: string }
  | { type: 'RESUME_TASK'; taskId: string }
  | { type: 'START_TASK'; taskId: string }
  | { type: 'ASSIGN_TASK'; taskId: string; staffId: string }
  | { type: 'ADD_BLOCKER'; taskId: string; text: string }
  | { type: 'CLEAR_BLOCKER'; taskId: string; blockerId: string }
  | { type: 'ADVANCE_TASK'; taskId?: string }
  | { type: 'REVIEW_TASK'; taskId: string; decision: 'accept' | 'changes'; note: string }
  | { type: 'DECIDE_APPROVAL'; approvalId: string; decision: 'approved' | 'rejected'; note: string }
  | { type: 'REQUEST_APPROVAL'; taskId: string }
  | { type: 'CALL_MEETING' }
  | { type: 'END_MEETING' }
  | { type: 'SET_ON_CALL'; staffIds: string[] }
  | { type: 'REQUEST_DESIGN'; brief: string; calendarId?: string }
  | { type: 'PLAN_CALENDAR' }
  | { type: 'REVIEW_DESIGN'; designId: string; decision: 'approved' | 'changes' | 'declined'; note?: string; by?: 'owner' | 'marketing' }
  | { type: 'SET_MARKETING_REVIEW'; enabled: boolean }
  | { type: 'SET_REPORT_CADENCE'; cadence: ReportCadence }
  | { type: 'SEND_MESSAGE'; threadId: string; text: string; wake?: boolean }
  | { type: 'CREATE_GROUP'; id: string; name: string; memberIds: string[] }
  | { type: 'AGENT_MESSAGE'; threadId: string; staffId: string; text: string; designBrief?: string; calendarId?: string; initiative?: boolean }
  | { type: 'POST_MINUTES'; threadId: string; staffId: string; text: string; file: ChatFile }
  | { type: 'SET_AGENTS'; working: boolean }
  | { type: 'SET_ENGINE'; running: boolean }
  | { type: 'SET_REDUCED_MOTION'; value: boolean }
  | { type: 'SET_FLOOR'; visible: boolean }

export type OrgNode = {
  id: string
  name: string
  title: string
  kind: 'owner' | 'person' | 'vacant'
  staffId?: string
  roleId?: string
  children: OrgNode[]
}
