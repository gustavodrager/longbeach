import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/http'
import { Disclosure, EditorPanel, useUnsavedChanges } from '../../components/managementUi'
import { money, type Named } from './BarCore'
import { PurchaseFinanceLink } from './PurchaseFinanceLink'
import { decimal, purchaseDate, quantityText, rowTotal, type Purchase, type PurchaseProduct, type PurchaseRow } from './purchaseModel'

export function PurchaseForm({products,suppliers,onClose,onReceive}:{products:PurchaseProduct[];suppliers:Named[];onClose:()=>void;onReceive:(purchase:Purchase)=>void}) {
  const client=useQueryClient(),guard=useUnsavedChanges()
  const [rows,setRows]=useState<PurchaseRow[]>([]),[search,setSearch]=useState(''),[supplier,setSupplier]=useState(''),[newSupplier,setNewSupplier]=useState(''),[addingSupplier,setAddingSupplier]=useState(false)
  const [document,setDocument]=useState(''),[date,setDate]=useState(purchaseDate),[freight,setFreight]=useState('0'),[discount,setDiscount]=useState('0'),[method,setMethod]=useState('Pending'),[account,setAccount]=useState('')
  const [busy,setBusy]=useState(false),[supplierBusy,setSupplierBusy]=useState(false),[error,setError]=useState(''),[supplierError,setSupplierError]=useState(''),[saved,setSaved]=useState<Purchase|null>(null),[dirty,setDirty]=useState(false),[submitted,setSubmitted]=useState(false)
  const locked=useRef(false), supplierLock=useRef(false),searchInput=useRef<HTMLInputElement>(null),quantityInputs=useRef(new Map<string,HTMLInputElement>())
  const productMap=new Map(products.map(p=>[p.id,p]));const totals=rows.map(rowTotal),gross=totals.reduce((sum,r)=>sum+Math.round(r.total*100),0)/100
  const freightValue=decimal(freight,2),discountValue=decimal(discount,2)
  const termsError=freightValue===null||discountValue===null?'Informe frete e desconto válidos.':discountValue>gross?'O desconto não pode superar o subtotal.':''
  const valid=rows.length>0&&totals.every(r=>!r.error)&&!termsError
  const total=Math.round((gross+(freightValue??0)-(discountValue??0))*100)/100
  const normalize=(text:string)=>text.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('pt-BR')
  const match=normalize(search.trim())
  const choices=products.filter(p=>p.active&&!rows.some(r=>r.productId===p.id)&&(!match||normalize(`${p.name} ${p.code}`).includes(match)))
  const edit=(id:string,key:'quantity'|'cost'|'total',value:string)=>{setDirty(true);setRows(current=>current.map(r=>r.productId===id?{...r,[key]:value}:r))}
  const add=(product:PurchaseProduct)=>{setDirty(true);setRows(current=>[...current,{productId:product.id,quantity:'',cost:'',total:''}]);setSearch('');requestAnimationFrame(()=>quantityInputs.current.get(product.id)?.focus())}
  async function saveSupplier(){
    if(supplierLock.current||!newSupplier.trim())return
    supplierLock.current=true;setSupplierBusy(true);setSupplierError('')
    try { const created=await apiFetch<Named>('/api/v1/bar/suppliers',{method:'POST',body:JSON.stringify({name:newSupplier.trim()})});client.setQueryData<Named[]>(['bar','/suppliers'],old=>[...(old??[]),created]);setSupplier(created.id);setAddingSupplier(false);setNewSupplier('');setDirty(true) }
    catch(e){setSupplierError(e instanceof Error?e.message:'Não foi possível cadastrar o fornecedor.')}
    finally{supplierLock.current=false;setSupplierBusy(false)}
  }
  return <EditorPanel title="Nova compra" className="purchase-panel stock-clean" busy={busy||supplierBusy} hasUnsavedChanges={dirty&&!saved} onClose={onClose}>
    {saved?<section className="purchase-success" role="status"><h3>Compra registrada</h3><p>{saved.document} · {money(saved.total)}</p><p>Os produtos ainda não entraram no estoque. Confirme o que chegou no recebimento.</p><button className="primary-button" onClick={()=>onReceive(saved)}>Receber esta compra</button>{saved.total > 0 && <PurchaseFinanceLink purchaseId={saved.id} />}<button className="secondary-link" onClick={onClose}>Voltar às compras</button></section>:<form className="purchase-form" onChange={e=>{if(!(e.target as HTMLElement).closest('[data-unsaved-ignore]'))setDirty(true)}} onSubmit={async e=>{
      e.preventDefault();setSubmitted(true);if(!valid||locked.current||supplierLock.current)return
      locked.current=true;setBusy(true);setError('')
      try {const result=await apiFetch<Purchase>('/api/v1/bar/purchases',{method:'POST',body:JSON.stringify({supplierId:supplier,document:document.trim(),purchasedAtUtc:date+'T12:00:00-03:00',freight:freightValue,discount:discountValue,paymentMethod:method,accountReference:account.trim()||null,items:rows.map(r=>({productId:r.productId,quantity:decimal(r.quantity),purchaseCost:decimal(r.cost,2),total:r.total.trim()===''?null:decimal(r.total,2)}))})});guard.markSaved();setDirty(false);setSaved(result);void client.invalidateQueries({predicate:q=>q.queryKey[0]==='bar'&&String(q.queryKey[1]).startsWith('/purchases/history')})}
      catch(e){setError(e instanceof Error?e.message:'Não foi possível registrar a compra.')}
      finally{locked.current=false;setBusy(false)}
    }}>
      {error&&<p role="alert" className="bar-error">{error}</p>}
      <fieldset disabled={busy||supplierBusy} className="purchase-fields">
        <div className="field-grid"><label className="bar-field">Fornecedor<select required value={supplier} onChange={e=>setSupplier(e.target.value)}><option value="">Selecione o fornecedor</option>{suppliers.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label><label className="bar-field">Data da compra<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label></div>
        <button className="secondary-link" type="button" onClick={()=>setAddingSupplier(!addingSupplier)}>{addingSupplier?'Fechar cadastro de fornecedor':'+ Cadastrar fornecedor aqui'}</button>
        {addingSupplier&&<div className="purchase-supplier"><label className="bar-field">Nome do novo fornecedor<input maxLength={160} value={newSupplier} onChange={e=>setNewSupplier(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void saveSupplier()}}}/></label><button type="button" disabled={!newSupplier.trim()} onClick={()=>void saveSupplier()}>Cadastrar e selecionar</button></div>}
        {supplierError&&<p role="alert" className="bar-error">{supplierError}</p>}
        <label className="bar-field">Documento ou referência única da compra<input required maxLength={100} value={document} placeholder="Ex.: Nota 123 ou compra de bebidas" onChange={e=>setDocument(e.target.value)}/></label>
        <section aria-label="Produtos da compra"><h3>Produtos <small>({rows.length}/100)</small></h3>
          {rows.map((row,index)=>{const p=productMap.get(row.productId)!;const result=totals[index];return <article className="purchase-item" key={row.productId} aria-label={p.name}>
            <div className="purchase-item-heading"><strong>{p.name}</strong><button type="button" className="secondary-link" aria-label={`Remover ${p.name}`} onClick={()=>{setDirty(true);setRows(current=>current.filter(r=>r.productId!==p.id));searchInput.current?.focus()}}>Remover</button></div>
            <p className="purchase-unit">1 {p.purchaseUnit} = {quantityText(p.conversionFactor)} {p.saleUnit} no estoque{decimal(row.quantity)!==null&&` · Entrada prevista: ${quantityText((decimal(row.quantity)??0)*p.conversionFactor)} ${p.saleUnit}`}</p>
            <div className="field-grid"><label className="bar-field">Quantidade · {p.purchaseUnit}<input ref={node=>{if(node)quantityInputs.current.set(p.id,node);else quantityInputs.current.delete(p.id)}} aria-label={`Quantidade: ${p.name}`} type="text" inputMode="decimal" enterKeyHint="next" required value={row.quantity} onChange={e=>edit(p.id,'quantity',e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.closest('article')?.querySelector<HTMLInputElement>('[data-cost]')?.focus()}}}/></label><label className="bar-field">Custo por {p.purchaseUnit} (R$)<input data-cost aria-label={`Custo: ${p.name}`} type="text" inputMode="decimal" enterKeyHint="next" required value={row.cost} onChange={e=>edit(p.id,'cost',e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();searchInput.current?.focus()}}}/></label></div>
            {(submitted||row.quantity!==''&&row.cost!=='')&&result.error&&<p role="alert" className="bar-error">{result.error}</p>}
            <div className="purchase-line-total">Subtotal: <strong>{result.error?'A preencher':money(result.total)}</strong></div>
            <Disclosure title="Total exato do comprovante (opcional)"><label className="bar-field">Total do item (R$)<input aria-label={`Total do comprovante: ${p.name}`} type="text" inputMode="decimal" value={row.total} onChange={e=>edit(p.id,'total',e.target.value)}/></label><p>Use quando o total do comprovante tiver diferença de arredondamento. Desconto do item deve estar no custo líquido.</p></Disclosure>
          </article>})}
          {rows.length<100&&<div className="purchase-picker" data-unsaved-ignore><label className="bar-field">Buscar produto para adicionar<input ref={searchInput} type="search" value={search} placeholder="Nome ou código do produto" onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(choices.length===1)add(choices[0])}}}/></label><div className="purchase-results" aria-label="Produtos encontrados">{choices.slice(0,match?8:4).map(p=><button key={p.id} type="button" onClick={()=>add(p)}><span>{p.name}<small>{p.purchaseUnit} · {quantityText(p.conversionFactor)} {p.saleUnit}</small></span><span aria-hidden="true">+</span></button>)}</div><small>{choices.length>(match?8:4)?'Digite para encontrar entre '+choices.length+' produtos.':choices.length===0?'Nenhum produto disponível nesta busca.':choices.length===1?'Enter adiciona este produto.':''}</small></div>}
          {submitted&&!rows.length&&<p role="alert">Adicione pelo menos um produto.</p>}
        </section>
        <Disclosure title="Frete, desconto e pagamento"><div className="field-grid"><label className="bar-field">Frete (R$)<input inputMode="decimal" value={freight} onChange={e=>setFreight(e.target.value)}/></label><label className="bar-field">Desconto da compra (R$)<input inputMode="decimal" value={discount} onChange={e=>setDiscount(e.target.value)}/></label></div><label className="bar-field">Forma de pagamento da compra<select value={method} onChange={e=>setMethod(e.target.value)}><option value="Pending">A definir</option><option value="Cash">Dinheiro</option><option value="Pix">Pix</option><option value="CardManual">Cartão</option></select></label><label className="bar-field">Conta ou proprietário que pagou e referência do acerto<input maxLength={100} value={account} onChange={e=>setAccount(e.target.value)}/></label><p>Depois de salvar, abra o Financeiro da compra para registrar o pagamento ou o reembolso ao sócio.</p></Disclosure>
      </fieldset>
      {termsError&&<p role="alert" className="bar-error">{termsError}</p>}
      <footer className="purchase-footer"><div><small>{rows.length} {rows.length===1?'item':'itens'} · Subtotal {money(gross)}</small><strong>Total {valid?money(total):'a conferir'}</strong><small>Registrar não altera o estoque.</small></div><button className="primary-button" disabled={busy||supplierBusy}>{busy?'Registrando…':'Registrar compra'}</button></footer>
    </form>}
  </EditorPanel>
}
