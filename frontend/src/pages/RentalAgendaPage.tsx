import { ContextLink } from '../components/managementUi'
import { useOperations } from '../features/operations/DemoDataProvider'
import { AgendaPage } from './AgendaPage'
import { RentalViewNavigation } from './AgendaViewNavigation'
import { Heading, NoAccess } from './arenaUi'

export function RentalAgendaPage() {
  const data = useOperations()
  if (!data.canRead('rentalGroups') || !data.canRead('reservations') || !data.canRead('courts')) return <NoAccess />
  return <AgendaPage context="monthly" header={<>
    <Heading eyebrow="" title="Mensalistas" action={data.canWrite('rentalGroups') && <ContextLink state={{ returnLabel: 'Mensalistas' }} className="primary-link" to="/mensalistas/novo">+ Cadastrar grupo</ContextLink>} />
    <RentalViewNavigation active="agenda" />
  </>} />
}
