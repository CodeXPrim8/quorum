export type MinuteLine = {
  authorId: string
  authorName: string
  text: string
}

export function minutesDocument(input: {
  company: string
  thread: string
  chair: string
  clerk: string
  owner: string
  attendees: string[]
  at: Date
  lines: MinuteLine[]
}): string {
  const when = input.at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  const discussion =
    input.lines.length > 0
      ? input.lines.map((line) => `${line.authorName}: ${line.text}`).join('\n\n')
      : 'No spoken points were recorded.'
  return [
    `Meeting minutes`,
    input.company,
    input.thread,
    `Held ${when}`,
    `Chair: ${input.chair}`,
    `Minutes: ${input.clerk}`,
    `Owner: ${input.owner}`,
    `Present: ${input.attendees.join(', ')}`,
    '',
    'Discussion',
    discussion,
    '',
    'This record stays in Quorum. Nothing was emailed or posted.',
  ].join('\n')
}
