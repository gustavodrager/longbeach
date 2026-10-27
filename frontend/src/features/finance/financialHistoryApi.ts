import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { isManagement } from '../auth/access'

export type Classified = { businessUnitId?: 'bar' | 'quadra' | null }
export type HistoryTotal = Classified & { series: string; metric: string; state: string; period: string; grain: string; amountCents: number; records: number }
type Observation = { sourceCell: string; series: string; metric: string; label: string; state: string; periodStart: string; periodEnd: string; grain: string; amountCents: number; notes: string }
export type HistoryReport = { month: string; months: string[]; totals: HistoryTotal[]; items: (Classified & { id: string; sourceName: string; sourceSha256: string; data: Observation })[]; total: number; page: number; updatedAtUtc: string }
export type HistoryPreview = { batchId: string; sourceName: string; applied: boolean; confirmationToken: string; creates: number; matches: number; totals: HistoryTotal[] }

export const centsMoney = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const monthLabel = (value: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + '-01T12:00:00Z'))

export function useHistory(params: URLSearchParams) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['financial-history', user?.id, params.toString()],
    queryFn: async () => {
      const report = await apiFetch<HistoryReport>(`/api/v1/financial-history?${params}`)
      if (!Array.isArray(report.items) || !Array.isArray(report.totals) || !Array.isArray(report.months) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(report.month)) throw new Error('Resposta financeira inválida.')
      return report
    },
    enabled: Boolean(isManagement(user)),
  })
}
