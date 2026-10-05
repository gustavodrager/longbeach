import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { BarRecipesPage, type RecipeVersion } from './RecipePage'

const prepared = { product: { id: '11111111-1111-1111-1111-111111111111', name: 'Porção preparada', shortName: 'Porção', saleUnit: 'porção', prepared: true, active: true, controlsStock: false }, purchaseUnit: 'porção', conversionFactor: 1 }
const ingredient = { product: { id: '22222222-2222-2222-2222-222222222222', name: 'Ingrediente de teste', shortName: 'Ingrediente', saleUnit: 'un', prepared: false, active: true, controlsStock: true }, purchaseUnit: 'caixa', conversionFactor: 12 }
const manager: AuthUser = { id: '33333333-3333-3333-3333-333333333333', name: 'Gestor teste', email: 'teste@example.com', roles: ['StockManager'], permissions: ['bar:catalog:read', 'bar:catalog:write'] }
const clients: QueryClient[] = []
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const version = (number = 1): RecipeVersion => ({ id: `44444444-4444-4444-4444-${String(number).padStart(12, '0')}`, productId: prepared.product.id, productName: prepared.product.name, version: number, yieldQuantity: 10, reason: `Formulação ${number}`, actorId: manager.id, createdAtUtc: '2026-10-04T12:00:00Z', ingredients: [{ id: '55555555-5555-5555-5555-555555555555', productId: ingredient.product.id, name: ingredient.product.name, quantity: 2, unit: 'Purchase', conversionFactor: 12, stockUnit: 'un', stockQuantity: 24 }] })
function start(path = `/bar/receitas/${prepared.product.id}`, user = manager) {
  const auth: AuthContextValue = { user, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {} }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(query)
  render(<QueryClientProvider client={query}><AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}><Routes><Route path="/bar/receitas" element={<BarRecipesPage />} /><Route path="/bar/receitas/:productId" element={<BarRecipesPage />} /></Routes></MemoryRouter></AuthContext.Provider></QueryClientProvider>)
}
function server(recipes: RecipeVersion[], post?: (body: Record<string, unknown>) => Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    if (init?.method === 'POST') return post ? post(JSON.parse(String(init.body))) : json({ message: 'POST inesperado' }, 400)
    if (url.pathname.endsWith('/products')) return json([prepared, ingredient])
    if (/\/recipes\/[\w-]+$/.test(url.pathname)) return json(recipes.find(row => url.pathname.endsWith(row.id)))
    if (url.pathname.endsWith('/recipes')) return json({ items: [...recipes].sort((a, b) => b.version - a.version), page: 1, pageSize: 20, total: recipes.length })
    return json([])
  })
}
afterEach(() => { clients.splice(0).forEach(client => client.clear()); sessionStorage.clear(); localStorage.clear() })

it('restringe receitas e ingredientes à gestão do catálogo', () => {
  const fetchMock = server([version()])
  start('/bar/receitas', { ...manager, roles: ['BarOperator'], permissions: ['bar:catalog:read', 'bar:sales:operate'] })
  expect(screen.getByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument()
  expect(screen.queryByText(ingredient.product.name)).not.toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})

it('seleciona preparado e unidades, grava uma versão uma vez com dois envios', async () => {
  const recipes: RecipeVersion[] = []; let finish: ((response: Response) => void) | undefined
  const fetchMock = server(recipes, async () => new Promise(resolve => { finish = resolve }))
  start('/bar/receitas')
  const user = userEvent.setup()
  await screen.findByRole('option', { name: prepared.product.name })
  await user.selectOptions(screen.getByLabelText('Produto preparado'), prepared.product.id)
  await user.click(await screen.findByRole('button', { name: 'Cadastrar primeira receita' }))
  await user.clear(screen.getByLabelText('Rendimento (porção)')); await user.type(screen.getByLabelText('Rendimento (porção)'), '10')
  await user.type(screen.getByLabelText('Motivo desta versão'), 'Formulação 1')
  await user.selectOptions(screen.getByLabelText('Ingrediente 1'), ingredient.product.id)
  await user.clear(screen.getByLabelText('Quantidade do ingrediente 1')); await user.type(screen.getByLabelText('Quantidade do ingrediente 1'), '2')
  await user.selectOptions(screen.getByLabelText('Unidade do ingrediente 1'), 'Purchase')
  expect(screen.getByText(/Será registrado: 24 un de estoque/)).toBeInTheDocument()
  const form = screen.getByRole('button', { name: 'Salvar versão da receita' }).closest('form')!
  act(() => { fireEvent.submit(form); fireEvent.submit(form) })
  await waitFor(() => expect(finish).toBeDefined())
  const writes = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(writes).toHaveLength(1)
  expect(JSON.parse(String(writes[0][1]?.body))).toEqual({ operationId: expect.any(String), productId: prepared.product.id, yieldQuantity: 10, reason: 'Formulação 1', ingredients: [{ productId: ingredient.product.id, quantity: 2, unit: 'Purchase' }] })
  recipes.push(version()); act(() => finish!(json(recipes[0], 201)))
  expect(await screen.findByText(/Versão 1 registrada/)).toBeInTheDocument()
  await waitFor(() => expect(screen.getByText('Receita atual')).toBeInTheDocument())
})

it('falha incerta preserva UUID e ingredientes, replay retorna a mesma versão', async () => {
  const recipes: RecipeVersion[] = []; let attempts = 0
  const fetchMock = server(recipes, async () => { attempts++; if (attempts === 1) { recipes.push(version()); return json({ message: 'Conexão interrompida.' }, 503) } return json(recipes[0]) })
  start()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Cadastrar primeira receita' }))
  await user.type(screen.getByLabelText('Motivo desta versão'), 'Receita de teste')
  await user.selectOptions(screen.getByLabelText('Ingrediente 1'), ingredient.product.id)
  await user.click(screen.getByRole('button', { name: 'Salvar versão da receita' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Conexão interrompida')
  expect(screen.getByLabelText('Ingrediente 1')).toBeDisabled()
  expect(screen.getByLabelText('Produto preparado')).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Repetir registro da versão' }))
  expect(await screen.findByText(/Versão 1 registrada/)).toBeInTheDocument()
  const bodies = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(String(init?.body)))
  expect(bodies).toHaveLength(2); expect(bodies[0]).toEqual(bodies[1]); expect(recipes).toHaveLength(1)
  expect(`${localStorage.getItem('longbeach-os-demo-v1') ?? ''}${JSON.stringify(sessionStorage)}`).not.toContain('Receita de teste')
})

it('consulta versão anterior sem trocar sua conversão pela receita atual', async () => {
  const old = version(1); const latest = { ...version(2), yieldQuantity: 20, ingredients: [{ ...old.ingredients[0], quantity: 3, stockQuantity: 36 }] }
  server([old, latest]); start()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('link', { name: /Versão 1.*Formulação 1/ }))
  expect(await screen.findByRole('heading', { name: 'Versão 1 · Porção preparada' })).toBeInTheDocument()
  expect(screen.getByText(/24 un de estoque por receita/)).toBeInTheDocument()
  expect(screen.queryByText(/36 un de estoque por receita/)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver receita atual →' })).toHaveAttribute('href', `/bar/receitas/${prepared.product.id}`)
})
