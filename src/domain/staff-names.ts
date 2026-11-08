import type { AppState, Staff } from '../types'

const ROLE_NAME: Record<string, string> = {
  md: 'Morgan Hale',
  sales_manager: 'Priya Shah',
  account_executive: 'Jonah Ellis',
  quote_specialist: 'Lena Cho',
  marketing_manager: 'Samir Adeyemi',
  campaign_producer: 'Nina Petrov',
  graphic_designer: 'Maya Mensah',
  social_manager: 'Casey Nguyen',
  pr_manager: 'Helen Okonkwo',
  procurement_manager: 'Marco Bianchi',
  buyer: 'Aisha Rahman',
  finance_manager: 'David Chen',
  hr_manager: 'Ruth Adler',
  technology_lead: 'Elise Moreau',
  release_engineer: 'Tom Becker',
  systems_engineer: 'Sofia Alvarez',
  cyber: 'Imani Okoye',
  researcher: 'Jules Berger',
}

const BY_ID: Record<string, string> = {
  staff_morgan: 'Morgan Hale',
  staff_priya: 'Priya Shah',
  staff_jonah: 'Jonah Ellis',
  staff_lena: 'Lena Cho',
  staff_samir: 'Samir Adeyemi',
  staff_nina: 'Nina Petrov',
  staff_maya: 'Maya Mensah',
  staff_casey: 'Casey Nguyen',
  staff_helen: 'Helen Okonkwo',
  staff_marco: 'Marco Bianchi',
  staff_aisha: 'Aisha Rahman',
  staff_david: 'David Chen',
  staff_ruth: 'Ruth Adler',
  staff_elise: 'Elise Moreau',
  staff_tom: 'Tom Becker',
  staff_sofia: 'Sofia Alvarez',
  staff_imani: 'Imani Okoye',
  staff_jules: 'Jules Berger',
}

const SPARE = [
  'Amara Cole',
  'Omar Blake',
  'Hana Brooks',
  'Luis Hart',
  'Leila Grant',
  'Nathan Cole',
  'Mei Walker',
  'Peter Lang',
  'Olivia Nash',
  'Carlos West',
]

export function nameLooksLikeTitle(person: Pick<Staff, 'name' | 'title'>): boolean {
  const name = person.name.trim()
  const title = person.title.trim()
  if (!name) return true
  if (name.toLowerCase() === title.toLowerCase()) return true
  const first = name.split(/\s+/)[0]?.toLowerCase() ?? ''
  const titleFirst = title.split(/\s+/)[0]?.toLowerCase() ?? ''
  return Boolean(first) && first === titleFirst
}

export function personGivenName(person: Pick<Staff, 'id' | 'name' | 'title'>, roleKey?: string): string {
  const full = nameLooksLikeTitle(person) ? nameForStaff(person, roleKey) : person.name.trim()
  return full.split(/\s+/).filter(Boolean)[0] ?? 'Staff'
}

export function nameForStaff(person: Pick<Staff, 'id' | 'name'>, roleKey?: string): string {
  return BY_ID[person.id] ?? (roleKey ? ROLE_NAME[roleKey] : undefined) ?? person.name.trim() ?? 'Staff'
}

export function nameForRole(roleKey: string, taken: Set<string>): string {
  return uniqueName(ROLE_NAME[roleKey] ?? spareName(taken), taken)
}

export function repairStaffNames(state: AppState): AppState {
  const taken = new Set(state.staff.map((person) => person.name.trim().toLowerCase()))
  let changed = false
  const staff = state.staff.map((person) => {
    if (!nameLooksLikeTitle(person)) return person
    const role = state.roles.find((item) => item.id === person.roleId)
    taken.delete(person.name.trim().toLowerCase())
    const next = uniqueName(nameForStaff(person, role?.key), taken)
    taken.add(next.toLowerCase())
    changed = true
    return { ...person, name: next }
  })
  return changed ? { ...state, staff } : state
}

function spareName(taken: Set<string>): string {
  return SPARE.find((name) => !taken.has(name.toLowerCase())) ?? `Staff ${taken.size + 1}`
}

function uniqueName(name: string, taken: Set<string>): string {
  const clean = name.trim() || spareName(taken)
  if (!taken.has(clean.toLowerCase())) {
    taken.add(clean.toLowerCase())
    return clean
  }
  let index = 2
  while (taken.has(`${clean} ${index}`.toLowerCase())) index += 1
  const next = `${clean} ${index}`
  taken.add(next.toLowerCase())
  return next
}
