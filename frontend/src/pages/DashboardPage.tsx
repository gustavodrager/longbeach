import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/authContext'
import { hasPermission } from '../features/auth/access'
import { DashboardBarAttention } from '../features/attendance/DashboardBarAttention'
import { useCourtSchedule } from '../features/arena/queries'
import { useOperations, type OperationalKind } from '../features/operations/DemoDataProvider'
import { Feedback, quantity, today } from './arenaUi'
import './dashboard.css'

function Metric({ label, value, to, note }: { label: string; value: string; to: string; note?: string }) {
  return <Link className="arena-metric" to={to}>
    <span className="arena-metric-label">{label}</span>
    <strong>{value}</strong>
    {note && <small>{note}</small>}
    <span className="dashboard-metric-arrow" aria-hidden="true">→</span>
  </Link>
}
const formatUpdated = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))

export function DashboardPage() {
  const data = useOperations()
  const { user } = useAuth()
  const day = today()
  const schedule = useCourtSchedule(day)
  const loaded = data.dataUpdatedAt !== null && !['connecting', 'error'].includes(data.persistenceStatus)
  const readable = (kind: OperationalKind) => data.canRead(kind) && loaded
  const unavailable = data.persistenceStatus === 'error' ? 'Falha ao carregar' : 'Carregando…'
  const count = (kind: OperationalKind, value: number, empty: string) => !readable(kind) ? unavailable : data[kind].length === 0 ? empty : quantity(value)
  const agenda = `/agenda?${new URLSearchParams({ date: day, view: 'day' })}`
  const activeClasses = data.classes.filter(item => item.status === 'Ativa' && (!item.startDate || item.startDate <= day))
  const scheduleCourts = schedule.data?.courts ?? []
  const availabilityReady = readable('courts') && data.courts.length > 0 && scheduleCourts.length === data.courts.length && !schedule.isError && scheduleCourts.every(court => typeof court.availableMinutes === 'number')
  const availability = !loaded ? unavailable : !data.courts.length ? 'Sem quadras' : schedule.isError ? 'Falha ao carregar' : schedule.isPending ? 'Carregando…' : 'Agenda a conferir'
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
  const nextBlocks = readable('courts') && !schedule.isError
    ? scheduleCourts.flatMap(court => court.blocks.filter(block => block.source !== 'Bloqueio' && block.endTime > time).map(block => ({ ...block, courtId: court.courtId }))).sort((a, b) => a.startTime.localeCompare(b.startTime)).slice(0, 3)
    : []
  const attention = [
    { kind: 'financeEntries' as const, count: data.financeEntries.filter(item => item.status === 'Pendente' && item.direction === 'Receber' && item.dueDate < day).length, title: 'Cobranças vencidas', to: '/financeiro?direction=Receber&status=Pendente&overdue=1&range=all' },
    { kind: 'inventory' as const, count: data.inventory.filter(item => item.quantity <= item.minimum).length, title: 'Materiais para repor', to: '/administracao/materiais?low=1' },
    { kind: 'projects' as const, count: data.projects.filter(item => item.dueDate && item.dueDate < day && !['Concluído', 'Cancelado'].includes(item.status)).length, title: 'Projetos com prazo vencido', to: '/projetos?overdue=1' },
    { kind: 'maintenance' as const, count: data.maintenance.filter(item => item.priority === 'Urgente' && !['Concluída', 'Cancelada'].includes(item.status)).length, title: 'Manutenções urgentes', to: '/manutencao?priority=Urgente&status=open' },
  ].filter(item => data.canRead(item.kind))
  const alerts = attention.filter(item => readable(item.kind) && item.count > 0)
  const hasMonitoredRecords = attention.some(item => readable(item.kind) && data[item.kind].length > 0)
  const hasTodayMetrics = data.canRead('reservations') || data.canRead('courts') || data.canRead('classes')

  return <main className="operation-page arena-page dashboard dashboard-overview">
    <header className="dashboard-heading">
      <div><h1>Visão geral</h1><time dateTime={day}>{new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())}</time></div>
      <div className="dashboard-actions">
        {data.canRead('reservations') && <Link className="primary-link" to={agenda}>Abrir agenda</Link>}
        {hasPermission(user, 'bar:sales:operate') && <Link className="secondary-link" to="/atendimento/vender">Atendimento</Link>}
      </div>
    </header>
    <Feedback />
    {hasTodayMetrics && <section className="arena-dashboard-section dashboard-today" aria-labelledby="arena-today">
      <h2 id="arena-today">Hoje</h2>
      <div className="arena-metric-grid dashboard-today-grid">
        {data.canRead('reservations') && <Metric label="Reservas" value={count('reservations', data.reservations.filter(item => item.date === day && !['Cancelada', 'Bloqueio'].includes(item.status)).length, 'Sem reservas')} to={`${agenda}&activity=reservations`} />}
        {data.canRead('courts') && <Metric label="Horas livres" value={availabilityReady ? `${quantity(scheduleCourts.reduce((sum, court) => sum + (court.availableMinutes ?? 0), 0) / 60)} h` : availability} to={agenda} note={availabilityReady && scheduleCourts.length > 1 ? 'Total entre quadras' : undefined} />}
        {data.canRead('classes') && <Metric label="Turmas" value={count('classes', activeClasses.filter(item => item.weekDay === new Date(`${day}T12:00:00Z`).getUTCDay()).length, 'Sem turmas')} to={`${agenda}&activity=classes`} />}
      </div>
    </section>}

    {nextBlocks.length > 0 && <section className="arena-dashboard-section dashboard-next" aria-labelledby="arena-next">
      <h2 id="arena-next">Próximos horários</h2>
      <ol>{nextBlocks.map(block => <li key={`${block.courtId}:${block.source}:${block.sourceId}:${block.startTime}`}>
        <Link to={`${agenda}&court=${encodeURIComponent(block.courtId)}`}>
          <time>{block.startTime}–{block.endTime}</time>
          <span>{block.source}<small>{data.courts.find(court => court.id === block.courtId)?.name ?? 'Quadra'}</small></span>
          {block.startTime <= time && <span className="dashboard-badge">Em andamento</span>}
          <span className="dashboard-row-arrow" aria-hidden="true">→</span>
        </Link>
      </li>)}</ol>
    </section>}

    {(attention.length > 0 || hasPermission(user, 'bar:finance:read')) && <section className="arena-dashboard-section dashboard-attention" aria-labelledby="arena-attention">
      <h2 id="arena-attention">Pendências</h2>
      <DashboardBarAttention />
      {attention.length > 0 && (!loaded ? <p role="status">{unavailable}.</p>
        : alerts.length > 0 ? <ul className="dashboard-alerts">{alerts.map(item => <li key={item.kind}><Link to={item.to}>
          <span className="dashboard-alert-count">{item.count}</span><strong>{item.title}</strong><span className="dashboard-row-arrow" aria-hidden="true">→</span>
        </Link></li>)}</ul>
          : <p className="dashboard-calm">{hasMonitoredRecords ? 'Nenhuma pendência nos cadastros.' : 'Sem registros para conferir.'}</p>)}
    </section>}

    {data.refreshFailed && data.dataUpdatedAt && <p className="dashboard-updated" role="status">Última leitura preservada: {formatUpdated(data.dataUpdatedAt)}. Atualização pendente.</p>}
  </main>
}
