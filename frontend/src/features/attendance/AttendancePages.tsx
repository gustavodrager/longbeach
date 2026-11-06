import { ITEM_REMOVAL_REASON, ItemRemovalConfirmation, readPendingItemRemoval, type ItemRemovalAction, type PendingItemRemoval } from './ItemRemovalConfirmation'
import { tabTitle, personName } from './tabTitle'
import { FormattedInput } from '../../components/FormattedInput'
import { hasPermission, hasStaffAction, hasStaffMenu, workHome } from '../auth/access'
import { CustomerPicker } from '../customers/CustomerPicker'
import type { CustomerSelection } from '../customers/api'
import { TabCustomerIdentification } from './TabCustomerIdentification'
import { Disclosure } from '../../components/managementUi'
import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { CartReview, Empty, Feedback, Header, Icon, ItemStatus, Payments, Products, Summary, cartTotal } from './components'
import { dateTime, money, parseAmount, postBar, useBarCommand, useBarData, useIntent, type CatalogItem, type Named, type PageResult, type Tab } from './api'
import { OrderWaiting, TabAttention, useAttentionClock } from './TabAttention'
import { OpenTabForm } from './OpenTabForm'
import { SaleDestination } from './SaleDestination'
import { TabSettlement } from './TabSettlement'
import { AccessQr } from './AccessQr'

import { BarFrame, LoadState, useCart, useConfirmationGate, useBarConnection } from './Core'
import { barLocation } from './serviceLocation'
import './sell-entry.css'
import './service-clean.css'
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
  const [customerDraft, setCustomerDraft] = useConfirmationGate(`sale-customer-v1:${user?.id}:${tabId ?? 'sale'}`)
  const connection = useBarConnection()
  const checkedSnapshot = useRef('')
  const summary = useRef<HTMLElement>(null)
  const [review, setReview] = useState(Boolean(pendingOrder))
  const [identifiedCustomer,setIdentifiedCustomer] = useState<CustomerSelection|null>(() => {
    try { const value=JSON.parse(customerDraft);return value&&typeof value.id==='string'&&typeof value.name==='string'?{id:value.id,name:value.name}:null } catch{return null}
  })
  useEffect(() => { if (review && window.matchMedia?.('(max-width: 800px), (max-width: 1100px) and (orientation: portrait)').matches) summary.current?.scrollIntoView({ block: 'start' }) }, [review])
  const locationId = tabId ? target.data?.locationId ?? '' : barLocation(locations.data)?.id ?? ''
  const catalog = useBarData<CatalogItem[]>(`/tabs/catalog?locationId=${encodeURIComponent(locationId)}`, Boolean(locationId))
  const [cart, setCart, storageError] = useCart(tabId ?? 'sale', user?.id); const command = useBarCommand(); const intent = useIntent(`cart:${tabId ?? 'sale'}`)
  function selectCustomer(person: CustomerSelection | null) {
    try { setCustomerDraft(JSON.stringify(person)); setIdentifiedCustomer(person) }
    catch { command.setError('Não foi possível guardar a identificação do cliente. Libere o armazenamento antes de selecionar novamente.') }
  }
  const targetKnown = Boolean(target.data && target.data.id === tabId && !target.isError)
  const targetReady = !tabId || (targetKnown && target.data?.state === 'Open')
  const canDeliver = hasStaffMenu(user,'bar.orders') && hasStaffAction(user,'bar.orders')
  const products = catalog.data ?? []; const ready = canDeliver && (pendingOrder ? pendingOrder === 'deliver' : !tabId || cart.every(row => products.some(product => product.id === row.productId && !product.prepared)))
  const changeCart = (next: typeof cart) => { setCart(next); if (!next.length) setReview(false) }
  const identifiedName = personName(identifiedCustomer?.name)
  const fingerprint = `${locationId}:${identifiedCustomer?`customer:${identifiedCustomer.id}:`:''}${cart.map(row => row.notes ? JSON.stringify([row.productId, row.quantity, row.notes]) : `${row.productId}:${row.quantity}`).sort().join('|')}`
  const currentSnapshot = JSON.stringify([connection.generation, locationId, identifiedCustomer?.id, cart, cart.map(row => { const p = products.find(p => p.id === row.productId); return [p?.id, p?.salePrice, p?.prepared] }), target.data?.state])
  const canOperate = Boolean(hasPermission(user, 'bar:sales:operate') && hasStaffMenu(user,'bar.sell') && hasStaffAction(user,'bar.sell'))
  const writeBlocked = storageError || !connection.online || !canOperate || catalog.isFetching || catalog.isError || target.isFetching || !targetReady
  function checkOrder() { checkedSnapshot.current = currentSnapshot; setReview(true) }
  async function submit(deliver: boolean) {
    if (pendingOrder === 'deliver' && !canDeliver) { command.setError('Uma pessoa com acesso a Pedidos precisa conferir a entrega pendente. O registro foi preservado.'); return }
    deliver = deliver && canDeliver
    if (writeBlocked) { command.setError('Reconecte e aguarde a atualização dos produtos e da comanda.'); return }
    if (!pendingOrder && checkedSnapshot.current !== currentSnapshot) { checkOrder(); command.setError('O pedido ou o catálogo mudou. Confira o resumo e confirme novamente.'); return }

    if (!targetReady) { command.setError('Confira uma comanda aberta antes de registrar o pedido.'); return }
    if (!locationId || !catalog.data || catalog.isError) { command.setError('Confira o cadastro do Bar antes de continuar.'); return }
    if (!pendingOrder && cart.some(row => !products.some(product => product.id === row.productId))) { command.setError('Um produto saiu da venda. Confira o pedido.'); return }
    if (pendingOrder && pendingOrder !== (deliver ? 'deliver' : 'queue')) return
    const result = await command.run(async () => {
      // Fail before sending if the durable draft/keys cannot survive a reload.
      const openId = intent(`open:${fingerprint}`); const addId = intent(`add:${fingerprint}:${deliver}`)
      localStorage.setItem(`lb-cart:${user?.id}:${tabId ?? 'sale'}`, JSON.stringify(cart))
      localStorage.setItem(`lb-operation:${user?.id}:cart:${tabId ?? 'sale'}:open:${fingerprint}`, openId)
      localStorage.setItem(`lb-operation:${user?.id}:cart:${tabId ?? 'sale'}:add:${fingerprint}:${deliver}`, addId)
      setCustomerDraft(JSON.stringify(identifiedCustomer))
      setPendingOrder(deliver ? 'deliver' : 'queue')
      const tab = tabId ? target.data : await postBar<Tab>('/tabs', { operationId: openId, locationId, mode: 'Immediate', ...(identifiedCustomer?{customerId:identifiedCustomer.id}:{}) })
      if (!tab) throw new Error('Atualize a comanda antes de continuar.')
      return postBar<Tab>(`/tabs/${tab.id}/items`, { operationId: addId, items: cart, deliver })
    })
    if (result.ok) { setPendingOrder(''); setCustomerDraft(''); intent(`open:${fingerprint}`, true); intent(`add:${fingerprint}:${deliver}`, true); setCart([]); setReview(false); navigate(deliver && !tabId && hasStaffMenu(user,'bar.receive') && hasStaffAction(user,'bar.receive') ? `/atendimento/receber/${result.value.id}` : hasStaffMenu(user,'bar.tabs') ? `/atendimento/comandas/${result.value.id}` : workHome(user)); command.setMessage('Pedido registrado.') }
    else if (result.error instanceof ApiError && [400, 422].includes(result.error.status)) setPendingOrder('')
  }
  return <BarFrame className="lb-sell"><Header title={targetKnown ? `Vender · ${tabTitle(target.data!)}` : !tabId && identifiedName ? `Vender - ${identifiedName}` : 'Vender'} back={tabId ? `/atendimento/comandas/${encodeURIComponent(tabId)}` : undefined} />
    <LoadState query={locations} />{storageError && <p role="alert" className="ux-notice warning">Não foi possível guardar o rascunho neste dispositivo. Mantenha esta tela aberta e libere o armazenamento antes de registrar.</p>}<LoadState query={catalog} />{tabId && <LoadState query={target} />}<Feedback {...command} />{!connection.online && <p className="ux-notice warning" role="status">Sem conexão. Você pode preparar o rascunho; o registro aguarda reconexão.</p>}{pendingOrder && <p className="ux-notice warning" role="status">Este pedido precisa ser confirmado. Repita o mesmo registro antes de alterar os produtos.</p>}
    {(!tabId || targetKnown) && <SaleDestination tab={tabId ? target.data : undefined} locked={command.busy || Boolean(pendingOrder) || !connection.online || storageError} hasDraft={cart.length > 0} />}
    {!tabId && <CustomerPicker compact scope="bar" contextKey="bar-sale:immediate" label="Cliente da venda" value={identifiedCustomer} onChange={selectCustomer} disabled={command.busy || Boolean(pendingOrder) || !canOperate} />}
    {tabId && targetKnown && target.data?.state !== 'Open' && <p className="ux-notice warning" role="status">Esta comanda está {target.data?.state === 'Cancelled' ? 'cancelada' : 'encerrada'} e não recebe novos produtos. Consulte o consumo em Voltar ou escolha uma comanda aberta.</p>}
    {tabId && !targetReady && cart.length > 0 && <p className="ux-note">O rascunho deste pedido foi preservado. Nenhum novo registro será enviado enquanto a comanda não estiver disponível.</p>}
    {!locationId && !tabId && !locations.isLoading && !locations.isError && <Empty title="Estoque Bar não configurado"><p>Peça à gestão para conferir o cadastro do local Bar.</p></Empty>}
    {Boolean(locationId) && targetReady && <div className={`lb-sale-workspace ${review && cart.length ? 'is-review' : ''}`}>
      <div className="lb-sale-catalog"><Products products={products} cart={cart} onChange={changeCart} disabled={command.busy || Boolean(pendingOrder) || !canOperate} /></div>
      {cart.length > 0 && <aside ref={summary} className="lb-sale-summary" aria-label="Resumo do rascunho"><CartReview products={products} cart={cart} onChange={changeCart} disabled={command.busy || Boolean(pendingOrder)} />
        {review ? <><div className="ux-actions lb-review-secondary"><button className="ux-button secondary" disabled={command.busy || Boolean(pendingOrder)} onClick={() => setReview(false)}>Mais produtos</button>{ready && tabId && <button className="ux-button secondary" disabled={command.busy || writeBlocked || pendingOrder === 'deliver' || !cart.length} onClick={() => void submit(false)}>Adicionar à comanda</button>}</div><div className="ux-actions lb-review-actions"><strong>{money(cartTotal(products, cart))}</strong><button className="ux-button primary" disabled={command.busy || writeBlocked || pendingOrder === (ready ? 'queue' : 'deliver') || !cart.length} onClick={() => void submit(ready)}><Icon name={ready ? 'check' : 'orders'} />{tabId ? ready ? 'Adicionar e entregar' : 'Adicionar à comanda' : 'Salvar'}</button></div><p className="ux-note">O estoque é atualizado na entrega. Registrar não confirma pagamento.</p></> : <button className="ux-button primary" disabled={command.busy || writeBlocked} onClick={checkOrder}>Conferir pedido<Icon name="arrow" /></button>}

      </aside>}
    </div>}
    {cart.length > 0 && !review && <div className="ux-sticky-action lb-sale-mobile-total"><span><strong>{money(cartTotal(products, cart))}</strong><small>{cart.reduce((total, row) => total + row.quantity, 0)} itens · {targetKnown ? tabTitle(target.data!) : 'Venda avulsa'}</small></span><button className="ux-button primary" onClick={checkOrder}>Ver pedido<Icon name="arrow" /></button></div>}

  </BarFrame>
}

const tabViews = [['Open', 'Abertas'], ['Orders', 'Com pedidos'], ['Closed', 'Encerradas'], ['Cancelled', 'Canceladas'], ['All', 'Todas']] as const

export function TabsPage() {
  const { user } = useAuth(); const canOperate = hasPermission(user, 'bar:sales:operate') && hasStaffMenu(user,'bar.tabs') && hasStaffAction(user,'bar.tabs')
  const [params, setParams] = useSearchParams(); const search = params.get('busca') ?? ''; const page = Math.max(1, Number(params.get('pagina')) || 1)
  const state = tabViews.some(([value]) => value === params.get('situacao')) ? params.get('situacao')! : 'Open'
  const now = useAttentionClock()
  const query = useBarData<PageResult<Tab>>(`/tabs?state=${state === 'All' ? '' : state}&search=${encodeURIComponent(search)}&page=${page}&pageSize=24`)
  function filters(changes: Record<string, string>, replace = false) {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([key, value]) => next.set(key, value))
    setParams(next, { replace, preventScrollReset: replace })
  }
  return <BarFrame className="lb-tabs-page"><Header title="Comandas" />
    {canOperate && <OpenTabForm />}
    {(state==='Closed'||state==='All')&&<Link className="ux-button secondary" to="/bar/vendas">Vendas do fluxo anterior →</Link>}
    <div className="ux-actions lb-tab-filters" role="group" aria-label="Situação das comandas">{tabViews.map(([value, label]) => <button key={value} className={`ux-button ${state === value ? 'primary' : 'secondary'}`} aria-pressed={state === value} onClick={() => filters({ situacao: value, pagina: '1' })}>{label}</button>)}</div>
    <label className="ux-search"><Icon name="search" /><input value={search} type="search" maxLength={80} placeholder="Número ou nome" aria-label="Buscar comanda" onChange={event => filters({ busca: event.target.value, pagina: '1' }, true)} /></label>
    {state === 'Orders' && <p className="ux-note">Pedidos pendentes mais antigos primeiro.</p>}
    <LoadState query={query} />
    <div className="lb-tab-list">{query.data?.items.map(tab => <article className="ux-account-card lb-tab-card" key={tab.id}>
      <strong className="lb-tab-card-title">{tabTitle(tab)}</strong>
      {tab.responsible && tab.responsible.name !== tab.name && <small>Responsável: {tab.responsible.name}</small>}
      <TabAttention tab={tab} now={now} />
      <span className="ux-total">{tab.state === 'Open' ? 'Falta pagar' : 'Total da comanda'}<strong>{money(tab.state === 'Open' ? tab.due : tab.total)}</strong></span>
      <div className="ux-actions lb-tab-primary-actions"><Link className="ux-button secondary lb-tab-details-link" to={`/atendimento/comandas/${tab.id}?retorno=${encodeURIComponent(`/atendimento/comandas${params.size ? `?${params}` : ''}`)}`} aria-label={`Detalhes da ${tabTitle(tab)}`}>Detalhes</Link></div>
    </article>)}</div>
    {!query.isError && query.data?.total === 0 && <Empty title={state === 'Cancelled' ? 'Nenhuma comanda cancelada encontrada' : state === 'Closed' ? 'Nenhuma comanda encerrada encontrada' : state === 'Orders' ? 'Nenhuma comanda com pedidos aguardando' : 'Nenhuma comanda encontrada'} />}
    {query.data && <div className="ux-pagination"><button className="ux-button secondary" disabled={page === 1} onClick={() => filters({ pagina: String(page - 1) })}>Anterior</button><span>{query.data.total} comandas · Página {page}</span><button className="ux-button secondary" disabled={page * 24 >= query.data.total} onClick={() => filters({ pagina: String(page + 1) })}>Próxima</button></div>}
  </BarFrame>
}

export function TabDetailsPage() {
  const { tabId = '' } = useParams(); const query = useBarData<Tab>(`/tabs/${tabId}`); const tab = query.data
  const [params] = useSearchParams(); const returnTo = params.get('retorno') ?? ''
  const back = /^\/(?:bar\/indicadores(?:[/?]|$)|atendimento\/(?:comandas|pedidos)(?:\?|$))/.test(returnTo) ? returnTo : '/atendimento/comandas'
  const now = useAttentionClock()
  const command = useBarCommand(); const intent = useIntent(tabId); const { user } = useAuth()
  const [addingValue, setAddingValue] = useState(false); const [chargeValue, setChargeValue] = useState(''); const [chargeDescription, setChargeDescription] = useState('')
  const [adjusting, setAdjusting] = useState(false); const [adjustmentKind, setAdjustmentKind] = useState('Discount'); const [adjustmentValue, setAdjustmentValue] = useState(''); const [adjustmentReason, setAdjustmentReason] = useState('')
  const [qr, setQr] = useState<{ token: string; expiresAtUtc: string } | null>(null)
  const removalScope = `${user?.id}:${tabId}`
  const [selected, setSelected] = useState<{ scope: string; itemId: string; action: ItemRemovalAction } | null>(null)
  const selectedId = selected?.scope === removalScope ? selected.itemId : undefined
  const [removalRaw, setRemovalPending] = useConfirmationGate(`tab-item-removal-v1:${user?.id}:${tabId}`)
  const pendingRemoval = readPendingItemRemoval(removalRaw); const removalBlocked = Boolean(removalRaw)
  const removalLock = useRef(false); const removalButtons = useRef(new Map<string, HTMLButtonElement>())
  async function action(itemId: string, actionName: string) {
    if (removalBlocked || query.isError || query.isFetching || !canOperate) return
    const result = await command.run(() => postBar<Tab>(`/tabs/${tabId}/items/${itemId}/${actionName}`, { operationId: intent(`${itemId}:${actionName}`), reason: '' }))
    if (result.ok) command.setMessage('Operação confirmada.')
  }
  async function removeItem() {
    if (removalLock.current || command.busy || removalRaw && !pendingRemoval) return
    const item = pendingRemoval?.item ?? tab?.items.find(row => row.id === selectedId)
    const action = pendingRemoval?.action ?? (selected?.scope === removalScope ? selected.action : undefined)
    if (!item || !action || (action === 'reverse' ? !supervisor : !hasOrderAccess)) return
    if (!pendingRemoval && (tab?.state !== 'Open' || query.isError || query.isFetching || !tab.items.find(row => row.id === item.id)?.allowedActions?.includes(action))) return
    const body: PendingItemRemoval = pendingRemoval ?? { operationId: intent(`${item.id}:${action}:simple-removal-v1`), action, reason: ITEM_REMOVAL_REASON, item: { id: item.id, name: item.name, quantity: item.quantity, total: item.total } }
    removalLock.current = true
    try {
      try { setRemovalPending(JSON.stringify(body)) } catch { command.setError('Não foi possível guardar esta confirmação. Libere o armazenamento antes de excluir.'); return }
      const result = await command.run(() => postBar<Tab>(`/tabs/${tabId}/items/${body.item.id}/${body.action}`, { operationId: body.operationId, reason: body.reason, ...(body.action === 'reverse' ? { returnStock: false } : {}) }))
      if (result.ok) {
        try { setRemovalPending('') } catch { command.setError('Item excluído. Repita a confirmação para concluir neste dispositivo.'); return }
        setSelected(null); command.setMessage('Item excluído. Histórico preservado.')
      } else if (result.error instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(result.error.status)) {
        try { setRemovalPending('') } catch { command.setError('Não foi possível liberar a confirmação neste dispositivo. Tente novamente.'); return }
        void query.refetch()
      }
    } finally { removalLock.current = false }
  }
  async function access() { const result = await command.run(() => postBar<{ token: string; expiresAtUtc: string }>(`/tabs/${tabId}/access`, { operationId: intent('access', true) })); if (result.ok) setQr(result.value) }
  async function revokeAccess() { const result = await command.run(() => postBar(`/tabs/${tabId}/access/revoke`, { operationId: intent('revoke') })); if (result.ok) { intent('revoke', true); setQr(null); command.setMessage('Acesso encerrado.') } }
  const supervisor = hasPermission(user, 'bar:supervise'); const hasOrderAccess = hasPermission(user, 'bar:sales:operate') && hasStaffMenu(user,'bar.orders') && hasStaffAction(user,'bar.orders'); const canOperate = tab?.state === 'Open' && hasOrderAccess; const canManageTabAccess = hasPermission(user, 'bar:sales:operate') && ((hasStaffMenu(user,'bar.tabs') && hasStaffAction(user,'bar.tabs')) || (hasStaffMenu(user,'bar.sell') && hasStaffAction(user,'bar.sell'))); const canSell = hasPermission(user,'bar:sales:operate') && hasStaffMenu(user,'bar.sell') && hasStaffAction(user,'bar.sell'); const canAddValue = hasPermission(user,'bar:sales:operate') && hasStaffMenu(user,'bar.tabs') && hasStaffAction(user,'bar.tabs'); const canReceive = hasPermission(user,'bar:sales:operate') && hasStaffMenu(user,'bar.receive') && hasStaffAction(user,'bar.receive')
  const selectedItem = pendingRemoval?.item ?? tab?.items.find(item => item.id === selectedId)
  const selectedAction = pendingRemoval?.action ?? (selected?.scope === removalScope ? selected.action : undefined)
  const removalAllowed = selectedAction === 'reverse' ? supervisor : hasOrderAccess
  const removalUnavailable = command.busy || !removalAllowed || Boolean(removalRaw && !pendingRemoval) || !pendingRemoval && (query.isError || query.isFetching || tab?.state !== 'Open' || !tab.items.some(item => item.id === selectedItem?.id && item.allowedActions?.includes(selectedAction ?? '')))
  return <BarFrame className="lb-tab-detail"><Header title={tab ? tabTitle(tab) : 'Comanda'} back={back} /><LoadState query={query} /><Feedback {...command} />{removalRaw && !pendingRemoval && <p className="ux-notice error" role="alert">Não foi possível ler uma exclusão pendente neste dispositivo. Peça ajuda à gestão antes de continuar.</p>}{pendingRemoval && !removalAllowed && <p className="ux-notice warning" role="alert">Seu acesso não permite confirmar a exclusão pendente. Peça ajuda à gestão.</p>}{tab && <><section className="ux-panel ux-account-header"><Summary tab={tab} />{tab.notes && <p className="lb-item-notes">{tab.notes}</p>}<div className="lb-tab-context"><TabAttention tab={tab} now={now} /></div><p className="lb-responsible-note">{tab.responsible ? `Responsável: ${tab.responsible.name} · Comanda disponível na área do cliente.` : 'Sem responsável vinculado à área do cliente.'}</p><div className="ux-actions lb-tab-primary-actions">{tab.state === 'Open' && <>{canSell&&!removalBlocked&&<Link className="ux-button primary" to={`/atendimento/vender?comanda=${tabId}`}><Icon name="plus" />Adicionar produtos</Link>}{canAddValue&&!removalBlocked&&<button type="button" className="ux-button secondary" disabled={command.busy || query.isFetching} onClick={() => setAddingValue(true)}>Adicionar valor</button>}{canReceive&&!removalBlocked&&tab.payable > 0 && <Link className="ux-button secondary" to={`/atendimento/receber/${tabId}`}>Receber</Link>}</>}<TabCustomerIdentification tab={tab} disabled={query.isFetching || query.isError || command.busy || removalBlocked} inline /><TabSettlement tab={tab} unavailable={query.isError || query.isFetching || command.busy || removalBlocked} showDetailsLink={false} inline /></div></section>{addingValue && canAddValue && tab.state === 'Open' && <form className="ux-panel" onSubmit={async event => { event.preventDefault(); if (removalBlocked || query.isFetching) return; const amount = parseAmount(chargeValue); if (!Number.isFinite(amount) || amount <= 0) { command.setError('Informe um valor maior que zero.'); return } const result = await command.run(() => postBar<Tab>(`/tabs/${tabId}/charges`, { operationId: intent('charge'), amount, description: chargeDescription.trim() || null })); if (result.ok) { intent('charge', true); setAddingValue(false); setChargeValue(''); setChargeDescription(''); command.setMessage('Valor adicionado à comanda.') } }}><h2>Adicionar valor</h2><label className="ux-field">Valor (R$)<FormattedInput format="money" required value={chargeValue} disabled={command.busy || removalBlocked} onValueChange={value => { setChargeValue(value); intent('charge', true) }} /></label><label className="ux-field">Descrição (opcional)<input maxLength={500} value={chargeDescription} disabled={command.busy || removalBlocked} onChange={event => { setChargeDescription(event.target.value); intent('charge', true) }} /></label><div className="ux-actions"><button className="ux-button primary" disabled={command.busy || removalBlocked || query.isFetching}>Adicionar à comanda</button><button type="button" className="ux-button secondary" onClick={() => setAddingValue(false)}>Cancelar</button></div></form>}{tab.state==='Open'&&canManageTabAccess&&<Disclosure title="Acesso do cliente"><div className="ux-actions"><button className="ux-button secondary" disabled={command.busy || removalBlocked} onClick={() => void access()}>Gerar QR Code</button><button className="ux-button secondary" disabled={command.busy || removalBlocked} onClick={() => void revokeAccess()}>Encerrar acesso do cliente</button></div></Disclosure>}
      {qr && canManageTabAccess && <section className="ux-panel"><h2>Acesso do cliente</h2><AccessQr url={`${window.location.origin}/cliente#token=${encodeURIComponent(qr.token)}`} /><p>Válido até {dateTime(qr.expiresAtUtc)}. Compartilhe somente com esta pessoa.</p><Link className="ux-button primary" to={`/cliente#token=${encodeURIComponent(qr.token)}`} target="_blank" rel="noreferrer">Abrir catálogo do cliente</Link><button className="ux-button secondary" disabled={command.busy || removalBlocked} onClick={() => void revokeAccess()}>Encerrar acesso</button></section>}
      <section className="ux-panel"><h2>Consumo e pedidos</h2>{!tab.items.length && <p>{tab.state === 'Open' ? 'Adicione os primeiros produtos.' : 'Nenhum consumo registrado nesta comanda.'}</p>}{tab.items.map(item => <article className="ux-list-row ux-consumption-row" key={item.id}><div><strong>{item.quantity} × {item.name}</strong><ItemStatus item={item} />{item.notes && <p className="lb-item-notes">{item.notes}</p>}<OrderWaiting item={item} now={now} /><small>{dateTime(item.createdAtUtc)}{item.reason && ` · ${item.reason}`}</small>{item.recipeId && hasPermission(user, 'bar:catalog:write') && <Link to={`/bar/receitas/${item.productId}?version=${item.recipeId}`}>Ver receita usada · versão {item.recipeVersion}</Link>}</div><div><strong>{money(item.total)}</strong><div className="ux-actions">{canOperate && item.allowedActions?.includes('accept') && <button className="ux-button secondary" disabled={command.busy || removalBlocked} onClick={() => void action(item.id, 'accept')}>Aceitar</button>}{canOperate && item.allowedActions?.includes('fulfill') && <button className="ux-button primary" disabled={command.busy || removalBlocked} onClick={() => void action(item.id, 'fulfill')}>Entregar</button>}{tab.state === 'Open' && ((canOperate && item.allowedActions?.includes('reject')) || (supervisor && item.allowedActions?.includes('reverse'))) && <button ref={button => { if (button) removalButtons.current.set(item.id, button); else removalButtons.current.delete(item.id) }} className="ux-button danger" disabled={command.busy || removalBlocked || query.isError || query.isFetching} onClick={() => setSelected({ scope: removalScope, itemId: item.id, action: item.allowedActions.includes('reject') ? 'reject' : 'reverse' })}>Excluir item</button>}</div></div></article>)}</section>
      {tab.history?.some(row => row.kind === 'ChargeAdded') && <section className="ux-panel"><h2>Valores adicionados</h2>{tab.history.filter(row => row.kind === 'ChargeAdded').map(row => <article className="ux-list-row" key={row.id}><div><strong>{row.reason || 'Valor adicional'}</strong><small>{dateTime(row.createdAtUtc)}</small></div><strong>{money(row.amount)}</strong></article>)}</section>}
      {selectedItem && selectedAction && removalAllowed && <ItemRemovalConfirmation key={selectedItem.id} item={selectedItem} title={tabTitle(tab)} action={selectedAction} busy={Boolean(removalUnavailable)} pending={Boolean(pendingRemoval)} onConfirm={() => void removeItem()} onCancel={() => { setSelected(null); removalButtons.current.get(selectedItem.id)?.focus() }} />}
      {supervisor && tab.state === 'Open' && tab.payable > 0 && <button className="ux-button secondary" disabled={command.busy || removalBlocked} onClick={() => setAdjusting(!adjusting)}>Autorizar desconto ou cortesia</button>}{adjusting && <form className="ux-panel" onSubmit={async event => { event.preventDefault(); if (removalBlocked) return; const amount = adjustmentKind === 'Courtesy' ? tab.payable : parseAmount(adjustmentValue); if (!Number.isFinite(amount) || amount <= 0 || amount > tab.payable) { command.setError('Confira o valor autorizado.'); return } const result = await command.run(() => postBar<Tab>(`/tabs/${tabId}/adjustments`, { operationId: intent('adjustment'), kind: adjustmentKind, amount, reason: adjustmentReason })); if (result.ok) { intent('adjustment', true); setAdjusting(false); setAdjustmentReason(''); setAdjustmentValue(''); command.setMessage('Autorização registrada.') } }}><h2>Autorização do Gestor</h2><label className="ux-field">Tipo<select value={adjustmentKind} disabled={command.busy || removalBlocked} onChange={event => { setAdjustmentKind(event.target.value); intent('adjustment', true) }}><option value="Discount">Desconto por valor</option><option value="Courtesy">Cortesia de todo o saldo disponível</option></select></label>{adjustmentKind === 'Discount' && <label className="ux-field">Valor do desconto (R$)<FormattedInput format="money" required value={adjustmentValue} disabled={command.busy || removalBlocked} onValueChange={value => { setAdjustmentValue(value); intent('adjustment', true) }} /></label>}<label className="ux-field">Motivo obrigatório<input required minLength={3} maxLength={500} value={adjustmentReason} disabled={command.busy || removalBlocked} onChange={event => { setAdjustmentReason(event.target.value); intent('adjustment', true) }} /></label><div className="ux-actions"><button className="ux-button primary" disabled={command.busy || removalBlocked}>Confirmar autorização</button><button type="button" className="ux-button secondary" disabled={command.busy || removalBlocked} onClick={() => setAdjusting(false)}>Voltar</button></div></form>}<Payments tab={tab} />
      <details className="ux-panel"><summary>Histórico da comanda</summary><ol className="ux-timeline">{tab.history?.map(row => <li key={row.id}>{historyLabel(row.kind)}{row.amount !== 0 && ` · ${money(row.amount)}`}<small>{dateTime(row.createdAtUtc)}{row.reason && ` · ${row.reason}`}</small></li>)}</ol></details>
    </>}</BarFrame>
}
const historyLabel = (kind: string) => ({ Open: 'Comanda aberta', Opened: 'Comanda aberta', ResponsibleAssigned: 'Responsável vinculado à área do cliente', CustomerIdentified: 'Cliente identificado', CustomerUnlinked: 'Identificação do cliente removida', CustomerIdentificationRemoved: 'Identificação do cliente removida', ItemAdded: 'Produto adicionado', Requested: 'Pedido recebido, aguardando aceite', Accepted: 'Pedido aceito', Fulfilled: 'Produto entregue', Rejected: 'Pedido recusado', Reversed: 'Consumo corrigido', ChargeAdded: 'Valor adicionado', Payment: 'Pagamento registrado', PaymentApproved: 'Pagamento confirmado', PaymentPending: 'Pix aguardando confirmação', PaymentDeclined: 'Pagamento não confirmado', PaymentRefunded: 'Estorno confirmado', Discount: 'Desconto autorizado', Courtesy: 'Cortesia autorizada', Refund: 'Estorno', Closed: 'Comanda encerrada', Cancelled: 'Comanda cancelada', ConcessionVoided: 'Desconto ou cortesia anulados', ConcessionReduced: 'Desconto reduzido após correção', Access: 'Acesso de cliente emitido', AccessRevoked: 'Acesso do cliente encerrado', FeeReconciled: 'Taxa registrada' }[kind] ?? 'Alteração na comanda')

export { OrdersPage } from './OrdersPage'
