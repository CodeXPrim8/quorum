import { describe, expect, it } from 'vitest'
import {
  assertDesktopToken,
  DesktopAuthError,
  endDesktopSession,
  parseDesktopInput,
  resolveDesktopApp,
  startDesktopSession,
} from './desktop-agent'

describe('desktop agent session', () => {
  it('issues a token and rejects the wrong one', () => {
    endDesktopSession()
    const { token } = startDesktopSession()
    expect(token.length).toBeGreaterThan(20)
    expect(() => assertDesktopToken('nope')).toThrow(DesktopAuthError)
    expect(() => assertDesktopToken(token)).not.toThrow()
    endDesktopSession()
    expect(() => assertDesktopToken(token)).toThrow(DesktopAuthError)
  })

  it('parses input kinds', () => {
    expect(parseDesktopInput({ kind: 'click', x: 10, y: 20 })).toEqual({
      kind: 'click',
      x: 10,
      y: 20,
      button: 'left',
      clicks: 1,
    })
    expect(parseDesktopInput({ kind: 'type', text: 'hi' })).toEqual({ kind: 'type', text: 'hi' })
    expect(parseDesktopInput({ kind: 'key', key: 'enter' })).toEqual({ kind: 'key', key: 'enter' })
    expect(parseDesktopInput({ kind: 'double', x: 8, y: 9 })).toEqual({
      kind: 'click',
      x: 8,
      y: 9,
      button: 'left',
      clicks: 2,
    })
    expect(parseDesktopInput({ kind: 'scroll', dy: -120 })).toEqual({ kind: 'scroll', dy: -120 })
    expect(parseDesktopInput({ kind: 'launch', app: 'notepad' })).toEqual({ kind: 'launch', app: 'notepad' })
    expect(parseDesktopInput({ kind: 'open', url: 'https://example.com' })).toEqual({
      kind: 'open',
      url: 'https://example.com',
    })
    expect(parseDesktopInput({ kind: 'key', key: 'win+r' })).toEqual({ kind: 'key', key: 'win+r' })
  })

  it('maps ordinary apps and refuses shell tools', () => {
    expect(resolveDesktopApp('notepad')).toBe('notepad.exe')
    expect(resolveDesktopApp('note pad')).toBe('notepad.exe')
    expect(resolveDesktopApp('calc')).toBe('calc.exe')
    expect(resolveDesktopApp('regedit')).toBeNull()
    expect(resolveDesktopApp('..\\secret')).toBeNull()
  })
})
