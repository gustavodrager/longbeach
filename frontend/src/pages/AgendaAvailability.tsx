import { Link } from 'react-router-dom'
import type { Court, CourtScheduleRow } from '../features/arena/types'
import { clockTime, minuteOf } from '../features/arena/agenda'
import { displayDate, useFilters } from './arenaUi'

export function occupiedIntervals(row: CourtScheduleRow) {
  const intervals: { startTime: string; endTime: string }[] = []
  const begin = minuteOf(row.openingTime), end = minuteOf(row.closingTime)
  for (const block of [...row.blocks].sort((a, b) => a.startTime.localeCompare(b.startTime))) {
    const start = Math.max(begin, minuteOf(block.startTime)), finish = Math.min(end, minuteOf(block.endTime))
    if (finish <= start) continue
    const last = intervals.at(-1)
    if (last && minuteOf(last.endTime) >= start) last.endTime = clockTime(Math.max(minuteOf(last.endTime), finish))
    else intervals.push({ startTime: clockTime(start), endTime: clockTime(finish) })
  }
  return intervals
}

export function AvailabilityLegend() {
  return <div className="availability-legend" aria-label="Disponibilidade dos horários">
    <span className="availability-free">Livre para reservar</span>
    <span className="availability-occupied">Ocupado por reserva ou aula</span>
    <span className="availability-closed">Fechado ou em manutenção</span>
    <span className="availability-pending">A confirmar</span>
  </div>
}

export function AgendaAvailability({ date, courts, rows, failed, loading }: {
  date: string; courts: Court[]; rows: CourtScheduleRow[]; failed: boolean; loading: boolean
}) {
  const filters = useFilters()
  if (!courts.length) return null
  const href = (activity: string) => filters.href('/agenda', { date, view: 'day', activity, status: '', group: '', q: '', page: '', start: '', end: '' })
  return <section className="agenda-availability" aria-label={`Disponibilidade em ${displayDate(date)}`}>
    <div className="agenda-availability-heading"><div><h2>Livres e ocupados · {displayDate(date)}</h2><p>Considere todas as reservas, aulas e bloqueios, mesmo com filtros ativos.</p></div>
      <div className="agenda-availability-actions"><Link className="availability-free-link" to={href('livre')}>Ver horários livres</Link><Link to={href('')}>Ver todas as atividades</Link></div>
    </div>
    <div className="agenda-availability-courts">{courts.map(court => {
      const row = rows.find(item => item.courtId === court.id)
      const pending = !row || row.schedulePending || row.availableMinutes === null || row.freeIntervals == null
      const closed = row?.closedForMaintenance || row?.closedForDay
      const occupied = row ? occupiedIntervals(row) : []
      return <div className="agenda-availability-court" key={court.id}>
        {courts.length > 1 && <h3>{court.name}</h3>}
        {failed ? <p className="availability-unverified">Não foi possível conferir estes horários. Não há vagas confirmadas nesta consulta.</p>
          : loading ? <p className="availability-unverified">Consultando os horários…</p>
          : !row ? <p className="availability-unverified">Não foi possível conferir os horários desta quadra. Não há vagas confirmadas nesta consulta.</p>
          : closed ? <p className="availability-unverified">{row.closedForMaintenance ? 'Em manutenção' : 'Fechado neste dia'} · sem horários para reservar.</p>
          : pending ? <p className="availability-unverified">Horários ainda não conferidos. Aguarde a confirmação do funcionamento.</p>
          : <dl className="availability-intervals">
            <div className="availability-free"><dt>Livre para reservar</dt><dd>{row.freeIntervals!.length ? row.freeIntervals!.map(interval => <span key={interval.startTime}>{interval.startTime}–{interval.endTime}</span>) : 'Sem horários livres neste dia'}</dd></div>
            <div className="availability-occupied"><dt>Ocupado</dt><dd>{occupied.length ? occupied.map(interval => <span key={interval.startTime}>{interval.startTime}–{interval.endTime}</span>) : row.availableMinutes === 0 ? 'Sem disponibilidade para reservas' : 'Nenhuma ocupação registrada'}</dd></div>
          </dl>}
      </div>
    })}</div>
  </section>
}
