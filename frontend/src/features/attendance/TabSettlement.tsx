import { tabTitle } from './tabTitle'
import { hasPermission, hasStaffAction, hasStaffMenu } from '../auth/access'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { Feedback } from './components'
import { ApiError } from '../../lib/http'
import { useConfirmationGate } from './Core'
import { useQueryClient } from '@tanstack/react-query'
import { money, postBar, useBarCommand, useIntent, type Tab } from './api'

type Cancellation = { operationId: string; expectedVersion: number; reason: string }
function readCancellation(raw: string): Cancellation | null {
  try {
    const value = JSON.parse(raw) as Cancellation
    return value && typeof value.operationId === 'string' && Number.isInteger(value.expectedVersion)
      && typeof value.reason === 'string' && value.reason.trim().length >= 3 && value.reason.length <= 450 ? value : null
  } catch { return null }
}

/** Payment, delivery and closure are separate operational facts. */
export function TabSettlement({ tab, unavailable = false, showDetailsLink = true, cancellationOnly = false, inline = false, onCancellationBlockedChange }: { tab: Tab; unavailable?: boolean; showDetailsLink?: boolean; cancellationOnly?: boolean; inline?: boolean; onCancellationBlockedChange?: (blocked: boolean) => void }) {
  const { user } = useAuth()
  return <Settlement key={`${user?.id}:${tab.id}`} tab={tab} unavailable={unavailable} showDetailsLink={showDetailsLink} cancellationOnly={cancellationOnly} inline={inline} onCancellationBlockedChange={onCancellationBlockedChange} />
}

function Settlement({ tab, unavailable, showDetailsLink, cancellationOnly, inline, onCancellationBlockedChange }: { tab: Tab; unavailable: boolean; showDetailsLink: boolean; cancellationOnly: boolean; inline: boolean; onCancellationBlockedChange?: (blocked: boolean) => void }) {
  const { user } = useAuth()
  const command = useBarCommand()
  const cache = useQueryClient()
  const [cancelRaw, setCancelPending] = useConfirmationGate(`tab-cancel:${user?.id}:${tab.id}`)
  const cancelPending = readCancellation(cancelRaw)
  const cancellationBlocked = command.busy || Boolean(cancelPending)
  useEffect(() => {
    onCancellationBlockedChange?.(cancellationBlocked)
    return () => { onCancellationBlockedChange?.(false) }
  }, [onCancellationBlockedChange, cancellationBlocked])
  const [cancelling, setCancelling] = useState(Boolean(cancelPending))
  const [cancelReason, setCancelReason] = useState(cancelPending?.reason ?? '')
  const cancelRequest = useRef(false)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const restoreCancelFocus = useRef(false)
  useEffect(() => { if (!cancelling && restoreCancelFocus.current) { cancelButton.current?.focus(); restoreCancelFocus.current = false } }, [cancelling])
  const previousClose = tab.history?.filter(event => event.kind === 'Closed').at(-1)?.id ?? 'initial'
  const intent = useIntent(`settlement:${tab.id}:${previousClose}`)
  const [confirming, setConfirming] = useState(false)
  const closeButton = useRef<HTMLButtonElement>(null)
  const canReceive = Boolean(hasPermission(user, 'bar:sales:operate') && hasStaffMenu(user, 'bar.receive') && hasStaffAction(user, 'bar.receive'))
  const canOperate = Boolean(canReceive || hasPermission(user, 'bar:sales:operate') && hasStaffMenu(user, 'bar.tabs') && hasStaffAction(user, 'bar.tabs'))
  const requested = tab.items.filter(item => item.state === 'Requested').length
  const accepted = tab.items.filter(item => item.state === 'Accepted').length
  const refundPending = tab.payments.some(payment => payment.refundPending > 0)
  const hasCancelAccess = hasPermission(user, 'bar:supervise') && hasStaffMenu(user, 'bar.tabs') && hasStaffAction(user, 'bar.supervise')
  const canCancel = hasCancelAccess && tab.state === 'Open' && Number.isInteger(tab.version) && tab.allowedActions.includes('cancel')
    && tab.paid === 0 && tab.pending === 0
    && !tab.payments.some(payment => payment.state === 'Pending' || payment.refundPending > 0)
  const showCancellation = hasCancelAccess && (canCancel || cancelling || cancelPending)
  const cancelled = tab.state === 'Cancelled'
  const cancellation = tab.history?.filter(event => event.kind === 'Cancelled').at(-1)
  const ready = tab.state === 'Open' && tab.due === 0 && tab.pending === 0 && !requested && !accepted && !refundPending
  async function close() {
    if (unavailable || command.busy || cancelPending || !ready || !canOperate || !tab.allowedActions.includes('close')) return
    const result = await command.run(() => postBar<Tab>(`/tabs/${tab.id}/close`, { operationId: intent('close') }))
    if (result.ok) { setConfirming(false); command.setMessage('Comanda encerrada.') }
  }
  async function cancel() {
    if (cancelRequest.current || command.busy || unavailable || !hasCancelAccess || !cancelPending && !canCancel) return
    const reason = cancelReason.trim()
    if (!cancelPending && (reason.length < 3 || reason.length > 450)) { command.setError('Informe um motivo de 3 a 450 caracteres.'); return }
    const body: Cancellation = cancelPending ?? { operationId: crypto.randomUUID(), expectedVersion: tab.version!, reason }
    cancelRequest.current = true
    try {
      try { setCancelPending(JSON.stringify(body)) } catch { command.setError('Não foi possível guardar esta confirmação. Libere o armazenamento antes de cancelar.'); return }
      const result = await command.run(() => postBar<Tab>(`/tabs/${tab.id}/cancel`, body))
      if (result.ok) { setCancelPending(''); setCancelling(false); setConfirming(false); command.setMessage('Comanda cancelada.') }
      else if (result.error instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(result.error.status)) {
        setCancelPending('')
        await cache.invalidateQueries({ queryKey: ['bar-runtime'] })
      }
    } finally { cancelRequest.current = false }
  }
  if (inline) return <div className="lb-tab-inline-settlement">
    <Feedback {...command} />
    {canOperate && ready && tab.allowedActions.includes('close') && <button ref={closeButton} className="ux-button primary" aria-expanded={confirming} disabled={unavailable || command.busy || Boolean(cancelPending)} onClick={() => { setCancelling(false); setConfirming(true) }}>Encerrar comanda</button>}
    {showCancellation && (!cancelling && !cancelPending ? <button ref={cancelButton} type="button" className="ux-button danger" disabled={unavailable || command.busy} onClick={() => { setConfirming(false); setCancelling(true) }}>Cancelar comanda</button> : <form className="lb-inline-cancel" onSubmit={event => { event.preventDefault(); void cancel() }}>
      <h3>Cancelar {tabTitle(tab)}</h3><p>Produtos entregues não voltam ao estoque. Se houve devolução, corrija os itens antes de cancelar.</p><p>O acesso pelo QR será encerrado.</p>
      {cancelPending && <p className="ux-notice warning" role="status">O cancelamento ainda precisa ser confirmado. Repita os mesmos dados antes de continuar.</p>}
      <label className="ux-field">Motivo do cancelamento<textarea autoFocus required minLength={3} maxLength={450} value={cancelReason} disabled={command.busy || Boolean(cancelPending)} onChange={event => setCancelReason(event.target.value)} /></label>
      <div className="ux-actions"><button type="submit" className="ux-button danger" disabled={unavailable || command.busy || (!cancelPending && (!canCancel || cancelReason.trim().length < 3 || cancelReason.trim().length > 450))}>{cancelPending ? 'Consultar ou repetir cancelamento' : 'Confirmar cancelamento'}</button>{!cancelPending && <button type="button" className="ux-button secondary" disabled={command.busy} onClick={() => { restoreCancelFocus.current = true; setCancelling(false) }}>Voltar</button>}</div>
    </form>)}
    {canOperate && ready && confirming && <div className="lb-close-confirmation"><p>Encerrar {tabTitle(tab)}? O acesso pelo QR será encerrado.</p><div className="ux-actions"><button autoFocus className="ux-button primary" disabled={command.busy || Boolean(cancelPending)} onClick={() => void close()}>Confirmar encerramento</button><button className="ux-button secondary" disabled={command.busy} onClick={() => { setConfirming(false); closeButton.current?.focus() }}>Continuar atendimento</button></div></div>}
  </div>
  const compact = cancellationOnly && !cancelled
  if (compact && !showCancellation) return null
  return <section className={`ux-panel ux-no-print${compact ? ' lb-cancel-only' : ''}`} aria-label={compact ? 'Cancelar comanda' : 'Conclusão do atendimento'}>
    {!compact && <h2>{cancelled ? 'Comanda cancelada' : tab.state === 'Closed' ? 'Atendimento encerrado' : 'Situação da comanda'}</h2>}
    <Feedback {...command} />
    {!compact && (unavailable ? <p role="status">Atualize a consulta para conferir o saldo e as pendências antes de continuar.</p> : cancelled ? <><p>Histórico disponível para consulta.</p>{cancellation?.reason && <p>Motivo: {cancellation.reason}</p>}</> : tab.state === 'Closed' ? <p>Consumo e pagamentos disponíveis para consulta.</p> : <>
      {tab.due > 0 && <p>Falta pagar: <strong>{money(tab.due)}</strong>.</p>}
      {tab.pending > 0 && <p>{money(tab.pending)} aguardando confirmação. Não cobre esse valor novamente.</p>}
      {requested > 0 && <p>{requested} pedido(s) aguardando aceite.</p>}
      {accepted > 0 && <p>{accepted} item(ns) aguardando entrega. Pagamento não confirma a entrega.</p>}
      {refundPending && <p>Há estorno aguardando confirmação. Confira-o antes de encerrar.</p>}
      {ready && <p>Sem saldo ou pendências. {canOperate ? 'Você pode encerrar a comanda.' : 'A equipe responsável pode encerrar a comanda.'}</p>}
      <div className="ux-actions">
        {canReceive && tab.payable > 0 && <Link className="ux-button primary" to={`/atendimento/receber/${tab.id}`}>Receber restante · {money(tab.payable)}</Link>}
        {showDetailsLink && hasStaffMenu(user, 'bar.tabs') && (requested > 0 || accepted > 0 || refundPending || tab.pending > 0) && <Link className="ux-button secondary" to={`/atendimento/comandas/${tab.id}`}>Conferir pendências</Link>}
        {canOperate && ready && tab.allowedActions.includes('close') && <button ref={closeButton} className="ux-button primary" aria-expanded={confirming} disabled={command.busy || Boolean(cancelPending)} onClick={() => { setCancelling(false); setConfirming(true) }}>Encerrar comanda</button>}
      </div>
      {canOperate && ready && confirming && <div className="lb-close-confirmation">
        <p>Encerrar {tabTitle(tab)}? O acesso pelo QR será encerrado.</p>
        <div className="ux-actions"><button autoFocus className="ux-button primary" disabled={command.busy || Boolean(cancelPending)} onClick={() => void close()}>Confirmar encerramento</button><button className="ux-button secondary" disabled={command.busy} onClick={() => { setConfirming(false); closeButton.current?.focus() }}>Continuar atendimento</button></div>
      </div>}
    </>)}
    {showCancellation && <div className="lb-cancel-tab">
      {!cancelling && !cancelPending ? <button ref={cancelButton} type="button" className="ux-button danger" disabled={unavailable || command.busy} onClick={() => { setConfirming(false); setCancelling(true) }}>Cancelar comanda</button> : <form onSubmit={event => { event.preventDefault(); void cancel() }}>
        <h3>Cancelar {tabTitle(tab)}</h3>
        <p>Produtos entregues não voltam ao estoque. Se houve devolução, corrija os itens antes de cancelar.</p><p>O acesso pelo QR será encerrado.</p>
        {cancelPending && <p className="ux-notice warning" role="status">O cancelamento ainda precisa ser confirmado. Repita os mesmos dados antes de continuar.</p>}
        <label className="ux-field">Motivo do cancelamento<textarea autoFocus required minLength={3} maxLength={450} value={cancelReason} disabled={command.busy || Boolean(cancelPending)} onChange={event => setCancelReason(event.target.value)} /></label>
        <div className="ux-actions"><button type="submit" className="ux-button danger" disabled={unavailable || command.busy || (!cancelPending && (!canCancel || cancelReason.trim().length < 3 || cancelReason.trim().length > 450))}>{cancelPending ? 'Consultar ou repetir cancelamento' : 'Confirmar cancelamento'}</button>{!cancelPending && <button type="button" className="ux-button secondary" disabled={command.busy} onClick={() => { restoreCancelFocus.current = true; setCancelling(false) }}>Voltar</button>}</div>
      </form>}
    </div>}
  </section>
}

export function PaymentDestination({ tab }: { tab: Tab }) {
  return <div className="lb-payment-destination">
    <h2>{tabTitle(tab)}</h2>
    <p>{tab.responsible ? `Responsável: ${tab.responsible.name}` : 'Sem responsável vinculado à área do cliente.'}</p>
    <p className="ux-note">O recebimento será registrado somente nesta comanda.</p>
  </div>
}
