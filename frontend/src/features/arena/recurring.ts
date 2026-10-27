import type { RecurringReservationInput, Reservation } from './types'

export function validateRecurringInput(input: RecurringReservationInput): string | null {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(input.operationId) || input.operationId === '00000000-0000-0000-0000-000000000000') return 'A identificação da solicitação é obrigatória.'
  if (!input.groupTitle.trim() || input.groupTitle.trim().length > 120) return 'O nome do grupo deve ter entre 1 e 120 caracteres.'
  if (!Number.isInteger(input.weeks) || input.weeks < 1 || input.weeks > 12) return 'Escolha de 1 a 12 semanas para o grupo.'
  const date = new Date(`${input.startDate}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.toISOString().slice(0,10) !== input.startDate) return 'Informe uma primeira data válida para todas as semanas.'
  const last = new Date(date); last.setUTCDate(last.getUTCDate() + (input.weeks - 1) * 7)
  if (last.getUTCFullYear() > 9999) return 'Informe uma primeira data válida para todas as semanas.'
  const time = /^([01]\d|2[0-3]):[0-5]\d$/
  if (!time.test(input.startTime) || !time.test(input.endTime) || input.startTime >= input.endTime) return 'Confira o horário: o término deve ficar depois do início.'
  if (!Number.isFinite(input.amount) || input.amount < 0 || input.amount > 999_999_999 || Math.abs(Math.round(input.amount * 100) - input.amount * 100) > 0.00001) return 'Confira o valor combinado por reserva.'
  if (input.customerName.trim().length > 240 || input.phone.trim().length > 80 || input.notes.trim().length > 2000) return 'Confira o tamanho do nome, telefone e observações do grupo.'
  return null
}
export async function expandRecurringReservations(input: RecurringReservationInput): Promise<Reservation[]> {
  return Promise.all(Array.from({ length: input.weeks }, async (_, offset) => {
    const index = offset + 1
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`longbeach-arena-recurring-v1:${input.operationId.toLowerCase()}:${index}`))
    const hex = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2,'0')).join('').slice(0,32).split('')
    hex[12]='8'; hex[16]='89ab'[Number.parseInt(hex[16],16)&3]
    const value=hex.join(''), id=`${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`
    const date = new Date(`${input.startDate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + offset * 7)
    return { id, version: 1, name: input.groupTitle.trim(), courtId: input.courtId, date: date.toISOString().slice(0,10), startTime: input.startTime, endTime: input.endTime, customerName: input.customerName.trim(), phone: input.phone.trim(), amount: input.amount, status: 'Confirmada', notes: input.notes.trim(), groupId: input.operationId, groupTitle: input.groupTitle.trim(), occurrenceIndex: index }
  }))
}
