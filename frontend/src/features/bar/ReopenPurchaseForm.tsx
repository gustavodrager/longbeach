import { useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { EditorPanel, useUnsavedChanges } from '../../components/managementUi'
import { apiFetch } from '../../lib/http'
import { label, money } from './BarCore'
import type { Purchase } from './purchaseModel'

export function ReopenPurchaseForm({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const client = useQueryClient(), guard = useUnsavedChanges()
  const [current, setCurrent] = useState(purchase)
  const [date, setDate] = useState(() => purchase.purchasedAtUtc
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(purchase.purchasedAtUtc))
    : '')
  const [reason, setReason] = useState(''), [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [needsRefresh, setNeedsRefresh] = useState(false)
  const [saved, setSaved] = useState<Purchase | null>(null)
  const lock = useRef(false)

  function updateQueries(result: Purchase) {
    client.setQueryData(['bar', '/purchases/' + result.id], result)
    void client.invalidateQueries({ queryKey: ['bar'] })
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (lock.current || needsRefresh || current.state !== 'Canceled' || !date || !reason.trim()) return
    lock.current = true; setBusy(true); setError('')
    try {
      const result = await apiFetch<Purchase>('/api/v1/bar/purchases/' + current.id + '/reopen', {
        method: 'POST', body: JSON.stringify({ purchasedAtUtc: date + 'T12:00:00-03:00', reason: reason.trim(), version: current.version }),
      })
      setSaved(result); setDirty(false); guard.markSaved(); updateQueries(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível reabrir a compra.')
      setNeedsRefresh(true)
    } finally { lock.current = false; setBusy(false) }
  }
  async function refresh() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const result = await apiFetch<Purchase>('/api/v1/bar/purchases/' + current.id)
      setCurrent(result); setNeedsRefresh(false); updateQueries(result)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a compra.') }
    finally { lock.current = false; setBusy(false) }
  }

  return <EditorPanel title="Reabrir compra cancelada" className="purchase-panel stock-clean" busy={busy}
    hasUnsavedChanges={dirty && !saved && current.state === 'Canceled'} onClose={onClose}>
    {saved ? <section className="purchase-success" role="status">
      <h3>Compra reaberta</h3>
      <p>{saved.document} · {label(saved.state)} · {money(saved.total)}</p>
      {saved.purchasedAtUtc && <p>Data da compra: {new Date(saved.purchasedAtUtc).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>}
      <p>A compra aguarda recebimento. Estoque e pagamento permanecem pendentes.</p>
      <button type="button" className="secondary-link" onClick={onClose}>Voltar às compras</button>
    </section> : <>
      <h3>{current.document}</h3><p>{label(current.state)} · {money(current.total)}</p>
      {error && <p role="alert" className="bar-error">{error}</p>}
      {needsRefresh && <p>Confira a situação atual antes de tentar novamente. <button type="button" disabled={busy} onClick={() => void refresh()}>Atualizar compra</button></p>}
      {current.state !== 'Canceled' ? <p role="status">Esta compra está {label(current.state).toLocaleLowerCase('pt-BR')} e não pode ser reaberta.</p> : <form className="purchase-form" onSubmit={event => void submit(event)}>
        <p>Informe a data correta e o motivo. A mesma compra voltará a aguardar recebimento, com seus produtos e valores preservados.</p>
        <p>Somente compras sem recebimentos ou vínculos financeiros podem ser reabertas.</p>
        <fieldset className="purchase-fields" disabled={busy}>
          <label className="bar-field">Data correta da compra<input type="date" required value={date} onChange={event => { setDate(event.target.value); setDirty(true) }}/></label>
          <label className="bar-field">Motivo da reabertura<textarea required maxLength={500} rows={3} value={reason} onChange={event => { setReason(event.target.value); setDirty(true) }}/></label>
          <p>Estoque e pagamento permanecem pendentes.</p>
          <button className="primary-button" disabled={busy || needsRefresh || !date || !reason.trim()}>{busy ? 'Processando…' : 'Confirmar reabertura'}</button>
        </fieldset>
      </form>}
    </>}
  </EditorPanel>
}
