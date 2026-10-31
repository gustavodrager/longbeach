import { Link, useLocation } from 'react-router-dom'
import { agendaReferenceDate } from './agendaNavigation'
import { today, validDate } from './arenaUi'
import './agenda-view-navigation.css'

type ViewNavigationProps = { active: 'agenda' | 'records'; disabled?: boolean }

function AgendaViewNavigation({ active, disabled = false, kind }: ViewNavigationProps & { kind: 'rentals' | 'school' }) {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const reference = agendaReferenceDate(params)
  const date = validDate(reference) ? reference : today()
  const directory = kind === 'rentals' ? '/mensalistas' : '/escola'
  const month = params.get('month')
  const calendarDate = kind === 'rentals' && month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ? month === today().slice(0, 7) ? today() : `${month}-01`
    : today()
  const recordsQuery = kind === 'rentals' ? `?month=${date.slice(0, 7)}` : ''
  const items = [
    { value: 'records', label: kind === 'rentals' ? 'Grupos' : 'Turmas', href: directory + (active === 'records' ? location.search : recordsQuery) },
    { value: 'agenda', label: 'Agenda', href: `${directory}/agenda${active === 'agenda' ? location.search : `?date=${calendarDate}`}` },
  ]
  return <nav className="agenda-view-navigation" aria-label={kind === 'rentals' ? 'Visão de mensalistas' : 'Visão de aulas'}>
    {items.map(item => disabled && item.value !== active
      ? <span key={item.value} aria-disabled="true">{item.label}</span>
      : <Link key={item.value} to={item.href} state={location.state} aria-current={item.value === active ? 'page' : undefined}>{item.label}</Link>)}
  </nav>
}

export const RentalViewNavigation = (props: ViewNavigationProps) => <AgendaViewNavigation {...props} kind="rentals" />
export const SchoolViewNavigation = (props: ViewNavigationProps) => <AgendaViewNavigation {...props} kind="school" />
