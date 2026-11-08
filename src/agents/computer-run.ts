import { askModel, readModelLink } from './model'
import { readDesktopToken } from './desktop'
import { setScreen } from './screen'
import { parseComputerPlan, stepsForPrompt, UNTRUSTED_SCREEN, type ComputerAction } from '../computer/policy'
import { draftFromInstruction, matchOpenWindow, type MailDraft } from '../computer/windows'
import {
  actOnComputer,
  armComputerSession,
  chooseComputerWindow,
  computerScope,
  computerStopped,
  listComputerWindows,
  noteComputer,
  clickForInstruction,
  observeComputer,
  waitForComputerApproval,
  writeComputerDraft,
  type ComputerView,
} from './computer'
type DesktopRunResult = { text: string; result: string }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function show(view: ComputerView, note?: string): void {
  setScreen({
    kind: 'desktop',
    image: view.image,
    width: view.width,
    height: view.height,
    note: note || view.title,
  })
}

async function nextPlan(task: string, view: ComputerView, history: string[], companyName: string): Promise<ComputerAction[] | 'done'> {
  const link = readModelLink()
  if (!link) return []
  const controls = view.controls.map((item) => `${item.id} ${item.role} ${item.name}`).join('\n') || 'No named controls. Use key and type.'
  try {
    const raw = await askModel(link, [
      {
        role: 'system',
        content: [
          `You are operating one window for ${companyName}. Follow the owner's instruction exactly.`,
          'Do not replace it with a different task, a stock reply, or a thank-you letter.',
          'Reply with a JSON array of the next actions, at most 6.',
          'Each item is one object. Kinds: click {controlId} | type {text, controlId?} | key {key} | scroll {dy} | wait {ms} | done {note}',
          'controlId must be one of the ids listed. You may also set "control" to that control’s exact name.',
          'If no listed control does the next part, use key and type. Do not invent a control.',
          'Type only the words the instruction calls for, including any email address the owner gave.',
          'Keys: enter, tab, escape, arrows, backspace, delete, f5, and a single letter such as c when that is the app shortcut.',
          UNTRUSTED_SCREEN,
          'Never click Send, pay, delete, or accept terms. Do not type passwords or card numbers.',
          'The last item may be done only when that instruction is finished inside this window.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Instruction: ${task}`,
          `Window: ${view.title} (${view.processName})`,
          history.length ? `Already done:\n${history.join('\n')}` : 'No steps yet.',
          `Controls:\n${controls}`,
        ].join('\n'),
      },
    ])
    return parseComputerPlan(raw, view.controls)
  } catch {
    return []
  }
}

async function chooseLabel(instruction: string, saw: string[]): Promise<string | null> {
  const link = readModelLink()
  if (!link || saw.length === 0) return null
  try {
    const raw = await Promise.race([
      askModel(link, [
        {
          role: 'system',
          content:
            'You see one computer window. Pick the single visible label to click so the instruction can continue. Reply with JSON {"click":"exact label from the list"} or {"click":""} when the message form is already open or nothing should be clicked. Never choose Send, Pay, Delete, or a search box.',
        },
        { role: 'user', content: `Instruction: ${instruction}\nVisible labels:\n${saw.join('\n')}` },
      ]),
      sleep(5000).then(() => ''),
    ])
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    const click = String((JSON.parse(match[0]) as { click?: unknown }).click ?? '').trim()
    if (!click) return null
    return saw.find((label) => label.toLowerCase() === click.toLowerCase()) ?? null
  } catch {
    return null
  }
}

async function polishDraft(instruction: string, draft: MailDraft): Promise<MailDraft> {
  const link = readModelLink()
  if (!link) return draft
  try {
    const raw = await Promise.race([
      askModel(link, [
        {
          role: 'system',
          content:
            'Write a short professional email from the instruction. Reply with JSON {"subject":"...","body":"..."}. Keep the body under 80 words. Do not copy the instruction. Do not say the message was sent.',
        },
        { role: 'user', content: `Instruction: ${instruction}\nRecipient: ${draft.to}` },
      ]),
      sleep(5000).then(() => ''),
    ])
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return draft
    const parsed = JSON.parse(match[0]) as { subject?: unknown; body?: unknown }
    const subject = String(parsed.subject ?? '').trim().slice(0, 120)
    const body = String(parsed.body ?? '').trim().slice(0, 1200)
    if (subject.length < 3 || body.length < 12) return draft
    if (/i have opened|this customer/i.test(body)) return draft
    return { to: draft.to, subject, body }
  } catch {
    return draft
  }
}

async function perform(action: ComputerAction, history: string[]): Promise<'stop' | 'next'> {
  const result = await actOnComputer(action, false)
  if ('handoff' in result && result.handoff) {
    noteComputer(result.reason)
    history.push(result.reason)
    return 'next'
  }
  if ('needsApproval' in result && result.needsApproval) {
    noteComputer(result.reason)
    const allowed = await waitForComputerApproval(result.reason)
    if (!allowed || computerStopped()) {
      noteComputer('You rejected that step.')
      history.push('Owner rejected the step.')
      return computerStopped() ? 'stop' : 'next'
    }
    const second = await actOnComputer(action, true)
    if ('note' in second && second.ok) {
      noteComputer(second.note)
      history.push(second.note)
    }
    return 'next'
  }
  if ('note' in result && result.ok) {
    noteComputer(result.note)
    history.push(result.note)
  }
  return 'next'
}

/** Drive only the window the owner selected. Look again after every action. */
export async function runWindowSession(instruction: string, prior: string[] = [], companyName = 'the company'): Promise<DesktopRunResult> {
  armComputerSession()
  const history = [...prior]
  if (!readDesktopToken()) {
    return { text: 'Computer access is stopped.', result: 'Computer run skipped.' }
  }
  noteComputer('Looking for the window already open on this computer.')
  try {
    const windows = await listComputerWindows()
    const match = matchOpenWindow(instruction, windows)
    if (match) {
      await chooseComputerWindow(match.hwnd)
      noteComputer(`Using the open window “${match.title}”.`)
    } else {
      noteComputer('I could not see that app yet. Leave it open in front, or pick its window.')
    }
  } catch (error) {
    noteComputer(error instanceof Error ? error.message : 'The open windows could not be listed.')
  }
  let waits = 0
  while (!computerScope()) {
    if (computerStopped() || !readDesktopToken()) {
      return { text: 'Computer access is stopped.', result: 'Computer run stopped before a window was chosen.' }
    }
    await sleep(700)
    waits += 1
    if (waits > 90) {
      const wanted = /zoho/i.test(instruction) ? 'Zoho Mail' : 'the app you named'
      return {
        text: `I could not see ${wanted}. Leave that window open and in front, then tell me to continue. I will not send anything.`,
        result: 'Computer run ended without a matching window.',
      }
    }
  }
  const scope = computerScope()
  const sessionToken = readDesktopToken()
  if (sessionToken) {
    void fetch('/api/desktop/using', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken, action: 'start' }),
    }).catch(() => undefined)
  }
  const planned = stepsForPrompt(instruction, scope?.processName ?? '')
  if (planned.length) noteComputer(`Plan: work inside ${scope?.title ?? 'the selected window'}.`)
  let view: ComputerView | null = null
  for (let look = 0; look < 3 && !view; look += 1) {
    if (computerStopped() || !readDesktopToken()) break
    try {
      view = await observeComputer()
      show(view, view.title)
      noteComputer(`Showing ${view.title}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The window could not be read.'
      noteComputer(message)
      history.push(message)
      await sleep(700)
    }
  }
  let preferred = ''
  if (readModelLink() && view) {
    try {
      const seen = await clickForInstruction(instruction, { dryRun: true })
      preferred = (await chooseLabel(instruction, seen.saw)) ?? ''
      if (preferred) noteComputer(`The model chose ${preferred}.`)
    } catch {
      preferred = ''
    }
  }
  let lastClick = ''
  for (let click = 0; click < 3 && view; click += 1) {
    if (computerStopped() || !readDesktopToken()) break
    try {
      const look = await clickForInstruction(instruction, click === 0 && preferred ? { label: preferred } : undefined)
      const seen = look.saw.slice(0, 8).join(', ')
      if (!look.clicked || look.clicked === lastClick) {
        if (!lastClick) noteComputer(seen ? `Saw ${seen}.` : 'Nothing readable on the screen yet.')
        break
      }
      lastClick = look.clicked
      noteComputer(seen ? `Saw ${seen}. Clicking ${look.clicked}.` : `Clicking ${look.clicked}.`)
      await sleep(900)
      view = await observeComputer()
      show(view, view.title)
    } catch (error) {
      noteComputer(error instanceof Error ? error.message : 'That click failed.')
      break
    }
  }
  const draft = draftFromInstruction(instruction)
  if (draft && view) {
    noteComputer('Filling To, then Subject, then the message.')
    try {
      const letter = await polishDraft(instruction, draft)
      await writeComputerDraft(letter)
      view = await observeComputer()
      show(view, 'Draft is in the open message')
      noteComputer('Filled To, then Subject, then the message. Cc was left empty. Nothing was sent.')
      return {
        text: [
          `Instruction: ${instruction}`,
          `Window: ${view.title}`,
          `Typed:\nTo: ${letter.to || '(left as it was)'}\nSubject: ${letter.subject}\n\n${letter.body}`,
          'Nothing was sent.',
        ].join('\n\n'),
        result: `Wrote the draft in ${view.title}.`,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The draft could not be typed.'
      noteComputer(message)
      history.push(message)
    }
  }
  if (!readModelLink()) {
    const title = computerScope()?.title ?? 'The window'
    if (draftFromInstruction(instruction)) {
      return {
        text: `I was looking at “${title}”. That page is not the message, so the address stays in To on Gmail or Zoho and is not typed into search. Leave the mail tab in front and tell me again. I will not send anything.`,
        result: 'Mail window was not the one in front.',
      }
    }
    return {
      text: `${title} is open. Link a chat model under Chat so I can follow your instruction there. I did not type or send anything.\n\n${instruction}`,
      result: 'No model linked for this instruction.',
    }
  }
  noteComputer('Carrying out the next step.')
  const queue = [...planned]
  const typed: string[] = []
  let misses = 0
  for (let step = 0; step < 12; step += 1) {
    if (computerStopped() || !readDesktopToken()) break
    if (!view) {
      try {
        view = await observeComputer()
        show(view, view.title)
      } catch (error) {
        noteComputer(error instanceof Error ? error.message : 'The window could not be read.')
        await sleep(800)
        continue
      }
    }
    if (!queue.length) {
      const plan = await nextPlan(instruction, view, history, companyName)
      if (plan === 'done') {
        history.push('Done.')
        break
      }
      if (!plan.length) {
        misses += 1
        noteComputer('That step did not match anything in this window.')
        if (misses >= 2) break
        continue
      }
      misses = 0
      queue.push(...plan)
    }
    const action = queue.shift()
    if (!action) break
    misses = 0
    if (action.kind === 'type') typed.push(action.text)
    try {
      const outcome = await perform(action, history)
      if (outcome === 'stop') break
    } catch (error) {
      const message = error instanceof Error ? error.message : 'That step failed.'
      noteComputer(message)
      history.push(message)
    }
    try {
      view = await observeComputer()
      show(view, history.at(-1))
    } catch (error) {
      noteComputer(error instanceof Error ? error.message : 'The window could not be read after that step.')
      view = null
    }
  }
  const title = computerScope()?.title ?? 'the window'
  const text = [
    `Instruction: ${instruction}`,
    `Window: ${title}`,
    typed.length ? `Typed:\n${typed.join('\n\n')}` : 'Nothing was typed.',
    misses >= 2 ? 'I stopped because the next step did not match a control in that window.' : '',
    'Nothing was sent.',
  ]
    .filter(Boolean)
    .join('\n\n')
  return { text: text.slice(0, 4000), result: `Followed the instruction in ${title}.` }
}
