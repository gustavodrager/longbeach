import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { setAccessToken, setCsrfToken } from '../../lib/http'
import { SellPage, TabDetailsPage, TabsPage, OrdersPage } from './AttendancePages'
import { MyCashPage } from './CashPage'
import { OnlinePaymentRecoveryPage } from './OnlinePaymentRecoveryPage'
import { ReceivePage, ReceiptPage } from './PaymentPages'
import { ClientPage } from './ClientPage'
import { BarReportPage } from './ReportPages'
import { reportPeriod, reportPeriodError } from './reportPeriod'
import { BarArenaMetrics } from './BarArenaMetrics'
import type { CatalogItem, Named, Tab, TabPayment } from './api'

const actor:AuthUser={id:'operator-a',name:'Atendente',email:'atendente@example.com',roles:['Operations'],permissions:['bar:sales:read','bar:sales:operate','bar:cash:operate']}
const createdAtUtc='2026-10-04T15:00:00Z'
const makeTab=():Tab=>({id:'tab-a',version:1,customer:null,number:104,name:'Visitante',mode:'Tab',state:'Open',locationId:'bar-a',actorId:actor.id,total:12.5,paid:0,pending:0,due:12.5,payable:12.5,createdAtUtc,items:[],payments:[],history:[],allowedActions:[]})
const products:CatalogItem[]=[{id:'water',name:'Água mineral',shortName:'Água',categoryId:'drinks',categoryName:'Bebidas',salePrice:5,favorite:true,displayOrder:1,available:2,prepared:false},{id:'juice',name:'Suco',shortName:'Suco',categoryId:'drinks',categoryName:'Bebidas',salePrice:8,favorite:true,displayOrder:2,available:0,prepared:true}]
const payment=(body:Record<string,unknown>,state='Approved'):TabPayment=>({id:'payment-a',tabId:'tab-a',method:String(body.method),amount:Number(body.amount),tendered:Number(body.tendered??body.amount),change:Math.max(0,Number(body.tendered??body.amount)-Number(body.amount)),state,operationId:String(body.operationId),createdAtUtc,confirmedAtUtc:state==='Approved'?createdAtUtc:undefined,expiresAtUtc:'2026-10-04T15:30:00Z',refunded:0,refundPending:0,fee:0})
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})
type Server={tab:Tab;pixEnabled:boolean;catalog?:CatalogItem[];locations?:Named[];customers?:{id:string;name:string;emailHint:string}[];customerLookups?:{id:string;name:string;phoneHint:string;incomplete:boolean}[];post?:(path:string,body:Record<string,unknown>)=>Response|Promise<Response>;put?:(path:string,body:Record<string,unknown>)=>Response|Promise<Response>}
function server(state:Server){return vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  const path=String(input);if(init?.method==='POST'&&state.post)return state.post(path,JSON.parse(String(init.body)))
  if(init?.method==='PUT'&&state.put)return state.put(path,JSON.parse(String(init.body)))
  if(path.includes('/api/v1/customers/lookup?'))return json(state.customerLookups??[])
  if(path.includes('/tabs/customers?'))return json(state.customers??[])
  if(path.includes('/catalog'))return json(state.catalog??products)
  if(path.endsWith('/cash/sessions'))return json([{id:'session-a',registerId:'register-a',locationId:'bar-a',openedBy:actor.id,state:'Open',opening:0,expected:0,createdAtUtc,terminal:'Caixa'}])
  if(path.endsWith('/tabs/locations'))return json(state.locations??[{id:'bar-a',name:'Bar'}])
  if(path.endsWith('/config'))return json({pixEnabled:state.pixEnabled})
  if(path.includes('/tabs?'))return json({items:[state.tab],page:2,pageSize:24,total:25})
  if(path.endsWith('/tabs/tab-a')||path.endsWith('/client'))return json(state.tab)
  throw new Error(`Consulta inesperada: ${path}`)
})}
function RouteState(){const location=useLocation();return <output data-testid="route">{location.pathname}{location.search}</output>}
const clients:QueryClient[]=[]
function mount(path:string,user=actor,realReceipt=false,staleTime=0){
  const query=new QueryClient({defaultOptions:{queries:{retry:false,staleTime},mutations:{retry:false}}});clients.push(query)
  const auth:AuthContextValue={user,isBootstrapping:false,signIn:async()=>{},signInWithGoogle:async()=>{},signOut:async()=>{},changePassword:async()=>{}, completeFirstAccessWithGoogle: async () => {}}
  render(<QueryClientProvider client={query}><AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}><RouteState /><Routes><Route path="/" element={<BarArenaMetrics from="2026-10-01" to="2026-10-04" />} /><Route path="/bar/indicadores/:metric" element={<BarReportPage />} /><Route path="/atendimento/pedidos" element={<OrdersPage />} /><Route path="/atendimento/caixa" element={<MyCashPage />} /><Route path="/atendimento/vender" element={<SellPage />} /><Route path="/atendimento/comandas" element={<TabsPage />} /><Route path="/atendimento/comandas/:tabId" element={<TabDetailsPage />} /><Route path="/atendimento/receber/:tabId" element={<ReceivePage />} /><Route path="/atendimento/pagamento-online/:tabId/:paymentId" element={<OnlinePaymentRecoveryPage />} /><Route path="/atendimento/comprovante/:tabId/:paymentId" element={realReceipt ? <ReceiptPage /> : <h1>Comprovante recebido</h1>} /><Route path="/cliente" element={<ClientPage />} /></Routes></MemoryRouter></AuthContext.Provider></QueryClientProvider>)
  return query
}
beforeEach(()=>{sessionStorage.clear();localStorage.clear();setAccessToken(null);setCsrfToken(null)})
afterEach(()=>{clients.splice(0).forEach(query=>query.clear());setAccessToken(null);setCsrfToken(null)})

it('permite alterar quantidade e impede adicionar produto esgotado ou acima do estoque',async()=>{
  server({tab:makeTab(),pixEnabled:false});mount('/atendimento/vender')
  const add=await screen.findByRole('button',{name:/Adicionar Água por/})
  expect(screen.queryByRole('button',{name:/Adicionar Suco por/})).not.toBeInTheDocument()
  fireEvent.click(add);expect(screen.getByLabelText('Quantidade de Água')).toHaveTextContent('1')
  fireEvent.click(screen.getByRole('button',{name:'Adicionar uma unidade de Água'}))
  expect(screen.getByLabelText('Quantidade de Água')).toHaveTextContent('2')
  expect(screen.getByRole('button',{name:'Adicionar uma unidade de Água'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'Retirar uma unidade de Água'}))
  fireEvent.click(screen.getByRole('button',{name:'Conferir pedido'}))
  expect(screen.getByText('1 × Água')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Entregar e receber'})).toBeEnabled()
})

it('atendimento usa sempre Bar mesmo com Almoxarifado salvo e preserva o carrinho após recarregar',async()=>{
  localStorage.setItem(`lb-cart-location:${actor.id}:sale`,'warehouse-a')
  sessionStorage.setItem(`lb-cart-location:${actor.id}:sale`,'warehouse-a')
  const fetchMock=server({tab:makeTab(),pixEnabled:false,locations:[{id:'warehouse-a',name:'Almoxarifado'},{id:'bar-a',name:'Bar'}]})
  const query=mount('/atendimento/vender')
  fireEvent.click(await screen.findByRole('button',{name:/Adicionar Água por/}))
  expect(screen.queryByLabelText('Local de atendimento')).not.toBeInTheDocument()
  cleanup();query.clear();mount('/atendimento/vender')
  expect(await screen.findByLabelText('Quantidade de Água')).toHaveTextContent('1')
  fireEvent.click(screen.getByRole('button',{name:'Retirar uma unidade de Água'}))
  const paths=fetchMock.mock.calls.filter(([input])=>String(input).includes('/catalog')).map(([input])=>String(input))
  expect(paths.length).toBeGreaterThan(0)
  expect(paths.every(path=>new URL(path,'https://test.invalid').searchParams.get('locationId')==='bar-a')).toBe(true)
  expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0)
})

it.each([
  [{id:'warehouse-a',name:'Almoxarifado'}],
  [{id:'bar-a',name:'Bar'},{id:'bar-b',name:' bar '}],
])('não escolhe outro estoque se o local Bar estiver ausente ou ambíguo',async(...locations)=>{
  const fetchMock=server({tab:makeTab(),pixEnabled:false,locations})
  mount('/atendimento/vender')
  expect(await screen.findByRole('heading',{name:'Estoque Bar não configurado'})).toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([input])=>String(input).includes('/catalog'))).toBe(false)
})

it('abre novas comandas no Bar sem seletor de local',async()=>{
  const state:Server={tab:makeTab(),pixEnabled:false,locations:[{id:'warehouse-a',name:'Almoxarifado'},{id:'bar-a',name:'Bar'}]}
  state.post=(_path,body)=>{expect(body).toMatchObject({locationId:'bar-a',mode:'Tab'});return json(state.tab)}
  const fetchMock=server(state);mount('/atendimento/comandas')
  fireEvent.click(await screen.findByRole('button',{name:'Abrir comanda'}))
  const submit=await screen.findByRole('button',{name:'Abrir sem vínculo financeiro'})
  await waitFor(()=>expect(submit).toBeEnabled())
  expect(screen.queryByLabelText('Local')).not.toBeInTheDocument()
  fireEvent.click(submit)
  expect(await screen.findByRole('heading',{name:'Comanda 104'})).toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
})

it('abre meu caixa no Bar mesmo quando Almoxarifado vem primeiro',async()=>{
  let opened=false
  const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
    const path=String(input)
    if(init?.method==='POST'){expect(JSON.parse(String(init.body))).toMatchObject({locationId:'bar-a',opening:0});opened=true;return json({id:'session-a'})}
    if(path.endsWith('/cash/sessions'))return json(opened?[{id:'session-a',openedBy:actor.id,state:'Open',opening:0,expected:0,createdAtUtc}]:[])
    if(path.endsWith('/cash/current'))return json(null)
    if(path.endsWith('/cash/registers'))return json([{id:'register-a',name:'Caixa'}])
    if(path.endsWith('/cash/locations'))return json([{id:'warehouse-a',name:'Almoxarifado'},{id:'bar-a',name:'Bar'}])
    throw new Error(path)
  })
  mount('/atendimento/caixa')
  fireEvent.change(await screen.findByLabelText('Dinheiro inicial (R$)'),{target:{value:'0'}})
  await waitFor(()=>expect(screen.getByRole('button',{name:'Abrir caixa'})).toBeEnabled())
  expect(screen.queryByLabelText('Local de estoque')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Abrir caixa'}))
  expect(await screen.findByRole('heading',{name:'Caixa aberto'})).toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
})

it('vende produtos sem controle; permite retirar um item esgotado do carrinho',async()=>{
  const state:Server={tab:makeTab(),pixEnabled:false,catalog:[...products,{...products[1],id:'untracked',name:'Sem controle',shortName:'Sem controle',available:null}]}
  const fetchMock=server(state);const query=mount('/atendimento/vender')
  fireEvent.click(await screen.findByRole('button',{name:/Adicionar Água por/}))
  expect(screen.getByRole('button',{name:/Adicionar Sem controle/})).toBeEnabled()
  state.catalog=state.catalog!.map(product=>({...product,available:0}))
  await act(async()=>{await query.invalidateQueries({queryKey:['bar-runtime']})})
  await waitFor(()=>expect(screen.getByRole('button',{name:'Adicionar uma unidade de Água'})).toBeDisabled())
  fireEvent.click(screen.getByRole('button',{name:'Conferir pedido'}))
  fireEvent.click(screen.getByRole('button',{name:'Entregar e receber'}))
  expect(screen.getByRole('alert')).toHaveTextContent('O estoque mudou')
  expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button',{name:'Mais produtos'}))
  fireEvent.click(screen.getByRole('button',{name:'Retirar uma unidade de Água'}))
  expect(screen.getByRole('heading',{name:'Nenhum produto disponível'})).toBeInTheDocument()
})

it.each([false,true])('recupera pedido após resposta perdida e mudança no catálogo (inativo=%s)',async inactive=>{
  let attempts=0
  const state:Server={tab:makeTab(),pixEnabled:false,catalog:[{...products[0],available:1}]}
  state.post=(path)=>{
    if(path.endsWith('/tabs'))return json(state.tab)
    if(path.endsWith('/items')){attempts++;state.catalog=inactive?[]:[{...products[0],available:0}];return attempts===1?json({detail:'Resposta perdida'},502):json(state.tab)}
    throw new Error(path)
  }
  const fetchMock=server(state);const query=mount('/atendimento/vender')
  fireEvent.click(await screen.findByRole('button',{name:/Adicionar Água por/}))
  fireEvent.click(screen.getByRole('button',{name:'Conferir pedido'}))
  fireEvent.click(screen.getByRole('button',{name:'Entregar e receber'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Resposta perdida')
  await act(async()=>{await query.invalidateQueries({queryKey:['bar-runtime']})})
  fireEvent.click(screen.getByRole('button',{name:'Entregar e receber'}))
  expect(await screen.findByRole('heading',{name:'Receber · Comanda 104'})).toBeInTheDocument()
  const writes=fetchMock.mock.calls.filter(([input,init])=>String(input).endsWith('/items')&&init?.method==='POST').map(([,init])=>JSON.parse(String(init?.body)))
  expect(writes).toHaveLength(2);expect(writes[1]).toEqual(writes[0])
})

it('envia venda pronta como Immediate no contrato real e entrega o consumo uma vez',async()=>{
  const state:Server={tab:{...makeTab(),total:0,due:0,payable:0},pixEnabled:false}
  state.post=(path,body)=>{
    if(path.endsWith('/tabs')){state.tab={...state.tab,mode:String(body.mode)};return json(state.tab)}
    if(path.endsWith('/tabs/tab-a/items')){state.tab={...state.tab,total:5,due:5,payable:5,items:[{id:'item-a',tabId:'tab-a',productId:'water',name:'Água',quantity:1,unitPrice:5,total:5,state:'Fulfilled',source:'Operator',createdAtUtc,allowedActions:[]}]};return json(state.tab)}
    throw new Error(`Operação inesperada: ${path}`)
  }
  const fetchMock=server(state);mount('/atendimento/vender')
  fireEvent.click(await screen.findByRole('button',{name:/Adicionar Água por/}))
  fireEvent.click(screen.getByRole('button',{name:'Conferir pedido'}))
  const submit=screen.getByRole('button',{name:'Entregar e receber'});act(()=>{fireEvent.click(submit);fireEvent.click(submit)})
  expect(await screen.findByRole('heading',{name:'Receber · Comanda 104'})).toBeInTheDocument()
  const writes=fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')
  expect(writes).toHaveLength(2)
  expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({mode:'Immediate',locationId:'bar-a'})
  expect(JSON.parse(String(writes[1][1]?.body))).toMatchObject({deliver:true,items:[{productId:'water',quantity:1}]})
  expect(state.tab.items).toHaveLength(1)
})

it('mostra troco somente para dinheiro e exige aprovação do cartão antes de registrar uma vez',async()=>{
  const state:Server={tab:makeTab(),pixEnabled:true};let complete:(response:Response)=>void=()=>{}
  state.post=(_path,body)=>new Promise(resolve=>{complete=response=>{const row=payment(body);state.tab={...state.tab,paid:12.5,due:0,payable:0,payments:[row]};resolve(response)}})
  const fetchMock=server(state);mount('/atendimento/receber/tab-a')
  fireEvent.click(await screen.findByRole('button',{name:/Receber tudo/}))
  fireEvent.click(screen.getByRole('button',{name:'Dinheiro'}))
  fireEvent.change(screen.getByLabelText('Dinheiro recebido (R$)'),{target:{value:'20,00'}})
  expect(screen.getByText(/Troco: R\$\s*7,50/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Nome do pagador')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Crédito na maquininha'}))
  expect(screen.queryByLabelText('Dinheiro recebido (R$)')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Confirmar recebimento'})).toBeDisabled()
  fireEvent.click(screen.getByLabelText('A maquininha confirmou a aprovação'))
  const form=screen.getByRole('button',{name:'Confirmar recebimento'}).closest('form')!
  act(()=>{fireEvent.submit(form);fireEvent.submit(form)})
  await waitFor(()=>expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1))
  const body=JSON.parse(String(fetchMock.mock.calls.find(([,init])=>init?.method==='POST')![1]?.body))
  expect(body).toMatchObject({method:'TerminalManual',terminalType:'Credit',amount:12.5,terminalApproved:true})
  expect(body.sessionId).toBeUndefined()
  await act(async()=>complete(json(payment(body))))
  expect(await screen.findByRole('heading',{name:'Comprovante recebido'})).toBeInTheDocument()
})

it.each(['valor','parte','meio'] as const)('exige nova aprovação de cartão quando muda o %s e registra apenas o novo valor',async change=>{
  const state:Server={tab:makeTab(),pixEnabled:false}
  state.post=(_path,body)=>json(payment(body))
  const fetchMock=server(state);mount('/atendimento/receber/tab-a')
  fireEvent.click(await screen.findByRole('button',{name:'Receber uma parte'}))
  fireEvent.change(screen.getByLabelText('Valor desta parte (R$)'),{target:{value:'5'}})
  fireEvent.click(screen.getByRole('button',{name:'Crédito na maquininha'}))
  fireEvent.click(screen.getByLabelText('A maquininha confirmou a aprovação'))
  expect(screen.getByRole('button',{name:'Confirmar recebimento'})).toBeEnabled()
  if(change==='valor')fireEvent.change(screen.getByLabelText('Valor desta parte (R$)'),{target:{value:'8'}})
  if(change==='parte')fireEvent.click(screen.getByRole('button',{name:/Receber tudo/}))
  if(change==='meio'){
    fireEvent.click(screen.getByRole('button',{name:'Dinheiro'}))
    fireEvent.click(screen.getByRole('button',{name:'Crédito na maquininha'}))
  }
  const checkbox=screen.getByLabelText('A maquininha confirmou a aprovação')
  expect(checkbox).not.toBeChecked()
  const submit=screen.getByRole('button',{name:'Confirmar recebimento'})
  expect(submit).toBeDisabled()
  fireEvent.submit(submit.closest('form')!)
  expect(await screen.findByRole('alert')).toHaveTextContent('Confirme a aprovação na maquininha')
  expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0)
  fireEvent.click(checkbox);fireEvent.click(submit)
  expect(await screen.findByRole('heading',{name:'Comprovante recebido'})).toBeInTheDocument()
  const writes=fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')
  expect(writes).toHaveLength(1)
  expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({method:'TerminalManual',terminalType:'Credit',amount:change==='valor'?8:change==='parte'?12.5:5,terminalApproved:true})
})

it('atualização do saldo por outro atendente invalida a aprovação da maquininha',async()=>{
  const state:Server={tab:makeTab(),pixEnabled:false};const fetchMock=server(state)
  const query=mount('/atendimento/receber/tab-a')
  fireEvent.click(await screen.findByRole('button',{name:/Receber tudo/}))
  fireEvent.click(screen.getByRole('button',{name:'Crédito na maquininha'}))
  fireEvent.click(screen.getByLabelText('A maquininha confirmou a aprovação'))
  state.tab={...state.tab,total:20,due:20,payable:20}
  await act(async()=>{await query.invalidateQueries({queryKey:['bar-runtime',actor.id,'/tabs/tab-a']})})
  await screen.findByText(/Confira na maquininha a aprovação de R\$\s*20,00/)
  expect(screen.getByLabelText('A maquininha confirmou a aprovação')).not.toBeChecked()
  const submit=screen.getByRole('button',{name:'Confirmar recebimento'})
  expect(submit).toBeDisabled()
  expect(screen.getByText(/Confira na maquininha a aprovação de R\$\s*20,00/)).toBeInTheDocument()
  fireEvent.submit(submit.closest('form')!)
  expect(await screen.findByRole('alert')).toHaveTextContent('Confirme a aprovação na maquininha')
  expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0)
})

it.each(['cliente','atendente'] as const)('catálogo sem favoritos mostra os produtos de imediato: %s',async scene=>{
  server({tab:makeTab(),pixEnabled:false,catalog:products.map(product=>({...product,favorite:false}))})
  mount(scene==='cliente'?'/cliente#token=own-secret':'/atendimento/vender')
  expect(await screen.findByRole('button',{name:/Adicionar Água por/})).toBeEnabled()
  expect(screen.getByRole('button',{name:'Todos'})).toHaveAttribute('aria-pressed','true')
  expect(screen.queryByRole('button',{name:'Favoritos'})).not.toBeInTheDocument()
  expect(screen.queryByRole('heading',{name:'Nenhum produto nesta seleção'})).not.toBeInTheDocument()
})

it.each(['cliente','atendente'] as const)('saldo zero com pedido aguardando aceite informa espera e não pagamento concluído: %s',async scene=>{
  const state:Server={tab:{...makeTab(),total:0,due:0,payable:0,items:[{id:'request-a',tabId:'tab-a',productId:'water',name:'Água',quantity:1,unitPrice:5,total:5,state:'Requested',source:'Client',createdAtUtc,allowedActions:['accept','reject']}]},pixEnabled:true}
  const fetchMock=server(state);mount(scene==='cliente'?'/cliente#token=own-secret':'/atendimento/receber/tab-a')
  if(scene==='cliente')fireEvent.click(await screen.findByRole('button',{name:'Pagar'}))
  expect(await screen.findByRole('heading',{name:'Esperando a equipe confirmar'})).toBeInTheDocument()
  expect(screen.queryByText(/Tudo pago/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Criar Pix'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Confirmar recebimento'})).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0)
})

it.each(['Requested','Accepted'])('comanda com pedido %s não oferece encerramento antes de concluir o atendimento',async itemState=>{
  server({tab:{...makeTab(),total:0,due:0,payable:0,items:[{id:'request-a',tabId:'tab-a',productId:'water',name:'Água',quantity:1,unitPrice:5,total:5,state:itemState,source:'Client',createdAtUtc,allowedActions:[]}]},pixEnabled:false})
  mount('/atendimento/comandas/tab-a')
  await screen.findByRole('heading',{name:'Comanda 104'})
  expect(screen.queryByRole('button',{name:'Encerrar comanda'})).not.toBeInTheDocument()
})

it('mantém a cobrança Pix pendente sem inventar QR ou aprovação, até o provedor confirmar',async()=>{
  const row=payment({method:'Pix',amount:12.5,operationId:'existing'},'Pending')
  const state:Server={tab:{...makeTab(),pending:12.5,payable:0,payments:[row]},pixEnabled:true}
  state.post=()=>{const approved={...row,state:'Approved'};state.tab={...state.tab,payments:[approved],paid:12.5,pending:0,due:0};return json(approved)}
  const fetchMock=server(state);mount('/atendimento/receber/tab-a?paymentId=payment-a')
  expect(await screen.findByRole('heading',{name:'Esperando o Pix'})).toBeInTheDocument()
  expect(screen.queryByRole('img',{name:'QR Code para pagar com Pix'})).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Pix copia e cola')).not.toBeInTheDocument()
  expect(screen.queryByText('Pagamento confirmado')).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button',{name:'Consultar confirmação'}))
  expect(await screen.findByRole('heading',{name:'Pix confirmado'})).toBeInTheDocument()
  expect(screen.getByRole('link',{name:'Ver comprovante'})).toHaveAttribute('href','/atendimento/comprovante/tab-a/payment-a')
})

it('repetir após falha conserva o valor e o identificador da mesma cobrança',async()=>{
  const state:Server={tab:makeTab(),pixEnabled:false};let attempts=0
  state.post=(_path,body)=>{attempts++;if(attempts===1)return json({detail:'Conexão indisponível. Confira o pagamento.'},503);const row=payment(body);state.tab={...state.tab,paid:12.5,due:0,payable:0,payments:[row]};return json(row)}
  const fetchMock=server(state);mount('/atendimento/receber/tab-a')
  fireEvent.click(await screen.findByRole('button',{name:/Receber tudo/}));fireEvent.click(screen.getByRole('button',{name:'Dinheiro'}))
  fireEvent.change(screen.getByLabelText('Dinheiro recebido (R$)'),{target:{value:'20'}})
  fireEvent.click(screen.getByRole('button',{name:'Confirmar recebimento'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Conexão indisponível')
  expect(screen.getByLabelText('Dinheiro recebido (R$)')).toHaveValue('20')
  fireEvent.click(screen.getByRole('button',{name:'Consultar ou repetir confirmação'}))
  expect(await screen.findByRole('heading',{name:'Comprovante recebido'})).toBeInTheDocument()
  const writes=fetchMock.mock.calls.filter(([,init])=>init?.method==='POST').map(([,init])=>JSON.parse(String(init?.body)))
  expect(writes).toHaveLength(2);expect(writes[0].operationId).toBe(writes[1].operationId)
})

it('QR envia somente pedidos próprios, sem sessão do atendente e sem cobrar item aguardando aceite',async()=>{
  setAccessToken('operator-session');setCsrfToken('operator-csrf')
  const state:Server={tab:makeTab(),pixEnabled:false}
  state.post=(_path,body)=>{state.tab={...state.tab,items:[{id:'request-a',tabId:state.tab.id,productId:'water',name:'Água',quantity:1,unitPrice:5,total:5,state:'Requested',source:'Client',createdAtUtc,allowedActions:[]}]};return json(state.tab)}
  const fetchMock=server(state);mount('/cliente#token=own-secret')
  fireEvent.click(await screen.findByRole('button',{name:/Adicionar Água por/}));fireEvent.click(screen.getByRole('button',{name:'Conferir pedido'}))
  const submit=screen.getByRole('button',{name:'Enviar pedido'});act(()=>{fireEvent.click(submit);fireEvent.click(submit)})
  expect(await screen.findByRole('heading',{name:'Pedidos e pagamentos'})).toBeInTheDocument()
  expect(screen.getAllByRole('heading',{level:1})).toHaveLength(1)
  expect(screen.getByRole('heading',{level:1,name:'Comanda 104'})).toBeInTheDocument()
  expect(screen.getByText('Esperando a equipe confirmar')).toBeInTheDocument()
  expect(within(screen.getByLabelText('Valores da comanda')).getAllByText(/12,50/)).toHaveLength(2)
  const writes=fetchMock.mock.calls.filter(([,init])=>init?.method==='POST');expect(writes).toHaveLength(1)
  expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({deliver:false,items:[{productId:'water',quantity:1}]})
  for(const[input,init]of fetchMock.mock.calls){expect(String(input)).toMatch(/^\/api\/v1\/bar\/client(?:\/|$)/);expect(String(input)).not.toContain('own-secret');expect(new Headers(init?.headers).get('X-LongBeach-Tab')).toBe('own-secret');expect(init?.credentials).toBe('omit');expect(new Headers(init?.headers).has('Authorization')).toBe(false);expect(new Headers(init?.headers).has('X-CSRF-Token')).toBe(false)}
  expect(screen.queryByRole('link',{name:/Comprovante|Receber|Caixa|Gestão/})).not.toBeInTheDocument()
})

it('acesso QR negado não mostra comanda, catálogo nem ações internas',async()=>{
  const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(json({detail:'Este acesso expirou. Peça ajuda à equipe.'},403))
  mount('/cliente#token=expired-secret')
  expect(await screen.findByRole('alert')).toHaveTextContent('Este acesso expirou')
  expect(screen.queryByText('Visitante')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Pagar'})).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('revogação remove as ações e dados da comanda que estavam em memória',async()=>{
  const fetchMock=server({tab:makeTab(),pixEnabled:false});const query=mount('/cliente#token=own-secret')
  expect(await screen.findByRole('heading',{name:'Comanda 104'})).toBeInTheDocument()
  fetchMock.mockResolvedValue(json({detail:'Acesso revogado pela equipe.'},403))
  await act(async()=>{await query.invalidateQueries({queryKey:['client-tab','own-secret']})})
  expect(await screen.findByRole('alert')).toHaveTextContent('Acesso revogado')
  expect(screen.queryByRole('heading',{name:'Comanda 104'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Pagar'})).not.toBeInTheDocument()
})

it('voltar da comanda restaura o relatório com período e página',async()=>{
  server({tab:makeTab(),pixEnabled:false});const returnTo='/bar/indicadores/consumption?de=2026-10-01&ate=2026-10-04&pagina=2'
  mount(`/atendimento/comandas/tab-a?retorno=${encodeURIComponent(returnTo)}`)
  expect(await screen.findByRole('heading',{name:'Comanda 104'})).toBeInTheDocument()
  expect(screen.getByRole('link',{name:'Voltar'})).toHaveAttribute('href',returnTo)
})

it('cliente retoma um Pix interrompido com o mesmo identificador e valor reservado',async()=>{
  const original=payment({method:'Pix',amount:7.5,operationId:'original-payment-intent'},'Pending')
  const state:Server={tab:{...makeTab(),total:7.5,due:7.5,pending:7.5,payable:0,payments:[original]},pixEnabled:true}
  state.post=(_path,body)=>{const row={...original,providerId:'provider-payment-a',pixText:'Código retornado pelo provedor de teste'};state.tab={...state.tab,payments:[row]};expect(body).toMatchObject({operationId:original.operationId,amount:7.5,method:'Pix'});return json(row)}
  const fetchMock=server(state);mount('/cliente#token=own-secret')
  fireEvent.click(await screen.findByRole('button',{name:'Pagar'}))
  expect(screen.getByRole('heading',{name:'Retomar o mesmo Pix'})).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Nome do pagador'),{target:{value:'Pessoa para teste de retomada'}})
  fireEvent.change(screen.getByLabelText('E-mail'),{target:{value:'retomada@example.com'}})
  fireEvent.change(screen.getByLabelText('CPF / CNPJ'),{target:{value:'12345678901'}})
  const form=screen.getByRole('button',{name:'Retomar sem cobrar novamente'}).closest('form')!
  act(()=>{fireEvent.submit(form);fireEvent.submit(form)})
  await waitFor(()=>expect(screen.queryByRole('heading',{name:'Retomar o mesmo Pix'})).not.toBeInTheDocument())
  expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
  expect(state.tab.payments).toHaveLength(1);expect(state.tab).toMatchObject({paid:0,pending:7.5,payable:0})
  expect(screen.queryByText('Pagamento confirmado')).not.toBeInTheDocument()
  expect([...Object.values(sessionStorage),...Object.values(localStorage)].join('|')).not.toContain('retomada@example.com')
})

it.each(['atendente','cliente'] as const)('pedido com resultado desconhecido conserva produtos e a mesma operação após recarregar: %s',async(scene)=>{
  const state:Server={tab:makeTab(),pixEnabled:false};let attempts=0
  state.post=(path,body)=>{
    expect(path).toBe(scene==='cliente'?'/api/v1/bar/client/items':'/api/v1/bar/tabs/tab-a/items')
    if(++attempts===1){state.tab={...state.tab,items:[{id:'request-a',tabId:'tab-a',productId:'water',name:'Água',quantity:1,unitPrice:5,total:5,state:scene==='cliente'?'Requested':'Fulfilled',source:scene==='cliente'?'Client':'Operator',createdAtUtc,allowedActions:[]}]};return json({detail:'Resposta interrompida. Confira o pedido.'},503)}
    return json(state.tab)
  }
  const fetchMock=server(state);const path=scene==='cliente'?'/cliente#token=own-secret':'/atendimento/vender?comanda=tab-a'
  const query=mount(path)
  fireEvent.click(await screen.findByRole('button',{name:/Adicionar Água por/}));fireEvent.click(screen.getByRole('button',{name:'Conferir pedido'}))
  const label=scene==='cliente'?'Enviar pedido':'Adicionar e entregar'
  fireEvent.click(screen.getByRole('button',{name:label}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Resposta interrompida')
  expect(screen.getByText('1 × Água')).toBeInTheDocument();expect(screen.getByRole('button',{name:scene==='cliente'?'Alterar pedido':'Mais produtos'})).toBeDisabled()
  if(scene==='atendente'){
    expect(screen.getByRole('button',{name:'Adicionar à comanda'})).toBeDisabled()
    expect(screen.queryByRole('link',{name:'Trocar comanda'})).not.toBeInTheDocument()
  }
  cleanup();query.clear();mount(path)
  expect(await screen.findByText('1 × Água')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:scene==='cliente'?'Alterar pedido':'Mais produtos'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:scene==='cliente'?'Verificar envio':label}))
  expect(await screen.findByRole('heading',{name:scene==='cliente'?'Pedidos e pagamentos':'Comanda 104'})).toBeInTheDocument()
  const bodies=fetchMock.mock.calls.filter(([,init])=>init?.method==='POST').map(([,init])=>JSON.parse(String(init?.body)))
  expect(bodies).toHaveLength(2);expect(bodies[0]).toEqual(bodies[1]);expect(bodies[0]).toMatchObject({items:[{productId:'water',quantity:1}],deliver:scene==='atendente'})
  expect(state.tab.items).toHaveLength(1)
  expect(sessionStorage.getItem(scene==='cliente'?'lb-confirmation:client-order:tab-a':`lb-confirmation:order:${actor.id}:tab-a`)).toBeNull()
})

it('Pix pendente com QR e canResume false não oferece retomar uma criação já existente',async()=>{
  const original={...payment({method:'Pix',amount:7.5,operationId:'existing-provider-payment'},'Pending'),canResume:false,providerId:undefined,pixText:'Payload retornado pelo provedor',qrImageUrl:'https://payments.example.com/qr.png'}
  server({tab:{...makeTab(),pending:7.5,payable:5,payments:[original]},pixEnabled:true});mount('/cliente#token=own-secret')
  fireEvent.click(await screen.findByRole('button',{name:'Pagar'}))
  expect(screen.getByRole('img',{name:'QR Code para pagar com Pix'})).toHaveAttribute('src',original.qrImageUrl)
  expect(screen.queryByRole('heading',{name:'Retomar o mesmo Pix'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Retomar sem cobrar novamente'})).not.toBeInTheDocument()
})

it('Pix parcial com POST502 repete a mesma chave até o GET confirmar e cria a próxima parcela com outra chave',async()=>{
  const state:Server={tab:makeTab(),pixEnabled:true};let attempts=0
  state.post=(path,body)=>{
    expect(path).toBe('/api/v1/bar/client/payments');attempts++
    if(attempts===1){const row={...payment(body,'Pending'),providerId:'provider-a',canResume:false};state.tab={...state.tab,pending:6.25,payable:6.25,payments:[row]};return json({detail:'O provedor ainda não confirmou a criação.'},502)}
    if(attempts===2)return json({detail:'A consulta ainda está em andamento.'},502)
    const row={...payment(body,'Pending'),id:'payment-b',providerId:'provider-b',canResume:false};state.tab={...state.tab,pending:12.5,payable:0,payments:[...state.tab.payments,row]};return json(row)
  }
  const fetchMock=server(state);const query=mount('/cliente#token=own-secret')
  fireEvent.click(await screen.findByRole('button',{name:'Pagar'}));fireEvent.click(await screen.findByRole('button',{name:'Uma parte'}))
  fireEvent.change(screen.getByLabelText('Valor (R$)'),{target:{value:'6,25'}})
  fireEvent.change(screen.getByLabelText('Seu nome'),{target:{value:'Pessoa de teste'}})
  fireEvent.change(screen.getByLabelText('E-mail'),{target:{value:'teste@example.com'}})
  fireEvent.change(screen.getByLabelText('CPF / CNPJ'),{target:{value:'12345678901'}})
  fireEvent.click(screen.getByRole('button',{name:'Criar Pix'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('O provedor ainda não confirmou')
  expect(screen.getByLabelText('Valor (R$)')).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'Verificar pagamento'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('A consulta ainda está em andamento')
  const retryBodies=fetchMock.mock.calls.filter(([,init])=>init?.method==='POST').map(([,init])=>JSON.parse(String(init?.body)))
  expect(retryBodies).toHaveLength(2);expect(retryBodies[0]).toEqual(retryBodies[1])
  await act(async()=>{await query.invalidateQueries({queryKey:['client-tab','own-secret']})})
  await waitFor(()=>expect(screen.getByLabelText('Valor (R$)')).toBeEnabled());expect(screen.getByLabelText('Valor (R$)')).toHaveValue('6,25')
  const create=screen.getByRole('button',{name:'Criar Pix'});act(()=>{fireEvent.click(create);fireEvent.click(create)})
  await waitFor(()=>expect(state.tab.payments).toHaveLength(2))
  const bodies=fetchMock.mock.calls.filter(([,init])=>init?.method==='POST').map(([,init])=>JSON.parse(String(init?.body)))
  expect(bodies).toHaveLength(3);expect(bodies[2].operationId).not.toBe(bodies[0].operationId)
  expect(bodies.map(body=>body.amount)).toEqual([6.25,6.25,6.25]);expect(state.tab).toMatchObject({paid:0,pending:12.5,payable:0})
})

it('resposta perdida de dinheiro é recuperada pelo GET com o meio correto e acesso ao comprovante',async()=>{
  const state:Server={tab:makeTab(),pixEnabled:false}
  state.post=(_path,body)=>{const row=payment(body);state.tab={...state.tab,paid:12.5,due:0,payable:0,payments:[row]};return json({detail:'Resposta interrompida. Consulte o recebimento.'},503)}
  const fetchMock=server(state);const query=mount('/atendimento/receber/tab-a')
  fireEvent.click(await screen.findByRole('button',{name:/Receber tudo/}));fireEvent.click(screen.getByRole('button',{name:'Dinheiro'}))
  fireEvent.change(screen.getByLabelText('Dinheiro recebido (R$)'),{target:{value:'20'}})
  fireEvent.click(screen.getByRole('button',{name:'Confirmar recebimento'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Resposta interrompida')
  await act(async()=>{await query.invalidateQueries({queryKey:['bar-runtime',actor.id,'/tabs/tab-a']})})
  expect(await screen.findByRole('heading',{name:'Dinheiro confirmado'})).toBeInTheDocument()
  expect(screen.queryByRole('heading',{name:'Pix confirmado'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Consultar confirmação'})).not.toBeInTheDocument()
  expect(screen.getByRole('link',{name:'Ver comprovante'})).toHaveAttribute('href','/atendimento/comprovante/tab-a/payment-a')
  expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
})

it.each([
  ['de=2026-02-31&ate=2026-03-01','Escolha datas válidas'],
  ['de=2026-10-04&ate=2026-10-01','A data final'],
  ['de=2025-01-01&ate=2026-01-02','no máximo 366 dias'],
])('período inválido mostra correção sem consultar um total diferente: %s',async(search,message)=>{
  const fetchMock=vi.spyOn(globalThis,'fetch')
  mount(`/bar/indicadores/received?${search}`,{...actor,permissions:['bar:finance:read']})
  expect(screen.getByRole('alert')).toHaveTextContent(message)
  expect(fetchMock).not.toHaveBeenCalled();expect(reportPeriod(new URLSearchParams(search))).toBe('')
})

it('aceita exatamente 366 dias e mantém o fim exclusivo na consulta',()=>{
  const params=new URLSearchParams('de=2024-01-01&ate=2024-12-31')
  expect(reportPeriodError(params)).toBeNull()
  const result=new URLSearchParams(reportPeriod(params))
  expect(result.get('fromUtc')).toBe('2024-01-01T03:00:00.000Z')
  expect(result.get('toUtc')).toBe('2025-01-01T03:00:00.000Z')
})

it('fonte indisponível nunca aparece como zero nas métricas globais do bar',async()=>{
  vi.spyOn(globalThis,'fetch').mockImplementation(async input=>json({metric:String(input),value:0,unit:'money',current:false,available:false,updatedAtUtc:createdAtUtc,rows:{items:[],page:1,pageSize:1,total:0}}))
  mount('/',{...actor,roles:['Manager'],permissions:['bar:finance:read']})
  await waitFor(()=>expect(screen.getAllByText('Ainda não disponível')).toHaveLength(4))
  expect(screen.queryByText(/R\$\s*0,00/)).not.toBeInTheDocument()
  expect(screen.getByRole('link',{name:/Consumo confirmado/})).toHaveAttribute('href','/bar/indicadores/consumption?de=2026-10-01&ate=2026-10-04')
})

it('atendente sem permissão de operar não oferece abrir comanda e preserva busca e página ao voltar',async()=>{
  const fetchMock=server({tab:makeTab(),pixEnabled:false});const filters='/atendimento/comandas?busca=104&pagina=2'
  mount(filters,{...actor,roles:['Operations'],permissions:['bar:sales:read','bar:finance:read']})
  const card=await screen.findByRole('link',{name:/104.*Abrir comanda/})
  expect(screen.queryByRole('button',{name:'Abrir comanda'})).not.toBeInTheDocument()
  fireEvent.click(card)
  expect(await screen.findByRole('heading',{name:'Comanda 104'})).toBeInTheDocument()
  expect(screen.getByRole('link',{name:'Voltar'})).toHaveAttribute('href',filters)
  expect(screen.queryByRole('link',{name:'Receber'})).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0)
})

it('traduz todos os eventos de histórico enviados pela API de comandas',async()=>{
  const kinds=['Opened','Requested','AccessRevoked','FeeReconciled']
  server({tab:{...makeTab(),history:kinds.map(kind=>({id:kind,kind,amount:0,createdAtUtc}))},pixEnabled:false});mount('/atendimento/comandas/tab-a')
  await screen.findByRole('heading',{name:'Comanda 104'})
  fireEvent.click(screen.getByText('Histórico da comanda'))
  for(const kind of kinds)expect(screen.queryByText(kind)).not.toBeInTheDocument()
  expect(screen.getByText('Comanda aberta')).toBeInTheDocument()
  expect(screen.getByText('Pedido recebido, aguardando aceite')).toBeInTheDocument()
  expect(screen.getByText('Acesso do cliente encerrado')).toBeInTheDocument()
  expect(screen.getByText('Taxa registrada')).toBeInTheDocument()
})

it.each(['cliente'])('Pix parcial confirmado pelo POST bloqueia nova cobrança quando consulta falha: %s',async scene=>{
  const tab={...makeTab(),total:100,due:100,payable:100};let posted=false
  const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
    const path=String(input)
    if(init?.method==='POST'){
      posted=true;const row={...payment(JSON.parse(String(init.body)),'Pending'),providerId:'provider-payment-a'}
      tab.payments=[row];tab.pending=30;tab.payable=70
      return json(row)
    }
    if(path.includes('/catalog'))return json(products)
    if(path.endsWith('/config'))return json({pixEnabled:true})
    if(path.endsWith('/cash/sessions'))return json([])
    if(path.endsWith('/client')||path.endsWith('/tabs/tab-a'))return posted?json({detail:'Falha ao atualizar a comanda.'},503):json(tab)
    throw new Error(`Consulta inesperada: ${path}`)
  })
  mount(scene==='cliente'?'/cliente#token=own-secret':'/atendimento/receber/tab-a')
  if(scene==='cliente'){
    fireEvent.click(await screen.findByRole('button',{name:'Pagar'}))
    fireEvent.click(await screen.findByRole('button',{name:'Uma parte'}))
    fireEvent.change(screen.getByLabelText('Valor (R$)'),{target:{value:'30'}})
    fireEvent.change(screen.getByLabelText('Seu nome'),{target:{value:'Pessoa para teste'}})
  }else{
    fireEvent.click(await screen.findByRole('button',{name:'Receber uma parte'}))
    fireEvent.change(screen.getByLabelText('Valor desta parte (R$)'),{target:{value:'30'}})
    const pix=screen.getByRole('button',{name:'Pix'});await waitFor(()=>expect(pix).toBeEnabled());fireEvent.click(pix)
    fireEvent.change(screen.getByLabelText('Nome do pagador'),{target:{value:'Pessoa para teste'}})
  }
  fireEvent.change(screen.getByLabelText('E-mail'),{target:{value:'pessoa@example.com'}})
  fireEvent.change(screen.getByLabelText('CPF / CNPJ'),{target:{value:'12345678901'}})
  fireEvent.click(screen.getByRole('button',{name:'Criar Pix'}))
  expect(await screen.findByRole('heading',{name:'Esperando o Pix'})).toBeInTheDocument()
  await waitFor(()=>expect(screen.queryByText('Aguardando confirmação…')).not.toBeInTheDocument())
  const next=screen.queryByRole('button',{name:'Criar Pix'})
  expect(next===null||next.hasAttribute('disabled')).toBe(true)
  if(next)fireEvent.click(next)
  expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
  expect(tab.payments).toHaveLength(1);expect(tab.pending).toBe(30)
})

it.each(['cliente'])('rejeição de CPF permite corrigir o Pix antes de criar uma única cobrança: %s',async scene=>{
  let attempts=0;const state:Server={tab:makeTab(),pixEnabled:true}
  state.post=(_path,body)=>{attempts++;if(attempts===1)return json({detail:'Confira o CPF ou CNPJ do pagador.'},400);const row={...payment(body,'Pending'),providerId:'provider-payment-a'};state.tab={...state.tab,pending:12.5,payable:0,payments:[row]};return json(row)}
  const fetchMock=server(state);mount(scene==='cliente'?'/cliente#token=own-secret':'/atendimento/receber/tab-a')
  if(scene==='cliente'){
    fireEvent.click(await screen.findByRole('button',{name:'Pagar'}))
    fireEvent.change(await screen.findByLabelText('Seu nome'),{target:{value:'Pessoa para teste'}})
  }else{
    fireEvent.click(await screen.findByRole('button',{name:/Receber tudo/}))
    const pix=screen.getByRole('button',{name:'Pix'});await waitFor(()=>expect(pix).toBeEnabled());fireEvent.click(pix)
    fireEvent.change(screen.getByLabelText('Nome do pagador'),{target:{value:'Pessoa para teste'}})
  }
  fireEvent.change(screen.getByLabelText('E-mail'),{target:{value:'pessoa@example.com'}})
  fireEvent.change(screen.getByLabelText('CPF / CNPJ'),{target:{value:'123'}})
  fireEvent.click(screen.getByRole('button',{name:'Criar Pix'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Confira o CPF')
  await waitFor(()=>expect(screen.getByLabelText('CPF / CNPJ')).toBeEnabled())
  expect(state.tab.payments).toHaveLength(0)
  fireEvent.change(screen.getByLabelText('CPF / CNPJ'),{target:{value:'12345678901'}})
  fireEvent.click(screen.getByRole('button',{name:'Criar Pix'}))
  expect(await screen.findByRole('heading',{name:'Esperando o Pix'})).toBeInTheDocument()
  const bodies=fetchMock.mock.calls.filter(([,init])=>init?.method==='POST').map(([,init])=>JSON.parse(String(init?.body)))
  expect(bodies.map(body=>body.taxId)).toEqual(['123','12345678901'])
  expect(state.tab.payments).toHaveLength(1);expect(state.tab.paid).toBe(0)
})


it('comanda encerrada permite comprovante sem catálogo nem novo pagamento',async()=>{
  const fetchMock=server({tab:{...makeTab(),state:'Closed',payable:0,due:0,paid:12.5},pixEnabled:false});mount('/cliente#token=own-secret')
  expect(await screen.findByRole('heading',{name:'Comanda encerrada'})).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Pedir'})).toBeDisabled();expect(screen.getByRole('button',{name:'Pagar'})).toBeDisabled()
  expect(screen.getByRole('button',{name:'Salvar ou imprimir comprovante'})).toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([input])=>String(input).endsWith('/catalog'))).toBe(false)
})


it('abre comanda coletiva com responsável confirmado e mostra o vínculo no detalhe',async()=>{
 const bodies:Record<string,unknown>[]=[];const tab=makeTab();
 server({tab,pixEnabled:false,customers:[{id:'customer-a',name:'Cliente Teste',emailHint:'c***@example.com'}],post:async(_,body)=>{bodies.push(body);tab.name=String(body.name);tab.responsible={id:'customer-a',name:'Cliente Teste'};return json(tab)}})
 mount('/atendimento/comandas');fireEvent.click(await screen.findByRole('button',{name:'Abrir comanda'}));
 fireEvent.click(screen.getByLabelText('Vincular responsável com Google'));fireEvent.change(screen.getByLabelText('Buscar responsável'),{target:{value:'Cliente'}});
 fireEvent.click(await screen.findByLabelText('Cliente Teste · c***@example.com'));
 expect(screen.getByRole('button',{name:'Abrir comanda vinculada'})).toBeDisabled();
 fireEvent.click(screen.getByLabelText(/Confirmo que Cliente Teste/));
 fireEvent.change(screen.getByLabelText('Nome da pessoa ou do grupo (opcional)'),{target:{value:'Turma de quinta'}});
 fireEvent.click(screen.getByRole('button',{name:'Abrir comanda vinculada'}));
 expect(await screen.findByText('Responsável: Cliente Teste · Comanda disponível na área do cliente.')).toBeInTheDocument();
 expect(bodies).toHaveLength(1);expect(bodies[0]).toMatchObject({responsibleUserId:'customer-a',name:'Turma de quinta',mode:'Tab',locationId:'bar-a'});
})

it('preserva a abertura incerta após remontar e repete a mesma operação',async()=>{
 const bodies:Record<string,unknown>[]=[];let fail=true;
 server({tab:makeTab(),pixEnabled:false,post:async(_,body)=>{bodies.push(body);if(fail)throw new TypeError('offline');return json(makeTab())}});
 mount('/atendimento/comandas');fireEvent.click(await screen.findByRole('button',{name:'Abrir comanda'}));
 fireEvent.change(screen.getByLabelText('Nome da pessoa ou do grupo (opcional)'),{target:{value:'Visitante Teste'}});
 const button=screen.getByRole('button',{name:'Abrir sem vínculo financeiro'});await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);
 expect(await screen.findByText(/Não foi possível confirmar esta operação/)).toBeInTheDocument();
 expect(screen.queryByLabelText('Nome da pessoa ou do grupo (opcional)')).not.toBeInTheDocument();
 cleanup();fail=false;mount('/atendimento/comandas');
 fireEvent.click(await screen.findByRole('button',{name:'Conferir abertura'}));
 await waitFor(()=>expect(screen.getByTestId('route')).toHaveTextContent('/atendimento/comandas/tab-a'));
 expect(bodies).toHaveLength(2);expect(bodies[1]).toEqual(bodies[0]);expect(bodies[0]).not.toHaveProperty('responsibleUserId');
})

it('mudar a busca remove o responsável e exige nova seleção',async()=>{
 server({tab:makeTab(),pixEnabled:false,customers:[{id:'customer-a',name:'Cliente Teste',emailHint:'c***@example.com'}]});mount('/atendimento/comandas');
 fireEvent.click(await screen.findByRole('button',{name:'Abrir comanda'}));fireEvent.click(screen.getByLabelText('Vincular responsável com Google'));
 fireEvent.change(screen.getByLabelText('Buscar responsável'),{target:{value:'Cliente'}});
 fireEvent.click(await screen.findByLabelText('Cliente Teste · c***@example.com'));fireEvent.click(screen.getByLabelText(/Confirmo que Cliente Teste/));
 fireEvent.change(screen.getByLabelText('Buscar responsável'),{target:{value:'Outro'}});
 expect(screen.getByRole('button',{name:'Abrir comanda vinculada'})).toBeDisabled();expect(screen.queryByLabelText(/Confirmo que/)).not.toBeInTheDocument();
})


it('consulta encerradas preservando situação e busca na paginação e no retorno',async()=>{
 const tab={...makeTab(),state:'Closed',closedAtUtc:'2026-10-05T15:00:00Z',due:0,payable:0};const requests=server({tab,pixEnabled:false});
 mount('/atendimento/comandas?busca=104&pagina=2');fireEvent.click(screen.getByRole('button',{name:'Encerradas'}));
 await waitFor(()=>expect(requests.mock.calls.some(([url])=>String(url).includes('state=Closed&search=104&page=1'))).toBe(true));
 fireEvent.click(await screen.findByRole('button',{name:'Próxima'}));
 await waitFor(()=>expect(requests.mock.calls.some(([url])=>String(url).includes('state=Closed&search=104&page=2'))).toBe(true));
 fireEvent.click(await screen.findByRole('link',{name:/104.*Consultar comanda/}));
 await screen.findByRole('heading',{name:'Comanda 104'});
 const back=new URL(screen.getByRole('link',{name:'Voltar'}).getAttribute('href')!,'https://test.invalid');
 expect(back.searchParams.get('situacao')).toBe('Closed');expect(back.searchParams.get('busca')).toBe('104');expect(back.searchParams.get('pagina')).toBe('2');
 expect(screen.queryByRole('link',{name:'Receber'})).not.toBeInTheDocument();expect(screen.queryByRole('link',{name:'Adicionar produtos'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Encerrar comanda'})).not.toBeInTheDocument();
 expect(screen.getByText('Nenhum consumo registrado nesta comanda.')).toBeInTheDocument();
})

it('filtra todas e com pedidos no servidor sem descartar a busca',async()=>{
 const requests=server({tab:makeTab(),pixEnabled:false});mount('/atendimento/comandas?busca=104');
 fireEvent.click(screen.getByRole('button',{name:'Todas'}));await waitFor(()=>expect(requests.mock.calls.some(([url])=>String(url).includes('state=&search=104&page=1'))).toBe(true));
 fireEvent.click(screen.getByRole('button',{name:'Com pedidos'}));await waitFor(()=>expect(requests.mock.calls.some(([url])=>String(url).includes('state=Orders&search=104&page=1'))).toBe(true));
 expect(screen.getByRole('button',{name:'Com pedidos'})).toHaveAttribute('aria-pressed','true');
})

it('fila mostra espera desde o aceite e retorna à mesma página',async()=>{
 const tab=makeTab();tab.items=[{id:'order-a',tabId:tab.id,productId:'water',name:'Água',quantity:1,unitPrice:5,total:5,state:'Accepted',source:'Attendant',createdAtUtc,acceptedAtUtc:'2026-10-04T16:00:00Z',allowedActions:['fulfill']}];server({tab,pixEnabled:false});
 mount('/atendimento/pedidos?pagina=2');await screen.findByText(/Aguardando entrega há/);
 fireEvent.click(screen.getByRole('link',{name:'Comanda 104 Visitante'}));await screen.findByRole('heading',{name:'Comanda 104'});
 expect(screen.getByRole('link',{name:'Voltar'})).toHaveAttribute('href','/atendimento/pedidos?pagina=2');
})

it('identifica a comanda e o responsável na escolha e revisão e envia somente para esse destino',async()=>{
 const tab={...makeTab(),name:'Grupo de teste',responsible:{id:'customer-a',name:'Responsável Teste'}};
 const state:Server={tab,pixEnabled:false,post:()=>json(tab)};const requests=server(state);mount('/atendimento/vender?comanda=tab-a');
 const destination=await screen.findByRole('region',{name:'Destino do pedido'});
 expect(within(destination).getByRole('heading',{name:'Comanda 104 · Grupo de teste'})).toBeInTheDocument();
 expect(within(destination).getByText('Responsável: Responsável Teste')).toBeInTheDocument();
 expect(within(destination).getByText(/Saldo atual/)).toHaveTextContent('12,50');
 fireEvent.click(await screen.findByRole('button',{name:/Adicionar Água por/}));fireEvent.click(screen.getByRole('button',{name:'Conferir pedido'}));
 expect(within(screen.getByRole('region',{name:'Destino do pedido'})).getByText('Responsável: Responsável Teste')).toBeInTheDocument();
 expect(screen.getByText('1 × Água')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Adicionar à comanda'}));
 expect(await screen.findByRole('heading',{name:'Comanda 104'})).toBeInTheDocument();
 const posts=requests.mock.calls.filter(([,init])=>init?.method==='POST');expect(posts).toHaveLength(1);
 expect(posts[0][0]).toBe('/api/v1/bar/tabs/tab-a/items');expect(JSON.parse(String(posts[0][1]?.body))).toMatchObject({items:[{productId:'water',quantity:1}],deliver:false});
 expect(localStorage.getItem(`lb-cart:${actor.id}:tab-a`)).toBe('[]');
});

it('o nome da comanda não implica responsável e venda avulsa não herda a identidade',async()=>{
 server({tab:{...makeTab(),name:'Grupo de teste'},pixEnabled:false});mount('/atendimento/vender?comanda=tab-a');
 expect(await screen.findByText('Sem responsável vinculado à área do cliente.')).toBeInTheDocument();
 cleanup();mount('/atendimento/vender');
 expect(await screen.findByRole('heading',{name:'Venda avulsa'})).toBeInTheDocument();
 expect(screen.getByText('Nova comanda sem responsável ao registrar.')).toBeInTheDocument();
 expect(screen.queryByText('Grupo de teste')).not.toBeInTheDocument();
});

it('transfere apenas o rascunho após confirmar o destino dentro da tela',async()=>{
 const requests=server({tab:makeTab(),pixEnabled:false});mount('/atendimento/vender');
 fireEvent.click(await screen.findByRole('button',{name:/Adicionar Água por/}));
 fireEvent.click(screen.getByRole('button',{name:'Escolher uma comanda'}));
 fireEvent.click(await screen.findByRole('button',{name:'Comanda 104 · Visitante'}));
 expect(localStorage.getItem(`lb-cart:${actor.id}:sale`)).toContain('water');
 fireEvent.click(screen.getByRole('button',{name:'Confirmar destino e mover rascunho'}));
 expect(await screen.findByRole('heading',{name:'Comanda 104 · Visitante'})).toBeInTheDocument();
 expect(await screen.findByLabelText('Quantidade de Água')).toHaveTextContent('1');
 expect(localStorage.getItem(`lb-cart:${actor.id}:sale`)).toBeNull();
 expect(requests.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
});

it('comanda encerrada conserva o rascunho mas não oferece registro nem produtos',async()=>{
 sessionStorage.setItem(`lb-cart:${actor.id}:tab-a`,'[{"productId":"water","quantity":1}]');
 const requests=server({tab:{...makeTab(),state:'Closed'},pixEnabled:false});mount('/atendimento/vender?comanda=tab-a');
 expect(await screen.findByText(/Esta comanda está encerrada/)).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:/Registrar|Adicionar Água|Conferir pedido/})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Trocar comanda'})).toBeInTheDocument();
 expect(localStorage.getItem(`lb-cart:${actor.id}:tab-a`)).toBe('[{"productId":"water","quantity":1}]');
 expect(requests.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
});

it('falha ao atualizar a comanda bloqueia envio mesmo com dados anteriores em cache',async()=>{
 const requests=server({tab:makeTab(),pixEnabled:false});const query=mount('/atendimento/vender?comanda=tab-a');
 fireEvent.click(await screen.findByRole('button',{name:/Adicionar Água por/}));fireEvent.click(screen.getByRole('button',{name:'Conferir pedido'}));
 requests.mockImplementation(async input=>String(input).endsWith('/tabs/tab-a')?json({detail:'Comanda indisponível.'},503):String(input).includes('/catalog')?json(products):json([{id:'bar-a',name:'Bar'}]));
 await act(async()=>{await query.invalidateQueries({queryKey:['bar-runtime']})});
 expect(await screen.findByRole('alert')).toHaveTextContent('Comanda indisponível.');
 expect(screen.queryByRole('region',{name:'Destino do pedido'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Adicionar à comanda'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Entregar e receber'})).not.toBeInTheDocument();
 expect(localStorage.getItem(`lb-cart:${actor.id}:tab-a`)).toBe('[{"productId":"water","quantity":1}]');
 expect(requests.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
});


it('recebimento identifica responsável e mostra saldo projetado sem considerar pendência como pago',async()=>{
 const state:Server={tab:{...makeTab(),name:'Grupo da manhã',responsible:{id:'person-a',name:'Responsável teste'},total:100,due:100,payable:80,pending:20},pixEnabled:false};server(state);mount('/atendimento/receber/tab-a');
 expect(await screen.findByRole('heading',{name:'Comanda 104 · Grupo da manhã'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Receber uma parte'}));fireEvent.change(screen.getByLabelText('Valor desta parte (R$)'),{target:{value:'30'}});fireEvent.click(screen.getByRole('button',{name:'Dinheiro'}));
 expect(screen.getAllByText(/Responsável: Responsável teste/)).toHaveLength(2);
 expect(screen.getByText(/Após a confirmação/)).toHaveTextContent(/70,00.*inclui pagamentos que ainda aguardam/);
});

it('recebimento bloqueia comanda encerrada mesmo com saldo antigo',async()=>{
 const fetchMock=server({tab:{...makeTab(),state:'Closed'},pixEnabled:false});mount('/atendimento/receber/tab-a');
 expect(await screen.findByRole('heading',{name:'Atendimento encerrado'})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:/Receber tudo/})).not.toBeInTheDocument();
 expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
});

it('falha de atualização bloqueia recebimento mesmo com saldo em cache',async()=>{
 const mock=server({tab:makeTab(),pixEnabled:false});const query=mount('/atendimento/receber/tab-a');
 fireEvent.click(await screen.findByRole('button',{name:/Receber tudo/}));fireEvent.click(screen.getByRole('button',{name:'Dinheiro'}));
 mock.mockImplementation(async input=>String(input).endsWith('/tabs/tab-a')?json({detail:'Consulta indisponível'},503):json([]));
 await act(async()=>{await query.invalidateQueries({queryKey:['bar-runtime',actor.id,'/tabs/tab-a']})});
 expect(await screen.findByText(/Novos recebimentos ficam bloqueados/)).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Confirmar recebimento'})).not.toBeInTheDocument();
});

it('comprovante parcial identifica responsável e oferece receber restante na mesma comanda',async()=>{
 const row=payment({method:'Cash',amount:5,tendered:10});
 server({tab:{...makeTab(),responsible:{id:'person-a',name:'Responsável teste'},paid:5,due:7.5,payable:7.5,payments:[row]},pixEnabled:false});mount('/atendimento/comprovante/tab-a/payment-a',actor,true);
 expect(await screen.findByText('Responsável: Responsável teste')).toBeInTheDocument();
 expect(screen.getByRole('link',{name:/Receber restante/})).toHaveAttribute('href','/atendimento/receber/tab-a');
 expect(screen.queryByRole('button',{name:'Encerrar comanda'})).not.toBeInTheDocument();
});

it.each(['entrega','aceite','pagamento','estorno'] as const)('quitação não libera encerramento quando há pendência de %s',async kind=>{
 const row=payment({method:'Cash',amount:12.5});
 const tab={...makeTab(),due:0,payable:0,paid:12.5,payments:[{...row,refundPending:kind==='estorno'?5:0}],pending:kind==='pagamento'?5:0,allowedActions:['close']};
 if(kind==='entrega'||kind==='aceite')tab.items=[{id:'item-a',tabId:tab.id,productId:'water',name:'Água',quantity:1,unitPrice:12.5,total:12.5,state:kind==='entrega'?'Accepted':'Requested',source:'Operator',createdAtUtc,allowedActions:[]}];
 server({tab,pixEnabled:false});mount('/atendimento/comprovante/tab-a/payment-a',actor,true);
 expect(await screen.findByRole('link',{name:'Conferir pendências'})).toHaveAttribute('href','/atendimento/comandas/tab-a');
 expect(screen.queryByRole('button',{name:'Encerrar comanda'})).not.toBeInTheDocument();
});

it('encerramento confirma a comanda e repete a mesma operação após resposta perdida',async()=>{
 const row=payment({method:'Cash',amount:12.5});let attempts=0;
 const state:Server={tab:{...makeTab(),due:0,payable:0,paid:12.5,payments:[row],allowedActions:['close']},pixEnabled:false};
 state.post=(path)=>{expect(path).toContain('/tabs/tab-a/close');attempts++;if(attempts===1)return json({detail:'Resposta perdida'},502);state.tab={...state.tab,state:'Closed',closedAtUtc:createdAtUtc,allowedActions:[],history:[{id:'close-a',kind:'Closed',amount:0,createdAtUtc}]};return json(state.tab)};
 const mock=server(state);mount('/atendimento/comprovante/tab-a/payment-a',actor,true);
 fireEvent.click(await screen.findByRole('button',{name:'Encerrar comanda'}));
 expect(screen.getByText(/Encerrar a comanda 104/)).toHaveTextContent('O acesso pelo QR será encerrado');
 fireEvent.click(screen.getByRole('button',{name:'Continuar atendimento'}));expect(mock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Encerrar comanda'}));fireEvent.click(screen.getByRole('button',{name:'Confirmar encerramento'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Resposta perdida');
 await waitFor(()=>expect(screen.getByRole('button',{name:'Confirmar encerramento'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Confirmar encerramento'}));
 expect(await screen.findByRole('heading',{name:'Atendimento encerrado'})).toBeInTheDocument();
 const bodies=mock.mock.calls.filter(([,init])=>init?.method==='POST').map(([,init])=>JSON.parse(String(init?.body)));expect(bodies).toHaveLength(2);expect(bodies[1]).toEqual(bodies[0]);
});

it('consulta sem permissão de operação não oferece recebimento ou encerramento no comprovante',async()=>{
 const row=payment({method:'Cash',amount:12.5});server({tab:{...makeTab(),due:0,payable:0,paid:12.5,payments:[row],allowedActions:['close']},pixEnabled:false});
 mount('/atendimento/comprovante/tab-a/payment-a',{...actor,permissions:['bar:sales:read']},true);
 expect(await screen.findByRole('heading',{name:'Situação da comanda'})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Encerrar comanda'})).not.toBeInTheDocument();expect(screen.queryByRole('link',{name:/Receber restante/})).not.toBeInTheDocument();
});

it('pagamento pendente consultado por endereço não aparece como valor recebido',async()=>{
 server({tab:{...makeTab(),pending:12.5,payable:0,payments:[payment({method:'Pix',amount:12.5},'Pending')]},pixEnabled:false});mount('/atendimento/comprovante/tab-a/payment-a',actor,true);
 expect(await screen.findByText('Valor do pagamento não confirmado')).toBeInTheDocument();expect(screen.queryByText('Valor recebido')).not.toBeInTheDocument();
});

it('preserva observação ao alterar quantidade e enviar o pedido', async () => {
  const state:Server={tab:makeTab(),pixEnabled:false,post:()=>json(makeTab())}
  const fetchMock=server(state);mount('/atendimento/vender?comanda=tab-a')
  fireEvent.click(await screen.findByRole('button',{name:/Adicionar Água por/}))
  fireEvent.change(screen.getByLabelText('Observações para Água'),{target:{value:'Sem gelo'}})
  fireEvent.click(screen.getByRole('button',{name:'Adicionar uma unidade de Água'}))
  fireEvent.click(screen.getByRole('button',{name:'Conferir pedido'}))
  expect(screen.getAllByDisplayValue('Sem gelo').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button',{name:'Adicionar à comanda'}))
  await waitFor(()=>expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1))
  expect(JSON.parse(String(fetchMock.mock.calls.find(([,init])=>init?.method==='POST')![1]?.body))).toMatchObject({items:[{productId:'water',quantity:2,notes:'Sem gelo'}]})
})
it('recebe uma divisão com centavos usando o saldo disponível', async () => {
  const state:Server={tab:{...makeTab(),total:10,due:10,payable:10},pixEnabled:false,post:(_path,body)=>json(payment(body))}
  const fetchMock=server(state);mount('/atendimento/receber/tab-a')
  fireEvent.click(await screen.findByRole('button',{name:'Dividir entre pessoas'}))
  fireEvent.change(screen.getByLabelText('Pessoas que ainda vão pagar'),{target:{value:'3'}})
  fireEvent.click(screen.getByRole('button',{name:'Crédito na maquininha'}))
  fireEvent.click(screen.getByLabelText('A maquininha confirmou a aprovação'))
  fireEvent.click(screen.getByRole('button',{name:'Confirmar recebimento'}))
  await screen.findByRole('heading',{name:'Comprovante recebido'})
  expect(JSON.parse(String(fetchMock.mock.calls.find(([,init])=>init?.method==='POST')![1]?.body))).toMatchObject({amount:3.34})
})


it('oferece atalhos na lista sem registrar consumo nem pagamento', async()=>{
 const calls=server({tab:makeTab(),pixEnabled:false});mount('/atendimento/comandas');
 expect(await screen.findByRole('link',{name:'Adicionar produtos à comanda 104'})).toHaveAttribute('href','/atendimento/vender?comanda=tab-a');
 expect(screen.getByRole('link',{name:'Receber comanda 104'})).toHaveAttribute('href','/atendimento/receber/tab-a');
 expect(calls.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
});
it('abre e vai direto aos produtos com uma única gravação',async()=>{
 const calls=server({tab:makeTab(),pixEnabled:false,post:async()=>json(makeTab())});mount('/atendimento/comandas');
 fireEvent.click(await screen.findByRole('button',{name:'Abrir comanda'}));
 const submit=screen.getByRole('button',{name:'Abrir e adicionar produtos'});await waitFor(()=>expect(submit).toBeEnabled());fireEvent.click(submit);
 await waitFor(()=>expect(screen.getByTestId('route')).toHaveTextContent('/atendimento/vender?comanda=tab-a'));
 const writes=calls.mock.calls.filter(([,init])=>init?.method==='POST');expect(writes).toHaveLength(1);
 expect(JSON.parse(String(writes[0][1]?.body))).not.toHaveProperty('addProducts');
});
it('seleciona saldo disponível ao receber sem criar pagamento',async()=>{
 const calls=server({tab:{...makeTab(),due:12.5,pending:5,payable:7.5},pixEnabled:false});mount('/atendimento/receber/tab-a');
 expect(await screen.findByRole('button',{name:/Receber tudo/})).toHaveAttribute('aria-pressed','true');
 expect(screen.getByRole('button',{name:'Dinheiro'})).toBeEnabled();
 expect(calls.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
});
it('reconsulta a lista ao voltar mesmo dentro dos 30 segundos do cache global',async()=>{
 const state={tab:makeTab(),pixEnabled:false};server(state);mount('/atendimento/comandas',actor,false,30000);
 fireEvent.click(await screen.findByRole('link',{name:/104.*Abrir comanda/}));await screen.findByRole('heading',{name:'Comanda 104'});
 state.tab={...state.tab,due:25,total:25,payable:25};fireEvent.click(screen.getByRole('link',{name:'Voltar'}));
 await waitFor(()=>expect(screen.getByText(/25,00/)).toBeInTheDocument());
});

it.each([['Débito na maquininha','Debit'],['Crédito na maquininha','Credit'],['Pix na maquininha','Pix']])('registra %s sem integração bancária nem dados de cartão',async(label,mode)=>{
 const state:Server={tab:makeTab(),pixEnabled:false,post:(_,body)=>json(payment(body))};const requests=server(state);mount('/atendimento/receber/tab-a');
 fireEvent.click(await screen.findByRole('button',{name:label}));
 expect(screen.queryByLabelText(/Número do cartão/)).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Confirmar recebimento'})).toBeDisabled();
 fireEvent.click(screen.getByLabelText('A maquininha confirmou a aprovação'));fireEvent.click(screen.getByRole('button',{name:'Confirmar recebimento'}));
 await screen.findByRole('heading',{name:'Comprovante recebido'});
 const writes=requests.mock.calls.filter(([,init])=>init?.method==='POST');expect(writes).toHaveLength(1);
 expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({method:'TerminalManual',terminalType:mode,terminalApproved:true,amount:12.5});
});

it('pagamento incerto sobrevive ao recarregamento e repete exatamente a mesma operação',async()=>{
 let attempts=0;const state:Server={tab:makeTab(),pixEnabled:false,post:(_,body)=>++attempts===1?json({detail:'Resposta perdida'},503):json(payment(body))};
 const requests=server(state);const query=mount('/atendimento/receber/tab-a');
 fireEvent.click(await screen.findByRole('button',{name:'Débito na maquininha'}));fireEvent.click(screen.getByLabelText('A maquininha confirmou a aprovação'));fireEvent.click(screen.getByRole('button',{name:'Confirmar recebimento'}));
 await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Confirmar recebimento'})).toBeDisabled();
 cleanup();query.clear();mount('/atendimento/receber/tab-a');
 const retry=await screen.findByRole('button',{name:'Consultar ou repetir confirmação'});await waitFor(()=>expect(retry).toBeEnabled());
 fireEvent.click(retry);await screen.findByRole('heading',{name:'Comprovante recebido'});
 const writes=requests.mock.calls.filter(([,init])=>init?.method==='POST').map(([,init])=>JSON.parse(String(init?.body)));expect(writes).toHaveLength(2);expect(writes[1]).toEqual(writes[0]);
 expect(localStorage.getItem(`lb-payment-v1:${actor.id}:tab-a`)).toBeNull();
});

it('destino com rascunho oferece retomada sem substituir nenhum dos pedidos',async()=>{
 localStorage.setItem(`lb-cart:${actor.id}:tab-a`,JSON.stringify([{productId:'water',quantity:2}]));
 server({tab:makeTab(),pixEnabled:false});mount('/atendimento/vender');fireEvent.click(await screen.findByRole('button',{name:/Adicionar Água por/}));
 fireEvent.click(screen.getByRole('button',{name:'Escolher uma comanda'}));fireEvent.click(await screen.findByRole('button',{name:'Comanda 104 · Visitante'}));
 expect(screen.queryByRole('button',{name:'Confirmar destino e mover rascunho'})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Retomar rascunho existente'}));
 expect(await screen.findByLabelText('Quantidade de Água')).toHaveTextContent('2');expect(JSON.parse(localStorage.getItem(`lb-cart:${actor.id}:sale`)!)).toEqual([{productId:'water',quantity:1}]);
});

it('busca ignora acentos e reconexão exige nova conferência do preço antes do registro',async()=>{
 const state:Server={tab:makeTab(),pixEnabled:false,post:()=>json(makeTab())};const requests=server(state);mount('/atendimento/vender?comanda=tab-a');
 fireEvent.change(await screen.findByRole('searchbox',{name:'Procurar produto'}),{target:{value:'agua'}});
 fireEvent.click(await screen.findByRole('button',{name:/Adicionar Água por/}));fireEvent.click(screen.getByRole('button',{name:'Conferir pedido'}));
 Object.defineProperty(navigator,'onLine',{configurable:true,value:false});act(()=>window.dispatchEvent(new Event('offline')));
 expect(screen.getByRole('button',{name:'Adicionar à comanda'})).toBeDisabled();expect(localStorage.getItem(`lb-cart:${actor.id}:tab-a`)).toContain('water');
 state.catalog=[{...products[0],salePrice:7}];Object.defineProperty(navigator,'onLine',{configurable:true,value:true});act(()=>window.dispatchEvent(new Event('online')));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Adicionar à comanda'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Adicionar à comanda'}));expect(await screen.findByRole('alert')).toHaveTextContent('Confira o resumo');expect(requests.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Adicionar à comanda'}));await screen.findByRole('heading',{name:'Comanda 104'});
});

it('armazenamento indisponível mantém edição visível mas impede enviar um pedido sem recuperação',async()=>{
 server({tab:makeTab(),pixEnabled:false});vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('QuotaExceeded')});mount('/atendimento/vender');
 fireEvent.click(await screen.findByRole('button',{name:/Adicionar Água por/}));
 expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível guardar o rascunho');
 expect(screen.getByText('1 × Água')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Conferir pedido'})).toBeDisabled();
});

it('retomada online fica fora do balcão e mantém identificador, valor e modalidade originais',async()=>{
 const original={...payment({method:'Pix',amount:7.5,operationId:'old-online'},'Pending'),canResume:true};const state:Server={tab:{...makeTab(),payments:[original],pending:7.5,payable:5},pixEnabled:true,post:(_,body)=>json({...payment(body,'Pending'),canResume:false,pixText:'Pix fictício'})};const requests=server(state);mount('/atendimento/receber/tab-a?paymentId=payment-a');
 const link=await screen.findByRole('link',{name:'Consultar ou retomar pagamento online existente'});expect(screen.queryByLabelText('CPF / CNPJ')).not.toBeInTheDocument();fireEvent.click(link);
 await screen.findByRole('heading',{name:'Pagamento online existente'});await waitFor(()=>expect(screen.getByRole('button',{name:'Retomar sem cobrar novamente'})).toBeEnabled());fireEvent.change(screen.getByLabelText('Nome do pagador'),{target:{value:'Pessoa fictícia'}});fireEvent.change(screen.getByLabelText('E-mail'),{target:{value:'teste@example.invalid'}});fireEvent.change(screen.getByLabelText('CPF / CNPJ'),{target:{value:'12345678901'}});fireEvent.click(screen.getByRole('button',{name:'Retomar sem cobrar novamente'}));
 await waitFor(()=>expect(requests.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1));const body=JSON.parse(String(requests.mock.calls.find(([,init])=>init?.method==='POST')![1]?.body));expect(body).toMatchObject({method:'Pix',amount:7.5,operationId:'old-online'});expect(JSON.stringify(localStorage)).not.toContain('teste@example.invalid');
});

const identified={id:'canonical-customer',name:'Pessoa de exemplo',phoneHint:'',incomplete:true}
async function chooseIdentified(label:string){
 fireEvent.change(screen.getByRole('searchbox',{name:label}),{target:{value:'Pessoa'}})
 fireEvent.click(await screen.findByRole('button',{name:'Pessoa de exemplo · Telefone pendente · Cadastro incompleto · Ref. CUSTOMER'}))
}
it('identificação cadastral opcional abre comanda sem criar responsável financeiro',async()=>{
 const bodies:Record<string,unknown>[]=[];const state:Server={tab:makeTab(),pixEnabled:false,customerLookups:[identified],post:(_,body)=>{bodies.push(body);state.tab.customer=identified;return json(state.tab)}}
 server(state);mount('/atendimento/comandas');fireEvent.click(await screen.findByRole('button',{name:'Abrir comanda'}));await chooseIdentified('Buscar cliente identificado')
 fireEvent.click(screen.getByRole('button',{name:'Abrir sem vínculo financeiro'}));await screen.findByRole('heading',{name:'Comanda 104'});expect(bodies).toHaveLength(1);expect(bodies[0]).toMatchObject({customerId:identified.id,mode:'Tab'});expect(bodies[0]).not.toHaveProperty('responsibleUserId');expect(screen.getByText('Sem responsável vinculado à área do cliente.')).toBeInTheDocument();expect(screen.getByText(/Telefone pendente no cadastro anterior/)).toBeInTheDocument()
})
it('venda avulsa preserva cliente e operação incerta após remontar sem vincular Google',async()=>{
 const opens:Record<string,unknown>[]=[];let fail=true
 server({tab:makeTab(),pixEnabled:false,customerLookups:[identified],post:(path,body)=>{if(path.endsWith('/tabs')){opens.push(body);if(fail)throw new TypeError('interrupted')}return json({...makeTab(),mode:'Immediate',customer:identified})}})
 let client=mount('/atendimento/vender');await chooseIdentified('Buscar cliente da venda');fireEvent.click(await screen.findByRole('button',{name:/Adicionar Água por/}));cleanup();client.clear();client=mount('/atendimento/vender');await screen.findByText(identified.name);await screen.findByLabelText('Quantidade de Água');fireEvent.click(screen.getByRole('button',{name:'Conferir pedido'}));fireEvent.click(screen.getByRole('button',{name:'Entregar e receber'}));await screen.findByText(/Não foi possível confirmar esta operação/)
 cleanup();client.clear();fail=false;mount('/atendimento/vender');const retry=await screen.findByRole('button',{name:'Entregar e receber'});await waitFor(()=>expect(retry).toBeEnabled());fireEvent.click(retry);await waitFor(()=>expect(screen.getByTestId('route')).toHaveTextContent('/atendimento/receber/tab-a'));expect(opens).toHaveLength(2);expect(opens[1]).toEqual(opens[0]);expect(opens[0]).toMatchObject({customerId:identified.id,mode:'Immediate'});expect(opens[0]).not.toHaveProperty('responsibleUserId')
})
it('identificação antes de receber repete mesma intenção e versão após resposta interrompida',async()=>{
 const writes:Record<string,unknown>[]=[];const state:Server={tab:makeTab(),pixEnabled:false,customerLookups:[identified],put:(path,body)=>{expect(path).toBe('/api/v1/bar/tabs/tab-a/customer');writes.push(body);state.tab={...state.tab,version:3,customer:identified};if(writes.length===1)throw new TypeError('interrupted');return json(state.tab)}}
 server(state);const client=mount('/atendimento/receber/tab-a');await screen.findByRole('heading',{name:'Cliente identificado'});expect(screen.queryByText('A identificação cadastral não concede acesso à comanda nem altera quem responde pelo pagamento.')).not.toBeInTheDocument();fireEvent.click(await screen.findByRole('button',{name:'Identificar cliente (opcional)'}));expect(screen.getByText('A identificação cadastral não concede acesso à comanda nem altera quem responde pelo pagamento.')).toBeVisible();await chooseIdentified('Buscar cliente da comanda');const save=screen.getByRole('button',{name:'Salvar identificação'});act(()=>{fireEvent.click(save);fireEvent.click(save)});await screen.findByText(/Não foi possível confirmar esta operação/);expect(writes).toHaveLength(1)
 cleanup();client.clear();mount('/atendimento/receber/tab-a');const retry=await screen.findByRole('button',{name:'Conferir identificação'});await waitFor(()=>expect(retry).toBeEnabled());fireEvent.click(retry);await screen.findByText(/Identificação atualizada/);expect(writes).toHaveLength(2);expect(writes[1]).toEqual(writes[0]);expect(writes[0]).toEqual({operationId:expect.any(String),customerId:identified.id,expectedVersion:1});expect(writes[0]).not.toHaveProperty('responsibleUserId')
})
it('conflito na identificação atualiza versão e permite conferência explícita sem perder seleção',async()=>{
 const writes:Record<string,unknown>[]=[];const state:Server={tab:makeTab(),pixEnabled:false,customerLookups:[identified],put:(_,body)=>{writes.push(body);if(writes.length===1){state.tab={...state.tab,version:5};return json({message:'Comanda mudou. Confira os dados atuais.'},409)}state.tab={...state.tab,version:6,customer:identified};return json(state.tab)}}
 server(state);mount('/atendimento/comandas/tab-a');fireEvent.click(await screen.findByRole('button',{name:'Identificar cliente (opcional)'}));await chooseIdentified('Buscar cliente da comanda');fireEvent.click(screen.getByRole('button',{name:'Salvar identificação'}));await screen.findByText('Comanda mudou. Confira os dados atuais.');const retry=screen.getByRole('button',{name:'Salvar identificação'});await waitFor(()=>expect(retry).toBeEnabled());fireEvent.click(retry);await screen.findByText(/Identificação atualizada/);expect(writes.map(w=>w.expectedVersion)).toEqual([1,5]);expect(writes[1].operationId).not.toBe(writes[0].operationId)
})
it('retirar identificação conserva responsável financeiro e permite atendimento anônimo',async()=>{
 const writes:Record<string,unknown>[]=[];const responsible={id:'google-payer',name:'Responsável de exemplo'};const state:Server={tab:{...makeTab(),customer:identified,responsible},pixEnabled:false,put:(_,body)=>{writes.push(body);state.tab={...state.tab,version:2,customer:null};return json(state.tab)}}
 server(state);mount('/atendimento/comandas/tab-a');fireEvent.click(await screen.findByRole('button',{name:'Alterar identificação'}));fireEvent.click(screen.getByRole('button',{name:'Continuar sem identificar'}));fireEvent.click(screen.getByRole('button',{name:'Salvar identificação'}));await screen.findByText(/Identificação atualizada/);expect(writes[0]).toMatchObject({customerId:null,expectedVersion:1});expect(writes[0]).not.toHaveProperty('responsibleUserId');expect(state.tab.responsible).toEqual(responsible)
})
it('sem operação ou com pagamento pendente não oferece alterar identificação',async()=>{
 const state:Server={tab:{...makeTab(),customer:identified},pixEnabled:false};const requests=server(state);const client=mount('/atendimento/comandas/tab-a',{...actor,permissions:['bar:sales:read']});await screen.findByRole('heading',{name:'Cliente identificado'});expect(screen.queryByRole('button',{name:'Alterar identificação'})).not.toBeInTheDocument();cleanup();client.clear();state.tab.pending=5;mount('/atendimento/comandas/tab-a');await screen.findByText(/Aguarde a confirmação dos pagamentos pendentes/);expect(screen.queryByRole('button',{name:'Alterar identificação'})).not.toBeInTheDocument();expect(requests.mock.calls.every(([,i])=>i?.method!=='PUT')).toBe(true)
})

it('pedido anônimo pendente anterior ao cadastro único conserva identificadores operacionais',async()=>{
 const openId='11111111-1111-4111-8111-111111111111',addId='22222222-2222-4222-8222-222222222222';const writes:Record<string,unknown>[]=[]
 localStorage.setItem(`lb-cart:${actor.id}:sale`,JSON.stringify([{productId:'water',quantity:1}]));localStorage.setItem(`lb-confirmation:order:${actor.id}:sale`,'deliver');localStorage.setItem(`lb-operation:${actor.id}:cart:sale:open:bar-a:water:1`,openId);localStorage.setItem(`lb-operation:${actor.id}:cart:sale:add:bar-a:water:1:true`,addId)
 server({tab:makeTab(),pixEnabled:false,post:(_,body)=>{writes.push(body);return json(makeTab())}});mount('/atendimento/vender');const retry=await screen.findByRole('button',{name:'Entregar e receber'});await waitFor(()=>expect(retry).toBeEnabled());fireEvent.click(retry);await waitFor(()=>expect(writes).toHaveLength(2));expect(writes.map(w=>w.operationId)).toEqual([openId,addId]);expect(writes[0]).not.toHaveProperty('customerId')
})


it('gera o QR por ação explícita e mantém validade e destinatário visíveis',async()=>{
 const requests=server({tab:makeTab(),pixEnabled:false,post:(path)=>{if(path.endsWith('/access'))return json({token:'preview-access-token',expiresAtUtc:'2030-10-04T15:30:00Z'});throw new Error('Operação inesperada')}})
 mount('/atendimento/comandas/tab-a');await screen.findByRole('heading',{name:'Comanda 104'});
 fireEvent.click(screen.getByText('Acesso do cliente',{exact:true}));
 fireEvent.click(screen.getByRole('button',{name:'Gerar QR Code'}));
 const link=await screen.findByRole('link',{name:'Abrir catálogo do cliente'});
 expect(link).toHaveAttribute('href','/cliente#token=preview-access-token');
 expect(screen.getByText(/Válido até.*Compartilhe somente com esta pessoa/)).toBeVisible();
 expect(screen.getByRole('button',{name:'Encerrar acesso'})).toBeEnabled();
 expect(requests.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
})


it('caixa próprio conserva responsável, dinheiro e bloqueio de diferença para o Gestor',async()=>{
 const requests=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,_init)=>{
   const path=String(input)
   if(path.endsWith('/cash/sessions'))return json([{id:'session-a',registerId:'register-a',locationId:'bar-a',openedBy:actor.id,state:'Open',opening:20,expected:50,createdAtUtc,terminal:'Atendimento'}])
   if(path.endsWith('/cash/current'))return json({id:'session-a',responsible:actor.name})
   if(path.endsWith('/cash/locations'))return json([{id:'bar-a',name:'Bar'}])
   if(path.endsWith('/cash/sessions/session-a/details'))return json({terminalReceipts:[{terminalType:'Credit',amount:120,refunded:20}]})
   throw new Error(path)
 })
 mount('/atendimento/caixa');await screen.findByRole('heading',{name:'Caixa aberto'});
 expect(screen.getByText('Responsável: Atendente')).toBeVisible();
 expect(screen.getByText('Dinheiro inicial')).toBeVisible();expect(screen.getByText('Dinheiro esperado agora')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Fechar caixa'}));
 fireEvent.change(screen.getByLabelText('Dinheiro contado no caixa (R$)'),{target:{value:'40'}});
 expect(await screen.findByRole('alert')).toHaveTextContent('Peça ao Gestor');
 expect(screen.getByRole('alert')).toHaveTextContent('Seu caixa continua aberto');
 expect(screen.getByRole('button',{name:'Confirmar fechamento'})).toBeDisabled();
 expect(screen.getByText('Comandas abertas atravessam turnos. Pagamentos pendentes precisam ser conferidos antes do fechamento.')).toBeVisible();
 expect(requests.mock.calls.every(([,init])=>!init||init.method!=='POST')).toBe(true)
})
