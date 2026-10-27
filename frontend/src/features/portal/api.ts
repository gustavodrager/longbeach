import { useQuery } from '@tanstack/react-query'
import { ApiError, apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
export type Appointment = { key: string; sourceId: string; kind: string; title: string; date: string; startTime: string; endTime: string; court: string; teacher: string; status: string; instructions: string; canChange: boolean; canRate: boolean; rating?: number; activityKind?: string }
export type PortalRequest = { id: string; userId: string; customerName: string; kind: string; appointmentKey?: string; date: string; startTime: string; endTime: string; courtId?: string; teacherId?: string; amount?: number; message: string; status: string; reply: string; version: number; updatedAtUtc: string; history?: {status:string;reply:string;date:string;startTime:string;endTime:string;atUtc:string}[] }
export type Profile = { name: string; email: string; phone: string; reminders: boolean; links: { kind: string; sourceId: string; name: string }[] }
export type Choice = { id: string; name: string }
export type Options = { courts: Choice[]; teachers: Choice[]; helpUrl?: string }
export function usePortal<T>(path: string) { const { user } = useAuth(); const query = useQuery({ queryKey: ['portal',user?.id,path], queryFn: () => apiFetch<T>(`/api/v1/me/portal/${path}`), refetchInterval: 30000, refetchOnWindowFocus: true }); return { ...query, data: query.error instanceof ApiError && [401,403].includes(query.error.status) ? undefined : query.data } }
export const send = <T,>(path: string, body: unknown, method = 'POST') => apiFetch<T>(path,{ method, body: JSON.stringify(body) })
export const label = (s: string) => ({ Sent: 'Solicitação enviada', Reviewing: 'Em análise', Alternative: 'Novo horário proposto', Confirmed: 'Confirmada', Declined: 'Não disponível', Withdrawn: 'Retirada pelo cliente', Trial: 'Aula experimental', Reservation: 'Horário de quadra', Reschedule: 'Remarcação', Cancellation: 'Cancelamento', Help: 'Ajuda' }[s] ?? s)
export const dayLabel = (s: string) => s ? new Intl.DateTimeFormat('pt-BR',{ weekday:'short',day:'numeric',month:'long',timeZone:'UTC' }).format(new Date(`${s}T12:00:00Z`)) : ''
export const today = () => new Intl.DateTimeFormat('en-CA',{ timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date())
export const messageOf = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível confirmar. Confira sua conexão e tente novamente.'
