import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch, ApiError } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { hasPermission } from '../auth/access'
import { CustomerPicker } from '../customers/CustomerPicker'
import type { CustomerSelection } from '../customers/api'
import { useConfirmationGate } from './Core'
import { Feedback } from './components'
import { useBarCommand, type Tab } from './api'

type Identification = { operationId: string; customerId: string | null; expectedVersion: number }
function restore(raw: string): Identification | null {
  try {
    const value = JSON.parse(raw) as Identification
    return value && typeof value.operationId === 'string' && (value.customerId === null || typeof value.customerId === 'string') && Number.isInteger(value.expectedVersion) ? value : null
  } catch { return null }
}

export function TabCustomerIdentification({ tab, disabled = false }: { tab: Tab; disabled?: boolean }) {
  const { user } = useAuth()
  return <IdentificationForm key={`${user?.id}:${tab.id}`} tab={tab} disabled={disabled} />
}

function IdentificationForm({ tab, disabled }: { tab: Tab; disabled: boolean }) {
  const { user } = useAuth()
  const [raw, setPending] = useConfirmationGate(`tab-customer:${user?.id}:${tab.id}`)
  const pending = restore(raw)
  const [editing, setEditing] = useState(Boolean(pending))
  const [selected, setSelected] = useState<CustomerSelection | null>(tab.customer ?? null)
  const cache = useQueryClient()
  const command = useBarCommand()
  const request = useRef(false)
  const allowed = hasPermission(user, 'bar:sales:operate')
  const ready = allowed && tab.state === 'Open' && tab.pending === 0 && Number.isInteger(tab.version)
  async function save() {
    if (request.current || disabled || command.busy || !allowed || !pending && !ready) return
    const body: Identification = pending ?? { operationId: crypto.randomUUID(), customerId: selected?.id ?? null, expectedVersion: tab.version! }
    request.current = true
    try {
      try { setPending(JSON.stringify(body)) } catch { command.setError('Não foi possível preservar esta confirmação. Libere o armazenamento antes de continuar.'); return }
      const result = await command.run(() => apiFetch<Tab>(`/api/v1/bar/tabs/${tab.id}/customer`, { method: 'PUT', body: JSON.stringify(body) }))
      if (result.ok) { setPending(''); setEditing(false); command.setMessage('Identificação atualizada. O responsável financeiro permanece o mesmo.') }
      else if (result.error instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(result.error.status)) {
        setPending('')
        await cache.invalidateQueries({ queryKey: ['bar-runtime'] })
      }
    } finally { request.current = false }
  }
  return <section className="ux-panel" aria-label="Identificação do cliente">
    <h2>Cliente identificado</h2><p>{tab.customer?.name ?? 'Atendimento sem cliente identificado'}</p>
    {tab.customer?.incomplete && <p className="ux-note">Telefone pendente no cadastro anterior. O atendimento continua disponível.</p>}
    <Feedback {...command} />
    {editing ? <>
      <p className="ux-note">A identificação cadastral não concede acesso à comanda nem altera quem responde pelo pagamento.</p>
      {pending ? <p role="status">A identificação aguarda confirmação. Repita os mesmos dados antes de trocar o cliente.</p> : <CustomerPicker scope="bar" contextKey={`tab-identify:${tab.id}`} label="Cliente da comanda" value={selected} onChange={setSelected} disabled={disabled || command.busy} />}
      <div className="ux-actions"><button type="button" className="ux-button primary" disabled={disabled || command.busy || !allowed || !pending && !ready} onClick={() => void save()}>{pending ? 'Conferir identificação' : 'Salvar identificação'}</button>{!pending && <button type="button" className="ux-button secondary" disabled={command.busy} onClick={() => setEditing(false)}>Voltar</button>}</div>
    </> : ready && <button type="button" className="ux-button secondary" disabled={disabled || command.busy} onClick={() => { setSelected(tab.customer ?? null); setEditing(true) }}>{tab.customer ? 'Alterar identificação' : 'Identificar cliente (opcional)'}</button>}
    {allowed && tab.state === 'Open' && tab.pending > 0 && <p className="ux-note">Aguarde a confirmação dos pagamentos pendentes para alterar a identificação.</p>}
  </section>
}
