import { askModel, readModelLink } from './model'
import { lookupPublic } from './quorum'
import { emptySlip, formatSlip, parseSlip, type SportsSlip } from '../domain/sports'

const COACH = [
  'You are Sable Hart, sports analyst. You are the coach’s coach for every sport the owner names.',
  'Think in that sport’s own language: game plan, personnel, matchups, conditions, and how these sides behave in this exact spot.',
  'Football markets stay on football. Basketball uses points and spreads. Tennis uses sets and aces. Boxing uses method and rounds. Do not drag one sport’s markets onto another.',
  'Publish a play only when the pattern is strong enough to call it near-sure. Withhold weak or mixed reads.',
  'Never write the words guaranteed win.',
  'Reply with JSON only: {"sport":"","event":"","start":"","competition":"","plays":[{"play":"Play ...","pattern":"..."}],"stake":"One slip with only these plays.","pass":false}',
  'If nothing clears the bar, reply {"pass":true,"event":"the event name"}.',
].join('\n')

export async function researchSlip(prompt: string): Promise<{ text: string; slip?: SportsSlip; screen?: Awaited<ReturnType<typeof lookupPublic>>['screen'] }> {
  const looked = await lookupPublic(`${prompt} latest form injuries news`)
  const link = readModelLink()
  if (!link) {
    return {
      text: emptySlip(prompt),
      screen: looked.screen,
    }
  }
  try {
    const raw = await askModel(link, [
      { role: 'system', content: COACH },
      {
        role: 'user',
        content: ['Event:\n' + prompt.slice(0, 500), looked.brief ? `Public reading:\n${looked.brief.slice(0, 3500)}` : 'No public page was attached. Use only a pattern you can defend, or pass.']
          .join('\n\n'),
      },
    ])
    const slip = parseSlip(raw, prompt.slice(0, 120))
    if (!slip) {
      const named = raw.match(/"event"\s*:\s*"([^"]+)"/)?.[1] ?? prompt.slice(0, 120)
      return { text: emptySlip(named), screen: looked.screen }
    }
    return { text: formatSlip(slip), slip, screen: looked.screen }
  } catch {
    return { text: emptySlip(prompt.slice(0, 120)), screen: looked.screen }
  }
}
