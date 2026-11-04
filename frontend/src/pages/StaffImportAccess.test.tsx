import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import type { AuthUser } from '../features/auth/types'
import { ImportPage } from './ImportPage'

const clients: QueryClient[] = []
function mount(actions: string[], includeTeam = false, menus = ['administration', 'classes']) {
  const user: AuthUser = { id: 'import-reader-fixture', name: 'Consulta teste', email: 'imports@example.invalid', roles: ['Manager'], permissions: ['users:manage'], canManageStaff: false, staffAccess: { typeId: 'gestor', name: 'Gestor teste', role: 'Manager', menus, actions, homePath: '/importacoes' } }
  const auth: AuthContextValue = { user, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
  const api = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const path = String(input)
    const value = path.endsWith('/class-grade') ? { batchId: 'batch-test', sourceName: 'Lote teste', applied: false, canApply: true, confirmationToken: 'preview-test', items: [{ id: 'class-test', kind: 'classes', name: 'Turma teste', body: { weekDay: 1, startTime: '10:00', endTime: '11:00', capacity: 6 } }, ...(includeTeam ? [{ id: 'team-test', kind: 'team', name: 'Professor teste', body: {} }] : [])] } : [{ id: 'batch-test', sourceName: 'Lote teste', sourceSha256: 'test-source', status: 'NeedsReview', rowCount: 1 }]
    return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
  })
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(query)
  render(<QueryClientProvider client={query}><AuthContext.Provider value={auth}><ImportPage /></AuthContext.Provider></QueryClientProvider>)
  return api
}
afterEach(() => { cleanup(); clients.splice(0).forEach(query => query.clear()); vi.restoreAllMocks() })

it('consulta os lotes sem envio ou aplicação quando Administração está liberada somente para consulta', async () => {
  const api = mount([])
  fireEvent.click(await screen.findByRole('button', { name: 'Conferir grade de aulas: Lote teste' }))
  await screen.findByText('Turma teste')
  expect(screen.queryByLabelText('Selecionar pacote JSON')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Aplicar grade conferida' })).not.toBeInTheDocument()
  expect(screen.getByText('Seu acesso permite apenas consultar este lote.')).toBeVisible()
  expect(api.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
})

it.each([
  { actions: ['administration.operate'], team: false },
  { actions: ['administration.operate', 'classes.operate'], team: true },
])('não oferece aplicação sem a operação de destino ou quando o lote inclui equipe sem autorização dos donos ($team)', async ({ actions, team }) => {
  const api = mount(actions, team)
  fireEvent.click(await screen.findByRole('button', { name: 'Conferir grade de aulas: Lote teste' }))
  await screen.findByText('Turma teste')
  expect(screen.queryByRole('button', { name: 'Aplicar grade conferida' })).not.toBeInTheDocument()
  expect(api.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
})

it('Financeiro em operação não libera envio bancário quando Administração permite somente consultar',async()=>{
 const api=mount(['finance.operate'],false,['administration','finance'])
 await screen.findByRole('button',{name:'Conferir grade de aulas: Lote teste'})
 expect(screen.queryByLabelText('Arquivo OFX ou CSV')).not.toBeInTheDocument()
 expect(screen.queryByLabelText('Selecionar pacote JSON')).not.toBeInTheDocument()
 expect(api.mock.calls.every(([,init])=>!init?.method||init.method==='GET')).toBe(true)
})
