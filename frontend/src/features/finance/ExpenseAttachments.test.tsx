import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ExpenseAttachments } from './ExpenseAttachments'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../lib/http', () => ({ apiFetch: request }))
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'finance-user' } }) }))
function show(canWrite = true) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={cache}><ExpenseAttachments expenseId="expense" canWrite={canWrite} /></QueryClientProvider>)
  fireEvent.click(screen.getByText('Comprovantes'))
  return cache
}
beforeEach(() => { request.mockReset(); request.mockResolvedValue([]) })

it('preserva arquivo e chave de operação para repetir envio após falha, sem recriar despesa', async () => {
  const writes: { operationId: string; fileName: string; contentBase64: string }[] = []
  request.mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') { writes.push(JSON.parse(init.body)); if (writes.length === 1) throw new Error('Resposta perdida'); return { id: 'file' } }
    return []
  })
  const cache = show()
  await screen.findByText('Nenhum comprovante anexado.')
  const file = new File(['%PDF-1.7 test'], 'recibo.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText('Comprovante opcional'), { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'Anexar comprovante' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Resposta perdida')
  fireEvent.click(screen.getByRole('button', { name: 'Anexar comprovante' }))
  await screen.findByText('Comprovante anexado.')
  expect(writes).toHaveLength(2)
  expect(writes[0]).toEqual(writes[1])
  expect(writes[0].operationId).toBeTruthy()
  expect(atob(writes[0].contentBase64)).toBe('%PDF-1.7 test')
  expect(request.mock.calls.filter(([, init]) => init?.method === 'POST').every(([url]) => url.endsWith('/attachments'))).toBe(true)
  cache.clear()
})

it('rejeita arquivos grandes ou de tipo não aceito antes do envio', async () => {
  const cache = show(); await screen.findByText('Nenhum comprovante anexado.')
  const input = screen.getByLabelText('Comprovante opcional')
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'grande.pdf', { type: 'application/pdf' })] } })
  expect(screen.getByRole('alert')).toHaveTextContent('até 2 MB')
  fireEvent.change(input, { target: { files: [new File(['<html>'], 'pagina.html', { type: 'text/html' })] } })
  expect(screen.getByRole('alert')).toHaveTextContent('PDF, JPG ou PNG')
  expect(screen.queryByRole('button', { name: 'Anexar comprovante' })).not.toBeInTheDocument()
  expect(request.mock.calls.every(([, init]) => !init)).toBe(true)
  cache.clear()
})

it('mantém leitura e oculta upload quando a conta não pode escrever', async () => {
  request.mockResolvedValue([{ id: 'file', expenseId: 'expense', fileName: 'recibo.pdf', contentType: 'application/pdf', size: 1024, createdAtUtc: '2026-10-21T12:00:00Z' }])
  const cache = show(false)
  await screen.findByText('recibo.pdf')
  expect(screen.queryByLabelText('Comprovante opcional')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Baixar' })).toBeEnabled()
  cache.clear()
})

it('bloqueia envio simultâneo do mesmo comprovante', async () => {
  let finish: (value: unknown) => void = () => {}
  request.mockImplementation(async (_url, init) => init?.method === 'POST' ? new Promise(resolve => { finish = resolve }) : [])
  const cache = show(); await screen.findByText('Nenhum comprovante anexado.')
  fireEvent.change(screen.getByLabelText('Comprovante opcional'), { target: { files: [new File(['%PDF-1.7'], 'recibo.pdf', { type: 'application/pdf' })] } })
  const button = screen.getByRole('button', { name: 'Anexar comprovante' })
  fireEvent.click(button); fireEvent.click(button)
  await waitFor(() => expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1))
  expect(screen.getByRole('button', { name: 'Anexando…' })).toBeDisabled()
  finish({ id: 'file' }); await screen.findByText('Comprovante anexado.')
  cache.clear()
})
