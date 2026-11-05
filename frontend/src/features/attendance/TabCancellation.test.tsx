import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { setAccessToken, setCsrfToken } from '../../lib/http'
import { TabDetailsPage, TabsPage, SellPage } from './AttendancePages'
import { ReceivePage, ReceiptPage } from './PaymentPages'
import { ClientPage } from './ClientPage'
import type { Tab, TabItem, TabPayment } from './api'

const owner:AuthUser={id:'supervisor-example',name:'Supervisor Exemplo',email:'supervisor@example.invalid',roles:['Manager'],permissions:[]}
const createdAtUtc='2026-11-05T12:00:00Z'
const item=(state:string):TabItem=>({id:'item-example',tabId:'tab-example',productId:'product-example',name:'Produto de exemplo',quantity:1,unitPrice:5,total:5,state,source:'Operator',createdAtUtc,allowedActions:state==='Accepted'?['fulfill']:state==='Requested'?['accept','reject']:[]})
const payment=(state:string,refundPending=0):TabPayment=>({id:'payment-example',tabId:'tab-example',method:'Cash',amount:5,tendered:5,change:0,state,operationId:'55555555-5555-4555-8555-555555555555',createdAtUtc,refunded:0,refundPending,fee:0})
const tab=(changes:Partial<Tab>={}):Tab=>({id:'tab-example',version:3,number:1,name:'Cliente Exemplo',mode:'Tab',state:'Open',locationId:'bar-example',actorId:owner.id,total:0,paid:0,pending:0,due:0,payable:0,createdAtUtc,items:[],payments:[],history:[],allowedActions:['close','cancel'],...changes})
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})
type State={tab:Tab;paymentPost?:(body:Record<string,unknown>)=>Response|Promise<Response>;post?:(body:Record<string,unknown>)=>Response|Promise<Response>}
function server(state:State){return vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
 const url=new URL(String(input),'https://example.invalid')
 if(url.pathname.endsWith('/auth/me'))return json(owner)
 if(init?.method==='POST'){
  if(url.pathname.endsWith('/payments')&&state.paymentPost)return state.paymentPost(JSON.parse(String(init.body)))
  if(!url.pathname.endsWith('/cancel'))throw new Error('Não deve existir outra operação automática.')
  return state.post?state.post(JSON.parse(String(init.body))):json(state.tab)
 }
 if(url.pathname.endsWith('/tabs'))return json({items:[state.tab],page:1,pageSize:24,total:1})
 if(url.pathname.endsWith('/tabs/locations'))return json([{id:'bar-example',name:'Bar'}])
 if(url.pathname.endsWith('/cash/sessions')||url.pathname.endsWith('/catalog'))return json([])
 return json(state.tab)
})}
const clients:QueryClient[]=[]
function mount(path='/atendimento/comandas/tab-example',user=owner){
 const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});clients.push(client)
 const auth:AuthContextValue={user,isBootstrapping:false,signIn:async()=>{},signInWithGoogle:async()=>{},signOut:async()=>{},changePassword:async()=>{},completeFirstAccessWithGoogle:async()=>{}}
 render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}><Routes><Route path="/atendimento/comandas" element={<TabsPage/>}/><Route path="/atendimento/comandas/:tabId" element={<TabDetailsPage/>}/><Route path="/atendimento/receber/:tabId" element={<ReceivePage/>}/><Route path="/atendimento/comprovante/:tabId/:paymentId" element={<ReceiptPage/>}/><Route path="/atendimento/vender" element={<SellPage/>}/><Route path="/cliente" element={<ClientPage/>}/></Routes></MemoryRouter></AuthContext.Provider></QueryClientProvider>)
 return client
}
function cancelled(current:Tab,reason:string):Tab{return {...current,version:(current.version??0)+1,state:'Cancelled',closedAtUtc:createdAtUtc,total:0,due:0,payable:0,allowedActions:[],history:[...current.history,{id:'cancel-event',kind:'Cancelled',amount:0,actorId:owner.id,reason,createdAtUtc}]}}
beforeEach(()=>{localStorage.clear();sessionStorage.clear();setAccessToken(null);setCsrfToken(null)})
afterEach(()=>{cleanup();clients.splice(0).forEach(client=>client.clear());setAccessToken(null);setCsrfToken(null)})

it('exige motivo e confirma uma única operação versionada sem estorno ou pagamento automático',async()=>{
 const state:State={tab:tab({items:[item('Requested')]})};state.post=body=>{state.tab=cancelled(state.tab,String(body.reason));return json(state.tab)}
 const api=server(state);mount();fireEvent.click(await screen.findByRole('button',{name:'Cancelar comanda'}))
 const reason=screen.getByLabelText('Motivo do cancelamento');expect(reason).toHaveFocus();expect(reason).toHaveAttribute('maxlength','450')
 const confirm=screen.getByRole('button',{name:'Confirmar cancelamento'});expect(confirm).toBeDisabled()
 fireEvent.change(reason,{target:{value:'  '}});expect(confirm).toBeDisabled();fireEvent.change(reason,{target:{value:' ab '}});expect(confirm).toBeDisabled()
 fireEvent.change(reason,{target:{value:'  Pedido duplicado  '}});const form=confirm.closest('form')!
 act(()=>{fireEvent.submit(form);fireEvent.submit(form)})
 expect(await screen.findByRole('heading',{name:'Comanda cancelada'})).toBeInTheDocument();expect(screen.getByText('Motivo: Pedido duplicado')).toBeInTheDocument()
 const writes=api.mock.calls.filter(([,init])=>init?.method==='POST');expect(writes).toHaveLength(1)
 expect(writes[0][0]).toBe('/api/v1/bar/tabs/tab-example/cancel');expect(JSON.parse(String(writes[0][1]?.body))).toEqual({operationId:expect.any(String),expectedVersion:3,reason:'Pedido duplicado'})
 expect(screen.queryByRole('button',{name:/Cancelar comanda|Gerar QR Code|Encerrar comanda|Alterar identificação/})).not.toBeInTheDocument()
 expect(screen.queryByRole('link',{name:'Adicionar produtos'})).not.toBeInTheDocument();expect(localStorage.getItem(`lb-confirmation:tab-cancel:${owner.id}:tab-example`)).toBeNull()
})

it.each([403,409])('preserva o motivo após rejeição %s, sem repetir automaticamente',async status=>{
 const state:State={tab:tab(),post:()=>json({detail:'Confira a situação atual da comanda.'},status)};const api=server(state);mount()
 fireEvent.click(await screen.findByRole('button',{name:'Cancelar comanda'}));fireEvent.change(screen.getByLabelText('Motivo do cancelamento'),{target:{value:'Motivo preservado'}});fireEvent.click(screen.getByRole('button',{name:'Confirmar cancelamento'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('Confira a situação');expect(screen.getByLabelText('Motivo do cancelamento')).toHaveValue('Motivo preservado')
 await waitFor(()=>expect(screen.getByLabelText('Motivo do cancelamento')).toBeEnabled());expect(api.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
})

it('recarregar após resposta perdida recupera o mesmo cancelamento mesmo se o estado já mudou',async()=>{
 let attempts=0;const state:State={tab:tab()};state.post=body=>{if(++attempts===1){state.tab=cancelled(state.tab,String(body.reason));return json({detail:'Resposta interrompida.'},503)}return json(state.tab)}
 const api=server(state);const client=mount();fireEvent.click(await screen.findByRole('button',{name:'Cancelar comanda'}));fireEvent.change(screen.getByLabelText('Motivo do cancelamento'),{target:{value:'Pedido duplicado'}});fireEvent.click(screen.getByRole('button',{name:'Confirmar cancelamento'}))
 await screen.findByRole('alert');expect(screen.getByLabelText('Motivo do cancelamento')).toBeDisabled();expect(screen.queryByRole('button',{name:'Voltar'})).not.toBeInTheDocument()
 cleanup();client.clear();mount();expect(await screen.findByRole('heading',{name:'Comanda cancelada'})).toBeInTheDocument();expect(screen.getByLabelText('Motivo do cancelamento')).toHaveValue('Pedido duplicado')
 const retry=screen.getByRole('button',{name:'Consultar ou repetir cancelamento'});await waitFor(()=>expect(retry).toBeEnabled());fireEvent.click(retry)
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Consultar ou repetir cancelamento'})).not.toBeInTheDocument())
 const writes=api.mock.calls.filter(([,init])=>init?.method==='POST').map(([,init])=>JSON.parse(String(init?.body)));expect(writes).toHaveLength(2);expect(writes[1]).toEqual(writes[0])
})

it('voltar da confirmação devolve o foco sem perder o motivo digitado',async()=>{
 server({tab:tab()});mount();fireEvent.click(await screen.findByRole('button',{name:'Cancelar comanda'}));fireEvent.change(screen.getByLabelText('Motivo do cancelamento'),{target:{value:'Motivo de teste'}})
 fireEvent.click(screen.getByRole('button',{name:'Voltar'}));expect(screen.getByRole('button',{name:'Cancelar comanda'})).toHaveFocus();fireEvent.click(screen.getByRole('button',{name:'Cancelar comanda'}));expect(screen.getByLabelText('Motivo do cancelamento')).toHaveValue('Motivo de teste')
})

it.each([
 {paid:1},{pending:1},
 {payments:[payment('Pending')]},{payments:[payment('Approved',1)]},
 {allowedActions:['close']},{state:'Closed'},{state:'Cancelled'},
] as Partial<Tab>[])('não oferece cancelar quando há bloqueio operacional ou falta autorização do servidor (%j)',async changes=>{
 server({tab:tab(changes)});mount();await screen.findByRole('heading',{level:1,name:'Comanda 01 - Cliente Exemplo'});expect(screen.queryByRole('button',{name:'Cancelar comanda'})).not.toBeInTheDocument()
})

it('permissão antiga sem a ação de supervisão não permite cancelar',async()=>{
 server({tab:tab()});mount('/atendimento/comandas/tab-example',{...owner,permissions:['bar:sales:read','bar:sales:operate','bar:supervise'],staffAccess:{typeId:'readonly',name:'Consulta',role:'Manager',menus:['bar.tabs'],actions:['bar.tabs'],homePath:'/atendimento/comandas'}})
 await screen.findByRole('heading',{level:1,name:'Comanda 01 - Cliente Exemplo'});expect(screen.queryByRole('button',{name:'Cancelar comanda'})).not.toBeInTheDocument()
})

it('filtra canceladas e mostra o histórico de motivo e concessão sem abrir operação',async()=>{
 const state:State={tab:{...cancelled(tab(),'Pedido duplicado'),history:[{id:'concession',kind:'ConcessionVoided',reason:'Concessão encerrada no cancelamento',amount:5,createdAtUtc}]}};const api=server(state);mount('/atendimento/comandas')
 fireEvent.click(await screen.findByRole('button',{name:'Canceladas'}));await waitFor(()=>expect(api.mock.calls.some(([path])=>String(path).includes('state=Cancelled'))).toBe(true))
 expect(screen.getByText('Cancelada')).toBeInTheDocument();expect(screen.getByRole('link',{name:'Comanda 01 - Cliente Exemplo · Consultar comanda'})).toBeInTheDocument()
 fireEvent.click(screen.getByRole('link',{name:'Ver detalhes'}));await screen.findByRole('heading',{name:'Comanda cancelada'});fireEvent.click(screen.getByText('Histórico da comanda',{selector:'summary'}))
 expect(screen.getByText(/Desconto ou cortesia anulados/)).toBeInTheDocument();expect(screen.queryByRole('link',{name:'Adicionar produtos'})).not.toBeInTheDocument()
})

it.each(['/atendimento/receber/tab-example','/atendimento/vender?comanda=tab-example'])('cancelada não recebe pagamento nem novos produtos, mesmo com valores em cache: %s',async path=>{
 const state:State={tab:{...cancelled(tab(),'Pedido duplicado'),payable:10,due:10}};const api=server(state);mount(path)
 await screen.findByRole('heading',{level:1,name:/Comanda 01 - Cliente Exemplo/});expect(screen.queryByRole('button',{name:/Receber tudo|Conferir pedido|Salvar$/})).not.toBeInTheDocument();expect(api.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false)
})


it('falha ao guardar confirmação preserva motivo e não envia o cancelamento',async()=>{
 const api=server({tab:tab()});mount();fireEvent.click(await screen.findByRole('button',{name:'Cancelar comanda'}));fireEvent.change(screen.getByLabelText('Motivo do cancelamento'),{target:{value:'Pedido duplicado'}})
 const original=Storage.prototype.setItem;vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key:string,value:string){if(key.startsWith('lb-confirmation:tab-cancel:'))throw new Error('Armazenamento indisponível');return original.call(this,key,value)})
 fireEvent.click(screen.getByRole('button',{name:'Confirmar cancelamento'}));expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível guardar esta confirmação')
 expect(screen.getByLabelText('Motivo do cancelamento')).toHaveValue('Pedido duplicado');expect(api.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false)
})

it('cancelada em cache não oferece pedir, pagar, QR ou entrega',async()=>{
 const state:State={tab:{...cancelled(tab({items:[item('Accepted')]}),'Pedido duplicado'),payable:10}};const api=server(state);const client=mount()
 await screen.findByRole('heading',{name:'Comanda cancelada'});expect(screen.queryByRole('button',{name:/Gerar QR Code|Entregar|Cancelar comanda/})).not.toBeInTheDocument()
 cleanup();client.clear();mount('/cliente#token=synthetic-only-tab-token')
 expect(await screen.findByRole('heading',{name:'Comanda cancelada'})).toBeInTheDocument();expect(screen.getByRole('button',{name:'Pedir'})).toBeDisabled();expect(screen.getByRole('button',{name:'Pagar'})).toBeDisabled()
 expect(api.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false)
})


it('cancela venda entregue ainda não recebida com aviso de estoque e sem retorno automático',async()=>{
 const state:State={tab:tab({items:[item('Fulfilled')],total:5,due:5,payable:5,allowedActions:['cancel']})};
 state.post=body=>{state.tab={...cancelled(state.tab,String(body.reason)),items:[{...item('Reversed'),reason:'Cancelado sem devolução física',allowedActions:[]}]};return json(state.tab)};
 const api=server(state);mount();fireEvent.click(await screen.findByRole('button',{name:'Cancelar comanda'}));
 expect(screen.getByText('Produtos entregues não voltam ao estoque. Se houve devolução, corrija os itens antes de cancelar.')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Motivo do cancelamento'),{target:{value:'Lançamento duplicado'}});fireEvent.click(screen.getByRole('button',{name:'Confirmar cancelamento'}));
 await screen.findByRole('heading',{name:'Comanda cancelada'});const writes=api.mock.calls.filter(([,init])=>init?.method==='POST');expect(writes).toHaveLength(1);expect(String(writes[0][0])).toMatch(/\/cancel$/);
 expect(JSON.parse(String(writes[0][1]?.body))).not.toHaveProperty('returnStock');expect(screen.getByText(/Cancelado sem devolução física/)).toBeInTheDocument();
});


it('recebimento da venda avulsa entregue mostra cancelamento compacto para supervisão',async()=>{
 const state:State={tab:tab({mode:'Immediate',items:[item('Fulfilled')],total:5,due:5,payable:5,allowedActions:['cancel']})};
 state.post=body=>{state.tab=cancelled(state.tab,String(body.reason));return json(state.tab)};server(state);mount('/atendimento/receber/tab-example');
 fireEvent.click(await screen.findByRole('button',{name:'Cancelar comanda'}));expect(screen.queryByRole('heading',{name:'Situação da comanda'})).not.toBeInTheDocument();expect(screen.getAllByLabelText('Motivo do cancelamento')).toHaveLength(1);
 fireEvent.change(screen.getByLabelText('Motivo do cancelamento'),{target:{value:'Pedido duplicado'}});fireEvent.click(screen.getByRole('button',{name:'Confirmar cancelamento'}));
 expect(await screen.findByRole('heading',{name:'Comanda cancelada'})).toBeInTheDocument();expect(screen.getByText('Motivo: Pedido duplicado')).toBeInTheDocument();expect(screen.queryByRole('button',{name:/Receber tudo|Confirmar recebimento|Cancelar comanda/})).not.toBeInTheDocument();
});

it('perfil do Bar sem supervisão não ganha cancelamento no recebimento',async()=>{
 server({tab:tab({mode:'Immediate',items:[item('Fulfilled')],total:5,due:5,payable:5,allowedActions:['cancel']})});
 mount('/atendimento/receber/tab-example',{...owner,roles:['Operations'],permissions:['bar:sales:read','bar:sales:operate'],staffAccess:{typeId:'bar-reader',name:'Bar',role:'Operations',menus:['bar.receive'],actions:['bar.receive'],homePath:'/atendimento/receber'}});
 await screen.findByRole('heading',{level:1,name:'Receber · Comanda 01 - Cliente Exemplo'});expect(screen.queryByRole('button',{name:'Cancelar comanda'})).not.toBeInTheDocument();
});


it('cancelamento indeterminado bloqueia encerrar enquanto preserva a confirmação',async()=>{
 const state:State={tab:tab(),post:()=>json({detail:'Resposta interrompida.'},503)};const api=server(state);mount();
 fireEvent.click(await screen.findByRole('button',{name:'Cancelar comanda'}));fireEvent.change(screen.getByLabelText('Motivo do cancelamento'),{target:{value:'Pedido duplicado'}});fireEvent.click(screen.getByRole('button',{name:'Confirmar cancelamento'}));
 await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Encerrar comanda'})).toBeDisabled();expect(screen.getByRole('button',{name:'Consultar ou repetir cancelamento'})).toBeEnabled();expect(api.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
});


it('recebimento com resposta perdida bloqueia Cancelar sem disparar outra operação',async()=>{
 const state:State={tab:tab({mode:'Immediate',items:[item('Fulfilled')],total:5,due:5,payable:5,allowedActions:['cancel']}),paymentPost:()=>json({detail:'Resposta do recebimento interrompida.'},503)};
 const api=server(state);mount('/atendimento/receber/tab-example');
 fireEvent.click(await screen.findByRole('button',{name:'Débito na maquininha'}));fireEvent.click(screen.getByLabelText('A maquininha confirmou a aprovação'));fireEvent.click(screen.getByRole('button',{name:'Confirmar recebimento'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Resposta do recebimento interrompida');
 const cancel=screen.getByRole('button',{name:'Cancelar comanda'});expect(cancel).toBeDisabled();fireEvent.click(cancel);
 expect(screen.queryByLabelText('Motivo do cancelamento')).not.toBeInTheDocument();const writes=api.mock.calls.filter(([,init])=>init?.method==='POST');expect(writes).toHaveLength(1);expect(String(writes[0][0])).toMatch(/\/payments$/);
});

it('comprovante de comanda cancelada permanece somente para consulta, sem novo estorno',async()=>{
 const state:State={tab:{...cancelled(tab(),'Pedido duplicado'),payments:[{...payment('Approved'),refunded:5}]}};server(state);mount('/atendimento/comprovante/tab-example/payment-example');
 expect(await screen.findByRole('heading',{name:'Comanda cancelada'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Estornar pagamento'})).not.toBeInTheDocument();
});


it.each(['Cancelled','Conflict'] as const)('cancelamento indeterminado bloqueia receber e permite retomar o próprio cancelamento: %s',async outcome=>{
 let attempts=0;const state:State={tab:tab({mode:'Immediate',items:[item('Fulfilled')],total:5,due:5,payable:5,allowedActions:['cancel']})};
 state.post=body=>{if(++attempts===1)return json({detail:'Resposta do cancelamento interrompida.'},503);if(outcome==='Conflict'){state.tab={...state.tab,version:4};return json({detail:'Comanda atualizada. Confira os dados.'},409)}state.tab=cancelled(state.tab,String(body.reason));return json(state.tab)};
 const api=server(state);mount('/atendimento/receber/tab-example');fireEvent.click(await screen.findByRole('button',{name:'Débito na maquininha'}));fireEvent.click(screen.getByLabelText('A maquininha confirmou a aprovação'));
 expect(screen.getByRole('button',{name:'Confirmar recebimento'})).toBeEnabled();fireEvent.click(screen.getByRole('button',{name:'Cancelar comanda'}));fireEvent.change(screen.getByLabelText('Motivo do cancelamento'),{target:{value:'Pedido duplicado'}});fireEvent.click(screen.getByRole('button',{name:'Confirmar cancelamento'}));
 await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Confirmar recebimento'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Confirmar recebimento'}));
 const retry=screen.getByRole('button',{name:'Consultar ou repetir cancelamento'});expect(retry).toBeEnabled();fireEvent.click(retry);
 if(outcome==='Cancelled'){await screen.findByRole('heading',{name:'Comanda cancelada'});expect(screen.queryByRole('button',{name:'Confirmar recebimento'})).not.toBeInTheDocument()}
 else {await screen.findByText('Comanda atualizada. Confira os dados.');await waitFor(()=>expect(screen.getByRole('button',{name:'Confirmar recebimento'})).toBeEnabled());expect(screen.getByLabelText('Motivo do cancelamento')).toHaveValue('Pedido duplicado')}
 const writes=api.mock.calls.filter(([,init])=>init?.method==='POST');expect(writes).toHaveLength(2);expect(writes.every(([path])=>String(path).endsWith('/cancel'))).toBe(true);expect(JSON.parse(String(writes[1][1]?.body))).toEqual(JSON.parse(String(writes[0][1]?.body)));
});
