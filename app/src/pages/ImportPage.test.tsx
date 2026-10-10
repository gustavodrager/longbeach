import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportPage } from './ImportPage'

const auth = vi.hoisted(() => ({ roles: ['Owner'] }))
vi.mock('../features/auth/authContext', () => ({ useAuth: () => ({ user: { roles: auth.roles } }) }))
const batch = { id: 'batch', sourceName: 'produtos-teste.xlsx', sourceSha256: 'a'.repeat(64), status: 'NeedsReview', rowCount: 2 }
const preview = { batchId: 'batch', sourceName: batch.sourceName, applied: false, confirmationToken: 'review-token', canApply: true, creates: 1, matches: 1,
  items: [{ code: 'PV-1', name: 'Água teste', category: 'Bebidas teste', salePrice: 5, action: 'Matched', conflict: null },
    { code: 'PV-2', name: 'Suco teste', category: 'Bebidas teste', salePrice: 8, action: 'Create', conflict: null }] }
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }
afterEach(() => { vi.restoreAllMocks(); auth.roles = ['Owner'] })

it('exige conferência antes de aplicar e envia somente a confirmação do lote', async () => {
  const api = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith('/apply')) return response({ ...preview, applied: true, canApply: false, creates: 0, matches: 2 })
    if (url.endsWith('/bar-catalog')) return response(preview)
    return response([batch])
  })
  render(<ImportPage />); const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Conferir produtos do bar: produtos-teste.xlsx' }))
  expect(await screen.findByText(/1 produtos novos · 1 já cadastrados/)).toBeInTheDocument()
  expect(screen.getByText('Arquivo: produtos-teste.xlsx')).toBeInTheDocument()
  expect(api.mock.calls.some(([url]) => String(url).endsWith('/apply'))).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Aplicar catálogo conferido' }))
  expect(await screen.findByText('Lote já aplicado ao bar.')).toBeInTheDocument()
  const apply = api.mock.calls.find(([url]) => String(url).endsWith('/apply'))!
  expect(JSON.parse(String(apply[1]?.body))).toEqual({ confirmationToken: 'review-token' })
})

it('divergências impedem aplicar o lote', async () => {
  const api = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => String(input).endsWith('/bar-catalog')
    ? response({ ...preview, canApply: false, items: [{ ...preview.items[0], action: 'Conflict', conflict: 'Preço mudou; revise o cadastro.' }] }) : response([batch]))
  render(<ImportPage />); const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /Conferir produtos do bar:/ }))
  expect(await screen.findByText('Preço mudou; revise o cadastro.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Aplicar catálogo conferido' })).toBeDisabled()
  expect(api.mock.calls.some(([url]) => String(url).endsWith('/apply'))).toBe(false)
})

it('falha de confirmação descarta a prévia para exigir nova conferência', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = String(input)
    if (url.endsWith('/apply')) return response({ detail: 'O cadastro mudou. Confira novamente.' }, 400)
    return response(url.endsWith('/bar-catalog') ? preview : [batch])
  })
  render(<ImportPage />); const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /Conferir produtos do bar:/ }))
  await user.click(await screen.findByRole('button', { name: 'Aplicar catálogo conferido' }))
  expect(await screen.findByText('O cadastro mudou. Confira novamente.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Aplicar catálogo conferido' })).not.toBeInTheDocument()
})

it('atendente não acessa nem consulta os lotes', () => {
  auth.roles = ['Operations']; const api = vi.spyOn(globalThis, 'fetch')
  render(<ImportPage />)
  expect(screen.getByRole('alert')).toHaveTextContent('disponível para a gestão')
  expect(api).not.toHaveBeenCalled()
})
