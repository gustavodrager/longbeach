import { Link } from 'react-router-dom'
import { money, type Tab } from './api'

export function SaleDestination({ tab, locked, hasDraft }: { tab?: Tab; locked: boolean; hasDraft: boolean }) {
  return <section className="ux-panel lb-sale-destination" aria-label="Destino do pedido">
    <div>
      <p className="ux-note">{tab ? 'Adicionar consumo à comanda' : 'Novo atendimento'}</p>
      <h2>{tab ? `Comanda ${tab.number} · ${tab.name || 'Visitante'}` : 'Venda avulsa'}</h2>
      <p>{tab ? tab.responsible ? `Responsável: ${tab.responsible.name}` : 'Sem responsável vinculado à área do cliente.' : 'Ao registrar, será criada uma comanda separada, sem responsável vinculado.'}</p>
      {tab && <p className="lb-sale-balance">Saldo atual da comanda: <strong>{money(tab.due)}</strong><small>O pedido em edição aparece no resumo abaixo. O saldo só muda após o registro confirmado.</small></p>}
      {hasDraft && !locked && <p className="ux-note">Ao escolher outra comanda, este rascunho fica guardado aqui. Os produtos não são transferidos.</p>}
    </div>
    {!locked && <Link className="ux-button secondary" to="/atendimento/comandas?situacao=Open">{tab ? 'Trocar comanda' : 'Escolher uma comanda'}</Link>}
  </section>
}
