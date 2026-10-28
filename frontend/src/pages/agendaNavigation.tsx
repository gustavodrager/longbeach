import { useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { displayDate, today, useFilters, validDate } from './arenaUi'
import { weekDates } from '../features/arena/agenda'

export type AgendaView = 'day' | 'week' | 'list'

export function agendaReferenceDate(params: URLSearchParams, fallback = today()): string {
  return (params.get('view') === 'list'
    ? params.get('from') ?? params.get('date')
    : params.get('date') ?? params.get('from')) ?? fallback
}

export function changeAgendaView(params: URLSearchParams, target: AgendaView, source: AgendaView): URLSearchParams {
  const next = new URLSearchParams(params)
  // The effective view can come from the responsive default, without a URL key.
  next.set('view', source)
  const reference = agendaReferenceDate(next)
  next.set('view', target)
  for (const key of ['acao', 'registro', 'page']) next.delete(key)
  next.set('date', reference)
  if (target === 'list') {
    let from = reference
    let to = source === 'list' ? next.get('to') ?? reference : reference
    if (source === 'week' && validDate(reference) && reference >= '0001-01-08' && reference <= '9999-12-24') {
      const dates = weekDates(reference)
      from = dates[0]; to = dates[6]
    }
    // Keep invalid input intact for the receiving view's validation.
    next.set('from', from); next.set('to', to); next.set('date', from)
  }
  return next
}

const compactQuery = '(max-width: 700px)'
function subscribeCompact(onChange: () => void) {
  const query = window.matchMedia?.(compactQuery)
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}
export function useCompactAgenda() {
  return useSyncExternalStore(subscribeCompact, () => window.matchMedia?.(compactQuery).matches ?? false, () => false)
}

export function AgendaDays({ date }: { date: string }) {
  const filters = useFilters()
  const dates = weekDates(validDate(date) && date >= '0001-01-08' && date <= '9999-12-24' ? date : today())
  return <nav className="agenda-days" aria-label="Escolher dia da semana">{dates.map(day => <Link key={day} to={filters.href('/agenda', { date: day, view: 'day' })} aria-current={day === date ? 'date' : undefined} aria-label={`${displayDate(day)}${day === today() ? ', hoje' : ''}`} className={day === today() ? 'is-today' : ''}>
    <span>{new Date(`${day}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')}</span><strong>{day.slice(8)}</strong>
  </Link>)}</nav>
}
