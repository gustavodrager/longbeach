import { Disclosure } from '../../components/managementUi'
import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { CartReview, Empty, Feedback, Header, Icon, ItemStatus, Payments, Products, Summary, WorkflowSteps, cartTotal } from './components'
import { dateTime, money, parseAmount, postBar, useBarCommand, useBarData, useIntent, type CatalogItem, type Named, type PageResult, type Tab } from './api'
import { OrderWaiting, TabAttention, useAttentionClock } from './TabAttention'
import { OpenTabForm } from './OpenTabForm'
import { SaleDestination } from './SaleDestination'
import { TabSettlement } from './TabSettlement'
import { AccessQr } from './AccessQr'

import { BarFrame, LoadState, useCart, useConfirmationGate, useBarConnection } from './Core'
import { barLocation } from './serviceLocation'
export { BarFrame, LoadState, useCart } from './Core'

export function SellPage() {
  const { user } = useAuth(); const [params] = useSearchParams(); const tabId = params.get('comanda')
  return <SellOrder key={`${user?.id}:${tabId ?? 'sale'}`} tabId={tabId} />
}

function SellOrder({ tabId }: { tabId: string | null }) {
  const { user } = useAuth(); const navigate = useNavigate()
  const locations = useBarData<Named[]>('/tabs/locations')
  const target = useBarData<Tab>(`/tabs/${tabId}`, Boolean(tabId))
  const [pendingOrder, setPendingOrder] = useConfirmationGate(`order:${user?.id}:${tabId ?? 'sale'}`)
  const connection = useBarConnection()
  const checkedSnapshot = useRef('')
  const summary = useRef<HTMLElement>(null)
  const [review, setReview] = useState(Boolean(pendingOrder))
  useEffect(() => { if (review && window.matchMedia?.('(max-width: 800px), (max-width: 1100px) and (orientation: portrait)').matches) summary.current?.scrollIntoView({ block: 'start' }) }, [review])
  const locationId = tabId ? target.data?.locationId ?? '' : barLocation(locations.data)?.id ?? ''
  const catalog = useBarData<CatalogItem[]>(`/tabs/catalog?locationId=${encodeURIComponent(locationId)}`, Boolean(locationId))
  const [cart, setCart, storageError] = useCart(tabId ?? 'sale', user?.id); const command = useBarCommand(); const intent = useIntent(`cart:${tabId ?? 'sale'}`)
  const targetKnown = Boolean(target.data && target.data.id === tabId && !target.isError)
  const targetReady = !tabId || (targetKnown && target.data?.state === 'Open')
  const products = catalog.data ?? []; const ready = pendingOrder ? pendingOrder === 'deliver' : cart.every(row => products.some(product => product.id === row.productId && !product.prepared))
  const changeCart = (next: typeof cart) => { setCart(next); if (!next.length) setReview(false) }
  const fingerprint = `${locationId}:${cart.map(row => row.notes ? JSON.stringify([row.productId, row.quantity, row.notes]) : `${row.productId}:${row.quantity}`).sort().join('|')}`
  const currentSnapshot = JSON.stringify([connection.generation, locationId, cart, cart.map(row => { const p = products.find(p => p.id === row.productId); return [p?.id, p?.salePrice, p?.available, p?.prepared] }), target.data?.state])
  const canOperate = Boolean(user?.permissions.includes('bar:sales:operate'))
  const writeBlocked = storageError || !connection.online || !canOperate || catalog.isFetching || catalog.isError || target.isFetching || !targetReady
  function checkOrder() { checkedSnapshot.current = currentSnapshot; setReview(true) }
  async function submit(deliver: boolean) {
    if (writeBlocked) { command.setError('Reconecte e aguarde a atualização dos produtos e da comanda.'); return }
    if (!pendingOrder && checkedSnapshot.current !== currentSnapshot) { checkOrder(); command.setError('O pedido ou a disponibilidade mudou. Confira o resumo e confirme novamente.'); return }

    if (!targetReady) { command.setError('Confira uma comanda aberta antes de registrar o pedido.'); return }
    if (!locationId || !catalog.data || catalog.isError) { command.setError('Confira o estoque do Bar antes de continuar.'); return }
    if (!pendingOrder && cart.some(row => !products.some(product => product.id === row.productId && (product.available == null || product.available >= row.quantity)))) { command.setError('O estoque mudou. Altere o pedido para conferir as quantidades disponíveis.'); return }
    if (pendingOrder && pendingOrder !== (deliver ? 'deliver' : 'queue')) return
    const result = await command.run(async () => {
      // Fail before sending if the durable draft/keys cannot survive a reload.
      const openId = intent(`open:${fingerprint}`); const addId = intent(`add:${fingerprint}:${deliver}`)
      localStorage.setItem(`lb-cart:${user?.id}:${tabId ?? 'sale'}`, JSON.stringify(cart))
      localStorage.setItem(`lb-operation:${user?.id}:cart:${tabId ?? 'sale'}:open:${fingerprint}`, openId)
      localStorage.setItem(`lb-operation:${user?.id}:cart:${tabId ?? 'sale'}:add:${fingerprint}:${deliver}`, addId)
      setPendingOrder(deliver ? 'deliver' : 'queue')
      const tab = tabId ? target.data : await postBar<Tab>('/tabs', { operationId: openId, locationId, mode: 'Immediate' })
      if (!tab) throw new Error('Atualize a comanda antes de continuar.')
      return postBar<Tab>(`/tabs/${tab.id}/items`, { operationId: addId, items: cart, deliver })
    })
    if (result.ok) { setPendingOrder(''); intent(`open:${fingerprint}`, true); intent(`add:${fingerprint}:${deliver}`, true); setCart([]); setReview(false); navigate(deliver && !tabId ? `/atendimento/receber/${result.value.id}` : `/atendimento/comandas/${result.value.id}`) }
    else if (result.error instanceof ApiError && [400, 422].includes(result.error.status)) setPendingOrder('')
  }
  return <BarFrame className="lb-sell"><Header title={targetKnown ? `Vender · Comanda ${target.data!.number}` : 'Vender'} description="Toque no produto. Depois confira o pedido." back={tabId ? `/atendimento/comandas/${encodeURIComponent(tabId)}` : undefined} /><WorkflowSteps current={review ? 'review' : 'products'} />
    <LoadState query={locations} />{storageError && <p role="alert" className="ux-notice warning">Não foi possível guardar o rascunho neste dispositivo. Mantenha esta tela aberta e libere o armazenamento antes de registrar.</p>}<LoadState query={catalog} />{tabId && <LoadState query={target} />}<Feedback {...command} />{!connection.online && <p className="ux-notice warning" role="status">Sem conexão. Você pode preparar o rascunho; o registro aguarda reconexão.</p>}{pendingOrder && <p className="ux-notice warning" role="status">Este pedido precisa ser confirmado. Repita o mesmo registro antes de alterar os produtos.</p>}
    {(!tabId || targetKnown) && <SaleDestination tab={tabId ? target.data : undefined} locked={command.busy || Boolean(pendingOrder) || !connection.online || storageError} hasDraft={cart.length > 0} />}
    {tabId && targetKnown && target.data?.state !== 'Open' && <p className="ux-notice warning" role="status">Esta comanda está encerrada e não recebe novos produtos. Consulte o consumo em Voltar ou escolha uma comanda aberta.</p>}
    {tabId && !targetReady && cart.length > 0 && <p className="ux-note">O rascunho deste pedido foi preservado. Nenhum novo registro será enviado enquanto a comanda não estiver disponível.</p>}
    {!locationId && !tabId && !locations.isLoading && !locations.isError && <Empty title="Estoque Bar não configurado"><p>Peça à gestão para conferir o cadastro do local Bar.</p></Empty>}
    {Boolean(locationId) && targetReady && <div className={`lb-sale-workspace ${review && cart.length ? 'is-review' : ''}`}>
      <div className="lb-sale-catalog"><Products products={products} cart={cart} onChange={changeCart} disabled={command.busy || Boolean(pendingOrder) || !canOperate} /></div>
      {cart.length > 0 && <aside ref={summary} className="lb-sale-summary" aria-label="Resumo do rascunho"><CartReview products={products} cart={cart} onChange={changeCart} disabled={command.busy || Boolean(pendingOrder)} />
        {review ? <><div className="ux-actions lb-review-secondary"><button className="ux-button secondary" disabled={command.busy || Boolean(pendingOrder)} onClick={() => setReview(false)}>Mais produtos</button>{ready && <button className="ux-button secondary" disabled={command.busy || writeBlocked || pendingOrder === 'deliver' || !cart.length} onClick={() => void submit(false)}><Icon name="orders" />{tabId ? 'Adicionar à comanda' : 'Enviar para preparo'}</button>}</div><div className="ux-actions lb-review-actions"><strong>{money(cartTotal(products, cart))}</strong><button className="ux-button primary" disabled={command.busy || writeBlocked || pendingOrder === (ready ? 'queue' : 'deliver') || !cart.length} onClick={() => void submit(ready)}><Icon name={ready ? 'check' : 'orders'} />{ready ? tabId ? 'Adicionar e entregar' : 'Entregar e receber' : tabId ? 'Adicionar à comanda' : 'Enviar para preparo'}</button></div><p className="ux-note">O estoque é baixado na entrega. Registrar não confirma pagamento.</p></> : <button className="ux-button primary" disabled={command.busy || writeBlocked} onClick={checkOrder}>Conferir pedido<Icon name="arrow" /></button>}

      </aside>}
    </div>}
    {cart.length > 0 && !review && <div className="ux-sticky-action lb-sale-mobile-total"><span><strong>{money(cartTotal(products, cart))}</strong><small>{cart.reduce((total, row) => total + row.quantity, 0)} itens · {targetKnown ? `Comanda ${target.data!.number}` : 'Venda avulsa'}</small></span><button className="ux-button primary" onClick={checkOrder}>Ver pedido<Icon name="arrow" /></button></div>}

  </BarFrame>
}

const tabViews = [['Open', 'Abertas'], ['Orders', 'Com pedidos'], ['Closed', 'Encerradas'], ['All', 'Todas']] as const

export function TabsPage() {
  const { user } = useAuth(); const canOperate = user?.permissions.includes('bar:sales:operate')
  const [params, setParams] = useSearchParams(); const search = params.get('busca') ?? ''; const page = Math.max(1, Number(params.get('pagina')) || 1)
  const state = tabViews.some(([value]) => value === params.get('situacao')) ? params.get('situacao')! : 'Open'
  const now = useAttentionClock()
  const query = useBarData<PageResult<Tab>>(`/tabs?state=${state === 'All' ? '' : state}&search=${encodeURIComponent(search)}&page=${page}&pageSize=24`)
  function filters(changes: Record<string, string>, replace = false) {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([key, value]) => next.set(key, value))
    setParams(next, { replace, preventScrollReset: replace })
  }
  return <BarFrame className="lb-tabs-page"><Header title="Comandas" description="Consulte o consumo, os pagamentos e as pendências." />
    {canOperate && <OpenTabForm />}
    <div className="ux-actions lb-tab-filters" role="group" aria-label="Situação das comandas">{tabViews.map(([value, label]) => <button key={value} className={`ux-button ${state === value ? 'primary' : 'secondary'}`} aria-pressed={state === value} onClick={() => filters({ situacao: value, pagina: '1' })}>{label}</button>)}</div>
    <label className="ux-search"><Icon name="search" /><input value={search} type="search" maxLength={80} placeholder="Número ou nome" aria-label="Buscar comanda" onChange={event => filters({ busca: event.target.value, pagina: '1' }, true)} /></label>
    {state === 'Orders' && <p className="ux-note">Pedidos pendentes mais antigos primeiro.</p>}
    <LoadState query={query} />
    <div className="lb-tab-list">{query.data?.items.map(tab => <article className="ux-account-card lb-tab-card" key={tab.id}>
      <Link className="lb-tab-card-title" aria-label={`${tab.number} · ${tab.name || 'Visitante'} · ${tab.state === 'Closed' ? 'Consultar comanda' : 'Abrir comanda'}`} to={`/atendimento/comandas/${tab.id}?retorno=${encodeURIComponent(`/atendimento/comandas${params.size ? `?${params}` : ''}`)}`}><span className="ux-account-number">{tab.number}</span><strong>{tab.name || 'Visitante'}</strong></Link>
      {tab.responsible && tab.responsible.name !== tab.name && <small>Responsável: {tab.responsible.name}</small>}
      <TabAttention tab={tab} now={now} />
      <span className="ux-total">{tab.state === 'Closed' ? 'Total da comanda' : 'Falta pagar'}<strong>{money(tab.state === 'Closed' ? tab.total : tab.due)}</strong></span>
      <div className="ux-actions lb-tab-primary-actions">{tab.state === 'Open' && canOperate && <><Link className="ux-button primary" to={`/atendimento/vender?comanda=${tab.id}`} aria-label={`Adicionar produtos à comanda ${tab.number}`}>Adicionar produtos</Link>{tab.payable > 0 && <Link className="ux-button secondary" to={`/atendimento/receber/${tab.id}`} aria-label={`Receber comanda ${tab.number}`}>Receber</Link>}</>}
      <Link className="ux-button secondary" to={`/atendimento/comandas/${tab.id}?retorno=${encodeURIComponent(`/atendimento/comandas${params.size ? `?${params}` : ''}`)}`}>Ver detalhes</Link></div>
    </article>)}</div>
    {!query.isError && query.data?.total === 0 && <Empty title={state === 'Closed' ? 'Nenhuma comanda encerrada encontrada' : state === 'Orders' ? 'Nenhuma comanda com pedidos aguardando' : 'Nenhuma comanda encontrada'} />}
    {query.data && <div className="ux-pagination"><button className="ux-button secondary" disabled={page === 1} onClick={() => filters({ pagina: String(page - 1) })}>Anterior</button><span>{query.data.total} comandas · Página {page}</span><button className="ux-button secondary" disabled={page * 24 >= query.data.total} onClick={() => filters({ pagina: String(page + 1) })}>Próxima</button></div>}
  </BarFrame>
}

export function TabDetailsPage() {
  const { tabId = '' } = useParams(); const query = useBarData<Tab>(`/tabs/${tabId}`); const tab = query.data
  const [params] = useSearchParams(); const returnTo = params.get('retorno') ?? ''
  const back = /^\/(?:bar\/indicadores(?:[/?]|$)|atendimento\/(?:comandas|pedidos)(?:\?|$))/.test(returnTo) ? returnTo : '/atendimento/comandas'
  const now = useAttentionClock()
  const command = useBarCommand(); const intent = useIntent(tabId); const { user } = useAuth()
  const [adjusting, setAdjusting] = useState(false); const [adjustmentKind, setAdjustmentKind] = useState('Discount'); const [adjustmentValue, setAdjustmentValue] = useState(''); const [adjustmentReason, setAdjustmentReason] = useState('')
  const [qr, setQr] = useState<{ token: string; expiresAtUtc: string } | null>(null); const [reason, setReason] = useState(''); const [selected, setSelected] = useState<string | null>(null)
  async function action(itemId: string, actionName: string) {
    const result = await command.run(() => postBar<Tab>(`/tabs/${tabId}/items/${itemId}/${actionName}`, { operationId: intent(`${itemId}:${actionName}`), reason }))
    if (result.ok) { setSelected(null); setReason(''); command.setMessage('Operação confirmada.') }
  }
  async function access() { const result = await command.run(() => postBar<{ token: string; expiresAtUtc: string }>(`/tabs/${tabId}/access`, { operationId: intent('access', true) })); if (result.ok) setQr(result.value) }
  async function revokeAccess() { const result = await command.run(() => postBar(`/tabs/${tabId}/access/revoke`, { operationId: intent('revoke') })); if (result.ok) { intent('revoke', true); setQr(null); command.setMessage('Acesso encerrado.') } }
  const supervisor = user?.permissions.includes('bar:supervise'); const canOperate = user?.permissions.includes('bar:sales:operate')
  return <BarFrame className="lb-tab-detail"><Header title={tab ? `Comanda ${tab.number}` : 'Comanda'} description={tab?.name || 'Visitante'} back={back} /><LoadState query={query} /><Feedback {...command} />{tab && <><section className="ux-panel ux-account-header"><Summary tab={tab} />{tab.notes && <p className="lb-item-notes">{tab.notes}</p>}<div className="lb-tab-context"><TabAttention tab={tab} now={now} /></div><p className="lb-responsible-note">{tab.responsible ? `Responsável: ${tab.responsible.name} · Comanda disponível na área do cliente.` : 'Sem responsável vinculado à área do cliente.'}</p><div className="ux-actions lb-tab-primary-actions">{tab.state === 'Open' && canOperate && <><Link className="ux-button primary" to={`/atendimento/vender?comanda=${tabId}`}><Icon name="plus" />Adicionar produtos</Link>{tab.payable > 0 && <Link className="ux-button secondary" to={`/atendimento/receber/${tabId}`}>Receber</Link>}</>}</div></section><TabSettlement tab={tab} unavailable={query.isError || command.busy} showDetailsLink={false} />{tab.state==='Open'&&canOperate&&<Disclosure title="Acesso do cliente"><p className="ux-note">Abra ou encerre o acesso ao catálogo desta comanda.</p><div className="ux-actions"><button className="ux-button secondary" disabled={command.busy} onClick={() => void access()}>Acesso do cliente</button><button className="ux-button secondary" disabled={command.busy} onClick={() => void revokeAccess()}>Encerrar acesso do cliente</button></div></Disclosure>}
      {qr && <section className="ux-panel"><h2>Acesso do cliente</h2><AccessQr url={`${window.location.origin}/cliente#token=${encodeURIComponent(qr.token)}`} /><p>Válido até {dateTime(qr.expiresAtUtc)}. Compartilhe somente com esta pessoa.</p><Link className="ux-button primary" to={`/cliente#token=${encodeURIComponent(qr.token)}`} target="_blank" rel="noreferrer">Abrir catálogo do cliente</Link><button className="ux-button secondary" disabled={command.busy} onClick={() => void revokeAccess()}>Encerrar acesso</button><p className="ux-note lb-access-link">{`${window.location.origin}/cliente#token=${encodeURIComponent(qr.token)}`}</p></section>}
      <section className="ux-panel"><h2>Consumo e pedidos</h2>{!tab.items.length && <p>{tab.state === 'Closed' ? 'Nenhum consumo registrado nesta comanda.' : 'Adicione os primeiros produtos.'}</p>}{tab.items.map(item => <article className="ux-list-row ux-consumption-row" key={item.id}><div><strong>{item.quantity} × {item.name}</strong><ItemStatus item={item} />{item.notes && <p className="lb-item-notes">{item.notes}</p>}<OrderWaiting item={item} now={now} /><small>{dateTime(item.createdAtUtc)}{item.reason && ` · ${item.reason}`}</small>{item.recipeId && user?.permissions.includes('bar:catalog:write') && <Link to={`/bar/receitas/${item.productId}?version=${item.recipeId}`}>Ver receita usada · versão {item.recipeVersion}</Link>}</div><div><strong>{money(item.total)}</strong><div className="ux-actions">{canOperate && item.allowedActions?.includes('accept') && <button className="ux-button secondary" disabled={command.busy} onClick={() => void action(item.id, 'accept')}>Aceitar</button>}{canOperate && item.allowedActions?.includes('fulfill') && <button className="ux-button primary" disabled={command.busy} onClick={() => void action(item.id, 'fulfill')}>Entregar</button>}{supervisor && item.allowedActions?.includes('reverse') && <button className="ux-button danger" onClick={() => setSelected(item.id)}>Corrigir consumo</button>}</div></div></article>)}</section>
      {selected && <form className="ux-panel" onSubmit={event => { event.preventDefault(); void action(selected, 'reverse') }}><h2>Corrigir consumo</h2><label className="ux-field">Motivo obrigatório<input required value={reason} minLength={3} maxLength={500} onChange={event => setReason(event.target.value)} /></label><p className="ux-note">O estoque só deve retornar após conferência física. Esta correção não retorna estoque automaticamente.</p><div className="ux-actions"><button className="ux-button danger" disabled={command.busy}>Confirmar correção</button><button className="ux-button secondary" type="button" onClick={() => setSelected(null)}>Voltar</button></div></form>}
      {supervisor && tab.state === 'Open' && tab.payable > 0 && <button className="ux-button secondary" onClick={() => setAdjusting(!adjusting)}>Autorizar desconto ou cortesia</button>}{adjusting && <form className="ux-panel" onSubmit={async event => { event.preventDefault(); const amount = adjustmentKind === 'Courtesy' ? tab.payable : parseAmount(adjustmentValue); if (!Number.isFinite(amount) || amount <= 0 || amount > tab.payable) { command.setError('Confira o valor autorizado.'); return } const result = await command.run(() => postBar<Tab>(`/tabs/${tabId}/adjustments`, { operationId: intent('adjustment'), kind: adjustmentKind, amount, reason: adjustmentReason })); if (result.ok) { intent('adjustment', true); setAdjusting(false); setAdjustmentReason(''); setAdjustmentValue(''); command.setMessage('Autorização registrada.') } }}><h2>Autorização do supervisor</h2><label className="ux-field">Tipo<select value={adjustmentKind} disabled={command.busy} onChange={event => { setAdjustmentKind(event.target.value); intent('adjustment', true) }}><option value="Discount">Desconto por valor</option><option value="Courtesy">Cortesia de todo o saldo disponível</option></select></label>{adjustmentKind === 'Discount' && <label className="ux-field">Valor do desconto (R$)<input required inputMode="decimal" value={adjustmentValue} disabled={command.busy} onChange={event => { setAdjustmentValue(event.target.value); intent('adjustment', true) }} /></label>}<label className="ux-field">Motivo obrigatório<input required minLength={3} maxLength={500} value={adjustmentReason} disabled={command.busy} onChange={event => { setAdjustmentReason(event.target.value); intent('adjustment', true) }} /></label><div className="ux-actions"><button className="ux-button primary" disabled={command.busy}>Confirmar autorização</button><button type="button" className="ux-button secondary" disabled={command.busy} onClick={() => setAdjusting(false)}>Voltar</button></div></form>}<Payments tab={tab} />
      <details className="ux-panel"><summary>Histórico da comanda</summary><ol className="ux-timeline">{tab.history?.map(row => <li key={row.id}>{historyLabel(row.kind)}{row.amount !== 0 && ` · ${money(row.amount)}`}<small>{dateTime(row.createdAtUtc)}{row.reason && ` · ${row.reason}`}</small></li>)}</ol></details>
    </>}</BarFrame>
}
const historyLabel = (kind: string) => ({ Open: 'Comanda aberta', Opened: 'Comanda aberta', ResponsibleAssigned: 'Responsável vinculado à área do cliente', ItemAdded: 'Produto adicionado', Requested: 'Pedido recebido, aguardando aceite', Accepted: 'Pedido aceito', Fulfilled: 'Produto entregue', Rejected: 'Pedido recusado', Reversed: 'Consumo corrigido', Payment: 'Pagamento registrado', PaymentApproved: 'Pagamento confirmado', PaymentPending: 'Pix aguardando confirmação', PaymentDeclined: 'Pagamento não confirmado', PaymentRefunded: 'Estorno confirmado', Discount: 'Desconto autorizado', Courtesy: 'Cortesia autorizada', Refund: 'Estorno', Closed: 'Comanda encerrada', Access: 'Acesso de cliente emitido', AccessRevoked: 'Acesso do cliente encerrado', FeeReconciled: 'Taxa conciliada' }[kind] ?? 'Alteração na comanda')

export { OrdersPage } from './OrdersPage'
