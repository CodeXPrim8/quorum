export type Typing = { threadId: string; name: string } | null

let typing: Typing = null
let notice = ''
const typingListeners = new Set<(value: Typing) => void>()
const noticeListeners = new Set<(value: string) => void>()

export function setTyping(value: Typing) {
  typing = value
  typingListeners.forEach((listener) => listener(value))
}

export function subscribeTyping(listener: (value: Typing) => void): () => void {
  typingListeners.add(listener)
  listener(typing)
  return () => typingListeners.delete(listener)
}

export function setAgentNotice(value: string) {
  notice = value
  noticeListeners.forEach((listener) => listener(value))
}

export function subscribeNotice(listener: (value: string) => void): () => void {
  noticeListeners.add(listener)
  listener(notice)
  return () => noticeListeners.delete(listener)
}
