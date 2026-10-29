import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { apiFetch, setAccessToken, setCsrfToken } from '../../lib/http'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './authContext'
import { hasPermission } from './access'
import type { AuthUser } from './types'

const manager: AuthUser = { id: 'person', name: 'Pessoa teste', email: 'person@example.invalid', roles: ['Manager'], permissions: ['finance:read'] }
const attendant: AuthUser = { ...manager, roles: ['Operations'], permissions: ['students:read', 'students:write'] }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const clients: QueryClient[] = []

function Probe() {
  const { user, isBootstrapping } = useAuth()
  const [draft, setDraft] = useState('')
  const [result, setResult] = useState('')
  return <><p>{isBootstrapping ? 'Carregando sessão' : user?.roles[0] ?? 'Sem sessão'}</p><input aria-label="Rascunho" value={draft} onChange={event => setDraft(event.target.value)} />{hasPermission(user, 'finance:read') && <a href="/recebimentos">Recebimentos</a>}<button onClick={() => void apiFetch('/api/v1/protected', { method: 'POST', body: '{}' }).then(() => setResult('Confirmado')).catch(() => setResult('Não confirmado'))}>Conferir operação</button><p>{result}</p></>
}

async function mount({ status = 403, refreshStatus = 200, meStatus = 200 } = {}) {
  let current = manager; let refreshes = 0; let identityReads = 0; let attempts = 0
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = String(input)
    if (url.endsWith('/auth/refresh')) {
      refreshes++
      return json({ accessToken: `token-${refreshes}`, csrfToken: `csrf-${refreshes}`, user: current }, refreshes === 1 ? 200 : refreshStatus)
    }
    if (url.endsWith('/auth/me')) { identityReads++; return json(current, identityReads === 1 ? 200 : meStatus) }
    attempts++; return json({}, status === 401 && attempts > 1 ? 200 : status)
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  render(<QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>)
  await screen.findByText('Manager')
  client.setQueryData(['private-data'], { total: 100 })
  fireEvent.change(screen.getByLabelText('Rascunho'), { target: { value: 'Registro ainda em edição' } })
  return { fetch, client, changeProfile: (user: AuthUser) => { current = user } }
}

beforeEach(() => { setAccessToken(null); setCsrfToken(null) })
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); setAccessToken(null); setCsrfToken(null); vi.restoreAllMocks() })

it('aplica o perfil retornado no refresh sem novo login e remove o cache da gestão', async () => {
  const { fetch, client, changeProfile } = await mount({ status: 401 })
  changeProfile(attendant)
  fireEvent.click(screen.getByRole('button', { name: 'Conferir operação' }))
  await screen.findByText('Operations'); await screen.findByText('Confirmado')
  expect(screen.queryByRole('link', { name: 'Recebimentos' })).not.toBeInTheDocument()
  expect(client.getQueryData(['private-data'])).toBeUndefined()
  expect(screen.getByLabelText('Rascunho')).toHaveValue('Registro ainda em edição')
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(2)
  expect(fetch.mock.calls.some(([url]) => String(url).includes('/login') || String(url).includes('/google'))).toBe(false)
})

it('revalida mudança de perfil depois de 403 sem reenviar a operação recusada', async () => {
  const { fetch, client, changeProfile } = await mount()
  changeProfile(attendant)
  fireEvent.click(screen.getByRole('button', { name: 'Conferir operação' }))
  await screen.findByText('Operations'); await screen.findByText('Não confirmado')
  expect(client.getQueryData(['private-data'])).toBeUndefined()
  expect(screen.queryByRole('link', { name: 'Recebimentos' })).not.toBeInTheDocument()
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/protected'))).toHaveLength(1)
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/auth/me'))).toHaveLength(2)
})

it('preserva sessão, cache e rascunho quando 403 é apenas restrição ao registro', async () => {
  const { client } = await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Conferir operação' }))
  await screen.findByText('Não confirmado')
  expect(screen.getByText('Manager')).toBeInTheDocument()
  expect(client.getQueryData(['private-data'])).toEqual({ total: 100 })
  expect(screen.getByLabelText('Rascunho')).toHaveValue('Registro ainda em edição')
})

it('retira acesso e cache quando a conta foi bloqueada', async () => {
  const { fetch, client } = await mount({ meStatus: 401 })
  fireEvent.click(screen.getByRole('button', { name: 'Conferir operação' }))
  await screen.findByText('Sem sessão')
  expect(client.getQueryData(['private-data'])).toBeUndefined()
  expect(screen.queryByRole('link', { name: 'Recebimentos' })).not.toBeInTheDocument()
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4))
})

it('mantém rascunho e sessão em indisponibilidade temporária da renovação', async () => {
  const { client } = await mount({ status: 401, refreshStatus: 503 })
  fireEvent.click(screen.getByRole('button', { name: 'Conferir operação' }))
  await screen.findByText('Não confirmado')
  expect(screen.getByText('Manager')).toBeInTheDocument()
  expect(client.getQueryData(['private-data'])).toEqual({ total: 100 })
  expect(screen.getByLabelText('Rascunho')).toHaveValue('Registro ainda em edição')
})
