import type { Attachment, SendInput } from './api'

export type MessageDraft = { text: string; attachment?: Attachment | null; pending?: SendInput | null; scheduleEnabled?: boolean; scheduledAtLocal?: string }
const draftKey = (userId: string, conversationId: string) => `longbeach:whatsapp:draft:v1:${userId}:${conversationId}`
export function readDraft(userId: string, conversationId: string): MessageDraft {
  try {
    const data: unknown = JSON.parse(sessionStorage.getItem(draftKey(userId, conversationId)) ?? 'null')
    if (!data || typeof data !== 'object' || !('text' in data) || typeof data.text !== 'string') return { text: '' }
    const draft = data as MessageDraft
    if (draft.attachment && (typeof draft.attachment.id !== 'string' || typeof draft.attachment.contentType !== 'string')) return { text: draft.text }
    if (draft.pending && (typeof draft.pending.operationId !== 'string' || typeof draft.pending.text !== 'string')) return { text: draft.text, attachment: draft.attachment }
    return draft
  } catch { return { text: '' } }
}
/** Drafts and the operation checkpoint stay scoped to this browser tab and signed-in user. */
export function saveDraft(userId: string, conversationId: string, draft: MessageDraft) {
  const key = draftKey(userId, conversationId)
  if (!draft.text && !draft.attachment && !draft.pending && !draft.scheduleEnabled) sessionStorage.removeItem(key)
  else sessionStorage.setItem(key, JSON.stringify(draft))
}
