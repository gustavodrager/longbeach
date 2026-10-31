import { Link, useParams } from 'react-router-dom'
import './service-clean.css'
import { CardRecovery } from '../billing/CardRecovery'
import { PixRecovery } from './PixRecovery'
import { PixDetails } from './PaymentPages'
import { BarFrame, LoadState, useBarConnection } from './Core'
import { Feedback, Header } from './components'
import { postBar, useBarCommand, useBarData, type Tab, type TabPayment } from './api'

/** Recovery only: no new operation, amount or payment method can be selected here. */
export function OnlinePaymentRecoveryPage() {
  const { tabId = '', paymentId = '' } = useParams()
  const query = useBarData<Tab>(`/tabs/${tabId}`)
  const config = useBarData<{cardPublicKey?: string}>('/payments/config')
  const command = useBarCommand(); const connection = useBarConnection()
  const payment = !query.isError && query.data?.payments.find(p => p.id === paymentId && ['Pix','CreditCard'].includes(p.method))
  const busy = command.busy || !connection.online || query.isFetching
  const resume = (payer: {name:string;email:string;taxId:string;encryptedCard?:string}) => command.run(async () => {
    if (!payment || busy) throw new Error('Atualize a cobrança antes de retomar.')
    return postBar<TabPayment>(`/tabs/${tabId}/payments`, { operationId: payment.operationId, amount: payment.amount, method: payment.method, ...payer })
  })
  return <BarFrame className="lb-service-recovery"><Header title="Pagamento online existente" description="Recupere somente a cobrança original. Não cobre novamente na maquininha." back={`/atendimento/receber/${tabId}?paymentId=${paymentId}`} /><LoadState query={query}/><Feedback {...command}/>{!connection.online && <p role="status">Reconecte para consultar esta cobrança.</p>}{payment ? <>
    <PixDetails payment={payment} busy={busy} refresh={() => void command.run(() => postBar(`/tabs/${tabId}/payments/${payment.id}/refresh`, {}))}/>
    <CardRecovery payment={payment} publicKey={config.data?.cardPublicKey} busy={busy} resume={resume}/>
    <PixRecovery payment={payment} busy={busy} resume={resume}/>
    {payment.state === 'Approved' && <Link className="ux-button primary" to={`/atendimento/comprovante/${tabId}/${payment.id}`}>Ver comprovante</Link>}
  </> : query.data && !query.isError && <p role="alert">Pagamento online não encontrado nesta comanda.</p>}</BarFrame>
}
