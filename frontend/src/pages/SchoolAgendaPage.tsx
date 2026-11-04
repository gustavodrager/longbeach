import { ContextLink } from '../components/managementUi'
import { useOperations } from '../features/operations/DemoDataProvider'
import { AgendaPage } from './AgendaPage'
import { SchoolViewNavigation } from './AgendaViewNavigation'
import { Heading, NoAccess } from './arenaUi'
import { ClassDeletionNotice } from './ClassDeletionAction'

export function SchoolAgendaPage() {
  const data = useOperations()
  if (!data.canRead('classes') || !(data.canLookup?.('reservations') ?? data.canRead('reservations')) || !(data.canLookup?.('courts') ?? data.canRead('courts'))) return <NoAccess />
  return <AgendaPage context="school" header={<>
    <Heading eyebrow="" title="Aulas" action={data.canWrite('classes') && <ContextLink state={{ returnLabel: 'Aulas' }} className="primary-link" to="/escola/novo">Nova turma</ContextLink>} />
    <ClassDeletionNotice />
    <SchoolViewNavigation active="agenda" />
  </>} />
}
