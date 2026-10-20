import { amount, StockPage, StockActions } from './StockUi'
import { useState } from 'react'
import { useAuth } from '../auth/authContext'
import { hasPermission } from '../auth/access'
import { StockAvailableEditor } from './StockAvailableEditor'
import { Link } from 'react-router-dom'
import { ActionPanel, Disclosure, RecordTable, SectionTabs, useSection, useContextSearchParams } from '../../components/managementUi'
import { Empty, Field, Pagination, Search, useFilters, validDate } from '../../pages/arenaUi'
import { label, type Balance, useBar, useAction, Notice, QueryNotice, useBarStock, StockNotice } from './BarCore'
import './stock-workflow.css'
export { BarCountsPage } from './StockCounts'
type Movement = { id: string; name: string; unit: string; locationName: string; quantity: number; before: number; after: number; kind: string; reason: string; createdAtUtc: string; originId: string; actorId?: string; actorName?: string }
type History = { items: Movement[]; total: number; page: number; pageSize: number }
const movementKinds = ['PurchaseReceived','InitialCount','InventoryAdjustment','Loss','InternalConsumption','Sale','TabDelivery','TabReturn','TransferIn','TransferOut','Courtesy','SaleReturn']
export function BarStockPage() {
  const {user}=useAuth();const [editing,setEditing]=useState<Balance|null>(null);
  const filters = useFilters(); const [section, setSection] = useSection(['saldos','movimentos'])
  const stock = useBarStock(); const balances = useBar<Balance[]>('/stock/balances')
  const all = (balances.data ?? []).filter(r => r.locationId === stock.location?.id)
  const search = filters.query.toLocaleLowerCase('pt-BR')
  const status = filters.params.get('low') === '1' ? 'low' : filters.status
  const rows = all.filter(r => r.name.toLocaleLowerCase('pt-BR').includes(search) && (!status || (status === 'low' ? r.low : status === 'empty' ? r.alertEligible && r.available <= 0 : status === 'minimum' ? r.alertEligible && r.available > 0 && r.available <= r.minimumStock : r.available > 0))).sort((a,b) => a.name.localeCompare(b.name,'pt-BR'))
  const previous = stock.ready ? (balances.data ?? []).filter(r => r.locationId !== stock.location?.id && (r.quantity !== 0 || r.reserved !== 0)) : []
  const from = filters.params.get('de') ?? ''; const to = filters.params.get('ate') ?? ''
  const datesValid = (!from || validDate(from)) && (!to || validDate(to)) && (!from || !to || from <= to)
  const location = filters.params.get('historicoLocal') ?? stock.location?.id ?? ''
  const query = new URLSearchParams({ page: filters.params.get('page') ?? '1' })
  if (location !== 'all' && location) query.set('locationId',location)
  if (search) query.set('search',filters.query)
  if (from) query.set('from',from); if (to) query.set('to',to)
  if (filters.params.get('tipo')) query.set('kind',filters.params.get('tipo')!)
  const history = useBar<History>('/stock/movement-history?'+query, section === 'movimentos' && stock.ready && datesValid)
  const [,setParams] = useContextSearchParams()
  const changeStatus = (value: string) => { const next = new URLSearchParams(filters.params); next.delete('low'); next.delete('page'); value ? next.set('status',value) : next.delete('status'); setParams(next,{preventScrollReset:true}) }
  return <StockPage title="Estoque do Bar" description="Confira o que está disponível e ajuste a quantidade quando necessário.">
    <StockActions/><StockNotice stock={stock}/><QueryNotice query={balances}/>
    {stock.ready && balances.isSuccess && <div className="stock-overview" aria-label="Situação do estoque">
      <span><strong>{all.filter(r=>r.available>0).length}</strong> Com saldo disponível</span>
      <span><strong>{all.filter(r=>r.low).length}</strong> No mínimo ou abaixo</span>
      <span><strong>{all.filter(r=>r.alertEligible&&r.available<=0).length}</strong> Esgotados</span>
    </div>}
    <SectionTabs value={section} onChange={setSection} items={[{value:'saldos',label:'Saldos'},{value:'movimentos',label:'Movimentações'}]}/>
    <div className="compact-filters"><Search filters={filters} placeholder="Buscar produto…"/>
      {section === 'saldos' && <Field label="Disponibilidade" value={status} onChange={changeStatus} options={[{value:'',label:'Todos os produtos'},{value:'low',label:'No mínimo ou abaixo'},{value:'empty',label:'Esgotados'},{value:'minimum',label:'Com saldo no mínimo ou abaixo'},{value:'available',label:'Com saldo disponível'}]}/>}
    </div>
    {section === 'saldos' ? <>
      <p className="arena-hint">{rows.length} produtos nesta seleção</p>
      {stock.ready && rows.length > 0 && <Pagination total={rows.length}>{(start,end)=><div className="stock-balances"><RecordTable label="Saldos do estoque" columns={['Produto','Disponível']} rows={rows.slice(start,end).map(r=>({key:r.productId,cells:[<><strong>{r.name}</strong><small>{r.unit || 'un'} · mínimo {amount(r.minimumStock ?? 0)}{r.low ? ` · ${r.available <= 0 ? 'Esgotado' : 'Repor'}` : ''}</small></>,<div className="stock-available"><strong className={r.low?'stock-alert':''}>{r.controlsStock===false?'Sem controle':`${amount(r.available)} ${r.unit||'un'}`}</strong>{hasPermission(user,'bar:supervise')&&r.active&&r.controlsStock&&r.alertEligible&&<button onClick={()=>setEditing({...r})} aria-label={`Editar quantidade de ${r.name}`}>Editar</button>}</div>]}))}/></div>}</Pagination>}
      {!rows.length && stock.ready && balances.isSuccess && <Empty>Nenhum produto nesta seleção. Ajuste os filtros para consultar outros saldos.</Empty>}
      <p className="arena-hint">Disponível é o que pode ser vendido agora. Cada correção fica registrada no histórico.</p>
      {previous.length>0 && <Disclosure title="Saldos anteriores para conferência"><p>Estes locais não são usados pelo atendimento do Bar.</p><Pagination total={previous.length}>{(start,end)=><RecordTable label="Saldos anteriores" columns={['Produto','Disponível']} rows={previous.slice(start,end).map(r=>({key:r.productId+r.locationId,cells:[<>{r.name}<small>{stock.query.data?.find(l=>l.id===r.locationId)?.name ?? 'Cadastro anterior'}</small></>,amount(r.available)]}))}/>}</Pagination></Disclosure>}
    </> : <>
      <div className="compact-filters stock-history-filters">
        <Field label="Local do histórico" value={location} onChange={v=>filters.set('historicoLocal',v)} options={[...(stock.query.data??[]).map(l=>({value:l.id,label:l.name})),{value:'all',label:'Todos os locais'}]}/>
        <Field label="Tipo" value={filters.params.get('tipo')??''} onChange={v=>filters.set('tipo',v)} options={[{value:'',label:'Todos'},...movementKinds.map(k=>({value:k,label:label(k)}))]}/>
        <Field label="De" type="date" value={from} onChange={v=>filters.set('de',v)}/><Field label="Até" type="date" value={to} onChange={v=>filters.set('ate',v)}/>
      </div>
      <p className="arena-hint">Horário de Brasília · datas incluídas · {location==='all'?'Todos os locais':stock.query.data?.find(l=>l.id===location)?.name}. O histórico mostra o saldo registrado antes e depois de cada movimento.</p>
      {!datesValid ? <p role="alert">Confira as datas: o fim deve ser igual ou posterior ao início.</p> : <><QueryNotice query={history}/>{history.data && <>
        <p className="arena-hint">{history.data.total} movimentações nesta seleção</p>
        <div className="stock-movements"><RecordTable label="Movimentações do estoque" columns={['Produto','Data e local','Movimento','Saldo registrado','Motivo']} rows={history.data.items.map(r=>({key:r.id,cells:[<strong>{r.name}</strong>,<>{new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(r.createdAtUtc))}<small>{r.locationName}</small></>,<>{label(r.kind)}<small>{r.quantity>0?'+':''}{amount(r.quantity)} {r.unit}</small></>,`${amount(r.before)} → ${amount(r.after)} ${r.unit}`,<details><summary>Ver motivo e origem</summary><p>{r.reason}</p><p>Responsável: {r.actorName || r.actorId || 'Não informado no registro histórico'}</p><small>Referência: {r.originId}</small></details>]}))}/></div>
        {!history.data.items.length && <Empty>Nenhuma movimentação nesta seleção.</Empty>}
        <nav className="arena-pagination" aria-label="Páginas das movimentações"><button disabled={history.isFetching||history.data.page<=1} onClick={()=>filters.set('page',String(history.data!.page-1))}>Anterior</button><span>Página {history.data.page} de {Math.max(1,Math.ceil(history.data.total/20))}</span><button disabled={history.isFetching||history.data.page*20>=history.data.total} onClick={()=>filters.set('page',String(history.data!.page+1))}>Próxima</button></nav>
      </>}</>}
    </>}
    {editing&&<StockAvailableEditor balance={editing} onClose={()=>setEditing(null)}/>}
  </StockPage>
}

export function BarLossesPage() {
  const stock=useBarStock(); const balances=useBar<Balance[]>('/stock/balances'); const a=useAction()
  return <StockPage title="Perdas e consumo interno" description="Confira o produto e o saldo antes de registrar a saída."><Notice action={a}/><Link className="secondary-link" to="/bar/estoque?secao=movimentos">Ver movimentações →</Link>
    <ActionPanel title="Registrar saída" action="novo" busy={a.busy} primary closeLabel="Fechar"><Notice action={a}/><StockNotice stock={stock}/><QueryNotice query={balances}/><StockOutputForm balances={(balances.data??[]).filter(r=>r.locationId===stock.location?.id && r.active && r.controlsStock)} ready={stock.ready && balances.isSuccess} locationId={stock.location?.id} action={a}/></ActionPanel>
  </StockPage>
}
function StockOutputForm({balances,ready,locationId,action:a}:{balances:Balance[];ready:boolean;locationId?:string;action:ReturnType<typeof useAction>}) {
  const [search,setSearch]=useState(''); const [productId,setProductId]=useState(''); const [kind,setKind]=useState('losses'); const [quantity,setQuantity]=useState(''); const [reason,setReason]=useState(''); const [review,setReview]=useState(false); const [done,setDone]=useState(false)
  const product=balances.find(r=>r.productId===productId); const qty=Number(quantity)
  const valid=ready && !!product && quantity!=='' && Number.isFinite(qty) && qty>0 && qty<=product.available && Math.abs(qty*1000-Math.round(qty*1000))<0.000001 && reason.trim().length>0 && reason.length<=500
  if(done)return <p role="status">Saída registrada. O saldo foi atualizado.</p>
  return <form className="bar-form stock-output" onSubmit={async e=>{e.preventDefault();if(!valid||!locationId)return;if(!review){setReview(true);return} const result=await a.run('/stock/'+kind,{productId,locationId,quantity:qty,reason:reason.trim(),operationId:crypto.randomUUID()});if(result!==undefined)setDone(true)}}>
    {!review ? <>
      <Field label="Tipo de saída" value={kind} onChange={setKind} options={[{value:'losses',label:'Perda'},{value:'internal-consumption',label:'Consumo interno (sem receita)'}]}/>
      <label data-unsaved-ignore>Buscar produto<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome do produto…"/></label>
      <Field label="Produto" value={productId} onChange={v=>{setProductId(v);setQuantity('')}} options={[{value:'',label:'Selecione'},...balances.filter(r=>r.productId===productId||r.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map(r=>({value:r.productId,label:`${r.name} · ${amount(r.available)} ${r.unit}`}))]}/>
      {product && <p className="stock-context">Estoque: <strong>Bar</strong> · Disponível: <strong>{amount(product.available)} {product.unit}</strong></p>}
      <Field label="Quantidade" type="number" min={0.001} max={product?.available} step="0.001" required value={quantity} onChange={setQuantity}/>
      <Field label="Motivo e responsável pelo consumo" required value={reason} onChange={setReason}/>
      {product && quantity && <p className="stock-context">Após a saída: <strong>{amount(product.available-qty)} {product.unit}</strong> disponíveis.</p>}
      {product && qty>product.available && <p role="alert">A quantidade supera o saldo disponível.</p>}
      <button disabled={a.busy||!valid}>Conferir saída</button>
    </> : <section className="stock-review" aria-label="Conferir saída"><h3>Conferir saída</h3><p>{kind==='losses'?'Perda':'Consumo interno'} · {product?.name}</p><p><strong>{amount(qty)} {product?.unit}</strong> saem do Bar.</p><p>Disponível: {amount(product?.available??0)} → {amount((product?.available??0)-qty)} {product?.unit}</p><p>{reason}</p><p>Ao confirmar, o estoque será reduzido. Não há receita de venda.</p><button disabled={a.busy||!valid}>{a.busy?'Registrando…':'Registrar saída'}</button><button type="button" className="secondary-link" disabled={a.busy} onClick={()=>setReview(false)}>Voltar e corrigir</button></section>}
  </form>
}
