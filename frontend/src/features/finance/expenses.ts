import { apiFetch } from '../../lib/http'
import type { BusinessAllocation } from './businessUnits'

export type ExpenseFilter = 'All' | 'Expenses' | 'Team' | 'Partners'
export type ExpenseState = 'Open' | 'Completed'
export type ExpensePaidBy = 'Pending' | 'Company' | 'Partner'
export type ExpenseRow = BusinessAllocation & {
  id: string; description: string; kind: 'Expense' | 'Team'; category: string; beneficiary: string
  dueDate: string | null; expenseDate: string; amount: number; paidAmount: number; remainingAmount: number
  status: 'Pending' | 'Partial' | 'Paid' | 'Canceled'; paidBy: ExpensePaidBy
  partnerId: string | null; partnerName: string | null; teamMemberId: string | null; reference: string | null
  origin: string; managed: boolean; purchaseId: string | null; version: number
}
export type ExpensePayment = { operationId: string; amount: number; paidDate: string; paymentMethod: string; accountReference: string | null; createdAtUtc: string }
export type ExpenseDetail = { expense: ExpenseRow; payments: ExpensePayment[]; notes: string | null; documentReference: string | null; cancellationReason?: string | null }
export type ExpenseList = {
  items: ExpenseRow[]; summary: { outstandingAmount: number; overdueAmount: number; partnerAmount: number; outstandingCount: number }
  page: number; pageSize: number; total: number; today: string
}
export type ExpensePartner = { id: string; name: string }
export type ExpenseTeamMember = { id: string; name: string; payAmount: number | null; payBasis: string; paymentFrequency: string; paymentDay: string }
export type ExpenseOptions = { partners: ExpensePartner[]; team: ExpenseTeamMember[]; attachmentSupport: boolean }
export type NewExpense = BusinessAllocation & {
  description: string; kind: 'Expense' | 'Team'; category: string; beneficiary: string; dueDate: string | null
  expenseDate: string; amount: number; paidBy: ExpensePaidBy; partnerId?: string; teamMemberId?: string
  teamBasis?: 'Monthly' | 'Daily'; referenceMonth?: string; workDate?: string; shift?: string
  paidDate?: string; paymentMethod?: string; accountReference?: string; origin: string; notes?: string; documentReference?: string; purchaseId?: string
}
export type NewExpensePayment = { operationId: string; amount: number; paidDate: string; paymentMethod: string; accountReference?: string; version: number }
export type ExpenseCancellation = { operationId: string; version: number; reason: string }

export const expenseApi = {
  list: (params: URLSearchParams, signal?: AbortSignal) => apiFetch<ExpenseList>(`/api/v1/expenses?${params}`, { signal }),
  options: (signal?: AbortSignal) => apiFetch<ExpenseOptions>('/api/v1/expenses/options', { signal }),
  detail: (id: string, signal?: AbortSignal) => apiFetch<ExpenseDetail>(`/api/v1/expenses/${encodeURIComponent(id)}`, { signal }),
  create: (id: string, value: NewExpense) => apiFetch<ExpenseDetail>(`/api/v1/expenses/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(value) }),
  pay: (id: string, value: NewExpensePayment) => apiFetch<ExpenseDetail>(`/api/v1/expenses/${encodeURIComponent(id)}/payments`, { method: 'POST', body: JSON.stringify(value) }),
  cancel: (id: string, value: ExpenseCancellation) => apiFetch<ExpenseDetail>(`/api/v1/expenses/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: JSON.stringify(value) }),
  partner: (value: ExpensePartner) => apiFetch<ExpensePartner>('/api/v1/expenses/partners', { method: 'POST', body: JSON.stringify(value) }),
}

export const expenseMoney = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
export const expenseMoneyInput = (value: number) => value.toFixed(2).replace('.', ',')
// Financial input accepts Brazilian separators and never rounds a third decimal silently.
export function parseExpenseMoney(input: string): number | null {
  const text = input.trim().replace(/\s/g, '').replace(/^R\$/, '')
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text) && !/^\d+(?:\.\d{1,2})?$/.test(text)) return null
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(?:\.\d{3})+$/.test(text) ? text.replace(/\./g, '') : text
  const cents = Math.round(Number(normalized) * 100)
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 99999999900 ? cents / 100 : null
}
export function teamPaymentBasis(person?: ExpenseTeamMember): 'Monthly' | 'Daily' | null {
  const basis = person?.payBasis.toLocaleLowerCase('pt-BR') ?? ''
  if (/mensal/.test(basis) && /dia|turno/.test(basis)) return null
  if (/mensal/.test(basis)) return 'Monthly'
  if (/dia|turno/.test(basis)) return 'Daily'
  return null
}
export function expenseTitle(row: ExpenseRow) {
  return row.paidBy === 'Partner' ? `${row.partnerName || 'Sócio'} · ${row.description}` : row.description
}
export function expenseSubtitle(row: ExpenseRow) {
  const parts = [row.paidBy === 'Partner' ? 'Reembolso ao sócio' : row.kind === 'Team' ? 'Equipe' : 'Despesa ou compra']
  if (row.kind === 'Team' && row.beneficiary && !row.description.includes(row.beneficiary)) parts.push(row.beneficiary)
  if (row.reference) parts.push(row.reference.replace(/^(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1').replace(/^(\d{4})-(\d{2})$/, '$2/$1'))
  if (row.allocationScope === 'Unit') parts.push(row.businessUnitId === 'bar' ? 'Bar' : 'Quadra')
  else if (row.allocationScope === 'Shared') parts.push('Compartilhado')
  else if (row.origin && row.origin !== 'Arena') parts.push(row.origin)
  return parts.join(' · ')
}
