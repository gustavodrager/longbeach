import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ContextLink, Disclosure } from '../components/managementUi'
import { useOperations } from '../features/operations/DemoDataProvider'
import { useCourtSchedule, useCourtScheduleRange } from '../features/arena/queries'
import type { CourtScheduleRow, Reservation } from '../features/arena/types'
import { Empty, Feedback, Field, Heading, NoAccess, Pagination, Search, Status, displayDate, quantity, today, useFilters, validDate } from './arenaUi'
import './agenda.css'

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
  const data = useOperations()
  const filters = useFilters()
  const date = filters.params.get('date') ?? today()
  const from = filters.params.get('from') ?? date
  const to = filters.params.get('to') ?? date
  const list = filters.params.get('view') === 'list'
  const courtId = filters.params.get('court') ?? ''
  const groupId = filters.params.get('group') ?? ''
  const reservationsOnly = filters.params.get('activity') === 'reservations'
  const showLessons = !reservationsOnly && !filters.status && !groupId
  const rangeDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1
  const validPeriod = validDate(from) && validDate(to) && rangeDays >= 1 && rangeDays <= 366
  const validSelection = list ? validPeriod : validDate(date)
  const schedule = useCourtSchedule(date, !list && validDate(date))
  const period = useCourtScheduleRange(from, to, list && validPeriod && showLessons)
  const selectedSchedule = list ? period : schedule
  const requiresSchedule = showLessons && data.canRead('courts')
  const incomplete = requiresSchedule && (!selectedSchedule.data || selectedSchedule.isError)
  const query = filters.query.trim().toLocaleLowerCase('pt-BR')
  const matches = (text: string) => text.toLocaleLowerCase('pt-BR').includes(query)
  const courts = data.courts.filter(court => !courtId || court.id === courtId)
  const groupRows = data.reservations.filter(item => item.groupId === groupId)
  const rows = data.reservations.filter(item => (list ? item.date >= from && item.date <= to : item.date === date)
    && (!courtId || item.courtId === courtId) && (!groupId || item.groupId === groupId)
    && (!filters.status || item.status === filters.status)
    && matches(`${item.name} ${item.customerName} ${item.groupTitle ?? ''}`)
    && (!reservationsOnly || !['Bloqueio', 'Cancelada'].includes(item.status)))
  const reservationEntry = (item: Reservation): Entry => ({
    key: item.id, date: item.date, time: item.startTime, courtId: item.courtId,
    node: <ContextLink state={{ returnLabel: 'Agenda' }} className="arena-slot" to={filters.href(`/agenda/${item.id}`)}>
      <strong>{item.startTime}–{item.endTime}</strong><span><strong>{item.name}</strong>
        <small>{displayDate(item.date)} · {data.courts.find(court => court.id === item.courtId)?.name ?? 'Quadra'}</small>
        {item.customerName && item.customerName !== item.name && <small>{item.customerName}</small>}
        {item.groupId && <small>Grupo {item.groupTitle} · ocorrência {item.occurrenceIndex}</small>}
      </span><Status warning={item.status === 'Bloqueio'}>{item.status}</Status>
    </ContextLink>,
  })
  const entries = rows.map(reservationEntry)
  const days = list ? period.data?.days ?? [] : schedule.data ? [schedule.data] : []
  if (showLessons && !selectedSchedule.isError) for (const day of days) for (const court of day.courts) {
    if (courtId && court.courtId !== courtId) continue
    court.blocks.forEach((block, index) => {
      if (block.source !== 'Aula') return
      const lesson = data.canRead('classes') && block.sourceId ? data.classes.find(item => item.id === block.sourceId) : undefined
      const name = lesson?.name ?? 'Aula'
      if (!matches(name)) return
      const content = <><strong>{block.startTime}–{block.endTime}</strong><span><strong>{name}</strong><small>{displayDate(day.date)} · {data.courts.find(item => item.id === court.courtId)?.name ?? 'Quadra'}</small><small>Ocupa a quadra neste horário</small></span><Status>Aula</Status></>
      entries.push({ key: `class-${day.date}-${court.courtId}-${index}`, date: day.date, time: block.startTime, courtId: court.courtId,
        node: block.sourceId && data.canRead('classes') ? <ContextLink state={{ returnLabel: 'Agenda' }} className="arena-slot arena-slot-class" to={`/escola/${block.sourceId}`}>{content}</ContextLink> : <article className="arena-slot arena-slot-class">{content}</article> })
    })
  }
  entries.sort((a, b) => `${a.date}${a.time}${a.key}`.localeCompare(`${b.date}${b.time}${b.key}`))
  const activeFilters = [courtId, filters.status, query, groupId, reservationsOnly].filter(Boolean).length
  const clearFilters = filters.href('/agenda', { court: '', status: '', q: '', group: '', activity: '', page: '' })
  const renderEntries = (items: Entry[]) => <div className="arena-slots">{items.map(entry => <div key={entry.key}>{entry.node}</div>)}</div>

  if (!data.canRead('reservations')) return <NoAccess />
  return <main className="operation-page arena-page agenda-page">
    <Heading title="Agenda e recepção" description="Consulte as atividades e a disponibilidade das quadras." action={data.canWrite('reservations') && <Link className="primary-link" to={filters.href('/agenda/novo', { date, court: courtId })}>+ Nova reserva</Link>} />
    <Feedback />
    <div className="agenda-controls">
      {!list && <div className="date-navigation"><button type="button" aria-label="Dia anterior" onClick={() => filters.set('date', shiftDay(date, -1))}>←</button><button type="button" onClick={() => filters.set('date', today())}>Hoje</button><button type="button" aria-label="Próximo dia" onClick={() => filters.set('date', shiftDay(date, 1))}>→</button><strong>{displayDate(date)}</strong></div>}
      <Field label="Visualização" value={list ? 'list' : 'day'} onChange={value => filters.set('view', value)} options={[{ value: 'day', label: 'Agenda do dia' }, { value: 'list', label: 'Lista no período' }]} />
    </div>
    {list && <div className="agenda-period"><Field label="De" type="date" value={from} onChange={value => filters.set('from', value)} /><Field label="Até" type="date" value={to} onChange={value => filters.set('to', value)} /></div>}
    <div className="agenda-options">
      <Disclosure title={`Filtros${activeFilters ? ` · ${activeFilters} ${activeFilters === 1 ? 'ativo' : 'ativos'}` : ''}`}><div className="arena-toolbar">
        {!list && <Field label="Dia" type="date" value={date} onChange={value => filters.set('date', value)} />}
        <Field label="Mostrar" value={reservationsOnly ? 'reservations' : ''} onChange={value => filters.set('activity', value)} options={[{ value: '', label: 'Reservas, bloqueios e aulas' }, { value: 'reservations', label: 'Somente reservas' }]} />
        <Field label="Quadra" value={courtId} onChange={value => filters.set('court', value)} options={[{ value: '', label: 'Todas as quadras' }, ...data.courts.map(court => ({ value: court.id, label: court.name }))]} />
        <Field label="Situação da reserva" value={filters.status} onChange={value => filters.set('status', value)} options={[{ value: '', label: 'Todas' }, 'Confirmada', 'Chegou', 'Concluída', 'Cancelada', 'Bloqueio']} />
        <Search filters={filters} placeholder="Buscar reserva, cliente ou aula…" />
        {activeFilters > 0 && <Link className="secondary-link" to={clearFilters}>Limpar filtros</Link>}
      </div></Disclosure>
      <Disclosure title="Mais opções"><div className="arena-actions">
        {data.canWrite('reservations') && <Link className="secondary-link" to={filters.href('/agenda/recorrentes/novo', { date, court: courtId })}>+ Reservas semanais de um grupo</Link>}
        {data.canRead('courts') && <Link className="secondary-link" to="/quadras">Gerenciar quadras →</Link>}
        {data.canRead('classes') && <Link className="secondary-link" to="/escola">Turmas que usam as quadras →</Link>}
      </div></Disclosure>
    </div>
    {groupId && <p className="arena-message">Grupo semanal: <strong>{groupRows[0]?.groupTitle ?? 'Grupo selecionado'}</strong> · {groupRows.length} ocorrências <button className="text-button" onClick={() => filters.set('group', '')}>Ver todos os grupos</button></p>}
    {!showLessons && <p className="arena-hint">A seleção mostra somente reservas{reservationsOnly ? '' : ' e bloqueios'}. A disponibilidade também considera as aulas e os demais horários ocupados.</p>}
    {!validSelection ? <p className="arena-message arena-error" role="alert">{list ? 'Escolha datas válidas, em ordem, com até 366 dias no período.' : 'Escolha uma data válida para consultar a agenda.'}</p> : <>
      <div className="arena-list-summary" aria-live="polite"><strong>{!data.dataUpdatedAt ? 'Carregando seleção…' : incomplete ? selectedSchedule.isError ? 'Lista parcial · aulas indisponíveis' : 'Lista parcial · conferindo aulas' : `${entries.length} ${entries.length === 1 ? 'atividade' : 'atividades'}`}</strong>{!incomplete && <span>{rows.length} {rows.length === 1 ? 'reserva/bloqueio' : 'reservas/bloqueios'} · {entries.length - rows.length} {entries.length - rows.length === 1 ? 'aula' : 'aulas'}</span>}</div>
      {requiresSchedule && selectedSchedule.isError && <p className="arena-message arena-error" role="alert">As aulas não puderam ser consultadas. A lista está incompleta. <button type="button" className="text-button" onClick={() => void selectedSchedule.refetch()}>Tentar novamente</button></p>}
      {showLessons && !data.canRead('courts') && <p className="arena-hint">Seu acesso permite consultar reservas. Aulas e disponibilidade exigem acesso às quadras.</p>}
      {list ? entries.length ? <Pagination total={entries.length}>{(start, end) => renderEntries(entries.slice(start, end))}</Pagination> : !incomplete && <Empty>Nenhuma atividade corresponde aos filtros.</Empty> : courts.length ? <div className="arena-schedule">{courts.map(court => {
        const occupation = !schedule.isError ? schedule.data?.courts.find(item => item.courtId === court.id) : undefined
        const items = entries.filter(entry => entry.courtId === court.id)
        return <section className="arena-court-day" key={court.id} aria-label={court.name}>
          <div className="arena-section-heading"><div><h2>{court.name}</h2><p>Horário cadastrado: {court.openingTime}–{court.closingTime}</p></div><p>{availability(occupation, schedule.isError)}</p></div>
          {occupation?.schedulePending && !occupation.closedForDay && !occupation.closedForMaintenance && <p className="arena-hint">{data.canWrite('courts') ? <Link to="/quadras">Conferir agenda da quadra →</Link> : 'Peça à gestão para conferir os cadastros e horários.'}</p>}
          {occupation?.hasConflict && <p className="arena-message arena-error">Há horários sobrepostos ou fora do funcionamento. Confira as reservas e aulas.</p>}
          {schedule.isError && <button className="secondary-link" onClick={() => void schedule.refetch()}>Consultar disponibilidade novamente</button>}
          {renderEntries(items)}
          {!items.length && occupation && !incomplete && <p className="arena-hint">{activeFilters ? 'Nenhuma atividade corresponde aos filtros nesta quadra.' : 'Nenhuma atividade neste dia.'}</p>}
        </section>
      })}</div> : <Empty action={data.canWrite('courts') && <Link className="primary-link" to="/quadras">Cadastrar primeira quadra</Link>}>A agenda precisa de uma quadra cadastrada para mostrar horários e capacidade.</Empty>}
    </>}
  </main>
}
