import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/http'
import { Link } from 'react-router-dom'
import { hasPermission, hasStaffAction, hasStaffMenu } from '../auth/access'
import { useAuth } from '../auth/authContext'
import { BarFrame, LoadState, useBarConnection } from './Core'
import { Header, Products, Summary } from './components'
import { money, useBarData, type CatalogItem, type Tab } from './api'
import { SaleDestination } from './SaleDestination'
import { tabTitle } from './tabTitle'
import { useDirectSales } from './useDirectSales'
import { useDirectSalesPending } from './directSalesPending'
import './direct-sale.css'

export function DirectTabSale({ tabId }: { tabId: string }) {
  const { user } = useAuth(); const connection = useBarConnection()
  const query = useQuery<Tab>({ queryKey: ['bar-runtime', user?.id, `/tabs/${tabId}`], enabled: Boolean(user),
    queryFn: ({ signal }) => apiFetch<Tab>(`/api/v1/bar/tabs/${tabId}`, { signal }),
    staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: 'always', refetchInterval: 15_000,
    structuralSharing: (previous, next) => {
      const old = previous as Tab | undefined; const incoming = next as Tab
      return old && (old.version ?? 0) > (incoming.version ?? 0) ? old : incoming
    } })
  const tab = query.isError ? undefined : query.data
  const catalog = useBarData<CatalogItem[]>(`/tabs/catalog?locationId=${encodeURIComponent(tab?.locationId ?? '')}`, Boolean(tab?.locationId))
  const authorized = Boolean(hasPermission(user,'bar:sales:operate') && hasStaffMenu(user,'bar.sell') && hasStaffAction(user,'bar.sell') && hasStaffMenu(user,'bar.orders') && hasStaffAction(user,'bar.orders'))
  const known = Boolean(tab?.id === tabId && !query.isError)
  const open = tab?.state === 'Open'
  const accepting = authorized && known && open && !catalog.isError && Boolean(catalog.data)
  const canReverse = authorized
  const allPending = useDirectSalesPending(tabId, user?.id)
  const removal = useDirectSales(user?.id ?? '', tabId, { authorized: canReverse, known, open, accepting: canReverse && accepting, online: connection.online }, 'remove')
  const removalSettled = removal.queue.entries.length === 0 && !removal.saving && removal.adding === 0 && !removal.storageError
  const sales = useDirectSales(user?.id ?? '', tabId, { authorized, known, open, accepting: accepting && removalSettled && !allPending.removal && !allPending.unreadable, online: connection.online, suspended: !removalSettled || allPending.removal || allPending.unreadable })
  const pending = sales.queue.entries
  const blocked = !removalSettled || allPending.removal || allPending.unreadable || !accepting || !connection.online || sales.accessBlocked || Boolean(sales.storageError) || pending.length >= 500
  const pendingProducts = new Set(allPending.productIds)
  const navigationLocked = sales.adding > 0 || removal.adding > 0
  const settled = removalSettled && !allPending.blocked && pending.length === 0 && sales.adding === 0 && !sales.saving && !sales.storageError
  const quantities = new Map<string, number>()
  tab?.items.filter(item => ['Accepted','Fulfilled'].includes(item.state)).forEach(item => quantities.set(item.productId,(quantities.get(item.productId) ?? 0)+item.quantity))
  // Direct taps are one-unit rows. Older batch rows retain the supervised detail correction.
  const removable = new Map<string, NonNullable<typeof tab>['items'][number]>()
  tab?.items.filter(item => item.quantity === 1 && ['Accepted', 'Fulfilled'].includes(item.state)).forEach(item => removable.set(item.productId, item))
  const registered = Array.from(quantities,([productId,quantity])=>({productId,quantity}))
  const consumption = new Map<string, { name: string; quantity: number; total: number; state: string; notes?: string | null }>()
  tab?.items.filter(item=>['Accepted','Fulfilled'].includes(item.state)).forEach(item=>{
    const key=JSON.stringify([item.productId,item.name,item.unitPrice,item.notes,item.state]); const previous=consumption.get(key)
    consumption.set(key,{name:item.name,quantity:(previous?.quantity ?? 0)+item.quantity,total:(previous?.total ?? 0)+item.total,state:item.state,notes:item.notes})
  })
  return <BarFrame className="lb-sell lb-direct-sale"><Header title={known ? `Vender · ${tabTitle(tab!)}` : 'Vender'} back={!navigationLocked ? `/atendimento/comandas/${tabId}` : undefined} />
    <LoadState query={query} /><LoadState query={catalog} />
    {(sales.storageError || removal.storageError) && <p className="ux-notice error" role="alert">{sales.storageError || removal.storageError} Verifique o espaço do dispositivo e reabra esta comanda para retomar os registros guardados. Não apague os dados do aplicativo enquanto houver registros em conferência.</p>}
    {removal.queue.entries.length > 0 && <section className="ux-panel" aria-label="Retirada em conferência"><p role="status">{removal.queue.paused ? 'Confira a retirada pendente antes de continuar.' : 'Retirando uma unidade…'}</p>{removal.queue.error && <p role="alert">{removal.queue.error}</p>}{removal.queue.paused && <button className="ux-button primary" disabled={!canReverse || !known || !connection.online || removal.saving || Boolean(removal.storageError)} onClick={() => void removal.resume()}>Retomar retirada</button>}{removal.queue.entries[0] && !removal.queue.entries[0].attempted && <button className="ux-button secondary" disabled={removal.saving} onClick={() => void removal.removeUnsent(removal.queue.entries[0].operationId)}>Cancelar retirada não enviada</button>}{removal.queue.rejectedId && <button className="ux-button secondary" disabled={removal.saving} onClick={() => void removal.removeUnsent(removal.queue.rejectedId!)}>Descartar retirada recusada</button>}</section>}
    {removal.message && <p role="status" className="ux-notice success">{removal.message}</p>}
    {(sales.notice || removal.notice) && <p role="status" className="ux-notice warning">{sales.notice || removal.notice}</p>}
    {!connection.online && <p className="ux-notice warning" role="status">Sem conexão. Novos toques estão bloqueados; os registros guardados permanecem nesta comanda.</p>}
    {known && <><SaleDestination tab={tab} locked={navigationLocked || !connection.online} hasDraft={false} />
      {!open && <p className="ux-notice warning" role="status">Esta comanda está {tab?.state === 'Cancelled' ? 'cancelada' : 'encerrada'} e não recebe novos produtos.{pending.length > 0 && ' Os registros pendentes foram preservados para conferência.'}</p>}
      <p className="ux-note">Cada toque adiciona uma unidade e registra a entrega nesta comanda. O botão − retira uma unidade e devolve ao estoque.</p>
      <div className="lb-sale-workspace"><div className="lb-sale-catalog">{open && <Products products={catalog.data ?? []} cart={registered} onChange={() => {}} onAdd={product => void sales.add(product)} canAdd={product => !pendingProducts.has(product.id)} onRemove={product => { const item = removable.get(product.id); if (canReverse && settled && item) void removal.remove(item, true) }} canRemove={product => canReverse && settled && removable.has(product.id)} disabled={blocked} />}</div>
        <aside className="lb-sale-summary" aria-label="Consumo registrado"><section className="ux-panel"><h2>Na comanda</h2><Summary tab={tab!} inReview={!settled} />
          {Array.from(consumption,([key,item])=><div className="ux-list-row" key={key}><span>{item.quantity} × {item.name}{item.notes && <small>{item.notes}</small>}{item.state === 'Accepted' && <small>Entrega pendente</small>}</span><strong>{money(item.total)}</strong></div>)}
          {sales.message && <p role="status" className="ux-notice success">{sales.message}</p>}
          {pending.length > 0 && <div id="direct-sales-pending" className="lb-direct-pending" aria-label="Lançamentos pendentes">
            <p role="status">{sales.queue.paused ? 'Há lançamentos em conferência.' : `Registrando ${pending.length} unidade(s)…`}</p>
            <p>{money(pending.reduce((sum,row)=>sum+row.price,0))} em lançamentos aguardando confirmação. Alguns já podem constar no saldo.</p>
            {sales.queue.paused && <p>Você pode registrar outros produtos e atender outras comandas. Confira estas pendências antes de receber esta conta.</p>}
            {pending.map(row=><div key={row.operationId}>
              <span>1 × {row.name}</span>
              {row.error && <p role="alert">{row.error}</p>}
              {row.state === 'retry' && <small>Nova tentativa automática em andamento.</small>}
              {row.traceId && <small>Referência para suporte: {row.traceId}</small>}
              {(sales.queue.paused || !open) && (!row.attempted || row.state === 'rejected') && <button className="ux-button secondary" disabled={sales.saving} onClick={()=>void sales.removeUnsent(row.operationId)}>Remover {row.name} não registrado</button>}
            </div>)}
            {sales.queue.paused && <button className="ux-button primary" disabled={!connection.online || !authorized || !known || sales.saving || Boolean(sales.storageError)} onClick={()=>void sales.resume()}>Retomar registros</button>}
          </div>}
          {allPending.other && <p className="ux-notice warning">Há registros em conferência iniciados com outra conta neste dispositivo. Retome-os pela conta original antes de receber.</p>}
          {sales.adding > 0 && <p role="status">Guardando toque…</p>}
          <div className="ux-actions lb-direct-actions"><span><small>{tabTitle(tab!)}</small><strong>Saldo confirmado: {money(tab!.due)}</strong>{!settled && <small>{!removalSettled || allPending.removal ? 'Retirada em conferência' : allPending.other ? 'Registros de outra conta em conferência' : sales.queue.paused ? 'Confira os registros pendentes' : `${pending.length + sales.adding} unidade(s) aguardando registro`}</small>}</span>{sales.queue.paused && <a className="ux-button secondary" href="#direct-sales-pending">Ver registros pendentes</a>}{settled && open && tab!.payable > 0 && hasStaffMenu(user,'bar.receive') && hasStaffAction(user,'bar.receive') && <Link className="ux-button primary" to={`/atendimento/receber/${tabId}`}>Receber · {money(tab!.payable)}</Link>}</div>{!navigationLocked && hasStaffMenu(user,'bar.tabs') && <Link className="ux-button secondary" to={`/atendimento/comandas/${tabId}`}>Ver comanda e corrigir itens</Link>}
        </section></aside>
      </div>
    </>}
  </BarFrame>
}
