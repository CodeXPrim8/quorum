import { dayPart, ownerHonorific } from '../domain/meeting'
import type { OwnerGender, Staff } from '../types'

export type AgentTurn = {
  text: string
  designBrief?: string
  learned?: string
}

function clean(value: string): string {
  return value.replace(/@\S+(\s\S+)?/g, ' ').replace(/\s+/g, ' ').trim()
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function isDesigner(person: Staff, roles?: { id: string; key: string }[]): boolean {
  if (person.id === 'staff_maya' || person.roleId === 'role_graphic_designer') return true
  return roles?.some((role) => role.id === person.roleId && role.key === 'graphic_designer') ?? false
}

/** A reply from the person's role when no model is linked, or when the model cannot be reached. */
export function localTurn(input: {
  person: Staff
  companyName: string
  ownerName: string
  ownerGender?: OwnerGender
  text: string
  intent: 'reply' | 'design' | 'update'
  taskTitle?: string
  socialNote?: string
  siteNote?: string
}): AgentTurn {
  const { person, companyName, ownerName } = input
  const asked = clean(input.text)
  const outside = /\b(hack|exploit|malware|phish|ransomware)\b/i.test(asked)
  if (outside) {
    return {
      text: `I only work on ${companyName}’s own systems inside Quorum. I can’t help with breaking into anything.`,
    }
  }
  if (input.siteNote && /\b(website|web ?site|homepage|browse|gone through|go through|https?:\/\/|www\.)\b/i.test(asked)) {
    if (input.siteNote.startsWith('The company website is not saved')) {
      return { text: 'The company website is not on the profile yet. Add the public link and I can read it.' }
    }
    if (input.siteNote.startsWith('Could not read')) {
      return { text: 'I opened the link. The page did not come back as text, so I could not go through it.' }
    }
    const line =
      input.siteNote
        .split('\n')
        .find((item) => item.startsWith('Page:') || item.startsWith('Description:') || item.startsWith('Title:')) ??
      input.siteNote
    return { text: `Yes. I opened it. ${clip(line.replace(/^(Page|Description|Title): /, ''), 320)}` }
  }
  if (/\b(send|email|publish|post|pay|transfer|wire)\b/i.test(asked) && /\b(client|customer|instagram|twitter|linkedin|facebook|tiktok|bank|supplier|live)\b/i.test(asked)) {
    return {
      text: `I can draft that here. Nothing outside ${companyName} is connected, so I won’t send it, post it, or pay it.`,
    }
  }
  if (input.intent === 'update' && input.taskTitle) {
    return { text: `I’m working on “${input.taskTitle}”. I’ll bring the result back to this chat. It stays inside Quorum.` }
  }
  if (input.intent === 'design' || (isDesigner(person) && /design|graphic|poster|logo|visual|artwork|banner|draw|flyer/i.test(asked))) {
    const brief = clip(asked || input.taskTitle || companyName, 80)
    const internal = /\b(meeting|standup|stand-?up|all[- ]hands|agenda|internal|in[- ]house|office|hr|memo|notice|goals?)\b/i.test(brief)
    return {
      designBrief: brief,
      text: internal
        ? `I’ll make an in-house flyer for “${brief}” and send it to you in this chat. After you approve it, it goes to the company group only — not to Instagram or any social account.`
        : `I’ll design the promotional graphic for “${brief}” and put it in the company chat for review. Nothing is posted to social until you approve it, and only if that account is connected.`,
    }
  }
  if (person.roleId === 'role_social_manager' && /post|publish|caption|social|instagram/i.test(asked)) {
    const subject = clip(asked.replace(/^hi [\w]+[,.]?\s*/i, '').replace(/draft a caption for/i, ''), 72) || 'the launch'
    return {
      text: input.socialNote
        ? `Caption: “${subject}. Made for the people who need it.” After you approve the graphic, I’ll publish Instagram posts when the Graph API line is connected.`
        : `Caption: “${subject}. Made for the people who need it.” After you approve the graphic, I’ll publish it on Instagram when INSTAGRAM_TOKEN is set on this server.`,
    }
  }
  if (/can you hear|hear me|you there|are you there/i.test(asked)) {
    if (/\b(do|check|update|design|draft|write|make|review|prepare|send)\b/i.test(asked)) {
      return { text: `Yeah, I can hear you. I’m on it.` }
    }
    return { text: `Yeah, I can hear you. What do you need?` }
  }
  if (/\b(update|status|where are we|how is it going|how's it going)\b/i.test(asked) && input.taskTitle) {
    return { text: `On “${input.taskTitle}”, I’m in the middle of it. I’ll bring it back to you here.` }
  }
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/i.test(asked) || /^(hi|hello|hey)\b/i.test(asked)) {
    return { text: greet(person, ownerName, input.ownerGender) }
  }
  if (isChat(asked)) return { text: smallTalk(person, ownerName, asked, companyName) }
  const duty = person.responsibilities[0] ?? person.purpose
  if (!asked) return { text: `I’m ${person.name}, ${person.title}. ${duty}` }
  if (/\b(do this|i want you to|i need you to|please|can you|go ahead)\b/i.test(asked)) {
    return { text: `Okay, I’m on it. ${duty}` }
  }
  return { text: `Yeah, I can take that. ${duty} I’ll keep it inside ${companyName} and tell you how it goes.` }
}

function seed(person: Staff, text: string): number {
  let n = text.length
  for (const ch of person.id) n += ch.charCodeAt(0)
  return n
}

function greet(person: Staff, ownerName: string, gender?: OwnerGender): string {
  const first = ownerName.split(' ')[0] || ownerName
  const honorific = ownerHonorific(gender)
  const hello = honorific ? `${dayPart(new Date())}, ${honorific}` : `Hey ${first}`
  const lines = [
    `${hello}. Good to hear you. What’s going on?`,
    `${hello}. I’m ${person.name.split(' ')[0]}. We can just talk, or I can get into the work.`,
    `${hello}. I’m around. How are you doing?`,
  ]
  return lines[seed(person, first) % lines.length]
}

function isChat(text: string): boolean {
  return /how are you|how's it|hows it|what's up|whats up|\bthanks?\b|\bthank you\b|lol|haha|\bjoke\b|weekend|\btired\b|\bcoffee\b|\blunch\b|weather|\bbye\b|see you|\bbored\b|\bfun\b|just talk|how was|good night|what do you think|tell me about you|who are you/i.test(
    text,
  )
}

function smallTalk(person: Staff, ownerName: string, asked: string, companyName: string): string {
  const first = ownerName.split(' ')[0] || ownerName
  const me = person.name.split(' ')[0]
  const n = seed(person, asked)
  if (/how are you|how's|hows it|what's up|whats up/i.test(asked)) {
    const lines = [
      `I’m good, ${first}. Quiet desk, and I’m glad you checked in. How are you?`,
      `Pretty good. I was thinking about ${companyName}, then you showed up. What’s new with you?`,
      `I’m alright. A bit of a long day, but I like this better than another status note.`,
    ]
    return lines[n % lines.length]
  }
  if (/thank/i.test(asked)) return `Anytime, ${first}. That’s what I’m here for.`
  if (/joke|fun|bored/i.test(asked)) {
    return `Alright. Why did the laptop stay late? It had too many windows open. Your turn, ${first}.`
  }
  if (/bye|see you|good night/i.test(asked)) return `Talk soon, ${first}. I’ll be right here.`
  if (/coffee|lunch|hungry|tired|weekend|weather/i.test(asked)) {
    return `Ha. I could use a break too. We can keep chatting, or I can pick up something for ${companyName}.`
  }
  if (/who are you|tell me about you/i.test(asked)) {
    return `I’m ${person.name}, ${person.title}. ${person.purpose} I can talk about that, or about anything else.`
  }
  const lines = [
    `Ha, I like that. I’m listening, ${first}.`,
    `That’s a nice change of pace. Say more.`,
    `I’m with you, ${me} here. We can just talk.`,
    `Tell me more. Work can wait a minute.`,
  ]
  return lines[n % lines.length]
}
