import { TabCustomerIdentification } from './TabCustomerIdentification'
import { splitPayment } from './splitPayment'
import { CopyPix } from '../../components/CopyPix'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PaymentDestination, TabSettlement } from './TabSettlement'
import { Logo } from '../../components/Logo'
import { ApiError } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { Header, Feedback, Summary, PaymentStatus, Icon, BalanceState } from './components'
import { BarFrame, LoadState, useBarConnection } from './Core'
import { readPaymentCheckpoint, type PaymentCheckpoint, type ManualPaymentInput } from './manualPayment'
import { dateTime, isOpen, money, parseAmount, paymentLabel, postBar, useBarCommand, useBarData, useIntent, type CashSession, type Tab, type TabPayment } from './api'

export function PixDetails({ payment, busy, refresh }: { payment: TabPayment; busy: boolean; refresh: () => void }) {
  const pix = payment.method === 'Pix'; const method = paymentLabel(payment) ?? 'Pagamento'
  const title = payment.state === 'Approved' ? `${method} confirmado` : payment.state === 'Pending' ? pix ? 'Esperando o Pix' : 'Esperando confirmação' : `${method} não confirmado`
  return <section className="ux-panel ux-payment-state"><h2>{title}</h2><PaymentStatus payment={payment} /><p className="ux-amount">{money(payment.amount)}</p>{pix && payment.state === 'Pending' && <><p>Estamos aguardando a confirmação do pagamento. Você pode abrir seu banco e voltar a esta página. Não pague novamente.</p>{payment.qrImageUrl && <img className="lb-pix-qr" src={payment.qrImageUrl} alt="QR Code para pagar com Pix" referrerPolicy="no-referrer" />}{payment.pixText && <CopyPix code={payment.pixText} />}<p className="ux-note">Válido até {dateTime(payment.expiresAtUtc)}</p></>}{(pix || payment.method === 'CreditCard') && <button className="ux-button secondary" disabled={busy} onClick={refresh}><Icon name="clock" />Consultar confirmação</button>}</section>
}

export function ReceivePage() {
  const { tabId = '' } = useParams(); const { user } = useAuth()
  return <ReceiveFlow key={`${user?.id}:${tabId}`} />
}

function ReceiveFlow() {
  const { tabId = '' } = useParams(); const [params, setParams] = useSearchParams(); const query = useBarData<Tab>(`/tabs/${tabId}`)
  const { user } = useAuth(); const sessions = useBarData<CashSession[]>('/cash/sessions', Boolean(user?.permissions.includes('bar:cash:operate')))
  const command = useBarCommand(); const intent = useIntent(`payment:${tabId}`); const navigate = useNavigate()
  const [portion, setPortion] = useState<'all' | 'part' | 'split' | null>('all'); const [method, setMethod] = useState(''); const [value, setValue] = useState(''); const [tendered, setTendered] = useState('')
  const connection = useBarConnection()
  const [approval, setApproval] = useState<string | null>(null); const [authorization, setAuthorization] = useState('');
  const [people, setPeople] = useState('2')
  const checkpointKey = `lb-payment-v1:${user?.id}:${tabId}`
  const [checkpoint, updateCheckpoint] = useState<PaymentCheckpoint | null>(() => readPaymentCheckpoint(checkpointKey))
  function setCheckpoint(value: PaymentCheckpoint | null) {
    if (value) localStorage.setItem(checkpointKey, JSON.stringify(value))
    else localStorage.removeItem(checkpointKey)
    updateCheckpoint(value)
  }
  const tab = query.data; const unavailable = query.isError || query.isLoading; const canReceive = !unavailable && connection.online && !query.isFetching && tab?.state === 'Open' && Boolean(user?.permissions.includes('bar:sales:operate')); const paymentId = params.get('paymentId'); const payment = tab?.payments.find(row => paymentId ? row.id === paymentId : checkpoint && row.operationId === checkpoint.operationId) ?? (checkpoint?.payment?.id === paymentId ? checkpoint.payment : undefined)
  const awaitingConfirmation = Boolean(checkpoint && !tab?.payments.some(row => row.operationId === checkpoint.operationId))
  const formLocked = command.busy || awaitingConfirmation || !canReceive
  const division = splitPayment(tab?.payable ?? 0, people)
  const amount = portion === 'all' ? tab?.payable ?? 0 : portion === 'split' ? division?.first ?? NaN : parseAmount(value); const session = sessions.data?.find(row => isOpen(row) && row.openedBy === user?.id)
  const approvalContext = JSON.stringify([tabId, portion, method, Number.isFinite(amount) ? amount : null])
  const terminal = ['Debit', 'Credit', 'PixTerminal'].includes(method)
  const approved = terminal && approval === approvalContext
  useEffect(() => { setApproval(null) }, [approvalContext, connection.generation])
  const changed = (resetApproval = false) => { if (resetApproval) setApproval(null); intent('pay', true) }
  async function sendManual(input: ManualPaymentInput) {
    if (!connection.online || query.isError) { command.setError('Reconecte e atualize a comanda antes de confirmar.'); return }
    const result = await command.run(async () => {
      // Persist the exact request before sending. A retry never generates a new charge.
      setCheckpoint({ operationId: input.operationId, input })
      return postBar<TabPayment>(`/tabs/${tabId}/payments`, input)
    })
    if (result.ok) { setCheckpoint(null); intent('pay', true); navigate(`/atendimento/comprovante/${tabId}/${result.value.id}`) }
    else if (result.error instanceof ApiError && [400, 422].includes(result.error.status)) setCheckpoint(null)
  }
  async function pay() {
    if (awaitingConfirmation) { command.setError('Confira primeiro o pagamento pendente.'); return }
    if (!canReceive || !tab) { command.setError('Atualize a comanda aberta antes de receber.'); return }
    if (!Number.isFinite(amount) || amount <= 0 || amount > tab.payable) { command.setError('Confira o valor deste pagamento.'); return }
    if (method === 'Cash' && (!session || !Number.isFinite(parseAmount(tendered)) || parseAmount(tendered) < amount)) { command.setError('Confira seu caixa e o dinheiro recebido.'); return }
    if (terminal && !approved) { command.setError('Confirme a aprovação na maquininha.'); return }
    if (!terminal && method !== 'Cash') return
    await sendManual({ operationId: intent('pay'), method: terminal ? 'TerminalManual' : 'Cash', amount,
      sessionId: method === 'Cash' ? session?.id : undefined, tendered: method === 'Cash' ? parseAmount(tendered) : amount,
      terminalType: terminal ? method === 'PixTerminal' ? 'Pix' : method : undefined,
      terminalApproved: approved, authorization: authorization || null })
  }
  async function refresh() { if (!payment) return; await command.run(() => postBar<TabPayment>(`/tabs/${tabId}/payments/${payment.id}/refresh`, {})) }
  return <BarFrame><div className="ux-receive-page"><Header title={tab ? `Receber · Comanda ${tab.number}` : 'Receber'} description="Escolha o valor. Depois, o meio de pagamento." back={`/atendimento/comandas/${tabId}`} /><LoadState query={query} /><Feedback {...command} />{!connection.online && <p role="status" className="ux-notice warning">Sem conexão. Reconecte para confirmar recebimentos.</p>}{awaitingConfirmation && <p className="ux-notice warning" role="status">Estamos conferindo este pagamento. Aguarde a consulta antes de iniciar outra cobrança. Se a conexão falhou, repita a confirmação com os mesmos dados. Nenhuma nova cobrança será enviada à maquininha.<button className="ux-button secondary" disabled={command.busy || !connection.online || query.isFetching || query.isError} onClick={() => checkpoint && void sendManual(checkpoint.input)}>Consultar ou repetir confirmação</button></p>}{tab && <><section className="ux-panel"><PaymentDestination tab={tab} /><Summary tab={tab} /><TabCustomerIdentification tab={tab} disabled={query.isFetching || query.isError || command.busy || awaitingConfirmation || !connection.online} />{tab.pending > 0 && <p className="ux-notice warning">Há {money(tab.pending)} esperando confirmação. Disponível para nova cobrança: {money(tab.payable)}.</p>}</section>
    {payment ? <><PixDetails payment={payment} busy={command.busy} refresh={() => void refresh()} />{payment.state === 'Pending' && ['Pix', 'CreditCard'].includes(payment.method) && <Link className="ux-button secondary" to={`/atendimento/pagamento-online/${tabId}/${payment.id}`}>Consultar ou retomar pagamento online existente</Link>}{payment.state === 'Approved' && <Link className="ux-button primary" to={`/atendimento/comprovante/${tabId}/${payment.id}`}>Ver comprovante</Link>}<button className="ux-button secondary" disabled={formLocked} onClick={() => { setCheckpoint(null); setParams({}); setPortion('all'); setMethod(''); setApproval(null) }}>Voltar aos valores</button></> : unavailable ? <p className="ux-notice warning">A consulta falhou. Novos recebimentos ficam bloqueados até atualizar a comanda.</p> : tab.state === 'Closed' ? <TabSettlement tab={tab} /> : tab.payable <= 0 ? <section className="ux-panel"><BalanceState tab={tab} />{tab.payments.filter(row => row.state === 'Pending').map(row => <Link key={row.id} className="ux-button secondary" to={`?paymentId=${row.id}`}>Ver Pix de {money(row.amount)}</Link>)}<Link className="ux-button primary" to={`/atendimento/comandas/${tabId}`}>Voltar à comanda</Link><TabSettlement tab={tab} /></section> : <>
      <section className="ux-panel"><h2>1. Quanto receber?</h2><div className="ux-choice-grid lb-two-choices"><button className={`ux-choice ${portion === 'all' ? 'selected' : ''}`} aria-pressed={portion === 'all'} disabled={formLocked} onClick={() => { setPortion('all'); changed(true) }}>Receber tudo<strong>{money(tab.payable)}</strong></button><button className={`ux-choice ${portion === 'part' ? 'selected' : ''}`} aria-pressed={portion === 'part'} disabled={formLocked} onClick={() => { setPortion('part'); changed(true) }}>Receber uma parte</button><button className={`ux-choice ${portion === 'split' ? 'selected' : ''}`} aria-pressed={portion === 'split'} disabled={formLocked} onClick={() => { setPortion('split'); changed(true) }}>Dividir entre pessoas</button></div>{portion === 'split' && <><label className="ux-field">Pessoas que ainda vão pagar<input inputMode="numeric" type="number" min={2} max={100} value={people} disabled={formLocked} onChange={event => { setPeople(event.target.value); changed(true) }} /></label>{division ? <p>Receber {money(division.first)} desta pessoa. Restarão {money(division.remaining)} para as demais. A divisão usa o saldo disponível; confira novamente após cada pagamento.</p> : <p role="alert">Informe de 2 a 100 pessoas, com pelo menos R$ 0,01 por pessoa.</p>}</>}{portion === 'part' && <label className="ux-field">Valor desta parte (R$)<input inputMode="decimal" value={value} disabled={formLocked} placeholder="0,00" onChange={event => { setValue(event.target.value); changed(true) }} /></label>}</section>
      {portion && <section className="ux-panel"><h2>2. Como receber?</h2><div className="ux-choice-grid">{[['Debit', 'Débito na maquininha', 'card'], ['Credit', 'Crédito na maquininha', 'card'], ['PixTerminal', 'Pix na maquininha', 'pix'], ['Cash', 'Dinheiro', 'cash']].map(([code, label, icon]) => <button key={code} className={`ux-choice ${method === code ? 'selected' : ''}`} aria-pressed={method === code} disabled={formLocked} onClick={() => { setMethod(code); changed(true) }}><Icon name={icon as 'cash'} />{label}</button>)}</div>

        {method && <form onSubmit={event => { event.preventDefault(); void pay() }}><p className="ux-amount">Receber {money(Number.isFinite(amount) ? amount : 0)}</p><p className="ux-note">Comanda {tab.number} · {tab.name || 'Visitante'}{tab.responsible && ` · Responsável: ${tab.responsible.name}`}</p>{Number.isFinite(amount) && amount > 0 && amount <= tab.payable && <p>Após a confirmação, faltará pagar <strong>{money(Math.max(0, Math.round((tab.due - amount) * 100) / 100))}</strong>.{tab.pending > 0 && ' Esse saldo inclui pagamentos que ainda aguardam confirmação.'}</p>}{method === 'Cash' && !session && <p className="ux-notice error">Abra o Caixa do Bar antes de receber.<Link to="/bar/caixa">Abrir caixa</Link></p>}
          {method === 'Cash' && <><label className="ux-field">Dinheiro recebido (R$)<input required inputMode="decimal" disabled={formLocked} value={tendered} onChange={event => { setTendered(event.target.value); changed() }} /></label><p className="ux-amount">Troco: {money(Number.isFinite(parseAmount(tendered)) && Number.isFinite(amount) ? Math.max(0, parseAmount(tendered) - amount) : 0)}</p></>}
          {terminal && <><p className="ux-notice warning"><Icon name="card" />Confira na maquininha a aprovação de {money(Number.isFinite(amount) ? amount : 0)}.</p><label className="ux-check lb-card-approval"><input type="checkbox" checked={approved} disabled={formLocked} onChange={event => { setApproval(event.target.checked ? approvalContext : null); changed() }} />A maquininha confirmou a aprovação</label><p className="ux-note">Confirmação informada pelo atendente. O tablet não consulta a aprovação na maquininha.</p><details><summary>Mais detalhes</summary><label className="ux-field">Autorização / NSU (opcional)<input value={authorization} maxLength={100} disabled={formLocked} onChange={event => { setAuthorization(event.target.value); changed() }} /></label></details></>}
          <button className="ux-button primary" disabled={formLocked || (method === 'Cash' && !session) || !Number.isFinite(amount) || amount <= 0 || amount > tab.payable || (terminal && !approved)}>Confirmar recebimento</button>
        </form>}
      </section>}
    </>}
  </>}</div></BarFrame>
}

export function ReceiptPage() {
  const { tabId = '', paymentId = '' } = useParams(); const query = useBarData<Tab>(`/tabs/${tabId}`); const tab = query.isError ? undefined : query.data; const payment = tab?.payments.find(row => row.id === paymentId)
  const { user } = useAuth(); const command = useBarCommand(); const intent = useIntent(`refund:${paymentId}`); const [refund, setRefund] = useState(false); const [amount, setAmount] = useState(''); const [reason, setReason] = useState('')
  return <BarFrame><Header title="Comprovante" back={`/atendimento/comandas/${tabId}`} /><LoadState query={query} /><Feedback {...command} />{tab && !payment && <p role="status">Conferindo o pagamento específico…<button className="ux-button secondary" onClick={() => void query.refetch()}>Consultar novamente</button></p>}{tab && payment && <section className="ux-panel ux-receipt"><div className="ux-receipt-heading"><Logo /><h2>Comanda {tab.number}</h2><PaymentStatus payment={payment} /><p>{tab.name || 'Visitante'}</p><p>{tab.responsible ? `Responsável: ${tab.responsible.name}` : 'Sem responsável vinculado à área do cliente.'}</p></div><p>Número do pagamento: <strong>{payment.id.slice(0, 8).toUpperCase()}</strong></p><p>{dateTime(payment.confirmedAtUtc ?? payment.createdAtUtc)}</p><dl className="ux-summary"><div><dt>{payment.state === 'Approved' ? 'Valor recebido' : 'Valor do pagamento não confirmado'}</dt><dd>{money(payment.amount)}</dd></div><div><dt>Meio</dt><dd>{paymentLabel(payment)}</dd></div>{payment.method === 'Cash' && <><div><dt>Dinheiro entregue</dt><dd>{money(payment.tendered)}</dd></div><div><dt>Troco</dt><dd>{money(payment.change)}</dd></div></>}</dl>{payment.method === 'TerminalManual' && <p className="ux-note">Aprovação declarada pelo atendente na maquininha, sem confirmação bancária automática.</p>}<p className="ux-note">Pagamento por valor. Abaixo, os itens da comanda no momento da consulta.</p>{tab.items.filter(row => ['Accepted', 'Fulfilled'].includes(row.state)).map(row => <div className="ux-list-row" key={row.id}><span>{row.quantity} × {row.name}</span><strong>{money(row.total)}</strong></div>)}<Summary tab={tab} />{payment.refunded > 0 && <p>Estornado: {money(payment.refunded)}</p>}{payment.refundPending > 0 && <p role="status">Estorno aguardando provedor: {money(payment.refundPending)}</p>}<div className="ux-actions ux-no-print"><Link className="ux-button primary" to="/atendimento/vender">Nova venda</Link><button className="ux-button secondary" onClick={() => window.print()}>Imprimir</button>{user?.permissions.includes('bar:refund:approve') && payment.state === 'Approved' && <button className="ux-button danger" onClick={() => setRefund(!refund)}>Estornar pagamento</button>}</div>{refund && <form className="ux-no-print" onSubmit={async event => { event.preventDefault(); const value = parseAmount(amount); if (!Number.isFinite(value) || value <= 0) { command.setError('Informe um valor válido.'); return } const result = await command.run(() => postBar<TabPayment>(`/tabs/${tabId}/payments/${paymentId}/refund`, { operationId: intent('refund'), amount: value, reason, manualConfirmed: payment?.method === 'TerminalManual' })); if (result.ok) { setRefund(false); intent('refund', true); command.setMessage('Estorno solicitado. Confira o estado no pagamento.') } }}><label className="ux-field">Valor a estornar (R$)<input required inputMode="decimal" value={amount} disabled={command.busy} onChange={event => { setAmount(event.target.value); intent('refund', true) }} /></label><label className="ux-field">Motivo obrigatório<input required minLength={3} maxLength={500} value={reason} disabled={command.busy} onChange={event => { setReason(event.target.value); intent('refund', true) }} /></label>{['TerminalManual', 'CardManual'].includes(payment.method) && <label className="ux-check"><input type="checkbox" required />Confirmo que a devolução já foi aprovada na maquininha. Este registro não movimenta estoque.</label>}<button className="ux-button danger" disabled={command.busy}>{['TerminalManual', 'CardManual'].includes(payment.method) ? 'Registrar devolução confirmada' : 'Confirmar estorno'}</button></form>}</section>}{tab && payment && <TabSettlement tab={tab} unavailable={command.busy} />}{tab && !payment && <p role="alert">Pagamento não encontrado nesta comanda.</p>}</BarFrame>
}
