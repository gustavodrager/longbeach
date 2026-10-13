import { isManagement } from '../auth/access'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { apiFetch } from '../../lib/http'
import { centsMoney } from './FinancialHistory'
import { ExpenseComposition } from './ExpenseComposition'
import type { ExpenseBreakdown } from './monthlyExpenses'
import { Disclosure } from '../../components/managementUi'
import { CurrentFinancialMetrics } from './CurrentFinancialMetrics'

type Balances = {
  pagBankWallet?: { amountCents: number | null; date: string | null; collectedAtUtc: string | null; sourceHashes: string[]; issue: string | null }
  pagBank: { amountCents: number | null; date: string | null; sourceName: string | null; sourceCell: string | null; metric: string | null; issue: string | null }
  general: { month: string | null; amountCents: number | null; incomeCents: number | null; expenseCents: number | null; records: number; sources: string[]; issue: string | null; basis?: string; estimated?: boolean; estimatedExpenseCents?: number; expensesByType?: ExpenseBreakdown | null }
}
const monthLabel = (month: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`))
export function FinancialBalanceOverview() {
  const { user } = useAuth()
  const query = useQuery({ queryKey: ['dashboard-balances', user?.id], queryFn: () => apiFetch<Balances>('/api/v1/financial-history/dashboard-balances'), enabled: Boolean(isManagement(user)), refetchInterval: 60_000 })
  if (!isManagement(user)) return null
  const bank = query.data?.pagBank, general = query.data?.general, wallet = query.data?.pagBankWallet
  const bankHref = `/financeiro/historico?${new URLSearchParams({ series: 'saldos', ...(bank?.date ? { month: bank.date.slice(0, 7) } : {}), ...(bank?.metric ? { metric: bank.metric } : {}) })}`
  const reviewed = general?.basis === 'revisado'
  const generalHref = reviewed ? `/financeiro/controle-mensal?${new URLSearchParams({ ...(general?.month ? { month: general.month } : {}) })}` : `/financeiro/historico?${new URLSearchParams({ series: 'consolidado', ...(general?.month ? { month: general.month } : {}) })}`
  const value = (amount: number | null | undefined) => query.isError ? 'Falha na atualização' : query.isPending ? 'Carregando…' : amount == null ? 'Ainda não disponível' : centsMoney(amount)
  return <section className="arena-dashboard-section" aria-labelledby="financial-balances-title">
    <div className="arena-section-heading"><div><p className="arena-section-eyebrow">Posição atual e fontes disponíveis</p><h2 id="financial-balances-title">Visão financeira</h2></div></div>
    <CurrentFinancialMetrics />
    {query.isError && <p role="alert">Não foi possível atualizar a carteira EDI e as referências históricas. Tente novamente.</p>}
    {wallet && <div className="arena-metric-grid arena-financial-grid"><Link className={`arena-metric ${wallet.amountCents == null ? 'arena-metric-unavailable' : ''}`} to={`/financeiro/historico?ediDate=${wallet.date ?? ''}#pagbank-edi`}>
      <span className="arena-metric-label">Carteira de vendas PagBank · último dia validado</span><strong>{value(wallet.amountCents)}</strong>
      <small>{wallet.date ? `Saldo final de ${wallet.date.split('-').reverse().join('/')}` : 'Data a confirmar'} · atualização em D+1</small>
      <small>Saldo da carteira de liquidação das vendas. Separado da conta digital. Não inclui as vendas de hoje.</small>
      {wallet.collectedAtUtc && <small>Coleta: {new Date(wallet.collectedAtUtc).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</small>}
      {wallet.issue && <small>{wallet.issue}</small>}
      <span className="arena-link-label">Conferir documentos EDI →</span>
    </Link></div>}
    <Disclosure title="Histórico: última referência disponível" lazy>
    <p className="arena-hint">O extrato e o controle mensal abaixo preservam a data da fonte. Atualizar a página não transforma esses valores em saldo de hoje.</p>
    <div className="arena-metric-grid arena-financial-grid">
      <Link className={`arena-metric ${bank?.amountCents == null ? 'arena-metric-unavailable' : ''}`} to={bankHref}>
        <span className="arena-metric-label">Saldo da conta PagBank · histórico</span><strong>{value(bank?.amountCents)}</strong>
        <small>{bank?.date ? `Saldo informado em ${bank.date.split('-').reverse().join('/')}` : 'Data do saldo a confirmar'}</small>
        <small>Último extrato importado. Este valor não acompanha o saldo atual da conta.</small>
        {bank?.sourceName && <small>Fonte: {bank.sourceName.toLowerCase().includes('.pdf') ? 'extrato PDF' : 'planilha'} · {bank.sourceCell}</small>}
        {bank?.issue && <small>{bank.issue}</small>}
        <span className="arena-link-label">Conferir saldo e origem →</span>
      </Link>
      <Link className={`arena-metric ${general?.amountCents == null ? 'arena-metric-unavailable' : ''}`} to={generalHref}>
        <span className="arena-metric-label">Resultado do controle mensal · histórico</span><strong>{value(general?.amountCents)}</strong>
        <small>{general?.month ? `Resultado${general.estimated ? ' estimado' : ''} de ${monthLabel(general.month)}` : 'Competência a confirmar'}</small>
        {general?.amountCents != null && <small>{general.amountCents < 0 ? 'Déficit' : general.amountCents > 0 ? 'Superávit' : 'Equilíbrio'} · receitas menos despesas</small>}
        {!reviewed && <small>Base: consolidado mensal da planilha</small>}
        {general?.issue && <small>{general.issue}</small>}
        <span className="arena-link-label">Conferir receitas e despesas →</span>
      </Link>
      {!query.isError && reviewed && general?.incomeCents != null && general.expenseCents != null && <>
        <Link className="arena-metric" to={generalHref}><span className="arena-metric-label">Receitas do mês</span><strong>{centsMoney(general.incomeCents)}</strong><small>{monthLabel(general.month!)} · valores informados</small></Link>
        <Link className="arena-metric" to={generalHref}><span className="arena-metric-label">Despesas{general.estimated ? ' previstas' : ''} do mês</span><strong>{centsMoney(general.expenseCents)}</strong><small>{general.estimated ? `${centsMoney(general.estimatedExpenseCents ?? 0)} estimados` : monthLabel(general.month!)}</small></Link>
      </>}
    </div>
    {!query.isError && reviewed && general?.month && general.expensesByType && <ExpenseComposition totals={general.expensesByType} month={general.month} />}
    {!query.isError && !reviewed && general?.incomeCents != null && general.expenseCents != null && <details className="arena-hint"><summary>Como o resultado mensal é calculado</summary><p>Receitas informadas no consolidado: {centsMoney(general.incomeCents)}. Despesas líquidas do consolidado: {centsMoney(general.expenseCents)}. Resultado: {centsMoney(general.amountCents!)}.</p><p>{general.records} registros do mesmo mês. Movimentos bancários, despesas externas e demais controles ficam disponíveis no histórico, sem serem somados novamente ao consolidado.</p></details>}
    </Disclosure>
  </section>
}
