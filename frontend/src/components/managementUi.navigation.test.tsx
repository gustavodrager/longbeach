import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import { useContextSearchParams } from './managementUi'

function QueryActions() {
  const [, edit] = useContextSearchParams()
  const [, filter] = useContextSearchParams()
  const location = useLocation()
  return <><output>{location.search}</output>
    <button onClick={() => edit(current => { current.delete('acao'); current.delete('registro'); return current }, { replace: true, preventScrollReset: true })}>Fechar ficha</button>
    <button onClick={() => filter(current => { current.set('q', 'sintético'); current.delete('page'); return current }, { preventScrollReset: true })}>Buscar seleção</button>
  </>
}

it('composes query changes with an accepted navigation still waiting for its loader', async () => {
  const pending: Array<() => void> = []
  const state = { returnTo: '/origem' }
  const router = createMemoryRouter([{ path: '/lista', element: <QueryActions />, loader: ({ request }) => {
    if (new URL(request.url).searchParams.has('acao')) return null
    return new Promise<null>(resolve => pending.push(() => resolve(null)))
  } }], { initialEntries: [{ pathname: '/lista', search: '?month=2026-10&page=3&acao=editar&registro=synthetic', state }] })
  const view = render(<RouterProvider router={router} />)
  try {
    await screen.findByRole('button', { name: 'Fechar ficha' })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Fechar ficha' }))
      fireEvent.click(screen.getByRole('button', { name: 'Buscar seleção' }))
    })
    expect(router.state.navigation.location?.search).toBe('?month=2026-10&q=sint%C3%A9tico')
    await act(async () => { pending.forEach(resolve => resolve()) })
    await waitFor(() => expect(router.state.navigation.state).toBe('idle'))
    expect(router.state.location.search).toBe('?month=2026-10&q=sint%C3%A9tico')
    expect(router.state.location.state).toEqual(state)
  } finally { view.unmount(); router.dispose() }
})

it('retains normal query updates outside a data router', () => {
  const view = render(<MemoryRouter initialEntries={['/lista?month=2026-10&page=3&acao=editar&registro=synthetic']}><QueryActions /></MemoryRouter>)
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Fechar ficha' }))
    expect(screen.getByRole('status')).toHaveTextContent('?month=2026-10&page=3')
    fireEvent.click(screen.getByRole('button', { name: 'Buscar seleção' }))
    expect(screen.getByRole('status')).toHaveTextContent('?month=2026-10&q=sint%C3%A9tico')
  } finally { view.unmount() }
})
