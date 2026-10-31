import { hasPermission } from '../auth/access'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { Feedback } from './components'
import { money, postBar, useBarCommand, useIntent, type Tab } from './api'

/** Payment, delivery and closure are separate operational facts. */
export function TabSettlement({ tab, unavailable = false, showDetailsLink = true }: { tab: Tab; unavailable?: boolean; showDetailsLink?: boolean }) {
  const { user } = useAuth()
  return <Settlement key={`${user?.id}:${tab.id}`} tab={tab} unavailable={unavailable} showDetailsLink={showDetailsLink} />
}

function Settlement({ tab, unavailable, showDetailsLink }: { tab: Tab; unavailable: boolean; showDetailsLink: boolean }) {
  const { user } = useAuth()
  const command = useBarCommand()
  const previousClose = tab.history?.filter(event => event.kind === 'Closed').at(-1)?.id ?? 'initial'
  const intent = useIntent(`settlement:${tab.id}:${previousClose}`)
  const [confirming, setConfirming] = useState(false)
  const closeButton = useRef<HTMLButtonElement>(null)
  const canOperate = Boolean(hasPermission(user, 'bar:sales:operate'))
  const requested = tab.items.filter(item => item.state === 'Requested').length
  const accepted = tab.items.filter(item => item.state === 'Accepted').length
  const refundPending = tab.payments.some(payment => payment.refundPending > 0)
  const ready = tab.state === 'Open' && tab.due === 0 && tab.pending === 0 && !requested && !accepted && !refundPending
  async function close() {
    if (unavailable || !ready || !canOperate || !tab.allowedActions.includes('close')) return
    const result = await command.run(() => postBar<Tab>(`/tabs/${tab.id}/close`, { operationId: intent('close') }))
    if (result.ok) { setConfirming(false); command.setMessage('Comanda encerrada.') }
  }
  return <section className="ux-panel ux-no-print" aria-label="Conclusão do atendimento">
    <h2>{tab.state === 'Closed' ? 'Atendimento encerrado' : 'Situação da comanda'}</h2>
    <Feedback {...command} />
    {unavailable ? <p role="status">Atualize a consulta para conferir o saldo e as pendências antes de continuar.</p> : tab.state === 'Closed' ? <p>Consumo e pagamentos disponíveis para consulta.</p> : <>
      {tab.due > 0 && <p>Falta pagar: <strong>{money(tab.due)}</strong>.</p>}
      {tab.pending > 0 && <p>{money(tab.pending)} aguardando confirmação. Não cobre esse valor novamente.</p>}
      {requested > 0 && <p>{requested} pedido(s) aguardando aceite.</p>}
      {accepted > 0 && <p>{accepted} item(ns) aguardando entrega. Pagamento não confirma a entrega.</p>}
      {refundPending && <p>Há estorno aguardando confirmação. Confira-o antes de encerrar.</p>}
      {ready && <p>Sem saldo ou pendências. {canOperate ? 'Você pode encerrar a comanda.' : 'A equipe responsável pode encerrar a comanda.'}</p>}
      <div className="ux-actions">
        {canOperate && tab.payable > 0 && <Link className="ux-button primary" to={`/atendimento/receber/${tab.id}`}>Receber restante · {money(tab.payable)}</Link>}
        {showDetailsLink && (requested > 0 || accepted > 0 || refundPending || tab.pending > 0) && <Link className="ux-button secondary" to={`/atendimento/comandas/${tab.id}`}>Conferir pendências</Link>}
        {canOperate && ready && tab.allowedActions.includes('close') && <button ref={closeButton} className="ux-button primary" aria-expanded={confirming} disabled={command.busy} onClick={() => setConfirming(true)}>Encerrar comanda</button>}
      </div>
      {canOperate && ready && confirming && <div className="lb-close-confirmation">
        <p>Encerrar a comanda {tab.number} · {tab.name || 'Visitante'}? O acesso pelo QR será encerrado.</p>
        <div className="ux-actions"><button autoFocus className="ux-button primary" disabled={command.busy} onClick={() => void close()}>Confirmar encerramento</button><button className="ux-button secondary" disabled={command.busy} onClick={() => { setConfirming(false); closeButton.current?.focus() }}>Continuar atendimento</button></div>
      </div>}
    </>}
  </section>
}

export function PaymentDestination({ tab }: { tab: Tab }) {
  return <div className="lb-payment-destination">
    <h2>Comanda {tab.number} · {tab.name || 'Visitante'}</h2>
    <p>{tab.responsible ? `Responsável: ${tab.responsible.name}` : 'Sem responsável vinculado à área do cliente.'}</p>
    <p className="ux-note">O recebimento será registrado somente nesta comanda.</p>
  </div>
}
