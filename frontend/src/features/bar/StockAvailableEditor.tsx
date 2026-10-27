import { useState } from 'react'
import { EditorPanel } from '../../components/managementUi'
import { type Balance, useAction, Notice } from './BarCore'
import { amount } from './StockUi'
export function StockAvailableEditor({balance,onClose}:{balance:Balance;onClose:()=>void}) {
  const [value,setValue]=useState(String(balance.available));const a=useAction()
  const valid=/^\d+(?:[.,]\d{1,3})?$/.test(value.trim());const quantity=Number(value.replace(',','.'))
  const changed=quantity!==balance.available;const [saved,setSaved]=useState(false)
  return <EditorPanel title="Editar quantidade disponível" onClose={onClose} busy={a.busy} hasUnsavedChanges={changed&&!saved}>
    <Notice action={a}/>
    <form className="bar-form stock-available-editor" onSubmit={async e=>{e.preventDefault();if(!valid||!changed||a.busy)return;const result=await a.run('/stock/available',{productId:balance.productId,locationId:balance.locationId,available:quantity,expectedVersion:balance.version??0,operationId:crypto.randomUUID()},'PUT');if(result!==undefined){setSaved(true);onClose()}}}>
      <h3>{balance.name}</h3><p>Disponível agora: <strong>{amount(balance.available)} {balance.unit||'un'}</strong></p>
      <label className="bar-field">Nova quantidade disponível<input autoFocus required inputMode="decimal" value={value} disabled={a.busy} onChange={e=>setValue(e.target.value)} aria-invalid={!valid}/></label>
      <p>Informe o total disponível para venda, sem incluir itens já separados para pedidos. Este valor substitui o disponível atual.</p>
      {!valid&&<p role="alert">Informe zero ou um número positivo com até três casas decimais.</p>}
      {valid&&changed&&<p>O disponível passará de {amount(balance.available)} para <strong>{amount(quantity)} {balance.unit||'un'}</strong>.</p>}
      <p className="arena-hint">O ajuste registra automaticamente a data e o responsável.</p>
      <div className="stock-actions"><button className="primary-button" disabled={!valid||!changed||a.busy}>{a.busy?'Salvando…':'Salvar quantidade'}</button><button type="button" disabled={a.busy} onClick={onClose}>Cancelar</button></div>
    </form>
  </EditorPanel>
}
