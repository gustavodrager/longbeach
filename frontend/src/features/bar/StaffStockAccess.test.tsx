import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { BarProductsPage, BarCountsPage, BarLossesPage, BarPurchasesPage } from './BarPages'
import { BarRecipesPage } from './RecipePage'
import { MenuEditorPage } from '../menu/MenuEditorPage'

const actor: AuthUser = { id: 'stock-reader-fixture', name: 'Consulta teste', email: 'reader@example.invalid', roles: ['Manager'], permissions: ['bar:catalog:write', 'bar:purchases:manage', 'bar:stock:read', 'bar:stock:manage', 'bar:stock:output', 'bar:supervise'], staffAccess: { typeId: 'gestor', name: 'Consulta estoque', role: 'Manager', menus: ['stock'], actions: [], homePath: '/bar/produtos' } }
const product = { product: { id: 'water-test', code: 'T01', name: 'Água teste', shortName: 'Água', categoryId: null, saleUnit: 'un', salePrice: 5, minimumStock: 1, controlsStock: true, prepared: true, favorite: false, active: true, displayOrder: 1, version: 1 }, averageCost: 2, conversionFactor: 1, purchaseUnit: 'un' }
const purchase = { id: 'purchase-test', version: 1, supplierId: 'supplier-test', document: 'Compra teste', state: 'Ordered', total: 10, freight: 0, discount: 0, paymentMethod: 'Pending', items: [{ productId: product.product.id, quantity: 2, received: 0, purchaseUnit: 'un', conversion: 1 }] }
const clients: QueryClient[] = []
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
function server() { return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
  const path = new URL(String(input), 'https://test.invalid').pathname
  if (init?.method && init.method !== 'GET') throw new Error('Consulta não pode gravar.')
  if (path.endsWith('/purchases/products')) return json([{ id: product.product.id, name: product.product.name }])
  if (path.endsWith('/products')) return json([product])
  if (path.endsWith('/categories') || path.endsWith('/suppliers')) return json([])
  if (path.endsWith('/stock/locations')) return json([{ id: 'b0000000-0000-0000-0000-000000000002', name: 'Bar' }])
  if (path.endsWith('/stock/balances')) return json([{ productId: product.product.id, locationId: 'b0000000-0000-0000-0000-000000000002', name: product.product.name, available: 5, quantity: 5, reserved: 0, active: true, controlsStock: true, alertEligible: true, unit: 'un', minimumStock: 1 }])
  if (path.endsWith('/purchases/history')) return json({ items: [purchase], page: 1, pageSize: 20, total: 1, awaiting: 1, partial: 0, completed: 0 })
  if (path.endsWith('/catalog')) return json([product.product])
  if (path.endsWith('/counts')) return json([{ id: 'count-test', locationId: 'b0000000-0000-0000-0000-000000000002', initial: false, state: 'Counting', items: [{ productId: product.product.id, theoretical: 5, counted: null }] }])
  if (path.endsWith('/recipes')) return json({ items: [], page: 1, pageSize: 20, total: 0 })
  if (path.endsWith('/menu')) return json({ version: 1, draft: { title: 'CARDÁPIO', pages: [] }, published: null })
  throw new Error(`Consulta inesperada: ${path}`)
}) }
function mount(content: ReactNode, path = '/bar/produtos') {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(query)
  const auth: AuthContextValue = { user: actor, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
  render(<QueryClientProvider client={query}><AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}>{content}</MemoryRouter></AuthContext.Provider></QueryClientProvider>)
}
afterEach(() => { cleanup(); clients.splice(0).forEach(query => query.clear()); vi.restoreAllMocks() })

it.each(['novo', 'editar&registro=water-test'])('consulta produtos sem abrir edição pela URL, mesmo com concessões antigas exigidas pelos GETs (%s)', async action => {
  const api = server(); mount(<BarProductsPage />, `/bar/produtos?acao=${action}`)
  expect(await screen.findByRole('table', { name: 'Produtos do bar' })).toHaveTextContent('Água teste')
  expect(screen.queryByRole('button', { name: /Novo produto|Editar|Salvar/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Contar estoque|Receber compra|Registrar perda/ })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Compras' })).toHaveAttribute('href', '/bar/compras')
  expect(api.mock.calls.some(([path]) => String(path).endsWith('/products'))).toBe(true)
})

it('consulta compras sem criar, receber, corrigir referência ou cancelar pela URL', async () => {
  server(); mount(<BarPurchasesPage />, '/bar/compras?acao=receber&registro=purchase-test')
  await screen.findByRole('heading', { name: 'Compra teste · Comprada' })
  fireEvent.click(screen.getByText('Ver itens e pagamento'))
  expect(await screen.findByRole('table', { name: 'Itens de Compra teste' })).toHaveTextContent('Água teste')
  expect(screen.queryByRole('button', { name: /Nova compra|Receber produtos|Corrigir conta|Cancelar saldo/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('consulta uma contagem em andamento sem entrada de quantidades, aprovação ou cancelamento', async () => {
  server(); mount(<BarCountsPage />, '/bar/inventario?acao=contagem&registro=count-test')
  const panel = await screen.findByRole('dialog', { name: 'Consultar inventário' })
  expect(within(panel).getByText('Água teste')).toBeInTheDocument()
  expect(within(panel).queryByRole('textbox', { name: /Contado:/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Nova contagem|Revisar ajustes|Cancelar este inventário|Zerar/ })).not.toBeInTheDocument()
})

it('consulta perdas e receitas sem oferecer saída ou criação de versão', async () => {
  server(); mount(<><BarLossesPage /><Routes><Route path="/bar/receitas/:productId" element={<BarRecipesPage />} /></Routes></>, '/bar/receitas/water-test?acao=novo')
  await screen.findByRole('option', { name: 'Água teste' })
  expect(screen.queryByRole('button', { name: /Registrar saída|Cadastrar primeira receita|Criar nova versão/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('consulta o cardápio e a prévia sem editar, salvar ou publicar', async () => {
  server(); mount(<MenuEditorPage />, '/bar/cardapio')
  await screen.findByText('Versão de edição: 1 · Ainda sem publicação')
  expect(screen.getByRole('button', { name: 'Conferir prévia' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: /Salvar rascunho|Publicar versão|Adicionar página/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: 'Título' })).not.toBeInTheDocument()
})
