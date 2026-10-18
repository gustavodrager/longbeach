import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { DashboardBarAttention } from './DashboardBarAttention'

const auth = vi.hoisted(() => ({ roles: ['Owner'], permissions: [] as string[] }))
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'attention-test', ...auth } }) }))
const report = { value: 45, available: true, updatedAtUtc: '2026-10-15T12:00:00Z', rows: { total: 2 } }
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><MemoryRouter><DashboardBarAttention /></MemoryRouter></QueryClientProvider>)
  return { ...view, client }
}
afterEach(() => { auth.roles = ['Owner']; auth.permissions = []; vi.restoreAllMocks() })

it('alerta para Pix sem confirmação e retira o alerta quando não há mais pendências', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(report)))
  const { client } = mount()
  expect(await screen.findByRole('link', { name: /Pix aguardando confirmação/ })).toHaveAttribute('href', '/bar/indicadores/pending-payments')
  expect(screen.getByText(/Comandas do sistema/)).toHaveTextContent('ainda não é recebimento confirmado')
  fetch.mockResolvedValue(new Response(JSON.stringify({ ...report, value: 0 })))
  await act(async () => { await client.refetchQueries() })
  await waitFor(() => expect(screen.queryByRole('link')).not.toBeInTheDocument())
})

it('não apresenta uma consulta falha como ausência de Pix pendentes', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(report)))
  const { client } = mount()
  await screen.findByRole('link', { name: /Pix aguardando confirmação/ })
  fetch.mockResolvedValue(new Response('{}', { status: 503 }))
  await act(async () => { await client.refetchQueries() })
  await waitFor(() => expect(screen.getByText(/Pix pendentes: consulta indisponível/)).toBeInTheDocument())
  expect(screen.queryByText(/45,00/)).not.toBeInTheDocument()
})

it('não consulta dados financeiros para um perfil sem permissão', () => {
  auth.roles = ['Operations']
  const fetch = vi.spyOn(globalThis, 'fetch')
  mount()
  expect(fetch).not.toHaveBeenCalled()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})
