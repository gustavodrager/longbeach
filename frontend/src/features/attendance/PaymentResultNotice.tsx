import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { hasStaffMenu } from '../auth/access'
import { useBarData, type Tab } from './api'

export function PaymentResultNotice() {
  const location = useLocation(); const { user } = useAuth()
  const notice = location.state?.paymentNotice as { tabId?: string; paymentId?: string; title?: string } | undefined
  const valid = typeof notice?.tabId === 'string' && typeof notice?.paymentId === 'string'
  const query = useBarData<Tab>(`/tabs/${encodeURIComponent(notice?.tabId ?? '')}`, valid)
  if (!valid) return null
  return <section className="ux-notice success" role="status">
    <strong>{notice?.title}: pagamento recebido.</strong>
    <p>{query.data?.state === 'Closed' ? 'Comanda encerrada automaticamente.' : query.data && query.data.due === 0 && query.data.pending === 0 && query.data.items.some(item => ['Requested', 'Accepted'].includes(item.state)) ? 'Paga — aguardando entrega. Será encerrada automaticamente ao concluir as entregas.' : 'Consulte a comanda para conferir o saldo e as pendências.'}</p>
    <Link className="ux-button secondary" to={`/atendimento/comprovante/${encodeURIComponent(notice!.tabId!)}/${encodeURIComponent(notice!.paymentId!)}`}>Ver comprovante</Link>
    {hasStaffMenu(user,'bar.tabs') && <Link className="ux-button secondary" to={`/atendimento/comandas/${encodeURIComponent(notice!.tabId!)}`}>Ver comanda</Link>}
  </section>
}
