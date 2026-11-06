import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { setAccessToken, setCsrfToken } from '../../lib/http'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { SellPage } from './AttendancePages'
import type { CatalogItem, Tab } from './api'
import { Products } from './components'

const portion: CatalogItem = {
  id: 'portion-test', name: 'Porção de batata frita', shortName: 'Batata frita',
  categoryId: 'food', categoryName: 'Porções', salePrice: 20, favorite: true,
  displayOrder: 0, available: 0, prepared: true,
}
const unrestricted: CatalogItem = {
  id: 'unrestricted-test', name: 'Água sem controle de estoque', shortName: 'Água livre',
  categoryId: 'drinks', categoryName: 'Bebidas', salePrice: 5, favorite: false,
  displayOrder: 1, available: null, prepared: false,
}

afterEach(() => cleanup())

it('mostra o produto habilitado com saldo zero e mantém o acréscimo bloqueado', () => {
  const change = vi.fn()
  render(<Products products={[portion, unrestricted]} cart={[]} onChange={change} />)

  const emptyProduct = screen.getByRole('button', { name: /Adicionar Batata frita por/ })
  expect(emptyProduct).toBeVisible()
  expect(emptyProduct).toBeDisabled()
  expect(screen.getByText('Sem estoque disponível')).toBeVisible()
  fireEvent.click(emptyProduct)
  expect(change).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: /Adicionar Água livre por/ })).toBeEnabled()
})

it('encontra produtos com e sem saldo pelo nome, sem perder o filtro de categorias', () => {
  render(<Products products={[portion, unrestricted]} cart={[]} onChange={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Porções' }))
  expect(screen.getByRole('button', { name: /Adicionar Batata frita por/ })).toBeDisabled()
  expect(screen.queryByRole('button', { name: /Adicionar Água livre por/ })).not.toBeInTheDocument()

  const search = screen.getByRole('searchbox', { name: 'Procurar produto' })
  fireEvent.change(search, { target: { value: 'agua' } })
  expect(screen.getByRole('button', { name: /Adicionar Água livre por/ })).toBeEnabled()
  expect(screen.queryByRole('button', { name: /Adicionar Batata frita por/ })).not.toBeInTheDocument()

  fireEvent.change(search, { target: { value: 'batata' } })
  expect(screen.getByRole('button', { name: /Adicionar Batata frita por/ })).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Nenhum produto nesta seleção' })).not.toBeInTheDocument()
})

it('mantém os favoritos visíveis mesmo quando todos estão sem saldo', () => {
  render(<Products products={[portion, unrestricted]} cart={[]} onChange={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Favoritos' }))
  expect(screen.getByRole('button', { name: /Adicionar Batata frita por/ })).toBeDisabled()
  expect(screen.queryByRole('button', { name: /Adicionar Água livre por/ })).not.toBeInTheDocument()
})

it.each([0, 0.5, -1])('exibe saldo %s sem permitir adicionar uma unidade inteira', available => {
  const change = vi.fn()
  render(<Products products={[{ ...portion, available }]} cart={[]} onChange={change} />)
  const add = screen.getByRole('button', { name: /Adicionar Batata frita por/ })
  expect(add).toBeVisible()
  expect(add).toBeDisabled()
  fireEvent.click(add)
  expect(change).not.toHaveBeenCalled()
})

it('permite retirar um produto que esgotou do rascunho sem aumentar a quantidade', () => {
  const change = vi.fn()
  render(<Products products={[portion]} cart={[{ productId: portion.id, quantity: 1 }]} onChange={change} />)

  expect(screen.getByRole('button', { name: 'Adicionar uma unidade de Batata frita' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Retirar uma unidade de Batata frita' }))
  expect(change).toHaveBeenCalledExactlyOnceWith([])
})

it('preserva o cardápio do cliente: esgotados fora do rascunho continuam ocultos', () => {
  render(<Products client products={[portion, unrestricted]} cart={[]} onChange={() => {}} />)
  expect(screen.queryByRole('button', { name: /Adicionar Batata frita por/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Adicionar Água livre por/ })).toBeEnabled()
})

const attendant: AuthUser = {
  id: 'catalog-attendant-test', name: 'Atendente teste', email: 'atendente@example.test', roles: ['Operations'],
  permissions: ['bar:sales:read', 'bar:sales:operate', 'bar:cash:operate'],
}
const tab: Tab = {
  id: 'tab-test', number: 12, version: 1, customer: null, name: 'Visitante', mode: 'Tab', state: 'Open',
  locationId: 'bar-test', actorId: attendant.id, total: 0, paid: 0, pending: 0, due: 0, payable: 0,
  createdAtUtc: '2026-11-05T15:00:00Z', items: [], payments: [], history: [], allowedActions: [],
}
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

it.each([
  ['venda avulsa', '/atendimento/vender'],
  ['comanda aberta', '/atendimento/vender?comanda=tab-test'],
])('consulta o catálogo de venda e mostra produtos disponíveis na %s', async (_name, path) => {
  localStorage.clear(); sessionStorage.clear(); setAccessToken(null); setCsrfToken(null)
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    if (init?.method && init.method !== 'GET') throw new Error('O teste não deve registrar vendas.')
    if (url.pathname.endsWith('/tabs/locations')) return json([{ id: 'bar-test', name: 'Bar' }])
    if (url.pathname.endsWith('/tabs/catalog')) return json([portion, unrestricted])
    if (url.pathname.endsWith('/tabs/tab-test')) return json(tab)
    if (url.pathname.endsWith('/customers/lookup')) return json([])
    throw new Error(`Consulta inesperada: ${url.pathname}`)
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const auth: AuthContextValue = {
    user: attendant, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {},
    signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {},
  }
  try {
    render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><MemoryRouter initialEntries={[path]}><SellPage /></MemoryRouter></AuthContext.Provider></QueryClientProvider>)
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Procurar produto' }), { target: { value: 'batata' } })
    expect(await screen.findByRole('button', { name: /Adicionar Batata frita por/ })).toBeDisabled()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Procurar produto' }), { target: { value: 'agua' } })
    const add = screen.getByRole('button', { name: /Adicionar Água livre por/ })
    expect(add).toBeEnabled()
    fireEvent.click(add)
    await waitFor(() => expect(screen.getByLabelText('Quantidade de Água livre')).toHaveTextContent('1'))
    expect(fetch.mock.calls.some(([input]) => String(input).includes('/tabs/catalog?locationId=bar-test'))).toBe(true)
    expect(fetch.mock.calls.some(([input]) => String(input).includes('/bar/products'))).toBe(false)
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  } finally {
    cleanup(); client.clear(); localStorage.clear(); sessionStorage.clear(); setAccessToken(null); setCsrfToken(null)
  }
})
