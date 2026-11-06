import { ITEM_REMOVAL_REASON, ItemRemovalConfirmation, type ItemRemovalAction } from './ItemRemovalConfirmation'
import { tabTitle } from './tabTitle'
import { hasPermission, hasStaffAction } from '../auth/access'
import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { apiFetch, ApiError } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { BarFrame, LoadState } from './Core'
import { Empty, Header, Icon, ItemStatus } from './components'
import { dateTime, postBar, useIntent, type PageResult, type Tab, type TabItem } from './api'
import { OrderWaiting, useAttentionClock } from './TabAttention'
import './orders.css'
import './service-clean.css'

type OrderAction = 'accept' | 'fulfill' | ItemRemovalAction
type Progress = { busy: boolean; error?: string; uncertain?: boolean; retry?: { action: OrderAction; reason: string } }
const views = [['', 'Todos'], ['Requested', 'A aceitar'], ['Accepted', 'A entregar']] as const
const actionLabels = { accept: 'Aceitando…', fulfill: 'Entregando…', reject: 'Excluindo…', reverse: 'Excluindo…' }

export function OrdersPage() {
  const { user } = useAuth(); const cache = useQueryClient(); const intent = useIntent('orders')
  const [params, setParams] = useSearchParams(); const now = useAttentionClock()
  const page = Math.max(1, Math.floor(Number(params.get('pagina')) || 1))
  const search = params.get('busca') ?? ''
  const state = views.some(([value]) => value === params.get('situacao')) ? params.get('situacao')! : ''
  const path = `/tabs?state=Orders&page=${page}&pageSize=24&search=${encodeURIComponent(search)}&orderState=${state}`
  const locks = useRef(new Set<string>())
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  const [refusing, setRefusing] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const busy = Object.values(progress).some(value => value.busy)
  const query = useQuery({ queryKey: ['bar-runtime', user?.id, path], enabled: Boolean(user),
    queryFn: ({ signal }) => apiFetch<PageResult<Tab>>(`/api/v1/bar${path}`, { signal }),
    staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: !busy, refetchInterval: busy ? false : 15_000 })
  const accessLost = query.error instanceof ApiError && [401, 403, 404, 410].includes(query.error.status)
  const data = accessLost ? undefined : query.data
  const canOperate = (hasPermission(user, 'bar:sales:operate') && hasStaffAction(user,'bar.orders'))
  const canReverse = hasPermission(user, 'bar:supervise')
  function filters(changes: Record<string, string>, replace = false) {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key))
    setRefusing(null); setParams(next, { replace, preventScrollReset: true })
  }
  async function action(tab: Tab, item: TabItem, name: OrderAction, reason = '') {
    const previous = progress[item.id]
    if (!canOperate || name === 'reverse' && !canReverse || locks.current.has(item.id)) return
    if (previous?.uncertain && previous.retry && (previous.retry.action !== name || previous.retry.reason !== reason)) return
    locks.current.add(item.id)
    setProgress(current => ({ ...current, [item.id]: { busy: true, retry: { action: name, reason } } }))
    const queues = { predicate: (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === 'bar-runtime' && q.queryKey[1] === user?.id && String(q.queryKey[2]).startsWith('/tabs?state=Orders') }
    try {
      await cache.cancelQueries(queues)
      const result = await postBar<Tab>(`/tabs/${tab.id}/items/${item.id}/${name}`, { operationId: intent(`${item.id}:${name}:${reason}`), reason, ...(name === 'reverse' ? { returnStock: false } : {}) })
      const confirmed = result.items.find(row => row.id === item.id)
      if (!confirmed) throw new Error('Resposta sem o item confirmado')
      await cache.cancelQueries(queues)
      // Respostas concorrentes da mesma comanda só confirmam o item desta ação.
      cache.setQueriesData<PageResult<Tab>>(queues, previous => previous && ({ ...previous, items: previous.items.map(row => row.id === tab.id ? { ...row, items: row.items.map(old => old.id === item.id ? confirmed : old) } : row) }))
      void cache.invalidateQueries({ queryKey: ['bar-runtime'], refetchType: 'none' })
      void cache.invalidateQueries({ queryKey: ['bar'], refetchType: 'none' })
      setProgress(current => ({ ...current, [item.id]: { busy: false } }))
      setRefusing(current => current === item.id ? null : current)
      setMessage(`${item.quantity} × ${item.name} · ${tabTitle(tab)}: ${name === 'accept' ? 'pedido aceito.' : name === 'fulfill' ? 'entrega confirmada.' : 'item excluído.'}`)
      return true
    } catch (cause) {
      setProgress(current => ({ ...current, [item.id]: { busy: false, error: cause instanceof ApiError ? cause.message : 'Não foi possível confirmar. Tente novamente; o registro não será duplicado.', uncertain: ['reject', 'reverse'].includes(name) && !(cause instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(cause.status)), retry: { action: name, reason } } }))
      return false
    } finally {
      locks.current.delete(item.id)
      if (!locks.current.size) void cache.invalidateQueries({ ...queues, refetchType: 'active' })
    }
  }
  const groups = (data?.items ?? []).map(tab => ({ tab, items: tab.items.filter(item => ['Requested', 'Accepted'].includes(item.state) && (!state || item.state === state)) })).filter(group => group.items.length)
  return <BarFrame className="lb-orders-page"><Header title="Pedidos" />
    <div className="lb-orders-filters"><div className="ux-actions" role="group" aria-label="Situação dos pedidos">{views.map(([value, label]) => <button key={value} className={`ux-button ${state === value ? 'primary' : 'secondary'}`} aria-pressed={state === value} onClick={() => filters({ situacao: value, pagina: '1' })}>{label}</button>)}</div>
    <label className="ux-search"><Icon name="search" /><input type="search" aria-label="Buscar pedidos" placeholder="Comanda, nome ou produto" maxLength={80} value={search} onChange={event => filters({ busca: event.target.value, pagina: '1' }, true)} /></label></div>
    <p className="ux-note">Mais antigos primeiro. A busca encontra comandas com o produto informado.</p>
    {message && <p className="ux-notice" role="status">{message}</p>}<LoadState query={query} />
    <div className="lb-orders-groups">{groups.map(({ tab, items }) => <section className="ux-panel lb-orders-group" key={tab.id} aria-label={`Pedidos da comanda ${tab.number}`}>
      <Link className="lb-order-comanda" to={`/atendimento/comandas/${tab.id}?retorno=${encodeURIComponent(`/atendimento/pedidos${params.size ? `?${params}` : ''}`)}`}><h2>{tabTitle(tab)}<Icon name="arrow" /></h2></Link>
      {tab.notes && <p className="lb-item-notes">{tab.notes}</p>}
      {items.map(item => <OrderRow key={item.id} item={item} tab={tab} now={now} progress={progress[item.id]} canOperate={Boolean(canOperate) && tab.state === 'Open' && !query.isError} canReverse={canReverse} refusing={refusing === item.id} onRefuse={() => setRefusing(item.id)} onCancel={() => setRefusing(null)} onAction={(name, reason) => action(tab, item, name, reason)} />)}
    </section>)}</div>
    {!query.isError && !query.isLoading && !groups.length && <Empty title={search || state ? 'Nenhum pedido nesta seleção' : 'Nenhum pedido aguardando'}>{(search || state) && <button className="ux-button secondary" onClick={() => filters({ busca: '', situacao: '', pagina: '1' })}>Limpar filtros</button>}</Empty>}
    {data && (data.total > 24 || page > 1) && <div className="ux-pagination"><button className="ux-button secondary" disabled={page === 1} onClick={() => filters({ pagina: String(page - 1) })}>Anterior</button><span>{data.total} comandas · Página {page}</span><button className="ux-button secondary" disabled={page * 24 >= data.total} onClick={() => filters({ pagina: String(page + 1) })}>Próxima</button></div>}
  </BarFrame>
}

function OrderRow({ item, tab, now, progress, canOperate, canReverse, refusing, onRefuse, onCancel, onAction }: {
  item: TabItem; tab: Tab; now: number; progress?: Progress; canOperate: boolean; canReverse: boolean; refusing: boolean
  onRefuse: () => void; onCancel: () => void; onAction: (name: OrderAction, reason?: string) => Promise<boolean | undefined>
}) {
  const refuseButton = useRef<HTMLButtonElement>(null)
  const blocked = progress?.busy || !canOperate
  const actionBlocked = blocked || Boolean(progress?.uncertain)
  const retryBlocked = blocked || progress?.retry?.action === 'reverse' && !canReverse
  const removalAction = item.allowedActions?.includes('reject') ? 'reject' : canReverse && item.allowedActions?.includes('reverse') ? 'reverse' : null
  return <article className="lb-order-row" aria-label={`${item.quantity} × ${item.name}`} aria-busy={progress?.busy || false}>
    <div className="lb-order-info"><h3>{item.quantity} × {item.name}</h3><ItemStatus item={item} /><OrderWaiting item={item} now={now} /><small>{dateTime(item.createdAtUtc)}</small>{item.notes && <p className="lb-item-notes">{item.notes}</p>}</div>
    {canOperate && <div className="ux-actions lb-order-actions">{item.allowedActions?.includes('accept') && <button className="ux-button primary" disabled={actionBlocked} onClick={() => void onAction('accept')}>Aceitar</button>}{removalAction && <button ref={refuseButton} className="ux-button danger" disabled={actionBlocked} onClick={onRefuse}>Excluir item</button>}{item.allowedActions?.includes('fulfill') && <button className="ux-button primary" disabled={actionBlocked} onClick={() => void onAction('fulfill')}>Entregar</button>}</div>}
    {progress?.busy && <p role="status">{actionLabels[progress.retry!.action]}</p>}
    {progress?.error && <div className="ux-notice error" role="alert"><p>{progress.error}</p>{progress.uncertain && retryBlocked && <p>Seu acesso não permite confirmar esta exclusão. Peça ajuda à gestão.</p>}{(progress.uncertain || !['reject', 'reverse'].includes(progress.retry!.action)) && <button className="ux-button secondary" disabled={retryBlocked} onClick={() => void onAction(progress.retry!.action, progress.retry!.reason)}>Tentar novamente</button>}</div>}
    {canOperate && refusing && removalAction && !progress?.uncertain && <ItemRemovalConfirmation item={item} title={tabTitle(tab)} action={removalAction} busy={Boolean(blocked)} onConfirm={() => onAction(removalAction, ITEM_REMOVAL_REASON)} onCancel={() => { onCancel(); refuseButton.current?.focus() }} />}
  </article>
}
