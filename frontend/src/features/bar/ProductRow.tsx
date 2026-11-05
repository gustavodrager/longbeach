import { FormattedInput } from '../../components/FormattedInput'
import { Link } from 'react-router-dom'
import { useUnsavedChanges } from '../../components/managementUi'
import { useEffect, useRef, useState } from 'react'
import { type Balance, type Managed, type Named, money, useAction, Notice } from './BarCore'
import './product-row.css'

export function ProductRow({item,balance,stockReady,canAdjust,canEdit=true,categories,suppliers,editing,onEdit,onClose}:{item:Managed;balance?:Balance;stockReady:boolean;canAdjust:boolean;canEdit?:boolean;categories:Named[];suppliers:Named[];editing:boolean;onEdit:()=>void;onClose:()=>void}) {
 const guard=useUnsavedChanges();const dirty=useRef(false);
 useEffect(()=>{if(!editing)return;const leave=(e:BeforeUnloadEvent)=>{if(dirty.current){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave)},[editing]);
 const p=item.product;const isEditing=editing&&canEdit;const a=useAction();const [confirmDelete,setConfirmDelete]=useState(false);const deleteButton=useRef<HTMLButtonElement>(null);const restoreDeleteFocus=useRef(false);const [draft,setDraft]=useState(()=>({...p,...item,product:undefined,availableForSale:p.availableForSale??true,name:p.name,salePrice:String(p.salePrice),averageCost:String(item.averageCost),available:String(balance?.available??0)}));
 const [initial,setInitial]=useState({item,balance});
 useEffect(()=>{if(!confirmDelete&&restoreDeleteFocus.current){deleteButton.current?.focus();restoreDeleteFocus.current=false}},[confirmDelete]);
 const id=`product-${p.id}`;const ownsStock=p.controlsStock&&!p.prepared;const [imageFailed,setImageFailed]=useState(false);
 const change=(key:string,value:unknown)=>{dirty.current=true;guard.setDirty(true);setDraft(d=>({...d,[key]:value}))};
 const begin=()=>{setConfirmDelete(false);setInitial({item,balance});setDraft({...p,...item,product:undefined,availableForSale:p.availableForSale??true,name:p.name,salePrice:String(p.salePrice),averageCost:String(item.averageCost),available:String(balance?.available??0)});onEdit()};
 const number=(value:string)=>Number(value.replace(',','.'));
 const remove=async()=>{
  if(!canEdit)return;
  const result=await a.run('/products/'+p.id+'?version='+encodeURIComponent(initial.item.product.version),undefined,'DELETE');
  if(result!==undefined){dirty.current=false;guard.markSaved();onClose()}
 };
 const input=(key:'name'|'salePrice'|'averageCost'|'available',label:string)=>key==='salePrice'||key==='averageCost'
  ?<FormattedInput format="money" decimalPlaces={key==='averageCost'?6:2} aria-label={label} form={id} required disabled={a.busy} value={draft[key]} onValueChange={value=>change(key,value)} />
  :<input aria-label={label} form={id} required disabled={a.busy} value={draft[key]} inputMode={key==='name'?undefined:'decimal'} onChange={e=>change(key,e.target.value)} pattern={key==='available'?'[0-9]+([.,][0-9]{1,3})?':undefined} />;
 return <><tr className={isEditing?'product-row product-editing':'product-row'}>
 <td data-label="Produto">{isEditing?input('name','Nome'):<div className="product-name">{p.imageUrl&&!imageFailed?<img className="product-thumbnail" src={p.imageUrl} alt="" width={44} height={44} loading="lazy" onError={()=>setImageFailed(true)}/>:<span className="product-thumbnail product-placeholder" aria-hidden="true">◇</span>}<div><strong>{p.name}</strong>{p.availableForSale===false&&<small className="product-sale-status">Fora da venda</small>}</div></div>}</td>
 <td data-label="Preço">{isEditing?input('salePrice','Preço de venda (R$)'):money(p.salePrice)}</td>
 <td data-label="Custo">{isEditing?input('averageCost','Custo unitário (R$)'):money(item.averageCost)}</td>
 <td data-label="Disponível" className="product-available">{!ownsStock?'Sem controle':isEditing&&canAdjust&&stockReady?<>{input('available','Quantidade disponível')}<small>{p.saleUnit}</small></>:stockReady?`${balance?.available??0} ${p.saleUnit}`:'Indisponível'}</td>
 <td data-label="Ação" className="product-actions-cell">{isEditing?<div className="product-inline-actions"><button className="primary-button" form={id} disabled={a.busy||confirmDelete}>{a.busy?confirmDelete?'Excluindo…':'Salvando…':'Salvar'}</button><button disabled={a.busy} onClick={()=>{dirty.current=false;guard.markSaved();onClose()}}>Cancelar</button></div>:canEdit&&<button disabled={canAdjust&&ownsStock&&!stockReady} onClick={begin}>Editar</button>}</td>
 </tr>{isEditing&&<tr className="product-inline-details"><td colSpan={5}><form id={id} onSubmit={async e=>{
 e.preventDefault();if(!canEdit||confirmDelete)return;const original=initial.item;const product={...original.product,...draft,product:undefined,categoryId:draft.categoryId||null,salePrice:number(draft.salePrice),averageCost:number(draft.averageCost),shortName:draft.shortName===original.product.name?draft.name:draft.shortName};
 const stockChanged=ownsStock&&canAdjust&&stockReady&&number(draft.available)!==(initial.balance?.available??0);
 const result=await a.run('/products/'+p.id+(canAdjust?'/stock':''),canAdjust?{product,available:stockChanged?number(draft.available):null,stockVersion:initial.balance?.version??0,operationId:crypto.randomUUID()}:product,'PUT');if(result!==undefined){dirty.current=false;onClose();}
 }}><Notice action={a}/><label><input type="checkbox" disabled={a.busy} checked={draft.availableForSale} onChange={e=>change('availableForSale',e.target.checked)}/>Disponível para venda</label>{canAdjust&&ownsStock&&<p className="arena-hint">Informe o saldo em estoque. O ajuste fica no histórico.</p>}
 <details><summary>Mais opções</summary>{p.prepared&&<Link to={`/bar/receitas/${p.id}`}>Ficha técnica e ingredientes →</Link>}<div className="field-grid">
 <label>Unidade de venda<input required disabled={a.busy||ownsStock} value={draft.saleUnit} onChange={e=>change('saleUnit',e.target.value)}/></label>
 <label>Categoria<select disabled={a.busy} value={draft.categoryId} onChange={e=>change('categoryId',e.target.value)}><option value="">Sem categoria</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label>Fornecedor<select disabled={a.busy} value={draft.mainSupplierId??''} onChange={e=>change('mainSupplierId',e.target.value||null)}><option value="">A definir</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 {(['shortName','barcode','imageUrl','purchaseUnit'] as const).map((key,i)=><label key={key}>{['Nome no PDV','Código de barras','Imagem — URL HTTPS','Unidade de compra'][i]}<input disabled={a.busy} value={draft[key]??''} onChange={e=>change(key,e.target.value)}/></label>)}
 {(['conversionFactor','minimumStock','displayOrder'] as const).map((key,i)=><label key={key}>{['Unidades por caixa/embalagem','Estoque mínimo','Ordem no PDV'][i]}<input required disabled={a.busy} type="number" min={key==='conversionFactor'?0.001:0} step={key==='displayOrder'?1:0.001} value={draft[key]} onChange={e=>change(key,Number(e.target.value))}/></label>)}
 <label><input type="checkbox" disabled={a.busy} checked={draft.controlsStock} onChange={e=>change('controlsStock',e.target.checked)}/>Controla estoque</label>
 <label><input type="checkbox" disabled={a.busy} checked={draft.prepared??false} onChange={e=>change('prepared',e.target.checked)}/>Precisa preparar</label>
 <label><input type="checkbox" disabled={a.busy} checked={draft.favorite} onChange={e=>change('favorite',e.target.checked)}/>Favorito</label>
 </div></details>{canEdit&&<div className="product-delete-actions">{confirmDelete?<section aria-label="Confirmar exclusão do produto"><p>Excluir {initial.item.product.name}? Histórico preservado.</p><div className="product-inline-actions"><button type="button" autoFocus disabled={a.busy} className="product-delete-button" onClick={()=>void remove()}>Confirmar exclusão</button><button type="button" disabled={a.busy} onClick={()=>{restoreDeleteFocus.current=true;setConfirmDelete(false)}}>Manter produto</button></div></section>:<button ref={deleteButton} type="button" className="product-delete-button" disabled={a.busy||!Number.isSafeInteger(initial.item.product.version)} onClick={()=>setConfirmDelete(true)}>Excluir produto</button>}</div>}</form></td></tr>}</>
}
