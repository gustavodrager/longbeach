import { testWebLocks } from '../../test/webLocks'
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import { DirectTabSale } from './DirectTabSale'
import { directSalesKey, useDirectSales } from './useDirectSales'
import type { Tab } from './api'

const now = '2026-11-17T10:00:00Z'
const base = (): Tab => ({ id:'tab-direct',version:1,number:42,name:'Visitante teste',state:'Open',mode:'Tab',locationId:'bar',actorId:'operator',total:0,due:0,payable:0,paid:0,pending:0,createdAtUtc:now,items:[],payments:[],history:[],allowedActions:[] })
const product = {id:'water',name:'Água',shortName:'Água',categoryId:'drink',categoryName:'Bebidas',salePrice:5,favorite:true,displayOrder:1,available:20,prepared:false}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json'}})
const key = directSalesKey('operator','tab-direct');const clients:QueryClient[]=[]
const auth:AuthContextValue={user:{id:'operator',name:'Teste',email:'test@example.invalid',roles:['Operations'],permissions:['bar:sales:operate','bar:sales:read']},isBootstrapping:false,signIn:async()=>{},signInWithGoogle:async()=>{},signOut:async()=>{},changePassword:async()=>{},completeFirstAccessWithGoogle:async()=>{}}
function mount(context = auth, strict = false){const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});clients.push(client);const tree=<QueryClientProvider client={client}><AuthContext.Provider value={context}><MemoryRouter><Routes><Route path="*" element={<DirectTabSale tabId="tab-direct"/>}/></Routes></MemoryRouter></AuthContext.Provider></QueryClientProvider>;return render(strict?<StrictMode>{tree}</StrictMode>:tree)}
function server(post?: (body: Record<string,unknown>, commit: ()=>Response) => Promise<Response>|Response){
 let tab=base()
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  const path=String(input)
  if(init?.method==='POST'){
   const body=JSON.parse(String(init.body));const commit=()=>{
    if(path.endsWith('/reverse') || path.endsWith('/remove-unit')) {
     if(tab.history.some(row=>row.id===body.operationId)) return json(tab)
     const itemId=path.split('/').at(-2);const item=tab.items.find(row=>row.id===itemId&&row.state==='Fulfilled')
     if(!item||tab.state!=='Open'||tab.total-5<tab.paid+tab.pending)return json({detail:'Retirada não permitida.'},400)
     tab={...tab,version:tab.version!+1,total:tab.total-5,due:tab.due-5,payable:tab.payable-5,items:tab.items.map(row=>row.id===itemId?{...row,state:'Reversed'}:row),history:[...tab.history,{id:body.operationId,kind:'Reversed',amount:-5,createdAtUtc:now}]};return json(tab)
    }
if(!tab.history.some(row=>row.id===body.operationId)) tab={...tab,version:tab.version!+1,total:tab.total+5,due:tab.due+5,payable:tab.payable+5,items:[...tab.items,{id:body.operationId,tabId:tab.id,productId:'water',name:'Água',quantity:1,unitPrice:5,total:5,state:'Fulfilled',source:'Attendant',createdAtUtc:now,allowedActions:[]}],history:[...tab.history,{id:body.operationId,kind:'Fulfilled',amount:5,createdAtUtc:now}]};return json(tab)}
   return post?post(body,commit):commit()
  }
  if(path.includes('/catalog'))return json([product])
  if(path.endsWith('/tabs/tab-direct'))return json(tab)
  if(path.includes('/tabs?'))return json({items:[],total:0})
  throw new Error('Unexpected '+path)
 })
 return {fetch,get tab(){return tab},close(){tab={...tab,state:'Closed'}},clientState(value:Partial<Tab>){tab={...tab,...value}}}
}
beforeEach(()=>{Object.defineProperty(navigator,'locks',{configurable:true,value:testWebLocks()});localStorage.clear();sessionStorage.clear();Object.defineProperty(navigator,'onLine',{configurable:true,value:true})})
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear())})
async function addButton(){const button=await screen.findByRole('button',{name:/Adicionar Água por/});await waitFor(()=>expect(button).toBeEnabled());return button}
const posts=(fetch:ReturnType<typeof server>['fetch']):Record<string,unknown>[]=>fetch.mock.calls.filter(([,init])=>(init as RequestInit)?.method==='POST').map(([,init])=>JSON.parse(String((init as RequestInit).body)))

it('one tap sends immediately, shows the committed quantity and keeps the catalog without confirmation',async()=>{
 const api=server();mount();fireEvent.click(await addButton())
 await screen.findByText('Água adicionado à comanda.');expect(api.tab.total).toBe(5)
 expect(posts(api.fetch)).toMatchObject([{items:[{productId:'water',quantity:1}],deliver:true,directSale:true,expectedUnitPrice:5}])
 expect(screen.getByRole('button',{name:/Adicionar Água por/})).toBeEnabled()
 expect(screen.queryByRole('button',{name:/Salvar|Conferir|Lançar e entregar/})).not.toBeInTheDocument()
 expect(screen.getByRole('link',{name:/Receber/})).toBeInTheDocument()
})
it('rapid taps are durable and sent serially with different UUIDs without losing a unit',async()=>{
 let first:()=>void=()=>{};let calls=0
 const api=server((_body,commit)=>++calls===1?new Promise(resolve=>{first=()=>resolve(commit())}):commit());mount()
 const button=await addButton();act(()=>{fireEvent.click(button);fireEvent.click(button);fireEvent.click(button)})
 await waitFor(()=>expect(JSON.parse(localStorage.getItem(key)!).entries).toHaveLength(3))
 expect(posts(api.fetch)).toHaveLength(1);expect(screen.queryByRole('link',{name:/Receber/})).not.toBeInTheDocument()
 await act(async()=>first());await waitFor(()=>expect(api.tab.total).toBe(15));await waitFor(()=>expect(JSON.parse(localStorage.getItem(key)!).entries).toHaveLength(0))
 expect(new Set(posts(api.fetch).map(row=>row.operationId)).size).toBe(3);expect(await screen.findByText('3 × Água')).toBeInTheDocument()
})
it('lost response pauses the queue and resumes the exact UUID after reload without a duplicate',async()=>{
 let calls=0;const api=server((_body,commit)=>{const result=commit();return ++calls===1?json({detail:'Resposta perdida'},503):result})
 let view=mount();fireEvent.click(await addButton());await screen.findByText('Resposta perdida');expect(api.tab.total).toBe(5);expect(screen.queryByText(/ainda não está incluído/)).not.toBeInTheDocument()
 expect(await addDisabled()).toBeDisabled();view.unmount();view=mount()
 const resume=await screen.findByRole('button',{name:'Retomar registros'});await waitFor(()=>expect(resume).toBeEnabled());fireEvent.click(resume)
 await waitFor(()=>expect(JSON.parse(localStorage.getItem(key)!).entries).toHaveLength(0));expect(api.tab.total).toBe(5)
 const writes=posts(api.fetch);expect(writes).toHaveLength(2);expect(writes[1]).toEqual(writes[0]);view.unmount()
})
async function addDisabled(){return screen.findByRole('button',{name:/Adicionar Água por/})}
it('a definite refusal can be removed, but an uncertain committed request cannot',async()=>{
 server(()=>json({detail:'O preço mudou.'},400));mount();fireEvent.click(await addButton());await screen.findByText('O preço mudou.')
 fireEvent.click(screen.getByRole('button',{name:'Remover Água não registrado'}));await waitFor(()=>expect(JSON.parse(localStorage.getItem(key)!).entries).toHaveLength(0));expect(await addButton()).toBeEnabled()
})
it('offline taps are blocked and the existing request resumes after reconnecting',async()=>{
 const api=server();Object.defineProperty(navigator,'onLine',{configurable:true,value:false});mount()
 expect(await addDisabled()).toBeDisabled();expect(posts(api.fetch)).toHaveLength(0)
 Object.defineProperty(navigator,'onLine',{configurable:true,value:true});act(()=>window.dispatchEvent(new Event('online')))
 fireEvent.click(await addButton());await waitFor(()=>expect(api.tab.total).toBe(5))
})
it('storage failure sends no request and displays an actionable error',async()=>{
 const api=server();mount();const button=await addButton();vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('QuotaExceeded')});fireEvent.click(button)
 await screen.findByRole('alert');expect(posts(api.fetch)).toHaveLength(0);expect(button).toBeDisabled()
})
it('an interrupted mount leaves the in-flight UUID for recovery and sends no further taps',async()=>{
 let complete:()=>void=()=>{};const api=server((_body,commit)=>new Promise(resolve=>{complete=()=>resolve(commit())}));const view=mount();const b=await addButton();act(()=>{fireEvent.click(b);fireEvent.click(b)})
 await waitFor(()=>expect(posts(api.fetch)).toHaveLength(1));view.unmount();await act(async()=>complete())
 expect(posts(api.fetch)).toHaveLength(1);expect(JSON.parse(localStorage.getItem(key)!).entries).toHaveLength(2)
})
it('malformed storage is preserved and blocks operation',async()=>{
 localStorage.setItem(key,'broken');const api=server();mount();await screen.findByRole('alert');expect(await addDisabled()).toBeDisabled();expect(localStorage.getItem(key)).toBe('broken');expect(posts(api.fetch)).toHaveLength(0)
})
it('lack of Web Locks blocks registration instead of weakening queue protection',async()=>{
 Object.defineProperty(navigator,'locks',{configurable:true,value:undefined});const api=server();mount();await screen.findByRole('alert');expect(await addDisabled()).toBeDisabled();expect(posts(api.fetch)).toHaveLength(0)
})
it('two simultaneous views merge their durable taps and serialize sends without duplicates',async()=>{
 const api=server();mount();mount();await waitFor(()=>expect(screen.getAllByRole('button',{name:/Adicionar Água por/})).toHaveLength(2));const buttons=screen.getAllByRole('button',{name:/Adicionar Água por/})
 await waitFor(()=>buttons.forEach(button=>expect(button).toBeEnabled()))
 act(()=>{fireEvent.click(buttons[0]);fireEvent.click(buttons[1]);fireEvent.click(buttons[0])})
 await waitFor(()=>expect(api.tab.total).toBe(15));await waitFor(()=>expect(JSON.parse(localStorage.getItem(key)!).entries).toHaveLength(0))
 expect(posts(api.fetch)).toHaveLength(3);expect(new Set(posts(api.fetch).map(row=>row.operationId)).size).toBe(3);await waitFor(()=>expect(screen.getAllByText('3 × Água')).toHaveLength(2))
})
it('removing an unsent tail never implicitly retries an uncertain head',async()=>{
 let fail:(response:Response)=>void=()=>{};const api=server(()=>new Promise(resolve=>{fail=resolve}));mount();const b=await addButton()
 act(()=>{fireEvent.click(b);fireEvent.click(b)});await waitFor(()=>expect(JSON.parse(localStorage.getItem(key)!).entries).toHaveLength(2))
 await act(async()=>fail(json({detail:'Confirmação indisponível'},503)));await screen.findByText('Confirmação indisponível')
 expect(screen.getAllByRole('button',{name:'Remover Água não registrado'})).toHaveLength(1)
 fireEvent.click(screen.getByRole('button',{name:'Remover Água não registrado'}))
 await waitFor(()=>expect(JSON.parse(localStorage.getItem(key)!).entries).toHaveLength(1));expect(JSON.parse(localStorage.getItem(key)!).paused).toBe(true);expect(posts(api.fetch)).toHaveLength(1)
 expect(screen.queryByRole('button',{name:'Remover Água não registrado'})).not.toBeInTheDocument()
})
it('a tab closed by another operator blocks new taps and preserves unsent entries for removal',async()=>{
 const api=server();api.close();mount();await screen.findByText(/Esta comanda está encerrada/)
 expect(screen.queryByRole('button',{name:/Adicionar Água por/})).not.toBeInTheDocument();expect(posts(api.fetch)).toHaveLength(0)
})
it('an actor without delivery or sales access cannot launch products',async()=>{
 const api=server();mount({...auth,user:{...auth.user!,permissions:['bar:sales:read']}})
 expect(await addDisabled()).toBeDisabled();expect(posts(api.fetch)).toHaveLength(0)
})
it('response checkpoint failure preserves the attempted UUID for a later recovery',async()=>{
 let quota=true;const original=Storage.prototype.setItem
 const api=server((_body,commit)=>{const response=commit();if(quota)vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Quota')});return response})
 const view=mount();fireEvent.click(await addButton());await screen.findByRole('alert');expect(api.tab.total).toBe(5)
 const saved=JSON.parse(localStorage.getItem(key)!);expect(saved.entries).toHaveLength(1);expect(saved.entries[0].attempted).toBe(true)
 view.unmount();quota=false;Object.defineProperty(Storage.prototype,'setItem',{configurable:true,writable:true,value:original});mount()
 await waitFor(()=>expect(JSON.parse(localStorage.getItem(key)!).entries).toHaveLength(0));expect(api.tab.total).toBe(5)
 const writes=posts(api.fetch);expect(writes).toHaveLength(2);expect(writes[0]).toEqual(writes[1])
})

it('StrictMode resumes a durable tap once without duplicating its delivery',async()=>{
 localStorage.setItem(key,JSON.stringify({version:1,paused:false,entries:[{operationId:'11111111-1111-4111-8111-111111111111',productId:'water',name:'Água',price:5,attempted:true}]}))
 const api=server();mount(auth,true)
 await waitFor(()=>expect(JSON.parse(localStorage.getItem(key)!).entries).toHaveLength(0));expect(api.tab.total).toBe(5);expect(posts(api.fetch)).toHaveLength(1)
})
it('a slow background query never regresses the confirmed tab version and does not block taps',async()=>{
 const api=server();mount();fireEvent.click(await addButton());await waitFor(()=>expect(JSON.parse(localStorage.getItem(key)!).entries).toHaveLength(0));await waitFor(()=>expect(screen.getByRole('link',{name:/Receber/})).toBeInTheDocument())
 const stale={...base(),version:1};let finish:()=>void=()=>{}
 const original=api.fetch.getMockImplementation()!
 api.fetch.mockImplementation(async(input,init)=>String(input).endsWith('/tabs/tab-direct')&&!init?.method?new Promise(resolve=>{finish=()=>resolve(json(stale))}):original(input,init))
 let refresh:Promise<void>|undefined
 await act(async()=>{refresh=clients[0].invalidateQueries({queryKey:['bar-runtime','operator','/tabs/tab-direct']})})
 expect(screen.getByRole('button',{name:/Adicionar Água por/})).toBeEnabled()
 await act(async()=>{finish();await refresh})
 expect(screen.getByRole('link',{name:/Receber/})).toHaveTextContent(/5,00/)
})

it('switching owner while a request is in flight cannot send the old owner tail',async()=>{
 let finish:()=>void=()=>{};const api=server((_body,commit)=>new Promise(resolve=>{finish=()=>resolve(commit())}))
 function Harness({owner}:{owner:string}) { const sales=useDirectSales(owner,'tab-direct',{authorized:true,known:true,open:true,online:true,accepting:true});return <button onClick={()=>void sales.add(product)}>Toque</button> }
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client)
 const view=render(<QueryClientProvider client={client}><Harness owner="operator"/></QueryClientProvider>)
 act(()=>{fireEvent.click(screen.getByRole('button',{name:'Toque'}));fireEvent.click(screen.getByRole('button',{name:'Toque'}))})
 await waitFor(()=>expect(JSON.parse(localStorage.getItem(key)!).entries).toHaveLength(2));await waitFor(()=>expect(posts(api.fetch)).toHaveLength(1))
 view.rerender(<QueryClientProvider client={client}><Harness owner="other-operator"/></QueryClientProvider>)
 await act(async()=>finish());expect(posts(api.fetch)).toHaveLength(1);expect(JSON.parse(localStorage.getItem(key)!).entries).toHaveLength(2)
})

const supervisor={...auth,user:{...auth.user!,roles:['Manager'] as ['Manager'],permissions:[...auth.user!.permissions,'bar:supervise']}}
async function minusButton(){const b=await screen.findByRole('button',{name:'Retirar uma unidade de Água'});await waitFor(()=>expect(b).toBeEnabled());return b}
async function settledQueue(){await waitFor(()=>expect(JSON.parse(localStorage.getItem(key)!).entries).toHaveLength(0))}
it('minus removes exactly one confirmed unit directly, preserves history and disables at zero',async()=>{
 const api=server();mount(supervisor);fireEvent.click(await addButton());await settledQueue();fireEvent.click(await addButton());await settledQueue()
 fireEvent.click(await minusButton());await screen.findByText('Água retirado da comanda.');await waitFor(()=>expect(screen.getByLabelText('Quantidade de Água')).toHaveTextContent('Na comanda: 1'))
 expect(api.tab.total).toBe(5);expect(api.tab.items.filter(row=>row.state==='Reversed')).toHaveLength(1)
 expect(posts(api.fetch).at(-1)).toMatchObject({returnStock:true,reason:'Correção de lançamento pelo botão menos na venda direta.'})
 fireEvent.click(await minusButton());await waitFor(()=>expect(api.tab.total).toBe(0));await waitFor(()=>expect(screen.getByRole('button',{name:'Retirar uma unidade de Água'})).toBeDisabled());expect(screen.queryByRole('link',{name:/Receber/})).not.toBeInTheDocument()
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it('an attendant can remove one unit without supervision and gets stock return',async()=>{
 const api=server();mount();fireEvent.click(await addButton());await settledQueue()
 fireEvent.click(await minusButton());await waitFor(()=>expect(api.tab.total).toBe(0));expect(posts(api.fetch).at(-1)).toMatchObject({returnStock:true});expect(api.fetch.mock.calls.some(([path])=>String(path).endsWith('/remove-unit'))).toBe(true)
})
it('uncertain removal blocks new sales and payment and retries the exact item and UUID after reload',async()=>{
 let removals=0;const api=server((body,commit)=>{const response=commit();return body.returnStock!==undefined&&++removals===1?json({detail:'Resposta da retirada perdida'},503):response})
 let view=mount(supervisor);fireEvent.click(await addButton());await settledQueue();fireEvent.click(await minusButton());await screen.findByText('Resposta da retirada perdida')
 expect(api.tab.total).toBe(0);expect(await addDisabled()).toBeDisabled();expect(screen.queryByRole('link',{name:/Receber/})).not.toBeInTheDocument()
 view.unmount();view=mount(supervisor);const retry=await screen.findByRole('button',{name:'Retomar retirada'});await waitFor(()=>expect(retry).toBeEnabled());fireEvent.click(retry)
 await waitFor(()=>expect(JSON.parse(localStorage.getItem(directSalesKey('operator','tab-direct','remove'))!).entries).toHaveLength(0));expect(api.tab.total).toBe(0)
 const calls=posts(api.fetch).filter(body=>body.returnStock!==undefined);expect(calls).toHaveLength(2);expect(calls[0]).toEqual(calls[1]);expect(api.tab.items).toHaveLength(1)
})
it('rapid minus taps never remove another unit before the first response is confirmed',async()=>{
 let finish:()=>void=()=>{};const api=server((body,commit)=>body.returnStock!==undefined?new Promise(resolve=>{finish=()=>resolve(commit())}):commit());mount(supervisor)
 fireEvent.click(await addButton());await settledQueue();fireEvent.click(await addButton());await settledQueue();const minus=await minusButton()
 act(()=>{fireEvent.click(minus);fireEvent.click(minus);fireEvent.click(minus)})
 await waitFor(()=>expect(posts(api.fetch).filter(body=>body.returnStock!==undefined)).toHaveLength(1));expect(await addDisabled()).toBeDisabled()
 await act(async()=>finish());await screen.findByText('Água retirado da comanda.');expect(api.tab.total).toBe(5)
})
it('paid or pending value cannot be removed and refusal can be dismissed without another reversal',async()=>{
 const api=server();mount(supervisor);fireEvent.click(await addButton());await settledQueue();api.clientState({paid:5,due:0,payable:0})
 fireEvent.click(await minusButton());await screen.findByText('Retirada não permitida.');expect(api.tab.total).toBe(5)
 fireEvent.click(screen.getByRole('button',{name:'Descartar retirada recusada'}));await waitFor(()=>expect(JSON.parse(localStorage.getItem(directSalesKey('operator','tab-direct','remove'))!).entries).toHaveLength(0));expect(posts(api.fetch)).toHaveLength(2)
})
it('a removal record can never be interpreted as an addition by the add queue',async()=>{
 localStorage.setItem(key,JSON.stringify({version:1,paused:false,entries:[{operationId:crypto.randomUUID(),productId:'water',name:'Água',price:5,attempted:true,itemId:'old-item',returnStock:false,reason:'Correção'}]}))
 const api=server();mount(supervisor);await screen.findByRole('alert');expect(posts(api.fetch)).toHaveLength(0)
})

it('two views share one pending minus and refresh their quantities without duplicate stock returns',async()=>{
 const api=server();mount(supervisor);fireEvent.click(await addButton());await settledQueue();fireEvent.click(await addButton());await settledQueue();mount(supervisor)
 await waitFor(()=>expect(screen.getAllByRole('button',{name:'Retirar uma unidade de Água'})).toHaveLength(2))
 const buttons=screen.getAllByRole('button',{name:'Retirar uma unidade de Água'});await waitFor(()=>buttons.forEach(button=>expect(button).toBeEnabled()))
 act(()=>{fireEvent.click(buttons[0]);fireEvent.click(buttons[1])})
 await waitFor(()=>expect(api.tab.total).toBe(5));await waitFor(()=>screen.getAllByLabelText('Quantidade de Água').forEach(output=>expect(output).toHaveTextContent('Na comanda: 1')))
 expect(posts(api.fetch).filter(body=>body.returnStock!==undefined)).toHaveLength(1)
})
it('offline minus is disabled and resumes normal operation on reconnect',async()=>{
 const api=server();mount(supervisor);fireEvent.click(await addButton());await settledQueue();await minusButton()
 Object.defineProperty(navigator,'onLine',{configurable:true,value:false});act(()=>window.dispatchEvent(new Event('offline')))
 expect(screen.getByRole('button',{name:'Retirar uma unidade de Água'})).toBeDisabled();expect(posts(api.fetch)).toHaveLength(1)
 Object.defineProperty(navigator,'onLine',{configurable:true,value:true});act(()=>window.dispatchEvent(new Event('online')));fireEvent.click(await minusButton());await waitFor(()=>expect(api.tab.total).toBe(0))
})
it('malformed removal storage is preserved and blocks additions as well as payment',async()=>{
 const removalKey=directSalesKey('operator','tab-direct','remove');localStorage.setItem(removalKey,'broken-removal');const api=server();mount(supervisor)
 await screen.findByRole('alert');expect(await addDisabled()).toBeDisabled();expect(posts(api.fetch)).toHaveLength(0);expect(localStorage.getItem(removalKey)).toBe('broken-removal')
})

it('a legacy pending removal keeps its original reverse endpoint and payload',async()=>{
 const api=server();mount(supervisor);fireEvent.click(await addButton());await settledQueue();cleanup()
 const saved={operationId:crypto.randomUUID(),productId:'water',name:'Água',price:5,attempted:true,itemId:api.tab.items[0].id,returnStock:true,reason:'Motivo original'}
 localStorage.setItem(directSalesKey('operator','tab-direct','remove'),JSON.stringify({version:1,paused:false,entries:[saved]}));mount(supervisor)
 await waitFor(()=>expect(api.tab.total).toBe(0));const calls=api.fetch.mock.calls.filter(([path])=>String(path).endsWith('/reverse'));expect(calls).toHaveLength(1);expect(JSON.parse(String(calls[0][1]?.body))).toEqual({operationId:saved.operationId,returnStock:true,reason:'Motivo original'})
})

it('a timed out removal releases its request and resumes the same item without a second stock return',async()=>{
 let removals=0;let firstSignal:AbortSignal|null|undefined
 const api=server((body,commit)=>{const response=commit();return body.returnStock!==undefined&&++removals===1?new Promise<Response>(()=>{}):response})
 const original=api.fetch.getMockImplementation()!
 api.fetch.mockImplementation(async(input,init)=>{if(String(input).endsWith('/remove-unit')&&!firstSignal)firstSignal=init?.signal;return original(input,init)})
 mount(supervisor);fireEvent.click(await addButton());await settledQueue();const minus=await minusButton();vi.useFakeTimers()
 try {
  fireEvent.click(minus);await act(async()=>{await vi.advanceTimersByTimeAsync(15_000)})
  expect(firstSignal?.aborted).toBe(true);expect(api.tab.total).toBe(0)
  expect(screen.getByRole('button',{name:/Adicionar Água por/})).toBeDisabled()
  const retry=screen.getByRole('button',{name:'Retomar retirada'});expect(retry).toBeEnabled();fireEvent.click(retry)
  await act(async()=>{await vi.advanceTimersByTimeAsync(0)})
  const writes=posts(api.fetch).filter(row=>row.returnStock!==undefined);expect(writes).toHaveLength(2);expect(writes[1]).toEqual(writes[0])
  expect(api.tab.items).toHaveLength(1);expect(api.tab.total).toBe(0)
  expect(JSON.parse(localStorage.getItem(directSalesKey('operator','tab-direct','remove'))!).entries).toHaveLength(0)
 } finally {vi.useRealTimers()}
})
