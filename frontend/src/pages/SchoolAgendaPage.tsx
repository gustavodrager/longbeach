import { ContextLink } from '../components/managementUi'
import { useOperations } from '../features/operations/DemoDataProvider'
import { AgendaPage } from './AgendaPage'
import { SchoolViewNavigation } from './AgendaViewNavigation'
import { Heading, NoAccess } from './arenaUi'

export function SchoolAgendaPage() {
  const data = useOperations()
  if (!data.canRead('classes') || !data.canRead('reservations') || !data.canRead('courts')) return <NoAccess />
  return <AgendaPage context="school" header={<>
    <Heading eyebrow="" title="Aulas" action={data.canWrite('classes') && <ContextLink state={{ returnLabel: 'Aulas' }} className="primary-link" to="/escola/novo">Nova turma</ContextLink>} />
    <SchoolViewNavigation active="agenda" />
  </>} />
}
