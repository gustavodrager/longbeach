import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/authContext'
import { barHome, hasPermission, isManagement } from '../features/auth/access'
import { DashboardBarAttention } from '../features/attendance/DashboardBarAttention'
import { BarArenaMetrics } from '../features/attendance/BarArenaMetrics'
import { FinancialBalanceOverview } from '../features/finance/FinancialBalanceOverview'
import { ExpensePaidMetric } from '../features/finance/ExpensePaidMetric'
import { StockValuation } from '../features/bar/StockValuation'
import { BankStatementOverview, FinancialHistoryOverview } from '../features/finance/FinancialHistory'
import { ArenaHistoryOverview } from '../features/finance/ArenaHistoryOverview'
import { useCourtSchedule } from '../features/arena/queries'
import { useOperations, type OperationalKind } from '../features/operations/DemoDataProvider'
import { Feedback, Field, currency, displayDate, quantity, today, useFilters, validDate } from './arenaUi'
import { Disclosure, useContextSearchParams } from '../components/managementUi'
import './dashboard.css'

function Metric({ label, value, to, action, note }: { label: string; value: string; to: string; action: string; note?: string }) {
  return <Link className={`arena-metric${/\d/.test(value) ? '' : ' arena-metric-unavailable'}`} to={to}>
    <span className="arena-metric-label">{label}</span><strong>{value}</strong>
    {note && <small>{note}</small>}
    <span className="arena-link-label">{action} <span aria-hidden="true">→</span></span>
  </Link>
}
const formatUpdated = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))

export function DashboardPage() {
  const data = useOperations()
  const { user } = useAuth()
  const filters = useFilters()
  const [, setParams] = useContextSearchParams()
  const day = today()
  const from = filters.params.get('from') ?? day
  const to = filters.params.get('to') ?? day
  const schedule = useCourtSchedule(day)
  const valid = validDate(from) && validDate(to) && from <= to
  const loaded = data.dataUpdatedAt !== null && data.persistenceStatus !== 'connecting' && data.persistenceStatus !== 'error'
  const readable = (kind: OperationalKind) => data.canRead(kind) && loaded
  const unavailable = data.persistenceStatus === 'error' ? 'Falha ao carregar' : 'Carregando…'
  const count = (kind: OperationalKind, value: number) => !readable(kind) ? unavailable : data[kind].length === 0 ? 'Sem cadastros' : quantity(value)
  const cash = (value: number) => !readable('financeEntries') ? unavailable : data.financeEntries.length === 0 ? 'Sem lançamentos' : currency(value)
  const link = (path: string, params: Record<string, string> = {}) => `${path}?${new URLSearchParams({ from, to, ...params })}`
  const agenda = `/agenda?${new URLSearchParams({ date: day, view: 'day' })}`
  const barHref = import.meta.env.VITE_DEMO_MODE === 'true' ? '/prototipo/gestao' : barHome(user)
  const inPeriod = (date: string) => date >= from && date <= to
  const pending = data.financeEntries.filter(item => item.status === 'Pendente')
  const realized = data.financeEntries.filter(item => item.status === 'Pago' && inPeriod(item.paidDate))
  const activeClasses = data.classes.filter(item => item.status === 'Ativa' && (!item.startDate || item.startDate <= day))
  const classIds = new Set(activeClasses.map(item => item.id))
  const activeEnrollments = data.enrollments.filter(item => item.status === 'Ativa' && item.startDate <= day && classIds.has(item.classId))
  const schoolCapacity = activeClasses.reduce((total, item) => total + item.capacity, 0)
  const classHours = activeClasses.reduce((total, item) => {
    const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
    return total + (minutes(item.endTime) - minutes(item.startTime)) / 60
  }, 0)
  const scheduleCourts = schedule.data?.courts ?? []
  const availabilityReady = readable('courts') && data.courts.length > 0 && scheduleCourts.length === data.courts.length && !schedule.isError && scheduleCourts.every(court => typeof court.availableMinutes === 'number')
  const availability = !loaded ? unavailable : !data.courts.length ? 'Sem quadras' : schedule.isError ? 'Falha ao carregar' : schedule.isPending ? 'Carregando…' : 'Agenda a conferir'
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
  const nextBlocks = scheduleCourts.flatMap(court => court.blocks.filter(block => block.source !== 'Bloqueio' && block.endTime > time).map(block => ({ ...block, courtId: court.courtId }))).sort((a, b) => a.startTime.localeCompare(b.startTime)).slice(0, 3)
  const attention = [
    { kind: 'financeEntries' as const, count: pending.filter(item => item.direction === 'Receber' && item.dueDate < day).length, title: 'Cobranças vencidas', note: 'Confira o saldo restante após pagamentos.', to: '/financeiro?direction=Receber&status=Pendente&overdue=1&range=all', action: 'Conferir cobranças' },
    { kind: 'inventory' as const, count: data.inventory.filter(item => item.quantity <= item.minimum).length, title: 'Materiais para repor', note: 'Estoque no mínimo ou abaixo dele.', to: '/administracao/materiais?low=1', action: 'Revisar materiais' },
    { kind: 'projects' as const, count: data.projects.filter(item => item.dueDate && item.dueDate < day && !['Concluído', 'Cancelado'].includes(item.status)).length, title: 'Projetos com prazo vencido', note: 'Projetos em aberto após o prazo.', to: '/projetos?overdue=1', action: 'Revisar projetos' },
    { kind: 'maintenance' as const, count: data.maintenance.filter(item => item.priority === 'Urgente' && !['Concluída', 'Cancelada'].includes(item.status)).length, title: 'Manutenções urgentes abertas', note: 'Serviços urgentes ainda não concluídos.', to: '/manutencao?priority=Urgente&status=open', action: 'Ver manutenções' },
  ].filter(item => data.canRead(item.kind))
  const alerts = attention.filter(item => readable(item.kind) && item.count > 0)
  const emptyAreas = attention.filter(item => readable(item.kind) && data[item.kind].length === 0)
  const hasMonitoredRecords = attention.some(item => readable(item.kind) && data[item.kind].length > 0)
  const weekStart = new Date(`${day}T12:00:00Z`)
  weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() + 6) % 7)
  const periods = [
    { label: 'Hoje', from: day },
    { label: 'Esta semana', from: weekStart.toISOString().slice(0, 10) },
    { label: 'Este mês', from: `${day.slice(0, 7)}-01` },
  ]
  const selectPeriod = (start: string) => {
    const next = new URLSearchParams(filters.params)
    next.set('from', start); next.set('to', day); next.delete('page')
    setParams(next, { preventScrollReset: true })
  }
  const period = from === to ? displayDate(from) : `${displayDate(from)} a ${displayDate(to)}`
  return <main className="operation-page arena-page dashboard dashboard-overview">
    <header className="dashboard-heading"><div><h1>Visão geral</h1><p>Acompanhe o dia e o que precisa da sua atenção.</p></div><time dateTime={day}>{new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())}</time></header>
    <Feedback />
    <section className="arena-dashboard-section dashboard-today" aria-labelledby="arena-today">
      <div className="arena-section-heading"><div><p className="arena-section-eyebrow">01 · Operação</p><h2 id="arena-today">Hoje na arena</h2></div><div className="dashboard-actions">{data.canRead('reservations') && <Link className="primary-link" to={agenda}>Abrir agenda →</Link>}{hasPermission(user, 'bar:sales:operate') && <Link className="secondary-link" to="/atendimento/vender">Atendimento →</Link>}</div></div>
      <div className="arena-metric-grid dashboard-today-grid">
        {data.canRead('reservations') && <Metric label="Reservas de hoje" value={count('reservations', data.reservations.filter(item => item.date === day && !['Cancelada', 'Bloqueio'].includes(item.status)).length)} to={`${agenda}&activity=reservations`} action="Ver reservas" note="Confirmadas, com chegada ou concluídas" />}
        {data.canRead('courts') && <Metric label="Tempo de quadra disponível hoje" value={availabilityReady ? `${quantity(scheduleCourts.reduce((sum, court) => sum + (court.availableMinutes ?? 0), 0) / 60)} h` : availability} to={agenda} action="Consultar horários" note={availabilityReady ? 'Total livre no dia, após reservas, bloqueios e aulas' : loaded && !data.courts.length ? 'Cadastre as quadras e seus horários de funcionamento.' : 'A disponibilidade depende da conferência da agenda.'} />}
        {data.canRead('classes') && <Metric label="Turmas com aula hoje" value={count('classes', activeClasses.filter(item => item.weekDay === new Date(`${day}T12:00:00Z`).getUTCDay()).length)} to={`${agenda}&activity=classes`} action="Ver aulas na agenda" note="Conforme a grade semanal ativa" />}
      </div>
      {readable('courts') && !schedule.isError && nextBlocks.length > 0 && <div className="dashboard-next"><Disclosure title="Em andamento e próximos horários"><ol>{nextBlocks.map(block => <li key={`${block.courtId}:${block.source}:${block.sourceId}:${block.startTime}`}><Link to={`${agenda}&court=${encodeURIComponent(block.courtId)}`}><time>{block.startTime}–{block.endTime}</time><span>{block.source}<small>{data.courts.find(court => court.id === block.courtId)?.name ?? 'Quadra'}</small></span>{block.startTime <= time && <span className="dashboard-badge">Em andamento</span>}<span aria-hidden="true">→</span></Link></li>)}</ol></Disclosure></div>}
      {data.dataUpdatedAt && <p className="dashboard-updated">Operação consultada em {formatUpdated(data.dataUpdatedAt)}{data.refreshFailed ? ' · Última leitura preservada; atualização pendente.' : ''}</p>}
    </section>

    {(attention.length > 0 || hasPermission(user, 'bar:finance:read')) && <section className="arena-dashboard-section dashboard-attention" aria-labelledby="arena-attention"><div className="arena-section-heading"><h2 id="arena-attention">Precisa de atenção</h2></div>
      <DashboardBarAttention />
      {attention.length > 0 && (!loaded ? <p role="status">{unavailable}. As pendências serão exibidas após a consulta.</p> : <>
        {alerts.length > 0 ? <ul className="dashboard-alerts">{alerts.map(item => <li key={item.kind}><Link to={item.to}><span className="dashboard-alert-count">{item.count}</span><span><strong>{item.title}</strong><small>{item.note}</small></span><span className="dashboard-alert-action">{item.action} →</span></Link></li>)}</ul> : <p className="dashboard-calm">{hasMonitoredRecords ? 'Nenhuma pendência nos cadastros consultados.' : 'Cadastros ainda não disponíveis para acompanhar pendências.'}</p>}
        {emptyAreas.length > 0 && <Disclosure title="Cadastros a completar" count={emptyAreas.length}><ul className="dashboard-empty-areas">{emptyAreas.map(item => <li key={item.kind}><span><strong>{({ financeEntries: 'Financeiro', inventory: 'Materiais', projects: 'Projetos', maintenance: 'Manutenção' })[item.kind]}</strong><small>Sem cadastros · acompanhamento ainda não iniciado</small></span><Link to={item.to.split('?')[0]}>Abrir cadastro →</Link></li>)}</ul></Disclosure>}
      </>)}
    </section>}

    <FinancialBalanceOverview compact />
    <section className="arena-dashboard-section" aria-labelledby="arena-results">
      <div className="arena-section-heading"><div><p className="arena-section-eyebrow">03 · Desempenho</p><h2 id="arena-results">Resultados no período</h2></div><p>Registros do sistema</p></div>
      <div className="dashboard-period-presets" role="group" aria-label="Períodos rápidos">{periods.map(item => <button key={item.label} type="button" aria-pressed={periods.find(candidate => candidate.from === from && to === day)?.label === item.label} onClick={() => selectPeriod(item.from)}>{item.label}</button>)}</div>
      <div className="arena-toolbar arena-period-toolbar"><Field label="De" type="date" value={from} onChange={value => filters.set('from', value)} /><Field label="Até" type="date" value={to} onChange={value => filters.set('to', value)} /><span className="arena-hint">Datas incluídas · horário de Brasília<br />Este filtro altera apenas os resultados abaixo.</span></div>
      {!valid ? <p className="arena-message arena-error" role="alert">Escolha um período válido. A data final precisa ser igual ou posterior à inicial.</p> : <>
        <p className="dashboard-period-label">{period}</p>
        <div className="arena-metric-grid">
          {data.canRead('financeEntries') && <>
            <Metric label="Recebimentos registrados" value={cash(realized.filter(item => item.direction === 'Receber').reduce((sum, item) => sum + item.amount, 0))} to={link('/financeiro', { direction: 'Receber', status: 'Pago', dateField: 'paidDate' })} action="Conferir recebimentos" note="Lançamentos marcados como pagos" />
            <ExpensePaidMetric from={from} to={to} />
          </>}
          {data.canRead('reservations') && <Metric label="Reservas no período" value={count('reservations', data.reservations.filter(item => inPeriod(item.date) && !['Cancelada', 'Bloqueio'].includes(item.status)).length)} to={link('/agenda', { view: 'list', activity: 'reservations' })} action="Abrir reservas do período" />}
        </div>
        {hasPermission(user, 'bar:finance:read') && <BarArenaMetrics from={from} to={to} compact />}
        <p className="arena-hint">Financeiro e bar têm fontes separadas. Consulte a composição antes de comparar ou somar valores.</p>
      </>}
    </section>

    <section className="arena-dashboard-section dashboard-more" aria-labelledby="arena-more"><div className="arena-section-heading"><div><p className="arena-section-eyebrow">04 · Consultas</p><h2 id="arena-more">Mais sobre a arena</h2></div></div>
      {(data.canRead('rentalGroups') || data.canRead('classes')) && <Disclosure title="Mensalistas e grade de aulas atual">
        {data.canRead('rentalGroups') && <Metric label="Grupos ativos" value={count('rentalGroups', data.rentalGroups.filter(g => g.status === 'Ativo' && g.startDate <= day && (!g.endDate || g.endDate >= day)).length)} to="/mensalistas" action="Gerenciar grupos" note="Acordos cadastrados atualmente" />}
        {readable('classes') && activeClasses.length > 0 && <section aria-labelledby="current-school-grade"><h3 id="current-school-grade">Grade de aulas atual</h3><div className="arena-metric-grid">
          <Metric label="Turmas ativas" value={String(activeClasses.length)} to="/escola?status=Ativa" action="Consultar turmas" note={`${quantity(classHours)} h de aulas por semana`} />
          {readable('enrollments') && <><Metric label="Vagas ocupadas nas turmas" value={`${activeEnrollments.length}/${schoolCapacity}`} to="/escola?status=Ativa" action="Consultar vagas" note={`${Math.max(0, schoolCapacity - activeEnrollments.length)} vagas livres`} /><Metric label="Alunos na grade atual" value={String(new Set(activeEnrollments.map(item => item.studentId)).size)} to="/escola/matriculas?status=Ativa" action="Ver matrículas" note="Cada aluno contado uma vez" /></>}
        </div></section>}
      </Disclosure>}
      {hasPermission(user, 'bar:finance:read') && <Disclosure title="Estoque do bar e potencial de venda" lazy><StockValuation compact /></Disclosure>}
      {isManagement(user) && <Disclosure title="Histórico das planilhas e movimentos de origem" lazy><p className="dashboard-history-notice">Referências históricas. As datas pertencem às fontes importadas e podem ser diferentes entre os indicadores.</p><ArenaHistoryOverview /><Disclosure title="Histórico financeiro e extratos" lazy><FinancialHistoryOverview /><BankStatementOverview /></Disclosure></Disclosure>}
      <nav className="dashboard-shortcuts" aria-label="Áreas da arena">{data.canRead('reservations') && <Link to="/agenda">Agenda →</Link>}{data.canRead('rentalGroups') && <Link to="/mensalistas">Mensalistas →</Link>}{data.canRead('classes') && <Link to="/escola">Aulas →</Link>}{data.canRead('financeEntries') && <Link to="/financeiro/despesas">Financeiro →</Link>}{barHref && <Link to={barHref}>Bar e caixa →</Link>}</nav>
    </section>
  </main>
}
