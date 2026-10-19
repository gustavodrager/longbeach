import { useRef, useState } from 'react'
import { ActionPanel, Disclosure, EditorPanel, RecordTable, useContextSearchParams, useUnsavedChanges } from '../../components/managementUi'
import { Empty, Field, Pagination } from '../../pages/arenaUi'
import { useAuth } from '../auth/authContext'
import { hasPermission } from '../auth/access'
import { type Product, type Balance, useBar, useBarStock, useAction, Notice, QueryNotice, StockNotice, Input, formData } from './BarCore'
import { StockPage, amount } from './StockUi'
import { countQuantity, useQuickCount } from './useQuickCount'
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
      const counted=c.items.filter(i=>i.counted!==null).length;const different=c.items.filter(i=>c.state==='Counting'?(i.counted??0)!==i.theoretical:i.counted!==null&&i.counted!==i.theoretical).length
      return <section key={c.id} className="operation-card stock-count-card"><div><h2>{c.initial?'Contagem inicial':'Inventário'} · {c.state==='Approved'?'Aprovado':c.state==='Canceled'?'Cancelado':'Em contagem'}</h2><p>{stock.query.data?.find(l=>l.id===c.locationId)?.name??'Local a consultar'}{c.createdAtUtc&&` · ${new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(c.createdAtUtc))}`}</p><p>{counted} de {c.items.length} produtos contados · {different} divergências</p></div><button onClick={()=>show(c.id)}>{c.state==='Counting'?'Continuar contagem':'Ver contagem'}</button></section>
    })}</>}</Pagination>}
    {counts.isSuccess&&!counts.data.length&&<Empty>Nenhum inventário registrado. Abra uma contagem para conferir o estoque.</Empty>}
    {open && selected && <CountPanel key={selected.id} count={selected} products={[...identities.values()]} catalogReady={catalog.isSuccess&&balances.isSuccess} onClose={close}/>}
  </StockPage>
}
function CountPanel({count,products,catalogReady,onClose}:{count:StockCount;products:Pick<Product,'id'|'name'|'saleUnit'>[];catalogReady:boolean;onClose:()=>void}) {
  const a=useAction();const {user}=useAuth();const guard=useUnsavedChanges()
  const [search,setSearch]=useState('');const [status,setStatus]=useState('all');const [review,setReview]=useState(false);const [canceling,setCanceling]=useState(false)
  const quick=useQuickCount(count)
  const initiallyPending=useRef(new Set(count.items.filter(i=>i.counted===null).map(i=>i.productId)))
  const [filterIds,setFilterIds]=useState<Set<string>|null>(null)
  const inputs=useRef(new Map<string,HTMLInputElement>())
  const productMap=new Map(products.map(p=>[p.id,p]));const editable=count.state==='Counting';const supervise=hasPermission(user,'bar:supervise')
  const counted=count.items.filter(i=>i.counted!==null).length;const differences=count.items.filter(i=>i.counted===null?editable&&i.theoretical!==0:i.counted!==i.theoretical)
  const sorted=[...count.items].sort((a,b)=>Number(initiallyPending.current.has(b.productId))-Number(initiallyPending.current.has(a.productId))||(productMap.get(a.productId)?.name??a.productId).localeCompare(productMap.get(b.productId)?.name??b.productId,'pt-BR'))
  const rows=sorted.filter(i=>(productMap.get(i.productId)?.name??i.productId).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))&&(!filterIds||filterIds.has(i.productId)))
  const filter=(next:string)=>{setStatus(next);setFilterIds(next==='all'?null:new Set(count.items.filter(i=>next==='pending'?i.counted===null:(i.counted??0)!==i.theoretical).map(i=>i.productId)))}
  return <EditorPanel title={editable?'Contar estoque':'Consultar inventário'} onClose={onClose} busy={a.busy||quick.busy} hasUnsavedChanges={!review&&!canceling?quick.dirty:undefined} className="stock-quick-panel">
    <div className="stock-count-workbench"><Notice action={a}/>
      <section className="stock-count-progress" aria-label="Progresso da contagem"><strong>{counted} de {count.items.length} contados</strong><span>{count.items.length-counted} em branco · {differences.length} divergências</span><progress aria-label="Produtos contados" value={counted} max={Math.max(1,count.items.length)}/></section>
      {!catalogReady&&<p role="alert">Aguarde o catálogo para identificar os produtos. Se não carregar, feche e tente novamente.</p>}
      {review && editable ? <section className="stock-review" aria-label="Revisão dos ajustes"><h3>Revisar ajustes de estoque</h3>{counted<count.items.length&&<p className="stock-alert">{count.items.length-counted} produtos sem quantidade serão considerados zero ao encerrar, inclusive os ocultos pela busca ou filtros.</p>}<p>{differences.length} produtos terão ajuste. Salvar uma contagem não altera o estoque; aprovar aplica estas diferenças.</p>
        <RecordTable label="Ajustes propostos" columns={['Produto','Antes','Contado','Ajuste']} rows={differences.map(i=>({key:i.productId,cells:[productMap.get(i.productId)?.name??i.productId,amount(i.theoretical),i.counted===null?'0 (em branco)':amount(i.counted),`${(i.counted??0)-i.theoretical>0?'+':''}${amount((i.counted??0)-i.theoretical)} ${productMap.get(i.productId)?.saleUnit??'un'}`]}))}/>
        {!differences.length&&<p>Nenhuma diferença: o inventário será aprovado sem movimentos de ajuste.</p>}
        <form className="bar-form" onSubmit={async e=>{const f=formData(e);if(quick.busy||quick.dirty||!count.items.length)return;const result=await a.run('/counts/'+count.id+'/approve',{reason:String(f.get('reason')),zeroUncounted:true});if(result!==undefined){guard.markSaved();onClose()}}}><Input name="reason" label="Justificativa da aprovação"/><p>Se houve movimentos ou reservas desde a abertura, o sistema impedirá a aprovação e será preciso refazer a contagem.</p><button disabled={a.busy||quick.busy||quick.dirty||!count.items.length}>Aprovar e gerar ajustes</button></form>
        <button className="secondary-link" disabled={a.busy} onClick={()=>setReview(false)}>Voltar à contagem</button>
      </section> : <>
        <div className="stock-quick-filters" data-unsaved-ignore>
          <Field label="Buscar na contagem" type="search" value={search} onChange={setSearch}/>
          {editable&&<div className="stock-quick-tabs" role="group" aria-label="Situação da contagem">{[{id:'all',label:'Todos'},{id:'pending',label:'Em branco'},{id:'different',label:'Divergentes'}].map(item=><button type="button" key={item.id} aria-pressed={status===item.id} onClick={()=>filter(item.id)}>{item.label}</button>)}</div>}
        </div>
        {editable&&<p className="stock-quick-hint">Preencha somente as quantidades encontradas. Campos em branco valem zero ao encerrar. Enter avança.</p>}
        <div className="stock-count-list stock-quick-list" data-unsaved-ignore>{rows.map((i,index)=>{
          const product=productMap.get(i.productId);const name=product?.name??i.productId;const unit=product?.saleUnit??'un';const entry=quick.entries[i.productId]
          const quantity=countQuantity(entry.value);const delta=quantity===null?null:quantity-i.theoretical
          return <article key={i.productId} aria-label={name}>
            <div className="stock-quick-product"><strong>{name}</strong><span>Registrado: {amount(i.theoretical)} {unit}</span>{!editable&&<span>Contado: {i.counted===null?'Pendente':`${amount(i.counted)} ${unit}`}</span>}</div>
            {editable&&<><div className="stock-quick-value"><label htmlFor={`count-${i.productId}`}>Contado · {unit}</label><input id={`count-${i.productId}`} ref={node=>{if(node)inputs.current.set(i.productId,node);else inputs.current.delete(i.productId)}} aria-label={`Contado: ${name}`} aria-describedby={`count-state-${i.productId}`} aria-invalid={entry.status==='error'} type="text" inputMode="decimal" enterKeyHint="next" autoComplete="off" placeholder="0" value={entry.value} disabled={!catalogReady||a.busy} onChange={e=>quick.change(i.productId,e.target.value)} onBlur={()=>quick.save(i.productId)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(quick.save(i.productId)){const next=inputs.current.get(rows[index+1]?.productId);next?.focus();next?.scrollIntoView?.({block:'nearest'})}}}}/>
              <span>{delta===null?'Não contado':`Diferença: ${delta>0?'+':''}${amount(delta)} ${unit}`}</span>
            </div><div className="stock-quick-shortcuts">{i.theoretical!==0&&<button type="button" disabled={!catalogReady||a.busy} onClick={()=>quick.shortcut(i.productId,i.theoretical)}>Igual ao registrado</button>}<button type="button" disabled={!catalogReady||a.busy} onClick={()=>quick.shortcut(i.productId,0)}>Zerar</button></div>
            <div className="stock-quick-state" id={`count-state-${i.productId}`} role={entry.status==='error'?'alert':'status'}>{entry.status==='error'?<>{entry.error} <button type="button" onClick={()=>quick.save(i.productId)}>Tentar novamente</button></>:entry.status==='saving'?'Salvando…':entry.status==='saved'?'✓ Salvo':entry.status==='edited'?'Não salvo':'Zero ao encerrar'}</div></>}
          </article>
        })}</div>
        {!rows.length&&<p role="status">Nenhum produto nesta seleção.</p>}
        {editable&&supervise&&<div className="stock-count-footer"><p>{quick.busy?'Salvando contagens…':quick.dirty?'Há quantidades não salvas.':counted<count.items.length?`${count.items.length-counted} em branco serão zero`:'Contagem completa. Confira os ajustes.'}</p><button className="primary-button" disabled={a.busy||quick.busy||quick.dirty||!catalogReady||!count.items.length} onClick={()=>setReview(true)}>Revisar ajustes</button></div>}
        {editable&&<Disclosure title="Cancelar este inventário"><p>Cancelar encerra esta contagem sem aplicar ajustes. Uma nova contagem será necessária.</p>{!canceling?<button disabled={quick.busy||quick.dirty} className="secondary-link" onClick={()=>setCanceling(true)}>Preparar cancelamento</button>:<form className="bar-form" onSubmit={async e=>{const f=formData(e);const result=await a.run('/counts/'+count.id+'/cancel',{reason:String(f.get('reason'))});if(result!==undefined)onClose()}}><Input name="reason" label="Motivo do cancelamento"/><button disabled={a.busy}>Confirmar cancelamento do inventário</button></form>}</Disclosure>}
      </>}
    </div>
  </EditorPanel>
}
