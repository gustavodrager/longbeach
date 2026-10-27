import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/http'
import { validDate } from '../../pages/arenaUi'
import { hasPermission } from '../auth/access'
import { useAuth } from '../auth/authContext'
import { expenseMoney } from './expenses'
import './expense-paid-metric.css'

type PaidSummary = { amount: number; records: number }

async function loadPaidSummary(from: string, to: string, signal: AbortSignal) {
  const result = await apiFetch<PaidSummary>(`/api/v1/expenses/paid-summary?${new URLSearchParams({ from, to })}`, { signal })
  if (!result || !Number.isFinite(result.amount) || result.amount < 0 || !Number.isSafeInteger(result.records) || result.records < 0) throw new Error('Resumo de pagamentos incompleto.')
  return result
}

export function ExpensePaidMetric({ from, to }: { from: string; to: string }) {
  const { user } = useAuth(); const allowed = hasPermission(user, 'finance:read')
  const valid = validDate(from) && validDate(to) && from <= to
  const actor = `${user?.id}:${[...(user?.roles ?? []), ...(user?.permissions ?? [])].sort().join(',')}`
  const query = useQuery({ queryKey: ['expenses', 'paid-summary', actor, from, to], queryFn: ({ signal }) => loadPaidSummary(from, to, signal), enabled: allowed && valid, retry: false, refetchInterval: 60_000 })
  if (!allowed || !valid) return null
  const result = query.isError ? undefined : query.data
  return <article className={`arena-metric expense-paid-metric${result ? '' : ' arena-metric-unavailable'}`} aria-label="Despesas pagas no período">
    <span className="arena-metric-label">Despesas pagas</span><strong>{result ? expenseMoney(result.amount) : query.isError ? 'Falha na atualização' : 'Carregando…'}</strong>
    {result && <small>{result.records === 0 ? 'Nenhum pagamento registrado no período.' : `${result.records} ${result.records === 1 ? 'pagamento efetivo' : 'pagamentos efetivos'} no período`}</small>}
    {query.isError && <p className="expense-paid-error" role="alert">Não foi possível consultar as despesas pagas neste período. <button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? 'Atualizando…' : 'Tentar novamente'}</button></p>}
    <Link className="arena-link-label" to="/financeiro/despesas">Conferir despesas <span aria-hidden="true">→</span></Link>
  </article>
}
