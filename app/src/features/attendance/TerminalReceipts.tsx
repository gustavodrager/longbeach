import { money } from './api'
export function TerminalReceipts({rows}:{rows?:{terminalType:string;amount:number;refunded:number}[]}) {
 return rows?.length ? <section aria-label="Maquininha neste turno"><h3>Maquininha neste turno</h3><p>Confirmações manuais, separadas do dinheiro físico. Recebimentos sem caixa aberto ficam nos relatórios.</p>{rows.map(r=><p key={r.terminalType}>{({Debit:'Débito',Credit:'Crédito',Pix:'Pix'} as Record<string,string>)[r.terminalType]}: {money(r.amount)} · devolvido {money(r.refunded)} · após devoluções {money(r.amount-r.refunded)}</p>)}</section> : null
}
