import { useQueries } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { isManagement } from '../auth/access'
import { dateTime, money, type TabReport } from '../attendance/api'
import { centsMoney } from './financialHistoryApi'
import { Disclosure, ModalPanel } from '../../components/managementUi'
import { useFinancialPosition } from './financialBalancesApi'

const barMetrics = [
  { metric: 'receivable', title: 'Comandas · falta receber', empty: 'Nenhuma comanda com saldo a receber registrada.', note: 'Comandas abertas registradas no Long Beach OS. Inclui Pix ainda sem confirmação.' },
  { metric: 'cash', title: 'Dinheiro nos caixas abertos', empty: 'Nenhum caixa aberto registrado.', note: 'Dinheiro físico esperado, com fundo e movimentos. Pix e cartão ficam fora deste valor.' },
]
async function loadBarPosition(metric: string) {
  const result = await apiFetch<TabReport>(`/api/v1/bar/tabs/reports/${metric}?pageSize=1`)
  if (!result?.rows || !Number.isFinite(result.value) || !result.updatedAtUtc) throw new Error('Posição do bar incompleta.')
  return result
}

export function CurrentFinancialMetrics({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth()
  const [details, setDetails] = useState<'Receber' | 'Pagar' | null>(null)
  const allowed = isManagement(user)
  const position = useFinancialPosition()
  const bar = useQueries({ queries: barMetrics.map(({ metric }) => ({ queryKey: ['bar-runtime', user?.id, `/tabs/reports/${metric}`], queryFn: () => loadBarPosition(metric), enabled: allowed })) })
  if (!allowed) return null
  const current = position.isError ? undefined : position.data
  const amount = (value?: number) => position.isError ? 'Falha na atualização' : position.isPending ? 'Carregando…' : value == null ? 'Ainda não disponível' : centsMoney(value)
  const refreshing = position.isFetching || bar.some(query => query.isFetching)
  const update = () => { void Promise.allSettled([position.refetch(), ...bar.map(query => query.refetch())]) }
  return <>
    {!compact && <div className="arena-section-heading"><div><h3>Registrado no Long Beach OS</h3><p>Contas e caixas mostram os registros do Long Beach. A atualização é manual. Extratos, movimentos e saldos bancários são atualizados por importação de arquivos.</p></div><button type="button" className="secondary-link" onClick={update} disabled={refreshing}>{refreshing ? 'Atualizando…' : 'Atualizar agora'}</button></div>}
    {position.isError && <p role="alert">Não foi possível atualizar as contas internas. Consulte novamente antes de usar os valores.</p>}
    <div className="arena-metric-grid arena-financial-grid">
      {(['receivable', 'payable'] as const).map(key => {
        const entry = current?.[key]
        const receivable = key === 'receivable'
        const direction = receivable ? 'Receber' : 'Pagar'
        return <button type="button" key={key} className="arena-metric" style={{ textAlign: 'left' }} aria-haspopup="dialog" aria-expanded={details === direction} aria-controls="current-financial-details" onClick={() => setDetails(details === direction ? null : direction)}>
          <span className="arena-metric-label">{receivable ? 'A receber · financeiro' : 'A pagar · financeiro'}</span><strong>{amount(entry?.amountCents)}</strong>
          <small>{compact ? 'Saldo pendente · todos os vencimentos' : 'Pendências registradas · todos os vencimentos'}</small>
          {entry && <small>{entry.records ? `${entry.records} conta(s) pendente(s) · ${entry.overdueRecords} vencida(s): ${centsMoney(entry.overdueCents)}` : 'Nenhuma conta com saldo pendente registrada.'}</small>}
          {!compact && receivable && <small>Pagamentos confirmados já descontados; estornos confirmados reabrem o saldo. Pix pendente ainda não é recebimento.</small>}
          {!compact && entry && entry.confirmedPaymentsCents > 0 && <small>Descontados: {centsMoney(entry.confirmedPaymentsCents)} em pagamentos líquidos confirmados.</small>}
          <span className="arena-link-label">{receivable ? 'Conferir contas a receber' : 'Conferir contas a pagar'} <span aria-hidden="true">→</span></span>
        </button>
      })}
      {barMetrics.map(({ metric, title, empty, note }, index) => {
        const query = bar[index]
        const report = query.isError ? undefined : query.data
        const available = report && report.available !== false
        return <Link key={metric} className="arena-metric" to={`/bar/indicadores/${metric}`}>
          <span className="arena-metric-label">{title}</span><strong>{query.isError ? 'Falha na atualização' : query.isPending ? 'Carregando…' : available ? money(report.value) : 'Ainda não disponível'}</strong>
          <small>{compact ? metric === 'cash' ? 'Dinheiro físico esperado · sem Pix e cartão' : 'Comandas abertas · inclui Pix sem confirmação' : note}</small>
          {available && <small>{report.rows.total ? `${report.rows.total} registro(s) nesta consulta.` : empty}</small>}
          {!compact && report && <small>Consulta: {dateTime(report.updatedAtUtc)}</small>}
          <span className="arena-link-label">{compact ? metric === 'cash' ? 'Conferir caixas →' : 'Conferir comandas →' : 'Conferir origem →'}</span>
        </Link>
      })}
    </div>
    {details && <ModalPanel title={`${details === 'Receber' ? 'Contas a receber' : 'Contas a pagar'} · composição do saldo`} onClose={() => setDetails(null)} className="dashboard-balance-details"><div id="current-financial-details" className="editor-body">
      <p className="arena-hint">Valor original menos os pagamentos líquidos confirmados = saldo pendente. Estornos já estão descontados dos pagamentos; Pix sem confirmação permanece pendente.</p>
      {!current ? <p role="status">Atualize as contas para conferir os saldos pendentes.</p> : current.entries.filter(entry => entry.direction === details).length === 0 ? <p>Nenhuma conta com saldo pendente registrada.</p> : <div className="responsive-records"><table aria-label="Composição do saldo pendente"><thead><tr><th scope="col">Lançamento</th><th scope="col">Vencimento</th><th scope="col">Valor original</th><th scope="col">Pagamentos líquidos</th><th scope="col">Saldo pendente</th></tr></thead><tbody>{current.entries.filter(entry => entry.direction === details).map(entry => <tr key={entry.id}><td data-label="Lançamento"><Link to={entry.managedExpense ? `/financeiro/despesas?acao=ver&registro=${encodeURIComponent(entry.id)}` : `/financeiro/${entry.id}`}>{entry.name}</Link></td><td data-label="Vencimento">{entry.hasDueDate === false ? 'Sem prazo' : <>{entry.dueDate.split('-').reverse().join('/')}{entry.dueDate < current.date ? ' · vencido' : ''}</>}</td><td data-label="Valor original">{centsMoney(entry.originalCents)}</td><td data-label="Pagamentos líquidos">{centsMoney(entry.confirmedPaymentsCents)}</td><td data-label="Saldo pendente">{centsMoney(entry.outstandingCents)}</td></tr>)}</tbody><tfoot><tr><th scope="row" colSpan={4}>Total pendente</th><td>{centsMoney(details === 'Receber' ? current.receivable.amountCents : current.payable.amountCents)}</td></tr></tfoot></table></div>}
    </div></ModalPanel>}
    <Disclosure title="Fontes e atualização dos valores" open={!compact}>
    {compact && <p className="arena-hint">Contas e caixas mostram os registros do Long Beach. A atualização é manual. Extratos, movimentos e saldos bancários são atualizados por importação de arquivos.</p>}
    <p className="arena-hint">Os saldos a receber e a pagar descontam pagamentos confirmados. Estornos confirmados reabrem o saldo; Pix pendente ainda não é recebimento.</p>
    {current && <p className="arena-hint">Consulta das contas: {dateTime(current.readAtUtc)} · {current.registeredEntries} lançamento(s) no Financeiro.{current.lastRecordChangeAtUtc ? ` Última alteração registrada: ${dateTime(current.lastRecordChangeAtUtc)}.` : ' Nenhum lançamento registrado.'}</p>}
    <p className="arena-hint">Os valores mostram apenas o que foi registrado neste sistema. Financeiro, comandas, caixa físico e carteira EDI são fontes separadas e não são somados como saldo bancário.</p>
    </Disclosure>
  </>
}
