import { money, type TabItem } from './api'

export const ITEM_REMOVAL_REASON = 'Item removido pela equipe.'
export type ItemRemovalAction = 'reject' | 'reverse'
type RemovalItem = Pick<TabItem, 'id' | 'name' | 'quantity' | 'total'>
export type PendingItemRemoval = { operationId: string; action: ItemRemovalAction; reason: string; item: RemovalItem }

export function readPendingItemRemoval(raw: string): PendingItemRemoval | null {
  try {
    const value = JSON.parse(raw) as PendingItemRemoval
    return value && typeof value.operationId === 'string' && value.operationId.length > 0
      && ['reject', 'reverse'].includes(value.action)
      && typeof value.reason === 'string' && value.reason.length >= 3 && value.reason.length <= 450
      && value.item && typeof value.item.id === 'string' && value.item.id.length > 0
      && typeof value.item.name === 'string' && Number.isFinite(value.item.quantity) && value.item.quantity > 0
      && Number.isFinite(value.item.total) && value.item.total >= 0 ? value : null
  } catch { return null }
}

export function ItemRemovalConfirmation({ item, title, action, busy, pending = false, onConfirm, onCancel }: {
  item: RemovalItem; title: string; action: ItemRemovalAction; busy: boolean; pending?: boolean
  onConfirm: () => unknown; onCancel: () => void
}) {
  return <form className="lb-order-refusal" aria-label={`Excluir ${item.name}`} onSubmit={event => { event.preventDefault(); if (!busy) onConfirm() }}>
    <strong>Excluir {item.quantity} × {item.name} · {title}?</strong>
    <p>{action === 'reject' ? `Retira ${money(item.total)} do pedido. Histórico preservado.` : `Retira ${money(item.total)} do consumo. Produtos entregues não voltam ao estoque.`}</p>
    {pending && <p role="status" className="ux-notice warning">Confirme esta exclusão antes de alterar outros itens.</p>}
    <div className="ux-actions"><button type="submit" className="ux-button danger" disabled={busy}>{pending ? 'Consultar ou repetir exclusão' : 'Confirmar exclusão'}</button>{!pending && <button autoFocus type="button" className="ux-button secondary" disabled={busy} onClick={onCancel}>Manter item</button>}</div>
  </form>
}
