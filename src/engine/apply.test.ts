import { describe, expect, it } from 'vitest'
import { applyCommand, FLOOR_MEETING } from './apply'
import { createSampleState } from './fixture'
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
    expect(state.integrations.every((item) => item.status === 'not_connected' || item.status === 'in_app')).toBe(true)
    expect(state.desktop.agentConnected).toBe(false)
    expect(state.desktop.sessionActive).toBe(false)
  })

  it('does not auto-finish desk work on a timer; staff AI must file it', () => {
    const state = createSampleState(now)
    const next = applyCommand(state, { type: 'TICK' }, now + 100_000)
    const campaign = next.tasks.find((task) => task.id === 'task_campaign')
    expect(campaign?.stepIndex).toBe(0)
    expect(campaign?.status).toBe('in_progress')
    expect(campaign?.source).toBe('staff')
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
    expect(state.integrations.find((item) => item.id === 'suppliers')?.status).toBe('in_app')
  })

  it('records publish approval into a Quorum social hold without live posting', () => {
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
    expect(decided?.outcome).toMatch(/held in Quorum/)
    expect(state.records.some((item) => item.kind === 'social' && item.taskId === 'task_social')).toBe(true)
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('in_app')
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
    expect(state.desktop.grantedStaffId).toBeUndefined()
    expect(state.desktop.sessionActive).toBe(false)
    expect(state.events.some((event) => event.kind === 'desktop' && event.audit)).toBe(true)
  })

  it('starts and ends an Approved desktop session without touching social or email', () => {
    let state = createSampleState(now)
    state = applyCommand(state, { type: 'SET_DESKTOP_AGENT', connected: true }, now)
    expect(state.desktop.agentConnected).toBe(true)
    expect(state.integrations.find((item) => item.id === 'desktop')?.status).toBe('in_app')
    state = applyCommand(state, { type: 'START_DESKTOP_SESSION', mode: 'approved' }, now)
    expect(state.desktop.sessionActive).toBe(true)
    expect(state.desktop.mode).toBe('approved')
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('in_app')
    expect(state.integrations.find((item) => item.id === 'email')?.status).toBe('in_app')
    state = applyCommand(state, { type: 'END_DESKTOP_SESSION' }, now)
    expect(state.desktop.sessionActive).toBe(false)
    expect(state.desktop.mode).toBeNull()
    expect(state.desktop.grantedStaffId).toBeUndefined()
  })

  it('grants a Live desktop run after permission, session, and approval', () => {
    let state = createSampleState(now)
    state = applyCommand(state, { type: 'SET_DESKTOP_AGENT', connected: true }, now)
    state = applyCommand(state, { type: 'START_DESKTOP_SESSION', mode: 'live' }, now)
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
    expect(state.approvals.find((approval) => approval.id === pending!.id)?.outcome).toMatch(/Live desktop control/)
    expect(state.desktop.grantedStaffId).toBe('staff_elise')
    expect(state.desktop.grantedTaskId).toBe('task_desktop')
    expect(state.tasks.find((task) => task.id === 'task_desktop')?.status).toBe('in_progress')
    state = applyCommand(state, { type: 'CLEAR_DESKTOP_GRANT' }, now)
    expect(state.desktop.grantedStaffId).toBeUndefined()
    expect(state.desktop.sessionActive).toBe(true)
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('in_app')
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
    expect(sales?.name).toBe('Priya Shah')
    expect(finance?.name).toBe('David Chen')
    expect(state.staff.every((person) => person.name !== person.title)).toBe(true)
    expect(sales?.grants['finance.write']).not.toBe(true)
    expect(sales?.grants['desktop.control']).not.toBe(true)
    expect(finance?.grants['purchase.create']).not.toBe(true)
    expect(state.tasks).toHaveLength(0)
    expect(state.integrations.find((item) => item.id === 'email')?.status).toBe('in_app')
    expect(state.staff.every((person) => person.presence.movingUntil === 0)).toBe(true)
    expect(state.company?.ownerGender).toBe('female')
    expect(state.company?.website).toBeUndefined()
    const withSite = applyCommand(
      { ...empty, company: null },
      { type: 'CREATE_COMPANY', input: { ...input, website: 'paperroad.example' } },
      now,
    )
    expect(withSite.company?.website).toBe('https://paperroad.example/')
    const cleared = applyCommand(withSite, { type: 'UPDATE_COMPANY', patch: { website: '' } }, now)
    expect(cleared.company?.website).toBeUndefined()
    const withSocial = applyCommand(
      { ...empty, company: null },
      { type: 'CREATE_COMPANY', input: { ...input, social: { instagram: 'instagram.com/paperroad', youtube: '' } } },
      now,
    )
    expect(withSocial.company?.social).toEqual({ instagram: 'https://instagram.com/paperroad' })
    const clearedSocial = applyCommand(withSocial, { type: 'UPDATE_COMPANY', patch: { social: {} } }, now)
    expect(clearedSocial.company?.social).toBeUndefined()
    expect(state.company?.planId).toBe('starter')
    const lite = applyCommand(state, { type: 'SET_BILLING_PLAN', planId: 'lite' }, now + 1)
    expect(lite.company?.planId).toBe('lite')
    expect(lite.events[0]?.message).toMatch(/Lite/)
    const upgraded = applyCommand(lite, { type: 'SET_BILLING_PLAN', planId: 'pro' }, now + 2)
    expect(upgraded.company?.planId).toBe('pro')
    expect(upgraded.events[0]?.message).toMatch(/Pro/)
    const same = applyCommand(upgraded, { type: 'SET_BILLING_PLAN', planId: 'pro' }, now + 2)
    expect(same).toBe(upgraded)
  })

  it('stores public company Meta status without changing other fields', () => {
    const state = createSampleState(now)
    const meta = {
      appReady: true,
      canHost: true,
      instagram: { connected: true, source: 'company' as const, username: 'clemx', accountId: '178414' },
      whatsapp: { connected: false, source: 'none' as const },
    }
    const next = applyCommand(state, { type: 'SET_COMPANY_META', meta }, now)
    expect(next.meta).toEqual(meta)
    expect(applyCommand(next, { type: 'SET_COMPANY_META', meta }, now)).toBe(next)
  })

  it('follows the time on this computer when local time is on', () => {
    const state = applyCommand(createSampleState(now), { type: 'SET_REAL_TIME', value: true }, now)
    const at = now + 1000
    const next = applyCommand(state, { type: 'TICK' }, at)
    const date = new Date(at)
    const minute = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
    expect(next.settings.realTime).toBe(true)
    expect(next.clock.minute).toBeCloseTo(minute, 5)
    if (minute >= 12 * 60) {
      expect(next.clock.paidDay).toBe(-1)
      expect(next.events.some((event) => event.message.startsWith('Payday'))).toBe(false)
    }
    const office = applyCommand(next, { type: 'SET_REAL_TIME', value: false }, at)
    const later = applyCommand(office, { type: 'TICK' }, at + 1000)
    expect(later.settings.realTime).toBe(false)
    expect(later.clock.minute).toBeGreaterThan(next.clock.minute)
    expect(later.clock.minute).toBeLessThan(next.clock.minute + 5)
  })

  it('lets the owner talk with Quorum and ask for the computer', () => {
    let state = createSampleState(now)
    expect(state.threads.some((thread) => thread.id === 'thread_quorum')).toBe(true)
    state = applyCommand(state, { type: 'SEND_MESSAGE', threadId: 'thread_quorum', text: 'What does this company sell?', wake: false }, now)
    expect(state.chat.at(-1)?.authorId).toBe('owner')
    state = applyCommand(state, { type: 'QUORUM_MESSAGE', text: 'You sell ICT systems. DESKTOP should be stripped already.' }, now + 1)
    expect(state.chat.at(-1)?.authorId).toBe('quorum')
    state = applyCommand(
      state,
      { type: 'ASK_QUORUM_DESKTOP', reason: 'Open the catalog file on this computer.', prompt: 'Open the catalog.' },
      now + 2,
    )
    expect(state.quorumAsk?.status).toBe('pending')
    const refused = applyCommand(state, { type: 'DECIDE_QUORUM_DESKTOP', decision: 'granted' }, now + 3)
    expect(refused.quorumAsk?.status).toBe('pending')
    state = applyCommand(state, { type: 'DECIDE_QUORUM_DESKTOP', decision: 'declined' }, now + 4)
    expect(state.quorumAsk?.status).toBe('declined')
    expect(state.desktop.grantedQuorum).toBeUndefined()
  })

  it('keeps a live desktop session going and stores steps when Quorum asks again', () => {
    let state = createSampleState(now)
    state = applyCommand(state, { type: 'SET_DESKTOP_AGENT', connected: true }, now)
    state = applyCommand(state, { type: 'START_DESKTOP_SESSION', mode: 'approved' }, now)
    state = applyCommand(state, { type: 'START_DESKTOP_SESSION', mode: 'live' }, now + 1)
    expect(state.desktop.sessionActive).toBe(true)
    expect(state.desktop.mode).toBe('live')
    state = applyCommand(
      state,
      { type: 'ASK_QUORUM_DESKTOP', reason: 'Open Notepad and type Clemx.', prompt: 'Open notepad' },
      now + 2,
    )
    state = applyCommand(state, { type: 'DECIDE_QUORUM_DESKTOP', decision: 'granted' }, now + 3)
    expect(state.desktop.grantedQuorum).toBe(true)
    state = applyCommand(
      state,
      {
        type: 'ASK_QUORUM_DESKTOP',
        reason: 'Delete a file on this computer.',
        prompt: 'Open notepad',
        steps: ['Opened notepad'],
      },
      now + 4,
    )
    expect(state.quorumAsk?.status).toBe('pending')
    expect(state.desktop.grantedQuorum).toBeUndefined()
    expect(state.quorumAsk?.steps).toEqual(['Opened notepad'])
    state = applyCommand(state, { type: 'DECIDE_QUORUM_DESKTOP', decision: 'granted' }, now + 5)
    expect(state.desktop.grantedQuorum).toBe(true)
    expect(state.quorumAsk?.steps).toEqual(['Opened notepad'])
    state = applyCommand(state, { type: 'END_DESKTOP_SESSION' }, now + 6)
    expect(state.desktop.sessionActive).toBe(false)
    expect(state.desktop.grantedQuorum).toBeUndefined()
    expect(state.quorumAsk?.status).toBe('pending')
    state = applyCommand(state, { type: 'SET_QUORUM_SCREEN', screen: { kind: 'page', url: 'https://example.com', title: 'Example' } }, now + 7)
    expect(state.quorumScreen).toMatchObject({ kind: 'page', url: 'https://example.com', title: 'Example' })
  })

  it('keeps a drafted document on the message and can file a PDF', () => {
    let state = createSampleState(now)
    state = applyCommand(
      state,
      {
        type: 'QUORUM_MESSAGE',
        text: [
          'Here is the proposal.',
          'DOCUMENT: proposal | Fleet supply',
          'Prepared for: Ada Okonkwo, Motor House Ltd',
          '---',
          'Prepared by Riley Chen, Chairman',
          'Northline can supply the yard.',
          '---',
        ].join('\n'),
      },
      now,
    )
    const message = state.chat.at(-1)
    expect(message?.text).toBe('Here is the proposal.')
    expect(message?.document?.title).toBe('Fleet supply')
    expect(message?.document?.body).toMatch(/Northline can supply/)
    state = applyCommand(state, { type: 'MAKE_QUORUM_PDF', messageId: message!.id }, now + 1)
    expect(state.chat.at(-1)?.file?.mime).toBe('application/pdf')
    expect(state.chat.at(-1)?.file?.dataUrl.startsWith('data:application/pdf')).toBe(true)
    expect(state.quorumScreen).toMatchObject({ kind: 'pdf', messageId: message!.id, title: 'Fleet supply' })
    state = applyCommand(state, { type: 'EDIT_QUORUM_DOCUMENT', messageId: message!.id, body: 'Prepared by [Name], [Title]. Updated yard plan.' }, now + 2)
    expect(state.chat.at(-1)?.document?.body).toMatch(/Riley Chen/)
    expect(state.chat.at(-1)?.document?.body).toMatch(/Chairman/)
    expect(state.chat.at(-1)?.file).toBeUndefined()
    expect(state.quorumScreen).toBeNull()
  })

  it('converts a fenced draft to a PDF on the Quorum screen', () => {
    let state = createSampleState(now)
    state = applyCommand(
      state,
      {
        type: 'QUORUM_MESSAGE',
        text: [
          "Here's a draft proposal for the fleet.",
          '---',
          'PROPOSAL',
          'Fleet Technology and Security Solutions',
          'Prepared by: Northline Supply Co.',
          '1. Introduction',
          'Northline can supply the yard with tracking, cameras, and power so the fleet stays visible.',
          '[Name]',
          '[Title]',
          '---',
          'Fill in the bracketed placeholders if anything is still open.',
        ].join('\n'),
      },
      now,
    )
    const message = state.chat.at(-1)
    expect(message?.text).toMatch(/Here's a draft/)
    expect(message?.document?.title).toBe('Fleet Technology and Security Solutions')
    expect(message?.document?.body).toMatch(/Riley Chen/)
    expect(message?.document?.body).toMatch(/Chairman/)
    expect(message?.document?.body).not.toMatch(/\[Name\]/)
    state = applyCommand(state, { type: 'MAKE_QUORUM_PDF', messageId: message!.id }, now + 1)
    expect(state.quorumScreen).toMatchObject({
      kind: 'pdf',
      messageId: message!.id,
      title: 'Fleet Technology and Security Solutions',
    })
    expect(state.chat.at(-1)?.file?.mime).toBe('application/pdf')
  })

  it('opens another Quorum chat and titles it from the first ask', () => {
    let state = createSampleState(now)
    state = applyCommand(state, { type: 'SEND_MESSAGE', threadId: 'thread_quorum', text: 'Hello there', wake: false }, now)
    expect(state.threads.find((thread) => thread.id === 'thread_quorum')?.name).toBe('Hello there')
    state = applyCommand(state, { type: 'NEW_QUORUM_CHAT', id: 'thread_quorum_2' }, now + 1)
    expect(state.threads.some((thread) => thread.id === 'thread_quorum_2')).toBe(true)
    const skipped = applyCommand(state, { type: 'NEW_QUORUM_CHAT', id: 'thread_quorum_3' }, now + 2)
    expect(skipped.threads.some((thread) => thread.id === 'thread_quorum_3')).toBe(false)
    state = applyCommand(state, { type: 'SEND_MESSAGE', threadId: 'thread_quorum_2', text: 'Research solar inverters', wake: false }, now + 3)
    expect(state.threads.find((thread) => thread.id === 'thread_quorum_2')?.name).toBe('Research solar inverters')
    state = applyCommand(state, { type: 'QUORUM_MESSAGE', text: 'Here is a short brief.', threadId: 'thread_quorum_2' }, now + 4)
    expect(state.chat.filter((message) => message.threadId === 'thread_quorum_2').at(-1)?.authorId).toBe('quorum')
    const asked = state.chat.find((message) => message.threadId === 'thread_quorum_2' && message.authorId === 'owner')
    state = applyCommand(state, { type: 'EDIT_OWNER_MESSAGE', messageId: asked!.id, text: 'Research lithium batteries' }, now + 5)
    expect(state.chat.filter((message) => message.threadId === 'thread_quorum_2')).toHaveLength(1)
    expect(state.chat.filter((message) => message.threadId === 'thread_quorum_2').at(-1)?.text).toBe('Research lithium batteries')
    expect(state.threads.find((thread) => thread.id === 'thread_quorum_2')?.name).toBe('Research lithium batteries')
    state = applyCommand(state, { type: 'QUORUM_MESSAGE', text: 'Lithium brief.', threadId: 'thread_quorum_2' }, now + 6)
    state = applyCommand(state, { type: 'RETRY_QUORUM', threadId: 'thread_quorum_2' }, now + 7)
    expect(state.chat.filter((message) => message.threadId === 'thread_quorum_2').at(-1)?.authorId).toBe('owner')
    state = applyCommand(state, { type: 'RENAME_QUORUM_CHAT', threadId: 'thread_quorum_2', name: '  Solar notes  ' }, now + 8)
    expect(state.threads.find((thread) => thread.id === 'thread_quorum_2')?.name).toBe('Solar notes')
    state = applyCommand(state, { type: 'DELETE_QUORUM_CHAT', threadId: 'thread_quorum_2' }, now + 9)
    expect(state.threads.some((thread) => thread.id === 'thread_quorum_2')).toBe(false)
    expect(state.chat.some((message) => message.threadId === 'thread_quorum_2')).toBe(false)
    expect(state.threads.some((thread) => thread.id === 'thread_quorum')).toBe(true)
  })

  it('finishes a walk already on the floor when reduced motion is turned on', () => {
    let state = createSampleState(now)
    expect(state.tasks.find((task) => task.id === 'task_riverside')?.handoff?.phase).toBe('delivering')
    state = applyCommand(state, { type: 'SET_REDUCED_MOTION', value: true }, now)
    const riverside = state.tasks.find((task) => task.id === 'task_riverside')
    expect(riverside?.assigneeId).toBe('staff_marco')
    expect(riverside?.handoff).toBeNull()
    expect(state.staff.every((person) => person.presence.movingUntil <= now)).toBe(true)
    expect(state.integrations.find((item) => item.id === 'suppliers')?.status).toBe('in_app')
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

  it('lets staff AI complete desk work and advance the playbook without posting outside', () => {
    let state = createSampleState(now)
    const before = state.tasks.find((task) => task.id === 'task_campaign')?.stepIndex
    state = applyCommand(
      state,
      {
        type: 'COMPLETE_WORK',
        taskId: 'task_campaign',
        staffId: 'staff_samir',
        text: 'Dock Pro campaign outline drafted with three claims tied to catalog facts. Nothing was published.',
        result: 'Campaign outline ready for social draft.',
      },
      now,
    )
    const campaign = state.tasks.find((task) => task.id === 'task_campaign')
    expect(campaign?.stepIndex).toBe((before ?? 0) + 1)
    expect(campaign?.handoff?.toStaffId).toBe('staff_casey')
    expect(state.chat.some((message) => message.authorId === 'staff_samir' && /Dock Pro/.test(message.text))).toBe(true)
    expect(state.integrations.every((item) => item.status === 'not_connected' || item.status === 'in_app')).toBe(true)
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('in_app')
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
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('in_app')
    expect(state.desktop.agentConnected).toBe(false)
    state = applyCommand(state, { type: 'REVIEW_DESIGN', designId: design!.id, decision: 'approved' }, now + 1000)
    expect(state.designs.find((item) => item.id === design?.id)?.status).toBe('held')
    expect(state.chat.some((message) => message.authorId === 'staff_casey' && /not connected/.test(message.text))).toBe(true)
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('in_app')
    expect(state.events[0]?.message).toContain('not posted')
  })

  it('lets the social media agent mark an Instagram graphic as published', () => {
    let state = createSampleState(now)
    state = applyCommand(state, { type: 'PLAN_CALENDAR' }, now)
    const post = state.calendar.find((item) => item.platform === 'instagram' && item.status === 'planned')
    expect(post).toBeTruthy()
    state = applyCommand(state, { type: 'REQUEST_DESIGN', brief: post!.brief, calendarId: post!.id }, now + 1)
    const design = state.designs.find((item) => item.calendarId === post?.id)
    expect(design?.platform).toBe('instagram')
    if (design?.reviewer === 'marketing') {
      state = applyCommand(state, { type: 'REVIEW_DESIGN', designId: design.id, decision: 'approved', by: 'marketing' }, now + 2)
    }
    state = applyCommand(state, { type: 'REVIEW_DESIGN', designId: design!.id, decision: 'approved' }, now + 3)
    expect(state.designs.find((item) => item.id === design?.id)?.status).toBe('held')
    state = applyCommand(
      state,
      { type: 'INSTAGRAM_RESULT', designId: design!.id, status: 'published', mediaId: 'ig_media_1' },
      now + 4,
    )
    expect(state.designs.find((item) => item.id === design?.id)?.status).toBe('published')
    expect(state.calendar.find((item) => item.id === post?.id)?.status).toBe('published')
    expect(state.chat.some((message) => message.authorId === 'staff_casey' && /Published/.test(message.text))).toBe(true)
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
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('in_app')
    expect(state.desktop.agentConnected).toBe(false)
  })

  it('writes a content calendar for each product and holds today’s design', () => {
    let state = createSampleState(now)
    expect(state.products.map((product) => product.kind)).toEqual(['hardware', 'hardware', 'software'])
    state = applyCommand(state, { type: 'PLAN_CALENDAR' }, now)
    expect(state.calendar).toHaveLength(60)
    expect(new Set(state.calendar.map((post) => post.platform))).toEqual(new Set(['instagram', 'tiktok', 'youtube']))
    expect(state.calendar.every((post) => post.sizeLabel && post.weekday && post.caption)).toBe(true)
    expect(state.chat.at(-1)?.authorId).toBe('staff_samir')
    expect(state.chat.at(-1)?.file?.mime).toBe('application/pdf')
    expect(state.chat.at(-1)?.file?.name).toMatch(/content-calendar\.pdf$/)
    const today = state.calendar.find((post) => post.day === state.clock.day && post.productId === 'prod_dock')
    expect(today?.platform).toBe('youtube')
    expect(today?.size).toBe('thumbnail')
    state = applyCommand(state, { type: 'REQUEST_DESIGN', brief: today!.brief, calendarId: today!.id }, now + 1)
    const design = state.designs[0]
    expect(design?.platform).toBe('youtube')
    expect(design?.format).toBe('thumbnail')
    expect(state.calendar.find((post) => post.id === today?.id)?.status).toBe('in_review')
    state = applyCommand(state, { type: 'REVIEW_DESIGN', designId: design!.id, decision: 'approved' }, now + 2)
    expect(state.calendar.find((post) => post.id === today?.id)?.status).toBe('held')
    expect(state.chat.some((message) => message.authorId === 'staff_casey' && /YouTube/.test(message.text) && /nothing was posted/.test(message.text))).toBe(true)
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('in_app')
    expect(state.desktop.agentConnected).toBe(false)
    state = applyCommand(state, { type: 'PLAN_CALENDAR' }, now + 3)
    expect(state.calendar).toHaveLength(60)
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
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('in_app')
    expect(state.desktop.agentConnected).toBe(false)
  })

  it('files staff notes to managers at close, then the compiled report to you', () => {
    let state = createSampleState(now)
    expect(state.threads.some((thread) => thread.id === 'thread_line_staff_jonah')).toBe(true)
    state = { ...state, clock: { ...state.clock, minute: state.clock.closeMinute } }
    state = applyCommand(state, { type: 'TICK' }, now + 1000)
    expect(state.reports.some((item) => item.staffId === 'staff_jonah')).toBe(false)
    expect(state.chat.some((message) => /Went for water|cafeteria|toilet/.test(message.text))).toBe(false)
    expect(state.chat.some((message) => /Day \d+ report|Daily report/.test(message.text))).toBe(false)
    expect(state.reports.some((item) => item.staffId === 'staff_priya' && /Riverside/.test(item.text))).toBe(true)
    expect(state.clock.filedDay).toBe(state.clock.day)
    expect(state.clock.ownerReportDay).toBe(state.clock.day)
    const again = applyCommand(state, { type: 'TICK' }, now + 2000)
    expect(again.chat.length).toBe(state.chat.length)
    let weekly = applyCommand(state, { type: 'SET_REPORT_CADENCE', cadence: 'weekly' }, now + 3000)
    weekly = { ...weekly, clock: { ...weekly.clock, day: weekly.clock.day + 1, minute: weekly.clock.closeMinute } }
    weekly = applyCommand(weekly, { type: 'TICK' }, now + 4000)
    expect(weekly.clock.filedDay).toBe(weekly.clock.day)
    expect(weekly.clock.ownerReportDay).toBe(state.clock.day)
    expect(weekly.chat.filter((message) => message.threadId === 'thread_dm_staff_morgan' && message.authorId === 'staff_morgan')).toHaveLength(0)
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('in_app')
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
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('in_app')
  })

  it('sends in-house meeting flyers by DM, then to the company group, never to social', () => {
    let state = createSampleState(now)
    state = applyCommand(state, { type: 'REQUEST_DESIGN', brief: 'Flyer for tomorrow’s all-hands meeting', audience: 'internal' }, now)
    const design = state.designs[0]
    expect(design?.audience).toBe('internal')
    expect(design?.platform).toBeUndefined()
    expect(design?.threadId).toBe('thread_dm_staff_maya')
    expect(state.chat.some((message) => message.threadId === 'thread_dm_staff_maya' && message.designId === design?.id)).toBe(true)
    expect(state.chat.some((message) => message.threadId === 'thread_company' && message.designId === design?.id)).toBe(false)
    state = applyCommand(state, { type: 'REVIEW_DESIGN', designId: design!.id, decision: 'approved' }, now + 1)
    const approved = state.designs.find((item) => item.id === design?.id)
    expect(approved?.status).toBe('approved')
    expect(state.chat.some((message) => message.threadId === 'thread_company' && message.designId === design?.id && /in-house|not for Instagram/i.test(message.text))).toBe(true)
    expect(state.chat.some((message) => message.authorId === 'staff_casey' && message.designId === design?.id)).toBe(false)
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('in_app')
  })

  it('lets Maya keep a studio graphic, then a photograph, without posting', () => {
    let state = createSampleState(now)
    expect(state.integrations.find((item) => item.id === 'graphics')?.status).toBe('in_app')
    expect(state.integrations.find((item) => item.id === 'staff_brain')?.status).toBe('in_app')
    state = applyCommand(state, { type: 'PLAN_CALENDAR' }, now)
    const today = state.calendar.find((post) => post.day === state.clock.day && post.productId === 'prod_dock')
    state = applyCommand(state, { type: 'REQUEST_DESIGN', brief: today!.brief, calendarId: today!.id }, now + 1)
    const design = state.designs[0]
    expect(design?.artStatus).toBe('pending')
    expect(design?.productName).toBe('Dock Pro')
    expect(design?.svg).toMatch(/YOUTUBE|INSTAGRAM/)
    expect(design?.svg).toContain('NORTHLINE')
    const image = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD'
    state = applyCommand(state, { type: 'SET_DESIGN_ART', designId: design!.id, image }, now + 2)
    const painted = state.designs.find((item) => item.id === design?.id)
    expect(painted?.artStatus).toBe('ready')
    expect(painted?.status).toBe('in_review')
    expect(painted?.svg).toContain('data:image/jpeg')
    state = applyCommand(state, { type: 'SET_DESIGN_ART', designId: design!.id }, now + 3)
    expect(state.designs.find((item) => item.id === design?.id)?.artStatus).toBe('ready')
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('in_app')
    expect(state.desktop.agentConnected).toBe(false)
  })

  it('lets the MD and a department manager open day-to-day work, and refuses line staff and other lanes', () => {
    const state = createSampleState(now)
    const david = state.staff.find((person) => person.id === 'staff_david')!
    const jonah = state.staff.find((person) => person.id === 'staff_jonah')!
    const byMd = applyCommand(
      state,
      {
        type: 'STAFF_CREATE_TASK',
        staffId: 'staff_morgan',
        input: {
          title: 'Price the education bundle',
          description: 'A finance check inside Quorum.',
          priority: 'medium',
          assigneeId: david.id,
          departmentId: david.departmentId,
          consequential: null,
        },
      },
      now,
    )
    const mdTask = byMd.tasks.find((task) => task.title === 'Price the education bundle')
    expect(mdTask?.status).toBe('ready')
    expect(mdTask?.source).toBe('manager')
    expect(mdTask?.createdById).toBe('staff_morgan')

    const bySales = applyCommand(
      state,
      {
        type: 'STAFF_CREATE_TASK',
        staffId: 'staff_priya',
        goalId: 'goal_stock',
        input: {
          title: 'Prepare the school quote',
          description: 'Quote work for sales.',
          priority: 'high',
          assigneeId: jonah.id,
          departmentId: jonah.departmentId,
          consequential: null,
        },
      },
      now,
    )
    expect(bySales.tasks.find((task) => task.title === 'Prepare the school quote')?.status).toBe('ready')

    const byBuyer = applyCommand(
      state,
      {
        type: 'STAFF_CREATE_TASK',
        staffId: 'staff_aisha',
        input: {
          title: 'Call a vendor',
          description: 'Should not open.',
          priority: 'low',
          assigneeId: 'staff_marco',
          departmentId: state.staff.find((person) => person.id === 'staff_marco')!.departmentId,
          consequential: null,
        },
      },
      now,
    )
    expect(byBuyer.tasks.some((task) => task.title === 'Call a vendor')).toBe(false)

    const byExecutive = applyCommand(
      state,
      {
        type: 'STAFF_CREATE_TASK',
        staffId: 'staff_jonah',
        input: {
          title: 'Own the account',
          description: 'Should not open.',
          priority: 'low',
          assigneeId: 'staff_lena',
          departmentId: jonah.departmentId,
          consequential: null,
        },
      },
      now,
    )
    expect(byExecutive.tasks.some((task) => task.title === 'Own the account')).toBe(false)

    const byMarketing = applyCommand(
      state,
      {
        type: 'STAFF_CREATE_TASK',
        staffId: 'staff_samir',
        input: {
          title: 'Post the ledger',
          description: 'Wrong department.',
          priority: 'low',
          assigneeId: david.id,
          departmentId: david.departmentId,
          consequential: { action: 'finance_change', summary: 'Change the ledger' },
        },
      },
      now,
    )
    expect(byMarketing.tasks.some((task) => task.title === 'Post the ledger')).toBe(false)
    expect(byMarketing.approvals).toHaveLength(state.approvals.length)
  })

  it('lets only the MD propose a goal, and lets you approve an edited line or reject it', () => {
    const state = createSampleState(now)
    const refused = applyCommand(state, { type: 'PROPOSE_GOAL', staffId: 'staff_priya', text: 'Sales sets the company goal.' }, now)
    expect(refused.goalProposals).toHaveLength(0)

    const proposed = applyCommand(state, { type: 'PROPOSE_GOAL', staffId: 'staff_morgan', text: 'Win two school contracts this month.' }, now)
    const proposal = proposed.goalProposals[0]
    expect(proposal?.status).toBe('pending')
    const capped = applyCommand(proposed, { type: 'PROPOSE_GOAL', staffId: 'staff_morgan', text: 'A second goal.' }, now)
    expect(capped.goalProposals.filter((item) => item.status === 'pending')).toHaveLength(1)

    const approved = applyCommand(
      proposed,
      { type: 'DECIDE_GOAL', proposalId: proposal!.id, decision: 'approved', text: 'Win two school contracts this quarter.' },
      now,
    )
    expect(approved.company?.goals.some((goal) => goal.text === 'Win two school contracts this quarter.')).toBe(true)
    expect(approved.goalProposals[0]?.status).toBe('approved')
    expect(approved.memory?.[0]?.text).toContain('Win two school contracts this quarter')

    const rejected = applyCommand(
      proposed,
      { type: 'DECIDE_GOAL', proposalId: proposal!.id, decision: 'rejected' },
      now,
    )
    expect(rejected.company?.goals).toHaveLength(state.company?.goals.length ?? 0)
    expect(rejected.goalProposals[0]?.status).toBe('rejected')
    expect(rejected.memory?.some((item) => item.text.includes('declined the goal'))).toBe(true)

    const owned = applyCommand(
      state,
      { type: 'ADD_GOAL', text: 'Keep quotes inside two days.' },
      now,
    )
    expect(owned.company?.goals.some((goal) => goal.text === 'Keep quotes inside two days.')).toBe(true)
    const task = applyCommand(
      state,
      {
        type: 'CREATE_TASK',
        input: {
          title: 'Owner task',
          description: 'Immediate.',
          priority: 'low',
          assigneeId: 'staff_jonah',
          departmentId: state.staff.find((person) => person.id === 'staff_jonah')!.departmentId,
          consequential: { action: 'send_external', summary: 'Email the school' },
        },
      },
      now,
    )
    const created = task.tasks.find((item) => item.title === 'Owner task')
    expect(created?.status).toBe('ready')
    expect(created?.source).toBe('owner')
    expect(task.approvals).toHaveLength(state.approvals.length)
    expect(task.records).toHaveLength(state.records.length)
  })
})
