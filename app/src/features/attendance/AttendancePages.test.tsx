import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { setAccessToken, setCsrfToken } from '../../lib/http'
import { SellPage, TabDetailsPage, TabsPage } from './AttendancePages'
import { ReceivePage } from './PaymentPages'
import { ClientPage } from './ClientPage'
import { BarReportPage } from './ReportPages'
import { reportPeriod, reportPeriodError } from './reportPeriod'
import { BarArenaMetrics } from './BarArenaMetrics'
import type { CatalogItem, Named, Tab, TabPayment } from './api'

const actor:AuthUser={id:'operator-a',name:'Atendente',email:'atendente@example.com',roles:['BarOperator'],permissions:['bar:sales:read','bar:sales:operate','bar:cash:operate']}
const createdAtUtc='2026-10-04T15:00:00Z'
const makeTab=():Tab=>({id:'tab-a',number:104,name:'Visitante',mode:'Tab',state:'Open',locationId:'bar-a',actorId:actor.id,total:12.5,paid:0,pending:0,due:12.5,payable:12.5,createdAtUtc,items:[],payments:[],history:[],allowedActions:[]})
const products:CatalogItem[]=[{id:'water',name:'Água mineral',shortName:'Água',categoryId:'drinks',categoryName:'Bebidas',salePrice:5,favorite:true,displayOrder:1,available:2,prepared:false},{id:'juice',name:'Suco',shortName:'Suco',categoryId:'drinks',categoryName:'Bebidas',salePrice:8,favorite:true,displayOrder:2,available:0,prepared:true}]
const payment=(body:Record<string,unknown>,state='Approved'):TabPayment=>({id:'payment-a',tabId:'tab-a',method:String(body.method),amount:Number(body.amount),tendered:Number(body.tendered??body.amount),change:Math.max(0,Number(body.tendered??body.amount)-Number(body.amount)),state,operationId:String(body.operationId),createdAtUtc,confirmedAtUtc:state==='Approved'?createdAtUtc:undefined,expiresAtUtc:'2026-10-04T15:30:00Z',refunded:0,refundPending:0,fee:0})
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})
type Server={tab:Tab;pixEnabled:boolean;catalog?:CatalogItem[];locations?:Named[];post?:(path:string,body:Record<string,unknown>)=>Response|Promise<Response>}
function server(state:Server){return vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  const path=String(input);if(init?.method==='POST'&&state.post)return state.post(path,JSON.parse(String(init.body)))
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
function mount(path:string,user=actor){
  const query=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});clients.push(query)
  const auth:AuthContextValue={user,isBootstrapping:false,signIn:async()=>{},signInWithGoogle:async()=>{},signOut:async()=>{},changePassword:async()=>{}}
  render(<QueryClientProvider client={query}><AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}><RouteState /><Routes><Route path="/" element={<BarArenaMetrics from="2026-10-01" to="2026-10-04" />} /><Route path="/bar/indicadores/:metric" element={<BarReportPage />} /><Route path="/atendimento/vender" element={<SellPage />} /><Route path="/atendimento/comandas" element={<TabsPage />} /><Route path="/atendimento/comandas/:tabId" element={<TabDetailsPage />} /><Route path="/atendimento/receber/:tabId" element={<ReceivePage />} /><Route path="/atendimento/comprovante/:tabId/:paymentId" element={<h1>Comprovante recebido</h1>} /><Route path="/cliente" element={<ClientPage />} /></Routes></MemoryRouter></AuthContext.Provider></QueryClientProvider>)
  return query
}
beforeEach(()=>{sessionStorage.clear();localStorage.clear();setAccessToken(null);setCsrfToken(null)})
afterEach(()=>{clients.splice(0).forEach(query=>query.clear());setAccessToken(null);setCsrfToken(null)})

it('permite alterar quantidade e impede adicionar produto esgotado ou acima do estoque',async()=>{
  server({tab:makeTab(),pixEnabled:false});mount('/atendimento/vender')
  const add=await screen.findByRole('button',{name:/Adicionar Água por/})
  expect(screen.getByRole('button',{name:/Adicionar Suco por.*Esgotado/})).toBeDisabled()
  fireEvent.click(add);expect(screen.getByLabelText('Quantidade de Água')).toHaveTextContent('1')
  fireEvent.click(screen.getByRole('button',{name:'Adicionar uma unidade de Água'}))
  expect(screen.getByLabelText('Quantidade de Água')).toHaveTextContent('2')
  expect(screen.getByRole('button',{name:'Adicionar uma unidade de Água'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'Retirar uma unidade de Água'}))
  fireEvent.click(screen.getByRole('button',{name:'Conferir pedido'}))
  expect(screen.getByText('1 × Água')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Registrar e entregar'})).toBeEnabled()
})

it('seleção de local antecede o catálogo e conserva o local do pedido após recarregar e esvaziar',async()=>{
  const fetchMock=server({tab:makeTab(),pixEnabled:false,locations:[{id:'warehouse-a',name:'Almoxarifado'},{id:'bar-a',name:'Bar'}]})
  const query=mount('/atendimento/vender')
  expect(await screen.findByRole('heading',{name:'Escolha o local de atendimento'})).toBeInTheDocument()
  expect(screen.getByLabelText('Local de atendimento')).toHaveValue('')
  expect(screen.queryByLabelText('Escolher produtos')).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Conferir pedido'})).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([input])=>String(input).includes('/catalog'))).toBe(false)
  fireEvent.change(screen.getByLabelText('Local de atendimento'),{target:{value:'bar-a'}})
  fireEvent.click(await screen.findByRole('button',{name:/Adicionar Água por/}))
  expect(screen.getByLabelText('Local de atendimento')).toBeDisabled()
  cleanup();query.clear();mount('/atendimento/vender')
  expect(await screen.findByLabelText('Quantidade de Água')).toHaveTextContent('1')
  expect(screen.getByLabelText('Local de atendimento')).toHaveValue('bar-a')
  fireEvent.click(screen.getByRole('button',{name:'Retirar uma unidade de Água'}))
  expect(screen.getByLabelText('Local de atendimento')).toBeEnabled()
  expect(screen.getByLabelText('Local de atendimento')).toHaveValue('bar-a')
  const catalogPaths=fetchMock.mock.calls.filter(([input])=>String(input).includes('/catalog')).map(([input])=>String(input))
  expect(catalogPaths.length).toBeGreaterThan(0)
  expect(catalogPaths.every(path=>new URL(path,'https://test.invalid').searchParams.get('locationId')==='bar-a')).toBe(true)
  expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0)
})

it.each(['outro usuário','local removido'] as const)('local salvo é validado antes de mostrar o estoque: %s',async reason=>{
  localStorage.setItem(`lb-cart-location:${reason==='outro usuário'?'operator-b':actor.id}:sale`,reason==='outro usuário'?'bar-a':'removed-location')
  const fetchMock=server({tab:makeTab(),pixEnabled:false,locations:[{id:'warehouse-a',name:'Almoxarifado'},{id:'bar-a',name:'Bar'}]})
  mount('/atendimento/vender')
  await screen.findByRole('heading',{name:'Escolha o local de atendimento'})
  expect(screen.getByLabelText('Local de atendimento')).toHaveValue('')
  expect(fetchMock.mock.calls.some(([input])=>String(input).includes('/catalog'))).toBe(false)
})

it('seleção de local também é obrigatória ao abrir uma comanda com vários locais',async()=>{
  const state:Server={tab:makeTab(),pixEnabled:false,locations:[{id:'warehouse-a',name:'Almoxarifado'},{id:'bar-a',name:'Bar'}]}
  state.post=(_path,body)=>{expect(body).toMatchObject({locationId:'bar-a',mode:'Tab'});return json(state.tab)}
  const fetchMock=server(state);mount('/atendimento/comandas')
  fireEvent.click(await screen.findByRole('button',{name:'Abrir comanda'}))
  const submit=await screen.findByRole('button',{name:'Abrir sem cadastro'})
  expect(submit).toBeDisabled()
  fireEvent.submit(submit.closest('form')!)
  expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0)
  fireEvent.change(screen.getByLabelText('Local'),{target:{value:'bar-a'}})
  expect(submit).toBeEnabled();fireEvent.click(submit)
  expect(await screen.findByRole('heading',{name:'Comanda 104'})).toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
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
  const submit=screen.getByRole('button',{name:'Registrar e entregar'});act(()=>{fireEvent.click(submit);fireEvent.click(submit)})
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
  fireEvent.click(screen.getByRole('button',{name:'Cartão'}))
  expect(screen.queryByLabelText('Dinheiro recebido (R$)')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Confirmar recebimento'})).toBeDisabled()
  fireEvent.click(screen.getByLabelText('A maquininha confirmou a aprovação'))
  const form=screen.getByRole('button',{name:'Confirmar recebimento'}).closest('form')!
  act(()=>{fireEvent.submit(form);fireEvent.submit(form)})
  await waitFor(()=>expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1))
  const body=JSON.parse(String(fetchMock.mock.calls.find(([,init])=>init?.method==='POST')![1]?.body))
  expect(body).toMatchObject({method:'CardManual',amount:12.5,cardApproved:true})
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
  fireEvent.click(screen.getByRole('button',{name:'Cartão'}))
  fireEvent.click(screen.getByLabelText('A maquininha confirmou a aprovação'))
  expect(screen.getByRole('button',{name:'Confirmar recebimento'})).toBeEnabled()
  if(change==='valor')fireEvent.change(screen.getByLabelText('Valor desta parte (R$)'),{target:{value:'8'}})
  if(change==='parte')fireEvent.click(screen.getByRole('button',{name:/Receber tudo/}))
  if(change==='meio'){
    fireEvent.click(screen.getByRole('button',{name:'Dinheiro'}))
    fireEvent.click(screen.getByRole('button',{name:'Cartão'}))
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
  expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({method:'CardManual',amount:change==='valor'?8:change==='parte'?12.5:5,cardApproved:true})
})

it('atualização do saldo por outro atendente invalida a aprovação da maquininha',async()=>{
  const state:Server={tab:makeTab(),pixEnabled:false};const fetchMock=server(state)
  const query=mount('/atendimento/receber/tab-a')
  fireEvent.click(await screen.findByRole('button',{name:/Receber tudo/}))
  fireEvent.click(screen.getByRole('button',{name:'Cartão'}))
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
  const state:Server={tab:makeTab(),pixEnabled:true}
  state.post=(path,body)=>{const row=path.endsWith('/refresh')?{...state.tab.payments[0],state:'Approved',confirmedAtUtc:createdAtUtc}:payment(body,'Pending');state.tab={...state.tab,payments:[row],pending:row.state==='Pending'?12.5:0,paid:row.state==='Approved'?12.5:0,due:row.state==='Approved'?0:12.5,payable:0};return json(row)}
  const fetchMock=server(state);mount('/atendimento/receber/tab-a')
  fireEvent.click(await screen.findByRole('button',{name:/Receber tudo/}));fireEvent.click(await screen.findByRole('button',{name:'Pix'}))
  fireEvent.change(screen.getByLabelText('Nome do pagador'),{target:{value:'Pessoa de teste'}})
  fireEvent.change(screen.getByLabelText('E-mail'),{target:{value:'pessoa@example.com'}})
  fireEvent.change(screen.getByLabelText('CPF / CNPJ'),{target:{value:'12345678901'}})
  const form=screen.getByRole('button',{name:'Criar Pix'}).closest('form')!
  act(()=>{fireEvent.submit(form);fireEvent.submit(form)})
  expect(await screen.findByRole('heading',{name:'Esperando o Pix'})).toBeInTheDocument()
  expect(screen.queryByRole('img',{name:'QR Code para pagar com Pix'})).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Pix copia e cola')).not.toBeInTheDocument()
  expect(screen.queryByText('Pagamento confirmado')).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
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
  fireEvent.click(screen.getByRole('button',{name:'Confirmar recebimento'}))
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
  expect(await screen.findByRole('heading',{name:'Acompanhar pedidos'})).toBeInTheDocument()
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
  const label=scene==='cliente'?'Enviar pedido':'Registrar e entregar'
  fireEvent.click(screen.getByRole('button',{name:label}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Resposta interrompida')
  expect(screen.getByText('1 × Água')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Alterar pedido'})).toBeDisabled()
  if(scene==='atendente')expect(screen.getByRole('button',{name:'Adicionar à comanda'})).toBeDisabled()
  cleanup();query.clear();mount(path)
  expect(await screen.findByText('1 × Água')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Alterar pedido'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:label}))
  expect(await screen.findByRole('heading',{name:scene==='cliente'?'Acompanhar pedidos':'Comanda 104'})).toBeInTheDocument()
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
  fireEvent.click(screen.getByRole('button',{name:'Repetir confirmação do mesmo Pix'}))
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
  mount('/',{...actor,permissions:['bar:finance:read']})
  await waitFor(()=>expect(screen.getAllByText('Ainda não disponível')).toHaveLength(4))
  expect(screen.queryByText(/R\$\s*0,00/)).not.toBeInTheDocument()
  expect(screen.getByRole('link',{name:/Consumo confirmado/})).toHaveAttribute('href','/bar/indicadores/consumption?de=2026-10-01&ate=2026-10-04')
})

it('consulta financeira não oferece abrir comanda e preserva busca e página ao voltar',async()=>{
  const fetchMock=server({tab:makeTab(),pixEnabled:false});const filters='/atendimento/comandas?busca=104&pagina=2'
  mount(filters,{...actor,roles:['BarFinance'],permissions:['bar:sales:read','bar:finance:read']})
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
  expect(screen.getByText('Taxa conciliada')).toBeInTheDocument()
})

it.each(['cliente','atendente'])('Pix parcial confirmado pelo POST bloqueia nova cobrança quando consulta falha: %s',async scene=>{
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

it.each(['cliente','atendente'])('rejeição de CPF permite corrigir o Pix antes de criar uma única cobrança: %s',async scene=>{
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
