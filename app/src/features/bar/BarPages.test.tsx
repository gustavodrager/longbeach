import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../auth/authContext'
import { BarPosPage, BarStockPage, BarCountsPage, BarLossesPage, BarPurchasesPage, BarCashPage } from './BarPages'
import { visibleNavigation, attendantNavigation } from '../../components/navigation'
import type { AuthUser } from '../auth/types'
const user: AuthUser={id:'operator',name:'Operador',email:'test@longbeach.test',roles:['Operations'],permissions:['bar:catalog:read','bar:sales:operate','bar:cash:operate','bar:stock:read']}
const session={id:'session',state:'Open',locationId:'bar',terminal:'Tablet',expected:100}
function wrapper(children:React.ReactNode, authUser=user, path='/'){const auth={user:authUser,isBootstrapping:false,signIn:async()=>{},signInWithGoogle:async()=>{},signOut:async()=>{},changePassword:async()=>{}, completeFirstAccessWithGoogle: async () => {}};return <QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter initialEntries={[path]}><AuthContext.Provider value={auth}>{children}</AuthContext.Provider></MemoryRouter></QueryClientProvider>}
function response(body:unknown){return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}})}
function mockApi(stock=5){return vi.spyOn(globalThis,'fetch').mockImplementation(async(input)=>{const path=String(input);if(path.endsWith('/catalog'))return response([{id:'water',name:'Água',shortName:'Água',salePrice:5,controlsStock:true}]);if(path.endsWith('/stock/balances'))return response([{productId:'water',locationId:'bar',available:stock}]);if(path.endsWith('/cash/sessions'))return response([session]);if(path.endsWith('/payments/config'))return response({pixEnabled:false});if(path.endsWith('/categories'))return response([]);if(path.endsWith('/sales'))return response({id:'sale',total:5});if(path.includes('/payments/cash'))return response({sale:{id:'sale'},paymentId:'payment',change:0});return response({})})}
afterEach(()=>vi.restoreAllMocks())
it('oferece apenas grupos permitidos para operador, preservando o atendimento',()=>{const can=(item:{permission?:string;owner?:boolean;kind?:string})=>!item.owner&&!item.kind&&(!item.permission||user.permissions.includes(item.permission));const bar=visibleNavigation(can).find(item=>item.label==='Bar');expect(bar?.children?.map(item=>item.label)).toEqual(['Estoque']);expect(attendantNavigation.filter(can).map(item=>item.label)).toEqual(['Vender','Pedidos','Meu caixa'])})
it('desabilita produto sem estoque disponível',async()=>{mockApi(0);render(wrapper(<BarPosPage/>));expect(await screen.findByRole('button',{name:/Água.*Sem estoque/})).toBeDisabled()})
it('inclui produto por toque e confirma dinheiro no backend existente',async()=>{const api=mockApi();render(wrapper(<BarPosPage/>));const u=userEvent.setup();await u.click(await screen.findByRole('button',{name:/Água/}));await u.selectOptions(screen.getByLabelText('Forma de pagamento'),'cash');await u.clear(screen.getByLabelText('Dinheiro recebido (R$; zero para cartão)'));await u.type(screen.getByLabelText('Dinheiro recebido (R$; zero para cartão)'),'5');await u.click(screen.getByRole('button',{name:'Receber'}));expect(await screen.findByText('Operação registrada.')).toBeInTheDocument();expect(api.mock.calls.some(([url])=>String(url).endsWith('/api/v1/bar/sales/sale/payments/cash'))).toBe(true)})

const stockLocations = [{ id: 'warehouse', name: 'Almoxarifado' }, { id: 'bar', name: 'Bar' }]
function stockApi(locations = stockLocations) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    if (init?.method && init.method !== 'GET') return response({ id: 'saved' })
    if (path.endsWith('/stock/locations')) return response(locations)
    if (path.endsWith('/stock/balances')) return response([
      { productId: 'water', locationId: 'bar', name: 'Água', quantity: 5, reserved: 1, available: 4, low: false },
      { productId: 'water', locationId: 'warehouse', name: 'Água', quantity: 20, reserved: 0, available: 20, low: false },
    ])
    if (path.endsWith('/catalog')) return response([{ id: 'water', name: 'Água', controlsStock: true }])
    if (path.endsWith('/cash/registers')) return response([{ id: 'register', name: 'Principal' }])
    if (path.endsWith('/purchases')) return response([{ id: 'purchase', document: 'Compra de teste', state: 'Ordered', total: 10, freight: 0, discount: 0, items: [{ productId: 'water', quantity: 2, received: 0, purchaseUnit: 'un' }] }])
    return response([])
  })
}
it('usa o saldo do Bar mesmo com filtro antigo na URL e preserva saldos anteriores separados', async () => {
  stockApi()
  render(wrapper(<BarStockPage/>, { ...user, roles: ['Owner'] }, '/bar/estoque?location=warehouse'))
  const table = await screen.findByRole('table', { name: 'Saldos do estoque' })
  expect(within(table).getByText('4')).toBeInTheDocument()
  expect(within(table).queryByText('20')).not.toBeInTheDocument()
  expect(screen.queryByRole('columnheader', { name: 'Local' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Local')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Novo local|Transferir estoque/ })).not.toBeInTheDocument()
  await userEvent.click(screen.getByText('Saldos anteriores para conferência'))
  expect(await screen.findByRole('table', { name: 'Saldos anteriores' })).toHaveTextContent('Almoxarifado')
})
it.each([
  { component: <BarCountsPage/>, action: 'Nova contagem', submit: 'Abrir contagem', endpoint: '/counts' },
  { component: <BarLossesPage/>, action: 'Registrar saída', submit: 'Registrar saída', endpoint: '/stock/losses' },
  { component: <BarPurchasesPage/>, action: 'Receber produtos', submit: 'Confirmar quantidades recebidas agora', endpoint: '/purchases/purchase/receive' },
  { component: <BarCashPage/>, action: 'Abrir caixa', submit: 'Abrir sessão', endpoint: '/cash/sessions' },
])('envia automaticamente o Bar em $action, mesmo quando Almoxarifado vem primeiro', async ({ component, action, submit, endpoint }) => {
  const api = stockApi(); const u = userEvent.setup()
  render(wrapper(component))
  await u.click(await screen.findByRole('button', { name: action }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).queryByLabelText(/Local/)).not.toBeInTheDocument()
  if (endpoint === '/stock/losses') {
    await u.selectOptions(within(dialog).getByLabelText('Tipo de saída'), 'losses')
    await u.selectOptions(within(dialog).getByLabelText('Produto'), 'water')
    await u.type(within(dialog).getByLabelText('Quantidade'), '1')
    await u.type(within(dialog).getByLabelText('Motivo e responsável pelo consumo'), 'Quebra no transporte')
  }
  if (endpoint === '/cash/sessions') {
    await u.selectOptions(within(dialog).getByLabelText('Caixa físico'), 'register')
    await u.type(within(dialog).getByLabelText('Terminal'), 'Balcão')
    await u.type(within(dialog).getByLabelText('Fundo inicial (R$)'), '10')
  }
  await u.click(within(dialog).getByRole('button', { name: submit }))
  expect(await within(dialog).findByText('Operação registrada.')).toBeInTheDocument()
  const write = api.mock.calls.find(([url, init]) => String(url).endsWith(endpoint) && init?.method === 'POST')
  expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({ locationId: 'bar' })
})
it.each([
  [{ id: 'warehouse', name: 'Almoxarifado' }],
  [{ id: 'bar', name: 'Bar' }, { id: 'other', name: ' BAR ' }],
])('bloqueia a contagem quando não há estoque Bar único: %j', async (...items) => {
  const api = stockApi(items)
  render(wrapper(<BarCountsPage/>))
  await userEvent.click(screen.getByRole('button', { name: 'Nova contagem' }))
  expect(await screen.findByText('Estoque do Bar não configurado. Peça à gestão para conferir o cadastro.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Abrir contagem' })).toBeDisabled()
  expect(api.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
})
