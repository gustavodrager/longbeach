import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { usePrototype } from './PrototypeProvider'
import { EmptyState, Icon, Notice, PageHeader, ProductPicker, Status } from './components'
import { accountTotals, money, parseMoney } from './model'
import type { Account, CartItem, Consumption, Payment } from './types'

type ClientDraft = { cart: CartItem[]; orderOperation: string; paymentOperation: string; paymentId: string; partial: boolean; amount: string }
function operationId() { return crypto.randomUUID() }
function readDraft(accessId: string): ClientDraft {
  const fresh: ClientDraft = { cart: [], orderOperation: operationId(), paymentOperation: operationId(), paymentId: '', partial: false, amount: '' }
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(`longbeach-client-draft:${accessId}`) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return fresh
    const item = parsed as Partial<ClientDraft>
    return {
      cart: Array.isArray(item.cart) ? item.cart.filter(row => row && typeof row.productId === 'string' && Number.isInteger(row.quantity) && row.quantity > 0 && row.quantity <= 99) : [],
      orderOperation: typeof item.orderOperation === 'string' ? item.orderOperation : fresh.orderOperation,
      paymentOperation: typeof item.paymentOperation === 'string' ? item.paymentOperation : fresh.paymentOperation,
      paymentId: typeof item.paymentId === 'string' ? item.paymentId : '', partial: item.partial === true,
      amount: typeof item.amount === 'string' ? item.amount : '',
    }
  } catch { return fresh }
}
function time(value: string) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function paymentLabel(payment: Payment) { return payment.state === 'approved' ? 'Pagamento confirmado' : payment.state === 'declined' ? 'Pagamento não confirmado' : 'Esperando confirmação do Pix' }
function PaymentState({ payment }: { payment: Payment }) {
  return <Status tone={payment.state === 'approved' ? 'success' : payment.state === 'declined' ? 'danger' : 'warning'}>{paymentLabel(payment)}</Status>
}
function ItemState({ item }: { item: Consumption }) {
  const labels = { requested: 'Esperando a equipe confirmar', accepted: 'A equipe está preparando', fulfilled: 'Entregue', rejected: 'A equipe recusou', reversed: 'Consumo corrigido' }
  return <Status tone={item.status === 'requested' || item.status === 'accepted' ? 'warning' : item.status === 'fulfilled' ? 'success' : item.status === 'rejected' ? 'danger' : 'neutral'}>{labels[item.status]}</Status>
}

export function ClientPage() {
  const { accessId } = useParams(); const { state } = usePrototype()
  const account = state.accounts.find(item => item.accessId === accessId)
  const expires = account ? Date.parse(account.accessExpiresAt) : NaN
  const valid = account && account.state === 'open' && !account.accessRevoked && Number.isFinite(expires) && expires > Date.now()
  if (!valid) return <section className="ux-page"><PageHeader eyebrow="Long Beach · Cliente" title="Peça um novo acesso" /><EmptyState title="Este acesso não está disponível" description="Ele pode ter expirado ou a comanda pode ter sido encerrada. Peça à equipe o QR da sua comanda." /><p className="ux-note">Para proteger sua conta, número e nome não liberam o acesso.</p></section>
  return <ClientAccount key={account.accessId} account={account} />
}

function ClientAccount({ account }: { account: Account }) {
  const api = usePrototype(); const { state } = api
  const [initial] = useState(() => readDraft(account.accessId))
  const [tab, setTab] = useState<'catalog' | 'account'>('catalog')
  const [cart, setCart] = useState<CartItem[]>(initial.cart)
  const [partial, setPartial] = useState(initial.partial); const [amount, setAmount] = useState(initial.amount)
  const [paymentId, setPaymentId] = useState(initial.paymentId)
  const [paying, setPaying] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('')
  const [storageError, setStorageError] = useState('')
  const [payerName, setPayerName] = useState('Cliente de demonstração')
  const [payerEmail, setPayerEmail] = useState('cliente@example.com'); const [payerTaxId, setPayerTaxId] = useState('12345678909')
  const orderOperation = useRef(initial.orderOperation); const paymentOperation = useRef(initial.paymentOperation)
  const lock = useRef(false)
  const totals = accountTotals(state, account.id)
  const items = state.consumptions.filter(item => item.accountId === account.id)
  const requests = items.filter(item => item.status === 'requested' || item.status === 'rejected')
  const accepted = items.filter(item => item.status === 'accepted' || item.status === 'fulfilled' || item.status === 'reversed')
  const payments = state.payments.filter(payment => payment.accountId === account.id)
  const activePayment = payments.find(payment => payment.id === paymentId) ?? payments.find(payment => payment.state === 'pending')
  const cartTotal = cart.reduce((sum, row) => sum + (state.products.find(product => product.id === row.productId)?.priceCents ?? 0) * row.quantity, 0)
  const persist = () => {
    try { sessionStorage.setItem(`longbeach-client-draft:${account.accessId}`, JSON.stringify({ cart, orderOperation: orderOperation.current, paymentOperation: paymentOperation.current, paymentId, partial, amount })); setStorageError('') }
    catch { setStorageError('Não foi possível guardar seu pedido neste aparelho. Mantenha esta página aberta até a equipe confirmar.') }
  }
  useEffect(persist, [account.accessId, cart, paymentId, partial, amount])
  const updateCart = (next: CartItem[]) => { setCart(next); orderOperation.current = operationId(); setMessage(''); setError('') }
  const resetPaymentOperation = () => { paymentOperation.current = operationId(); setError(''); setMessage('') }
  const sendOrder = () => {
    if (lock.current || cart.length === 0) return
    lock.current = true; setError(''); setMessage('')
    try {
      const result = api.addItems(account.id, cart, false, orderOperation.current, account.accessId)
      if (!result.ok) { setError(result.error); return }
      setCart([]); orderOperation.current = operationId(); setTab('account'); setMessage('Pedido enviado. Espere a equipe confirmar; ele ainda não entrou no total da comanda.')
    } finally { lock.current = false }
  }
  const sendPix = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (lock.current) return
    const cents = partial ? parseMoney(amount) : totals.payableCents
    if (!Number.isFinite(cents) || cents <= 0 || cents > totals.payableCents) { setError(`Escolha um valor entre R$ 0,01 e ${money(totals.payableCents)}.`); return }
    lock.current = true; setError(''); setMessage('')
    try {
      const result = api.pay({ accountId: account.id, method: 'pix', amountCents: cents, accessId: account.accessId, payerName, payerEmail, payerTaxId }, paymentOperation.current)
      if (!result.ok) { setError(result.error); return }
      setPaymentId(result.value.id); setPaying(false); setMessage('Pix de demonstração criado. O pagamento só contará quando for confirmado pelo provedor simulado.')
      setPayerName('Cliente de demonstração'); setPayerEmail('cliente@example.com'); setPayerTaxId('12345678909')
    } finally { lock.current = false }
  }
  const beginPayment = () => { resetPaymentOperation(); setPaymentId(''); setPartial(false); setAmount(''); setPaying(true); setTab('account') }
  const itemList = (rows: Consumption[]) => rows.map(item => <article className="ux-list-row" key={item.id}><div><strong>{item.quantity} × {item.name}</strong><p className="ux-note">{time(item.createdAt)} · {item.source === 'selfservice' ? 'Seu pedido por QR' : 'Pedido com a equipe'}</p>{item.reason && <p className="ux-note">{item.reason}</p>}</div><div><strong>{money(item.quantity * item.priceCents)}</strong><ItemState item={item} /></div></article>)
  return <section className="ux-page">
    <header className="ux-client-header ux-panel"><div><span className="ux-note">Sua comanda · Long Beach</span><h1>Comanda {account.number}</h1>{account.name && <p>{account.name}</p>}</div><Status tone="success">Aberta</Status>
      <dl className="ux-summary"><div><dt>Total</dt><dd>{money(totals.totalCents)}</dd></div><div><dt>Já pago</dt><dd>{money(totals.paidCents)}</dd></div><div><dt>Pagamento pendente</dt><dd>{money(totals.pendingCents)}</dd></div><div><dt>Falta pagar</dt><dd className="ux-amount">{money(totals.dueCents)}</dd></div></dl>
    </header>
    <nav className="ux-tabs" aria-label="Sua comanda"><button type="button" className={`ux-button ${tab === 'catalog' ? 'primary' : 'secondary'}`} aria-pressed={tab === 'catalog'} onClick={() => setTab('catalog')}><Icon name="sell" /> Cardápio</button><button type="button" className={`ux-button ${tab === 'account' ? 'primary' : 'secondary'}`} aria-pressed={tab === 'account'} onClick={() => setTab('account')}><Icon name="tabs" /> Minha comanda{requests.some(item => item.status === 'requested') ? ` (${requests.filter(item => item.status === 'requested').length})` : ''}</button></nav>
    <Notice message={message || undefined} error={error || storageError || undefined} />
    {tab === 'catalog' ? <>
      <header className="ux-page-header"><h2>O que você vai pedir?</h2><p className="ux-description">Escolha os produtos. A equipe confirma seu pedido antes de incluir o valor na comanda.</p></header>
      <ProductPicker cart={cart} onChange={updateCart} />
      {cart.length > 0 && <section className="ux-panel"><h2>Confira seu pedido</h2>{cart.map(row => { const product = state.products.find(item => item.id === row.productId); return product ? <div className="ux-list-row" key={row.productId}><strong>{row.quantity} × {product.name}</strong><span>{money(row.quantity * product.priceCents)}</span></div> : null })}<div className="ux-list-row"><strong>Valor do pedido</strong><strong className="ux-amount">{money(cartTotal)}</strong></div><p className="ux-note">Este valor entra na comanda depois que a equipe aceitar.</p></section>}
      <div className="ux-sticky-action"><span>{cart.length ? `${cart.reduce((sum, item) => sum + item.quantity, 0)} itens · ${money(cartTotal)}` : 'Escolha um produto para começar'}</span><button className="ux-button primary" type="button" disabled={cart.length === 0} onClick={sendOrder}><Icon name="check" /> Enviar pedido à equipe</button></div>
    </> : <>
      {requests.length > 0 && <section className="ux-panel"><h2>Pedidos à equipe</h2><p className="ux-note">Pedidos esperando confirmação e recusados ainda não fazem parte do total cobrável.</p>{itemList(requests)}</section>}
      <section className="ux-panel"><h2>Itens da comanda</h2>{accepted.length ? itemList(accepted) : <EmptyState title="Ainda não há itens confirmados" description="Acompanhe a confirmação da equipe ou escolha produtos no cardápio." />}</section>
      {activePayment && !paying && <section className="ux-panel" aria-live="polite"><h2>{paymentLabel(activePayment)}</h2><PaymentState payment={activePayment} /><strong className="ux-amount">{money(activePayment.amountCents)}</strong>
        {activePayment.state === 'pending' ? <><div className="ux-demo-pix"><Icon name="pix" /><strong>Pix de demonstração. Não faça pagamento.</strong><p>Esta tela não gera um QR ou um código pagável.</p></div><p>Aguardando o provedor simulado confirmar. Seu pedido e a entrega continuam separados do pagamento.</p><p className="ux-note">Se você já pagou em uma operação real, espere a confirmação ou peça ajuda à equipe antes de tentar novamente.</p></> : activePayment.state === 'approved' ? <p>Este pagamento foi confirmado pelo provedor simulado e entrou em “Já pago”.</p> : <p>Este pagamento não entrou em “Já pago”. Você pode criar uma nova tentativa para o valor disponível.</p>}
        <p className="ux-note">Referência: {activePayment.id} · {time(activePayment.createdAt)}</p>
      </section>}
      {paying && <form className="ux-panel" onSubmit={sendPix}><h2>Quanto você vai pagar?</h2><div className="ux-actions"><button type="button" aria-pressed={!partial} className={`ux-button ${!partial ? 'primary' : 'secondary'}`} onClick={() => { setPartial(false); resetPaymentOperation() }}>Pagar tudo · {money(totals.payableCents)}</button><button type="button" aria-pressed={partial} className={`ux-button ${partial ? 'primary' : 'secondary'}`} onClick={() => { setPartial(true); resetPaymentOperation() }}>Pagar uma parte</button></div>
        {partial && <label className="ux-field">Valor da sua parte (R$)<input value={amount} inputMode="decimal" placeholder="Ex.: 20,00" required onChange={event => { setAmount(event.target.value); resetPaymentOperation() }} /></label>}
        {totals.pendingCents > 0 && <p className="ux-note">{money(totals.pendingCents)} já aguardam confirmação. Você pode pagar até {money(totals.payableCents)} nesta tentativa.</p>}
        <h3><Icon name="pix" /> Pagamento por Pix</h3><p className="ux-note">Somente demonstração. Use dados fictícios; eles não serão guardados no histórico.</p>
        <label className="ux-field">Nome do pagador<input autoComplete="off" value={payerName} required maxLength={100} onChange={event => { setPayerName(event.target.value); resetPaymentOperation() }} /></label>
        <label className="ux-field">E-mail do pagador<input type="email" autoComplete="off" value={payerEmail} required maxLength={150} onChange={event => { setPayerEmail(event.target.value); resetPaymentOperation() }} /></label>
        <label className="ux-field">CPF ou CNPJ do pagador<input inputMode="numeric" autoComplete="off" value={payerTaxId} required pattern="[0-9]{11}|[0-9]{14}" maxLength={14} onChange={event => { setPayerTaxId(event.target.value.replace(/\D/g, '')); resetPaymentOperation() }} /><span className="ux-note">Somente números · exemplo fictício preenchido</span></label>
        <div className="ux-actions"><button className="ux-button primary" disabled={totals.payableCents <= 0}><Icon name="pix" /> Gerar Pix de demonstração</button><button className="ux-button secondary" type="button" onClick={() => setPaying(false)}>Voltar à comanda</button></div>
      </form>}
      {payments.length > 0 && <section className="ux-panel"><h2>Seus pagamentos</h2>{payments.map(payment => <div className="ux-list-row" key={payment.id}><div><strong>{payment.method === 'cash' ? 'Dinheiro' : payment.method === 'card' ? 'Cartão' : 'Pix'} · {time(payment.createdAt)}</strong><PaymentState payment={payment} />{payment.refundedCents > 0 && <p className="ux-note">Estornado: {money(payment.refundedCents)}</p>}</div><strong>{money(payment.amountCents)}</strong></div>)}</section>}
      {!paying && <div className="ux-sticky-action"><div><span>Disponível para pagar</span><strong className="ux-amount">{money(totals.payableCents)}</strong>{totals.pendingCents > 0 && <p className="ux-note">Há {money(totals.pendingCents)} esperando confirmação.</p>}</div><button className="ux-button primary" type="button" disabled={totals.payableCents <= 0} onClick={beginPayment}><Icon name="pix" /> {activePayment?.state === 'declined' ? 'Tentar outro Pix' : 'Pagar com Pix'}</button></div>}
    </>}
  </section>
}
