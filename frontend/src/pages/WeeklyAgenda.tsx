import { useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Disclosure, useContextSearchParams } from '../components/managementUi'
import { useCourtScheduleRange } from '../features/arena/queries'
import { clockTime, dayAvailability, minuteOf, moveDate, reservationUrl, weekDates } from '../features/arena/agenda'
import type { CourtScheduleBlock } from '../features/arena/types'
import { useOperations } from '../features/operations/DemoDataProvider'
import { AgendaActivityDetails, type AgendaSelection } from './AgendaActivityDetails'
import { AgendaDays, agendaReferenceDate, changeAgendaView, type AgendaView } from './agendaNavigation'
import { AgendaAvailability, AvailabilityLegend } from './AgendaAvailability'
import { Empty, Feedback, Field, Heading, NoAccess, displayDate, quantity, today, useFilters, validDate } from './arenaUi'

type Item = AgendaSelection & { key: string; title: string; subtitle?: string; kind: 'aula' | 'mensalista' | 'locacao' | 'bloqueio' | 'livre'; courtId: string }
const labels = { aula: 'Aula', mensalista: 'Mensalista', locacao: 'Locação', bloqueio: 'Bloqueado', livre: 'Livre' }
const hours = (minutes: number) => `${quantity(minutes / 60)} h`

export function WeeklyAgenda() {
  const data = useOperations(), filters = useFilters()
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
  const valid = validDate(date) && date >= '0001-01-08' && date <= '9999-12-24'
  const dates = weekDates(valid ? date : today())
  const query = useCourtScheduleRange(dates[0], dates[6], valid)
  const gridRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<AgendaSelection | null>(null)
  const activity = filters.params.get('activity') === 'classes' ? 'aula' : filters.params.get('activity') ?? ''
  const search = filters.query.trim().toLocaleLowerCase('pt-BR')
  const reservationFiltersDisabled = ['aula', 'livre'].includes(activity)
  const status = reservationFiltersDisabled ? '' : filters.status
  const groupId = reservationFiltersDisabled ? '' : filters.params.get('group') ?? ''
  const courtId = data.courts.length === 1 ? data.courts[0].id : filters.params.get('court') ?? ''
  const courts = data.courts.filter(court => !courtId || court.id === courtId)
  const failed = query.isError || data.refreshFailed || data.persistenceStatus === 'error'
  const days = dates.map(day => ({ date: day, rows: !failed ? query.data?.days?.find(row => row.date === day)?.courts.filter(row => !courtId || row.courtId === courtId) ?? [] : [] }))
  const rows = days.flatMap(day => day.rows)
  const complete = !failed && Boolean(query.data) && courts.length > 0 && days.every(day => courts.every(court => day.rows.some(row => row.courtId === court.id)))
  const availableKnown = complete && rows.every(row => !row.schedulePending && row.availableMinutes !== null && row.freeIntervals != null)
  const occupiedKnown = complete && rows.every(row => row.occupiedMinutes !== undefined)
  const itemFor = (block: CourtScheduleBlock, day: string, courtId: string, index: number): Item => {
    const lesson = block.source === 'Aula' && data.canRead('classes') ? data.classes.find(row => row.id === block.sourceId) : undefined
    const reservation = block.source !== 'Aula' ? data.reservations.find(row => row.id === block.sourceId) : undefined
    const group = reservation?.rentalGroupId && data.canRead('rentalGroups') ? data.rentalGroups.find(row => row.id === reservation.rentalGroupId) : undefined
    const teacher = data.canRead('team') ? data.team.find(row => row.id === (lesson?.teacherId ?? reservation?.teacherId))?.name : undefined
    const kind = ['Aula','Aula experimental'].includes(block.source) ? 'aula' : block.source === 'Bloqueio' ? 'bloqueio' : reservation?.rentalGroupId ? 'mensalista' : 'locacao'
    return { key: `${day}-${courtId}-${index}`, date: day, courtId, startTime: block.startTime, endTime: block.endTime, isClass: block.source === 'Aula', lesson, reservation, kind,
      title: lesson?.name ?? group?.name ?? reservation?.name ?? labels[kind], subtitle: teacher ?? reservation?.customerName }
  }
  const dayItems = days.map(day => ({ ...day, items: day.rows.flatMap(row => row.blocks.map((block, index) => itemFor(block, day.date, row.courtId, index))) }))
  const allItems = dayItems.flatMap(day => day.items)
  const summary = (kind: Item['kind']) => {
    const items = allItems.filter(item => item.kind === kind)
    return `${items.length} · ${hours(items.reduce((sum, item) => sum + minuteOf(item.endTime) - minuteOf(item.startTime), 0))}`
  }
  const unclassified = allItems.some(item => item.kind === 'locacao' && !item.reservation)
  const matches = (item: Item) => (!activity || activity === item.kind || activity === 'reservations' && ['mensalista','locacao'].includes(item.kind))
    && (!status || item.reservation?.status === status) && (!groupId || item.reservation?.groupId === groupId)
    && (!search || `${item.title} ${item.subtitle ?? ''}`.toLocaleLowerCase('pt-BR').includes(search))
  const filtered = Boolean(activity || search || status || groupId || data.courts.length > 1 && courtId)
  const bounds = rows.flatMap(row => [minuteOf(row.openingTime), minuteOf(row.closingTime)]).concat(allItems.flatMap(item => [minuteOf(item.startTime), minuteOf(item.endTime)]))
  const begin = Math.floor(Math.min(...bounds, bounds.length ? 1440 : 360) / 60) * 60
  const end = Math.ceil(Math.max(...bounds, bounds.length ? 0 : 1440) / 60) * 60
  const ticks = Array.from({ length: (end - begin) / 60 + 1 }, (_, index) => begin + index * 60)
  function jumpToTime(target: 'now' | 'activity') {
    const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
    const now = minuteOf(parts)
    const upcoming = allItems.filter(item => item.date >= today() && (item.date !== today() || minuteOf(item.endTime) > now)).sort((a,b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
    const first = upcoming[0] ?? [...allItems].sort((a,b) => a.startTime.localeCompare(b.startTime))[0]
    const minute = target === 'now' ? now : first ? minuteOf(first.startTime) : begin
    gridRef.current?.scrollTo({ top: Math.max(0, minute - begin - 12) })
    gridRef.current?.focus({ preventScroll: true })
    gridRef.current?.scrollIntoView({ block: 'start' })
  }
  if (!data.canRead('reservations')) return <NoAccess />
  return <main className="operation-page arena-page agenda-page weekly-agenda">
    <Heading eyebrow="" title="Agenda" description="Veja os horários livres e ocupados por dia e por quadra." action={data.canWrite('reservations') && <Link className="primary-link" to={filters.href('/agenda/novo', { date, court: courtId, start: '', end: '' })}>+ Nova reserva</Link>} />
    <Feedback />
    <div className="agenda-controls"><div className="date-navigation"><button aria-label="Semana anterior" onClick={() => filters.set('date', moveDate(dates[0], -7))}>←</button><button onClick={() => filters.set('date', today())}>Esta semana</button><button aria-label="Próxima semana" onClick={() => filters.set('date', moveDate(dates[0], 7))}>→</button><strong>{displayDate(dates[0])} – {displayDate(dates[6])}</strong></div><Field label="Visualização" value="week" onChange={value => setParams(current => changeAgendaView(current, value as AgendaView, 'week'), { preventScrollReset: true })} options={[{ value:'week',label:'Semana' },{ value:'day',label:'Agenda do dia' },{ value:'list',label:'Lista no período' }]} />{data.courts.length > 1 && <Field label="Quadra" value={courtId} onChange={value => filters.set('court', value)} options={[{ value: '', label: 'Todas as quadras' }, ...data.courts.map(court => ({ value: court.id, label: court.name }))]} />}</div>
    {!valid ? <p role="alert" className="arena-message arena-error">Escolha uma data válida para consultar a semana.</p> : <>
      {data.canRead('courts') && <AgendaAvailability date={date} courts={courts} rows={days.find(day => day.date === date)?.rows ?? []} failed={failed} loading={!query.data && !query.isError} />}
      <Disclosure title="Resumo da semana"><section className="agenda-dashboard" aria-label="Resumo da semana" aria-live="polite">
        <article className="metric-free"><span>Horas livres</span><strong>{availableKnown ? hours(rows.reduce((sum,row) => sum + row.availableMinutes!,0)) : 'A confirmar'}</strong><small>{availableKnown ? 'No funcionamento cadastrado' : 'Disponibilidade não verificada'}</small></article>
        <article><span>Horas ocupadas</span><strong>{occupiedKnown ? hours(rows.reduce((sum,row) => sum + row.occupiedMinutes!,0)) : 'Parcial'}</strong><small>Sem duplicar sobreposições</small></article>
        <article className="metric-class"><span>Aulas</span><strong>{complete ? summary('aula') : 'Parcial'}</strong><small>Encontros · duração</small></article>
        <article className="metric-member"><span>Mensalistas</span><strong>{complete && !unclassified ? summary('mensalista') : 'Parcial'}</strong><small>Encontros · duração</small></article>
      </section>
      {complete && <p className="agenda-breakdown">Locações: {summary('locacao')} · Bloqueios: {summary('bloqueio')}{unclassified && ' · Classificação de reservas incompleta'}</p>}
      </Disclosure>
      {rows.some(row => row.hasConflict) && <p className="arena-message arena-error" role="alert">Há sobreposições ou atividades fora do funcionamento. As durações por atividade podem se sobrepor; o total ocupado não duplica os minutos.</p>}
      {!availableKnown && complete && <p className="arena-hint">Os horários vazios ficam a confirmar até a conferência do funcionamento e dos cadastros. {data.canWrite('courts') && <Link to="/agenda/funcionamento">Conferir funcionamento →</Link>}</p>}
      <div className="agenda-options"><Disclosure title={filtered ? 'Filtros · ativos' : 'Filtros'}><div className="arena-toolbar"><Field label="Data de referência" type="date" value={date} onChange={value => filters.set('date',value)} /><Field label="Destacar atividade" value={activity} onChange={setActivity} options={[{value:'',label:'Todas'}, {value:'reservations',label:'Reservas'}, {value:'aula',label:'Aulas'}, {value:'mensalista',label:'Mensalistas'}, {value:'locacao',label:'Locações'}, {value:'bloqueio',label:'Bloqueios'}, {value:'livre',label:'Horários livres'}]} /><Field label="Buscar atividade" value={filters.query} onChange={value => filters.set('q',value)} /></div></Disclosure><Disclosure title="Mais opções"><div className="arena-actions">{data.canWrite('reservations') && <Link to={filters.href('/agenda/recorrentes/novo', { date, court: courtId })}>Reservas semanais de um grupo →</Link>}{data.canRead('courts') && <Link to="/agenda/funcionamento">Funcionamento →</Link>}</div></Disclosure></div>
      <AvailabilityLegend />
      <Disclosure title="Tipos de atividade"><div className="agenda-legend" aria-label="Legenda">{Object.entries(labels).filter(([key]) => key !== 'livre').map(([key,label]) => <span key={key} className={`legend-${key}`}>{label}</span>)}</div></Disclosure>
      {filtered && <div className="agenda-filter-state"><span>Destacando: {[activity && (activity === 'reservations' ? 'Reservas' : labels[activity as Item['kind']]), search && `“${filters.query}”`, status, groupId && 'Grupo semanal', data.courts.length > 1 && courtId && (data.courts.find(court => court.id === courtId)?.name ?? 'Quadra selecionada')].filter(Boolean).join(' · ')}. As outras atividades permanecem na grade e continuam ocupando seus horários.</span><Link to={filters.href('/agenda', { activity:'',q:'',status:'',group:'',court:'' })}>Limpar filtros</Link></div>}
      <div className="agenda-week-shortcuts"><AgendaDays date={date} /><div className="agenda-time-shortcuts" aria-label="Navegar pelos horários"><button type="button" onClick={() => jumpToTime('now')}>Agora</button><button type="button" disabled={!allItems.length} onClick={() => jumpToTime('activity')}>Ver atividades</button><button type="button" onClick={() => gridRef.current?.scrollTo({ top: 0 })}>Início do dia</button></div></div>
      {!data.canRead('courts') ? <p>Acesso às aulas e à disponibilidade restrito.</p> : failed ? <p role="alert" className="arena-message arena-error">Agenda incompleta. Não foi possível conferir os horários. <button className="text-button" onClick={() => { void data.reload(); void query.refetch() }}>Tentar novamente</button></p> : !query.data ? <p role="status">Consultando a semana…</p> : !rows.length ? <Empty>Cadastre o funcionamento para consultar a disponibilidade.</Empty> : <div ref={gridRef} className="agenda-week-grid" tabIndex={0} role="region" aria-label="Grade de horários da semana" style={{ '--agenda-height': `${end - begin}px` } as CSSProperties}>
        <div className="week-axis" aria-hidden="true"><div className="week-day-heading">Horário</div><div className="week-axis-body">{ticks.map(tick => <span key={tick} style={{ top: tick - begin }}>{clockTime(tick)}</span>)}</div></div>
        {dayItems.map(day => {
          const pendingCourts = courts.filter(court => {
            const row = day.rows.find(item => item.courtId === court.id)
            return !row || !row.closedForDay && !row.closedForMaintenance && (row.schedulePending || row.freeIntervals == null)
          })
          const unverified = pendingCourts.length > 0
          const allClosed = day.rows.length > 0 && day.rows.every(row => row.closedForDay || row.closedForMaintenance)
          const free: Item[] = day.rows.flatMap(row => row.schedulePending || row.closedForDay || row.closedForMaintenance ? [] : (row.freeIntervals ?? []).map((interval,index) => ({ ...interval, date: day.date, courtId: row.courtId, key: `free-${day.date}-${row.courtId}-${index}`, title:'Livre', kind:'livre' })))
          const items = [...day.items,...free].sort((a,b) => a.startTime.localeCompare(b.startTime))
          const laneEnds: number[] = []
          const positioned = items.map(item => { const start = minuteOf(item.startTime); let lane = laneEnds.findIndex(last => last <= start); if (lane < 0) lane = laneEnds.length; laneEnds[lane] = Math.max(minuteOf(item.endTime),start + 44); return { item,lane } })
          const lanes = Math.max(1,laneEnds.length)
          return <section className={`week-day ${day.date === today() ? 'is-today' : ''}`} key={day.date} aria-label={displayDate(day.date)}>
            <header className="week-day-heading"><strong>{new Date(`${day.date}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday:'short',timeZone:'UTC' })} {day.date.slice(8)}/{day.date.slice(5,7)}</strong><small>{day.rows.length ? [...new Set(day.rows.map(dayAvailability))].join(' · ') : 'A confirmar'}</small></header>
            <div className={`week-day-body${unverified || allClosed ? ' is-unverified' : ''}`}>{(unverified || allClosed) && <p className="week-availability-state">{allClosed ? day.rows.every(row => row.closedForMaintenance) ? 'Em manutenção · sem horários livres' : 'Fechado · sem horários livres' : data.courts.length > 1 ? `A confirmar: ${pendingCourts.map(court => court.name).join(', ')}` : 'Horários vazios a confirmar'}</p>}{positioned.map(({item,lane}) => {
              const style = { top: minuteOf(item.startTime) - begin, height: Math.max(44, minuteOf(item.endTime) - minuteOf(item.startTime)), left:`${lane / lanes * 100}%`, width:`${100 / lanes}%` }
              const courtName = data.courts.find(court => court.id === item.courtId)?.name ?? 'Quadra'
              const content = <><span className="week-item-availability">{item.kind === 'livre' ? 'Livre' : item.kind === 'bloqueio' ? 'Bloqueado' : 'Ocupado'}</span><strong>{item.startTime}–{item.endTime}</strong>{data.courts.length > 1 && <small className="week-item-court">{courtName}</small>}{item.kind !== 'livre' && <span className="week-item-kind">{labels[item.kind]} · {item.title}</span>}{item.subtitle && item.kind !== 'livre' && <small>{item.subtitle}</small>}{item.kind === 'livre' && data.canWrite('reservations') && <small>+ Nova reserva</small>}</>
              const className = `week-item kind-${item.kind}${filtered && !matches(item) ? ' is-muted' : ''}`
              return item.kind === 'livre' ? data.canWrite('reservations') ? <Link key={item.key} style={style} className={className} aria-label={`Nova reserva ${displayDate(item.date)} ${item.startTime}–${item.endTime}${data.courts.length > 1 ? ` · ${courtName}` : ''}`} to={reservationUrl(item.date,item.courtId,item.startTime,item.endTime,'week',filters.params)}>{content}</Link> : <div key={item.key} style={style} className={className}>{content}</div> : <button key={item.key} style={style} className={className} aria-label={`${labels[item.kind]} · ${item.startTime}–${item.endTime} · ${item.title}${data.courts.length > 1 ? ` · ${courtName}` : ''} · ${item.kind === 'bloqueio' ? 'Bloqueado' : 'Ocupado'}`} title={`${labels[item.kind]} · ${item.title} · ${item.startTime}–${item.endTime}${data.courts.length > 1 ? ` · ${courtName}` : ''}`} onClick={() => setSelected(item)}>{content}</button>
            })}{!items.length && !unverified && !allClosed && <p className="week-empty">Nenhuma atividade registrada no funcionamento conferido.</p>}</div>
          </section>
        })}
      </div>}
    </>}
    {selected && <AgendaActivityDetails selected={selected} onClose={() => setSelected(null)} />}
  </main>
}
