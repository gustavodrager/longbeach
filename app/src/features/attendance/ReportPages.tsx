import { Disclosure, RecordTable } from '../../components/managementUi'
import { reportPeriod, reportPeriodError } from './reportPeriod'
import { StockValuation } from '../bar/StockValuation'
import { useState, type ReactNode } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { BarFrame, LoadState } from './Core'
import { Heading, displayDate, quantity } from '../../pages/arenaUi'
import '../prototype/prototype.css'
import './attendance.css'
import './reports.css'
import { Feedback, Header, ItemStatus, PaymentStatus, Summary } from './components'
import { dateTime, money, parseAmount, paymentLabels, postBar, useBarCommand, useBarData, useIntent, type PageResult, type Tab, type TabReport, type TabReportRow } from './api'
const currentMetrics = [['open-tabs', 'Comandas abertas'], ['orders', 'Pedidos aguardando equipe'], ['pending-payments', 'Pagamentos pendentes'], ['low-stock', 'Estoque baixo'], ['cash', 'Dinheiro nos caixas']]
const periodMetrics = [['consumption', 'Consumo confirmado'], ['received', 'Recebimentos confirmados'], ['refunds', 'Estornos confirmados'], ['fees', 'Taxas conciliadas'], ['cash-differences', 'Diferenças de caixa']]
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
function ReportFrame({ children }: { children: ReactNode }) {
  return <main className="operation-page arena-page bar-reports">{children}</main>
}
function periodLabel(params: URLSearchParams) {
  const from = params.get('de') || today(), to = params.get('ate') || from
  return from === to ? displayDate(from) : `${displayDate(from)} a ${displayDate(to)}`
}
function PeriodFilter() {
  const [params, setParams] = useSearchParams()
  return <form className="arena-toolbar bar-report-period" aria-label="Período dos indicadores" key={`${params.get('de')}:${params.get('ate')}`} onSubmit={event => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setParams({ de: String(form.get('de')), ate: String(form.get('ate')) })
  }}>
    <label className="operation-field">De<input required name="de" type="date" defaultValue={params.get('de') || today()} /></label>
    <label className="operation-field">Até<input required name="ate" type="date" defaultValue={params.get('ate') || params.get('de') || today()} /></label>
    <button className="primary-button">Aplicar período</button>
    <span className="arena-hint">Horário de Brasília<br />Datas inicial e final incluídas</span>
  </form>
}
export function BarOverviewPage() {
  const [params] = useSearchParams(); const { user } = useAuth(); const period = reportPeriod(params); const periodError = reportPeriodError(params)
  const metrics = [...currentMetrics, ...periodMetrics]
  const queries = useQueries({ queries: metrics.map(([metric]) => ({ queryKey: ['bar-runtime', user?.id, `/tabs/reports/${metric}?${period}`], queryFn: () => apiFetch<TabReport>(`/api/v1/bar/tabs/reports/${metric}?${period}&pageSize=1`), enabled: Boolean(user) && !periodError, refetchInterval: 30_000 })) })
  const cards = (entries: string[][], current: boolean) => <div className="arena-metric-grid bar-report-metrics">{entries.map(([metric, title]) => {
    const query = queries[metrics.findIndex(row => row[0] === metric)], report = query.data
    const available = report && report.available !== false
    return <Link className={`arena-metric ${available ? '' : 'arena-metric-unavailable'}`} key={metric} to={`/bar/indicadores/${metric}?${params}`}>
      <span className="arena-metric-label">{title}</span>
      <strong>{available ? report.unit === 'money' ? money(report.value) : quantity(report.value) : query.isLoading ? 'Carregando…' : 'Ainda não disponível'}</strong>
      <small>{current ? 'Agora' : periodLabel(params)}</small>
      <small className="arena-metric-update">{query.isError ? 'Não foi possível atualizar. Confira os detalhes.' : report ? `Atualizado: ${dateTime(report.updatedAtUtc)}` : 'Aguardando dados'}</small>
      <span className="arena-link-label">Ver detalhes <span aria-hidden="true">→</span></span>
    </Link>
  })}</div>
  return <ReportFrame>
    <Heading eyebrow="Gestão do bar" title="Resumo do bar" description="Acompanhe as comandas, os recebimentos e o que precisa de atenção." />
    <StockValuation />
    <PeriodFilter />
    {periodError ? <p className="arena-message arena-error" role="alert">{periodError}</p> : <>
      <section className="arena-dashboard-section" aria-labelledby="bar-attention">
        <div className="arena-section-heading"><div><p className="arena-section-eyebrow">01 · Operação atual</p><h2 id="bar-attention">Atenção agora</h2></div><p>Situação atual, independente do período</p></div>
        {cards(currentMetrics, true)}
      </section>
      <section className="arena-dashboard-section" aria-labelledby="bar-results">
        <div className="arena-section-heading"><div><p className="arena-section-eyebrow">02 · Acompanhar resultados</p><h2 id="bar-results">Resultados no período</h2></div><p>{periodLabel(params)}</p></div>
        {cards(periodMetrics, false)}
      </section>
    </>}
    <section className="operation-card bar-report-records" aria-labelledby="bar-records">
      <h2 id="bar-records">Conferir os registros</h2>
      <div className="arena-actions"><Link className="secondary-link" to="/atendimento/comandas">Comandas →</Link><Link className="secondary-link" to="/bar/vendas">Vendas históricas →</Link><Link className="secondary-link" to="/bar/estoque">Estoque do bar →</Link><Link className="secondary-link" to="/bar/caixa">Caixas da equipe →</Link></div>
      <p className="arena-hint">Fonte: comandas do Long Beach OS. Vendas anteriores estão no histórico. Consumo, recebimentos e dinheiro nos caixas têm registros próprios.</p>
      <Disclosure title="Como interpretar os indicadores"><p>O período selecionado se aplica aos resultados. Comandas abertas, pedidos, pagamentos pendentes, estoque e dinheiro nos caixas mostram a situação atual.</p><p>Valores indisponíveis dependem de registros ou conciliação. Dinheiro nos caixas representa o controle do bar; consulte o saldo bancário e sua data de atualização na página inicial.</p></Disclosure>
    </section>
  </ReportFrame>
}
export function BarReportPage() {
  const { metric = '' } = useParams(); const [params, setParams] = useSearchParams(); const location = useLocation(); const page = Math.max(1, Number(params.get('pagina')) || 1)
  const periodError = reportPeriodError(params); const query = useBarData<TabReport>(`/tabs/reports/${encodeURIComponent(metric)}?${reportPeriod(params)}&page=${page}&pageSize=20`, !periodError); const report = periodError ? undefined : query.data
  const changePage = (number: number) => { const next = new URLSearchParams(params); next.set('pagina', String(number)); setParams(next) }
  const source = (row: TabReportRow) => `${row.resource === 'tab' ? `/atendimento/comandas/${row.resourceId}` : `/bar/registros/${row.resource}/${row.resourceId}`}?retorno=${encodeURIComponent(location.pathname + location.search)}`
  return <ReportFrame>
    <nav className="breadcrumb" aria-label="Retornar"><Link to={`/bar/indicadores?${params}`}>← Voltar ao resumo do bar</Link></nav>
    <Heading eyebrow="Indicadores do bar" title={report?.title || 'Detalhes do indicador'} description="Confira os registros que compõem este resultado." />
    <PeriodFilter />
    {periodError && <p className="arena-message arena-error" role="alert">{periodError}</p>}
    <LoadState query={query} />
    {report && <>
      <section className="operation-card bar-report-total" aria-label="Resumo do indicador">
        <div><span className="arena-hint">{report.current ? 'Situação atual' : periodLabel(params)}</span><strong className={report.available === false ? 'bar-report-unavailable' : ''}>{report.available === false ? 'Ainda não disponível' : report.unit === 'money' ? money(report.value) : quantity(report.value)}</strong></div>
        <div><p>{report.explanation}</p><p className="arena-hint">Atualizado: {dateTime(report.updatedAtUtc)}</p></div>
      </section>
      <section aria-labelledby="bar-report-rows"><div className="arena-section-heading"><h2 id="bar-report-rows">Registros do indicador</h2><p>{quantity(report.rows.total)} {report.rows.total === 1 ? 'registro' : 'registros'} nesta seleção</p></div>
        {report.rows.items.length ? <RecordTable label="Registros do indicador" columns={['Registro','Descrição','Data',report.unit==='money'?'Valor':'Quantidade','Detalhes']} rows={report.rows.items.map(row=>({key:row.id,cells:[row.label,row.detail,dateTime(row.date),report.unit==='money'?money(row.amount??0):row.count,<Link to={source(row)}>Abrir registro →</Link>]}))}/> : <div className="empty-state"><p>Nenhum registro neste filtro.</p></div>}
        {report.rows.total > report.rows.pageSize && <nav className="arena-pagination" aria-label="Páginas do indicador"><button className="secondary-link" disabled={page === 1} onClick={() => changePage(page - 1)}>Anterior</button><span>Página {page} · {report.rows.total} registros</span><button className="secondary-link" disabled={page * report.rows.pageSize >= report.rows.total} onClick={() => changePage(page + 1)}>Próxima</button></nav>}
      </section>
    </>}
  </ReportFrame>
}
type Source = { id: string; label: string; state: string; expected?: number; counted?: number; difference?: number; available?: number; rows: PageResult<{ id: string; label: string; detail: string; date: string; amount?: number; quantity?: number; originId?: string; originKind?: string }> }
export function BarSourcePage() {
  const { user } = useAuth(); const command = useBarCommand(); const { kind = '', resourceId = '' } = useParams(); const intent = useIntent(`reconcile:${resourceId}`); const [fee, setFee] = useState(''); const [reason, setReason] = useState(''); const [params, setParams] = useSearchParams(); const navigate = useNavigate()
  const page = Math.max(1, Number(params.get('pagina')) || 1); const back = ['/bar/indicadores', '/bar/registros/'].some(prefix => params.get('retorno')?.startsWith(prefix)) ? params.get('retorno')! : '/bar/indicadores'
  const payment = useBarData<Tab>(`/tabs/payments/${resourceId}`, kind === 'payment'); const source = useBarData<Source>(`/tabs/resources/${kind}/${resourceId}?page=${page}&pageSize=20`, kind !== 'payment')
  const tab = payment.data; const record = tab?.payments.find(row => row.id === resourceId)
  return <BarFrame><Header title={kind === 'payment' ? 'Pagamento' : source.data?.label || 'Registro original'} back={back} /><LoadState query={kind === 'payment' ? payment : source} /><Feedback {...command} />{tab && record && <><section className="ux-panel"><h2>Comanda {tab.number}</h2><strong className="ux-amount">{money(record.amount)}</strong><p>{paymentLabels[record.method]} · {dateTime(record.confirmedAtUtc ?? record.createdAtUtc)}</p><PaymentStatus payment={record} /><p>Pagamento: {record.id}</p><p>Taxa conciliada: {record.fee == null ? 'Ainda não disponível' : money(record.fee)}</p>{record.state === 'Approved' && user?.permissions.includes('bar:payments:reconcile') && <Disclosure title="Conciliação do pagamento"><form onSubmit={async event => { event.preventDefault(); const value = parseAmount(fee); if (!Number.isFinite(value) || value < 0 || value > record.amount) { command.setError('Confira a taxa conciliada.'); return } const result = await command.run(() => postBar(`/tabs/${tab.id}/payments/${record.id}/reconcile`, { operationId: intent('fee'), fee: value, reason })); if (result.ok) { intent('fee', true); setFee(''); setReason(''); command.setMessage('Taxa conciliada registrada.') } }}><h3>Conferir a taxa do pagamento</h3><label className="ux-field">Taxa no extrato (R$)<input required inputMode="decimal" value={fee} disabled={command.busy} onChange={event => { setFee(event.target.value); intent('fee', true) }} /></label><label className="ux-field">Referência / motivo<input required minLength={3} maxLength={500} value={reason} disabled={command.busy} onChange={event => { setReason(event.target.value); intent('fee', true) }} /></label><button className="ux-button secondary" disabled={command.busy}>Registrar conciliação</button></form></Disclosure>}{record.refunded > 0 && <p>Estornado: {money(record.refunded)}</p>}{record.refundPending > 0 && <p>Estorno aguardando confirmação: {money(record.refundPending)}</p>}<Summary tab={tab} /></section><section className="ux-panel"><h2>Itens da comanda</h2>{tab.items.map(item => <div className="ux-list-row" key={item.id}><strong>{item.quantity} × {item.name}</strong><ItemStatus item={item} /><span>{money(item.total)}</span>{item.recipeId && user?.permissions.includes('bar:catalog:write') && <Link to={`/bar/receitas/${item.productId}?version=${item.recipeId}`}>Ver ficha técnica · versão {item.recipeVersion}</Link>}</div>)}</section></>}{source.data && <><p>{source.data.state}</p><dl className="ux-summary">{source.data.expected != null && <div><dt>Esperado</dt><dd>{money(source.data.expected)}</dd></div>}{source.data.counted != null && <div><dt>Contado</dt><dd>{money(source.data.counted)}</dd></div>}{source.data.difference != null && <div><dt>Diferença</dt><dd>{money(source.data.difference)}</dd></div>}{source.data.available != null && <div><dt>Disponível agora</dt><dd>{source.data.available}</dd></div>}</dl>{source.data.rows.items.map(row => <article className="ux-panel" key={row.id}><h2>{row.label}</h2><p>{row.detail}</p><p>{dateTime(row.date)}</p>{row.amount != null && <strong>{money(row.amount)}</strong>}{row.quantity != null && <strong>Quantidade: {row.quantity}</strong>}{row.originKind === 'payment' && row.originId && <Link className="ux-button secondary" to={`/bar/registros/payment/${row.originId}?retorno=${encodeURIComponent(`/bar/registros/${kind}/${resourceId}?${params}`)}`}>Abrir pagamento original</Link>}</article>)}<div className="ux-pagination"><button className="ux-button secondary" disabled={page === 1} onClick={() => { params.set('pagina', String(page - 1)); setParams(params) }}>Anterior</button><span>{source.data.rows.total} registros</span><button className="ux-button secondary" disabled={page * source.data.rows.pageSize >= source.data.rows.total} onClick={() => { params.set('pagina', String(page + 1)); setParams(params) }}>Próxima</button></div></>}<button className="ux-button secondary" onClick={() => navigate(back)}>Voltar ao indicador</button></BarFrame>
}
