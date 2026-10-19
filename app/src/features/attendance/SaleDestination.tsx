import { Link } from 'react-router-dom'
import { money, type Tab } from './api'

export function SaleDestination({ tab, locked, hasDraft }: { tab?: Tab; locked: boolean; hasDraft: boolean }) {
  return <section className="ux-panel lb-sale-destination" aria-label="Destino do pedido">
    <div>
      <h2>{tab ? `Comanda ${tab.number} · ${tab.name || 'Visitante'}` : 'Venda avulsa'}</h2>
      <p>{tab ? tab.responsible ? `Responsável: ${tab.responsible.name}` : 'Sem responsável vinculado à área do cliente.' : 'Nova comanda sem responsável ao registrar.'}</p>
      {tab && <p className="lb-sale-balance">Saldo atual: <strong>{money(tab.due)}</strong></p>}
      {(tab || hasDraft) && <details className="lb-sale-help"><summary>Sobre este pedido</summary>
        {tab && <p>O pedido em edição aparece no resumo abaixo. O saldo só muda após o registro confirmado.</p>}
        {hasDraft && !locked && <p>Ao escolher outra comanda, este rascunho fica guardado aqui. Os produtos não são transferidos.</p>}
      </details>}
    </div>
    {!locked && <Link className="ux-button secondary" to="/atendimento/comandas?situacao=Open">{tab ? 'Trocar comanda' : 'Escolher uma comanda'}</Link>}
  </section>
}
