import { describe, expect, it } from 'vitest'
import { parseDesktopAction, seedDesktopActions } from './desktop'

describe('desktop actions', () => {
  it('reads launch, hotkey, ask, and double-click from the model', () => {
    expect(parseDesktopAction('{"kind":"launch","app":"notepad","note":"Open Notepad"}')).toMatchObject({
      kind: 'launch',
      app: 'notepad',
    })
    expect(parseDesktopAction('{"kind":"key","key":"win+r"}')).toEqual({ kind: 'key', key: 'win+r', note: undefined })
    expect(parseDesktopAction('{"kind":"ask","note":"Need to delete a file"}')).toEqual({
      kind: 'ask',
      note: 'Need to delete a file',
    })
    expect(parseDesktopAction('{"kind":"double","x":12,"y":40}')).toMatchObject({ kind: 'click', x: 12, y: 40, clicks: 2 })
    expect(parseDesktopAction('not json')).toBeNull()
  })

  it('starts from the owner prompt without waiting for a screenshot', () => {
    const notepad = seedDesktopActions('Open notepad and type "Clemx"')
    expect(notepad).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'launch', app: 'notepad' }),
        expect.objectContaining({ kind: 'type', text: 'Clemx' }),
      ]),
    )
    expect(seedDesktopActions('open notepad', ['Opened notepad']).some((item) => item.kind === 'launch')).toBe(false)
    expect(seedDesktopActions('Open https://example.com/docs').some((item) => item.kind === 'open')).toBe(true)
    const zoho = seedDesktopActions('Open the Zoho website in Chrome so you can log in')
    expect(zoho).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'open', url: 'https://www.zoho.com' })]))
    expect(zoho.some((item) => item.kind === 'launch')).toBe(false)
  })
})
