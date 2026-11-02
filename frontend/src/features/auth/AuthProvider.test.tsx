import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { apiFetch, setAccessToken, setCsrfToken } from '../../lib/http'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './authContext'
import { hasPermission } from './access'
import type { AuthUser } from './types'
import { loginDestination } from './loginDestination'

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

function GoogleProfileProbe() {
  const { user, signInWithGoogle, signOut } = useAuth()
  return <><button onClick={() => void signInWithGoogle('synthetic-google').catch(() => undefined)}>Entrar Google</button><button onClick={() => void signInWithGoogle('synthetic-google', { name: 'Pessoa Fictícia', phone: '11988887777' }).catch(() => undefined)}>Cadastrar Google</button><button onClick={() => void signOut()}>Sair Google</button><p>{user ? loginDestination(user, null) : 'Sem acesso'}</p></>
}
it.each([{ incomplete: true, failed: false, destination: '/minha-area/perfil' }, { incomplete: false, failed: false, destination: '/minha-area' }, { incomplete: false, failed: true, destination: '/minha-area' }])('Google orienta completar contato sem inferir vínculos: %j', async ({ incomplete, failed, destination }) => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (String(url).endsWith('/auth/google')) return json({ accessToken: 'synthetic-session', csrfToken: 'synthetic-csrf', user: { ...manager, roles: ['Student'] } })
    if (String(url).endsWith('/me/customer')) { if (failed) throw new Error('offline'); return json({ incomplete }) }
    throw new Error('Unexpected request')
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  render(<QueryClientProvider client={client}><AuthProvider demoMode><GoogleProfileProbe /></AuthProvider></QueryClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Entrar Google' }))
  expect(await screen.findByText(destination)).toBeInTheDocument()
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/me/customer'))).toHaveLength(1)
  expect(fetch.mock.calls.some(([, init]) => init?.method && !String(init.method).match(/^(GET|POST)$/))).toBe(false)
})

it('sair durante a consulta do cadastro Google impede que a resposta restaure o usuário',async()=>{
 let finish!:(value:Response)=>void
 vi.spyOn(globalThis,'fetch').mockImplementation(async url=>String(url).endsWith('/auth/google')?json({accessToken:'synthetic-session',csrfToken:'synthetic-csrf',user:{...manager,roles:['Student']}}):String(url).endsWith('/auth/logout')?new Response(null,{status:204}):new Promise<Response>(resolve=>{finish=resolve}))
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client)
 render(<QueryClientProvider client={client}><AuthProvider demoMode><GoogleProfileProbe/></AuthProvider></QueryClientProvider>)
 fireEvent.click(screen.getByRole('button',{name:'Entrar Google'}));await waitFor(()=>expect(finish).toBeDefined())
 fireEvent.click(screen.getByRole('button',{name:'Sair Google'}));await act(async()=>finish(json({incomplete:true})))
 expect(screen.getByText('Sem acesso')).toBeInTheDocument();expect(screen.queryByText('/minha-area/perfil')).not.toBeInTheDocument()
})

it('cliente Google legado sem ficha é conduzido a completar o próprio cadastro',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async url=>String(url).endsWith('/auth/google')?json({accessToken:'synthetic-session',csrfToken:'synthetic-csrf',user:{...manager,roles:['Student']}}):json(null))
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client)
 render(<QueryClientProvider client={client}><AuthProvider demoMode><GoogleProfileProbe/></AuthProvider></QueryClientProvider>);fireEvent.click(screen.getByRole('button',{name:'Entrar Google'}))
 expect(await screen.findByText('/minha-area/perfil')).toBeInTheDocument();expect(fetch.mock.calls.filter(([url])=>String(url).endsWith('/me/customer'))).toHaveLength(1)
})

it.each([{role:'Manager',destination:'/'},{role:'Teacher',destination:'/professor'},{role:'Operations',destination:'/atendimento/vender'}])('Google mantém a equipe $role no trabalho sem exigir cadastro de cliente',async({role,destination})=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(json({accessToken:'synthetic-staff-session',csrfToken:'synthetic-staff-csrf',user:{...manager,roles:[role],permissions:['bar:sales:operate']}}))
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client)
 render(<QueryClientProvider client={client}><AuthProvider demoMode><GoogleProfileProbe/></AuthProvider></QueryClientProvider>);fireEvent.click(screen.getByRole('button',{name:'Entrar Google'}))
 expect(await screen.findByText(destination)).toBeInTheDocument();expect(fetch.mock.calls.every(([url])=>String(url).endsWith('/auth/google'))).toBe(true)
})

it('conclusão antiga do cadastro Google não inicia login depois de sair',async()=>{
 let finish!:(value:Response)=>void
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async url=>String(url).endsWith('/auth/logout')?new Response(null,{status:204}):new Promise<Response>(resolve=>{finish=resolve}))
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client)
 render(<QueryClientProvider client={client}><AuthProvider demoMode><GoogleProfileProbe/></AuthProvider></QueryClientProvider>);fireEvent.click(screen.getByRole('button',{name:'Cadastrar Google'}));await waitFor(()=>expect(finish).toBeDefined())
 fireEvent.click(screen.getByRole('button',{name:'Sair Google'}));await act(async()=>finish(new Response(null,{status:204})))
 expect(screen.getByText('Sem acesso')).toBeInTheDocument();expect(fetch.mock.calls.some(([url])=>String(url).endsWith('/auth/google'))).toBe(false)
})
