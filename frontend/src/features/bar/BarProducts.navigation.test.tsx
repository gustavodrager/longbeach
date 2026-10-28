import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { UnsavedChangesProvider } from '../../components/managementUi'
import { AuthContext } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { BarProductsPage } from './BarPages'

const owner: AuthUser = {
  id: 'synthetic-owner', name: 'Operador sintético', email: 'operator@example.invalid',
  roles: ['Owner'], permissions: [],
}
const locationId = 'b0000000-0000-0000-0000-000000000002'

async function catalog() {
  const entries = Array.from({ length: 43 }, (_, index) => ({
    product: {
      id: `p${index}`, version: 7, name: `Produto ${index}`, code: `C${index}`,
      shortName: `P${index}`, categoryId: 'category', saleUnit: 'un', salePrice: 5,
      controlsStock: true, minimumStock: 2, active: true, displayOrder: index,
      favorite: false, prepared: false,
    },
    purchaseUnit: 'cx', conversionFactor: 12, averageCost: 2, lastCost: 2,
  }))
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (init?.method && init.method !== 'GET') throw new Error('Synthetic navigation test forbids writes')
    const path = new URL(String(input), 'https://example.invalid').pathname
    const value = path.endsWith('/products') ? entries
      : path.endsWith('/categories') ? [{ id: 'category', name: 'Bebidas sintéticas' }]
        : path.endsWith('/suppliers') ? []
          : path.endsWith('/stock/balances') ? entries.map(({ product }) => ({
            productId: product.id, locationId, name: product.name, version: 4,
            quantity: 1, reserved: 0, available: 1, unit: 'un', minimumStock: 2,
            active: true, controlsStock: true, alertEligible: true, low: true,
          })) : undefined
    if (value === undefined) throw new Error(`Unexpected synthetic read: ${path}`)
    return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Root() {
    return <QueryClientProvider client={client}><UnsavedChangesProvider><AuthContext.Provider value={{
      user: owner, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {},
      signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {},
    }}><Outlet /></AuthContext.Provider></UnsavedChangesProvider></QueryClientProvider>
  }
  const state = { returnTo: '/origem', returnLabel: 'Origem sintética' }
  const router = createMemoryRouter([{ element: <Root />, children: [
    { path: '/origem', element: <h1>Origem sintética</h1> },
    { path: '/bar/produtos', element: <BarProductsPage /> },
  ] }], { initialEntries: ['/origem', { pathname: '/bar/produtos', search: '?month=2026-10&q=Produto', state }], initialIndex: 1 })
  const view = render(<RouterProvider router={router} />)
  await screen.findByRole('table', { name: 'Produtos do bar' })
  await waitFor(() => expect(screen.getAllByText('1 un').length).toBeGreaterThan(0))
  return { router, fetch, state, dispose: () => { view.unmount(); router.dispose(); client.clear() } }
}

it.each(['search', 'filter', 'page', 'search-and-page'] as const)('keeps the Bar editor closed when cancel is immediately followed by %s', async next => {
  const fixture = await catalog()
  try {
    fireEvent.click(within(screen.getByRole('row', { name: /Produto 0 / })).getByRole('button', { name: 'Editar' }))
    await screen.findByLabelText('Nome')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bebidas sintéticas', hidden: true })).toBeInTheDocument())

    // Keep the handlers from this render active for the whole rapid sequence.
    // Awaiting every click would hide the stale-query race seen in production.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      if (next === 'search' || next === 'search-and-page') fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
      if (next === 'filter') fireEvent.change(screen.getByLabelText('Disponibilidade'), { target: { value: 'low' } })
      if (next === 'page' || next === 'search-and-page') fireEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    })

    const params = new URLSearchParams(fixture.router.state.location.search)
    expect(params.has('acao')).toBe(false)
    expect(params.has('registro')).toBe(false)
    expect(params.get('month')).toBe('2026-10')
    expect(fixture.router.state.location.state).toEqual(fixture.state)
    expect(params.get('q')).toBe(next === 'search' || next === 'search-and-page' ? null : 'Produto')
    expect(params.get('status')).toBe(next === 'filter' ? 'low' : null)
    expect(params.get('page')).toBe(next === 'page' || next === 'search-and-page' ? '2' : null)
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument()
    if (next === 'page' || next === 'search-and-page') {
      fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
      expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument()
      expect(within(screen.getByRole('row', { name: /Produto 0 / })).getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    }
    expect(fixture.fetch.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
  } finally { fixture.dispose() }
})

it.each(['search', 'filter'] as const)('resets a page selected immediately before a %s change', async next => {
  const fixture = await catalog()
  try {
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Próxima' }))
      if (next === 'search') fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Produto 1' } })
      else fireEvent.change(screen.getByLabelText('Disponibilidade'), { target: { value: 'low' } })
    })
    const params = new URLSearchParams(fixture.router.state.location.search)
    expect(params.has('page')).toBe(false)
    expect(params.get('month')).toBe('2026-10')
    expect(params.get(next === 'search' ? 'q' : 'status')).toBe(next === 'search' ? 'Produto 1' : 'low')
  } finally { fixture.dispose() }
})

it('does not reuse a refused navigation after allowing another filter and then cancelling quickly', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const fixture = await catalog()
  try {
    fireEvent.click(within(screen.getByRole('row', { name: /Produto 0 / })).getByRole('button', { name: 'Editar' }))
    await screen.findByLabelText('Nome')
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Rascunho sintético' } })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Navegação recusada' } })
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('Há alterações não salvas. Deseja sair e descartá-las?'))
    await waitFor(() => expect([...fixture.router.state.blockers.values()].every(blocker => blocker.state === 'unblocked')).toBe(true))
    expect(new URLSearchParams(fixture.router.state.location.search).get('q')).toBe('Produto')
    expect(screen.getByLabelText('Nome')).toHaveValue('Rascunho sintético')

    confirm.mockReturnValue(true)
    fireEvent.change(screen.getByLabelText('Disponibilidade'), { target: { value: 'low' } })
    await waitFor(() => expect(new URLSearchParams(fixture.router.state.location.search).get('status')).toBe('low'))
    expect(new URLSearchParams(fixture.router.state.location.search).get('q')).toBe('Produto')
    expect(confirm).toHaveBeenCalledTimes(2)

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      fireEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    })
    const params = new URLSearchParams(fixture.router.state.location.search)
    expect(params.get('q')).toBe('Produto')
    expect(params.get('status')).toBe('low')
    expect(params.get('page')).toBe('2')
    expect(params.has('acao')).toBe(false)
    expect(params.has('registro')).toBe(false)
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(fixture.fetch.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
  } finally { fixture.dispose() }
})

it('keeps cancel replacement, search replacement and page history intact on back and forward', async () => {
  const fixture = await catalog()
  try {
    fireEvent.click(within(screen.getByRole('row', { name: /Produto 0 / })).getByRole('button', { name: 'Editar' }))
    await screen.findByLabelText('Nome')
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
      fireEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    })
    await act(async () => { await fixture.router.navigate(-1) })
    expect(fixture.router.state.location.search).toBe('?month=2026-10')
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument()
    await act(async () => { await fixture.router.navigate(-1) })
    expect(fixture.router.state.location.search).toBe('?month=2026-10&q=Produto')
    await act(async () => { await fixture.router.navigate(-1) })
    expect(await screen.findByRole('heading', { name: 'Origem sintética' })).toBeInTheDocument()
    await act(async () => { await fixture.router.navigate(1); await fixture.router.navigate(1); await fixture.router.navigate(1) })
    expect(fixture.router.state.location.search).toBe('?month=2026-10&page=2')
    expect(fixture.router.state.location.state).toEqual(fixture.state)
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument()
  } finally { fixture.dispose() }
})
