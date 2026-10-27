/// <reference types="node" />
import { webcrypto } from 'node:crypto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BankStatementImport } from './BankStatementImportPanel'
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
function mount() {
  vi.stubGlobal('crypto', webcrypto)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onApplied = vi.fn(async () => {})
  render(<QueryClientProvider client={client}><BankStatementImport onApplied={onApplied} /></QueryClientProvider>)
  return { onApplied, client }
}
async function selectFile(text = 'Data;Descrição;Valor;ID;Saldo\n25/10/2026;Pix;100,00;pix-a;150,00') {
  const file = new File([text], 'extrato.csv', { type: 'text/csv' })
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(text).buffer })
  fireEvent.change(screen.getByLabelText('Número da conta no CSV'), { target: { value: '00123' } })
  fireEvent.change(screen.getByLabelText('Arquivo OFX ou CSV'), { target: { files: [file] } })
  return screen.findByRole('button', { name: 'Conferir importação' })
}
it('só grava após conferência e confirmação, aplica uma vez e atualiza as consultas internas', async () => {
  const preview = { batchId: 'batch', sourceName: 'extrato.csv', applied: false, confirmationToken: 'local-fingerprint', creates: 2, matches: 0, totals: [] }
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => String(url).endsWith('/apply') ? json({ ...preview, applied: true, creates: 0, matches: 2 }) : options?.method === 'POST' ? json({ id: 'batch' }) : json(preview))
  const { onApplied, client } = mount(); const invalidations = vi.spyOn(client, 'invalidateQueries')
  const inspect = await selectFile()
  expect(fetch).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Prévia do arquivo bancário')).toHaveTextContent('1 movimento(s) · 1 saldo(s)')
  fireEvent.click(inspect)
  const apply = await screen.findByRole('button', { name: 'Aplicar extrato conferido' })
  expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  fireEvent.click(apply)
  await screen.findByText('Arquivo já aplicado.')
  expect(onApplied).toHaveBeenCalledOnce()
  expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(2)
  expect(invalidations).toHaveBeenCalledWith({ queryKey: ['dashboard-balances'] })
  expect(fetch.mock.calls.every(([url]) => String(url).startsWith('/api/v1/imports') || String(url).startsWith('/api/v1/financial-history/imports'))).toBe(true)
})
it('trocar banco invalida a prévia antes de enviar e arquivo inválido não gera requisição', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch'); mount()
  await selectFile()
  fireEvent.change(screen.getByLabelText('Banco do extrato'), { target: { value: 'c6' } })
  expect(screen.queryByRole('button', { name: 'Conferir importação' })).not.toBeInTheDocument()
  const file = new File(['não é extrato'], 'extrato.csv')
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode('não é extrato').buffer })
  fireEvent.change(screen.getByLabelText('Arquivo OFX ou CSV'), { target: { files: [file] } })
  expect(await screen.findByRole('alert')).toHaveTextContent('cabeçalho')
  expect(fetch).not.toHaveBeenCalled()
})
it('falha ao aplicar exige nova conferência e não apresenta sucesso', async () => {
  const preview = { batchId: 'batch', sourceName: 'extrato.csv', applied: false, confirmationToken: 'fingerprint', creates: 1, matches: 0, totals: [] }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => String(url).endsWith('/apply') ? new Response('{"message":"A conferência mudou."}', { status: 409, headers: { 'Content-Type': 'application/json' } }) : options?.method === 'POST' ? json({ id: 'batch' }) : json(preview))
  const { onApplied } = mount()
  fireEvent.click(await selectFile())
  fireEvent.click(await screen.findByRole('button', { name: 'Aplicar extrato conferido' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('A conferência mudou'))
  expect(onApplied).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Aplicar extrato conferido' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Conferir importação' })).toBeEnabled()
})
