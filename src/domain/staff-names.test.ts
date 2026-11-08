import { describe, expect, it } from 'vitest'
import { nameLooksLikeTitle, personGivenName, repairStaffNames } from './staff-names'
import { blankState } from './sample'

describe('staff names', () => {
  it('treats a job title stored as the person name as a title', () => {
    expect(nameLooksLikeTitle({ name: 'Graphic Designer', title: 'Graphic Designer' })).toBe(true)
    expect(nameLooksLikeTitle({ name: 'Maya Mensah', title: 'Graphic Designer' })).toBe(false)
  })

  it('gives Maya when the saved name is the job', () => {
    expect(personGivenName({ id: 'staff_maya', name: 'Graphic Designer', title: 'Graphic Designer' })).toBe('Maya')
  })

  it('rewrites saved staff whose name is the role', () => {
    const state = {
      ...blankState(true),
      roles: [{ id: 'role_graphic_designer', key: 'graphic_designer', title: 'Graphic Designer', purpose: '', responsibilities: [], departmentId: 'dept_marketing', reportsToRoleId: null, enabled: true, defaultPermissions: [] }],
      staff: [
        {
          id: 'staff_maya',
          name: 'Graphic Designer',
          title: 'Graphic Designer',
          roleId: 'role_graphic_designer',
          departmentId: 'dept_marketing',
          managerId: null,
          purpose: '',
          responsibilities: [],
          grants: {},
          appearance: { skin: '#000', hair: '#000', hairStyle: 'crop' as const, shirt: '#000', legs: '#000' },
          deskX: 0,
          deskY: 0,
          roomId: 'marketing',
          presence: {
            x: 0,
            y: 0,
            originX: 0,
            originY: 0,
            pose: 'sit' as const,
            mode: 'desk' as const,
            label: '',
            path: [],
            pathFrom: 0,
            movingUntil: 0,
            dwellUntil: 0,
            meetingTaskId: null,
            lifeIntent: 'none' as const,
          },
          life: {
            salary: 0,
            balance: 0,
            marital: 'single' as const,
            spouse: null,
            car: false,
            house: false,
            nextBreak: 0,
            commute: 0,
            ride: 'bus' as const,
            spentDay: 0,
            nextErrand: 0,
          },
          enabled: true,
        },
      ],
    }
    expect(repairStaffNames(state).staff[0].name).toBe('Maya Mensah')
  })
})
