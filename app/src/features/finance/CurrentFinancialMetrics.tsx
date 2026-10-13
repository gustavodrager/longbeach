import { useQueries, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { isManagement } from '../auth/access'
import { dateTime, money, type TabReport } from '../attendance/api'
import { centsMoney } from './FinancialHistory'

type Outstanding = { amountCents: number; records: number; overdueCents: number; overdueRecords: number; confirmedPaymentsCents: number }
type Position = {
  date: string; readAtUtc: string; lastRecordChangeAtUtc: string | null; registeredEntries: number
  receivable: Outstanding; payable: Outstanding
  currentBank: { amountCents: number | null; asOfUtc: string | null; status: string; issue: string }
  entries: { id: string; name: string; direction: 'Receber' | 'Pagar'; dueDate: string; originalCents: number; confirmedPaymentsCents: number; outstandingCents: number }[]
}
const barMetrics = [
  { metric: 'receivable', title: 'Comandas · falta receber', empty: 'Nenhuma comanda com saldo a receber registrada.', note: 'Comandas abertas registradas no Long Beach OS. Inclui Pix ainda sem confirmação.' },
  { metric: 'cash', title: 'Dinheiro nos caixas abertos', empty: 'Nenhum caixa aberto registrado.', note: 'Dinheiro físico esperado, com fundo e movimentos. Pix e cartão ficam fora deste valor.' },
]
async function loadPosition() {
  const result = await apiFetch<Position>('/api/v1/financial-history/current-position')
  if (!result?.currentBank || !result.receivable || !result.payable || !Array.isArray(result.entries) || !result.readAtUtc) throw new Error('Posição financeira incompleta.')
  return result
}
async function loadBarPosition(metric: string) {
  const result = await apiFetch<TabReport>(`/api/v1/bar/tabs/reports/${metric}?pageSize=1`)
  if (!result?.rows || !Number.isFinite(result.value) || !result.updatedAtUtc) throw new Error('Posição do bar incompleta.')
  return result
}

export function CurrentFinancialMetrics() {
  const { user } = useAuth()
  const [details, setDetails] = useState<'Receber' | 'Pagar' | null>(null)
  const allowed = isManagement(user)
  const position = useQuery({ queryKey: ['current-financial-position', user?.id], queryFn: loadPosition, enabled: allowed, refetchInterval: 30_000 })
  const bar = useQueries({ queries: barMetrics.map(({ metric }) => ({ queryKey: ['bar-runtime', user?.id, `/tabs/reports/${metric}`], queryFn: () => loadBarPosition(metric), enabled: allowed, refetchInterval: 30_000 })) })
  if (!allowed) return null
  const current = position.isError ? undefined : position.data
  const amount = (value?: number) => position.isError ? 'Falha na atualização' : position.isPending ? 'Carregando…' : value == null ? 'Ainda não disponível' : centsMoney(value)
  const refreshing = position.isFetching || bar.some(query => query.isFetching)
  const update = () => { void Promise.allSettled([position.refetch(), ...bar.map(query => query.refetch())]) }
  return <>
    <div className="arena-section-heading"><div><h3>Registrado no Long Beach OS</h3><p>Contas e caixas consultados a cada 30 segundos. Vendas e comandas abertas no PagVendas ainda não são sincronizadas em tempo real.</p></div><button type="button" className="secondary-link" onClick={update} disabled={refreshing}>{refreshing ? 'Atualizando…' : 'Atualizar agora'}</button></div>
    {position.isError && <p role="alert">Não foi possível atualizar as contas internas. Consulte novamente antes de usar os valores.</p>}
    <div className="arena-metric-grid arena-financial-grid">
      <div className="arena-metric arena-metric-unavailable">
        <span className="arena-metric-label">Saldo atual da conta PagBank</span>
        <strong>{current?.currentBank.status === 'NotConnected' ? 'Não conectado' : position.isPending ? 'Carregando…' : 'Ainda não disponível'}</strong>
        <small>{current?.currentBank.issue ?? 'A integração de saldo atual da conta ainda não está disponível.'}</small>
      </div>
      {(['receivable', 'payable'] as const).map(key => {
        const entry = current?.[key]
        const receivable = key === 'receivable'
        const direction = receivable ? 'Receber' : 'Pagar'
        return <button type="button" key={key} className="arena-metric" style={{ textAlign: 'left' }} aria-expanded={details === direction} aria-controls="current-financial-details" onClick={() => setDetails(details === direction ? null : direction)}>
          <span className="arena-metric-label">{receivable ? 'A receber · financeiro' : 'A pagar · financeiro'}</span><strong>{amount(entry?.amountCents)}</strong>
          <small>Pendências registradas · todos os vencimentos</small>
          {entry && <small>{entry.records ? `${entry.records} conta(s) pendente(s) · ${entry.overdueRecords} vencida(s): ${centsMoney(entry.overdueCents)}` : 'Nenhuma conta com saldo pendente registrada.'}</small>}
          {receivable && <small>Pagamentos confirmados já descontados; estornos confirmados reabrem o saldo. Pix pendente ainda não é recebimento.</small>}
          {entry && entry.confirmedPaymentsCents > 0 && <small>Descontados: {centsMoney(entry.confirmedPaymentsCents)} em pagamentos líquidos confirmados.</small>}
          <span className="arena-link-label">Conferir saldos pendentes →</span>
        </button>
      })}
      {barMetrics.map(({ metric, title, empty, note }, index) => {
        const query = bar[index]
        const report = query.isError ? undefined : query.data
        const available = report && report.available !== false
        return <Link key={metric} className="arena-metric" to={`/bar/indicadores/${metric}`}>
          <span className="arena-metric-label">{title}</span><strong>{query.isError ? 'Falha na atualização' : query.isPending ? 'Carregando…' : available ? money(report.value) : 'Ainda não disponível'}</strong>
          <small>{note}</small>
          {available && <small>{report.rows.total ? `${report.rows.total} registro(s) nesta consulta.` : empty}</small>}
          {report && <small>Consulta: {dateTime(report.updatedAtUtc)}</small>}
          <span className="arena-link-label">Conferir origem →</span>
        </Link>
      })}
    </div>
    {details && <section id="current-financial-details" aria-labelledby="current-financial-details-title">
      <div className="arena-section-heading"><h3 id="current-financial-details-title">{details === 'Receber' ? 'Contas a receber' : 'Contas a pagar'} · composição do saldo</h3><button type="button" className="secondary-link" onClick={() => setDetails(null)}>Fechar detalhes</button></div>
      <p className="arena-hint">Valor original menos os pagamentos líquidos confirmados = saldo pendente. Estornos já estão descontados dos pagamentos; Pix sem confirmação permanece pendente.</p>
      {!current ? <p role="status">Atualize as contas para conferir os saldos pendentes.</p> : current.entries.filter(entry => entry.direction === details).length === 0 ? <p>Nenhuma conta com saldo pendente registrada.</p> : <div className="responsive-records"><table aria-label="Composição do saldo pendente"><thead><tr><th scope="col">Lançamento</th><th scope="col">Vencimento</th><th scope="col">Valor original</th><th scope="col">Pagamentos líquidos</th><th scope="col">Saldo pendente</th></tr></thead><tbody>{current.entries.filter(entry => entry.direction === details).map(entry => <tr key={entry.id}><td><Link to={`/financeiro/${entry.id}`}>{entry.name}</Link></td><td>{entry.dueDate.split('-').reverse().join('/')}{entry.dueDate < current.date ? ' · vencido' : ''}</td><td>{centsMoney(entry.originalCents)}</td><td>{centsMoney(entry.confirmedPaymentsCents)}</td><td>{centsMoney(entry.outstandingCents)}</td></tr>)}</tbody><tfoot><tr><th scope="row" colSpan={4}>Total pendente</th><td>{centsMoney(details === 'Receber' ? current.receivable.amountCents : current.payable.amountCents)}</td></tr></tfoot></table></div>}
    </section>}
    {current && <p className="arena-hint">Consulta das contas: {dateTime(current.readAtUtc)} · {current.registeredEntries} lançamento(s) no Financeiro.{current.lastRecordChangeAtUtc ? ` Última alteração registrada: ${dateTime(current.lastRecordChangeAtUtc)}.` : ' Nenhum lançamento registrado.'}</p>}
    <p className="arena-hint">Os valores mostram apenas o que foi registrado neste sistema. Financeiro, comandas, caixa físico e carteira EDI são fontes separadas e não são somados como saldo bancário.</p>
  </>
}
