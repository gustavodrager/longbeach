import { Route, Routes } from 'react-router-dom'
import { Heading, NoAccess } from '../../pages/arenaUi'
import { useAuth } from '../auth/authContext'
import { hasPermission } from '../auth/access'
import { MessagingDelivery, MessagingRuntime, messagingSession, useMessagingEnvironment, useMessagingQuery, type Capabilities, type Connection } from './api'
import { Conversations } from './Conversations'
import { Sends } from './Sends'
import { Automation } from './Automation'
import { ConnectionStatus } from './ConnectionPanel'
import './messaging.css'

export function MessagingPage() {
  const { user } = useAuth()
  if (!hasPermission(user, 'messaging:read')) return <NoAccess />
  return <MessagingWorkspace key={messagingSession(user)} />
}
function MessagingWorkspace() {
  const environment = useMessagingEnvironment()
  return <MessagingRuntime.Provider value={environment}><MessagingViews online={environment.online} /></MessagingRuntime.Provider>
}
function MessagingViews({ online }: { online: boolean }) {
  const connection = useMessagingQuery<Connection>('/connection', 15_000)
  const capabilities = useMessagingQuery<Capabilities>('/capabilities', 15_000)
  const waiting = capabilities.data?.dispatchEnabled !== true || connection.data?.state !== 'Connected' || connection.isError || capabilities.isError
  return <MessagingDelivery.Provider value={{ waiting }}><main className="operation-page arena-page whatsapp-page"><Heading eyebrow="" title="WhatsApp" /><ConnectionStatus />{!online && <p className="whatsapp-offline" role="alert">Sem conexão. As últimas mensagens ficam disponíveis para consulta e seus rascunhos são preservados. Os envios serão liberados ao reconectar.</p>}<Routes><Route index element={<Conversations />} /><Route path="conversas/:conversationId" element={<Conversations />} /><Route path="envios" element={<Sends />} /><Route path="automacao" element={<Automation />} /><Route path="*" element={<p>Esta seção não foi encontrada. Use a navegação do WhatsApp.</p>} /></Routes></main></MessagingDelivery.Provider>
}
