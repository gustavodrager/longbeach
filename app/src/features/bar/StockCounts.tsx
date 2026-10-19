import { useState } from 'react'
import { ActionPanel, Disclosure, EditorPanel, RecordTable, useContextSearchParams, useUnsavedChanges } from '../../components/managementUi'
import { Empty, Field, Pagination } from '../../pages/arenaUi'
import { useAuth } from '../auth/authContext'
import { hasPermission } from '../auth/access'
import { type Product, type Balance, useBar, useBarStock, useAction, Notice, QueryNotice, StockNotice, Input, formData } from './BarCore'
import { StockPage, amount } from './StockUi'
export type StockCount = { id:string; locationId:string; initial:boolean; state:string; createdAtUtc?:string; items:{productId:string;theoretical:number;counted:number|null}[] }
export function BarCountsPage() {
  const counts=useBar<StockCount[]>('/counts');const stock=useBarStock();const catalog=useBar<Product[]>('/catalog');const balances=useBar<Balance[]>('/stock/balances');const a=useAction()
  const [params,setParams]=useContextSearchParams(); const selected=counts.data?.find(c=>c.id===params.get('registro'))
  const open=params.get('acao')==='contagem'
  const close=()=>{const next=new URLSearchParams(params);next.delete('acao');next.delete('registro');setParams(next,{replace:true,preventScrollReset:true})}
  const show=(id:string)=>{const next=new URLSearchParams(params);next.set('acao','contagem');next.set('registro',id);setParams(next,{preventScrollReset:true})}
  const identities=new Map<string,Pick<Product,'id'|'name'|'saleUnit'>>((balances.data??[]).map(b=>[b.productId,{id:b.productId,name:b.name,saleUnit:b.unit}]))
  for(const product of catalog.data??[]) identities.set(product.id,product)
  const initialUnavailable=counts.data?.some(c=>c.locationId===stock.location?.id&&c.state==='Approved')
  return <StockPage title="Inventário do Bar" description="Conte os produtos, confira as diferenças e só então aprove os ajustes.">
    <QueryNotice query={counts}/><StockNotice stock={stock}/>
    <ActionPanel title="Nova contagem" action="novo" busy={a.busy} primary><Notice action={a}/><form className="bar-form" onSubmit={async e=>{const f=formData(e);if(!stock.location)return;const result=await a.run<StockCount>('/counts',{locationId:stock.location.id,initial:f.has('initial')});if(result)show(result.id)}}>
      <StockNotice stock={stock}/><p>A contagem usa uma fotografia do saldo atual do Bar. Se houver movimentações ou reservas, será necessário refazer a contagem antes de aprovar.</p>
      {!initialUnavailable && <label><input type="checkbox" name="initial"/> Primeira contagem física do estoque</label>}
      <button disabled={a.busy||!stock.ready}>Abrir contagem</button></form></ActionPanel>
    {counts.data && <Pagination total={counts.data.length}>{(start,end)=><>{counts.data.slice(start,end).map(c=>{
      const counted=c.items.filter(i=>i.counted!==null).length;const different=c.items.filter(i=>i.counted!==null&&i.counted!==i.theoretical).length
      return <section key={c.id} className="operation-card stock-count-card"><div><h2>{c.initial?'Contagem inicial':'Inventário'} · {c.state==='Approved'?'Aprovado':c.state==='Canceled'?'Cancelado':'Em contagem'}</h2><p>{stock.query.data?.find(l=>l.id===c.locationId)?.name??'Local a consultar'}{c.createdAtUtc&&` · ${new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(c.createdAtUtc))}`}</p><p>{counted} de {c.items.length} produtos contados · {different} divergências</p></div><button onClick={()=>show(c.id)}>{c.state==='Counting'?'Continuar contagem':'Ver contagem'}</button></section>
    })}</>}</Pagination>}
    {counts.isSuccess&&!counts.data.length&&<Empty>Nenhum inventário registrado. Abra uma contagem para conferir o estoque.</Empty>}
    {open && selected && <CountPanel key={selected.id} count={selected} products={[...identities.values()]} catalogReady={catalog.isSuccess&&balances.isSuccess} onClose={close}/>}
  </StockPage>
}
function CountPanel({count,products,catalogReady,onClose}:{count:StockCount;products:Pick<Product,'id'|'name'|'saleUnit'>[];catalogReady:boolean;onClose:()=>void}) {
  const a=useAction();const {user}=useAuth();const guard=useUnsavedChanges()
  const [search,setSearch]=useState('');const [status,setStatus]=useState('pending');const [page,setPage]=useState(1);const [editing,setEditing]=useState<string|null>(null);const [value,setValue]=useState('');const [review,setReview]=useState(false);const [canceling,setCanceling]=useState(false)
  const productMap=new Map(products.map(p=>[p.id,p]));const editable=count.state==='Counting';const supervise=hasPermission(user,'bar:supervise')
  const counted=count.items.filter(i=>i.counted!==null).length;const differences=count.items.filter(i=>i.counted!==null&&i.counted!==i.theoretical)
  const sorted=[...count.items].sort((a,b)=>(productMap.get(a.productId)?.name??a.productId).localeCompare(productMap.get(b.productId)?.name??b.productId,'pt-BR'))
  const rows=sorted.filter(i=>(productMap.get(i.productId)?.name??i.productId).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))&&(!editable||status==='all'||(status==='pending'?i.counted===null:status==='counted'?i.counted!==null:i.counted!==null&&i.counted!==i.theoretical)))
  const pages=Math.max(1,Math.ceil(rows.length/10));const currentPage=Math.min(page,pages)
  const selected=count.items.find(i=>i.productId===editing);const product=selected?productMap.get(selected.productId):undefined
  const qty=Number(value);const valid=value!==''&&Number.isFinite(qty)&&qty>=0&&Math.abs(qty*1000-Math.round(qty*1000))<0.000001
  const stopEditing=()=>{guard.markSaved();setEditing(null);setValue('')}
  return <EditorPanel title={editable?'Contar estoque':'Consultar inventário'} onClose={onClose} busy={a.busy}>
    <div className="stock-count-workbench"><Notice action={a}/>
      <section className="stock-count-progress" aria-label="Progresso da contagem"><strong>{counted} de {count.items.length} contados</strong><span>{count.items.length-counted} pendentes · {differences.length} divergências</span><progress aria-label="Produtos contados" value={counted} max={Math.max(1,count.items.length)}/></section>
      {!catalogReady&&<p role="alert">Aguarde o catálogo para identificar os produtos. Se não carregar, feche e tente novamente.</p>}
      {selected && editable ? <form className="bar-form stock-count-editor" onSubmit={async e=>{e.preventDefault();if(!valid)return;const result=await a.run('/counts/'+count.id+'/items',{productId:selected.productId,quantity:qty},'PUT');if(result!==undefined)stopEditing()}}>
        <h3>{product?.name??selected.productId}</h3><p>Físico registrado na abertura: {amount(selected.theoretical)} {product?.saleUnit??'un'}</p>
        <Field label="Contagem física" type="number" min={0} step="0.001" value={value} required onChange={setValue}/>
        <p>{value!==''&&valid?`Diferença: ${qty-selected.theoretical>0?'+':''}${amount(qty-selected.theoretical)} ${product?.saleUnit??'un'}`:'Informe zero somente se o produto foi contado e não há unidades.'}</p>
        <button disabled={a.busy||!valid}>Salvar contagem</button><button type="button" className="secondary-link" disabled={a.busy} onClick={stopEditing}>Descartar edição deste item</button>
      </form> : review && editable ? <section className="stock-review" aria-label="Revisão dos ajustes"><h3>Revisar ajustes de estoque</h3><p>{differences.length} produtos terão ajuste. Salvar uma contagem não altera o estoque; aprovar aplica estas diferenças.</p>
        <RecordTable label="Ajustes propostos" columns={['Produto','Antes','Contado','Ajuste']} rows={differences.map(i=>({key:i.productId,cells:[productMap.get(i.productId)?.name??i.productId,amount(i.theoretical),amount(i.counted!),`${i.counted!-i.theoretical>0?'+':''}${amount(i.counted!-i.theoretical)} ${productMap.get(i.productId)?.saleUnit??'un'}`]}))}/>
        {!differences.length&&<p>Nenhuma diferença: o inventário será aprovado sem movimentos de ajuste.</p>}
        <form className="bar-form" onSubmit={async e=>{const f=formData(e);if(counted!==count.items.length||!count.items.length)return;const result=await a.run('/counts/'+count.id+'/approve',{reason:String(f.get('reason'))});if(result!==undefined){guard.markSaved();onClose()}}}><Input name="reason" label="Justificativa da aprovação"/><p>Se houve movimentos ou reservas desde a abertura, o sistema impedirá a aprovação e será preciso refazer a contagem.</p><button disabled={a.busy||counted!==count.items.length||!count.items.length}>Aprovar e gerar ajustes</button></form>
        <button className="secondary-link" disabled={a.busy} onClick={()=>setReview(false)}>Voltar à contagem</button>
      </section> : <>
        <div className="compact-filters" data-unsaved-ignore><Field label="Buscar na contagem" type="search" value={search} onChange={v=>{setSearch(v);setPage(1)}}/>{editable&&<Field label="Situação da contagem" value={status} onChange={v=>{setStatus(v);setPage(1)}} options={[{value:'pending',label:'Pendentes'},{value:'counted',label:'Contados'},{value:'different',label:'Divergentes'},{value:'all',label:'Todos'}]}/>}</div>
        <div className="stock-count-list">{rows.slice((currentPage-1)*10,currentPage*10).map(i=><article key={i.productId}><div><strong>{productMap.get(i.productId)?.name??i.productId}</strong><span>Registrado: {amount(i.theoretical)} {productMap.get(i.productId)?.saleUnit??'un'} · {i.counted===null?'Pendente':`Contado: ${amount(i.counted)} ${productMap.get(i.productId)?.saleUnit??'un'}`}</span>{i.counted!==null&&i.counted!==i.theoretical&&<span className="stock-alert">Diferença: {amount(i.counted-i.theoretical)}</span>}</div>{editable&&<button disabled={a.busy||!catalogReady} onClick={()=>{setEditing(i.productId);setValue(i.counted===null?'':String(i.counted))}} aria-label={`Contar ${productMap.get(i.productId)?.name??i.productId}`}>{i.counted===null?'Contar':'Revisar'}</button>}</article>)}</div>
        {!rows.length&&<p role="status">Nenhum produto nesta seleção.</p>}
        <nav className="arena-pagination" aria-label="Páginas da contagem"><button disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}>Anterior</button><span>{currentPage} de {pages} · {rows.length} produtos</span><button disabled={currentPage>=pages} onClick={()=>setPage(currentPage+1)}>Próxima</button></nav>
        {editable&&supervise&&<div className="stock-count-footer"><p>{counted<count.items.length?'Conte todos os produtos antes de revisar a aprovação.':'Contagem completa. Confira as diferenças antes de aprovar.'}</p><button className="primary-button" disabled={a.busy||!catalogReady||!count.items.length||counted!==count.items.length} onClick={()=>setReview(true)}>Revisar ajustes</button></div>}
        {editable&&<Disclosure title="Cancelar este inventário"><p>Cancelar encerra esta contagem sem aplicar ajustes. Uma nova contagem será necessária.</p>{!canceling?<button className="secondary-link" onClick={()=>setCanceling(true)}>Preparar cancelamento</button>:<form className="bar-form" onSubmit={async e=>{const f=formData(e);const result=await a.run('/counts/'+count.id+'/cancel',{reason:String(f.get('reason'))});if(result!==undefined)onClose()}}><Input name="reason" label="Motivo do cancelamento"/><button disabled={a.busy}>Confirmar cancelamento do inventário</button></form>}</Disclosure>}
      </>}
    </div>
  </EditorPanel>
}
