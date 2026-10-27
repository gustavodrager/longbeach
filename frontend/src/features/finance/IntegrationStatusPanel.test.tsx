import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { IntegrationStatusPanel } from './IntegrationStatusPanel'

const auth = vi.hoisted(() => ({ roles: ['Owner'] }))
const request = vi.hoisted(() => vi.fn())
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'test', roles: auth.roles } }) }))
vi.mock('../../lib/http', () => ({ apiFetch: request }))
function show() { return render(<MemoryRouter><IntegrationStatusPanel /></MemoryRouter>) }
beforeEach(() => { auth.roles = ['Owner']; request.mockReset() })
it('explica modo por arquivos e oferece importação sem consultar ou configurar APIs', () => {
  show()
  expect(screen.getByRole('heading', { name: 'Extratos e saldos por importação' })).toBeInTheDocument()
  expect(screen.getByText(/As conexões automáticas C6, PagBank e PagVendas estão suspensas/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Importar extratos' })).toHaveAttribute('href', '/importacoes')
  expect(screen.getByRole('link', { name: 'Conferir extrato C6' })).toHaveAttribute('href', '/financeiro/historico?series=c6-conta')
  expect(screen.getByRole('link', { name: 'Conferir movimentos PagBank' })).toHaveAttribute('href', '/financeiro/historico?series=pagbank-conta')
  expect(screen.getByRole('link', { name: 'Ver pagamentos' })).toHaveAttribute('href', '/recebimentos')
  expect(screen.queryByText(/credenciais|D\+1|ativar integração/i)).not.toBeInTheDocument()
  expect(request).not.toHaveBeenCalled()
})
it('não exibe o painel nem consulta configuração para clientes ou atendentes', () => {
  auth.roles = ['Operations']; show()
  expect(request).not.toHaveBeenCalled()
  expect(screen.queryByRole('heading')).not.toBeInTheDocument()
})
