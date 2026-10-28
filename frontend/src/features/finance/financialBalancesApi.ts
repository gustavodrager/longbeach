import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/http'
import { isManagement } from '../auth/access'
import { useAuth } from '../auth/authContext'
import type { ExpenseBreakdown } from './monthlyExpenses'

type Outstanding = { amountCents: number; records: number; overdueCents: number; overdueRecords: number; confirmedPaymentsCents: number }
export type FinancialPosition = {
  date: string; readAtUtc: string; lastRecordChangeAtUtc: string | null; registeredEntries: number
  receivable: Outstanding; payable: Outstanding
  currentBank: { amountCents: number | null; asOfUtc: string | null; status: string; issue: string; source?: string | null; environment?: string | null; sourceDate?: string | null }
  entries: { id: string; name: string; direction: 'Receber' | 'Pagar'; dueDate: string; originalCents: number; confirmedPaymentsCents: number; outstandingCents: number; hasDueDate?: boolean; managedExpense?: boolean }[]
}
export type DashboardBalances = {
  pagBankWallet?: { amountCents: number | null; date: string | null; collectedAtUtc: string | null; sourceHashes: string[]; issue: string | null }
  pagBank: { amountCents: number | null; date: string | null; sourceName: string | null; sourceCell: string | null; metric: string | null; issue: string | null }
  general: { month: string | null; amountCents: number | null; incomeCents: number | null; expenseCents: number | null; records: number; sources: string[]; issue: string | null; basis?: string; estimated?: boolean; estimatedExpenseCents?: number; expensesByType?: ExpenseBreakdown | null }
}

async function loadPosition() {
  const result = await apiFetch<FinancialPosition>('/api/v1/financial-history/current-position')
  if (!result?.currentBank || !result.receivable || !result.payable || !Array.isArray(result.entries) || !result.readAtUtc) throw new Error('Posição financeira incompleta.')
  return result
}
export function useFinancialPosition() {
  const { user } = useAuth()
  return useQuery({ queryKey: ['current-financial-position', user?.id], queryFn: loadPosition, enabled: isManagement(user) })
}
export function useDashboardBalances() {
  const { user } = useAuth()
  return useQuery({ queryKey: ['dashboard-balances', user?.id], queryFn: () => apiFetch<DashboardBalances>('/api/v1/financial-history/dashboard-balances'), enabled: isManagement(user) })
}
