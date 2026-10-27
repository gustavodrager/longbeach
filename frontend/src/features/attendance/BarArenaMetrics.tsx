import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { hasPermission } from '../auth/access'
import { dateTime, money, type TabReport } from './api'
import { reportPeriod, reportPeriodError } from './reportPeriod'
import { displayDate } from '../../pages/arenaUi'

/** All amounts come from the same ledger query as their linked detail list. */
export function BarArenaMetrics({ from, to, compact = false }: { from: string; to: string; compact?: boolean }) {
  const { user } = useAuth()
  const allowed = hasPermission(user, 'bar:finance:read')
  const params = new URLSearchParams({ de: from, ate: to })
  const period = reportPeriod(params)
  const periodError = reportPeriodError(params)
  const metrics = [['open-tabs', 'Comandas abertas', 'Abrir comandas'], ['pending-payments', 'Pix pendentes', 'Conferir Pix'], ['consumption', 'Consumo confirmado', 'Conferir consumo'], ['received', 'Recebimentos do bar confirmados', 'Conferir recebimentos do bar']].filter(([metric]) => !compact || ['consumption', 'received'].includes(metric))
  const queries = useQueries({ queries: metrics.map(([metric]) => ({ queryKey: ['bar-runtime', user?.id, `/tabs/reports/${metric}?${period}`], queryFn: () => apiFetch<TabReport>(`/api/v1/bar/tabs/reports/${metric}?${period}&pageSize=1`), enabled: allowed && !periodError, refetchInterval: 30_000 })) })
  if (!allowed) return null
  if (periodError) return <section><h2>Bar e caixa</h2><p className="arena-message arena-error" role="alert">{periodError}</p></section>
  return <section aria-label="Bar e caixa"><div className="arena-section-heading"><div>{compact ? <h3>Bar e caixa</h3> : <h2>Bar e caixa</h2>}<p>Comandas registradas no sistema</p></div><Link className="arena-link-label" to={`/bar/indicadores?${params}`}>Abrir gestão do bar →</Link></div>
    <div className="arena-metric-grid">{metrics.map(([metric, title, action], index) => {
      const query = queries[index]
      const report = query.isError ? undefined : query.data
      return <Link className="arena-metric" key={metric} to={`/bar/indicadores/${metric}?${params}`}><span className="arena-metric-label">{title}</span><strong>{query.isError ? 'Falha ao carregar' : report && report.available !== false ? report.unit === 'money' ? money(report.value) : report.value : query.isPending ? 'Carregando…' : 'Ainda não disponível'}</strong><small>{report?.current ? 'Agora · independente do período' : `${displayDate(from)} a ${displayDate(to)}`}</small>{report && !compact && <small>Atualizado: {dateTime(report.updatedAtUtc)}</small>}<span className="arena-link-label">{action} →</span></Link>
    })}</div>
    {queries.some(query => query.isError) && <p role="alert">Não foi possível atualizar os indicadores do bar. <button type="button" className="secondary-link" onClick={() => void Promise.allSettled(queries.map(query => query.refetch()))}>Tentar novamente</button></p>}
    {!compact && <p className="arena-hint">Estes indicadores incluem as comandas dos novos fluxos. <Link to="/bar/vendas">Consultar vendas históricas →</Link> Recebimentos das comandas e lançamentos manuais do Financeiro são fontes diferentes.</p>}
  </section>
}
