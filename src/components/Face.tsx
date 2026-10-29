import type { Staff } from '../types'

export function initials(name: string): string {
  const parts = name.split(' ').filter(Boolean)
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

export function Face({
  person,
  className,
}: {
  person: Pick<Staff, 'name' | 'appearance' | 'photo'>
  className?: string
}) {
  if (person.photo) {
    return (
      <span className={className}>
        <img src={person.photo} alt="" />
      </span>
    )
  }
  return (
    <span className={className} style={{ background: person.appearance.shirt }}>
      {initials(person.name)}
    </span>
  )
}
