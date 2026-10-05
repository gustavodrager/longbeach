import { createElement, type ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { accountTotals, actorNames, applyCommand, availableStock, createInitialState, getReport, isPrototypeState, money, parseMoney, prototypeStorageKey, type PrototypeCommand } from './model'
import { PrototypeProvider, usePrototype } from './PrototypeProvider'
import type { Account, ActorId, Consumption, Payment, PrototypeState, Result } from './types'

function good<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
function driver(initial = createInitialState()) {
  let state = initial
  let counter = 0
  return {
    get state() { return state },
    run<T = unknown>(command: PrototypeCommand, actorId: ActorId = 'marina', id = `operation-${++counter}`, offline = false, now?: string): Result<T> {
      const transaction = applyCommand<T>(state, actorId, command, id, offline, now)
      state = transaction.state
      return transaction.result
    },
  }
}
const wrapper = ({ children }: { children: ReactNode }) => createElement(PrototypeProvider, null, children)
const pixPayer = { payerName: 'Cliente fictício', payerEmail: 'cliente@example.com', payerTaxId: '12345678909' }

afterEach(() => { cleanup(); window.localStorage.clear(); window.sessionStorage.clear() })

describe('dinheiro e saldos em centavos', () => {
  it('aceita decimal brasileiro, preserva centavos e rejeita entradas ambíguas/inválidas', () => {
    expect(parseMoney('12,50')).toBe(1250)
    expect(parseMoney('R$ 1.234,56')).toBe(123456)
    expect(parseMoney('0,01')).toBe(1)
    expect(parseMoney('12.5')).toBe(1250)
    for (const value of ['', '-1', '1,234', '1e2', 'NaN', '12 reais', '1,2,3', '9007199254740992']) expect(parseMoney(value)).toBeNaN()
    expect(money(1250)).toContain('12,50')
  })
  it('separa consumo aceito, dinheiro pago, Pix pendente e saldo disponível para cobrar', () => {
    const state = createInitialState()
    expect(accountTotals(state, 'account-12')).toEqual({ totalCents: 2700, paidCents: 1000, pendingCents: 0, dueCents: 1700, payableCents: 1700 })
    expect(accountTotals(state, 'account-8').totalCents).toBe(0)
    expect(accountTotals(state, 'account-17')).toEqual({ totalCents: 1500, paidCents: 0, pendingCents: 1500, dueCents: 1500, payableCents: 0 })
  })
  it('recebe em caixas individuais na mesma comanda e registra troco', () => {
    const d = driver()
    const payment = good(d.run<Payment>({ type: 'pay', input: { accountId: 'account-12', amountCents: 700, method: 'cash', tenderedCents: 1000 } }, 'rafael'))
    expect(payment.changeCents).toBe(300)
    expect(payment.cashSessionId).toBe('cash-rafael')
    expect(d.state.cashSessions.find((session) => session.id === 'cash-rafael')!.expectedCents).toBe(10700)
    expect(d.state.cashSessions.find((session) => session.id === 'cash-marina')!.expectedCents).toBe(11000)
    expect(good(d.run<Payment>({ type: 'pay', input: { accountId: 'account-12', amountCents: 1000, method: 'card', cardApproved: true } })).state).toBe('approved')
    expect(accountTotals(d.state, 'account-12').dueCents).toBe(0)
  })
  it('bloqueia cartão sem aprovação, excesso, quantidade fracionária e dinheiro sem caixa próprio', () => {
    const d = driver()
    expect(d.run({ type: 'pay', input: { accountId: 'account-12', amountCents: 1000, method: 'card' } }).ok).toBe(false)
    expect(d.run({ type: 'pay', input: { accountId: 'account-12', amountCents: 1701, method: 'cash' } }).ok).toBe(false)
    expect(d.run({ type: 'pay', input: { accountId: 'account-12', amountCents: 100.1, method: 'pix', ...pixPayer } }).ok).toBe(false)
    expect(d.run({ type: 'pay', input: { accountId: 'account-12', amountCents: 100, method: 'cash' } }, 'supervisor').ok).toBe(false)
    expect(d.state.payments).toHaveLength(2)
  })
})

describe('confirmação, entrega e estoque', () => {
  it('pedido QR não cobra nem reserva; aceitação reserva e entrega baixa uma única vez', () => {
    const d = driver()
    const stock = availableStock(d.state, 'burger')
    const requested = good(d.run<Consumption[]>({ type: 'addItems', accountId: 'account-8', items: [{ productId: 'burger', quantity: 2 }], deliver: true, accessId: 'demo-access-8' }))[0]
    expect(requested.status).toBe('requested')
    expect(availableStock(d.state, 'burger')).toBe(stock)
    expect(accountTotals(d.state, 'account-8').totalCents).toBe(0)
    expect(d.run({ type: 'fulfill', consumptionId: requested.id }).ok).toBe(false)
    good(d.run({ type: 'accept', consumptionId: requested.id }))
    expect(d.state.consumptions.find((item) => item.id === requested.id)!.actorId).toBe('selfservice')
    expect(availableStock(d.state, 'burger')).toBe(stock - 2)
    expect(d.state.products.find((product) => product.id === 'burger')!.stock).toBe(stock)
    good(d.run({ type: 'fulfill', consumptionId: requested.id }, 'rafael', 'deliver-once'))
    expect(d.state.products.find((product) => product.id === 'burger')!.stock).toBe(stock - 2)
    expect(d.run({ type: 'fulfill', consumptionId: requested.id }, 'rafael', 'deliver-once').ok).toBe(true)
    expect(d.run({ type: 'fulfill', consumptionId: requested.id }, 'rafael').ok).toBe(false)
    expect(d.state.products.find((product) => product.id === 'burger')!.stock).toBe(stock - 2)
  })
  it('registra e entrega produto pronto, mas preparado sempre passa pela fila', () => {
    const d = driver()
    const items = good(d.run<Consumption[]>({ type: 'addItems', accountId: 'account-8', items: [{ productId: 'water', quantity: 2 }, { productId: 'burger', quantity: 1 }], deliver: true }))
    expect(items.map((item) => item.status)).toEqual(['fulfilled', 'accepted'])
    expect(d.state.products.find((product) => product.id === 'water')!.stock).toBe(22)
    expect(d.state.products.find((product) => product.id === 'burger')!.stock).toBe(10)
    expect(availableStock(d.state, 'burger')).toBe(9)
  })
  it('valida o carrinho inteiro e agrupa repetições antes de baixar estoque', () => {
    const d = driver()
    expect(d.run({ type: 'addItems', accountId: 'account-8', items: [{ productId: 'water', quantity: 2 }, { productId: 'water-sparkling', quantity: 1 }], deliver: true }).ok).toBe(false)
    expect(d.state.products.find((product) => product.id === 'water')!.stock).toBe(24)
    expect(d.state.consumptions).toHaveLength(6)
    expect(d.run({ type: 'addItems', accountId: 'account-8', items: [{ productId: 'soda', quantity: 2 }, { productId: 'soda', quantity: 2 }], deliver: true }).ok).toBe(false)
    expect(d.run({ type: 'addItems', accountId: 'account-8', items: [{ productId: 'water', quantity: 0.5 }], deliver: false }).ok).toBe(false)
    expect(d.run({ type: 'addItems', accountId: 'account-8', items: [{ productId: 'water-sparkling', quantity: 1 }], deliver: false, accessId: 'demo-access-8' }).ok).toBe(false)
  })
  it('reconfere estoque na aceitação e permite recusa com motivo sem débito', () => {
    const d = driver()
    const request = good(d.run<Consumption[]>({ type: 'addItems', accountId: 'account-8', items: [{ productId: 'soda', quantity: 3 }], deliver: false, accessId: 'demo-access-8' }))[0]
    good(d.run({ type: 'addItems', accountId: 'account-12', items: [{ productId: 'soda', quantity: 3 }], deliver: false }))
    expect(d.run({ type: 'accept', consumptionId: request.id }).ok).toBe(false)
    expect(d.run({ type: 'reject', consumptionId: request.id, reason: '' }).ok).toBe(false)
    good(d.run({ type: 'reject', consumptionId: request.id, reason: 'Acabou o produto' }))
    expect(accountTotals(d.state, 'account-8').totalCents).toBe(0)
    expect(d.state.products.find((product) => product.id === 'soda')!.stock).toBe(3)
  })
  it('corrige com supervisão, motivo e devolução física explícita', () => {
    const d = driver()
    const item = good(d.run<Consumption[]>({ type: 'addItems', accountId: 'account-8', items: [{ productId: 'water', quantity: 1 }], deliver: true }))[0]
    expect(d.run({ type: 'reverse', consumptionId: item.id, reason: 'Erro', returnStock: true }).ok).toBe(false)
    expect(d.run({ type: 'reverse', consumptionId: item.id, reason: '', returnStock: true }, 'supervisor').ok).toBe(false)
    good(d.run({ type: 'reverse', consumptionId: item.id, reason: 'Produto devolvido', returnStock: true }, 'supervisor'))
    expect(d.state.products.find((product) => product.id === 'water')!.stock).toBe(24)
    const next = good(d.run<Consumption[]>({ type: 'addItems', accountId: 'account-8', items: [{ productId: 'water', quantity: 1 }], deliver: true }))[0]
    good(d.run({ type: 'reverse', consumptionId: next.id, reason: 'Pedido errado, produto consumido', returnStock: false }, 'supervisor'))
    expect(d.state.products.find((product) => product.id === 'water')!.stock).toBe(23)
  })
  it('não retira consumo coberto por recebimento ou Pix pendente', () => {
    const d = driver()
    expect(d.run({ type: 'reverse', consumptionId: 'consumption-carla-juice', reason: 'Erro', returnStock: true }, 'supervisor').ok).toBe(false)
    expect(d.state.consumptions.find((item) => item.id === 'consumption-carla-juice')!.status).toBe('fulfilled')
  })
})

describe('Pix, acesso QR e fechamento', () => {
  it('valida dados transitórios de Pix e não persiste nome, contato ou documento do pagador', () => {
    const d = driver()
    const invalid = [{ ...pixPayer, payerName: ' ' }, { ...pixPayer, payerEmail: 'inválido' }, { ...pixPayer, payerTaxId: '11111111111' }, { ...pixPayer, payerTaxId: '1234' }]
    for (const payer of invalid) expect(d.run({ type: 'pay', input: { accountId: 'account-12', method: 'pix', amountCents: 500, ...payer } }).ok).toBe(false)
    good(d.run({ type: 'pay', input: { accountId: 'account-12', method: 'pix', amountCents: 500, ...pixPayer } }))
    const saved = JSON.stringify(d.state)
    expect(saved).not.toContain(pixPayer.payerName)
    expect(saved).not.toContain(pixPayer.payerEmail)
    expect(saved).not.toContain(pixPayer.payerTaxId)
    expect(saved).not.toContain('payerName')
  })
  it('reserva financeiramente o Pix pendente e confirma sem movimentar dinheiro ou estoque', () => {
    const d = driver()
    const beforeStock = d.state.products.map((product) => product.stock)
    const payment = good(d.run<Payment>({ type: 'pay', input: { accountId: 'account-12', method: 'pix', amountCents: 700, ...pixPayer } }))
    expect(payment.state).toBe('pending')
    expect(accountTotals(d.state, 'account-12').payableCents).toBe(1000)
    expect(d.run({ type: 'pay', input: { accountId: 'account-12', method: 'cash', amountCents: 1700 } }).ok).toBe(false)
    good(d.run({ type: 'pay', input: { accountId: 'account-12', method: 'cash', amountCents: 1000 } }, 'rafael'))
    expect(d.run({ type: 'settlePix', paymentId: payment.id, approved: true }).ok).toBe(false)
    good(d.run({ type: 'settlePix', paymentId: payment.id, approved: true }, 'supervisor', 'provider-confirm'))
    expect(accountTotals(d.state, 'account-12').dueCents).toBe(0)
    expect(d.state.cashSessions.find((session) => session.id === 'cash-marina')!.expectedCents).toBe(11000)
    expect(d.state.products.map((product) => product.stock)).toEqual(beforeStock)
    expect(d.run({ type: 'settlePix', paymentId: payment.id, approved: true }, 'supervisor', 'provider-confirm').ok).toBe(true)
  })
  it('Pix não confirmado libera tentativa nova e preserva consumo e saldo', () => {
    const d = driver()
    good(d.run({ type: 'settlePix', paymentId: 'payment-carla', approved: false }, 'supervisor'))
    expect(accountTotals(d.state, 'account-17')).toEqual({ totalCents: 1500, paidCents: 0, pendingCents: 0, dueCents: 1500, payableCents: 1500 })
    expect(d.state.consumptions.filter((item) => item.accountId === 'account-17')).toHaveLength(2)
    expect(good(d.run<Payment>({ type: 'pay', input: { accountId: 'account-17', method: 'pix', amountCents: 1500, accessId: 'demo-access-17', ...pixPayer } })).state).toBe('pending')
  })
  it('nega token de outra comanda, expirado ou revogado e limita o cliente ao Pix', () => {
    const state = createInitialState()
    state.accounts.find((account) => account.id === 'account-8')!.accessExpiresAt = '2020-01-01T00:00:00Z'
    state.accounts.find((account) => account.id === 'account-17')!.accessRevoked = true
    const d = driver(state)
    const request = (accountId: string, accessId: string): PrototypeCommand => ({ type: 'addItems', accountId, items: [{ productId: 'water', quantity: 1 }], deliver: false, accessId })
    expect(d.run(request('account-12', 'demo-access-8')).ok).toBe(false)
    expect(d.run(request('account-8', 'demo-access-8')).ok).toBe(false)
    expect(d.run(request('account-17', 'demo-access-17')).ok).toBe(false)
    expect(d.run({ type: 'pay', input: { accountId: 'account-12', method: 'cash', amountCents: 100, accessId: 'demo-access-12' } }).ok).toBe(false)
    expect(d.run({ type: 'pay', input: { accountId: 'account-8', method: 'pix', amountCents: 100, ...pixPayer } }).ok).toBe(false)
  })
  it('só fecha quando saldo, Pix e pedidos são resolvidos e revoga o acesso', () => {
    const d = driver()
    expect(d.run({ type: 'closeAccount', accountId: 'account-12' }).ok).toBe(false)
    expect(d.run({ type: 'closeAccount', accountId: 'account-8' }).ok).toBe(false)
    expect(d.run({ type: 'closeAccount', accountId: 'account-17' }).ok).toBe(false)
    good(d.run({ type: 'pay', input: { accountId: 'account-12', method: 'card', amountCents: 1700, cardApproved: true } }))
    const closed = good(d.run<Account>({ type: 'closeAccount', accountId: 'account-12' }, 'marina', 'close-once'))
    expect(closed.state).toBe('closed')
    expect(closed.accessRevoked).toBe(true)
    expect(d.run({ type: 'closeAccount', accountId: 'account-12' }, 'marina', 'close-once').ok).toBe(true)
    expect(d.run({ type: 'addItems', accountId: closed.id, items: [{ productId: 'water', quantity: 1 }], deliver: false, accessId: closed.accessId }).ok).toBe(false)
  })
})

describe('caixa e estornos supervisionados', () => {
  it('supervisão estorna dinheiro somente no caixa original ainda aberto e não reescreve caixa fechado', () => {
    const d = driver()
    good(d.run({ type: 'refund', paymentId: 'payment-ana', amountCents: 500, reason: 'Valor registrado duas vezes' }, 'supervisor'))
    expect(d.state.cashSessions.find((session) => session.id === 'cash-marina')!.expectedCents).toBe(10500)
    expect(d.state.cashSessions.find((session) => session.id === 'cash-rafael')!.expectedCents).toBe(10000)
    expect(d.state.cashMovements.at(-1)?.kind).toBe('refund')
    good(d.run({ type: 'closeCash', countedCents: 10500, reason: '' }))
    const refused = d.run({ type: 'refund', paymentId: 'payment-ana', amountCents: 500, reason: 'Novo estorno' }, 'supervisor')
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.error).toContain('caixa original')
    expect(d.state.payments.find((payment) => payment.id === 'payment-ana')!.refundedCents).toBe(500)
  })
  it('não permite fechar outro caixa; divergência exige supervisão e motivo', () => {
    const d = driver()
    expect(d.run({ type: 'closeCash', sessionId: 'cash-rafael', countedCents: 10000, reason: '' }).ok).toBe(false)
    expect(d.run({ type: 'closeCash', countedCents: 10000, reason: 'Contado' }).ok).toBe(false)
    expect(d.run({ type: 'closeCash', sessionId: 'cash-marina', countedCents: 10000, reason: '' }, 'supervisor').ok).toBe(false)
    good(d.run({ type: 'closeCash', sessionId: 'cash-marina', countedCents: 10000, reason: 'Faltou dinheiro, encaminhado à supervisão' }, 'supervisor'))
    expect(d.state.cashSessions.find((session) => session.id === 'cash-marina')!.differenceCents).toBe(-1000)
    expect(d.run({ type: 'pay', input: { accountId: 'account-12', method: 'cash', amountCents: 500 } }).ok).toBe(false)
    good(d.run({ type: 'openCash', openingCents: 10000 }))
    expect(d.state.cashSessions.filter((session) => session.actorId === 'marina' && session.state === 'open')).toHaveLength(1)
    expect(d.run({ type: 'openCash', openingCents: 10000 }).ok).toBe(false)
  })
  it('não retira mais dinheiro do que existe e mantém saldo coerente com movimentos', () => {
    const d = driver()
    good(d.run({ type: 'moveCash', kind: 'supply', amountCents: 1000, reason: 'Reforço do troco' }, 'rafael'))
    good(d.run({ type: 'moveCash', kind: 'withdraw', amountCents: 2000, reason: 'Retirada para o cofre' }, 'rafael'))
    expect(d.state.cashSessions.find((session) => session.id === 'cash-rafael')!.expectedCents).toBe(9000)
    expect(d.run({ type: 'moveCash', kind: 'withdraw', amountCents: 9001, reason: 'Teste' }, 'rafael').ok).toBe(false)
  })
  it('registra estorno com motivo, limita ao recebido e aumenta novamente o saldo', () => {
    const d = driver()
    const payment = good(d.run<Payment>({ type: 'pay', input: { accountId: 'account-12', method: 'card', amountCents: 1700, cardApproved: true } }))
    expect(d.run({ type: 'refund', paymentId: payment.id, amountCents: 100, reason: 'Erro' }).ok).toBe(false)
    expect(d.run({ type: 'refund', paymentId: payment.id, amountCents: 1701, reason: 'Erro' }, 'supervisor').ok).toBe(false)
    expect(d.run({ type: 'refund', paymentId: payment.id, amountCents: 500, reason: '' }, 'supervisor').ok).toBe(false)
    good(d.run({ type: 'closeAccount', accountId: 'account-12' }))
    good(d.run({ type: 'refund', paymentId: payment.id, amountCents: 500, reason: 'Cobrança indevida' }, 'supervisor', 'refund-once'))
    expect(accountTotals(d.state, 'account-12').dueCents).toBe(500)
    expect(d.state.accounts.find((account) => account.id === 'account-12')!.state).toBe('open')
    expect(d.state.accounts.find((account) => account.id === 'account-12')!.accessRevoked).toBe(true)
    expect(d.run({ type: 'refund', paymentId: payment.id, amountCents: 500, reason: 'Cobrança indevida' }, 'supervisor', 'refund-once').ok).toBe(true)
    expect(d.state.refunds).toHaveLength(1)
  })
})

describe('idempotência, interrupção e persistência', () => {
  it('salva o estado inicial e recebe confirmações da outra aba sem apagar rascunhos', () => {
    const hook = renderHook(() => usePrototype(), { wrapper })
    expect(window.localStorage.getItem(prototypeStorageKey)).not.toBeNull()
    window.sessionStorage.setItem('longbeach-client-draft:demo-access-17', 'pedido ainda em edição')
    const d = driver(hook.result.current.state)
    good(d.run({ type: 'settlePix', paymentId: 'payment-carla', approved: true }, 'supervisor'))
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: prototypeStorageKey, newValue: JSON.stringify(d.state), storageArea: window.localStorage })) })
    expect(hook.result.current.state.payments.find((payment) => payment.id === 'payment-carla')!.state).toBe('approved')
    expect(window.sessionStorage.getItem('longbeach-client-draft:demo-access-17')).toBe('pedido ainda em edição')
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: prototypeStorageKey, newValue: '{corrupt', storageArea: window.localStorage })) })
    expect(hook.result.current.state.payments.find((payment) => payment.id === 'payment-carla')!.state).toBe('approved')
    expect(hook.result.current.storageError).toContain('outra aba')
  })
  it('reinicia somente os dados e rascunhos desta demonstração', () => {
    const hook = renderHook(() => usePrototype(), { wrapper })
    for (const storage of [window.localStorage, window.sessionStorage]) {
      storage.setItem('longbeach-ux-sale-draft', 'rascunho')
      storage.setItem('longbeach-ux-payment:account-old', 'rascunho')
      storage.setItem('longbeach-client-draft:old-access', 'rascunho')
      storage.setItem('longbeach-os-demo-v1', 'outro módulo')
      storage.setItem('auth-session', 'sessão real')
    }
    act(() => { hook.result.current.reset() })
    for (const storage of [window.localStorage, window.sessionStorage]) {
      expect(storage.getItem('longbeach-ux-sale-draft')).toBeNull()
      expect(storage.getItem('longbeach-ux-payment:account-old')).toBeNull()
      expect(storage.getItem('longbeach-client-draft:old-access')).toBeNull()
      expect(storage.getItem('longbeach-os-demo-v1')).toBe('outro módulo')
      expect(storage.getItem('auth-session')).toBe('sessão real')
    }
    expect(hook.result.current.state.accounts).toHaveLength(3)
  })
  it('repete a resposta original e recusa reuso da chave com dados ou autor diferentes', () => {
    const d = driver()
    const command: PrototypeCommand = { type: 'pay', input: { accountId: 'account-12', method: 'cash', amountCents: 1700 } }
    const first = d.run(command, 'marina', 'same-key')
    expect(d.run(command, 'marina', 'same-key')).toEqual(first)
    expect(d.run({ ...command, input: { ...command.input, amountCents: 1000 } }, 'marina', 'same-key').ok).toBe(false)
    expect(d.run(command, 'rafael', 'same-key').ok).toBe(false)
    expect(d.state.payments).toHaveLength(3)
    expect(d.state.cashSessions.find((session) => session.id === 'cash-marina')!.expectedCents).toBe(12700)
  })
  it('falha de conexão não registra cobrança e aceita o mesmo intento depois da conexão', () => {
    const d = driver()
    const command: PrototypeCommand = { type: 'pay', input: { accountId: 'account-12', method: 'pix', amountCents: 1700, ...pixPayer } }
    expect(d.run(command, 'marina', 'reconnect', true).ok).toBe(false)
    expect(d.state.operations).toHaveLength(0)
    expect(d.run(command, 'marina', 'reconnect').ok).toBe(true)
    expect(d.run(command, 'marina', 'reconnect', true).ok).toBe(true)
    expect(d.state.payments).toHaveLength(3)
  })
  it('rejeita versões antigas e formas corruptas e aceita estado transacionado', () => {
    const d = driver()
    good(d.run({ type: 'addItems', accountId: 'account-8', items: [{ productId: 'burger', quantity: 1 }], deliver: false }))
    expect(isPrototypeState(d.state)).toBe(true)
    expect(isPrototypeState({ ...d.state, version: 2 })).toBe(false)
    expect(isPrototypeState({ version: 1, products: [] })).toBe(false)
    expect(isPrototypeState({ ...d.state, operations: [{ id: 'old', fingerprint: JSON.stringify({ payerEmail: 'legacy@example.com' }), value: { ok: false, error: 'legacy' } }] })).toBe(false)
    const corrupt = JSON.parse(JSON.stringify(d.state)) as PrototypeState
    corrupt.products[0].stock = NaN
    expect(isPrototypeState(corrupt)).toBe(false)
    corrupt.products[0].stock = 24
    corrupt.payments[0].accountId = 'another-account'
    expect(isPrototypeState(corrupt)).toBe(false)
  })
  it('evita a corrida de dois cliques no mesmo lote React e persiste a resposta original', () => {
    const hook = renderHook(() => usePrototype(), { wrapper })
    let first: Result<Payment> | undefined
    let repeated: Result<Payment> | undefined
    act(() => {
      first = hook.result.current.pay({ accountId: 'account-12', method: 'cash', amountCents: 1700 }, 'double-click')
      repeated = hook.result.current.pay({ accountId: 'account-12', method: 'cash', amountCents: 1700 }, 'double-click')
    })
    expect(repeated).toEqual(first)
    expect(hook.result.current.state.payments).toHaveLength(3)
    hook.unmount()
    const restored = renderHook(() => usePrototype(), { wrapper })
    expect(restored.result.current.state.payments).toHaveLength(3)
    act(() => { repeated = restored.result.current.pay({ accountId: 'account-12', method: 'cash', amountCents: 1700 }, 'double-click') })
    expect(repeated).toEqual(first)
    expect(restored.result.current.state.payments).toHaveLength(3)
  })
  it('bloqueia dois pagamentos de chaves distintas acima do saldo no mesmo render', () => {
    const hook = renderHook(() => usePrototype(), { wrapper })
    let second: Result<Payment> | undefined
    act(() => {
      expect(hook.result.current.pay({ accountId: 'account-12', method: 'cash', amountCents: 1700 }, 'first').ok).toBe(true)
      second = hook.result.current.pay({ accountId: 'account-12', method: 'cash', amountCents: 1700 }, 'second')
    })
    expect(second?.ok).toBe(false)
    expect(hook.result.current.state.payments).toHaveLength(3)
  })
  it('recupera armazenamento corrompido e mostra falha de gravação sem travar', () => {
    window.localStorage.setItem(prototypeStorageKey, '{invalid')
    const hook = renderHook(() => usePrototype(), { wrapper })
    expect(hook.result.current.storageError).toContain('reiniciados')
    expect(hook.result.current.state.accounts).toHaveLength(3)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    act(() => { expect(hook.result.current.openAccount('', 'tab', 'open').ok).toBe(true) })
    expect(hook.result.current.state.accounts).toHaveLength(4)
    expect(hook.result.current.storageError).toContain('não conseguiu salvar')
  })
})

describe('indicadores com composição e datas de São Paulo', () => {
  it('cada indicador é calculado diretamente a partir dos detalhes e usa links de origem', () => {
    const state = createInitialState()
    const metrics = ['consumed', 'received', 'refunds', 'fees', 'receivable', 'pending', 'lowStock', 'cash', 'differences', 'requests'] as const
    for (const metric of metrics) {
      const report = getReport(state, metric, '2000-01-01', '2100-12-31')
      expect(report.value).toBe(report.rows.reduce((sum, row) => sum + (report.unit === 'money' ? row.amountCents ?? 0 : row.count ?? 0), 0))
      expect(report.rows.every((row) => row.href.startsWith('/prototipo/gestao/'))).toBe(true)
    }
    expect(getReport(state, 'consumed', '2000-01-01', '2100-12-31').value).toBe(4200)
    expect(getReport(state, 'received', '2000-01-01', '2100-12-31').value).toBe(1000)
    expect(getReport(state, 'requests', '2000-01-01', '2100-12-31').value).toBe(1)
    expect(getReport(state, 'lowStock', '2000-01-01', '2100-12-31').value).toBe(2)
    expect(actorNames.supervisor).toBe('Supervisão')
  })
  it('inclui limites do período pelo dia local, mesmo após meia-noite UTC', () => {
    const state = createInitialState()
    state.consumptions.forEach((item) => { item.acceptedAt = '2026-10-05T02:30:00.000Z' })
    state.payments[0].confirmedAt = '2026-10-05T03:01:00.000Z'
    expect(getReport(state, 'consumed', '2026-10-04', '2026-10-04').value).toBe(4200)
    expect(getReport(state, 'received', '2026-10-04', '2026-10-04').value).toBe(0)
    expect(getReport(state, 'received', '2026-10-05', '2026-10-05').value).toBe(1000)
    expect(getReport(state, 'pending', '1990-01-01', '1990-01-01').value).toBe(1500)
  })
  it('mantém recebimento bruto e estorno separado para os mesmos fatos', () => {
    const d = driver()
    good(d.run({ type: 'settlePix', paymentId: 'payment-carla', approved: true }, 'supervisor'))
    good(d.run({ type: 'refund', paymentId: 'payment-carla', amountCents: 500, reason: 'Erro de valor' }, 'supervisor'))
    expect(getReport(d.state, 'received', '2000-01-01', '2100-12-31').value).toBe(2500)
    expect(getReport(d.state, 'refunds', '2000-01-01', '2100-12-31').value).toBe(500)
  })
})
