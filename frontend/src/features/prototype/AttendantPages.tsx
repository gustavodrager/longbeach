import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { usePrototype } from './PrototypeProvider'
import { accountTotals, actorNames, availableStock, money, parseMoney } from './model'
import { EmptyState, Icon, Notice, PageHeader, ProductPicker, Status } from './components'
import type { CartItem, Consumption, Payment, PaymentInput, PrototypeState } from './types'

const operationId = () => globalThis.crypto?.randomUUID?.() ?? `ux-${Date.now()}-${Math.random().toString(36).slice(2)}`
const dateTime = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const cartTotal = (state: PrototypeState, cart: CartItem[]) => cart.reduce((total, item) => total + (state.products.find(product => product.id === item.productId)?.priceCents ?? 0) * item.quantity, 0)
const labels: Record<Consumption['status'], string> = { requested: 'Esperando a equipe confirmar', accepted: 'A preparar / entregar', fulfilled: 'Entregue', rejected: 'Recusado', reversed: 'Consumo corrigido' }
const paymentLabels: Record<Payment['method'], string> = { cash: 'Dinheiro', card: 'Cartão', pix: 'Pix' }

function useOperations() {
  const operations = useRef(new Map<string, string>())
  return (key: string, renew = false) => {
    if (renew || !operations.current.has(key)) operations.current.set(key, operationId())
    return operations.current.get(key)!
  }
}

function AccountSummary({ accountId }: { accountId: string }) {
  const { state } = usePrototype()
  const totals = accountTotals(state, accountId)
  return <dl className="ux-summary" aria-label="Valores da comanda">
    <div><dt>Total</dt><dd>{money(totals.totalCents)}</dd></div>
    <div><dt>Já pago</dt><dd>{money(totals.paidCents)}</dd></div>
    <div><dt>Pagamento pendente</dt><dd>{money(totals.pendingCents)}</dd></div>
    <div className="ux-total"><dt>Falta pagar</dt><dd>{money(totals.dueCents)}</dd></div>
  </dl>
}

function CartSummary({ cart }: { cart: CartItem[] }) {
  const { state } = usePrototype()
  return <div className="ux-panel">
    <h2>Conferir pedido</h2>
    <ul className="ux-cart-lines">{cart.map(item => {
      const product = state.products.find(product => product.id === item.productId)
      if (!product) return null
      return <li className="ux-list-row" key={item.productId}><span><strong>{item.quantity} × {product.name}</strong><small>{money(product.priceCents)} cada</small></span><strong>{money(product.priceCents * item.quantity)}</strong></li>
    })}</ul>
    <p className="ux-total"><span>Total do pedido</span><strong>{money(cartTotal(state, cart))}</strong></p>
  </div>
}

type SaleDraft = { cart: CartItem[]; accountId?: string; openId: string; addId: string; reviewing: boolean }
const saleStorageKey = 'longbeach-ux-sale-draft'
function loadSaleDraft(): SaleDraft {
  try {
    const value = JSON.parse(sessionStorage.getItem(saleStorageKey) ?? 'null') as SaleDraft | null
    if (value && Array.isArray(value.cart) && typeof value.openId === 'string' && typeof value.addId === 'string') return value
  } catch { /* A fresh draft remains usable when storage is unavailable. */ }
  return { cart: [], openId: operationId(), addId: operationId(), reviewing: false }
}

export function SellPage() {
  const api = usePrototype()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(loadSaleDraft)
  const [error, setError] = useState('')
  const draftRef = useRef(draft)
  const busy = useRef(false)
  const persistDraft = (next: SaleDraft) => {
    draftRef.current = next
    setDraft(next)
    try { sessionStorage.setItem(saleStorageKey, JSON.stringify(next)) } catch { setError('Não foi possível guardar este pedido no aparelho. Mantenha esta tela aberta.') }
  }
  useEffect(() => { draftRef.current = draft }, [draft])
  const submit = () => {
    if (busy.current || !draftRef.current.cart.length) return
    busy.current = true
    setError('')
    let current = draftRef.current
    if (!current.accountId) {
      const result = api.openAccount('', 'immediate', current.openId)
      if (!result.ok) { if (!api.offline) persistDraft({ ...current, openId: operationId() }); setError(result.error); busy.current = false; return }
      current = { ...current, accountId: result.value.id }
      persistDraft(current)
    }
    const result = api.addItems(current.accountId!, current.cart, true, current.addId)
    busy.current = false
    if (!result.ok) { if (!api.offline) persistDraft({ ...current, addId: operationId() }); setError(result.error); return }
    try { sessionStorage.removeItem(saleStorageKey) } catch { /* Successful state is retained by the provider. */ }
    navigate(`/prototipo/receber/${current.accountId}`, { replace: true })
  }
  const stale = draft.accountId && !api.state.accounts.some(account => account.id === draft.accountId)
  const canEdit = !draft.accountId || !api.state.consumptions.some(item => item.accountId === draft.accountId)
  const itemCount = draft.cart.reduce((sum, item) => sum + item.quantity, 0)
  return <div className="ux-page">
    <PageHeader eyebrow="Atendimento" title="Vender" description="Toque no produto. Confira. Receba." />
    <Notice error={error} />
    {stale ? <EmptyState title="Este pedido precisa ser recomeçado" description="Os dados de demonstração foram reiniciados."><button className="ux-button primary" onClick={() => persistDraft({ cart: [], openId: operationId(), addId: operationId(), reviewing: false })}>Começar nova venda</button></EmptyState> : <>
      {!draft.reviewing ? <>
        <ProductPicker cart={draft.cart} onChange={cart => persistDraft({ ...draftRef.current, cart, addId: operationId() })} disabled={!canEdit} />
        {draft.cart.length > 0 && <div className="ux-sticky-action"><span><strong>{itemCount} {itemCount === 1 ? 'item' : 'itens'}</strong><small>{money(cartTotal(api.state, draft.cart))}</small></span><button className="ux-button primary" onClick={() => persistDraft({ ...draftRef.current, reviewing: true })}>Conferir pedido <Icon name="arrow" /></button></div>}
      </> : <>
        <CartSummary cart={draft.cart} />
        <p className="ux-note">Produtos prontos serão entregues. Produtos preparados aparecerão em Pedidos.</p>
        {draft.accountId && <Notice message="Sua venda foi aberta. Tente novamente para concluir o registro deste mesmo pedido." />}
        <div className="ux-actions"><button className="ux-button secondary" disabled={!canEdit} onClick={() => persistDraft({ ...draftRef.current, reviewing: false })}><Icon name="back" /> Alterar pedido</button><button className="ux-button primary" onClick={submit}><Icon name="cash" /> Receber {money(cartTotal(api.state, draft.cart))}</button></div>
      </>}
    </>}
  </div>
}

export function TabsPage() {
  const api = usePrototype()
  const navigate = useNavigate()
  const [query, setQuery] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const openId = useRef(operationId())
  const busy = useRef(false)
  const search = query.get('busca') ?? ''
  const accounts = api.state.accounts.filter(account => {
    const totals = accountTotals(api.state, account.id)
    const unfinishedSale = account.mode === 'immediate' && (totals.dueCents > 0 || totals.pendingCents > 0 || api.state.consumptions.some(item => item.accountId === account.id && (item.status === 'requested' || item.status === 'accepted')))
    return (account.mode === 'tab' || unfinishedSale) && account.state === 'open' && `${account.number} ${account.name}`.toLowerCase().includes(search.toLowerCase())
  }).sort((a, b) => a.number - b.number)
  const create = (event: React.FormEvent) => {
    event.preventDefault()
    if (busy.current) return
    busy.current = true
    const result = api.openAccount(name.trim(), 'tab', openId.current)
    busy.current = false
    if (!result.ok) { if (!api.offline) openId.current = operationId(); setError(result.error); return }
    navigate(`/prototipo/comandas/${result.value.id}`)
  }
  return <div className="ux-page">
    <PageHeader eyebrow="Atendimento" title="Comandas" description="Encontre pelo número ou pelo nome."><button className="ux-button primary" onClick={() => { setCreating(true); setError('') }}><Icon name="plus" /> Abrir comanda</button></PageHeader>
    <Notice error={error} />
    {creating && <form className="ux-panel" onSubmit={create}>
      <h2>Nova comanda</h2>
      <label className="ux-field">Nome, se quiser<input autoFocus value={name} onChange={event => { setName(event.target.value); openId.current = operationId() }} maxLength={60} placeholder="Ex.: Carla ou grupo da quadra 2" /></label>
      <p className="ux-note">O número será criado automaticamente. Não precisa cadastrar cliente.</p>
      <div className="ux-actions"><button className="ux-button secondary" type="button" onClick={() => setCreating(false)}>Cancelar</button><button className="ux-button primary" type="submit">Abrir comanda</button></div>
    </form>}
    <label className="ux-field"><span><Icon name="search" /> Buscar comanda</span><input type="search" inputMode="search" placeholder="Número ou nome" value={search} onChange={event => setQuery(event.target.value ? { busca: event.target.value } : {}, { replace: true })} /></label>
    <div className="ux-grid ux-account-grid">{accounts.map(account => {
      const totals = accountTotals(api.state, account.id)
      return <Link className="ux-card ux-account-card" key={account.id} to={`/prototipo/comandas/${account.id}`}><span className="ux-note">Comanda</span><strong className="ux-account-number">{account.number}</strong><span>{account.name || 'Visitante'}</span><span className="ux-total">Falta pagar <strong>{money(totals.dueCents)}</strong></span>{totals.pendingCents > 0 && <Status tone="warning">Pix pendente: {money(totals.pendingCents)}</Status>}<span className="ux-card-link">Abrir comanda <Icon name="arrow" /></span></Link>
    })}</div>
    {!accounts.length && <EmptyState title={search ? 'Nenhuma comanda encontrada' : 'Nenhuma comanda aberta'} description={search ? 'Confira o número ou tente o nome.' : 'Abra uma comanda para registrar o consumo do visitante.'} />}
  </div>
}

export function TabPage() {
  const { accountId = '' } = useParams()
  const api = usePrototype()
  const navigate = useNavigate()
  const operation = useOperations()
  const [cart, setCart] = useState<CartItem[]>([])
  const [adding, setAdding] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [correction, setCorrection] = useState('')
  const [reason, setReason] = useState('')
  const [returnStock, setReturnStock] = useState(false)
  const addId = useRef(operationId())
  const busy = useRef(false)
  const account = api.state.accounts.find(account => account.id === accountId)
  if (!account) return <EmptyState title="Comanda não encontrada" description="Volte para a lista e escolha uma comanda."><Link className="ux-button primary" to="/prototipo/comandas">Ver comandas</Link></EmptyState>
  const consumptions = api.state.consumptions.filter(item => item.accountId === account.id)
  const payments = api.state.payments.filter(item => item.accountId === account.id)
  const ready = cart.length > 0 && cart.every(item => !api.state.products.find(product => product.id === item.productId)?.prepared)
  const submitItems = (deliver: boolean) => {
    if (busy.current) return
    busy.current = true
    const result = api.addItems(account.id, cart, deliver, addId.current)
    busy.current = false
    if (!result.ok) { if (!api.offline) addId.current = operationId(); setError(result.error); return }
    setMessage(deliver ? 'Pedido registrado e entregue.' : 'Pedido registrado. A equipe verá em Pedidos.')
    setError(''); setCart([]); setAdding(false); setReviewing(false)
  }
  const correct = (event: React.FormEvent) => {
    event.preventDefault()
    const result = api.reverse(correction, reason, returnStock, operation(`reverse:${correction}:${reason}:${returnStock}`))
    if (!result.ok) { if (!api.offline) operation(`reverse:${correction}:${reason}:${returnStock}`, true); setError(result.error); return }
    setCorrection(''); setReason(''); setReturnStock(false); setError(''); setMessage('Correção registrada no histórico.')
  }
  const close = () => {
    const result = api.closeAccount(account.id, operation(`close:${account.id}`))
    if (!result.ok) { if (!api.offline) operation(`close:${account.id}`, true); setError(result.error); return }
    navigate('/prototipo/comandas')
  }
  return <div className="ux-page">
    <PageHeader eyebrow={account.state === 'closed' ? 'Comanda encerrada' : 'Comanda aberta'} title={`Comanda ${account.number}`} description={account.name || 'Visitante'} backTo="/prototipo/comandas" />
    <section className="ux-panel ux-account-header"><p className="ux-eyebrow">Comanda {account.number} · {account.name || 'Visitante'}</p><AccountSummary accountId={account.id} />{account.state === 'open' && <div className="ux-actions"><button className="ux-button secondary" onClick={() => { if (!adding) addId.current = operationId(); setAdding(true); setError('') }}><Icon name="plus" /> Adicionar produtos</button><Link className="ux-button primary" to={`/prototipo/receber/${account.id}`}><Icon name="cash" /> Receber</Link></div>}</section>
    <Notice error={error} message={message} />
    {adding && <section className="ux-panel"><h2>Adicionar à comanda {account.number}</h2>{reviewing ? <><CartSummary cart={cart} /><p className="ux-note">Produtos preparados seguirão para a fila de pedidos.</p><div className="ux-actions"><button className="ux-button secondary" onClick={() => setReviewing(false)}>Alterar pedido</button><button className="ux-button primary" onClick={() => submitItems(false)}>Adicionar à comanda</button>{ready && <button className="ux-button primary" onClick={() => submitItems(true)}><Icon name="check" /> Registrar e entregar</button>}</div></> : <><ProductPicker cart={cart} onChange={setCart} /><div className="ux-actions"><button className="ux-button secondary" onClick={() => setAdding(false)}>Cancelar</button><button className="ux-button primary" disabled={!cart.length} onClick={() => setReviewing(true)}>Conferir pedido {money(cartTotal(api.state, cart))}</button></div></>}</section>}
    <section className="ux-panel"><h2>Consumo</h2>{!consumptions.length && <p>Esta comanda ainda não tem produtos.</p>}<ul className="ux-cart-lines">{consumptions.map(item => <li className="ux-list-row ux-consumption-row" key={item.id}><div><strong>{item.quantity} × {item.name}</strong><small>{dateTime(item.createdAt)} · {item.source === 'selfservice' ? 'Pedido pelo QR' : actorNames[item.actorId as keyof typeof actorNames] ?? 'Equipe'}</small><Status tone={item.status === 'fulfilled' ? 'success' : item.status === 'requested' || item.status === 'accepted' ? 'warning' : 'neutral'}>{labels[item.status]}</Status>{item.reason && <small>Motivo: {item.reason}</small>}</div><div className="ux-line-actions"><strong>{money(item.priceCents * item.quantity)}</strong>{api.actorId === 'supervisor' && (item.status === 'accepted' || item.status === 'fulfilled') && <button className="ux-button secondary" onClick={() => { setCorrection(item.id); setReason(''); setReturnStock(false) }}>Corrigir consumo</button>}</div></li>)}</ul><p className="ux-note">Pedidos esperando confirmação, recusados ou corrigidos não entram no total.</p></section>
    {correction && <form className="ux-panel" onSubmit={correct}><h2>Corrigir consumo</h2><label className="ux-field">Motivo obrigatório<input required value={reason} onChange={event => setReason(event.target.value)} /></label><label className="ux-check"><input type="checkbox" checked={returnStock} onChange={event => setReturnStock(event.target.checked)} /> O produto voltou fisicamente para o estoque</label><div className="ux-actions"><button type="button" className="ux-button secondary" onClick={() => setCorrection('')}>Cancelar</button><button className="ux-button danger" type="submit">Confirmar correção</button></div></form>}
    <section className="ux-panel"><h2>Pagamentos</h2>{!payments.length && <p>Nenhum pagamento registrado.</p>}{payments.map(payment => <div className="ux-list-row" key={payment.id}><div><strong>{paymentLabels[payment.method]} · {money(payment.amountCents)}</strong><small>{dateTime(payment.createdAt)}</small><Status tone={payment.state === 'approved' ? 'success' : payment.state === 'pending' ? 'warning' : 'danger'}>{payment.state === 'approved' ? 'Confirmado' : payment.state === 'pending' ? 'Esperando confirmação' : 'Não confirmado'}</Status>{payment.refundedCents > 0 && <small>Estornado: {money(payment.refundedCents)}</small>}</div><Link className="ux-button secondary" to={payment.state === 'approved' ? `/prototipo/comprovante/${payment.id}` : `/prototipo/receber/${account.id}?paymentId=${payment.id}`}>{payment.state === 'approved' ? 'Ver comprovante' : 'Ver pagamento'}</Link></div>)}</section>
    <section className="ux-panel"><h2>Cliente por QR</h2><p>O cliente acessa somente esta comanda pelo link exclusivo.</p>{!account.accessRevoked && new Date(account.accessExpiresAt).getTime() > Date.now() ? <Link className="ux-button secondary" to={`/prototipo/cliente/${account.accessId}`}><Icon name="qr" /> Abrir visão do cliente</Link> : <Status tone="danger">Acesso do cliente expirado ou revogado</Status>}</section>
    {account.state === 'open' && <button className="ux-button secondary" onClick={close}>Encerrar comanda</button>}
  </div>
}

export function OrdersPage() {
  const api = usePrototype()
  const [query, setQuery] = useSearchParams()
  const operation = useOperations()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [rejectId, setRejectId] = useState('')
  const [reason, setReason] = useState('')
  const filter = query.get('status') ?? 'all'
  const items = api.state.consumptions.filter(item => (item.status === 'requested' || item.status === 'accepted') && (filter === 'all' || item.status === filter)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const act = (item: Consumption, action: 'accept' | 'fulfill') => {
    const result = api[action](item.id, operation(`${action}:${item.id}`))
    if (!result.ok) { if (!api.offline) operation(`${action}:${item.id}`, true); setError(result.error); return }
    setError(''); setMessage(action === 'accept' ? 'Pedido aceito. Agora ele entra no total da comanda.' : 'Entrega registrada.')
  }
  const reject = (event: React.FormEvent) => {
    event.preventDefault()
    const result = api.reject(rejectId, reason, operation(`reject:${rejectId}:${reason}`))
    if (!result.ok) { if (!api.offline) operation(`reject:${rejectId}:${reason}`, true); setError(result.error); return }
    setError(''); setMessage('Pedido recusado. O cliente verá o motivo.'); setRejectId(''); setReason('')
  }
  return <div className="ux-page">
    <PageHeader eyebrow="Atendimento" title="Pedidos" description="Confirme o pedido. Prepare. Entregue." />
    <Notice error={error} message={message} />
    <div className="ux-actions" aria-label="Filtrar pedidos">{[['all', 'Todos'], ['requested', 'Confirmar'], ['accepted', 'Entregar']].map(([value, label]) => <button className={`ux-button ${filter === value ? 'primary' : 'secondary'}`} aria-pressed={filter === value} key={value} onClick={() => setQuery(value === 'all' ? {} : { status: value })}>{label}</button>)}</div>
    {!items.length && <EmptyState title="Tudo em dia" description="Os próximos pedidos aparecerão aqui." />}
    <div className="ux-grid ux-order-grid">{items.map(item => {
      const account = api.state.accounts.find(account => account.id === item.accountId)
      const stock = availableStock(api.state, item.productId) + (item.status === 'accepted' ? item.quantity : 0)
      return <article className="ux-card" key={item.id}><div className="ux-list-row"><Link to={`/prototipo/comandas/${item.accountId}`}><strong>Comanda {account?.number ?? '—'}</strong></Link><span className="ux-note">{dateTime(item.createdAt)}</span></div><h2>{item.quantity} × {item.name}</h2><p>{account?.name || 'Visitante'} · {item.source === 'selfservice' ? 'Pedido pelo QR' : 'Pedido da equipe'}</p><Status tone="warning">{labels[item.status]}</Status>{stock < item.quantity && <p className="ux-note">Estoque insuficiente para entregar agora.</p>}<div className="ux-actions">{item.status === 'requested' ? <><button className="ux-button secondary" onClick={() => { setRejectId(item.id); setReason('') }}><Icon name="close" /> Recusar</button><button className="ux-button primary" onClick={() => act(item, 'accept')}><Icon name="check" /> Aceitar</button></> : <button className="ux-button primary" onClick={() => act(item, 'fulfill')}><Icon name="check" /> Entregar</button>}</div>{rejectId === item.id && <form onSubmit={reject}><label className="ux-field">Por que foi recusado?<select value={reason} required onChange={event => setReason(event.target.value)}><option value="">Escolher motivo</option><option>Produto indisponível</option><option>Pedido repetido</option><option>Cliente desistiu</option></select></label><div className="ux-actions"><button className="ux-button secondary" type="button" onClick={() => setRejectId('')}>Voltar</button><button className="ux-button danger" type="submit">Confirmar recusa</button></div></form>}</article>
    })}</div>
  </div>
}

type PaymentDraft = { stage: 'amount' | 'method' | 'details'; partial: boolean; amount: string; method: Payment['method']; tendered: string; approved: boolean; payerName: string; payerEmail: string; payerTaxId: string; operationId: string; paymentId?: string }
const newPaymentDraft = (): PaymentDraft => ({ stage: 'amount', partial: false, amount: '', method: 'cash', tendered: '', approved: false, payerName: '', payerEmail: '', payerTaxId: '', operationId: operationId() })
const paymentKey = (accountId: string) => `longbeach-ux-payment:${accountId}`
function loadPaymentDraft(accountId: string): PaymentDraft {
  try { const value = JSON.parse(sessionStorage.getItem(paymentKey(accountId)) ?? 'null') as PaymentDraft | null; if (value && value.operationId && ['amount', 'method', 'details'].includes(value.stage)) return value } catch { /* Keep the payment usable if storage is unavailable. */ }
  return newPaymentDraft()
}

export function ReceivePage() {
  const { accountId = '' } = useParams()
  const [query] = useSearchParams()
  const api = usePrototype()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(() => loadPaymentDraft(accountId))
  const [error, setError] = useState('')
  const busy = useRef(false)
  const account = api.state.accounts.find(item => item.id === accountId)
  const totals = accountTotals(api.state, accountId)
  const payment = api.state.payments.find(item => item.id === (query.get('paymentId') || draft.paymentId) && item.accountId === accountId)
  const amount = draft.partial ? parseMoney(draft.amount) : totals.payableCents
  const cash = api.state.cashSessions.find(item => item.actorId === api.actorId && item.state === 'open')
  const tendered = parseMoney(draft.tendered)
  const change = Number.isSafeInteger(tendered) ? Math.max(0, tendered - amount) : 0
  const update = (patch: Partial<PaymentDraft>, newOperation = true) => {
    const next = { ...draft, ...patch, operationId: newOperation ? operationId() : draft.operationId }
    setDraft(next)
    try { sessionStorage.setItem(paymentKey(accountId), JSON.stringify(next)) } catch { setError('Este aparelho não conseguiu guardar o pagamento. Mantenha a tela aberta até concluir.') }
  }
  useEffect(() => { setDraft(loadPaymentDraft(accountId)); setError('') }, [accountId])
  useEffect(() => {
    if (payment?.state !== 'approved' || payment.id !== draft.paymentId) return
    try { sessionStorage.removeItem(paymentKey(accountId)) } catch { /* Clear the in-memory draft even without storage. */ }
    setDraft(newPaymentDraft())
    navigate(`/prototipo/comprovante/${payment.id}`, { replace: true })
  }, [payment?.id, payment?.state, draft.paymentId, accountId, navigate])
  const goToMethods = () => {
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > totals.payableCents) { setError('Digite um valor maior que zero e até o valor disponível para receber.'); return }
    setError(''); update({ stage: 'method' })
  }
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (busy.current) return
    busy.current = true
    const input: PaymentInput = { accountId, amountCents: amount, method: draft.method }
    if (draft.method === 'cash') input.tenderedCents = parseMoney(draft.tendered)
    if (draft.method === 'card') input.cardApproved = draft.approved
    if (draft.method === 'pix') Object.assign(input, { payerName: draft.payerName, payerEmail: draft.payerEmail, payerTaxId: draft.payerTaxId })
    const result = api.pay(input, draft.operationId)
    busy.current = false
    if (!result.ok) { if (!api.offline) update({}); setError(result.error); return }
    setError(''); update({ paymentId: result.value.id }, false)
    if (result.value.state === 'approved') {
      try { sessionStorage.removeItem(paymentKey(accountId)) } catch { /* Preserve the receipt in the provider. */ }
      setDraft(newPaymentDraft())
      navigate(`/prototipo/comprovante/${result.value.id}`, { replace: true })
    }
  }
  const retry = () => {
    const next = { ...draft, paymentId: undefined, operationId: operationId(), approved: false }
    setDraft(next)
    try { sessionStorage.setItem(paymentKey(accountId), JSON.stringify(next)) } catch { /* Retain the in-memory draft. */ }
    navigate(`/prototipo/receber/${accountId}`, { replace: true }); setError('')
  }
  if (!account) return <EmptyState title="Comanda não encontrada" description="Escolha uma comanda antes de receber."><Link className="ux-button primary" to="/prototipo/comandas">Ver comandas</Link></EmptyState>
  return <div className="ux-page ux-receive-page">
    <PageHeader eyebrow={`Comanda ${account.number} · ${account.name || 'Visitante'}`} title="Receber" backTo={`/prototipo/comandas/${accountId}`} />
    <div className="ux-panel"><AccountSummary accountId={accountId} /></div>
    <Notice error={error} />
    {payment ? <section className="ux-panel ux-payment-state"><Icon name={payment.state === 'approved' ? 'check' : payment.state === 'pending' ? 'clock' : 'close'} size={48} /><h2>{payment.state === 'approved' ? 'Pagamento confirmado' : payment.state === 'pending' ? 'Esperando confirmação do Pix' : 'Pagamento não confirmado'}</h2><p className="ux-amount">{money(payment.amountCents)}</p>{payment.state === 'pending' ? <><div className="ux-demo-qr" aria-label="QR ilustrativo, sem dados de cobrança"><Icon name="qr" size={96} /></div><p>Pix de demonstração. Este desenho não faz pagamento.</p><p className="ux-note">A confirmação depende do provedor. Use o painel de demonstração para simular o resultado. Não receba este mesmo valor novamente enquanto ele estiver pendente.</p><Link className="ux-button secondary" to={`/prototipo/comandas/${accountId}`}>Voltar à comanda</Link></> : payment.state === 'approved' ? <Link className="ux-button primary" to={`/prototipo/comprovante/${payment.id}`}>Ver comprovante</Link> : <><p>O valor não foi recebido. A comanda continua aberta.</p><button className="ux-button primary" onClick={retry}>Tentar outro pagamento</button></>}</section> : totals.payableCents <= 0 ? <EmptyState title={totals.pendingCents > 0 ? 'Há um pagamento esperando confirmação' : 'Tudo pago'} description={totals.pendingCents > 0 ? 'Veja o pagamento pendente na comanda antes de receber novamente.' : 'Você pode voltar à comanda e encerrar o atendimento.'}><Link className="ux-button primary" to={`/prototipo/comandas/${accountId}`}>Voltar à comanda</Link></EmptyState> : <>
      <ol className="ux-payment-steps" aria-label="Etapas de recebimento"><li aria-current={draft.stage === 'amount' ? 'step' : undefined}>1. Valor</li><li aria-current={draft.stage === 'method' ? 'step' : undefined}>2. Forma</li><li aria-current={draft.stage === 'details' ? 'step' : undefined}>3. Confirmar</li></ol>
      {draft.stage === 'amount' && <section className="ux-panel"><h2>Quanto vai receber?</h2><div className="ux-grid ux-choice-grid"><button className={`ux-button ux-choice ${!draft.partial ? 'primary' : 'secondary'}`} aria-pressed={!draft.partial} onClick={() => update({ partial: false })}><Icon name="check" /><span>Receber tudo<strong>{money(totals.payableCents)}</strong></span></button><button className={`ux-button ux-choice ${draft.partial ? 'primary' : 'secondary'}`} aria-pressed={draft.partial} onClick={() => update({ partial: true })}><Icon name="plus" />Receber uma parte</button></div>{draft.partial && <label className="ux-field">Valor desta parte (R$)<input inputMode="decimal" placeholder="0,00" value={draft.amount} onChange={event => update({ amount: event.target.value })} /></label>}<p className="ux-note">Uma parte pode ser paga em dinheiro, outra em cartão ou Pix.</p><button className="ux-button primary" onClick={goToMethods}>Escolher forma de pagamento <Icon name="arrow" /></button></section>}
      {draft.stage === 'method' && <section className="ux-panel"><h2>Como vai receber {money(amount)}?</h2><div className="ux-grid ux-choice-grid">{(['cash', 'card', 'pix'] as const).map(method => <button key={method} className="ux-button secondary ux-choice" onClick={() => update({ method, stage: 'details', tendered: method === 'cash' ? (amount / 100).toFixed(2).replace('.', ',') : '', approved: false })}><Icon name={method === 'cash' ? 'cash' : method} size={32} />{paymentLabels[method]}</button>)}</div><button className="ux-button secondary" onClick={() => update({ stage: 'amount' })}><Icon name="back" /> Alterar valor</button></section>}
      {draft.stage === 'details' && <form className="ux-panel" onSubmit={submit}><h2>{paymentLabels[draft.method]} · {money(amount)}</h2>
        {draft.method === 'cash' && <>{!cash && <Notice error="Abra o seu caixa antes de receber dinheiro." />}<label className="ux-field">Dinheiro recebido (R$)<input autoFocus required inputMode="decimal" placeholder="0,00" value={draft.tendered} onChange={event => update({ tendered: event.target.value })} /></label><div className="ux-actions">{[amount, ...[1000, 2000, 5000, 10000].filter(value => value > amount)].slice(0, 4).map(value => <button key={value} className="ux-button secondary" type="button" onClick={() => update({ tendered: (value / 100).toFixed(2).replace('.', ',') })}>{value === amount ? 'Valor exato' : money(value)}</button>)}</div><p className="ux-total"><span>Troco</span><strong>{money(change)}</strong></p>{!cash && <Link className="ux-button secondary" to="/prototipo/caixa">Abrir meu caixa</Link>}</>}
        {draft.method === 'card' && <><p>Faça a cobrança na maquininha primeiro.</p><label className="ux-check"><input type="checkbox" checked={draft.approved} onChange={event => update({ approved: event.target.checked })} /> A maquininha mostrou pagamento aprovado</label></>}
        {draft.method === 'pix' && <><p>O Pix ficará pendente até a confirmação do provedor.</p><label className="ux-field">Nome de quem paga<input required autoComplete="name" value={draft.payerName} onChange={event => update({ payerName: event.target.value })} /></label><label className="ux-field">E-mail<input required type="email" autoComplete="email" value={draft.payerEmail} onChange={event => update({ payerEmail: event.target.value })} /></label><label className="ux-field">CPF ou CNPJ<input required inputMode="numeric" value={draft.payerTaxId} onChange={event => update({ payerTaxId: event.target.value })} /></label><p className="ux-note">Use dados fictícios nesta demonstração.</p></>}
        <div className="ux-actions"><button className="ux-button secondary" type="button" onClick={() => update({ stage: 'method' })}><Icon name="back" /> Trocar forma</button><button className="ux-button primary" type="submit" disabled={(draft.method === 'card' && !draft.approved) || (draft.method === 'cash' && !cash)}>{draft.method === 'pix' ? 'Gerar Pix de demonstração' : 'Confirmar recebimento'}</button></div>
      </form>}
    </>}
  </div>
}

export function CashPage() {
  const api = usePrototype()
  const [query] = useSearchParams()
  const operation = useOperations()
  const [action, setAction] = useState<'supply' | 'withdraw' | 'close' | ''>('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const selectedId = query.get('sessionId')
  const selected = selectedId ? api.state.cashSessions.find(session => session.id === selectedId) : undefined
  const ownOpen = api.state.cashSessions.find(session => session.actorId === api.actorId && session.state === 'open')
  const session = selectedId ? selected : ownOpen
  const authorized = !selected || selected.actorId === api.actorId || api.actorId === 'supervisor'
  const ownSession = !session || session.actorId === api.actorId
  const busy = useRef(false)
  const intent = useRef(operationId())
  const counted = parseMoney(amount)
  const validCount = Number.isSafeInteger(counted)
  const difference = session && action === 'close' && validCount ? counted - session.expectedCents : 0
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (busy.current) return
    busy.current = true
    const cents = parseMoney(amount)
    const result = !session ? api.openCash(cents, operation(`open:${api.actorId}:${cents}:${intent.current}`)) : action === 'close' ? api.closeCash(cents, reason, operation(`close:${session.id}:${cents}:${reason}:${intent.current}`), session.id) : action === 'supply' || action === 'withdraw' ? api.moveCash(action, cents, reason, operation(`${action}:${session.id}:${cents}:${reason}:${intent.current}`)) : undefined
    busy.current = false
    if (!result) return
    if (!result.ok) { if (!api.offline) intent.current = operationId(); setError(result.error); return }
    setError(''); setMessage(!session ? 'Caixa aberto. Você já pode receber dinheiro.' : action === 'close' ? 'Caixa fechado. Conferência guardada no histórico.' : 'Movimentação registrada.'); setAction(''); setAmount(''); setReason('')
  }
  const choose = (next: typeof action) => { intent.current = operationId(); setAction(next); setAmount(''); setReason(''); setError(''); setMessage('') }
  if (selectedId && (!selected || !authorized)) return <EmptyState title="Este caixa não está disponível para você" description="Cada atendente usa o próprio caixa. A conferência de outro caixa é feita pelo supervisor."><Link className="ux-button primary" to="/prototipo/caixa">Ir para meu caixa</Link></EmptyState>
  const movements = api.state.cashMovements.filter(movement => movement.sessionId === session?.id).slice().reverse()
  const history = api.state.cashSessions.filter(item => item.actorId === api.actorId && item.state === 'closed').slice().reverse()
  const movementLabels = { opening: 'Abertura', payment: 'Recebimento', supply: 'Dinheiro colocado', withdraw: 'Dinheiro retirado', refund: 'Estorno' }
  return <div className="ux-page">
    <PageHeader eyebrow={selected && !ownSession ? `Conferência de ${actorNames[selected.actorId]}` : actorNames[api.actorId]} title={ownSession ? 'Meu caixa' : 'Conferir caixa'} description="Somente dinheiro em espécie. Pix e cartão não entram neste saldo." />
    <Notice error={error} message={message} />
    {!session ? <form className="ux-panel" onSubmit={submit}><h2>Abrir meu caixa</h2><p>Conte o dinheiro que já está na gaveta.</p><label className="ux-field">Dinheiro inicial (R$)<input required inputMode="decimal" value={amount} placeholder="0,00" onChange={event => setAmount(event.target.value)} /></label><button className="ux-button primary" type="submit">Abrir caixa</button></form> : <>
      <section className="ux-panel"><Status tone={session.state === 'open' ? 'success' : 'neutral'}>{session.state === 'open' ? 'Caixa aberto' : 'Caixa fechado'}</Status><p className="ux-note">Aberto em {dateTime(session.createdAt)}</p><p className="ux-total"><span>Dinheiro esperado</span><strong>{money(session.expectedCents)}</strong></p>{session.countedCents !== undefined && <p className="ux-total"><span>Dinheiro contado</span><strong>{money(session.countedCents)}</strong></p>}{session.differenceCents !== undefined && <p className="ux-total"><span>Diferença registrada</span><strong>{money(session.differenceCents)}</strong></p>}{session.reason && <p>Motivo: {session.reason}</p>}{session.state === 'open' && <div className="ux-actions">{ownSession && <><button className="ux-button secondary" onClick={() => choose('supply')}><Icon name="plus" /> Colocar dinheiro</button><button className="ux-button secondary" onClick={() => choose('withdraw')}><Icon name="minus" /> Retirar dinheiro</button></>}<button className="ux-button primary" onClick={() => choose('close')}>Fechar caixa</button></div>}</section>
      {action && session.state === 'open' && <form className="ux-panel" onSubmit={submit}>
        <h2>{action === 'close' ? 'Conte o dinheiro da gaveta' : action === 'supply' ? 'Colocar dinheiro' : 'Retirar dinheiro'}</h2>
        <label className="ux-field">{action === 'close' ? 'Dinheiro contado (R$)' : 'Valor (R$)'}<input autoFocus required inputMode="decimal" placeholder="0,00" value={amount} onChange={event => setAmount(event.target.value)} /></label>
        {action === 'close' && validCount && <p className="ux-total"><span>Diferença da contagem</span><strong>{money(difference)}</strong></p>}
        {action === 'close' && validCount && difference !== 0 && api.actorId !== 'supervisor' && <Notice error="O valor contado está diferente. Confira novamente e peça ao supervisor para concluir o fechamento." />}
        {action === 'close' && validCount && difference !== 0 && api.actorId !== 'supervisor' && <Link className="ux-button secondary" to={`/prototipo/caixa?sessionId=${session.id}`}>Conferir com supervisor</Link>}
        {(action !== 'close' || difference !== 0 || !ownSession) && <label className="ux-field">Motivo obrigatório<input required value={reason} onChange={event => setReason(event.target.value)} placeholder={action === 'close' ? !ownSession ? 'Motivo do fechamento pela supervisão' : 'Motivo da diferença' : 'Ex.: troco para o atendimento'} /></label>}
        <div className="ux-actions"><button className="ux-button secondary" type="button" onClick={() => choose('')}>Cancelar</button><button className="ux-button primary" type="submit" disabled={action === 'close' && validCount && difference !== 0 && api.actorId !== 'supervisor'}>{action === 'close' ? 'Confirmar fechamento' : 'Confirmar movimentação'}</button></div>
        {action === 'close' && difference !== 0 && <p className="ux-note">A diferença ficará registrada com responsável e motivo. Ela não altera recebimentos já confirmados.</p>}
      </form>}
      <section className="ux-panel"><h2>Movimentações do caixa</h2>{movements.length ? <ul className="ux-cart-lines">{movements.map(item => <li className="ux-list-row" key={item.id}><span><strong>{movementLabels[item.kind]}</strong><small>{dateTime(item.createdAt)} · {item.reason}</small></span><strong>{money(item.amountCents)}</strong></li>)}</ul> : <p>Nenhuma movimentação.</p>}</section>
    </>}
    {!!history.length && <section className="ux-panel"><h2>Meus últimos fechamentos</h2>{history.map(item => <div className="ux-list-row" key={item.id}><span>{dateTime(item.closedAt ?? item.createdAt)}<small>Diferença: {money(item.differenceCents ?? 0)}</small></span><Link className="ux-button secondary" to={`/prototipo/caixa?sessionId=${item.id}`}>Ver detalhes</Link></div>)}</section>}
  </div>
}

export function ReceiptPage() {
  const { paymentId = '' } = useParams()
  const api = usePrototype()
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')
  const [refunding, setRefunding] = useState(false)
  const [error, setError] = useState('')
  const operation = useOperations()
  const intent = useRef(operationId())
  const payment = api.state.payments.find(item => item.id === paymentId)
  const account = api.state.accounts.find(item => item.id === payment?.accountId)
  const refund = (event: React.FormEvent) => {
    event.preventDefault()
    if (!payment) return
    const result = api.refund(payment.id, parseMoney(amount), reason, operation(`refund:${payment.id}:${amount}:${reason}:${intent.current}`))
    if (!result.ok) { if (!api.offline) operation(`refund:${payment.id}:${amount}:${reason}:${intent.current}`, true); setError(result.error); return }
    setError(''); setRefunding(false); setAmount(''); setReason('')
  }
  if (!payment || !account) return <EmptyState title="Pagamento não encontrado" description="Volte à comanda para localizar o pagamento."><Link className="ux-button primary" to="/prototipo/comandas">Ver comandas</Link></EmptyState>
  if (payment.state !== 'approved') return <EmptyState title="Este pagamento ainda não foi confirmado" description="O comprovante só aparece depois da confirmação."><Link className="ux-button primary" to={`/prototipo/receber/${account.id}?paymentId=${payment.id}`}>Ver estado do pagamento</Link></EmptyState>
  const items = api.state.consumptions.filter(item => item.accountId === account.id && (item.status === 'accepted' || item.status === 'fulfilled'))
  return <div className="ux-page">
    <PageHeader eyebrow="Pagamento confirmado" title="Comprovante" backTo={`/prototipo/comandas/${account.id}`} />
    <Notice error={error} />
    <article className="ux-panel ux-receipt"><div className="ux-receipt-heading"><Icon name="check" size={40} /><h2>Long Beach</h2><p>Comprovante de demonstração</p><strong className="ux-account-number">Comanda {account.number}</strong><p>{account.name || 'Visitante'}</p><p>{dateTime(payment.confirmedAt ?? payment.createdAt)}</p></div><h3>Itens da comanda</h3><ul className="ux-cart-lines">{items.map(item => <li className="ux-list-row" key={item.id}><span>{item.quantity} × {item.name}</span><strong>{money(item.quantity * item.priceCents)}</strong></li>)}</ul><dl className="ux-summary"><div className="ux-total"><dt>Valor deste pagamento</dt><dd>{money(payment.amountCents)}</dd></div><div><dt>Forma de pagamento</dt><dd>{paymentLabels[payment.method]}</dd></div>{payment.method === 'cash' && <><div><dt>Dinheiro recebido</dt><dd>{money(payment.tenderedCents)}</dd></div><div><dt>Troco</dt><dd>{money(payment.changeCents)}</dd></div></>}{payment.refundedCents > 0 && <div><dt>Valor estornado</dt><dd>{money(payment.refundedCents)}</dd></div>}</dl><p className="ux-note">Pagamento {payment.id.replace(/^payment-/, '').slice(0, 8).toUpperCase()} · Atendente: {actorNames[payment.actorId as keyof typeof actorNames] ?? 'Equipe'}</p><AccountSummary accountId={account.id} /><p className="ux-note">Este pagamento pode cobrir apenas parte da comanda. Documento de teste, sem validade fiscal.</p></article>
    <div className="ux-actions ux-no-print"><button className="ux-button secondary" onClick={() => window.print()}>Imprimir comprovante</button><Link className="ux-button primary" to="/prototipo/vender">Nova venda <Icon name="plus" /></Link><Link className="ux-button secondary" to={`/prototipo/comandas/${account.id}`}>Voltar à comanda</Link></div>
    {api.actorId === 'supervisor' && payment.refundedCents < payment.amountCents && <section className="ux-panel ux-no-print">{!refunding ? <button className="ux-button secondary" onClick={() => { intent.current = operationId(); setRefunding(true) }}>Estornar pagamento</button> : <form onSubmit={refund}><h2>Estornar pagamento</h2><p>Disponível para estorno: {money(payment.amountCents - payment.refundedCents)}</p><label className="ux-field">Valor do estorno (R$)<input required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label><label className="ux-field">Motivo obrigatório<input required value={reason} onChange={event => setReason(event.target.value)} /></label><div className="ux-actions"><button className="ux-button secondary" type="button" onClick={() => setRefunding(false)}>Cancelar</button><button className="ux-button danger" type="submit">Confirmar estorno</button></div></form>}</section>}
  </div>
}
