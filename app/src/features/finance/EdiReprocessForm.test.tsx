import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EdiReprocessForm } from './EdiReprocessForm'
const request = vi.hoisted(() => vi.fn())
vi.mock('../../lib/http', () => ({ apiFetch: request }))
function form() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><EdiReprocessForm /></QueryClientProvider>)
  fireEvent.click(screen.getByText('Consultar novamente um período do PagBank'))
  fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-01-01' } })
  fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2026-01-03' } })
  fireEvent.change(screen.getByLabelText('Motivo da consulta'), { target: { value: 'Conferência do extrato' } })
}
beforeEach(() => { request.mockReset() })
it('submits an explicit bounded period and reports completion', async () => {
  request.mockResolvedValue({}); form()
  fireEvent.click(screen.getByRole('button', { name: 'Consultar e atualizar documentos' }))
  expect(await screen.findByRole('status')).toHaveTextContent('sem criar novos recebimentos')
  expect(request).toHaveBeenCalledWith('/api/v1/financial-history/pagbank-edi/reprocess', expect.objectContaining({ method: 'POST', body: JSON.stringify({ from: '2026-01-01', through: '2026-01-03', reason: 'Conferência do extrato' }) }))
})
it('prevents a period over seven days before submitting', async () => {
  form(); fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2026-01-08' } })
  fireEvent.click(screen.getByRole('button', { name: 'Consultar e atualizar documentos' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('até sete dias')
  expect(request).not.toHaveBeenCalled()
})
it('keeps completed days visible as recoverable after a failure', async () => {
  request.mockRejectedValue(new Error('Consulta interrompida.')); form()
  fireEvent.click(screen.getByRole('button', { name: 'Consultar e atualizar documentos' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Dias já concluídos permanecem salvos'))
  expect(screen.getByRole('button', { name: 'Consultar e atualizar documentos' })).toBeEnabled()
})
