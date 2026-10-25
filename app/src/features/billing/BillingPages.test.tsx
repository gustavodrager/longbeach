import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import { BillingPage } from './BillingPages'
import { AccountCheckout } from './AccountCheckout'
import type { AuthUser } from '../auth/types'
import type { Account, Config, Subscription } from './api'
const user:AuthUser={id:'student-a',name:'Aluno teste',email:'student@example.invalid',roles:['Student'],permissions:[]}
const account:Account={id:'account-a',kind:'Quadra',sourceId:'entry-a',title:'Mensalidade de outubro',dueDate:'2026-10-10',total:100,paid:0,pending:0,payable:100,state:'Pendente',payments:[],recurringEligible:true,userId:user.id,competence:'2026-10'}
const config:Config={pixEnabled:true,cardEnabled:true,subscriptionsEnabled:true,cardPublicKey:'public-key',subscriptionPublicKey:'subscription-key'}
const clients:QueryClient[]=[]
function mount(content:React.ReactNode, path='/minha-area/pagamentos', currentUser=user){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);const auth:AuthContextValue={user:currentUser,isBootstrapping:false,signIn:async()=>{},signInWithGoogle:async()=>{},signOut:async()=>{},changePassword:async()=>{},completeFirstAccessWithGoogle:async()=>{}};render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}>{content}</MemoryRouter></AuthContext.Provider></QueryClientProvider>)}
function json(body:unknown){return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}})}
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());delete window.PagSeguro;localStorage.clear();sessionStorage.clear()})
it('consulta apenas minhas contas e separa bar e quadra',async()=>{
 const requests:string[]=[];vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{const url=String(input);requests.push(url);if(url.endsWith('/config'))return json(config);if(url.endsWith('/subscriptions'))return json([]);return json([account,{...account,id:'bar-a',kind:'Bar',title:'Comanda 10'}])});mount(<BillingPage />)
 expect(await screen.findByText('Mensalidade de outubro')).toBeInTheDocument();expect(screen.getByRole('heading',{name:'Conta do Bar'})).toBeInTheDocument();expect(screen.getByRole('heading',{name:'Conta da Quadra'})).toBeInTheDocument();expect(screen.queryByText('Vincular conta ao responsável')).not.toBeInTheDocument();expect(requests.every(r=>r.startsWith('/api/v1/me/billing/'))).toBe(true)
})
it('bloqueia pagamento avulso de nova competência com assinatura ativa',async()=>{
 vi.spyOn(globalThis,'fetch').mockImplementation(async input=>String(input).endsWith('/config')?json(config):String(input).endsWith('/subscriptions')?json([{id:'sub-a',accountId:'older-account',operationId:'op-a',amount:100,firstDue:'2026-09-10',state:'ACTIVE',canResume:false}]):json([{...account,subscriptionId:'sub-a'}]));mount(<BillingPage />)
 expect(await screen.findByRole('button',{name:'Cancelar cobranças futuras'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Pagar esta conta'})).not.toBeInTheDocument()
})
function fillSubscriptionCard() {
 for (const [label,value] of [['CPF ou CNPJ','12345678909'],['Telefone com DDD','11999999999'],['Nome no cartão','ALUNO'],['Número do cartão','4111111111111111'],['Mês de validade','12'],['Ano de validade (4 dígitos)','2030'],['Código de segurança','123']]) fireEvent.change(screen.getByLabelText(label),{target:{value}})
 const consent=screen.getByRole('checkbox',{name:/Autorizo a cobrança mensal/})
 if(!(consent as HTMLInputElement).checked)fireEvent.click(consent)
}
it('mostra somente a última rejeição da conta e permite uma nova adesão',async()=>{
 const rejected={id:'rejected-new',operationId:'rejected-operation',accountId:account.id,amount:100,firstDue:account.dueDate!,state:'Rejected',canResume:false,failureReason:'Confira o cartão informado.'}
 vi.spyOn(globalThis,'fetch').mockImplementation(async input=>String(input).endsWith('/config')?json(config):String(input).endsWith('/subscriptions')?json([rejected,{...rejected,id:'rejected-old',failureReason:'Motivo antigo.'},{...rejected,id:'other-account',accountId:'other',failureReason:'Outra conta.'}]):json([account]))
 mount(<BillingPage/>);expect(await screen.findByText(/Última adesão não autorizada/)).toHaveTextContent('Confira o cartão informado.')
 expect(screen.queryByText(/Motivo antigo|Outra conta/)).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Retomar adesão'})).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'Ativar mensalidade automática'})).toBeEnabled();expect(screen.getByRole('button',{name:'Pagar esta conta'})).toBeEnabled()
})
it.each([false,true])('troca a operação após rejeição e exige nova autorização, com falha na consulta seguinte: %s',async failRefresh=>{
 const attempts:Record<string,unknown>[]=[];let subscriptions:Subscription[]=[]
 window.PagSeguro={encryptCard:vi.fn(()=>({hasErrors:false,encryptedCard:'encrypted-subscription'}))}
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  if(init?.method==='POST'){
   const body=JSON.parse(String(init.body));attempts.push(body)
   subscriptions=[{id:`rejection-${attempts.length}`,accountId:account.id,operationId:String(body.operationId),amount:100,firstDue:account.dueDate!,state:'Rejected',canResume:false,failureReason:'Confira os dados do cartão.'},...subscriptions]
   return json(subscriptions[0])
  }
  const url=String(input);return url.endsWith('/config')?json(config):url.endsWith('/subscriptions')?failRefresh&&attempts.length?new Response('{}',{status:503}):json(subscriptions):json([account])
 })
 mount(<BillingPage/>);const activate=await screen.findByRole('button',{name:'Ativar mensalidade automática'});await waitFor(()=>expect(activate).toBeEnabled());fireEvent.click(activate)
 fillSubscriptionCard();expect(screen.getByRole('checkbox',{name:/já estiver cadastrado/})).not.toBeChecked()
 fireEvent.click(screen.getByRole('button',{name:'Autorizar cobrança mensal'}));await screen.findByText(/Última adesão não autorizada/)
 expect(screen.getByLabelText('Número do cartão')).toHaveValue('');expect(screen.getByRole('checkbox',{name:/Autorizo a cobrança mensal/})).not.toBeChecked()
 expect(screen.queryByText(/Se houver falha, retome esta operação/)).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Retomar adesão'})).not.toBeInTheDocument()
 fillSubscriptionCard();fireEvent.click(screen.getByRole('checkbox',{name:/já estiver cadastrado/}));fireEvent.click(screen.getByRole('button',{name:'Autorizar cobrança mensal'}))
 await waitFor(()=>expect(attempts).toHaveLength(2));expect(attempts[1].operationId).not.toBe(attempts[0].operationId)
 expect(attempts[0].updateExistingCustomerCard).toBe(false);expect(attempts[1].updateExistingCustomerCard).toBe(true)
 expect(attempts[0].consent).toBe(true);expect(attempts[1].consent).toBe(true);expect(JSON.stringify(attempts)).not.toContain('4111111111111111')
})
it('mantém a mesma operação de adesão após falha anterior ao envio ao PagBank',async()=>{
 const attempts:Record<string,unknown>[]=[];let subscriptions:Subscription[]=[{id:'past-rejection',operationId:'past-operation',accountId:account.id,amount:100,firstDue:account.dueDate!,state:'Rejected',canResume:false}]
 let current=account;window.PagSeguro={encryptCard:vi.fn(()=>({hasErrors:false,encryptedCard:'encrypted-subscription'}))}
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  if(init?.method==='POST'){
   const body=JSON.parse(String(init.body));attempts.push(body)
   current={...account,subscriptionId:'creating-sub'}
   subscriptions=[{id:'creating-sub',accountId:account.id,operationId:String(body.operationId),amount:100,firstDue:account.dueDate!,state:'Creating',canResume:true},...subscriptions.filter(s=>s.id!=='creating-sub')]
   return new Response(JSON.stringify({message:'Adesão em confirmação.'}),{status:502,headers:{'Content-Type':'application/json'}})
  }
  const url=String(input);return url.endsWith('/config')?json(config):url.endsWith('/subscriptions')?json(subscriptions):json([current])
 })
 mount(<BillingPage/>);const activate=await screen.findByRole('button',{name:'Ativar mensalidade automática'});await waitFor(()=>expect(activate).toBeEnabled());fireEvent.click(activate)
 fillSubscriptionCard();fireEvent.click(screen.getByRole('checkbox',{name:/já estiver cadastrado/}));fireEvent.click(screen.getByRole('button',{name:'Autorizar cobrança mensal'}));await screen.findByRole('button',{name:'Retomar adesão'})
 await waitFor(()=>expect(screen.getByRole('button',{name:'Autorizar cobrança mensal'})).toBeEnabled());fillSubscriptionCard()
 expect(screen.getByRole('checkbox',{name:/já estiver cadastrado/})).toBeDisabled();expect(screen.getByRole('checkbox',{name:/já estiver cadastrado/})).toBeChecked()
 fireEvent.click(screen.getByRole('button',{name:'Autorizar cobrança mensal'}));await waitFor(()=>expect(attempts).toHaveLength(2))
 expect(attempts[1].operationId).toBe(attempts[0].operationId);expect(attempts[1].updateExistingCustomerCard).toBe(true);expect(screen.queryByText(/Última adesão não autorizada/)).not.toBeInTheDocument()
})
it('consulta adesão já enviada sem cartão, consentimento novo ou segunda criação',async()=>{
 let current:Subscription={id:'sent-sub',operationId:'sent-operation',accountId:account.id,amount:100,firstDue:account.dueDate!,state:'Creating',canResume:false,updateExistingCustomerCard:true}
 const posts:{url:string;body:unknown}[]=[];const encrypt=vi.fn(()=>({hasErrors:false,encryptedCard:'unused'}));window.PagSeguro={encryptCard:encrypt}
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  const url=String(input)
  if(init?.method==='POST'){posts.push({url,body:init.body});current={...current,state:'ACTIVE'};return json(current)}
  return url.endsWith('/config')?json(config):url.endsWith('/subscriptions')?json([current]):json([{...account,subscriptionId:current.id}])
 })
 mount(<BillingPage/>);await screen.findByRole('button',{name:'Consultar adesão pendente'})
 expect(screen.getByText('Aguardando confirmação do PagBank. A consulta não inicia outra cobrança.')).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'Retomar adesão'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Cancelar cobranças futuras'})).not.toBeInTheDocument()
 expect(screen.queryByLabelText('Número do cartão')).not.toBeInTheDocument();expect(screen.queryByLabelText('Código de segurança')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Em confirmação'}));fireEvent.click(screen.getByRole('button',{name:'Consultar adesão pendente'}))
 await waitFor(()=>expect(posts).toHaveLength(1));fireEvent.click(screen.getByRole('button',{name:'A pagar'}))
 expect(await screen.findByRole('button',{name:'Cancelar cobranças futuras'})).toBeInTheDocument()
 expect(posts).toEqual([{url:'/api/v1/me/billing/subscriptions/sent-sub/refresh',body:undefined}]);expect(encrypt).not.toHaveBeenCalled()
})
it('fecha formulário após envio incerto e mantém somente a consulta da adesão',async()=>{
 let subscriptions:Subscription[]=[];let current=account;const paths:string[]=[]
 window.PagSeguro={encryptCard:vi.fn(()=>({hasErrors:false,encryptedCard:'encrypted-subscription'}))}
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  const url=String(input)
  if(init?.method==='POST'){
   paths.push(url)
   if(url.endsWith('/refresh'))return json(subscriptions[0])
   const body=JSON.parse(String(init.body));current={...account,subscriptionId:'sent-sub'}
   subscriptions=[{id:'sent-sub',accountId:account.id,operationId:String(body.operationId),amount:100,firstDue:account.dueDate!,state:'Creating',canResume:false,updateExistingCustomerCard:true}]
   return new Response(JSON.stringify({message:'Adesão em confirmação.'}),{status:502,headers:{'Content-Type':'application/json'}})
  }
  return url.endsWith('/config')?json(config):url.endsWith('/subscriptions')?json(subscriptions):json([current])
 })
 mount(<BillingPage/>);const activate=await screen.findByRole('button',{name:'Ativar mensalidade automática'});await waitFor(()=>expect(activate).toBeEnabled());fireEvent.click(activate)
 fillSubscriptionCard();fireEvent.click(screen.getByRole('button',{name:'Autorizar cobrança mensal'}))
 fireEvent.click(await screen.findByRole('button',{name:'Consultar adesão pendente'}));await waitFor(()=>expect(paths).toHaveLength(2))
 expect(paths).toEqual(['/api/v1/me/billing/accounts/account-a/subscriptions','/api/v1/me/billing/subscriptions/sent-sub/refresh'])
 expect(screen.queryByLabelText('Número do cartão')).not.toBeInTheDocument();expect(screen.queryByLabelText('Código de segurança')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Cancelar cobranças futuras'})).not.toBeInTheDocument()
})
it.each([false,true])('preserva consulta pelo DTO quando listas falham e conta não tem subscriptionId, falha de contas: %s',async failAccounts=>{
 let sent=false;const requests:{url:string;body:unknown}[]=[]
 const creating:Subscription={id:'sent-sub',operationId:'sent-operation',accountId:account.id,amount:100,firstDue:account.dueDate!,state:'Creating',canResume:false}
 window.PagSeguro={encryptCard:vi.fn(()=>({hasErrors:false,encryptedCard:'encrypted-subscription'}))}
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  const url=String(input)
  if(init?.method==='POST'){requests.push({url,body:init.body});sent=true;return json(creating)}
  if(url.endsWith('/config'))return json(config)
  if(url.endsWith('/subscriptions'))return sent?new Response('{}',{status:503}):json([])
  return sent&&failAccounts?new Response('{}',{status:503}):json([account])
 })
 mount(<BillingPage/>);const activate=await screen.findByRole('button',{name:'Ativar mensalidade automática'});await waitFor(()=>expect(activate).toBeEnabled());fireEvent.click(activate)
 fillSubscriptionCard();fireEvent.click(screen.getByRole('button',{name:'Autorizar cobrança mensal'}))
 await screen.findByText(/Não foi possível consultar as mensalidades automáticas/)
 const consult=screen.getByRole('button',{name:'Consultar adesão pendente'})
 expect(screen.queryByLabelText('Número do cartão')).not.toBeInTheDocument();expect(screen.queryByLabelText('Código de segurança')).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'Ativar mensalidade automática'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Pagar esta conta'})).not.toBeInTheDocument()
 if(failAccounts){expect(screen.getByText(/Não foi possível consultar suas contas/)).toBeInTheDocument();expect(screen.queryByRole('region',{name:'Resumo das minhas contas'})).not.toBeInTheDocument()}
 fireEvent.click(consult);await waitFor(()=>expect(requests).toHaveLength(2))
 expect(requests[1]).toEqual({url:'/api/v1/me/billing/subscriptions/sent-sub/refresh',body:undefined})
})
it.each([true,false])('retoma após recarregar com autorização de cartão persistida em %s',async updateExistingCustomerCard=>{
 const creating:Subscription={id:'persisted-sub',operationId:'persisted-operation',accountId:account.id,amount:100,firstDue:account.dueDate!,state:'Creating',canResume:true,updateExistingCustomerCard}
 const attempts:Record<string,unknown>[]=[];window.PagSeguro={encryptCard:vi.fn(()=>({hasErrors:false,encryptedCard:'encrypted-subscription'}))}
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  if(init?.method==='POST'){attempts.push(JSON.parse(String(init.body)));return json(creating)}
  const url=String(input);return url.endsWith('/config')?json(config):url.endsWith('/subscriptions')?json([creating]):json([{...account,subscriptionId:creating.id}])
 })
 mount(<BillingPage/>);fireEvent.click(await screen.findByRole('button',{name:'Retomar adesão'}))
 const updateCard=screen.getByRole('checkbox',{name:/já estiver cadastrado/})
 expect(updateCard).toBeDisabled();expect((updateCard as HTMLInputElement).checked).toBe(updateExistingCustomerCard)
 expect(screen.getByText(/Se houver falha, retome esta operação/)).toBeInTheDocument()
 fillSubscriptionCard();fireEvent.click(screen.getByRole('button',{name:'Autorizar cobrança mensal'}));await waitFor(()=>expect(attempts).toHaveLength(1))
 expect(attempts[0].operationId).toBe(creating.operationId);expect(attempts[0].updateExistingCustomerCard).toBe(updateExistingCustomerCard)
})
it('envia cartão criptografado e preserva operação após timeout',async()=>{
 const attempts:Record<string,unknown>[]=[];window.PagSeguro={encryptCard:vi.fn(()=>({hasErrors:false,encryptedCard:'encrypted-payload'}))};vi.spyOn(globalThis,'fetch').mockImplementation(async(_input,init)=>{attempts.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({message:'Em confirmação'}),{status:502,headers:{'Content-Type':'application/json'}})});mount(<AccountCheckout account={account} config={config} base="/api/v1/me/billing" done={async()=>{}} />)
 fireEvent.change(screen.getByLabelText('Forma de pagamento'),{target:{value:'CreditCard'}});fireEvent.change(screen.getByLabelText('Nome do pagador'),{target:{value:'Aluno'}});fireEvent.change(screen.getByLabelText('E-mail'),{target:{value:'student@example.invalid'}});fireEvent.change(screen.getByLabelText('CPF ou CNPJ'),{target:{value:'12345678909'}})
 const fill=()=>{for(const [label,value] of [['Nome no cartão','ALUNO'],['Número do cartão','4111111111111111'],['Mês de validade','12'],['Ano de validade (4 dígitos)','2030'],['Código de segurança','123']])fireEvent.change(screen.getByLabelText(label),{target:{value}})};fill();fireEvent.click(screen.getByRole('button',{name:'Confirmar pagamento'}));await waitFor(()=>expect(attempts).toHaveLength(1));await screen.findByRole('alert');fill();fireEvent.click(screen.getByRole('button',{name:'Retomar o mesmo pagamento'}));await waitFor(()=>expect(attempts).toHaveLength(2));expect(attempts[0].operationId).toBe(attempts[1].operationId);expect(attempts[0].encryptedCard).toBe('encrypted-payload');expect(JSON.stringify(attempts)).not.toContain('4111111111111111');expect(attempts[0]).not.toHaveProperty('securityCode');expect(localStorage.length).toBe(0);expect(sessionStorage.length).toBe(0)
})


it('Pix em confirmação continua visível quando o saldo disponível passa a zero',async()=>{
 let current=account;const payment={id:'pix-one',operationId:'op-one',method:'Pix',amount:100,state:'Pending',refunded:0,canResume:false,pixText:'pix-copy-test'}
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{if(init?.method==='POST'){current={...account,payable:0,pending:100,payments:[payment]};return json(current)}const url=String(input);return url.endsWith('/config')?json(config):url.endsWith('/subscriptions')?json([]):json([current])})
 mount(<BillingPage/>);fireEvent.click(await screen.findByRole('button',{name:'Pagar esta conta'}));expect(screen.getByLabelText('Nome do pagador')).toHaveValue(user.name);expect(screen.getByLabelText('E-mail')).toHaveValue(user.email);fireEvent.change(screen.getByLabelText('CPF ou CNPJ'),{target:{value:'12345678909'}});fireEvent.click(screen.getByRole('button',{name:'Confirmar pagamento'}))
 expect(await screen.findByRole('button',{name:'Copiar código Pix'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Confirmar pagamento'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Em confirmação'}));expect(screen.getByDisplayValue('pix-copy-test')).toBeInTheDocument()
})

it('conta escolhida por link continua acessível mesmo quitada, sem iniciar cobrança',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>String(input).endsWith('/config')?json(config):String(input).endsWith('/subscriptions')?json([]):json([{...account,payable:0,paid:100}]))
 mount(<BillingPage/>,'/minha-area/pagamentos?conta=account-a');expect(await screen.findByRole('article',{name:account.title})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Pagar esta conta'})).not.toBeInTheDocument();expect(fetch.mock.calls.every(([,init])=>!init?.method)).toBe(true)
})
it('indisponibilidade do provedor mantém consulta e bloqueia novo pagamento',async()=>{
 vi.spyOn(globalThis,'fetch').mockImplementation(async input=>String(input).endsWith('/config')?json({...config,pixEnabled:false,cardEnabled:false,subscriptionsEnabled:false}):String(input).endsWith('/subscriptions')?json([]):json([account]))
 mount(<BillingPage/>);expect(await screen.findByRole('button',{name:'Pagar esta conta'})).toBeDisabled();expect(screen.getByText(/Pagamento online indisponível/)).toBeInTheDocument();expect(screen.getByRole('region',{name:'Resumo das minhas contas'})).toHaveTextContent('R$ 100,00')
})
it('falha de atualização oculta valores antigos e ações financeiras',async()=>{
 let fail=false
 vi.spyOn(globalThis,'fetch').mockImplementation(async input=>String(input).endsWith('/config')?json(config):String(input).endsWith('/subscriptions')?json([]):fail?new Response('{}',{status:503}):json([account]))
 mount(<BillingPage/>);await screen.findByRole('article',{name:account.title});fail=true;await clients.at(-1)!.invalidateQueries({queryKey:['billing']})
 expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar');expect(screen.queryByRole('article')).not.toBeInTheDocument();expect(screen.queryByRole('region',{name:'Resumo das minhas contas'})).not.toBeInTheDocument();expect(screen.queryByText('Nenhuma conta nesta seleção.')).not.toBeInTheDocument()
})
it('itens de comanda distinguem pedidos, consumo e cancelamentos sem recalcular saldo',async()=>{
 const items=[{id:'1',name:'Água',quantity:2,unitPrice:5,total:10,state:'Fulfilled'},{id:'2',name:'Suco',quantity:1,unitPrice:9,total:9,state:'Requested'},{id:'3',name:'Lanche',quantity:1,unitPrice:20,total:20,state:'Reversed'}]
 vi.spyOn(globalThis,'fetch').mockImplementation(async input=>String(input).endsWith('/config')?json(config):String(input).endsWith('/subscriptions')?json([]):json([{...account,kind:'Bar',total:8,payable:8,discount:2,items}]))
 mount(<BillingPage/>);await screen.findByRole('article');fireEvent.click(screen.getByText('Itens da comanda'));expect(screen.getByText('2 × Água')).toBeInTheDocument();expect(screen.getByText(/Ainda fora do total/)).toBeInTheDocument();expect(screen.getByText(/Cancelado · não cobrado/)).toBeInTheDocument();expect(screen.getByText('Desconto aplicado: R$ 2,00')).toBeInTheDocument();expect(within(screen.getByRole('article')).getByText('R$ 8,00 a pagar agora')).toBeInTheDocument()
})

it('C6 habilitado somente na Quadra não oferece Pix no Bar', async () => {
 const scoped = {...config, courtPixEnabled:true, barPixEnabled:false, cardEnabled:false, subscriptionsEnabled:false}
 vi.spyOn(globalThis,'fetch').mockImplementation(async input=>String(input).endsWith('/config')?json(scoped):String(input).endsWith('/subscriptions')?json([]):json([account,{...account,id:'bar-c6',kind:'Bar',title:'Comanda sem Pix'}]))
 mount(<BillingPage />)
 const court=await screen.findByRole('article',{name:account.title})
 expect(within(court).getByRole('button',{name:'Pagar esta conta'})).toBeEnabled()
 expect(within(screen.getByRole('article',{name:'Comanda sem Pix'})).getByRole('button',{name:'Pagar esta conta'})).toBeDisabled()
})

it('suspender novos Pix preserva a retomada da mesma operação já persistida', async () => {
 const resume={id:'c6-pending',operationId:'c6-operation',method:'Pix',amount:100,state:'Pending',refunded:0,canResume:true}
 const scoped={...config,pixEnabled:false,courtPixEnabled:false,barPixEnabled:false,cardEnabled:false,subscriptionsEnabled:false}
 const attempts:Record<string,unknown>[]=[]
 vi.spyOn(globalThis,'fetch').mockImplementation(async (input,init)=>{
  if(init?.method==='POST'){attempts.push(JSON.parse(String(init.body)));return json({})}
  return String(input).endsWith('/config')?json(scoped):String(input).endsWith('/subscriptions')?json([]):json([{...account,payable:0,pending:100,payments:[resume]}])
 })
 mount(<BillingPage />)
 fireEvent.click(screen.getByRole('button',{name:'Em confirmação'}))
 fireEvent.click(await screen.findByRole('button',{name:'Retomar pagamento pendente'}))
 fireEvent.change(screen.getByLabelText('CPF ou CNPJ'),{target:{value:'12345678909'}})
 fireEvent.click(screen.getByRole('button',{name:'Retomar o mesmo pagamento'}))
 await waitFor(()=>expect(attempts).toHaveLength(1))
 expect(attempts[0].operationId).toBe('c6-operation')
 expect(screen.getByRole('button',{name:'Consultar confirmação'})).toBeEnabled()
})

const manager:AuthUser={...user,id:'manager',roles:['Owner'],permissions:['finance:write']}
const received={id:'received',operationId:'received-operation',method:'Pix',amount:80,state:'Approved',refunded:10,refundPending:0,canResume:false}
function adminData(accounts:Account[]){
 vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{
  const url=String(input)
  return url.endsWith('/config')?json(config):url.endsWith('/candidates')?json({accounts:[],users:[{id:user.id,name:'João Silva'},{id:'other-user',name:'Maria Souza'}],students:[]}):json(accounts)
 })
}

it('gestão separa recebido líquido, saldo livre e confirmação com histórico sob demanda',async()=>{
 const current={...account,paid:70,payable:10,pending:20,payments:[received,{...received,id:'pending',amount:20,state:'Pending',refunded:0}]}
 adminData([current])
 mount(<BillingPage admin/>,'/recebimentos',manager)
 const summary=await screen.findByRole('region',{name:'Resumo dos recebimentos da seleção'})
 expect(summary).toHaveTextContent('Recebido registradoR$ 70,00')
 expect(summary).toHaveTextContent('Saldo a receberR$ 10,00')
 expect(summary).toHaveTextContent('Em confirmaçãoR$ 20,00')
 expect(screen.queryByRole('link',{name:/Conciliação/})).not.toBeInTheDocument()
 const row=screen.getByRole('article',{name:account.title})
 expect(within(row).getByText('Pagamento em confirmação')).toBeInTheDocument()
 expect(within(row).getByRole('button',{name:'Pagar esta conta'})).not.toBeVisible()
 expect(within(row).getByRole('region',{name:'Histórico de pagamentos'})).not.toBeVisible()
 fireEvent.click(within(row).getByText(account.title,{selector:'summary strong'}))
 expect(within(row).getByRole('button',{name:'Pagar esta conta'})).toBeVisible()
 expect(within(row).getByRole('button',{name:'Pagar esta conta'})).toBeEnabled()
 expect(within(row).getByText('Origem: Conta da Quadra · entry-a')).toBeInTheDocument()
 expect(within(row).getByRole('button',{name:'Baixar comprovante'})).not.toBeVisible()
 fireEvent.click(within(row).getByText('Histórico de pagamentos (2)'))
 expect(within(row).getByRole('button',{name:'Baixar comprovante'})).toBeVisible()
 expect(within(row).getByRole('button',{name:'Estornar'})).toBeInTheDocument()
 expect(within(row).getByRole('button',{name:'Consultar confirmação'})).toBeInTheDocument()
 expect(within(row).getByText('Estornado parcialmente · R$ 80,00')).toBeInTheDocument()
})

it('gestão combina busca, unidade e situação e recalcula somente o resumo da seleção',async()=>{
 adminData([
  {...account,paid:70,payable:30,payments:[received]},
  {...account,id:'bar-open',kind:'Bar',title:'Comanda 12',userId:'other-user',paid:0,payable:80},
  {...account,id:'bar-paid',kind:'Bar',title:'Comanda 20',paid:25,payable:0,payments:[{...received,amount:25,refunded:0}]},
 ])
 mount(<BillingPage admin/>,'/recebimentos',manager)
 await screen.findByRole('article',{name:'Comanda 12'})
 fireEvent.change(screen.getByLabelText('Buscar conta ou responsável'),{target:{value:'joao'}})
 expect(screen.queryByRole('article',{name:'Comanda 12'})).not.toBeInTheDocument()
 expect(screen.getByRole('region',{name:'Resumo dos recebimentos da seleção'})).toHaveTextContent('R$ 95,00')
 fireEvent.change(screen.getByLabelText('Unidade'),{target:{value:'Bar'}})
 expect(screen.queryByRole('article',{name:account.title})).not.toBeInTheDocument()
 expect(screen.getByRole('article',{name:'Comanda 20'})).toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Situação'),{target:{value:'due'}})
 expect(screen.queryByRole('article')).not.toBeInTheDocument()
 expect(screen.getByText('Nenhuma conta nesta seleção.')).toBeInTheDocument()
 expect(screen.getByRole('region',{name:'Resumo dos recebimentos da seleção'})).toHaveTextContent('Recebido registradoR$ 0,00')
 fireEvent.change(screen.getByLabelText('Buscar conta ou responsável'),{target:{value:''}})
 expect(screen.getByRole('article',{name:'Comanda 12'})).toBeInTheDocument()
 expect(screen.getByRole('region',{name:'Resumo dos recebimentos da seleção'})).toHaveTextContent('Saldo a receberR$ 80,00')
})

it('estorno pendente mantém recebido confirmado e impede outra solicitação de estorno',async()=>{
 adminData([{...account,paid:70,payable:30,payments:[{...received,refundPending:20}]}])
 mount(<BillingPage admin/>,'/recebimentos',manager)
 expect(await screen.findByText('Estornos em confirmação: R$ 20,00. Esse valor permanece no recebido até a confirmação.')).toBeInTheDocument()
 const row=screen.getByRole('article',{name:account.title})
 expect(within(row).getByText('Estorno em confirmação')).toBeInTheDocument()
 fireEvent.click(within(row).getByText(account.title,{selector:'summary strong'}))
 fireEvent.click(within(row).getByText('Histórico de pagamentos (1)'))
 expect(within(row).getByText('Estorno aguardando confirmação: R$ 20,00')).toBeInTheDocument()
 expect(within(row).queryByRole('button',{name:'Estornar'})).not.toBeInTheDocument()
 expect(screen.getByRole('region',{name:'Resumo dos recebimentos da seleção'})).toHaveTextContent('Recebido registradoR$ 70,00')
})

it('gestão somente leitura mantém comprovante e não oferece cobrança, vínculo ou estorno',async()=>{
 adminData([{...account,paid:70,payable:0,pending:30,payments:[received,{...received,id:'resume-readonly',state:'Pending',amount:30,refunded:0,canResume:true}]}])
 mount(<BillingPage admin/>,'/recebimentos',{...manager,roles:['Student'],permissions:['finance:read']})
 const row=await screen.findByRole('article',{name:account.title})
 fireEvent.click(within(row).getByText(account.title,{selector:'summary strong'}))
 fireEvent.click(within(row).getByText('Histórico de pagamentos (2)'))
 expect(within(row).getByRole('button',{name:'Consultar confirmação'})).toBeVisible()
 expect(within(row).queryByRole('button',{name:'Retomar pagamento pendente'})).not.toBeInTheDocument()
 expect(within(row).queryByLabelText('CPF ou CNPJ')).not.toBeInTheDocument()
 expect(within(row).getByRole('button',{name:'Baixar comprovante'})).toBeInTheDocument()
 expect(within(row).queryByRole('button',{name:'Estornar'})).not.toBeInTheDocument()
 expect(within(row).queryByRole('button',{name:'Pagar esta conta'})).not.toBeInTheDocument()
 expect(screen.queryByText('Vincular conta ao responsável')).not.toBeInTheDocument()
})

it('gestão indica carregamento e oculta resumo e ações quando a atualização falha',async()=>{
 let release:((response:Response)=>void)|undefined;let fail=false
 vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{
  const url=String(input)
  if(url.endsWith('/config'))return json(config)
  if(url.endsWith('/candidates'))return json({accounts:[],users:[],students:[]})
  return fail?new Response('{}',{status:503}):new Promise<Response>(resolve=>{release=resolve})
 })
 mount(<BillingPage admin/>,'/recebimentos',manager)
 expect(screen.getByRole('status')).toHaveTextContent('Carregando contas')
 expect(screen.queryByRole('region',{name:'Resumo dos recebimentos da seleção'})).not.toBeInTheDocument()
 release!(json([account]))
 await screen.findByRole('article',{name:account.title})
 fail=true
 await clients.at(-1)!.invalidateQueries({queryKey:['billing']})
 expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar')
 expect(screen.queryByRole('article')).not.toBeInTheDocument()
 expect(screen.queryByRole('region',{name:'Resumo dos recebimentos da seleção'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}))
})

it('comanda sem vínculo aparece com valores e comprovante, com ações somente na origem',async()=>{
 const source={...account,id:'unlinked-bar',sourceId:'tab-original',kind:'Bar' as const,title:'Comanda 80',isLinked:false,paid:70,payable:10,pending:20,payments:[received,{...received,id:'unlinked-pending',state:'Pending',amount:20,refunded:0,canResume:true}],items:[{id:'item',name:'Água',quantity:2,unitPrice:5,total:10,state:'Fulfilled'}]}
 adminData([source])
 mount(<BillingPage admin/>,'/recebimentos',manager)
 const row=await screen.findByRole('article',{name:source.title})
 expect(within(row).getByText(/Sem responsável vinculado/,{selector:'summary span'})).toBeVisible()
 expect(screen.getByRole('region',{name:'Resumo dos recebimentos da seleção'})).toHaveTextContent('Recebido registradoR$ 70,00Saldo a receberR$ 10,00Em confirmaçãoR$ 20,00')
 fireEvent.click(within(row).getByText(source.title,{selector:'summary strong'}))
 expect(within(row).getByRole('link',{name:'Abrir comanda original'})).toHaveAttribute('href','/atendimento/comandas/tab-original')
 fireEvent.click(within(row).getByText('Itens da comanda'))
 expect(within(row).getByText('2 × Água')).toBeVisible()
 fireEvent.click(within(row).getByText('Histórico de pagamentos (2)'))
 expect(within(row).getByRole('button',{name:'Baixar comprovante'})).toBeVisible()
 expect(within(row).getByText('Pagamento unlinked-pending')).toBeVisible()
 for(const name of ['Pagar esta conta','Retomar pagamento pendente','Consultar confirmação','Estornar'])expect(within(row).queryByRole('button',{name})).not.toBeInTheDocument()
 expect(vi.mocked(fetch).mock.calls.every(([,init])=>!init?.method)).toBe(true)
})

it('pagamento de Quadra informado no lançamento não fabrica confirmação ou comprovante da operadora',async()=>{
 const source={...account,id:'unlinked-court',sourceId:'entry-original',isLinked:false,paid:100,payable:0,payments:[]}
 adminData([source])
 mount(<BillingPage admin/>,'/recebimentos',manager)
 const row=await screen.findByRole('article',{name:source.title})
 expect(within(row).getByText('Pagamento informado no lançamento')).toBeInTheDocument()
 fireEvent.click(within(row).getByText(source.title,{selector:'summary strong'}))
 expect(within(row).getByRole('link',{name:'Abrir lançamento original'})).toHaveAttribute('href','/financeiro/entry-original')
 fireEvent.click(within(row).getByText('Histórico de pagamentos (0)'))
 expect(within(row).getByText('Pagamento informado no lançamento: R$ 100,00. Não há confirmação da operadora registrada nesta conta.')).toBeVisible()
 expect(within(row).queryByRole('button',{name:'Baixar comprovante'})).not.toBeInTheDocument()
 expect(within(row).queryByText('Nenhum pagamento registrado nesta conta.')).not.toBeInTheDocument()
 expect(screen.getByRole('region',{name:'Resumo dos recebimentos da seleção'})).toHaveTextContent('Recebido registradoR$ 100,00')
 expect(vi.mocked(fetch).mock.calls.every(([,init])=>!init?.method)).toBe(true)
})

it('projeção de Quadra em aberto permanece visível sem habilitar cobrança por billing',async()=>{
 adminData([{...account,isLinked:false}])
 mount(<BillingPage admin/>,'/recebimentos',manager)
 const row=await screen.findByRole('article',{name:account.title})
 expect(within(row).getByText('A receber',{selector:'.billing-situation'})).toBeVisible()
 fireEvent.click(within(row).getByText(account.title,{selector:'summary strong'}))
 expect(within(row).getByRole('link',{name:'Abrir lançamento original'})).toBeVisible()
 expect(within(row).queryByRole('button',{name:'Pagar esta conta'})).not.toBeInTheDocument()
 expect(vi.mocked(fetch).mock.calls.every(([,init])=>!init?.method)).toBe(true)
})

it('Quadra marcada como paga mantém a origem manual quando só há tentativas canceladas',async()=>{
 adminData([{...account,paid:100,payable:0,state:'Pago',payments:[{...received,id:'canceled-attempt',amount:100,refunded:0,state:'Canceled'}]}])
 mount(<BillingPage admin/>,'/recebimentos',manager)
 const row=await screen.findByRole('article',{name:account.title})
 expect(within(row).getByText('Pagamento informado no lançamento',{selector:'.billing-situation'})).toBeVisible()
 fireEvent.click(within(row).getByText(account.title,{selector:'summary strong'}))
 fireEvent.click(within(row).getByText('Histórico de pagamentos (1)'))
 expect(within(row).getByText('Pagamento informado no lançamento: R$ 100,00. Não há confirmação da operadora registrada nesta conta.')).toBeVisible()
 expect(within(row).getByText('Cancelado · R$ 100,00')).toBeVisible()
 expect(within(row).queryByRole('button',{name:'Baixar comprovante'})).not.toBeInTheDocument()
 expect(screen.getByRole('region',{name:'Resumo dos recebimentos da seleção'})).toHaveTextContent('Recebido registradoR$ 100,00')
})

it.each(['Viewer','Auditor'] as const)('leitor %s consulta comanda sem receber link para área sem permissão',async role=>{
 const original={...account,kind:'Bar' as const,isLinked:false,paid:70,payable:30,payments:[received]}
 adminData([original])
 mount(<BillingPage admin/>,'/recebimentos',{...manager,roles:[role],permissions:['finance:read']})
 const row=await screen.findByRole('article',{name:account.title})
 fireEvent.click(within(row).getByText(account.title,{selector:'summary strong'}))
 expect(within(row).queryByRole('link',{name:'Abrir comanda original'})).not.toBeInTheDocument()
 fireEvent.click(within(row).getByText('Histórico de pagamentos (1)'))
 expect(within(row).getByRole('button',{name:'Baixar comprovante'})).toBeVisible()
 expect(within(row).getByText('Estornado parcialmente · R$ 80,00')).toBeVisible()
})

it('histórico de comanda identifica estorno total mesmo quando o pagamento permanece Approved',async()=>{
 adminData([{...account,kind:'Bar',paid:0,payable:100,payments:[{...received,refunded:received.amount}]}])
 mount(<BillingPage admin/>,'/recebimentos',manager)
 const row=await screen.findByRole('article',{name:account.title})
 fireEvent.click(within(row).getByText(account.title,{selector:'summary strong'}))
 fireEvent.click(within(row).getByText('Histórico de pagamentos (1)'))
 expect(within(row).getByText('Estornado · R$ 80,00')).toBeVisible()
 expect(within(row).queryByText(/Estornado parcialmente/)).not.toBeInTheDocument()
 expect(within(row).queryByRole('button',{name:'Estornar'})).not.toBeInTheDocument()
})

it('gestor retoma pagamento pendente com a mesma conta e sem iniciar outra operação',async()=>{
 const resume={...received,id:'resume-manager',state:'Pending',amount:100,refunded:0,canResume:true}
 adminData([{...account,payable:0,pending:100,payments:[resume]}])
 mount(<BillingPage admin/>,'/recebimentos',manager)
 const row=await screen.findByRole('article',{name:account.title})
 fireEvent.click(within(row).getByText(account.title,{selector:'summary strong'}))
 fireEvent.click(within(row).getByRole('button',{name:'Retomar pagamento pendente'}))
 expect(within(row).getByRole('heading',{name:'Retomar o mesmo pagamento'})).toBeVisible()
 expect(within(row).getByLabelText('CPF ou CNPJ')).toBeVisible()
 expect(vi.mocked(fetch).mock.calls.every(([,init])=>!init?.method)).toBe(true)
})

it('responsáveis informam carregamento, falha e recuperação sem simular busca vazia ou vínculo disponível',async()=>{
 let release:((response:Response)=>void)|undefined;let loading=true;let fail=false
 const candidates={accounts:[{id:'entry-to-link',kind:'Quadra',name:'Conta para vínculo'}],users:[{id:user.id,name:'João Silva'}],students:[]}
 vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{
  const url=String(input)
  if(url.endsWith('/config'))return json(config)
  if(url.endsWith('/candidates'))return loading?new Promise<Response>(resolve=>{release=resolve}):fail?new Response('{}',{status:503}):json(candidates)
  return json([account,{...account,id:'other-account',title:'Conta de outra pessoa',userId:'other-user'}])
 })
 mount(<BillingPage admin/>,'/recebimentos',manager)
 await screen.findByRole('article',{name:account.title})
 const search=screen.getByLabelText('Buscar conta ou responsável')
 expect(search).toBeDisabled()
 expect(screen.getByRole('status')).toHaveTextContent('Carregando responsáveis')
 expect(screen.queryByLabelText('Responsável financeiro')).not.toBeInTheDocument()
 loading=false;release!(json(candidates))
 await waitFor(()=>expect(search).toBeEnabled())
 fireEvent.change(search,{target:{value:'joao'}})
 expect(screen.queryByRole('article',{name:'Conta de outra pessoa'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByText('Vincular conta ao responsável'))
 expect(screen.getByLabelText('Responsável financeiro')).toBeVisible()
 fail=true
 await clients.at(-1)!.invalidateQueries({queryKey:['billing-candidates']})
 expect(await screen.findByRole('alert')).toHaveTextContent('A busca está pausada')
 expect(search).toBeDisabled()
 expect(screen.getByRole('article',{name:'Conta de outra pessoa'})).toBeInTheDocument()
 expect(screen.queryByLabelText('Responsável financeiro')).not.toBeInTheDocument()
 fail=false
 fireEvent.click(screen.getByRole('button',{name:'Consultar responsáveis novamente'}))
 await waitFor(()=>expect(search).toBeEnabled())
 expect(screen.queryByRole('alert')).not.toBeInTheDocument()
 expect(screen.queryByRole('article',{name:'Conta de outra pessoa'})).not.toBeInTheDocument()
 expect(screen.getByText('Vincular conta ao responsável')).toBeInTheDocument()
})

it('vínculo vazio apresenta explicação e não oferece formulário sem contas',async()=>{
 adminData([account])
 mount(<BillingPage admin/>,'/recebimentos',manager)
 await screen.findByRole('article',{name:account.title})
 fireEvent.click(screen.getByText('Vincular conta ao responsável'))
 expect(screen.getByText('Nenhuma conta disponível para vínculo.')).toBeVisible()
 expect(screen.queryByLabelText('Conta')).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'Confirmar vínculo'})).not.toBeInTheDocument()
})

it('gestão prioriza confirmações e vencidos e permite selecionar somente valores vencidos',async()=>{
 adminData([
  {...account,id:'received-account',title:'Conta recebida',paid:100,payable:0,payments:[received]},
  {...account,id:'future-account',title:'Conta futura',dueDate:'2099-10-10'},
  {...account,id:'overdue-account',title:'Conta atrasada',dueDate:'2000-10-10'},
  {...account,id:'confirmation-account',title:'Conta em confirmação',dueDate:'2099-10-10',payable:0,pending:100,payments:[{...received,state:'Pending',refunded:0}]},
 ])
 mount(<BillingPage admin/>,'/recebimentos',manager)
 await screen.findByRole('article',{name:'Conta atrasada'})
 const rows=within(screen.getByRole('region',{name:'Contas e recebimentos'})).getAllByRole('article').filter(row=>row.hasAttribute('aria-label'))
 expect(rows.map(row=>row.getAttribute('aria-label'))).toEqual(['Conta em confirmação','Conta atrasada','Conta futura','Conta recebida'])
 expect(within(rows[1]).getByText(/Vencido em 10\/10\/2000/)).toBeVisible()
 fireEvent.change(screen.getByLabelText('Situação'),{target:{value:'overdue'}})
 expect(screen.getAllByRole('article')).toHaveLength(1)
 expect(screen.getByRole('article',{name:'Conta atrasada'})).toBeInTheDocument()
 expect(screen.getByRole('region',{name:'Resumo dos recebimentos da seleção'})).toHaveTextContent('Saldo a receberR$ 100,00')
})

it('mostra o último pagamento confirmado em São Paulo sem usar tentativas ou inventar datas',async()=>{
 const current={...account,paid:80,payable:20,payments:[
  {...received,id:'later-pending',state:'Pending',paidAtUtc:'2026-10-28T12:00:00Z',refunded:0},
  {...received,id:'older-approved',paidAtUtc:'2026-10-20T12:00:00Z',refunded:0},
  {...received,id:'latest-approved',paidAtUtc:'2026-10-25T01:30:00Z',refunded:0},
  {...received,id:'invalid-approved',paidAtUtc:'não é uma data',refunded:0},
 ]}
 adminData([current,{...account,id:'manual-receipt',title:'Pagamento sem data',isLinked:false,paid:100,payable:0,payments:[]}])
 mount(<BillingPage admin/>,'/recebimentos',manager)
 const row=await screen.findByRole('article',{name:account.title})
 expect(within(row).getByText('Último pagamento: 24/10/2026, 22:30')).toBeVisible()
 expect(within(screen.getByRole('article',{name:'Pagamento sem data'})).queryByText(/Último pagamento/)).not.toBeInTheDocument()
 fireEvent.click(within(row).getByText(account.title,{selector:'summary strong'}))
 fireEvent.click(within(row).getByText('Histórico de pagamentos (4)'))
 expect(within(row).getByText('Pix · Pago em 24/10/2026, 22:30')).toBeVisible()
})

it('orienta a renovar uma sessão expirada e não mantém ações de vínculo disponíveis',async()=>{
 vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{
  const url=String(input)
  if(url.endsWith('/config'))return json(config)
  if(url.endsWith('/candidates'))return json({accounts:[{id:'entry-a',kind:'Quadra',name:'Conta'}],users:[{id:user.id,name:'Aluno teste'}],students:[]})
  return new Response(JSON.stringify({message:'Não autorizado.'}),{status:401,headers:{'Content-Type':'application/json'}})
 })
 mount(<BillingPage admin/>,'/recebimentos',manager)
 expect(await screen.findByText(/Sua sessão expirou/)).toBeVisible()
 expect(screen.getByRole('link',{name:'Entrar novamente'})).toHaveAttribute('href','/login')
 expect(screen.queryByText('Vincular conta ao responsável')).not.toBeInTheDocument()
 expect(screen.queryByRole('region',{name:'Resumo dos recebimentos da seleção'})).not.toBeInTheDocument()
})
