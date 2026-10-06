import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/authContext'
import { BarArenaMetrics } from '../features/attendance/BarArenaMetrics'
import { FinancialHistoryOverview } from '../features/finance/FinancialHistory'
import { ArenaHistoryOverview } from '../features/finance/ArenaHistoryOverview'
import { useCourtSchedule } from '../features/arena/queries'
import { useOperations, type OperationalKind } from '../features/operations/DemoDataProvider'
import { AreaIcon, Feedback, Field, Heading, currency, displayDate, quantity, today, useFilters, validDate, type AreaIconName } from './arenaUi'

function Metric({ label, value, to, period, updated, note, attention = false }: { label: string; value: string | null; to: string; period: string; updated: string; note?: string; attention?: boolean }) {
  return <Link className={`arena-metric ${attention && value !== null ? 'arena-metric-attention' : ''} ${value === null ? 'arena-metric-unavailable' : ''}`} to={to}>
    <span className="arena-metric-label">{attention && value !== null && <span className="arena-metric-symbol" aria-hidden="true">!</span>}{label}</span>
    <strong>{value ?? 'Ainda não disponível'}</strong>
    <small>{period}</small>
    {note && <small>{note}</small>}
    <small className="arena-metric-update">Atualizado: {value === null ? 'aguardando dados' : updated}</small>
    <span className="arena-link-label">Ver detalhes <span aria-hidden="true">→</span></span>
  </Link>
}
const formatUpdated = (value?: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Aguardando a fonte de dados'

export function DashboardPage() {
  const data = useOperations(); const { user } = useAuth(); const filters = useFilters(); const day = today()
  const from = filters.params.get('from') ?? day; const to = filters.params.get('to') ?? day; const schedule = useCourtSchedule(day)
  const demo = import.meta.env.VITE_DEMO_MODE === 'true'
  const barHref = demo ? '/prototipo/gestao' : user?.permissions.includes('bar:finance:read') ? linkBarPeriod('/bar/indicadores', from, to) : user?.permissions.includes('bar:sales:operate') ? '/atendimento/vender' : user?.permissions.includes('bar:stock:read') ? '/bar/estoque' : user?.permissions.includes('bar:supervise') ? '/bar/caixa' : user?.permissions.includes('bar:catalog:write') ? '/bar/produtos' : user?.permissions.includes('bar:sales:read') ? '/atendimento/comandas' : user?.permissions.includes('bar:cash:operate') ? '/atendimento/caixa' : null
  const valid = validDate(from) && validDate(to) && from <= to
  const loaded = data.dataUpdatedAt !== null && data.persistenceStatus !== 'connecting' && data.persistenceStatus !== 'error'
  const readable = (kind: OperationalKind) => data.canRead(kind) && loaded
  const count = (kind: OperationalKind, value: number) => readable(kind) ? value.toLocaleString('pt-BR') : null
  const cash = (value: number) => readable('financeEntries') ? currency(value) : null
  const link = (path: string, params: Record<string, string> = {}) => `${path}?${new URLSearchParams({ from, to, ...params })}`
  const inPeriod = (date: string) => date >= from && date <= to
  const pending = data.financeEntries.filter(item => item.status === 'Pendente')
  const realized = data.financeEntries.filter(item => item.status === 'Pago' && inPeriod(item.paidDate))
  const overdueProjects = data.projects.filter(item => item.dueDate && item.dueDate < day && !['Concluído', 'Cancelado'].includes(item.status))
  const urgentMaintenance = data.maintenance.filter(item => item.priority === 'Urgente' && !['Concluída', 'Cancelada'].includes(item.status))
  const lowMaterials = data.inventory.filter(item => item.quantity <= item.minimum)
  const overdueReceivables = pending.filter(item => item.direction === 'Receber' && item.dueDate < day).reduce((sum, item) => sum + item.amount, 0)
  const modules: [string, string, string, OperationalKind, AreaIconName][] = [
    ['Agenda e recepção', 'Quadras, reservas e chegada de clientes.', '/agenda', 'reservations', 'agenda'],
    ['Escola', 'Alunos, turmas, matrículas e presença.', '/escola', 'classes', 'school'],
    ['Financeiro operacional', 'Contas, recebimentos e despesas.', '/financeiro', 'financeEntries', 'finance'],
    ['Equipe', 'Pessoas, funções e acordos de pagamento.', '/equipe', 'team', 'team'],
    ['Materiais da arena', 'Material esportivo, limpeza e equipamentos.', '/estoque', 'inventory', 'materials'],
    ['Projetos', 'Tarefas, responsáveis e prazos.', '/projetos', 'projects', 'projects'],
    ['Manutenção', 'Serviços e cuidados com a infraestrutura.', '/manutencao', 'maintenance', 'maintenance'],
  ]
  const updated = formatUpdated(data.dataUpdatedAt); const period = `${displayDate(from)} a ${displayDate(to)}`
  return <main className="operation-page arena-page dashboard">
    <Heading eyebrow={new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())} title="Visão geral" description="Sua arena em um só lugar. Veja as prioridades e abra os registros de cada resultado." action={<div className="arena-actions">{data.canRead('reservations') && <Link className="primary-link" to={`/agenda?date=${day}&view=day`}>Abrir agenda de hoje</Link>}{barHref && <Link className="secondary-link" to={barHref}>Abrir bar e caixa <span aria-hidden="true">→</span></Link>}</div>} />
    <Feedback />
    <section className="arena-dashboard-section" aria-labelledby="arena-attention">
      <div className="arena-section-heading"><div><p className="arena-section-eyebrow">01 · Operação de hoje</p><h2 id="arena-attention">Atenção agora</h2></div><p>Agora · atualizado: {updated}</p></div>
      <div className="arena-metric-grid">
        {data.canRead('reservations') && <Metric label="Reservas de hoje" value={count('reservations', data.reservations.filter(item => item.date === day && !['Cancelada', 'Bloqueio'].includes(item.status)).length)} to={link('/agenda', { date: day, view: 'day', activity: 'reservations' })} period="Agora · hoje" updated={updated} note="Reservas confirmadas, com chegada ou concluídas" />}
        {data.canRead('courts') && <Metric label="Tempo de quadra disponível hoje" value={readable('courts') && schedule.data?.courts && !schedule.isError ? `${quantity(schedule.data.courts.reduce((sum, court) => sum + court.availableMinutes, 0) / 60)} h` : null} to={link('/agenda', { date: day, view: 'day' })} period="Agora · hoje" updated={formatUpdated(schedule.data?.updatedAtUtc)} note="Tempo livre após reservas, bloqueios e aulas" />}
        {data.canRead('financeEntries') && <Metric label="Valores vencidos a receber" value={cash(overdueReceivables)} to={link('/financeiro', { direction: 'Receber', status: 'Pendente', overdue: '1', range: 'all' })} period="Agora" updated={updated} attention={overdueReceivables > 0} note="Cobranças com vencimento anterior a hoje" />}
        {data.canRead('inventory') && <Metric label="Materiais para repor" value={count('inventory', lowMaterials.length)} to={link('/estoque', { low: '1' })} period="Agora · quantidade de materiais" updated={updated} attention={lowMaterials.length > 0} />}
        {data.canRead('projects') && <Metric label="Projetos com prazo vencido" value={count('projects', overdueProjects.length)} to={link('/projetos', { overdue: '1' })} period="Agora" updated={updated} attention={overdueProjects.length > 0} />}
        {data.canRead('maintenance') && <Metric label="Manutenções urgentes abertas" value={count('maintenance', urgentMaintenance.length)} to={link('/manutencao', { priority: 'Urgente', status: 'open' })} period="Agora" updated={updated} attention={urgentMaintenance.length > 0} />}
      </div>
    </section>
    <section className="arena-dashboard-section" aria-labelledby="arena-results">
      <div className="arena-section-heading"><div><p className="arena-section-eyebrow">02 · Acompanhar resultados</p><h2 id="arena-results">Resultados no período</h2></div><p>Atualizado: {updated}</p></div>
      <div className="arena-toolbar arena-period-toolbar"><Field label="De" type="date" value={from} onChange={value => filters.set('from', value)} /><Field label="Até" type="date" value={to} onChange={value => filters.set('to', value)} /><span className="arena-hint">Horário de Brasília<br />Datas inicial e final incluídas</span></div>
      {!valid ? <p className="arena-message arena-error" role="alert">Escolha um período válido. A data final precisa ser igual ou posterior à inicial.</p> : <div className="arena-metric-grid">
        {data.canRead('financeEntries') && <>
          <Metric label="Recebimentos registrados" value={cash(realized.filter(item => item.direction === 'Receber').reduce((sum, item) => sum + item.amount, 0))} to={link('/financeiro', { direction: 'Receber', status: 'Pago', dateField: 'paidDate' })} period={period} updated={updated} note="Entradas marcadas como pagas" />
          <Metric label="Despesas pagas" value={cash(realized.filter(item => item.direction === 'Pagar').reduce((sum, item) => sum + item.amount, 0))} to={link('/financeiro', { direction: 'Pagar', status: 'Pago', dateField: 'paidDate' })} period={period} updated={updated} />
          <Metric label="Recebimentos previstos" value={cash(pending.filter(item => item.direction === 'Receber' && inPeriod(item.dueDate)).reduce((sum, item) => sum + item.amount, 0))} to={link('/financeiro', { direction: 'Receber', status: 'Pendente', dateField: 'dueDate' })} period={period} updated={updated} note="Cobranças pendentes pelo vencimento" />
        </>}
        {data.canRead('reservations') && <Metric label="Reservas no período" value={count('reservations', data.reservations.filter(item => inPeriod(item.date) && !['Cancelada', 'Bloqueio'].includes(item.status)).length)} to={link('/agenda', { view: 'list', activity: 'reservations' })} period={period} updated={updated} />}
      </div>}
      <p className="arena-hint arena-data-note">Recebimentos registrados, consumo do bar e saldo bancário têm origens diferentes. Cada detalhe mostra os registros que compõem seu total.</p>
    </section>
    {valid && <BarArenaMetrics from={from} to={to} />}
    <FinancialHistoryOverview />
    <ArenaHistoryOverview />
    <section className="arena-dashboard-section" aria-labelledby="arena-areas">
      <div className="arena-section-heading"><div><p className="arena-section-eyebrow">03 · Gerenciar a arena</p><h2 id="arena-areas">Áreas da arena</h2></div><p>Consultar, cadastrar e acompanhar</p></div>
      <div className="arena-modules">
        {modules.filter(module => data.canRead(module[3])).map(([title, description, href, , icon]) => <Link className="arena-module arena-area-module" key={title} to={link(href)}><AreaIcon name={icon} /><h3>{title}</h3><p>{description}</p><span className="arena-link-label">Abrir área <span aria-hidden="true">→</span></span></Link>)}
        {barHref && <Link className="arena-module arena-area-module" to={barHref}><AreaIcon name="bar" /><h3>Bar e caixa</h3><p>{demo ? 'Explore atendimento e gestão em uma demonstração.' : 'Vendas, comandas, estoque e recebimentos.'}</p><span className="arena-link-label">{demo ? 'Abrir demonstração' : 'Abrir bar'} <span aria-hidden="true">→</span></span></Link>}
      </div>
    </section>
  </main>
}
const linkBarPeriod = (path: string, from: string, to: string) => `${path}?${new URLSearchParams({ de: from, ate: to })}`
