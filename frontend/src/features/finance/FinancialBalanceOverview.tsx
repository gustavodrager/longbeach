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
import { pagBankBalanceSource } from './pagBankBalanceSource'

type Balances = {
  pagBankWallet?: { amountCents: number | null; date: string | null; collectedAtUtc: string | null; sourceHashes: string[]; issue: string | null }
  pagBank: { amountCents: number | null; date: string | null; sourceName: string | null; sourceCell: string | null; metric: string | null; issue: string | null }
  general: { month: string | null; amountCents: number | null; incomeCents: number | null; expenseCents: number | null; records: number; sources: string[]; issue: string | null; basis?: string; estimated?: boolean; estimatedExpenseCents?: number; expensesByType?: ExpenseBreakdown | null }
}
const monthLabel = (month: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`))
export function FinancialBalanceOverview({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth()
  const query = useQuery({ queryKey: ['dashboard-balances', user?.id], queryFn: () => apiFetch<Balances>('/api/v1/financial-history/dashboard-balances'), enabled: Boolean(isManagement(user)) })
  if (!isManagement(user)) return null
  const data = query.isError ? undefined : query.data
  const bank = data?.pagBank, general = data?.general, wallet = data?.pagBankWallet
  const bankSource = pagBankBalanceSource(bank)
  const bankHref = `/financeiro/historico?${new URLSearchParams({ series: 'saldos', ...(bank?.date ? { month: bank.date.slice(0, 7) } : {}), ...(bank?.metric ? { metric: bank.metric } : {}) })}`
  const reviewed = general?.basis === 'revisado'
  const generalHref = reviewed ? `/financeiro/controle-mensal?${new URLSearchParams({ ...(general?.month ? { month: general.month } : {}) })}` : `/financeiro/historico?${new URLSearchParams({ series: 'consolidado', ...(general?.month ? { month: general.month } : {}) })}`
  const value = (amount: number | null | undefined) => query.isError ? 'Falha na atualização' : query.isPending ? 'Carregando…' : amount == null ? 'Ainda não disponível' : centsMoney(amount)
  return <section className="arena-dashboard-section" aria-labelledby="financial-balances-title">
    <div className="arena-section-heading"><div><p className="arena-section-eyebrow">{compact ? '02 · Financeiro' : 'Saldos importados e fontes disponíveis'}</p><h2 id="financial-balances-title">{compact ? 'Resumo financeiro' : 'Visão financeira'}</h2></div><Link className="secondary-link" to="/importacoes">Importar extratos</Link></div>
    <CurrentFinancialMetrics compact={compact} />
    {query.isError && <p role="alert">Não foi possível carregar os saldos e as fontes importadas. <button type="button" onClick={() => void query.refetch()}>Tentar novamente</button></p>}
    <div className="arena-metric-grid arena-financial-grid" aria-label="Saldo da conta PagBank">
      <Link className={`arena-metric ${bank?.amountCents == null ? 'arena-metric-unavailable' : ''}`} to={bankHref}>
        <span className="arena-metric-label">{bankSource.label}</span><strong>{value(bank?.amountCents)}</strong>
        <small>{bankSource.reference}</small>
        <small>{bankSource.explanation}</small>
        {bank?.sourceName && <small>Fonte: {bank.sourceName}{bank.sourceCell ? ` · ${bank.sourceCell}` : ''}</small>}
        {bank?.issue && <small>{bank.issue}</small>}
        <span className="arena-link-label">Conferir saldo e origem →</span>
      </Link>
    </div>
    <Disclosure title="Carteira PagBank · histórico EDI">
    {wallet && <div className="arena-metric-grid arena-financial-grid"><Link className={`arena-metric ${wallet.amountCents == null ? 'arena-metric-unavailable' : ''}`} to={`/financeiro/historico?ediDate=${wallet.date ?? ''}#pagbank-edi`}>
      <span className="arena-metric-label">Carteira de vendas PagBank · histórico EDI</span><strong>{value(wallet.amountCents)}</strong>
      <small>{wallet.date ? `Saldo final de ${wallet.date.split('-').reverse().join('/')}` : 'Data a confirmar'}</small>
      <small>Referência histórica da carteira de liquidação das vendas, separada da conta digital. A data pertence ao documento preservado.</small>
      {wallet.collectedAtUtc && <small>Registrado em: {new Date(wallet.collectedAtUtc).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</small>}
      {wallet.issue && <small>{wallet.issue}</small>}
      <span className="arena-link-label">Conferir documentos EDI →</span>
    </Link></div>}
    {!wallet && <p className="arena-hint">{query.isPending ? 'Carregando carteira…' : query.isError ? 'Falha ao carregar a carteira. Repita a consulta dos saldos.' : 'Nenhuma referência de carteira disponível.'}</p>}
    </Disclosure>
    <Disclosure title="Histórico: última referência disponível" lazy>
    <p className="arena-hint">O extrato e o controle mensal abaixo preservam a data da fonte. Atualizar a página não transforma esses valores em saldo de hoje.</p>
    <div className="arena-metric-grid arena-financial-grid">
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
