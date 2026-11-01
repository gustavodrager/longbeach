import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiFetch } from '../../lib/http'
import { hasPermission } from '../auth/access'
import { useAuth } from '../auth/authContext'
import type { AuthUser } from '../auth/types'

export type Conversation = {
  id: string; externalId: string; phone: string | null; name: string; customerId: string | null
  identityVerified: boolean; consentForReminders: boolean; status: 'NeedsTeam' | 'InProgress' | 'Completed'
  mode: 'Bot' | 'Team'; assignedUserId: string | null; assignedUserName: string | null
  unreadCount: number; lastMessage: string | null; lastMessageAtUtc: string | null; version: number
}
export type Attachment = { id: string; fileName: string; contentType: string; length: number; url: string }
export type MessageState = 'Received' | 'Scheduled' | 'Queued' | 'Sending' | 'Sent' | 'Delivered' | 'Read' | 'Failed' | 'Uncertain' | 'Cancelled'
export type Message = {
  id: string; conversationId: string; direction: 'Inbound' | 'Outbound'; origin: 'Customer' | 'Bot' | 'Staff' | 'Phone'
  text: string; occurredAtUtc: string; state: MessageState; authorName: string | null; attachment: Attachment | null
  operationId: string | null; purpose: string; scheduledAtUtc: string | null; failureReason: string | null
  contextKind: string | null; contextId: string | null; contextDate: string | null
  conversationName?: string | null; recipientPhone?: string | null
}
export type Page<T> = { items: T[]; page: number; pageSize: number; total: number }
export type MessagePage = { items: Message[]; before: string | null; hasMore: boolean }
export type SendInput = { operationId: string; text: string; attachmentId?: string | null; purpose?: string; contextKind?: string | null; contextId?: string | null; contextDate?: string | null; scheduledAtUtc?: string | null }
export type Settings = { botEnabled: boolean; classRemindersEnabled: boolean; rentalRemindersEnabled: boolean; reminderTime: string; version: number }
export type Faq = { id: string; question: string; answer: string; approved: boolean; version: number }
export type Connection = { state: string; accountId: string | null; detail: string | null; qrCode: string | null; updatedAtUtc: string | null }
export type Activity = { kind: 'Class' | 'Rental'; id: string; subjectId: string; subjectName: string; label: string; date: string; startTime: string; endTime: string; court: string; confirmation: 'Pending' | 'Going' | 'NotGoing'; version: number }
export type ConversationContext = { customerId: string | null; customerName: string | null; profiles: string[]; identityVerified: boolean; consentForReminders: boolean; activities: Activity[]; barAccounts: { id: string; label: string; balance: number; pending?: number; availableToPay?: number; detailsUrl: string }[]; canViewBar: boolean }
export type Capabilities = { aiConfigured: boolean; dispatchEnabled: boolean }

export const MessagingRuntime = createContext({ visible: true, online: true })
export const MessagingDelivery = createContext({ waiting: false })
export function useMessagingEnvironment() {
  const [environment, setEnvironment] = useState(() => ({ visible: !document.hidden, online: navigator.onLine }))
  useEffect(() => {
    const update = () => setEnvironment({ visible: !document.hidden, online: navigator.onLine })
    document.addEventListener('visibilitychange', update)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { document.removeEventListener('visibilitychange', update); window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  return environment
}
export const messagingSession = (user: AuthUser | null) => user ? `${user.id}:${[...user.roles].sort().join(',')}:${[...user.permissions].sort().join(',')}` : 'signed-out'
export const messagingPath = (path: string) => `/api/v1/messaging${path}`
export const messagingError = (cause: unknown) => cause instanceof Error ? cause.message : 'Não foi possível confirmar. Tente novamente após conferir a conexão.'
export async function messagingCommand<T>(path: string, body?: unknown, method = 'POST') {
  if (!navigator.onLine) throw new ApiError(0, 'Sem conexão. Seu rascunho foi preservado.')
  return apiFetch<T>(messagingPath(path), { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
}
export function useMessagingQuery<T>(path: string, interval = 0, enabled = true, permission = 'messaging:read') {
  const { user } = useAuth(); const environment = useContext(MessagingRuntime)
  const allowed = hasPermission(user, permission) && enabled
  const query = useQuery({
    queryKey: ['messaging', messagingSession(user), path],
    queryFn: ({ signal }) => apiFetch<T>(messagingPath(path), { signal }),
    enabled: allowed && environment.visible && environment.online,
    staleTime: 0, retry: false, refetchInterval: environment.visible && environment.online && interval ? interval : false,
    refetchIntervalInBackground: false, refetchOnWindowFocus: true,
  })
  const denied = query.error instanceof ApiError && [401, 403, 404, 410].includes(query.error.status)
  return { ...query, data: allowed && !denied ? query.data : undefined }
}
export function useMessagingRefresh() {
  const cache = useQueryClient(); const { user } = useAuth(); const session = messagingSession(user)
  return () => cache.invalidateQueries({ queryKey: ['messaging', session] })
}
export function useMessagingAction() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [feedback, setFeedback] = useState('')
  const locked = useRef(false); const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  async function run<T>(perform: () => Promise<T>, success = ''): Promise<T | undefined> {
    if (locked.current) return undefined
    locked.current = true; setBusy(true); setError(''); setFeedback('')
    try { const result = await perform(); if (!mounted.current) return undefined; setFeedback(success); return result }
    catch (cause) { if (mounted.current) setError(messagingError(cause)); return undefined }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  return { busy, error, feedback, run, setError }
}

export const stateLabel: Record<MessageState, string> = { Received: 'Recebida', Scheduled: 'Agendada', Queued: 'Na fila', Sending: 'Enviando', Sent: 'Enviada', Delivered: 'Entregue', Read: 'Lida', Failed: 'Falhou', Uncertain: 'Resultado incerto', Cancelled: 'Cancelada' }
export const originLabel = { Customer: 'Cliente', Bot: 'Bot', Staff: 'Equipe', Phone: 'WhatsApp da arena' }
export const conversationLabel = { NeedsTeam: 'Precisa da equipe', InProgress: 'Em atendimento', Completed: 'Concluída' }
export function dateTime(value: string | null | undefined) { return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : 'Ainda sem mensagens' }
export function activityDate(value: string) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(`${value}T12:00:00-03:00`)) }
export const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
