import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Disclosure, useContextSearchParams } from '../components/managementUi'
import { useOperations } from '../features/operations/DemoDataProvider'
import { useCourtSchedule, useCourtScheduleRange } from '../features/arena/queries'
import type { CourtScheduleRow, Reservation } from '../features/arena/types'
import { Empty, Feedback, Field, Heading, NoAccess, Pagination, Search, Status, displayDate, quantity, today, useFilters, validDate } from './arenaUi'
import './agenda.css'
import './operational-clean.css'
import { WeeklyAgenda } from './WeeklyAgenda'
import { AgendaActivityDetails, type AgendaSelection } from './AgendaActivityDetails'
import { AgendaDays, agendaReferenceDate, changeAgendaView, useCompactAgenda, type AgendaView } from './agendaNavigation'
import { reservationUrl } from '../features/arena/agenda'
import { AvailabilityLegend } from './AgendaAvailability'

function shiftDay(date: string, days: number) {
  if (!validDate(date)) return today()
  const next = new Date(`${date}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

function availability(occupation?: CourtScheduleRow, failed = false) {
  if (failed) return 'Não foi possível verificar a disponibilidade.'
  if (!occupation) return 'Consultando disponibilidade…'
  if (occupation.closedForMaintenance) return 'Quadra em manutenção'
  if (occupation.closedForDay) return 'Fechada neste dia da semana'
  if (occupation.schedulePending || occupation.availableMinutes === null) return 'Disponibilidade não verificada'
  if (occupation.hasConflict) return 'Horários sobrepostos · confira a agenda'
  if (occupation.availableMinutes === 0) return 'Sem horários livres neste dia'
  return `${quantity(occupation.reservedMinutes / 60)} h reservadas ou bloqueadas · ${quantity(occupation.classMinutes / 60)} h de aulas · ${quantity(occupation.availableMinutes / 60)} h livres no dia`
}

type Entry = { key: string; date: string; time: string; courtId: string; node: ReactNode }

export function AgendaPage() {
  const filters = useFilters()
  const compact = useCompactAgenda()
  return ['day', 'list'].includes(filters.params.get('view') ?? (compact ? 'day' : 'week')) ? <AgendaDayListPage /> : <WeeklyAgenda />
}

function AgendaDayListPage() {
  const [selected, setSelected] = useState<AgendaSelection | null>(null)
  const data = useOperations()
  const filters = useFilters()
  const [, setParams] = useContextSearchParams()
  const setActivity = (value: string) => {
    setParams(current => {
      const next = new URLSearchParams(current)
      value ? next.set('activity', value) : next.delete('activity')
      if (['classes', 'aula', 'livre'].includes(value)) { next.delete('status'); next.delete('group') }
      next.delete('page')
      return next
    }, { preventScrollReset: true })
  }
  const date = agendaReferenceDate(filters.params)
  const from = filters.params.get('from') ?? date
  const to = filters.params.get('to') ?? date
  const list = filters.params.get('view') === 'list'
  const courtId = data.courts.length === 1 ? data.courts[0].id : filters.params.get('court') ?? ''
  const activity = filters.params.get('activity') ?? ''
  const reservationsOnly = ['reservations', 'mensalista', 'locacao'].includes(activity)
  const blocksOnly = activity === 'bloqueio'
  const freeOnly = activity === 'livre'
  const lessonsOnly = ['classes', 'aula'].includes(filters.params.get('activity') ?? '')
  const reservationFiltersDisabled = freeOnly || lessonsOnly
  const status = reservationFiltersDisabled ? '' : filters.status
  const groupId = reservationFiltersDisabled ? '' : filters.params.get('group') ?? ''
  const showLessons = !reservationsOnly && !blocksOnly && !freeOnly && !status && !groupId
  const rangeDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1
  const validPeriod = validDate(from) && validDate(to) && rangeDays >= 1 && rangeDays <= 366
  const validSelection = list ? validPeriod : validDate(date)
  const schedule = useCourtSchedule(date, !list && validDate(date))
  const period = useCourtScheduleRange(from, to, list && validPeriod && (showLessons || freeOnly))
  const selectedSchedule = list ? period : schedule
  const availabilityFailed = selectedSchedule.isError || data.refreshFailed || data.persistenceStatus === 'error'
  const requiresSchedule = (showLessons || freeOnly) && data.canRead('courts')
  const days = list ? period.data?.days ?? [] : schedule.data ? [schedule.data] : []
  const courts = data.courts.filter(court => !courtId || court.id === courtId)
  const availabilityPending = freeOnly && (days.length !== (list ? rangeDays : 1) || days.some(day => courts.some(court => {
    const row = day.courts.find(item => item.courtId === court.id)
    return !row || !row.closedForDay && !row.closedForMaintenance && (row.schedulePending || row.freeIntervals == null)
  })))
  const incomplete = availabilityPending || requiresSchedule && (!selectedSchedule.data || availabilityFailed)
  const query = filters.query.trim().toLocaleLowerCase('pt-BR')
  const matches = (text: string) => text.toLocaleLowerCase('pt-BR').includes(query)
  const groupRows = data.reservations.filter(item => item.groupId === groupId)
  const rows = data.reservations.filter(item => !lessonsOnly && !freeOnly && (list ? item.date >= from && item.date <= to : item.date === date)
    && (list || item.status !== 'Cancelada') && (!courtId || item.courtId === courtId) && (!groupId || item.groupId === groupId)
    && (!status || item.status === status)
    && matches(`${item.name} ${item.customerName} ${item.groupTitle ?? ''}`)
    && (!reservationsOnly || !['Bloqueio', 'Cancelada'].includes(item.status))
    && (!blocksOnly || item.status === 'Bloqueio')
    && (activity !== 'mensalista' || Boolean(item.rentalGroupId))
    && (activity !== 'locacao' || !item.rentalGroupId))
  const reservationEntry = (item: Reservation): Entry => ({
    key: item.id, date: item.date, time: item.startTime, courtId: item.courtId,
    node: <button className={`arena-slot arena-slot-occupied${item.status === 'Bloqueio' ? ' arena-slot-blocked' : ''}`} onClick={() => setSelected({ date: item.date, startTime: item.startTime, endTime: item.endTime, reservation: item })}>
      <strong>{item.startTime}–{item.endTime}</strong><span><strong>{item.name}</strong>
        <small>{displayDate(item.date)}{data.courts.length > 1 && ` · ${data.courts.find(court => court.id === item.courtId)?.name ?? 'Quadra'}`}</small>
        {item.customerName && item.customerName !== item.name && <small>{item.customerName}</small>}
        {item.groupId && <small>Grupo {item.groupTitle} · ocorrência {item.occurrenceIndex}</small>}
        {item.status === 'Cancelada' && <small>Não ocupa a quadra</small>}
      </span><Status warning={item.status === 'Bloqueio'}>{item.status}</Status>
    </button>,
  })
  const entries = rows.map(reservationEntry)
  if (showLessons && !selectedSchedule.isError) for (const day of days) for (const court of day.courts) {
    if (courtId && court.courtId !== courtId) continue
    court.blocks.forEach((block, index) => {
      if (block.source !== 'Aula') return
      const lesson = data.canRead('classes') && block.sourceId ? data.classes.find(item => item.id === block.sourceId) : undefined
      const name = lesson?.name ?? 'Aula'
      if (!matches(name)) return
      const content = <><strong>{block.startTime}–{block.endTime}</strong><span><strong>{name}</strong><small>{displayDate(day.date)}{data.courts.length > 1 && ` · ${data.courts.find(item => item.id === court.courtId)?.name ?? 'Quadra'}`}</small></span><Status>Aula</Status></>
      entries.push({ key: `class-${day.date}-${court.courtId}-${index}`, date: day.date, time: block.startTime, courtId: court.courtId,
        node: <button className="arena-slot arena-slot-class" onClick={() => setSelected({ date: day.date, startTime: block.startTime, endTime: block.endTime, isClass: true, lesson })}>{content}</button> })
    })
  }
  if (freeOnly && !availabilityFailed) for (const day of days) for (const court of day.courts) {
    if (!matches('Horário livre') || courtId && court.courtId !== courtId || court.schedulePending || court.closedForDay || court.closedForMaintenance) continue
    for (const interval of court.freeIntervals ?? []) entries.push({ key: `free-${day.date}-${court.courtId}-${interval.startTime}`, date: day.date, time: interval.startTime, courtId: court.courtId,
      node: <div className="arena-slot kind-livre"><strong>{interval.startTime}–{interval.endTime}</strong><span><strong>Horário livre</strong><small>{displayDate(day.date)}{data.courts.length > 1 && ` · ${data.courts.find(item => item.id === court.courtId)?.name ?? 'Quadra'}`}</small></span>{data.canWrite('reservations') && <Link to={reservationUrl(day.date,court.courtId,interval.startTime,interval.endTime,list ? 'list' : 'day',filters.params)}>Reservar</Link>}</div> })
  }
  entries.sort((a, b) => `${a.date}${a.time}${a.key}`.localeCompare(`${b.date}${b.time}${b.key}`))
  const activeFilters = [data.courts.length > 1 && courtId, status, query, groupId, activity].filter(Boolean).length
  const clearFilters = filters.href('/agenda', { court: '', status: '', q: '', group: '', activity: '', page: '', view: list ? 'list' : 'day' })
  const renderEntries = (items: Entry[]) => <div className="arena-slots">{items.map(entry => <div key={entry.key}>{entry.node}</div>)}</div>

  if (!data.canRead('reservations')) return <NoAccess />
  return <main className="operation-page arena-page agenda-page operational-clean">
    <Heading eyebrow="" title="Agenda" action={data.canWrite('reservations') && <Link className="primary-link" to={filters.href('/agenda/novo', { date, court: courtId, start: '', end: '', view: list ? 'list' : 'day' })}>+ Nova reserva</Link>} />
    <Feedback />
    <div className="agenda-controls">
      {!list && <div className="date-navigation"><button type="button" aria-label="Dia anterior" onClick={() => filters.set('date', shiftDay(date, -1))}>←</button><button type="button" onClick={() => filters.set('date', today())}>Hoje</button><button type="button" aria-label="Próximo dia" onClick={() => filters.set('date', shiftDay(date, 1))}>→</button><strong>{displayDate(date)}</strong></div>}
      <Field label="Visualização" value={list ? 'list' : 'day'} onChange={value => setParams(current => changeAgendaView(current, value as AgendaView, list ? 'list' : 'day'), { preventScrollReset: true })} options={[{ value: 'week', label: 'Semana' }, { value: 'day', label: 'Dia' }, { value: 'list', label: 'Lista' }]} />
      {data.courts.length > 1 && <Field label="Quadra" value={courtId} onChange={value => filters.set('court', value)} options={[{ value: '', label: 'Todas as quadras' }, ...data.courts.map(court => ({ value: court.id, label: court.name }))]} />}
    </div>
    {!list && <AgendaDays date={date} />}
    {list && <div className="agenda-period"><Field label="De" type="date" value={from} onChange={value => filters.set('from', value)} /><Field label="Até" type="date" value={to} onChange={value => filters.set('to', value)} /></div>}
    <div className="agenda-options">
      <Disclosure title={`Filtros${activeFilters ? ` · ${activeFilters} ${activeFilters === 1 ? 'ativo' : 'ativos'}` : ''}`}><div className="arena-toolbar">
        {!list && <Field label="Dia" type="date" value={date} onChange={value => filters.set('date', value)} />}
        <Field label="Mostrar" value={lessonsOnly ? 'classes' : activity} onChange={setActivity} options={[{ value: '', label: 'Reservas, bloqueios e aulas' }, { value: 'reservations', label: 'Somente reservas' }, { value: 'classes', label: 'Somente aulas' }, { value: 'mensalista', label: 'Mensalistas' }, { value: 'locacao', label: 'Locações' }, { value: 'bloqueio', label: 'Bloqueios' }, { value: 'livre', label: 'Horários livres' }]} />
        <Field label="Situação da reserva" value={status} disabled={reservationFiltersDisabled} onChange={value => { if (!reservationFiltersDisabled) filters.set('status', value) }} options={[{ value: '', label: 'Todas' }, 'Confirmada', 'Chegou', 'Concluída', 'Cancelada', 'Bloqueio']} />
        <Search filters={filters} placeholder="Buscar reserva, cliente ou aula…" />
      </div></Disclosure>
      <Disclosure title="Mais opções"><div className="arena-actions">
        {data.canWrite('reservations') && <Link className="secondary-link" to={filters.href('/agenda/recorrentes/novo', { date, court: courtId })}>Reservas semanais</Link>}
        {data.canRead('courts') && <Link className="secondary-link" to="/agenda/funcionamento">Funcionamento</Link>}
        {data.canRead('classes') && <Link className="secondary-link" to="/escola">Turmas</Link>}
      </div></Disclosure>
    </div>
    {activeFilters > 0 && <div className="agenda-filter-state"><span>Filtrando: {[activity && ({ classes: 'Aulas', aula: 'Aulas', reservations: 'Reservas', mensalista: 'Mensalistas', locacao: 'Locações', bloqueio: 'Bloqueios', livre: 'Horários livres' }[activity] ?? activity), status, query && `“${filters.query}”`, groupId && 'Grupo semanal', data.courts.length > 1 && courtId && 'Quadra selecionada'].filter(Boolean).join(' · ')}</span><Link to={clearFilters}>Limpar filtros</Link></div>}
    {groupId && <p className="arena-message">Grupo semanal: <strong>{groupRows[0]?.groupTitle ?? 'Grupo selecionado'}</strong> · {groupRows.length} ocorrências <button className="text-button" onClick={() => filters.set('group', '')}>Ver todos os grupos</button></p>}
    {!showLessons && !freeOnly && <p className="arena-hint">A disponibilidade também considera as aulas e os horários fora do filtro.</p>}
    {!validSelection ? <p className="arena-message arena-error" role="alert">{list ? 'Escolha datas válidas, em ordem, com até 366 dias no período.' : 'Escolha uma data válida para consultar a agenda.'}</p> : <>
      {data.canRead('courts') && <AvailabilityLegend />}
      {list && <Disclosure title="Consultar horários livres"><p>Em Filtros, selecione Horários livres. A disponibilidade considera todas as ocupações.</p></Disclosure>}
      <div className="arena-list-summary" aria-live="polite"><strong>{!data.dataUpdatedAt ? 'Carregando seleção…' : incomplete ? freeOnly ? 'Disponibilidade a confirmar' : selectedSchedule.isError ? 'Lista parcial · aulas indisponíveis' : 'Lista parcial · conferindo aulas' : `${entries.length} ${freeOnly ? entries.length === 1 ? 'horário livre' : 'horários livres' : entries.length === 1 ? 'atividade' : 'atividades'}`}</strong>{!incomplete && !freeOnly && <span>{rows.length} {rows.length === 1 ? 'reserva/bloqueio' : 'reservas/bloqueios'} · {entries.length - rows.length} {entries.length - rows.length === 1 ? 'aula' : 'aulas'}</span>}</div>
      {requiresSchedule && selectedSchedule.isError && <p className="arena-message arena-error" role="alert">{freeOnly ? 'A disponibilidade não pôde ser consultada.' : 'As aulas não puderam ser consultadas. A lista está incompleta.'} <button type="button" className="text-button" onClick={() => void selectedSchedule.refetch()}>Tentar novamente</button></p>}
      {(showLessons || freeOnly) && !data.canRead('courts') && <p className="arena-hint">Seu acesso permite consultar reservas. Aulas e disponibilidade exigem acesso às quadras.</p>}
      {list ? entries.length ? <Pagination total={entries.length}>{(start, end) => renderEntries(entries.slice(start, end))}</Pagination> : !incomplete && <Empty>Nenhuma atividade corresponde aos filtros.</Empty> : courts.length ? <div className="arena-schedule">{courts.map(court => {
        const occupation = !availabilityFailed ? schedule.data?.courts.find(item => item.courtId === court.id) : undefined
        const items = entries.filter(entry => entry.courtId === court.id)
        return <section className="arena-court-day" key={court.id} aria-label={data.courts.length === 1 ? 'Atividades do dia' : court.name}>
          <div className="arena-section-heading"><div><h2>{data.courts.length === 1 ? 'Atividades do dia' : court.name}</h2><p>Funcionamento: {court.openingTime}–{court.closingTime}</p></div><p>{availability(occupation, availabilityFailed)}</p></div>
          {occupation?.schedulePending && !occupation.closedForDay && !occupation.closedForMaintenance && <p className="arena-hint">{data.canWrite('courts') ? <Link to="/agenda/funcionamento">Conferir agenda da quadra →</Link> : 'Peça à gestão para conferir os cadastros e horários.'}</p>}
          {occupation?.hasConflict && <p className="arena-message arena-error">Há horários sobrepostos ou fora do funcionamento. Confira as reservas e aulas.</p>}
          {schedule.isError && <button className="secondary-link" onClick={() => void schedule.refetch()}>Consultar disponibilidade novamente</button>}
          {!freeOnly && !availabilityFailed && !occupation?.schedulePending && !occupation?.closedForDay && !occupation?.closedForMaintenance && Boolean(occupation?.freeIntervals?.length) && <section className="agenda-day-free" aria-label="Horários livres"><h3>Horários livres</h3>{occupation!.freeIntervals!.map(interval => <div key={interval.startTime}><span>{interval.startTime}–{interval.endTime} · Livre</span>{data.canWrite('reservations') && <Link to={reservationUrl(date,court.id,interval.startTime,interval.endTime,'day',filters.params)}>+ Nova reserva</Link>}</div>)}</section>}
          {!freeOnly && Boolean(items.length) && <h3 className="agenda-occupied-heading">Atividades</h3>}
          {renderEntries(items)}
          {!items.length && occupation && !incomplete && <p className="arena-hint">{activeFilters ? 'Nenhuma atividade corresponde aos filtros nesta quadra.' : 'Nenhuma atividade neste dia.'}</p>}
        </section>
      })}</div> : <Empty action={data.canWrite('courts') && <Link className="primary-link" to="/agenda/funcionamento">Cadastrar primeira quadra</Link>}>A agenda precisa de uma quadra cadastrada para mostrar horários e capacidade.</Empty>}
    </>}
    {selected && <AgendaActivityDetails selected={selected} onClose={() => setSelected(null)} />}
  </main>
}
