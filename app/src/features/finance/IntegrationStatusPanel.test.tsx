import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { IntegrationStatusPanel } from './IntegrationStatusPanel'

const auth = vi.hoisted(() => ({ roles: ['Owner'] }))
const request = vi.hoisted(() => vi.fn())
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'test', roles: auth.roles } }) }))
vi.mock('../../lib/http', () => ({ apiFetch: request }))
function show() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><IntegrationStatusPanel /></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => { auth.roles = ['Owner']; request.mockReset() })
it('separa configuração, coleta real e importação sem prometer conexão ativa', async () => {
  request.mockResolvedValue([
    { provider: 'PagBank EDI', state: 'Aguardando configuração', environment: 'Produção', detail: 'Vendas em D+1.', requirements: ['Defina a data inicial do histórico.'], lastSuccessUtc: null, completeThrough: null, failureCode: null },
    { provider: 'PagBank Pix', state: 'Configurado; validar operação', environment: 'Sandbox', detail: 'Validar no provedor.', requirements: [], lastSuccessUtc: null, completeThrough: null, failureCode: null },
    { provider: 'PagVendas', state: 'Importação por arquivo', detail: 'Não há sincronização automática de vendas ou estoque.', requirements: [], lastSuccessUtc: null, completeThrough: null, failureCode: null },
  ])
  show()
  expect(await screen.findByText('Defina a data inicial do histórico.')).toBeInTheDocument()
  expect(screen.getByText('Ambiente: Sandbox')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'PagBank Pix · Configurado; validar operação' })).toBeInTheDocument()
  expect(screen.queryByText(/Última leitura concluída/)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Conferir arquivos do PagVendas' })).toHaveAttribute('href', '/importacoes')
})
it('permite repetir a leitura após falha sem informar conexão inexistente', async () => {
  request.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
  show(); expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível atualizar')
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByRole('heading', { name: 'Conexões PagBank e PagVendas' })).toBeInTheDocument()
})
it('não consulta configuração para clientes ou atendentes', () => {
  auth.roles = ['Operations']; show(); expect(request).not.toHaveBeenCalled()
  expect(screen.queryByRole('heading')).not.toBeInTheDocument()
})
