import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { dateTime, money, type TabReport } from './api'
import { reportPeriod, reportPeriodError } from './reportPeriod'

/** All amounts come from the same ledger query as their linked detail list. */
export function BarArenaMetrics({ from, to }: { from: string; to: string }) {
  const { user } = useAuth(); const allowed = Boolean(user?.permissions.includes('bar:finance:read')); const params = new URLSearchParams({ de: from, ate: to }); const period = reportPeriod(params); const periodError = reportPeriodError(params)
  const metrics = [['open-tabs', 'Comandas abertas'], ['pending-payments', 'Pix pendentes'], ['consumption', 'Consumo confirmado'], ['received', 'Recebimentos do bar confirmados']]
  const queries = useQueries({ queries: metrics.map(([metric]) => ({ queryKey: ['bar-runtime', user?.id, `/tabs/reports/${metric}?${period}`], queryFn: () => apiFetch<TabReport>(`/api/v1/bar/tabs/reports/${metric}?${period}&pageSize=1`), enabled: allowed && !periodError, refetchInterval: 30_000 })) })
  if (!allowed) return null
  if (periodError) return <section><h2>Bar e caixa</h2><p className="arena-message arena-error" role="alert">{periodError}</p></section>
  return <section><div className="arena-section-heading"><div><h2>Bar e caixa</h2><p>Comandas · novos fluxos</p></div><Link className="arena-link-label" to={`/bar/indicadores?${params}`}>Abrir gestão do bar →</Link></div><div className="arena-metric-grid">{metrics.map(([metric, title], index) => { const report = queries[index].data; return <Link className="arena-metric" key={metric} to={`/bar/indicadores/${metric}?${params}`}><span>{title}</span><strong>{report && report.available !== false ? report.unit === 'money' ? money(report.value) : report.value : queries[index].isLoading ? 'Carregando…' : 'Ainda não disponível'}</strong><small>{report?.current ? 'Agora' : `${from} a ${to}`}</small>{report && <small>Atualizado: {dateTime(report.updatedAtUtc)}</small>}<span className="arena-link-label">Ver detalhes →</span></Link> })}</div><p className="arena-hint">Estes indicadores incluem as comandas dos novos fluxos. <Link to="/bar/vendas">Consultar vendas históricas →</Link> Recebimentos das comandas e lançamentos manuais do Financeiro são fontes diferentes.</p></section>
}
