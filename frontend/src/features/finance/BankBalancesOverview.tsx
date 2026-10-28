import { Link } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { isManagement } from '../auth/access'
import { dateTime } from '../attendance/api'
import { centsMoney } from './financialHistoryApi'
import { pagBankBalanceSource } from './pagBankBalanceSource'
import { useDashboardBalances, useFinancialPosition } from './financialBalancesApi'
import './bankBalancesOverview.css'

export function BankBalancesOverview({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const { user } = useAuth()
  const pagBankQuery = useDashboardBalances()
  const c6Query = useFinancialPosition()
  if (!isManagement(user)) return null
  const pagBank = pagBankQuery.isError ? undefined : pagBankQuery.data?.pagBank
  const c6 = c6Query.isError ? undefined : c6Query.data?.currentBank
  const source = pagBankBalanceSource(pagBank)
  const bankHref = (metric: string, date?: string | null) => `/financeiro/historico?${new URLSearchParams({ series: 'saldos', ...(date ? { month: date.slice(0, 7) } : {}), metric })}`
  const value = (amount: number | null | undefined, error: boolean, pending: boolean) => error ? 'Saldo indisponível' : pending ? 'Carregando…' : amount == null ? 'Ainda não disponível' : centsMoney(amount)
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  return <section className="bank-balances-overview" aria-label="Saldos dos bancos">
    <Heading>Saldos dos bancos</Heading>
    <p className="arena-hint">Cada saldo mantém sua data e origem. Estes valores não são somados aos pagamentos das contas.</p>
    <div className="bank-balances-grid">
      <Link className={`arena-metric ${pagBank?.amountCents == null ? 'arena-metric-unavailable' : ''}`} to={bankHref(pagBank?.metric ?? 'Saldo Pagbank', pagBank?.date)}>
        <span className="arena-metric-label">{source.label}</span>
        <strong>{value(pagBank?.amountCents, pagBankQuery.isError, pagBankQuery.isPending)}</strong>
        {pagBankQuery.isError ? <small role="status">Não foi possível carregar o saldo PagBank registrado no sistema.</small> : <>
          <small>{source.reference}</small>
          <small>Origem: {source.kind === 'portal' ? 'Portal PagBank · consulta manual' : pagBank?.sourceName ?? 'Extrato ainda não informado'}</small>
          <small>{source.explanation}</small>
          {pagBank?.issue && <small>{pagBank.issue}</small>}
        </>}
        <span className="arena-link-label">Conferir saldo e origem →</span>
      </Link>
      <Link className={`arena-metric ${c6?.amountCents == null ? 'arena-metric-unavailable' : ''}`} to={bankHref('Saldo C6', c6?.sourceDate)}>
        <span className="arena-metric-label">Saldo da conta C6 · referência importada</span>
        <strong>{value(c6?.amountCents, c6Query.isError, c6Query.isPending)}</strong>
        {c6Query.isError ? <small role="status">Não foi possível carregar o saldo C6 registrado no sistema.</small> : <>
          <small>{c6?.sourceDate ? `Saldo informado em ${c6.sourceDate.split('-').reverse().join('/')}` : 'Data do saldo a confirmar'}</small>
          <small>Origem: {c6?.source ?? 'Extrato C6 ainda não informado'}</small>
          {c6?.asOfUtc && <small>{c6.status === 'Imported' ? 'Importado em' : 'Registrado em'}: {dateTime(c6.asOfUtc)}</small>}
          {c6?.environment === 'Sandbox' && <small>Ambiente de testes — não representa dinheiro real.</small>}
          {(c6?.amountCents == null || c6.status !== 'Imported') && c6?.issue && <small>{c6.issue}</small>}
          <small>Valor da data da fonte. O saldo não é atualizado automaticamente.</small>
        </>}
        <span className="arena-link-label">Conferir saldo e origem →</span>
      </Link>
    </div>
  </section>
}
