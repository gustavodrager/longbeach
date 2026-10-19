import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/http'
import { barLocation } from '../attendance/serviceLocation'
import { useUnsavedChanges } from '../../components/managementUi'
import { Heading } from '../../pages/arenaUi'

export const root = '/api/v1/bar'
const stateLabels: Record<string,string> = {Draft:'Rascunho',AwaitingPayment:'Aguardando pagamento',Paid:'Paga',Canceled:'Cancelada',Refunded:'Estornada',Approved:'Aprovado',Pending:'Pendente',Ordered:'Comprada',PartiallyReceived:'Recebida parcialmente',Received:'Recebida',Loss:'Perda',InternalConsumption:'Consumo interno',Sale:'Venda',PurchaseReceived:'Recebimento de compra',InitialCount:'Contagem inicial',InventoryAdjustment:'Ajuste de inventário',TransferOut:'Transferência de saída',TransferIn:'Transferência de entrada',Courtesy:'Cortesia',SaleReturn:'Devolução',Cash:'Dinheiro',CardManual:'Cartão manual',Pix:'Pix',TabDelivery:'Entrega de comanda',TabReturn:'Devolução de comanda',TabPayment:'Pagamento de comanda',TabRefund:'Estorno de comanda',Open:'Aberto',Closed:'Fechado',Reopened:'Reaberto',Declined:'Não confirmado'}
export const label = (state:string) => stateLabels[state] ?? state
export const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export type Named = { id: string; name: string }
export type Product = Named & { code: string; shortName: string; categoryId: string; saleUnit: string; salePrice: number; controlsStock: boolean; minimumStock: number; favorite: boolean; displayOrder: number; active: boolean; version: number; barcode?: string; imageUrl?: string; prepared?: boolean }
export type Managed = { product: Product; purchaseUnit: string; conversionFactor: number; averageCost: number; lastCost: number; mainSupplierId?: string }
export type Balance = { productId: string; locationId: string; quantity: number; reserved: number; available: number; name: string; low: boolean; minimumStock: number; unit: string; alertEligible: boolean; active: boolean; controlsStock: boolean }
export type Session = { id: string; registerId: string; locationId: string; state: string; expected: number; terminal: string }
export type Sale = { id: string; actorId?: string; discountAmount?: number; total: number; state: string; reason?: string; items: { productId: string; name: string; quantity: number; total: number }[] }
export function useBar<T>(path: string, enabled = true) { return useQuery({ queryKey: ['bar', path], queryFn: () => apiFetch<T>(root + path), enabled }) }
export function useAction() {
  const {markSaved}=useUnsavedChanges()
  const attemptKeys = useRef(new Map<string,string>()); const locked = useRef(false);
  const client = useQueryClient(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('')
  const run = async <T,>(path: string, body: unknown, method = 'POST'): Promise<T | null | undefined> => {
    if (locked.current) return undefined; locked.current=true; let retryKey: string | undefined
    if (body && typeof body === 'object' && 'operationId' in body) { const b=body as Record<string,unknown>; const {operationId: _id,...rest}=b; const key=path+JSON.stringify(rest); retryKey=key; if(attemptKeys.current.has(key)) b.operationId=attemptKeys.current.get(key); else attemptKeys.current.set(key,String(b.operationId)) }
    setBusy(true); setError(''); setMessage('')
    try { const result = await apiFetch<T>(root + path, { method, body: JSON.stringify(body) }); if(retryKey) attemptKeys.current.delete(retryKey); await client.invalidateQueries({ queryKey: ['bar'] }); markSaved(); setMessage('Operação registrada.'); return result ?? null }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível registrar.'); return undefined }
    finally { locked.current=false; setBusy(false) }
  }
  return { run, busy, error, message }
}
export function Notice({ action }: { action: ReturnType<typeof useAction> }) { return <>{action.error && <p role="alert" className="bar-error">{action.error}</p>}{action.message && <p role="status">{action.message}</p>}</> }
export function QueryNotice({ query }: { query: { isLoading: boolean; error: Error | null } }) { return <>{query.isLoading && <p role="status">Carregando…</p>}{query.error && <p role="alert">{query.error.message}</p>}</> }
export function useBarStock() {
  const query = useBar<Named[]>('/stock/locations')
  const location = query.isError ? undefined : barLocation(query.data)
  return { query, location, ready: Boolean(location) }
}
export function StockNotice({ stock }: { stock: ReturnType<typeof useBarStock> }) {
  return <><QueryNotice query={stock.query}/>{stock.query.isSuccess && !stock.location && <p role="alert">Estoque do Bar não configurado. Peça à gestão para conferir o cadastro.</p>}</>
}
export function Page({ title, children }: { title: string; children: ReactNode }) { return <main className="operation-page arena-page"><Heading title={title} description="" eyebrow="Gestão do bar" />{children}</main> }
export function Input({ name, label, value, type = 'text', required = true, step, disabled }: { name: string; label: string; value?: string | number; type?: string; required?: boolean; step?: string; disabled?: boolean }) { return <label className="bar-field">{label}<input name={name} defaultValue={value} disabled={disabled} type={type} required={required} min={type === 'number' ? 0 : undefined} step={step} /></label> }
export function Select({ name, label, items, value }: { name: string; label: string; items: Named[]; value?: string }) { return <label className="bar-field">{label}<select name={name} required defaultValue={value ?? ''}><option value="" disabled>Selecione</option>{items.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label> }
export const formData = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); return new FormData(e.currentTarget) }
export const str = (f: FormData, key: string) => String(f.get(key) ?? '')
export const num = (f: FormData, key: string) => Number(f.get(key))
