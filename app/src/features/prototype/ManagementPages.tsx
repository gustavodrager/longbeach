import { Link, useParams, useSearchParams } from 'react-router-dom'
import { usePrototype } from './PrototypeProvider'
import { EmptyState, Icon, Notice, PageHeader, Status } from './components'
import { accountTotals, actorNames, availableStock, getReport, money } from './model'
import type { Consumption, Metric, Payment, Report } from './types'

const zone = 'America/Sao_Paulo'
const metrics: Metric[] = ['consumed', 'received', 'refunds', 'fees', 'receivable', 'pending', 'lowStock', 'cash', 'differences', 'requests']
const nowMetrics: Metric[] = ['receivable', 'requests', 'pending', 'lowStock', 'cash']
const periodMetrics: Metric[] = ['consumed', 'received', 'refunds', 'fees', 'differences']
const metricLabels: Record<Metric, string> = {
  consumed: 'Consumo registrado', received: 'Recebimentos confirmados', refunds: 'Estornos registrados', fees: 'Taxas de pagamento',
  receivable: 'Falta receber', pending: 'Pix aguardando confirmação', lowStock: 'Estoque baixo', cash: 'Dinheiro nos caixas abertos',
  differences: 'Diferenças de caixa', requests: 'Itens esperando a equipe',
}
const phases = {
  agenda: { number: 2, title: 'Agenda e recepção', description: 'Uma agenda para quadras, reservas e chegada de clientes.', items: ['Agenda por quadra e horário', 'Reservas, grupos recorrentes e bloqueios', 'Chegada de clientes na recepção', 'Horas reservadas e disponíveis', 'Capacidade compartilhada com as aulas'] },
  escola: { number: 3, title: 'Escola', description: 'Acompanhar alunos, aulas e mensalidades com registros próprios.', items: ['Alunos e matrículas', 'Turmas e vagas disponíveis', 'Presença e frequência', 'Mensalidades e recebimentos', 'Valores vencidos com origem identificada'] },
  financeiro: { number: 4, title: 'Financeiro operacional', description: 'Entender os valores previstos e realizados de cada área.', items: ['Contas a receber e a pagar', 'Recebimentos e despesas', 'Fluxo de caixa previsto', 'Origem em Bar, Escola ou Locações', 'Detalhes de cada lançamento'] },
  equipe: { number: 5, title: 'Equipe e infraestrutura', description: 'Organizar responsáveis, tarefas e manutenção da arena.', items: ['Fichas de equipe e responsáveis', 'Projetos e tarefas', 'Manutenção da infraestrutura', 'Materiais da arena', 'Pendências com prazo e responsável'] },
}

function localDay() { return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
function validDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00-03:00`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
function shortDay(day: string) { return new Intl.DateTimeFormat('pt-BR', { timeZone: zone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${day}T12:00:00-03:00`)) }
function time(value?: string) { return value ? new Intl.DateTimeFormat('pt-BR', { timeZone: zone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Ainda não confirmado' }
function actor(value: string) { return actorNames[value as keyof typeof actorNames] ?? (value === 'client' || value === 'selfservice' ? 'Cliente por QR' : 'Cliente') }
function value(report: Report) { return report.unit === 'money' ? money(report.value) : report.value.toLocaleString('pt-BR') }
function paymentName(payment: Payment) { return { cash: 'Dinheiro', card: 'Cartão', pix: 'Pix' }[payment.method] }
function paymentStatus(payment: Payment) { return <Status tone={payment.state === 'approved' ? 'success' : payment.state === 'declined' ? 'danger' : 'warning'}>{payment.state === 'approved' ? 'Confirmado' : payment.state === 'declined' ? 'Não confirmado' : 'Esperando confirmação'}</Status> }
function consumptionStatus(item: Consumption) {
  const labels = { requested: 'Esperando a equipe confirmar', accepted: 'Em preparo / a entregar', fulfilled: 'Entregue', rejected: 'Recusado', reversed: 'Consumo corrigido' }
  return <Status tone={item.status === 'fulfilled' ? 'success' : item.status === 'requested' || item.status === 'accepted' ? 'warning' : item.status === 'rejected' ? 'danger' : 'neutral'}>{labels[item.status]}</Status>
}

function usePeriod() {
  const [params, setParams] = useSearchParams()
  const from = validDay(params.get('from')) ? params.get('from')! : localDay()
  const to = validDay(params.get('to')) ? params.get('to')! : localDay()
  const query = new URLSearchParams(params); query.set('from', from); query.set('to', to)
  const update = (key: string, next: string) => { const updated = new URLSearchParams(query); updated.set(key, next); updated.delete('page'); setParams(updated) }
  return { params, setParams, from, to, query, update, invalid: from > to, label: `${shortDay(from)} a ${shortDay(to)}` }
}
function PeriodFilter({ period }: { period: ReturnType<typeof usePeriod> }) {
  return <div className="ux-period-filter" aria-label="Período dos resultados">
    <label className="ux-field">De<input type="date" value={period.from} onChange={event => period.update('from', event.target.value)} /></label>
    <label className="ux-field">Até<input type="date" value={period.to} onChange={event => period.update('to', event.target.value)} /></label>
    <span className="ux-note">Horário de Brasília · datas incluídas</span>
  </div>
}
function recordBack(period: ReturnType<typeof usePeriod>) {
  const metric = period.params.get('metric')
  const query = new URLSearchParams(period.query); query.delete('metric')
  return `${metric && metrics.includes(metric as Metric) ? `/prototipo/gestao/detalhes/${metric}` : '/prototipo/gestao'}?${query}`
}
function MetricCard({ metric, report, query, periodLabel, updatedAt }: { metric: Metric; report: Report; query: URLSearchParams; periodLabel: string; updatedAt: string }) {
  return <Link to={`/prototipo/gestao/detalhes/${metric}?${query}`} className="ux-metric-card ux-panel">
    <span className="ux-metric-label">{metricLabels[metric]}</span><strong className="ux-amount">{value(report)}</strong>
    <span className="ux-note">{report.current ? 'Agora' : periodLabel}{report.unit === 'count' ? ' · quantidade' : ''}</span>
    <span className="ux-note">Atualizado às {updatedAt}</span>
    <span className="ux-card-link">Ver detalhes <Icon name="arrow" /></span>
  </Link>
}

export function ManagementPage() {
  const { state } = usePrototype(); const period = usePeriod()
  const updated = time(new Date().toISOString())
  return <section className="ux-page">
    <PageHeader eyebrow="Visão da arena" title="Tudo em um só lugar" description="Veja o que precisa da equipe e acompanhe os resultados do bar." />
    <section aria-labelledby="attention-title">
      <div className="ux-section-heading"><h2 id="attention-title">Atenção agora</h2><span className="ux-note">Agora · atualizado em {updated}</span></div>
      <div className="ux-metric-grid">{nowMetrics.map(metric => <MetricCard key={metric} metric={metric} report={getReport(state, metric, period.from, period.to)} query={period.query} periodLabel={period.label} updatedAt={updated.slice(-5)} />)}</div>
    </section>
    <section aria-labelledby="results-title">
      <div className="ux-section-heading"><h2 id="results-title">Resultados no período</h2><span className="ux-note">Atualizado em {updated}</span></div>
      <PeriodFilter period={period} /><Notice error={period.invalid ? 'A data final precisa ser igual ou posterior à data inicial.' : undefined} />
      {!period.invalid && <div className="ux-metric-grid">{periodMetrics.map(metric => <MetricCard key={metric} metric={metric} report={getReport(state, metric, period.from, period.to)} query={period.query} periodLabel={period.label} updatedAt={updated.slice(-5)} />)}</div>}
      <p className="ux-note">Consumo mostra o que foi aceito. Recebimentos mostram pagamentos confirmados; estornos são apresentados separadamente. Estes valores não representam saldo bancário.</p>
    </section>
    <section aria-labelledby="areas-title">
      <div className="ux-section-heading"><h2 id="areas-title">Áreas da arena</h2><span className="ux-note">Evolução por fases</span></div>
      <div className="ux-area-grid">
        <Link to={`/prototipo/gestao/detalhes/receivable?${period.query}`} className="ux-card ux-panel"><Status tone="success">Fase 1 · No protótipo</Status><h3>Bar e caixa</h3><p>Comandas, pedidos, recebimentos, estoque do bar e caixas.</p><span className="ux-actions">Ver detalhes <Icon name="arrow" /></span></Link>
        {Object.entries(phases).map(([id, phase]) => <Link className="ux-card ux-panel" key={id} to={`/prototipo/gestao/fases/${id}?${period.query}`}><Status tone="neutral">Fase {phase.number} · Ainda não disponível</Status><h3>{phase.title}</h3><p>{phase.description}</p><span className="ux-actions">Conhecer a próxima fase <Icon name="arrow" /></span></Link>)}
      </div>
    </section>
  </section>
}

export function ReportPage() {
  const { metric: rawMetric } = useParams(); const { state } = usePrototype(); const period = usePeriod()
  if (!rawMetric || !metrics.includes(rawMetric as Metric)) return <section className="ux-page"><PageHeader title="Indicador não encontrado" backTo="/prototipo/gestao" /><EmptyState title="Escolha um indicador do início" description="O endereço não corresponde a um relatório disponível." /></section>
  const metric = rawMetric as Metric; const report = getReport(state, metric, period.from, period.to)
  const pages = Math.max(1, Math.ceil(report.rows.length / 10)); const rawPage = Number(period.params.get('page') ?? '1')
  const page = Math.min(pages, Math.max(1, Number.isInteger(rawPage) ? rawPage : 1)); const rows = report.rows.slice((page - 1) * 10, page * 10)
  const recordQuery = new URLSearchParams(period.query); recordQuery.set('metric', metric); recordQuery.set('page', String(page))
  const pageLink = (next: number) => { const query = new URLSearchParams(period.query); query.set('page', String(next)); return `?${query}` }
  return <section className="ux-page">
    <PageHeader eyebrow="Detalhes do indicador" title={metricLabels[metric]} description={report.current ? 'Situação atual, independentemente do período de resultados.' : period.label} backTo={`/prototipo/gestao?${period.query}`} />
    {!report.current && <PeriodFilter period={period} />}
    <Notice error={!report.current && period.invalid ? 'A data final precisa ser igual ou posterior à data inicial.' : undefined} />
    {(report.current || !period.invalid) && <>
      <div className="ux-panel ux-summary"><span>{report.current ? 'Agora' : period.label}</span><strong className="ux-amount">{value(report)}</strong><p>{report.explanation}</p><span className="ux-note">Atualizado em {time(new Date().toISOString())} · {report.rows.length} registros</span></div>
      {rows.length === 0 ? <EmptyState title="Nenhum registro nesta seleção" description={report.current ? 'Não há ocorrências para este indicador agora.' : 'Escolha outro período para consultar os registros.'} /> : <div className="ux-panel ux-table-wrap"><table className="ux-table"><caption>Registros que compõem o indicador</caption><thead><tr><th scope="col">Registro</th><th scope="col">Data</th><th scope="col">{report.unit === 'money' ? 'Valor' : 'Quantidade'}</th><th scope="col">Detalhes</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><strong>{row.label}</strong><p className="ux-note">{row.detail}</p></td><td>{time(row.date)}</td><td>{row.amountCents !== undefined ? money(row.amountCents) : (row.count ?? 1).toLocaleString('pt-BR')}</td><td><Link className="ux-button secondary" to={`${row.href}${row.href.includes('?') ? '&' : '?'}${recordQuery}`}>Abrir registro <Icon name="arrow" /></Link></td></tr>)}</tbody></table></div>}
      {pages > 1 && <nav aria-label="Páginas dos registros" className="ux-pagination">{page > 1 ? <Link className="ux-button secondary" to={pageLink(page - 1)}>Anterior</Link> : <button className="ux-button secondary" disabled>Anterior</button>}<span>Página {page} de {pages} · {report.rows.length} registros no total</span>{page < pages ? <Link className="ux-button secondary" to={pageLink(page + 1)}>Próxima</Link> : <button className="ux-button secondary" disabled>Próxima</button>}</nav>}
    </>}
  </section>
}

export function ManagementRecordPage() {
  const { accountId, paymentId, sessionId, productId } = useParams(); const { state } = usePrototype(); const period = usePeriod()
  const backTo = recordBack(period); const query = period.query
  const account = state.accounts.find(item => item.id === accountId)
  const payment = state.payments.find(item => item.id === paymentId)
  const cash = state.cashSessions.find(item => item.id === sessionId)
  const product = state.products.find(item => item.id === productId)
  const accountHref = (id: string) => `/prototipo/gestao/comandas/${id}?${query}`
  if (account) {
    const totals = accountTotals(state, account.id); const items = state.consumptions.filter(item => item.accountId === account.id)
    const payments = state.payments.filter(item => item.accountId === account.id)
    return <section className="ux-page"><PageHeader eyebrow="Registro original · Comanda" title={`Comanda ${account.number}`} description={`${account.name || 'Visitante'} · aberta em ${time(account.createdAt)}`} backTo={backTo}><Status tone={account.state === 'open' ? 'warning' : 'neutral'}>{account.state === 'open' ? 'Aberta' : 'Fechada'}</Status></PageHeader>
      <div className="ux-metric-grid">{[['Total', totals.totalCents], ['Já pago', totals.paidCents], ['Pagamento pendente', totals.pendingCents], ['Falta pagar', totals.dueCents]].map(([label, cents]) => <div className="ux-panel" key={label}><span>{label}</span><strong className="ux-amount">{money(Number(cents))}</strong></div>)}</div>
      <section className="ux-panel"><h2>Histórico do consumo</h2><p className="ux-note">Pedidos esperando a equipe, recusados ou corrigidos não compõem o total cobrável.</p>{items.length ? <div className="ux-timeline">{items.map(item => <article className="ux-list-row" key={item.id}><div><strong>{item.quantity} × {item.name}</strong><p>Origem: {item.source === 'selfservice' ? 'Cliente por QR' : 'Atendimento'} · {time(item.createdAt)}</p><p className="ux-note">Responsável registrado: {actor(item.actorId)}</p>{item.acceptedAt && <p className="ux-note">Aceito em {time(item.acceptedAt)}</p>}{item.fulfilledAt && <p className="ux-note">Entregue em {time(item.fulfilledAt)}</p>}{item.reason && <p className="ux-note">Motivo: {item.reason}</p>}</div><div><strong>{money(item.quantity * item.priceCents)}</strong>{consumptionStatus(item)}</div></article>)}</div> : <EmptyState title="Sem consumo registrado" description="Esta comanda ainda não recebeu itens." />}</section>
      <section className="ux-panel"><h2>Pagamentos da comanda</h2>{payments.length ? payments.map(item => <Link className="ux-list-row" key={item.id} to={`/prototipo/gestao/pagamentos/${item.id}?${query}`}><div><strong>{paymentName(item)} · {money(item.amountCents)}</strong><p>{actor(item.actorId)} · {time(item.createdAt)}</p>{item.refundedCents > 0 && <p>Estornado: {money(item.refundedCents)}</p>}</div><div>{paymentStatus(item)}<span>Ver comprovante <Icon name="arrow" /></span></div></Link>) : <EmptyState title="Nenhum pagamento" description="Consumo e pagamento são registrados separadamente." />}</section>
    </section>
  }
  if (payment) {
    const owner = state.accounts.find(item => item.id === payment.accountId)
    const refunds = state.refunds.filter(item => item.paymentId === payment.id)
    return <section className="ux-page"><PageHeader eyebrow="Registro original · Pagamento" title={`${paymentName(payment)} · ${money(payment.amountCents)}`} description={`Comanda ${owner?.number ?? '—'} · ${time(payment.createdAt)}`} backTo={backTo}>{paymentStatus(payment)}</PageHeader>
      <section className="ux-panel"><h2>Comprovante do pagamento</h2><dl className="ux-summary"><dt>Referência</dt><dd>{payment.id}</dd><dt>Responsável / origem</dt><dd>{actor(payment.actorId)}</dd><dt>Valor confirmado</dt><dd>{money(payment.state === 'approved' ? payment.amountCents : 0)}</dd><dt>Confirmado em</dt><dd>{time(payment.confirmedAt)}</dd>{payment.method === 'cash' && <><dt>Dinheiro entregue</dt><dd>{money(payment.tenderedCents)}</dd><dt>Troco</dt><dd>{money(payment.changeCents)}</dd></>}<dt>Estornos</dt><dd>{money(payment.refundedCents)}</dd><dt>Taxas registradas</dt><dd>{money(payment.feeCents)}</dd></dl>
        {payment.method === 'pix' && <p className="ux-note">Confirmação do provedor simulada neste protótipo. Um Pix pendente não é um recebimento confirmado.</p>}
        <p className="ux-note">Estes valores são registros operacionais; não representam saldo bancário.</p><Link className="ux-button secondary" to={accountHref(payment.accountId)}>Ver comanda <Icon name="arrow" /></Link>{payment.cashSessionId && <Link className="ux-button secondary" to={`/prototipo/gestao/caixas/${payment.cashSessionId}?${query}`}>Ver caixa do recebimento</Link>}
      </section>{refunds.length > 0 && <section className="ux-panel"><h2>Histórico dos estornos</h2>{refunds.map(refund => <div key={refund.id} className="ux-list-row"><div><strong>{refund.reason}</strong><p>{time(refund.createdAt)}</p></div><strong>{money(refund.amountCents)}</strong></div>)}</section>}
    </section>
  }
  if (cash) {
    const movements = state.cashMovements.filter(item => item.sessionId === cash.id)
    const names = { opening: 'Abertura', payment: 'Recebimento em dinheiro', supply: 'Dinheiro colocado', withdraw: 'Dinheiro retirado', refund: 'Estorno em dinheiro' }
    return <section className="ux-page"><PageHeader eyebrow="Registro original · Caixa" title={`Caixa de ${actor(cash.actorId)}`} description={`Aberto em ${time(cash.createdAt)}${cash.closedAt ? ` · fechado em ${time(cash.closedAt)}` : ''}`} backTo={backTo}><Status tone={cash.state === 'open' ? 'success' : 'neutral'}>{cash.state === 'open' ? 'Aberto' : 'Fechado'}</Status></PageHeader>
      <div className="ux-metric-grid"><div className="ux-panel"><span>Abertura</span><strong className="ux-amount">{money(cash.openingCents)}</strong></div><div className="ux-panel"><span>Dinheiro esperado</span><strong className="ux-amount">{money(cash.expectedCents)}</strong></div>{cash.countedCents !== undefined && <div className="ux-panel"><span>Dinheiro contado</span><strong className="ux-amount">{money(cash.countedCents)}</strong></div>}{cash.differenceCents !== undefined && <div className="ux-panel"><span>Diferença no fechamento</span><strong className="ux-amount">{money(cash.differenceCents)}</strong><Status tone={cash.differenceCents === 0 ? 'success' : 'warning'}>{cash.differenceCents === 0 ? 'Conferido' : 'Revisar com supervisor'}</Status></div>}</div>
      {cash.reason && <p className="ux-panel">Motivo registrado: {cash.reason}</p>}<section className="ux-panel"><h2>Movimentos em dinheiro</h2><p className="ux-note">Pix e cartão não entram no dinheiro físico deste caixa.</p>{movements.map(item => <div className="ux-list-row" key={item.id}><div><strong>{names[item.kind]}</strong><p>{time(item.createdAt)} · {item.reason}</p>{item.originId && state.payments.some(p => p.id === item.originId) && <Link to={`/prototipo/gestao/pagamentos/${item.originId}?${query}`}>Ver pagamento de origem</Link>}</div><strong>{item.kind === 'withdraw' || item.kind === 'refund' ? '−' : '+'} {money(item.amountCents)}</strong></div>)}</section>
    </section>
  }
  if (product) {
    const delivered = state.consumptions.filter(item => item.productId === product.id && item.fulfilledAt)
    const stock = availableStock(state, product.id)
    return <section className="ux-page"><PageHeader eyebrow="Registro original · Estoque do bar" title={product.name} description={product.description} backTo={backTo} />
      <div className="ux-metric-grid"><div className="ux-panel"><span>Disponível agora</span><strong className="ux-amount">{stock} unidades</strong><Status tone={stock <= product.minimum ? 'warning' : 'success'}>{stock <= product.minimum ? 'Repor estoque' : 'Estoque suficiente'}</Status></div><div className="ux-panel"><span>Estoque mínimo</span><strong className="ux-amount">{product.minimum} unidades</strong></div><div className="ux-panel"><span>Preço de venda</span><strong className="ux-amount">{money(product.priceCents)}</strong></div><div className="ux-panel"><span>Custo unitário demonstrativo</span><strong className="ux-amount">{money(product.costCents)}</strong></div></div>
      <section className="ux-panel"><h2>Entregas registradas</h2><p className="ux-note">Dados locais de demonstração. A entrega dá baixa uma vez; aceitar um pedido ou receber seu pagamento não dá uma nova baixa. Este histórico não substitui o inventário e o registro completo de movimentos da operação real.</p>{delivered.length ? delivered.map(item => <Link className="ux-list-row" key={item.id} to={accountHref(item.accountId)}><div><strong>{item.quantity} × {item.name}</strong><p>{time(item.fulfilledAt)} · {item.source === 'selfservice' ? 'Pedido por QR' : actor(item.actorId)}</p>{consumptionStatus(item)}</div><span>Ver comanda <Icon name="arrow" /></span></Link>) : <EmptyState title="Sem entregas registradas" description="Os saldos iniciais são exemplos do protótipo." />}</section>
    </section>
  }
  return <section className="ux-page"><PageHeader title="Registro não encontrado" backTo={backTo} /><EmptyState title="Este registro não está disponível" description="Volte ao indicador para escolher um dos registros atuais." /></section>
}

export function RoadmapPage() {
  const { phase } = useParams(); const period = usePeriod(); const info = phase && Object.hasOwn(phases, phase) ? phases[phase as keyof typeof phases] : undefined
  return <section className="ux-page"><PageHeader eyebrow={info ? `Evolução da arena · Fase ${info.number}` : 'Evolução da arena'} title={info?.title ?? 'Fase não encontrada'} description={info?.description} backTo={`/prototipo/gestao?${period.query}`} />
    <section className="ux-panel"><Status tone="neutral">Ainda não disponível</Status><h2>{info ? 'O que esta fase vai reunir' : 'Escolha uma área no início'}</h2>{info && <ul>{info.items.map(item => <li key={item}>{item}</li>)}</ul>}<p>Os indicadores serão apresentados quando houver registros confiáveis e links para seus detalhes. Nenhum resultado desta área está sendo estimado no protótipo.</p></section>
  </section>
}
