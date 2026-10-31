import { useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Disclosure, EditorPanel, useUnsavedChanges } from '../../components/managementUi'
import { ApiError } from '../../lib/http'
import { displayDate, today, validDate } from '../../pages/arenaUi'
import { expenseApi, expenseMoney, expenseMoneyInput, expenseSubtitle, expenseTitle, parseExpenseMoney, type ExpenseCancellation, type ExpenseDetail, type NewExpensePayment } from './expenses'
import { ExpenseAttachments } from './ExpenseAttachments'
import { useAuth } from '../auth/authContext'
import { hasPermission } from '../auth/access'

export function ExpenseDetailPanel({ id, actor, canWrite, onClose, onPaid }: { id: string; actor: string; canWrite: boolean; onClose: () => void; onPaid: (detail: ExpenseDetail) => void }) {
  const [activity, setActivity] = useState({ operation: false, attachment: false })
  const query = useQuery({ queryKey: ['expenses', 'detail', actor, id], queryFn: ({ signal }) => expenseApi.detail(id, signal), retry: false })
  return <EditorPanel title="Detalhes do lançamento" onClose={onClose} busy={activity.operation || activity.attachment} className="expenses-editor finance-clean">
    {query.isPending && <p role="status">Carregando lançamento…</p>}
    {query.isError && <p role="alert" className="expenses-error">Não foi possível carregar o lançamento. <button type="button" className="expenses-retry" onClick={() => void query.refetch()}>Tentar novamente</button></p>}
    {query.data && <ExpenseDetailContent key={id} detail={query.data} actor={actor} canWrite={canWrite} onPaid={onPaid} onBusyChange={value => setActivity(current => ({ ...current, operation: value }))} onAttachmentBusyChange={value => setActivity(current => ({ ...current, attachment: value }))} refresh={async () => { const result = await query.refetch(); return result.isError ? undefined : result.data }} />}
  </EditorPanel>
}

function ExpenseDetailContent({ detail, actor, canWrite, onPaid, refresh, onBusyChange, onAttachmentBusyChange }: { detail: ExpenseDetail; actor: string; canWrite: boolean; onPaid: (detail: ExpenseDetail) => void; refresh: () => Promise<ExpenseDetail | undefined>; onBusyChange: (value: boolean) => void; onAttachmentBusyChange: (value: boolean) => void }) {
  const client = useQueryClient(); const guard = useUnsavedChanges(); const day = today(); const row = detail.expense
  const { user } = useAuth()
  const [amount, setAmount] = useState(() => expenseMoneyInput(row.remainingAmount)); const [paidDate, setPaidDate] = useState(day)
  const [method, setMethod] = useState('Outro'); const [account, setAccount] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [uncertain, setUncertain] = useState(false); const [conflict, setConflict] = useState(false)
  const [cancelReason, setCancelReason] = useState(''); const [cancelError, setCancelError] = useState(''); const [cancelUncertain, setCancelUncertain] = useState(false); const [cancelConflict, setCancelConflict] = useState(false)
  const cancelAttempt = useRef<ExpenseCancellation | null>(null)
  const lock = useRef(false); const attempt = useRef<NewExpensePayment | null>(null)
  const refund = row.paidBy === 'Partner'; const remaining = row.remainingAmount
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current || conflict || cancelUncertain) return
    const value = parseExpenseMoney(amount)
    if (!attempt.current && (value === null || value > remaining)) { setError(`Informe um valor maior que zero e até ${expenseMoney(remaining)}.`); return }
    if (!attempt.current && (!validDate(paidDate) || paidDate > day)) { setError('Informe a data do pagamento, até hoje.'); return }
    const body = attempt.current ?? { operationId: crypto.randomUUID(), amount: value!, paidDate, paymentMethod: method, accountReference: account.trim(), version: row.version }
    attempt.current = body; lock.current = true; setBusy(true); onBusyChange(true); setError('')
    try {
      const result = await expenseApi.pay(row.id, body)
      guard.markSaved(); attempt.current = null; setUncertain(false)
      client.setQueryData(['expenses', 'detail', actor, row.id], result)
      onPaid(result)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
        attempt.current = null; setUncertain(false); setConflict(cause.status === 409)
        setError(cause.message)
      } else {
        setUncertain(true)
        setError('Não foi possível confirmar o pagamento. Tente novamente para consultar ou concluir o mesmo registro. Seus dados foram preservados.')
      }
    } finally { lock.current = false; setBusy(false); onBusyChange(false) }
  }
  async function refreshBalance() {
    if (lock.current) return
    lock.current = true; setBusy(true); onBusyChange(true)
    try {
      const result = await refresh()
      if (result) { attempt.current = null; cancelAttempt.current = null; setConflict(false); setCancelConflict(false); setError(''); setCancelError(''); setAmount(expenseMoneyInput(result.expense.remainingAmount)) }
    } finally { lock.current = false; setBusy(false); onBusyChange(false) }
  }
  async function cancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current || uncertain || cancelConflict) return
    if (!cancelReason.trim()) { setCancelError('Informe o motivo do cancelamento.'); return }
    const body = cancelAttempt.current ?? { operationId: crypto.randomUUID(), version: row.version, reason: cancelReason.trim() }
    cancelAttempt.current = body; lock.current = true; setBusy(true); onBusyChange(true); setCancelError('')
    try {
      const result = await expenseApi.cancel(row.id, body)
      guard.markSaved(); cancelAttempt.current = null; setCancelUncertain(false)
      client.setQueryData(['expenses', 'detail', actor, row.id], result); onPaid(result)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) {
        cancelAttempt.current = null; setCancelUncertain(false); setCancelConflict(cause.status === 409); setCancelError(cause.message)
      } else {
        setCancelUncertain(true); setCancelError('Não foi possível confirmar o cancelamento. Tente novamente para consultar ou concluir o mesmo registro.')
      }
    } finally { lock.current = false; setBusy(false); onBusyChange(false) }
  }
  return <>
    <h3 className="expenses-detail-title">{expenseTitle(row)}</h3><p className="expenses-muted">{expenseSubtitle(row)}</p>
    <dl className="expenses-detail-totals"><div><dt>Valor original</dt><dd>{expenseMoney(row.amount)}</dd></div><div><dt>{refund ? 'Já reembolsado' : 'Já pago'}</dt><dd>{expenseMoney(row.paidAmount)}</dd></div><div><dt>{refund ? 'Falta reembolsar' : 'Falta pagar'}</dt><dd>{expenseMoney(remaining)}</dd></div></dl>
    <p className="expenses-muted">Lançamento em {displayDate(row.expenseDate)}{row.dueDate ? ` · Vencimento em ${displayDate(row.dueDate)}` : ''}</p>
    <h3>Histórico</h3>
    {detail.payments.length ? <ul className="expenses-history" aria-label="Histórico de pagamentos">{detail.payments.map(payment => <li key={payment.operationId}><span>{displayDate(payment.paidDate)} · {refund ? 'Reembolso' : 'Pagamento'}{payment.paymentMethod && payment.paymentMethod !== 'Outro' && <small className="expenses-muted">{payment.paymentMethod}{payment.accountReference ? ` · ${payment.accountReference}` : ''}</small>}</span><strong>{expenseMoney(payment.amount)}</strong></li>)}</ul> : <p className="expenses-muted">{row.paidAmount > 0 ? 'Pagamento anterior sem detalhamento.' : `Nenhum ${refund ? 'reembolso' : 'pagamento'} registrado.`}</p>}
    {(detail.notes || detail.documentReference) && <Disclosure title="Observação e referência">{detail.documentReference && <p className="expenses-document"><strong>Comprovante:</strong> {detail.documentReference}</p>}{detail.notes && <p className="expenses-document">{detail.notes}</p>}</Disclosure>}
    <ExpenseAttachments expenseId={row.id} canWrite={canWrite} onBusyChange={onAttachmentBusyChange} />
    {row.purchaseId && hasPermission(user, 'bar:purchases:manage') && <p><Link className="expenses-link" to={`/bar/compras?acao=ver&registro=${encodeURIComponent(row.purchaseId)}`}>Ver compra no Bar</Link></p>}
    {!row.managed && <p className="expenses-muted">Este lançamento foi registrado no controle anterior. <Link to={`/financeiro/${encodeURIComponent(row.id)}`}>Abrir lançamento original</Link></p>}
    {row.status === 'Canceled' && <p role="status" className="expenses-muted">Lançamento cancelado.{detail.cancellationReason && <> Motivo: {detail.cancellationReason}</>}</p>}
    {remaining === 0 && row.status !== 'Canceled' && <p role="status" className="expenses-muted">Acerto concluído.</p>}
    {canWrite && remaining > 0 && row.status !== 'Canceled' && <form className="operation-form" onSubmit={submit}>
      <h3>Registrar {refund ? 'reembolso' : 'pagamento'}</h3>
      {error && <div role="alert" className="expenses-error">{error}{conflict && <button type="button" className="expenses-retry" disabled={busy} onClick={() => void refreshBalance()}>Atualizar saldo</button>}</div>}
      <fieldset disabled={busy || uncertain || conflict || cancelUncertain}><div className="field-grid"><label className="operation-field">{refund ? 'Valor devolvido (R$)' : 'Valor pago (R$)'}<input inputMode="decimal" required value={amount} onChange={event => setAmount(event.target.value)} /></label><label className="operation-field">Data<input type="date" required max={day} value={paidDate} onChange={event => setPaidDate(event.target.value)} /></label></div>
        <Disclosure title="Detalhes do pagamento (opcional)"><div className="field-grid"><label className="operation-field">Forma de pagamento<select value={method} onChange={event => setMethod(event.target.value)}><option value="Outro">Não informada</option><option value="Pix">Pix</option><option value="Dinheiro">Dinheiro</option><option value="Transferência">Transferência</option><option value="Cartão">Cartão</option></select></label><label className="operation-field">Conta de origem<input maxLength={100} value={account} onChange={event => setAccount(event.target.value)} /></label></div></Disclosure>
      </fieldset>
      <div className="form-actions"><button type="submit" className="primary-button" disabled={busy || conflict || cancelUncertain}>{busy ? 'Confirmando…' : uncertain ? 'Tentar confirmar novamente' : `Confirmar ${refund ? 'reembolso' : 'pagamento'}`}</button></div>
    </form>}
    {canWrite && row.status === 'Pending' && remaining > 0 && row.paidAmount === 0 && row.paidBy === 'Pending' && <Disclosure title="Corrigir lançamento"><p className="expenses-muted">Se este lançamento foi feito por engano, você pode cancelá-lo informando o motivo.</p><form onSubmit={cancel}>
      {cancelError && <div role="alert" className="expenses-error">{cancelError}{cancelConflict && <button type="button" className="expenses-retry" disabled={busy} onClick={() => void refreshBalance()}>Atualizar saldo</button>}</div>}
      <label className="operation-field">Motivo do cancelamento<input required maxLength={500} value={cancelReason} disabled={busy || uncertain || cancelUncertain || cancelConflict} onChange={event => setCancelReason(event.target.value)} /></label>
      <button type="submit" className="expenses-link" disabled={busy || uncertain || cancelConflict}>{cancelUncertain ? 'Tentar confirmar cancelamento novamente' : 'Cancelar lançamento'}</button>
    </form></Disclosure>}
  </>
}
