import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { apiFetch } from '../../lib/http'
import { centsMoney } from './FinancialHistory'

type Balances = {
  pagBank: { amountCents: number | null; date: string | null; sourceName: string | null; sourceCell: string | null; metric: string | null; issue: string | null }
  general: { month: string | null; amountCents: number | null; incomeCents: number | null; expenseCents: number | null; records: number; sources: string[]; issue: string | null }
}
const monthLabel = (month: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`))
export function FinancialBalanceOverview() {
  const { user } = useAuth()
  const query = useQuery({ queryKey: ['dashboard-balances', user?.id], queryFn: () => apiFetch<Balances>('/api/v1/financial-history/dashboard-balances'), enabled: Boolean(user?.roles.includes('Owner')), refetchInterval: 60_000 })
  if (!user?.roles.includes('Owner')) return null
  const bank = query.data?.pagBank, general = query.data?.general
  const bankHref = `/financeiro/historico?${new URLSearchParams({ series: 'saldos', ...(bank?.date ? { month: bank.date.slice(0, 7) } : {}), ...(bank?.metric ? { metric: bank.metric } : {}) })}`
  const generalHref = `/financeiro/historico?${new URLSearchParams({ series: 'consolidado', ...(general?.month ? { month: general.month } : {}) })}`
  const value = (amount: number | null | undefined) => query.isError ? 'Falha na atualização' : query.isPending ? 'Carregando…' : amount == null ? 'Ainda não disponível' : centsMoney(amount)
  return <section className="arena-dashboard-section" aria-labelledby="financial-balances-title">
    <div className="arena-section-heading"><div><p className="arena-section-eyebrow">Saldos e resultado</p><h2 id="financial-balances-title">Visão financeira</h2></div></div>
    {query.isError && <p role="alert">Não foi possível atualizar os saldos. Tente novamente.</p>}
    <div className="arena-metric-grid">
      <Link className={`arena-metric ${bank?.amountCents == null ? 'arena-metric-unavailable' : ''}`} to={bankHref}>
        <span className="arena-metric-label">Saldo da conta PagBank</span><strong>{value(bank?.amountCents)}</strong>
        <small>{bank?.date ? `Saldo informado em ${bank.date.split('-').reverse().join('/')}` : 'Data do saldo a confirmar'}</small>
        {bank?.sourceName && <small>Fonte: planilha · {bank.sourceCell}</small>}
        {bank?.issue && <small>{bank.issue}</small>}
        <span className="arena-link-label">Conferir saldo e origem →</span>
      </Link>
      <Link className={`arena-metric ${general?.amountCents == null ? 'arena-metric-unavailable' : ''}`} to={generalHref}>
        <span className="arena-metric-label">Saldo do controle geral</span><strong>{value(general?.amountCents)}</strong>
        <small>{general?.month ? `Resultado de ${monthLabel(general.month)}` : 'Competência a confirmar'}</small>
        {general?.amountCents != null && <small>{general.amountCents < 0 ? 'Déficit' : general.amountCents > 0 ? 'Superávit' : 'Equilíbrio'} · receitas menos despesas</small>}
        <small>Base: consolidado mensal da planilha</small>
        {general?.issue && <small>{general.issue}</small>}
        <span className="arena-link-label">Conferir receitas e despesas →</span>
      </Link>
    </div>
    {general?.incomeCents != null && general.expenseCents != null && <details className="arena-hint"><summary>Como o saldo geral é calculado</summary><p>Receitas da arena e vendas brutas do bar: {centsMoney(general.incomeCents)}. Despesas líquidas do consolidado: {centsMoney(general.expenseCents)}. Resultado: {centsMoney(general.amountCents!)}.</p><p>{general.records} registros do mesmo mês. As parcelas do controle separado de dívidas ficam disponíveis no histórico.</p></details>}
  </section>
}
