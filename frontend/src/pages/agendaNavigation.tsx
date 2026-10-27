import { useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { displayDate, today, useFilters, validDate } from './arenaUi'
import { weekDates } from '../features/arena/agenda'

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
