import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { money, useBarData, type Tab, type PageResult } from './api'
import { readCart, LoadState } from './Core'

export function SaleDestination({ tab, locked, hasDraft }: { tab?: Tab; locked: boolean; hasDraft: boolean }) {
  const [choosing, setChoosing] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Tab | null>(null)
  const [error, setError] = useState('')
  const navigate = useNavigate(); const { user } = useAuth()
  const query = useBarData<PageResult<Tab>>(`/tabs?state=Open&search=${encodeURIComponent(search)}&page=1&pageSize=24`, choosing)
  const sourceKey = `lb-cart:${user?.id}:${tab?.id ?? 'sale'}`
  const destinationKey = selected ? `lb-cart:${user?.id}:${selected.id}` : ''
  const destinationPending = (id: string) => {
    try { const key = `lb-confirmation:order:${user?.id}:${id}`; return Boolean(localStorage.getItem(key) || sessionStorage.getItem(key)) } catch { return true }
  }
  const existingDraft = selected && (readCart(destinationKey).length > 0 || destinationPending(selected.id))
  function choose(transfer: boolean) {
    if (!selected || locked || query.isError || selected.state !== 'Open' || (transfer && destinationPending(selected.id))) return
    try {
      if (transfer && hasDraft) {
        // Recheck at the moment of confirmation; never overwrite another draft.
        if (readCart(destinationKey).length) { setError('Já há um rascunho nessa comanda. Retome-o para conferir.'); return }
        localStorage.setItem(destinationKey, JSON.stringify(readCart(sourceKey)))
        localStorage.removeItem(sourceKey); sessionStorage.removeItem(sourceKey)
      }
      navigate(`/atendimento/vender?comanda=${selected.id}`)
    } catch { setError('Não foi possível preservar o rascunho neste dispositivo. Nenhum pedido foi enviado.'); }
  }
  return <section className="ux-panel lb-sale-destination" aria-label="Destino do pedido">
    <div><h2>{tab ? `Comanda ${tab.number} · ${tab.name || 'Visitante'}` : 'Venda avulsa'}</h2>
      <p>{tab ? tab.responsible ? `Responsável: ${tab.responsible.name}` : 'Sem responsável vinculado à área do cliente.' : 'Nova comanda sem responsável ao registrar.'}</p>
      {tab && <p>Saldo atual: <strong>{money(tab.due)}</strong></p>}
    </div>
    <button type="button" className="ux-button secondary" disabled={locked} onClick={() => { setChoosing(!choosing); setSelected(null); setError('') }}>{choosing ? 'Fechar seleção' : tab ? 'Trocar comanda' : 'Escolher uma comanda'}</button>
    {choosing && <div className="lb-destination-picker" aria-label="Escolher comanda"><label className="ux-field">Buscar comanda<input type="search" maxLength={80} value={search} onChange={e => { setSearch(e.target.value); setSelected(null) }} /></label><LoadState query={query} />
      {query.data?.items.filter(t => t.id !== tab?.id).map(t => <button type="button" key={t.id} className="ux-button secondary" disabled={locked || query.isError} aria-pressed={selected?.id === t.id} onClick={() => { setSelected(t); setError('') }}>Comanda {t.number} · {t.name || 'Visitante'}</button>)}
      {query.data?.total === 0 && <p>Nenhuma comanda aberta encontrada.</p>}{(query.data?.total ?? 0) > 24 && <p>Digite o número ou nome para encontrar outras comandas.</p>}
      {selected && <div className="ux-notice"><strong>Destino: Comanda {selected.number} · {selected.name || 'Visitante'}</strong>
        <p>{existingDraft ? 'Esta comanda já tem um rascunho. O pedido atual fica guardado na origem.' : hasDraft ? 'Mover somente os produtos ainda não registrados para esta comanda?' : 'Continuar nesta comanda?'}</p>
        <button className="ux-button primary" disabled={locked || query.isError || query.isFetching} onClick={() => choose(!existingDraft)}>{existingDraft ? 'Retomar rascunho existente' : hasDraft ? 'Confirmar destino e mover rascunho' : 'Usar esta comanda'}</button>
      </div>}{error && <p role="alert">{error}</p>}
    </div>}
  </section>
}
