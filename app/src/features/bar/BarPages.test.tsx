import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../auth/authContext'
import { BarLayout, BarPosPage } from './BarPages'
import type { AuthUser } from '../auth/types'
const user: AuthUser={id:'operator',name:'Operador',email:'test@longbeach.test',roles:['Operations'],permissions:['bar:catalog:read','bar:sales:operate','bar:cash:operate','bar:stock:read']}
const session={id:'session',state:'Open',locationId:'bar',terminal:'Tablet',expected:100}
function wrapper(children:React.ReactNode, authUser=user){const auth={user:authUser,isBootstrapping:false,signIn:async()=>{},signInWithGoogle:async()=>{},signOut:async()=>{},changePassword:async()=>{}};return <QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><AuthContext.Provider value={auth}>{children}</AuthContext.Provider></MemoryRouter></QueryClientProvider>}
function response(body:unknown){return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}})}
function mockApi(stock=5){return vi.spyOn(globalThis,'fetch').mockImplementation(async(input)=>{const path=String(input);if(path.endsWith('/catalog'))return response([{id:'water',name:'Água',shortName:'Água',salePrice:5,controlsStock:true}]);if(path.endsWith('/stock/balances'))return response([{productId:'water',locationId:'bar',available:stock}]);if(path.endsWith('/cash/sessions'))return response([session]);if(path.endsWith('/payments/config'))return response({pixEnabled:false});if(path.endsWith('/categories'))return response([]);if(path.endsWith('/sales'))return response({id:'sale',total:5});if(path.includes('/payments/cash'))return response({sale:{id:'sale'},paymentId:'payment',change:0});return response({})})}
afterEach(()=>vi.restoreAllMocks())
it('não oferece custo, catálogo administrativo ou conciliação para operador',()=>{render(wrapper(<BarLayout/>));expect(screen.queryByRole('link',{name:'Produtos'})).not.toBeInTheDocument();expect(screen.queryByRole('link',{name:'Conciliação'})).not.toBeInTheDocument();expect(screen.getByRole('link',{name:'Atendimento'})).toBeInTheDocument()})
it('desabilita produto sem estoque disponível',async()=>{mockApi(0);render(wrapper(<BarPosPage/>));expect(await screen.findByRole('button',{name:/Água.*Sem estoque/})).toBeDisabled()})
it('inclui produto por toque e confirma dinheiro no backend existente',async()=>{const api=mockApi();render(wrapper(<BarPosPage/>));const u=userEvent.setup();await u.click(await screen.findByRole('button',{name:/Água/}));await u.selectOptions(screen.getByLabelText('Forma de pagamento'),'cash');await u.clear(screen.getByLabelText('Dinheiro recebido (R$; zero para cartão)'));await u.type(screen.getByLabelText('Dinheiro recebido (R$; zero para cartão)'),'5');await u.click(screen.getByRole('button',{name:'Receber'}));expect(await screen.findByText('Operação registrada.')).toBeInTheDocument();expect(api.mock.calls.some(([url])=>String(url).endsWith('/api/v1/bar/sales/sale/payments/cash'))).toBe(true)})
