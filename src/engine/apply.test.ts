import { describe, expect, it } from 'vitest'
import { applyCommand, createSampleState, FLOOR_MEETING } from './apply'
import type { CompanyInput } from '../types'

const now = 1_700_000_000_000

describe('demo task engine', () => {
  it('starts the sample with a real handoff, not a connected integration', () => {
    const state = createSampleState(now)
    const riverside = state.tasks.find((task) => task.id === 'task_riverside')
    const priya = state.staff.find((person) => person.id === 'staff_priya')
    expect(state.settings.engineRunning).toBe(false)
    expect(riverside?.handoff?.phase).toBe('delivering')
    expect(riverside?.assigneeId).toBe('staff_priya')
    expect(priya?.presence.movingUntil).toBeGreaterThan(now)
    expect(priya?.presence.label).toBe('Procurement')
    expect(state.integrations.every((item) => item.status === 'not_connected' || item.status === 'demo_data')).toBe(true)
    expect(state.desktop.agentConnected).toBe(false)
    expect(state.desktop.sessionActive).toBe(false)
  })

  it('does not advance playbook work while the demo engine is off', () => {
    const state = createSampleState(now)
    const next = applyCommand(state, { type: 'TICK' }, now + 100_000)
    const campaign = next.tasks.find((task) => task.id === 'task_campaign')
    expect(campaign?.stepIndex).toBe(0)
    expect(campaign?.status).toBe('in_progress')
  })

  it('delivers a procurement handoff and sends sales back to their desk', () => {
    let state = createSampleState(now)
    const arriveAt = state.tasks.find((task) => task.id === 'task_riverside')?.handoff?.arriveAt ?? now
    expect(state.staff.find((person) => person.id === 'staff_priya')?.presence.path.length).toBeGreaterThan(3)
    state = applyCommand(state, { type: 'TICK' }, arriveAt + 50)
    const riverside = state.tasks.find((task) => task.id === 'task_riverside')
    const priya = state.staff.find((person) => person.id === 'staff_priya')
    const marco = state.staff.find((person) => person.id === 'staff_marco')
    expect(riverside?.assigneeId).toBe('staff_marco')
    expect(riverside?.status).toBe('in_progress')
    expect(riverside?.handoff?.phase).toBe('returning')
    expect(priya?.presence.label).toBe('back to their desk')
    expect(marco?.presence.mode).toBe('desk')
    expect(state.events.some((event) => event.message.includes('Marco Bianchi received this'))).toBe(true)
    expect(state.integrations.find((item) => item.id === 'suppliers')?.status).toBe('not_connected')
  })

  it('records publish approval without publishing or connecting social', () => {
    let state = createSampleState(now)
    const pending = state.approvals.find((approval) => approval.taskId === 'task_social')
    expect(pending?.status).toBe('pending')
    expect(state.tasks.find((task) => task.id === 'task_social')?.status).toBe('waiting_for_owner')
    state = applyCommand(
      state,
      { type: 'DECIDE_APPROVAL', approvalId: pending!.id, decision: 'approved', note: '' },
      now,
    )
    const decided = state.approvals.find((approval) => approval.id === pending!.id)
    expect(decided?.outcome).toMatch(/Nothing was published/)
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('not_connected')
    expect(state.desktop.agentConnected).toBe(false)
    const casey = state.staff.find((person) => person.id === 'staff_casey')
    expect(casey?.presence.mode).toBe('reporting')
    state = applyCommand(state, { type: 'TICK' }, now + 60_000)
    const back = state.staff.find((person) => person.id === 'staff_casey')
    expect(back?.presence.mode).not.toBe('reporting')
    expect(back?.presence.x).toBe(back?.deskX)
    expect(back?.presence.y).toBe(back?.deskY)
  })

  it('refuses desktop control when permission is off and never opens a session', () => {
    let state = createSampleState(now)
    const elise = state.staff.find((person) => person.id === 'staff_elise')
    expect(elise?.grants['desktop.control']).toBe(false)
    state = applyCommand(state, { type: 'REQUEST_APPROVAL', taskId: 'task_desktop' }, now)
    expect(state.approvals.some((approval) => approval.taskId === 'task_desktop')).toBe(false)
    expect(state.desktop.sessionActive).toBe(false)
    expect(state.desktop.agentConnected).toBe(false)

    state = applyCommand(
      state,
      { type: 'SET_PERMISSION', staffId: 'staff_elise', permissionId: 'desktop.control', granted: true },
      now,
    )
    state = applyCommand(state, { type: 'REQUEST_APPROVAL', taskId: 'task_desktop' }, now)
    const pending = state.approvals.find((approval) => approval.taskId === 'task_desktop' && approval.status === 'pending')
    expect(pending).toBeTruthy()
    state = applyCommand(
      state,
      { type: 'DECIDE_APPROVAL', approvalId: pending!.id, decision: 'approved', note: '' },
      now,
    )
    expect(state.approvals.find((approval) => approval.id === pending!.id)?.outcome).toMatch(/No desktop session/)
    expect(state.desktop.agentConnected).toBe(false)
    expect(state.desktop.sessionActive).toBe(false)
    expect(state.events.some((event) => event.kind === 'desktop' && event.audit)).toBe(true)
  })

  it('keeps consequential access least-privilege on a new company', () => {
    const empty = createSampleState(now)
    const input: CompanyInput = {
      name: 'Paper Road',
      businessType: 'Professional services',
      goals: ['Keep client work inside the company until I approve it.'],
      ownerName: 'Avery Cole',
      ownerTitle: 'CEO',
      ownerGender: 'female',
      appointMd: true,
      enabledDepartmentKeys: ['executive', 'sales', 'finance'],
      enabledRoleKeys: ['md', 'sales_manager', 'finance_manager'],
    }
    const state = applyCommand({ ...empty, company: null }, { type: 'CREATE_COMPANY', input }, now)
    const sales = state.staff.find((person) => person.title === 'Sales Manager')
    const finance = state.staff.find((person) => person.title === 'Finance Manager')
    expect(sales?.grants['finance.write']).not.toBe(true)
    expect(sales?.grants['desktop.control']).not.toBe(true)
    expect(finance?.grants['purchase.create']).not.toBe(true)
    expect(state.tasks).toHaveLength(0)
    expect(state.integrations.find((item) => item.id === 'email')?.status).toBe('not_connected')
    expect(state.staff.every((person) => person.presence.movingUntil === 0)).toBe(true)
    expect(state.company?.ownerGender).toBe('female')
  })

  it('finishes a walk already on the floor when reduced motion is turned on', () => {
    let state = createSampleState(now)
    expect(state.tasks.find((task) => task.id === 'task_riverside')?.handoff?.phase).toBe('delivering')
    state = applyCommand(state, { type: 'SET_REDUCED_MOTION', value: true }, now)
    const riverside = state.tasks.find((task) => task.id === 'task_riverside')
    expect(riverside?.assigneeId).toBe('staff_marco')
    expect(riverside?.handoff).toBeNull()
    expect(state.staff.every((person) => person.presence.movingUntil <= now)).toBe(true)
    expect(state.integrations.find((item) => item.id === 'suppliers')?.status).toBe('not_connected')
  })

  it('pays salary once into the in-app ledger', () => {
    let state = createSampleState(now)
    const marco = state.staff.find((person) => person.id === 'staff_marco')
    const before = marco?.life.balance ?? 0
    state = {
      ...state,
      clock: { ...state.clock, minute: 11 * 60 + 58, paidDay: -1, updatedAt: now },
    }
    state = applyCommand(state, { type: 'TICK' }, now + 1000)
    const paid = state.staff.find((person) => person.id === 'staff_marco')
    expect(paid?.life.balance).toBe(before + (marco?.life.salary ?? 0))
    expect(state.clock.paidDay).toBe(state.clock.day)
    state = applyCommand(state, { type: 'TICK' }, now + 2000)
    expect(state.staff.find((person) => person.id === 'staff_marco')?.life.balance).toBe(paid?.life.balance)
  })

  it('advances only one due playbook step when the demo engine is on', () => {
    let state = createSampleState(now)
    state = applyCommand(state, { type: 'SET_ENGINE', running: true }, now)
    const before = state.tasks.find((task) => task.id === 'task_campaign')?.stepIndex
    state = applyCommand(state, { type: 'TICK' }, now + 100_000)
    const campaign = state.tasks.find((task) => task.id === 'task_campaign')
    expect(campaign?.stepIndex).toBe((before ?? 0) + 1)
    expect(campaign?.handoff?.toStaffId).toBe('staff_casey')
    expect(state.integrations.every((item) => item.status === 'not_connected' || item.status === 'demo_data')).toBe(true)
  })

  it('calls people who are in the building into the meeting room and sends them back', () => {
    let state = createSampleState(now)
    state = {
      ...state,
      staff: state.staff.map((person) =>
        person.id === 'staff_jonah'
          ? {
              ...person,
              presence: {
                ...person.presence,
                pose: 'sit',
                lifeIntent: 'none',
                x: person.deskX,
                y: person.deskY,
                label: 'At desk',
              },
            }
          : person,
      ),
    }
    state = applyCommand(state, { type: 'CALL_MEETING' }, now)
    const jonah = state.staff.find((person) => person.id === 'staff_jonah')
    const priya = state.staff.find((person) => person.id === 'staff_priya')
    expect(jonah?.presence.meetingTaskId).toBe(FLOOR_MEETING)
    expect(jonah?.presence.mode).toBe('meeting')
    expect(jonah?.presence.label).toBe('Meeting room')
    expect(priya?.presence.meetingTaskId).not.toBe(FLOOR_MEETING)
    expect(state.events[0]?.message).toContain('walking to the meeting room')
    state = applyCommand(state, { type: 'END_MEETING' }, now + 1000)
    expect(state.staff.find((person) => person.id === 'staff_jonah')?.presence.meetingTaskId).toBeNull()
    expect(state.events[0]?.message).toContain('walking back to their desks')
  })

  it('sends a design to the group chat and holds it after approval without posting', () => {
    let state = createSampleState(now)
    expect(state.staff.some((person) => person.id === 'staff_maya')).toBe(true)
    state = applyCommand(state, { type: 'REQUEST_DESIGN', brief: 'Dock Pro launch' }, now)
    const design = state.designs[0]
    expect(design?.status).toBe('in_review')
    expect(design?.createdById).toBe('staff_maya')
    expect(state.chat.some((message) => message.designId === design?.id)).toBe(true)
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('not_connected')
    expect(state.desktop.agentConnected).toBe(false)
    state = applyCommand(state, { type: 'REVIEW_DESIGN', designId: design!.id, decision: 'approved' }, now + 1000)
    expect(state.designs.find((item) => item.id === design?.id)?.status).toBe('held')
    expect(state.chat.some((message) => message.authorId === 'staff_casey' && /not connected/.test(message.text))).toBe(true)
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('not_connected')
    expect(state.events[0]?.message).toContain('not posted')
  })

  it('keeps company, direct, and group chats inside Quorum and prompts the person who is tagged', () => {
    let state = createSampleState(now)
    const company = state.threads.find((thread) => thread.kind === 'company')
    const casey = state.threads.find((thread) => thread.id === 'thread_dm_staff_casey')
    expect(company?.name).toBe('Northline Supply Co.')
    expect(casey?.memberIds).toEqual(['staff_casey'])
    state = applyCommand(state, { type: 'SEND_MESSAGE', threadId: company!.id, text: '@Maya Mensah design a launch poster' }, now)
    expect(state.chat.at(-1)?.mentions).toEqual(['staff_maya'])
    state = applyCommand(state, { type: 'SEND_MESSAGE', threadId: company!.id, text: '@all stand by' }, now + 1)
    expect(state.chat.at(-1)?.mentions).toEqual(company?.memberIds)
    state = applyCommand(state, { type: 'SEND_MESSAGE', threadId: casey!.id, text: 'hello' }, now + 2)
    expect(state.chat.at(-1)?.mentions).toEqual(['staff_casey'])
    state = applyCommand(state, { type: 'CREATE_GROUP', id: 'thread_grp_test', name: 'Launch', memberIds: ['staff_maya', 'staff_casey'] }, now + 3)
    const group = state.threads.find((thread) => thread.id === 'thread_grp_test')
    expect(group?.kind).toBe('group')
    expect(group?.memberIds).toEqual(['staff_maya', 'staff_casey'])
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('not_connected')
    expect(state.desktop.agentConnected).toBe(false)
  })

  it('writes a content calendar for each product and holds today’s design', () => {
    let state = createSampleState(now)
    expect(state.products.map((product) => product.kind)).toEqual(['hardware', 'hardware', 'software'])
    state = applyCommand(state, { type: 'PLAN_CALENDAR' }, now)
    expect(state.calendar).toHaveLength(9)
    expect(new Set(state.calendar.map((post) => post.platform))).toEqual(new Set(['instagram', 'tiktok', 'youtube']))
    expect(state.chat.at(-1)?.authorId).toBe('staff_samir')
    const today = state.calendar.find((post) => post.day === state.clock.day && post.productId === 'prod_dock')
    expect(today?.platform).toBe('instagram')
    state = applyCommand(state, { type: 'REQUEST_DESIGN', brief: today!.brief, calendarId: today!.id }, now + 1)
    const design = state.designs[0]
    expect(design?.platform).toBe('instagram')
    expect(design?.format).toBe('flyer')
    expect(state.calendar.find((post) => post.id === today?.id)?.status).toBe('in_review')
    state = applyCommand(state, { type: 'REVIEW_DESIGN', designId: design!.id, decision: 'approved' }, now + 2)
    expect(state.calendar.find((post) => post.id === today?.id)?.status).toBe('held')
    expect(state.chat.some((message) => message.authorId === 'staff_casey' && /Instagram/.test(message.text) && /nothing was posted/.test(message.text))).toBe(true)
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('not_connected')
    expect(state.desktop.agentConnected).toBe(false)
    state = applyCommand(state, { type: 'PLAN_CALENDAR' }, now + 3)
    expect(state.calendar).toHaveLength(9)
  })

  it('lets the marketing manager correct, decline, or approve, unless you turn that off', () => {
    let state = createSampleState(now)
    state = applyCommand(state, { type: 'PLAN_CALENDAR' }, now)
    const post = state.calendar.find((item) => item.productId === 'prod_dock' && item.day === state.clock.day)
    state = applyCommand(state, { type: 'REQUEST_DESIGN', brief: post!.brief, calendarId: post!.id }, now + 1)
    const design = state.designs[0]
    expect(design?.reviewer).toBe('marketing')
    state = applyCommand(state, { type: 'REVIEW_DESIGN', designId: design!.id, decision: 'changes', note: 'Make the dock larger.', by: 'marketing' }, now + 2)
    const revised = state.designs.find((item) => item.status === 'in_review')
    expect(revised?.reviewer).toBe('marketing')
    expect(state.chat.some((message) => message.authorId === 'staff_samir' && /Please change/.test(message.text))).toBe(true)
    state = applyCommand(state, { type: 'REVIEW_DESIGN', designId: revised!.id, decision: 'approved', by: 'marketing' }, now + 3)
    expect(state.designs.find((item) => item.id === revised?.id)?.status).toBe('in_review')
    expect(state.designs.find((item) => item.id === revised?.id)?.reviewer).toBe('owner')
    expect(state.chat.some((message) => message.authorId === 'staff_casey')).toBe(false)
    state = applyCommand(state, { type: 'REVIEW_DESIGN', designId: revised!.id, decision: 'approved' }, now + 4)
    expect(state.designs.find((item) => item.id === revised?.id)?.status).toBe('held')
    const another = state.calendar.find((item) => item.status === 'planned' && item.day === state.clock.day)
    state = applyCommand(state, { type: 'REQUEST_DESIGN', brief: another!.brief, calendarId: another!.id }, now + 5)
    const second = state.designs.find((item) => item.calendarId === another?.id && item.status === 'in_review')
    state = applyCommand(state, { type: 'REVIEW_DESIGN', designId: second!.id, decision: 'declined', note: 'Wrong claim.', by: 'marketing' }, now + 6)
    expect(state.designs.find((item) => item.id === second?.id)?.status).toBe('declined')
    expect(state.calendar.find((item) => item.id === another?.id)?.status).toBe('declined')
    state = applyCommand(state, { type: 'SET_MARKETING_REVIEW', enabled: false }, now + 7)
    const third = state.calendar.find((item) => item.status === 'planned')
    state = applyCommand(state, { type: 'REQUEST_DESIGN', brief: third!.brief, calendarId: third!.id }, now + 8)
    expect(state.designs.find((item) => item.calendarId === third?.id)?.reviewer).toBe('owner')
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('not_connected')
    expect(state.desktop.agentConnected).toBe(false)
  })

  it('files staff notes to managers at close, then the compiled report to you', () => {
    let state = createSampleState(now)
    expect(state.threads.some((thread) => thread.id === 'thread_line_staff_jonah')).toBe(true)
    state = { ...state, clock: { ...state.clock, minute: state.clock.closeMinute } }
    state = applyCommand(state, { type: 'TICK' }, now + 1000)
    expect(state.reports.some((item) => item.staffId === 'staff_jonah' && item.managerId === 'staff_priya')).toBe(true)
    const line = state.chat.find((message) => message.threadId === 'thread_line_staff_jonah' && message.authorId === 'staff_jonah')
    expect(line?.text).toMatch(/Day 5 report/)
    const rollup = state.chat.find((message) => message.threadId === 'thread_dm_staff_priya' && message.authorId === 'staff_priya')
    expect(rollup?.text).toMatch(/Daily report/)
    expect(state.clock.filedDay).toBe(state.clock.day)
    expect(state.clock.ownerReportDay).toBe(state.clock.day)
    const again = applyCommand(state, { type: 'TICK' }, now + 2000)
    expect(again.chat.length).toBe(state.chat.length)
    let weekly = applyCommand(state, { type: 'SET_REPORT_CADENCE', cadence: 'weekly' }, now + 3000)
    weekly = { ...weekly, clock: { ...weekly.clock, day: weekly.clock.day + 1, minute: weekly.clock.closeMinute } }
    weekly = applyCommand(weekly, { type: 'TICK' }, now + 4000)
    expect(weekly.clock.filedDay).toBe(weekly.clock.day)
    expect(weekly.clock.ownerReportDay).toBe(state.clock.day)
    expect(weekly.chat.filter((message) => message.threadId === 'thread_dm_staff_priya' && message.authorId === 'staff_priya')).toHaveLength(1)
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('not_connected')
    expect(state.desktop.agentConnected).toBe(false)
  })

  it('sits people on a call at their desks and clears the pose when the call ends', () => {
    let state = createSampleState(now)
    const inBuilding = state.staff.filter((person) => person.presence.pose !== 'away').slice(0, 2)
    expect(inBuilding.length).toBeGreaterThan(0)
    const ids = inBuilding.map((person) => person.id)
    state = applyCommand(state, { type: 'SET_ON_CALL', staffIds: ids }, now)
    const onCall = state.staff.find((person) => person.id === ids[0])
    expect(onCall?.presence.pose).toBe('call')
    expect(onCall?.presence.label).toBe('On a call')
    state = applyCommand(state, { type: 'SET_ON_CALL', staffIds: [] }, now + 50)
    const after = state.staff.find((person) => person.id === ids[0])
    expect(after?.presence.pose).not.toBe('call')
    expect(after?.presence.label).not.toBe('On a call')
  })

  it('stores a portrait the person can change', () => {
    let state = createSampleState(now)
    state = applyCommand(state, { type: 'UPDATE_STAFF', staffId: 'staff_morgan', patch: { photo: 'data:image/jpeg;base64,xx' } }, now)
    expect(state.staff.find((person) => person.id === 'staff_morgan')?.photo).toMatch(/^data:image/)
    state = applyCommand(state, { type: 'UPDATE_STAFF', staffId: 'staff_morgan', patch: { photo: null } }, now + 1)
    expect(state.staff.find((person) => person.id === 'staff_morgan')?.photo).toBeUndefined()
  })

  it('keeps a voice-call line in the chat without waking every agent', () => {
    let state = createSampleState(now)
    const casey = state.threads.find((thread) => thread.id === 'thread_dm_staff_casey')
    state = applyCommand(state, { type: 'SEND_MESSAGE', threadId: casey!.id, text: 'hey, how are you?', wake: false }, now)
    expect(state.chat.at(-1)?.text).toBe('hey, how are you?')
    expect(state.chat.at(-1)?.mentions).toEqual([])
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('not_connected')
  })
})
