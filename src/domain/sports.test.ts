import { describe, expect, it } from 'vitest'
import { emptySlip, formatSlip, isSportsAsk, parseSlip } from './sports'
import { lookupBook } from './venues'

describe('sports analyst', () => {
  it('hears a fixture and a named sport', () => {
    expect(isSportsAsk('Man U vs Chelsea, what is the play?')).toBe(true)
    expect(isSportsAsk('Read the Lakers game in the NBA')).toBe(true)
    expect(isSportsAsk('Update the Riverside quote')).toBe(false)
  })

  it('drops a weak or guaranteed line and keeps a near-sure play', () => {
    const slip = parseSlip(
      JSON.stringify({
        sport: 'football',
        event: 'Manchester United vs Chelsea',
        competition: 'Premier League',
        plays: [
          { play: 'Maybe Chelsea win', pattern: 'Form is mixed.' },
          { play: 'Play two red cards', pattern: 'This referee’s matches produce two reds when these sides meet.' },
          { play: 'Guaranteed win for Chelsea', pattern: 'They are better.' },
        ],
        stake: 'One slip.',
      }),
    )
    expect(slip?.plays).toEqual([
      {
        play: 'Play two red cards',
        pattern: 'This referee’s matches produce two reds when these sides meet.',
      },
    ])
    expect(formatSlip(slip!)).toMatch(/not a guaranteed win/i)
    expect(formatSlip(slip!)).not.toMatch(/Play guaranteed/i)
  })

  it('says there is no stake when the read does not clear the bar', () => {
    expect(parseSlip('{"pass":true,"event":"Heat vs Celtics"}')).toBeNull()
    expect(emptySlip('Heat vs Celtics')).toMatch(/no stake/)
  })
})

describe('bookmaker lookup', () => {
  it('finds a featured book and accepts a pasted address', () => {
    expect(lookupBook('nairabet')?.id).toBe('nairabet')
    expect(lookupBook('https://www.examplebet.com/login')?.loginUrl).toBe('https://www.examplebet.com/login')
    expect(lookupBook('https://www.examplebet.com/login')?.listed).toBe(false)
  })
})
