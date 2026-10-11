import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import { BillingPage } from './BillingPages'
import { AccountCheckout } from './AccountCheckout'
import type { AuthUser } from '../auth/types'
import type { Account, Config } from './api'
const user:AuthUser={id:'student-a',name:'Aluno teste',email:'student@example.invalid',roles:['Student'],permissions:[]}
const account:Account={id:'account-a',kind:'Quadra',sourceId:'entry-a',title:'Mensalidade de outubro',dueDate:'2026-10-10',total:100,paid:0,pending:0,payable:100,state:'Pendente',payments:[],recurringEligible:true,userId:user.id,competence:'2026-10'}
const config:Config={pixEnabled:true,cardEnabled:true,subscriptionsEnabled:true,cardPublicKey:'public-key',subscriptionPublicKey:'subscription-key'}
const clients:QueryClient[]=[]
function mount(content:React.ReactNode, path='/minha-area/pagamentos'){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);const auth:AuthContextValue={user,isBootstrapping:false,signIn:async()=>{},signInWithGoogle:async()=>{},signOut:async()=>{},changePassword:async()=>{},completeFirstAccessWithGoogle:async()=>{}};render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}>{content}</MemoryRouter></AuthContext.Provider></QueryClientProvider>)}
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
