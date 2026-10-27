import './billing.css'
import type { Account } from './api'
import { money } from '../attendance/api'
const labels: Record<string, string> = { Requested: 'Aguardando o bar', Accepted: 'Em preparo / separação', Fulfilled: 'Entregue', Rejected: 'Recusado · não cobrado', Reversed: 'Cancelado · não cobrado' }
export function AccountItems({ account }: { account: Account }) {
  return <details className="billing-items"><summary>Itens da comanda</summary>
    {account.items ? account.items.length ? <ul>{account.items.map(item => <li key={item.id}>
      <div><strong>{item.quantity.toLocaleString('pt-BR')} × {item.name}</strong><p>{money(item.unitPrice)} por unidade · {labels[item.state] ?? item.state}</p></div>
      <span className="billing-item-amount"><span>{money(item.total)}</span>{item.state === 'Requested' && <small> Ainda fora do total</small>}</span>
    </li>)}</ul> : <p>Nenhum item registrado nesta comanda.</p> : <p>Os itens não estão disponíveis nesta consulta. Atualize a página ou fale com o bar.</p>}
    {(account.discount ?? 0) > 0 && <p>Desconto aplicado: {money(account.discount ?? 0)}</p>}
    <p>O total considera os itens aceitos e entregues, descontando os ajustes. Pedidos aguardando o bar, recusados ou cancelados não são cobrados.</p>
  </details>
}
