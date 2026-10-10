import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Disclosure } from '../components/managementUi'
import { useCourtScheduleRange } from '../features/arena/queries'
import { clockTime, dayAvailability, minuteOf, moveDate, reservationUrl, weekDates } from '../features/arena/agenda'
import type { CourtScheduleBlock } from '../features/arena/types'
import { useOperations } from '../features/operations/DemoDataProvider'
import { AgendaActivityDetails, type AgendaSelection } from './AgendaActivityDetails'
import { Empty, Feedback, Field, Heading, NoAccess, displayDate, quantity, today, useFilters, validDate } from './arenaUi'

type Item = AgendaSelection & { key: string; title: string; subtitle?: string; kind: 'aula' | 'mensalista' | 'locacao' | 'bloqueio' | 'livre'; courtId: string }
const labels = { aula: 'Aula', mensalista: 'Mensalista', locacao: 'Locação', bloqueio: 'Bloqueado', livre: 'Livre' }
const hours = (minutes: number) => `${quantity(minutes / 60)} h`

export function WeeklyAgenda() {
  const data = useOperations(), filters = useFilters()
  const date = filters.params.get('date') ?? today()
  const valid = validDate(date) && date >= '0001-01-08' && date <= '9999-12-24'
  const dates = weekDates(valid ? date : today())
  const query = useCourtScheduleRange(dates[0], dates[6], valid)
  const [selected, setSelected] = useState<AgendaSelection | null>(null)
  const activity = filters.params.get('activity') ?? ''
  const search = filters.query.trim().toLocaleLowerCase('pt-BR')
  const groupId = filters.params.get('group') ?? ''
  const legacyCourt = data.courts.length > 1 ? filters.params.get('court') : null
  const failed = query.isError || data.refreshFailed || data.persistenceStatus === 'error'
  const days = dates.map(day => ({ date: day, rows: !failed ? query.data?.days?.find(row => row.date === day)?.courts.filter(row => !legacyCourt || row.courtId === legacyCourt) ?? [] : [] }))
  const rows = days.flatMap(day => day.rows)
  const complete = !failed && Boolean(query.data) && days.every(day => day.rows.length > 0)
  const availableKnown = complete && rows.every(row => !row.schedulePending && row.availableMinutes !== null && row.freeIntervals != null)
  const occupiedKnown = complete && rows.every(row => row.occupiedMinutes !== undefined)
  const itemFor = (block: CourtScheduleBlock, day: string, courtId: string, index: number): Item => {
    const lesson = block.source === 'Aula' && data.canRead('classes') ? data.classes.find(row => row.id === block.sourceId) : undefined
    const reservation = block.source !== 'Aula' ? data.reservations.find(row => row.id === block.sourceId) : undefined
    const group = reservation?.rentalGroupId && data.canRead('rentalGroups') ? data.rentalGroups.find(row => row.id === reservation.rentalGroupId) : undefined
    const teacher = lesson && data.canRead('team') ? data.team.find(row => row.id === lesson.teacherId)?.name : undefined
    const kind = block.source === 'Aula' ? 'aula' : block.source === 'Bloqueio' ? 'bloqueio' : reservation?.rentalGroupId ? 'mensalista' : 'locacao'
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
    && (!filters.status || item.reservation?.status === filters.status) && (!groupId || item.reservation?.groupId === groupId)
    && (!search || `${item.title} ${item.subtitle ?? ''}`.toLocaleLowerCase('pt-BR').includes(search))
  const filtered = Boolean(activity || search || filters.status || groupId)
  const bounds = rows.flatMap(row => [minuteOf(row.openingTime), minuteOf(row.closingTime)]).concat(allItems.flatMap(item => [minuteOf(item.startTime), minuteOf(item.endTime)]))
  const begin = Math.floor(Math.min(...bounds, bounds.length ? 1440 : 360) / 60) * 60
  const end = Math.ceil(Math.max(...bounds, bounds.length ? 0 : 1440) / 60) * 60
  const ticks = Array.from({ length: (end - begin) / 60 + 1 }, (_, index) => begin + index * 60)
  if (!data.canRead('reservations')) return <NoAccess />
  return <main className="operation-page arena-page agenda-page weekly-agenda">
    <Heading title="Agenda e recepção" description="Sua semana: horários livres, aulas e mensalistas." action={data.canWrite('reservations') && <Link className="primary-link" to={filters.href('/agenda/novo', { date, court: data.courts.length === 1 ? data.courts[0].id : '', start: '', end: '' })}>+ Nova reserva</Link>} />
    <Feedback />
    <div className="agenda-controls"><div className="date-navigation"><button aria-label="Semana anterior" onClick={() => filters.set('date', moveDate(dates[0], -7))}>←</button><button onClick={() => filters.set('date', today())}>Esta semana</button><button aria-label="Próxima semana" onClick={() => filters.set('date', moveDate(dates[0], 7))}>→</button><strong>{displayDate(dates[0])} – {displayDate(dates[6])}</strong></div><Field label="Visualização" value="week" onChange={value => filters.set('view', value)} options={[{ value:'week',label:'Semana' },{ value:'day',label:'Agenda do dia' },{ value:'list',label:'Lista no período' }]} /></div>
    {!valid ? <p role="alert" className="arena-message arena-error">Escolha uma data válida para consultar a semana.</p> : <>
      <section className="agenda-dashboard" aria-label="Resumo da semana" aria-live="polite">
        <article className="metric-free"><span>Horas livres</span><strong>{availableKnown ? hours(rows.reduce((sum,row) => sum + row.availableMinutes!,0)) : 'A confirmar'}</strong><small>{availableKnown ? 'No funcionamento cadastrado' : 'Disponibilidade não verificada'}</small></article>
        <article><span>Horas ocupadas</span><strong>{occupiedKnown ? hours(rows.reduce((sum,row) => sum + row.occupiedMinutes!,0)) : 'Parcial'}</strong><small>Sem duplicar sobreposições</small></article>
        <article className="metric-class"><span>Aulas</span><strong>{complete ? summary('aula') : 'Parcial'}</strong><small>Encontros · duração</small></article>
        <article className="metric-member"><span>Mensalistas</span><strong>{complete && !unclassified ? summary('mensalista') : 'Parcial'}</strong><small>Encontros · duração</small></article>
      </section>
      {complete && <p className="agenda-breakdown">Locações: {summary('locacao')} · Bloqueios: {summary('bloqueio')}{unclassified && ' · Classificação de reservas incompleta'}</p>}
      {rows.some(row => row.hasConflict) && <p className="arena-message arena-error" role="alert">Há sobreposições ou atividades fora do funcionamento. As durações por atividade podem se sobrepor; o total ocupado não duplica os minutos.</p>}
      {!availableKnown && complete && <p className="arena-hint">Os horários vazios ficam a confirmar até a conferência do funcionamento e dos cadastros. {data.canWrite('courts') && <Link to="/quadras">Conferir funcionamento →</Link>}</p>}
      <div className="agenda-options"><Disclosure title={filtered ? 'Filtros · ativos' : 'Filtros'}><div className="arena-toolbar"><Field label="Data de referência" type="date" value={date} onChange={value => filters.set('date',value)} /><Field label="Destacar atividade" value={activity} onChange={value => filters.set('activity',value)} options={[{value:'',label:'Todas'}, {value:'aula',label:'Aulas'}, {value:'mensalista',label:'Mensalistas'}, {value:'locacao',label:'Locações'}, {value:'bloqueio',label:'Bloqueios'}, {value:'livre',label:'Horários livres'}]} /><Field label="Buscar atividade" value={filters.query} onChange={value => filters.set('q',value)} />{filtered && <Link to={filters.href('/agenda', { activity:'',q:'',status:'',group:'' })}>Limpar filtros</Link>}</div></Disclosure><Disclosure title="Mais opções"><div className="arena-actions">{data.canWrite('reservations') && <Link to={filters.href('/agenda/recorrentes/novo', { date, court: data.courts.length === 1 ? data.courts[0].id : '' })}>Reservas semanais de um grupo →</Link>}{data.canRead('courts') && <Link to="/quadras">Funcionamento →</Link>}</div></Disclosure></div>
      <div className="agenda-legend" aria-label="Legenda">{Object.entries(labels).map(([key,label]) => <span key={key} className={`legend-${key}`}>{label}</span>)}<span>A confirmar</span></div>
      {filtered && <p className="arena-hint">Resultados destacados. As demais atividades continuam ocupando seus horários; o resumo considera a semana inteira.</p>}
      {!data.canRead('courts') ? <p>Acesso às aulas e à disponibilidade restrito.</p> : failed ? <p role="alert" className="arena-message arena-error">Agenda incompleta. Não foi possível conferir os horários. <button className="text-button" onClick={() => { void data.reload(); void query.refetch() }}>Tentar novamente</button></p> : !query.data ? <p role="status">Consultando a semana…</p> : !rows.length ? <Empty>Cadastre o funcionamento para consultar a disponibilidade.</Empty> : <div className="agenda-week-grid" style={{ '--agenda-height': `${end - begin}px` } as CSSProperties}>
        <div className="week-axis" aria-hidden="true"><div className="week-day-heading">Horário</div><div className="week-axis-body">{ticks.map(tick => <span key={tick} style={{ top: tick - begin }}>{clockTime(tick)}</span>)}</div></div>
        {dayItems.map(day => {
          const free: Item[] = day.rows.flatMap(row => row.schedulePending || row.closedForDay || row.closedForMaintenance ? [] : (row.freeIntervals ?? []).map((interval,index) => ({ ...interval, date: day.date, courtId: row.courtId, key: `free-${day.date}-${row.courtId}-${index}`, title:'Livre', kind:'livre' })))
          const items = [...day.items,...free].sort((a,b) => a.startTime.localeCompare(b.startTime))
          const laneEnds: number[] = []
          const positioned = items.map(item => { const start = minuteOf(item.startTime); let lane = laneEnds.findIndex(last => last <= start); if (lane < 0) lane = laneEnds.length; laneEnds[lane] = Math.max(minuteOf(item.endTime),start + 44); return { item,lane } })
          const lanes = Math.max(1,laneEnds.length)
          return <section className={`week-day ${day.date === today() ? 'is-today' : ''}`} key={day.date} aria-label={displayDate(day.date)}>
            <header className="week-day-heading"><strong>{new Date(`${day.date}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday:'short',timeZone:'UTC' })} {day.date.slice(8)}/{day.date.slice(5,7)}</strong><small>{day.rows.length ? [...new Set(day.rows.map(dayAvailability))].join(' · ') : 'A confirmar'}</small></header>
            <div className="week-day-body">{positioned.map(({item,lane}) => {
              const style = { top: minuteOf(item.startTime) - begin, height: Math.max(44, minuteOf(item.endTime) - minuteOf(item.startTime)), left:`${lane / lanes * 100}%`, width:`${100 / lanes}%` }
              const content = <><span className="week-item-kind">{labels[item.kind]}</span><strong>{item.startTime}–{item.endTime}</strong>{item.kind !== 'livre' && <span>{item.title}</span>}{item.subtitle && item.kind !== 'livre' && <small>{item.subtitle}</small>}{item.kind === 'livre' && data.canWrite('reservations') && <small>+ Nova reserva</small>}</>
              const className = `week-item kind-${item.kind}${filtered && !matches(item) ? ' is-muted' : ''}`
              return item.kind === 'livre' ? data.canWrite('reservations') ? <Link key={item.key} style={style} className={className} aria-label={`Nova reserva ${displayDate(item.date)} ${item.startTime}–${item.endTime}`} to={reservationUrl(item.date,item.courtId,item.startTime,item.endTime)}>{content}</Link> : <div key={item.key} style={style} className={className}>{content}</div> : <button key={item.key} style={style} className={className} title={`${labels[item.kind]} · ${item.title} · ${item.startTime}–${item.endTime}`} onClick={() => setSelected(item)}>{content}</button>
            })}{!items.length && <p className="week-empty">{day.rows.some(row => row.closedForDay || row.closedForMaintenance) ? 'Sem atividades registradas' : 'Nenhuma atividade registrada. Disponibilidade a confirmar.'}</p>}</div>
          </section>
        })}
      </div>}
    </>}
    {selected && <AgendaActivityDetails selected={selected} onClose={() => setSelected(null)} />}
  </main>
}
