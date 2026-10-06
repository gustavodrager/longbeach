import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { ApiError } from '../../lib/http'
import { Header, Feedback, Summary, Products, CartReview, Payments, ItemStatus, Icon, BalanceState, cartTotal } from './components'
import { useCart, LoadState, useConfirmationGate } from './Core'
import { PixRecovery } from './PixRecovery'
import { PixDetails } from './PaymentPages'
import { clientRequest, money, operationId, parseAmount, type CatalogItem, type Tab, type TabPayment } from './api'
import '../prototype/prototype.css'
import './attendance.css'

export function ClientPage() {
  const location = useLocation(); const token = new URLSearchParams(location.hash.slice(1)).get('token') ?? ''
  const query = useQuery({ queryKey: ['client-tab', token], queryFn: () => clientRequest<Tab>(token), refetchInterval: 10_000, retry: false })
  const accessDenied = query.error instanceof ApiError && [401, 403, 404, 410].includes(query.error.status)
  return <div className="ux-root ux-client"><header className="lb-client-brand"><Logo /></header><main className="ux-page"><LoadState query={query} />{query.data && !accessDenied && <ClientTab key={query.data.id} tab={query.data} token={token} />}</main></div>
}
function ClientTab({ tab, token }: { tab: Tab; token: string }) {
  const catalog = useQuery({ queryKey: ['client-catalog', token], queryFn: () => clientRequest<CatalogItem[]>(token, '/catalog') })
  const config = useQuery({ queryKey: ['client-config', token], queryFn: () => clientRequest<{ pixEnabled: boolean }>(token, '/config') })
  const [pendingOrder, setPendingOrder] = useConfirmationGate(`client-order:${tab.id}`)
  const cache = useQueryClient(); const [cart, setCart] = useCart(tab.id); const [screen, setScreen] = useState('catalog'); const [review, setReview] = useState(Boolean(pendingOrder))
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const lock = useRef(false)
  const [part, setPart] = useState(false); const [amount, setAmount] = useState(''); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [taxId, setTaxId] = useState('')
  const [checkpoint, setCheckpoint] = useState<{ operationId: string; payment?: TabPayment } | null>(null)
  const awaitingConfirmation = Boolean(checkpoint && !tab.payments.some(row => row.operationId === checkpoint.operationId))
  const paymentLocked = busy || awaitingConfirmation
  const visiblePayments = checkpoint?.payment && !tab.payments.some(row => row.id === checkpoint.payment!.id) ? [...tab.payments, checkpoint.payment] : tab.payments
  const keys = useRef(new Map<string, string>())
  const intent = (key: string, renew = false) => {
    const storage = `lb-client-operation:${tab.id}:${key}`
    if (!keys.current.has(key) || renew) { let saved: string | null = null; try { saved = sessionStorage.getItem(storage) } catch { /* no browser persistence */ } const id = renew ? operationId() : saved ?? operationId(); keys.current.set(key, id); try { sessionStorage.setItem(storage, id) } catch { /* in memory */ } }
    return keys.current.get(key)!
  }
  async function run(path: string, body: unknown) {
    if (lock.current) return false
    lock.current = true; setBusy(true); setError(''); setMessage('')
    try { const result = await clientRequest<Tab | TabPayment>(token, path, body); if (path === '/payments') { const payment = result as TabPayment; setCheckpoint({ operationId: payment.operationId, payment }) } await cache.invalidateQueries({ queryKey: ['client-tab', token] }); await cache.invalidateQueries({ queryKey: ['client-catalog', token] }); return true }
    catch (cause) { if (path === '/items' && cause instanceof ApiError && [400, 422].includes(cause.status)) setPendingOrder(''); if (path === '/payments' && cause instanceof ApiError && [400, 422].includes(cause.status)) setCheckpoint(null); setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar. Seu pedido permanece aqui. Confira a conexão e tente novamente.'); return false }
    finally { lock.current = false; setBusy(false) }
  }
  const products = catalog.data ?? []; const fingerprint = cart.map(row => `${row.productId}:${row.quantity}`).sort().join('|')
  async function order() { if (!pendingOrder && cart.some(row => !products.some(product => product.id === row.productId && product.available != null && product.available >= row.quantity))) { setError('O estoque mudou. Altere o pedido para conferir as quantidades disponíveis.'); return } setPendingOrder('order'); const key = `order:${fingerprint}`; if (await run('/items', { operationId: intent(key), items: cart, deliver: false })) { setPendingOrder(''); intent(key, true); setCart([]); setReview(false); setScreen('tab'); setMessage('Pedido enviado. Esperando a equipe confirmar.') } }
  async function pay() {
    if (lock.current) return
    const value = part ? parseAmount(amount) : tab.payable
    if (!Number.isFinite(value) || value <= 0 || value > tab.payable) { setError('Confira o valor a pagar.'); return }
    // Read-back confirms the previous allocation, even when its POST response was lost.
    const previousConfirmed = Boolean(checkpoint && tab.payments.some(row => row.operationId === checkpoint.operationId))
    const paymentOperation = checkpoint && awaitingConfirmation ? checkpoint.operationId : intent('pix', previousConfirmed)
    setCheckpoint({ operationId: paymentOperation })
    if (await run('/payments', { operationId: paymentOperation, method: 'Pix', amount: value, name, email, taxId })) { intent('pix', true); setMessage('Pix criado. Aguarde a confirmação do provedor.') }
  }
  return <><section className="ux-panel ux-client-header"><div><p className="ux-note">Seu atendimento na Long Beach</p><h1>Comanda {tab.number}</h1><p>{tab.name || 'Visitante'}</p></div><Summary tab={tab} /></section><nav className="ux-tabs lb-client-tabs" aria-label="Opções da sua comanda"><button className={`ux-button ${screen === 'catalog' ? 'primary' : 'secondary'}`} aria-pressed={screen === 'catalog'} onClick={() => setScreen('catalog')}><Icon name="sell" />Pedir</button><button className={`ux-button ${screen === 'tab' ? 'primary' : 'secondary'}`} aria-pressed={screen === 'tab'} onClick={() => setScreen('tab')}><Icon name="tabs" />Minha comanda</button><button className={`ux-button ${screen === 'pay' ? 'primary' : 'secondary'}`} aria-pressed={screen === 'pay'} onClick={() => setScreen('pay')}><Icon name="pix" />Pagar</button></nav><Feedback error={error} message={message} busy={busy} />{pendingOrder && <p className="ux-notice warning" role="status">Estamos conferindo seu pedido. Repita o mesmo envio antes de alterar os produtos.</p>}
    {screen === 'catalog' && <><Header title="O que você vai pedir?" description="Escolha e confira. A equipe vai confirmar seu pedido." /><LoadState query={catalog} />{tab.state !== 'Open' ? <p>Esta comanda foi encerrada. Peça um novo acesso à equipe.</p> : review ? <><CartReview products={products} cart={cart} /><div className="ux-actions"><button className="ux-button secondary" disabled={busy || Boolean(pendingOrder)} onClick={() => setReview(false)}>Alterar pedido</button><button className="ux-button primary" disabled={busy || !cart.length || catalog.isError} onClick={() => void order()}>Enviar pedido</button></div></> : <><Products products={products} cart={cart} onChange={setCart} disabled={busy || Boolean(pendingOrder)} />{cart.length > 0 && <div className="ux-sticky-action"><strong>{money(cartTotal(products, cart))}</strong><button className="ux-button primary" onClick={() => setReview(true)}>Conferir pedido<Icon name="arrow" /></button></div>}</>}</>}
    {screen === 'tab' && <><Header title="Acompanhar pedidos" />{tab.items.map(item => <article key={item.id} className="ux-panel lb-client-order"><strong>{item.quantity} × {item.name}</strong><p><ItemStatus item={item} /></p>{item.reason && <p>{item.reason}</p>}{['Accepted', 'Fulfilled'].includes(item.state) && <p>{money(item.total)}</p>}</article>)}{!tab.items.length && <p>Seus pedidos aparecerão aqui.</p>}<Payments tab={tab} client /></>}
    {screen === 'pay' && <><Header title="Pagar com Pix" />{visiblePayments.filter(row => row.method === 'Pix' && (row.state === 'Pending' || row.state === 'Approved')).map(payment => <section key={payment.id}><PixDetails payment={payment} busy={busy} refresh={() => void run(`/payments/${payment.id}/refresh`, {})} /><PixRecovery payment={payment} busy={busy} resume={payer => run('/payments', { operationId: payment.operationId, amount: payment.amount, method: 'Pix', ...payer })} /></section>)}<LoadState query={config} />{awaitingConfirmation && <p className="ux-notice warning" role="status">Estamos conferindo este pagamento. Aguarde antes de criar outra cobrança.</p>}{tab.payable > 0 && config.data?.pixEnabled && (!awaitingConfirmation || !checkpoint?.payment) && <form className="ux-panel" onSubmit={event => { event.preventDefault(); void pay() }}><h2>Quanto pagar?</h2><div className="ux-choice-grid lb-two-choices"><button type="button" className={`ux-choice ${!part ? 'selected' : ''}`} disabled={paymentLocked} onClick={() => { setPart(false); intent('pix', true) }}>Tudo · {money(tab.payable)}</button><button type="button" className={`ux-choice ${part ? 'selected' : ''}`} disabled={paymentLocked} onClick={() => { setPart(true); intent('pix', true) }}>Uma parte</button></div>{part && <label className="ux-field">Valor (R$)<input required inputMode="decimal" value={amount} disabled={paymentLocked} onChange={event => { setAmount(event.target.value); intent('pix', true) }} /></label>}<p className="ux-note">Dados exigidos pelo provedor do Pix.</p><label className="ux-field">Seu nome<input required maxLength={120} value={name} disabled={paymentLocked} onChange={event => { setName(event.target.value); intent('pix', true) }} /></label><label className="ux-field">E-mail<input required type="email" maxLength={254} value={email} disabled={paymentLocked} onChange={event => { setEmail(event.target.value); intent('pix', true) }} /></label><label className="ux-field">CPF / CNPJ<input required inputMode="numeric" maxLength={14} value={taxId} disabled={paymentLocked} onChange={event => { setTaxId(event.target.value.replace(/\D/g, '')); intent('pix', true) }} /></label><button className="ux-button primary" disabled={busy}>{awaitingConfirmation ? 'Repetir confirmação do mesmo Pix' : 'Criar Pix'}</button></form>}{!config.data?.pixEnabled && !config.isLoading && <p className="ux-notice warning">Pix ainda não disponível. Peça à equipe para receber seu pagamento.</p>}{tab.payable === 0 && <section className="ux-panel"><BalanceState tab={tab} client /></section>}</>}
  </>
}
