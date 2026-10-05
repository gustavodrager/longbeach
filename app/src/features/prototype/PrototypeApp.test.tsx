import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../App'
import { createInitialState, prototypeStorageKey } from './model'
import type { PrototypeState } from './types'

function start(path: string, state = createInitialState()) {
  localStorage.setItem(prototypeStorageKey, JSON.stringify(state))
  window.history.replaceState({}, '', path)
  return render(<App />)
}
function stored(): PrototypeState { return JSON.parse(localStorage.getItem(prototypeStorageKey)!) }
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.stubEnv('VITE_DEMO_MODE', 'false')
})
afterEach(() => { vi.unstubAllEnvs() })

it('abre o protótipo fora da autenticação operacional, sem consultar APIs', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
  start('/prototipo/vender')
  expect(await screen.findByRole('heading', { name: 'Vender' }, { timeout: 5000 })).toBeInTheDocument()
  expect(screen.getByText('Protótipo · dados fictícios · nenhuma cobrança real')).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Navegação do atendimento' })).toHaveTextContent('Meu caixa')
  expect(screen.queryByText(/CMV|Custo médio/)).not.toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
}, 10000)

it('confere venda, oferece somente campos de dinheiro e gera comprovante com troco', async () => {
  const user = userEvent.setup()
  start('/prototipo/vender')
  await user.click(await screen.findByRole('button', { name: /Adicionar Água por/ }))
  await user.click(screen.getByRole('button', { name: /Conferir pedido/ }))
  await user.click(screen.getByRole('button', { name: /Receber R\$/ }))
  await user.click(await screen.findByRole('button', { name: /Escolher forma de pagamento/ }))
  await user.click(screen.getByRole('button', { name: 'Dinheiro' }))
  const amount = screen.getByLabelText('Dinheiro recebido (R$)')
  await user.clear(amount); await user.type(amount, '10,00')
  expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('CPF ou CNPJ')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Confirmar recebimento' }))
  expect(await screen.findByRole('heading', { name: 'Comprovante' })).toBeInTheDocument()
  const receipt = document.querySelector('.ux-receipt') as HTMLElement
  expect(within(receipt).getByText('Troco')).toBeInTheDocument()
  const payment = stored().payments.at(-1)!
  expect(payment.amountCents).toBe(500); expect(payment.changeCents).toBe(500)
  expect(stored().products.find(product => product.id === 'water')?.stock).toBe(23)
  expect(screen.queryByText(/Custo médio|CMV/)).not.toBeInTheDocument()
})

it('faz pagamento parcial e permite receber o restante sem reaproveitar a cobrança anterior', async () => {
  const user = userEvent.setup()
  start('/prototipo/receber/account-12')
  await user.click(await screen.findByRole('button', { name: 'Receber uma parte' }))
  await user.type(screen.getByLabelText('Valor desta parte (R$)'), '7,00')
  await user.click(screen.getByRole('button', { name: /Escolher forma de pagamento/ }))
  await user.click(screen.getByRole('button', { name: 'Cartão' }))
  expect(screen.getByRole('button', { name: 'Confirmar recebimento' })).toBeDisabled()
  await user.click(screen.getByLabelText('A maquininha mostrou pagamento aprovado'))
  await user.click(screen.getByRole('button', { name: 'Confirmar recebimento' }))
  expect(await screen.findByRole('heading', { name: 'Comprovante' })).toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: 'Voltar à comanda' }))
  await user.click(await screen.findByRole('link', { name: 'Receber' }))
  expect(await screen.findByRole('heading', { name: 'Quanto vai receber?' })).toBeInTheDocument()
  expect(stored().payments.filter(payment => payment.accountId === 'account-12')).toHaveLength(2)
})

it('isola a visão do cliente e envia pedido QR sem incluí-lo no total cobrável', async () => {
  const user = userEvent.setup()
  start('/prototipo/cliente/demo-access-12')
  expect(await screen.findByRole('heading', { name: 'Comanda 12' })).toBeInTheDocument()
  expect(screen.queryByText('Bruno')).not.toBeInTheDocument()
  expect(screen.queryByText('Carla')).not.toBeInTheDocument()
  expect(screen.queryByText('Testar situações')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Gestão' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Adicionar Água por/ }))
  await user.click(screen.getByRole('button', { name: 'Enviar pedido à equipe' }))
  expect(await screen.findByText('Esperando a equipe confirmar')).toBeInTheDocument()
  const state = stored()
  expect(state.consumptions.at(-1)?.status).toBe('requested')
  expect(state.products.find(product => product.id === 'water')?.stock).toBe(24)
  const confirmed = state.consumptions.filter(item => item.accountId === 'account-12' && ['accepted', 'fulfilled'].includes(item.status))
  expect(confirmed.reduce((sum, item) => sum + item.priceCents * item.quantity, 0)).toBe(2700)
})

it.each(['ausente', 'demo-access-12'])('nega acesso do cliente inválido ou revogado sem revelar outras contas: %s', async accessId => {
  const state = createInitialState(); state.accounts[0].accessRevoked = true
  start(`/prototipo/cliente/${accessId}`, state)
  expect(await screen.findByRole('heading', { name: 'Este acesso não está disponível' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Comanda 12' })).not.toBeInTheDocument()
  expect(screen.queryByText('Bruno')).not.toBeInTheDocument()
  expect(screen.queryByText('Testar situações')).not.toBeInTheDocument()
})

it('nega a operação do caixa de outro atendente mesmo por endereço direto', async () => {
  start('/prototipo/caixa?sessionId=cash-rafael')
  expect(await screen.findByRole('heading', { name: 'Este caixa não está disponível para você' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Fechar caixa' })).not.toBeInTheDocument()
})

it('preserva filtros entre indicador, registro e retorno, com origem e total consistentes', async () => {
  const user = userEvent.setup(); const state = createInitialState()
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  start(`/prototipo/gestao/detalhes/received?from=${day}&to=${day}`, state)
  await user.click(await screen.findByRole('button', { name: 'Simular supervisão' }))
  expect(await screen.findByRole('table')).toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: 'Abrir registro' }))
  expect(await screen.findByRole('heading', { name: 'Comprovante do pagamento' })).toBeInTheDocument()
  expect(window.location.search).toContain(`from=${day}`)
  await user.click(screen.getByRole('link', { name: 'Voltar' }))
  expect(await screen.findByRole('table')).toBeInTheDocument()
  expect(window.location.pathname).toBe('/prototipo/gestao/detalhes/received')
  expect(screen.getByRole('table')).toHaveTextContent('Comanda 12')
})

it('abre o produto original pelo indicador de estoque e distingue fase futura de zero', async () => {
  const user = userEvent.setup()
  start('/prototipo/gestao/detalhes/lowStock')
  await user.click(await screen.findByRole('button', { name: 'Simular supervisão' }))
  await user.click((await screen.findAllByRole('link', { name: 'Abrir registro' }))[0])
  expect(window.location.pathname).toMatch(/\/prototipo\/gestao\/estoque\//)
  expect(await screen.findByText('Disponível agora')).toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: 'Escola e alunos' }))
  expect(await screen.findByText('Ainda não disponível')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

it('não confirma uma venda sem conexão e retoma o mesmo pedido após reconectar', async () => {
  const user = userEvent.setup()
  start('/prototipo/vender')
  await user.click(await screen.findByText('Testar situações'))
  await user.click(screen.getByLabelText('Simular falta de internet'))
  await user.click(screen.getByRole('button', { name: /Adicionar Água por/ }))
  await user.click(screen.getByRole('button', { name: /Conferir pedido/ }))
  await user.click(screen.getByRole('button', { name: /Receber R\$/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Nada foi confirmado')
  expect(stored().accounts).toHaveLength(3)
  await user.click(screen.getByLabelText('Simular falta de internet'))
  await user.click(screen.getByRole('button', { name: /Receber R\$/ }))
  await waitFor(() => expect(window.location.pathname).toContain('/prototipo/receber/'))
  expect(stored().accounts).toHaveLength(4)
  expect(stored().consumptions.filter(item => item.productId === 'water')).toHaveLength(2)
})

it('recupera uma venda sem pagamento pela lista de comandas após sair do recebimento', async () => {
  const user = userEvent.setup()
  start('/prototipo/vender')
  await user.click(await screen.findByRole('button', { name: /Adicionar Água por/ }))
  await user.click(screen.getByRole('button', { name: /Conferir pedido/ }))
  await user.click(screen.getByRole('button', { name: /Receber R\$/ }))
  expect(await screen.findByRole('heading', { name: 'Quanto vai receber?' })).toBeInTheDocument()
  const account = stored().accounts.at(-1)!
  await user.click(screen.getByRole('link', { name: 'Comandas' }))
  expect(await screen.findByRole('heading', { name: 'Comandas' })).toBeInTheDocument()
  expect(document.querySelector(`a[href="/prototipo/comandas/${account.id}"]`)).toHaveTextContent('5,00')
})

it.each(['toString', '__proto__'])('trata fase inválida sem quebrar o aplicativo: %s', async phase => {
  const user = userEvent.setup()
  start(`/prototipo/gestao/fases/${phase}`)
  await user.click(await screen.findByRole('button', { name: 'Simular supervisão' }))
  expect(await screen.findByRole('heading', { name: 'Fase não encontrada' })).toBeInTheDocument()
})

it('bloqueia indicadores e custos administrativos no perfil de atendente', async () => {
  start('/prototipo/gestao/estoque/water')
  expect(await screen.findByRole('heading', { name: 'Acesso da gestão restrito' })).toBeInTheDocument()
  expect(screen.queryByText('Custo unitário demonstrativo')).not.toBeInTheDocument()
  expect(screen.queryByText('Disponível agora')).not.toBeInTheDocument()
})
