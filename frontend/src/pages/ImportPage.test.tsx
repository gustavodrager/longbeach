import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportPage } from './ImportPage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const auth = vi.hoisted(() => ({ roles: ['Owner'] }))
vi.mock('../features/auth/authContext', () => ({ useAuth: () => ({ user: { roles: auth.roles } }) }))
const batch = { id: 'batch', sourceName: 'produtos-teste.xlsx', sourceSha256: 'a'.repeat(64), status: 'NeedsReview', rowCount: 2 }
const preview = { batchId: 'batch', sourceName: batch.sourceName, applied: false, confirmationToken: 'review-token', canApply: true, creates: 1, matches: 1,
  items: [{ code: 'PV-1', name: 'Água teste', category: 'Bebidas teste', salePrice: 5, action: 'Matched', conflict: null },
    { code: 'PV-2', name: 'Suco teste', category: 'Bebidas teste', salePrice: 8, action: 'Create', conflict: null }] }
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }
afterEach(() => { vi.restoreAllMocks(); auth.roles = ['Owner'] })
const renderImport = () => render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ImportPage /></QueryClientProvider>)

it.each([false,true])('consulta histórico aplicado=%s sem oferecer aplicação ou gravar catálogo', async applied => {
  const api=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>response(String(input).endsWith('/bar-catalog')?{...preview,applied}:[batch]))
  renderImport()
  await userEvent.click(await screen.findByRole('button',{name:/Conferir produtos do bar:/}))
  expect(await screen.findByText('Arquivo: produtos-teste.xlsx')).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Aplicar catálogo conferido'})).not.toBeInTheDocument()
  expect(api.mock.calls.every(([,init])=>!init?.method||init.method==='GET')).toBe(true)
})

it('divergências impedem aplicar o lote', async () => {
  const api = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => String(input).endsWith('/bar-catalog')
    ? response({ ...preview, canApply: false, items: [{ ...preview.items[0], action: 'Conflict', conflict: 'Preço mudou; revise o cadastro.' }] }) : response([batch]))
  renderImport(); const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /Conferir produtos do bar:/ }))
  expect(await screen.findByText('Preço mudou; revise o cadastro.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Aplicar catálogo conferido' })).not.toBeInTheDocument()
  expect(api.mock.calls.some(([url]) => String(url).endsWith('/apply'))).toBe(false)
})

it('atendente não acessa nem consulta os lotes', () => {
  auth.roles = ['Operations']; const api = vi.spyOn(globalThis, 'fetch')
  renderImport()
  expect(screen.getByRole('alert')).toHaveTextContent('disponível para a gestão')
  expect(api).not.toHaveBeenCalled()
})
