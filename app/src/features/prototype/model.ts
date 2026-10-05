import type { Account, AccountTotals, ActorId, CartItem, CashSession, Consumption, Metric, PaymentInput, PrototypeState, Report, ReportRow, Result } from './types'

export const actorNames: Record<ActorId, string> = { marina: 'Marina', rafael: 'Rafael', supervisor: 'Supervisão' }
export const prototypeStorageKey = 'longbeach-ux-prototype-v1'
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const money = (cents: number) => currency.format(cents / 100)
export function parseMoney(input: string): number {
  let text = input.trim().replace(/^R\$\s*/, '')
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(text)) text = text.replaceAll('.', '')
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(text)) return NaN
  const [whole, decimals = ''] = text.split(/[,.]/)
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : NaN
}
const newId = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
const integer = (value: unknown, minimum = 0): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
const date = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const string = (value: unknown): value is string => typeof value === 'string'
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const has = (value: unknown, choices: readonly string[]) => typeof value === 'string' && choices.includes(value)
const optionalDate = (value: unknown) => value === undefined || date(value)
const optionalInteger = (value: unknown) => value === undefined || integer(value)
const actor = (value: unknown): value is ActorId => has(value, Object.keys(actorNames))

export function createInitialState(): PrototypeState {
  const now = new Date().toISOString()
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const state: PrototypeState = {
    version: 1,
    products: [
      { id: 'water', name: 'Água', description: 'Garrafa gelada · 500 ml', category: 'Bebidas', priceCents: 500, costCents: 180, stock: 24, minimum: 6, image: '/prototype-assets/water.svg', prepared: false, favorite: true, order: 1 },
      { id: 'beer', name: 'Cerveja', description: 'Lata gelada · 350 ml', category: 'Bebidas', priceCents: 1200, costCents: 600, stock: 18, minimum: 6, image: '/prototype-assets/beer.svg', prepared: false, favorite: true, order: 2 },
      { id: 'soda', name: 'Refrigerante', description: 'Lata gelada · 350 ml', category: 'Bebidas', priceCents: 700, costCents: 300, stock: 3, minimum: 6, image: '/prototype-assets/soda.svg', prepared: false, favorite: true, order: 3 },
      { id: 'juice', name: 'Suco', description: 'Copo · 300 ml', category: 'Bebidas', priceCents: 800, costCents: 300, stock: 12, minimum: 4, image: '/prototype-assets/juice.svg', prepared: false, favorite: false, order: 4 },
      { id: 'burger', name: 'Hambúrguer', description: 'Preparado na cozinha', category: 'Comidas', priceCents: 2500, costCents: 1100, stock: 10, minimum: 3, image: '/prototype-assets/burger.svg', prepared: true, favorite: true, order: 5 },
      { id: 'fries', name: 'Batata frita', description: 'Porção preparada na cozinha', category: 'Comidas', priceCents: 1000, costCents: 450, stock: 12, minimum: 4, image: '/prototype-assets/fries.svg', prepared: true, favorite: false, order: 6 },
      { id: 'water-sparkling', name: 'Água com gás', description: 'Garrafa · 500 ml', category: 'Bebidas', priceCents: 600, costCents: 220, stock: 0, minimum: 4, image: '/prototype-assets/water.svg', prepared: false, favorite: false, order: 7 },
    ],
    accounts: [
      { id: 'account-12', number: 12, name: 'Ana', mode: 'tab', state: 'open', createdAt: now, accessId: 'demo-access-12', accessExpiresAt: expiry, accessRevoked: false },
      { id: 'account-8', number: 8, name: 'Bruno', mode: 'tab', state: 'open', createdAt: now, accessId: 'demo-access-8', accessExpiresAt: expiry, accessRevoked: false },
      { id: 'account-17', number: 17, name: 'Carla', mode: 'tab', state: 'open', createdAt: now, accessId: 'demo-access-17', accessExpiresAt: expiry, accessRevoked: false },
    ],
    consumptions: [],
    payments: [
      { id: 'payment-ana', accountId: 'account-12', method: 'cash', amountCents: 1000, tenderedCents: 1000, changeCents: 0, state: 'approved', actorId: 'marina', cashSessionId: 'cash-marina', createdAt: now, confirmedAt: now, refundedCents: 0, feeCents: 0 },
      { id: 'payment-carla', accountId: 'account-17', method: 'pix', amountCents: 1500, tenderedCents: 1500, changeCents: 0, state: 'pending', actorId: 'selfservice', createdAt: now, refundedCents: 0, feeCents: 0 },
    ],
    cashSessions: [
      { id: 'cash-marina', actorId: 'marina', state: 'open', openingCents: 10000, expectedCents: 11000, createdAt: now },
      { id: 'cash-rafael', actorId: 'rafael', state: 'open', openingCents: 10000, expectedCents: 10000, createdAt: now },
    ],
    cashMovements: [
      { id: 'opening-marina', sessionId: 'cash-marina', kind: 'opening', amountCents: 10000, reason: 'Fundo inicial fictício', createdAt: now },
      { id: 'opening-rafael', sessionId: 'cash-rafael', kind: 'opening', amountCents: 10000, reason: 'Fundo inicial fictício', createdAt: now },
      { id: 'movement-ana', sessionId: 'cash-marina', kind: 'payment', amountCents: 1000, reason: 'Pagamento da comanda 12', createdAt: now, originId: 'payment-ana' },
    ],
    refunds: [], operations: [],
  }
  const seed = (id: string, accountId: string, productId: string, status: Consumption['status'], source: Consumption['source']) => {
    const product = state.products.find((item) => item.id === productId)!
    state.consumptions.push({ id, accountId, productId, name: product.name, quantity: 1, priceCents: product.priceCents, costCents: product.costCents, status, source, actorId: source === 'selfservice' ? 'selfservice' : 'marina', createdAt: now, ...(status === 'fulfilled' ? { acceptedAt: now, fulfilledAt: now } : {}) })
  }
  seed('consumption-ana-water', 'account-12', 'water', 'fulfilled', 'attendant')
  seed('consumption-ana-beer', 'account-12', 'beer', 'fulfilled', 'attendant')
  seed('consumption-ana-fries', 'account-12', 'fries', 'fulfilled', 'attendant')
  seed('consumption-bruno', 'account-8', 'burger', 'requested', 'selfservice')
  seed('consumption-carla-juice', 'account-17', 'juice', 'fulfilled', 'attendant')
  seed('consumption-carla-soda', 'account-17', 'soda', 'fulfilled', 'attendant')
  return state
}

export function accountTotals(state: PrototypeState, accountId: string): AccountTotals {
  const totalCents = state.consumptions.filter((item) => item.accountId === accountId && (item.status === 'accepted' || item.status === 'fulfilled')).reduce((sum, item) => sum + item.priceCents * item.quantity, 0)
  const payments = state.payments.filter((item) => item.accountId === accountId)
  const paidCents = payments.filter((item) => item.state === 'approved').reduce((sum, item) => sum + item.amountCents - item.refundedCents, 0)
  const pendingCents = payments.filter((item) => item.state === 'pending').reduce((sum, item) => sum + item.amountCents, 0)
  const dueCents = Math.max(0, totalCents - paidCents)
  return { totalCents, paidCents, pendingCents, dueCents, payableCents: Math.max(0, dueCents - pendingCents) }
}
export function availableStock(state: PrototypeState, productId: string): number {
  const stock = state.products.find((item) => item.id === productId)?.stock ?? 0
  const reserved = state.consumptions.filter((item) => item.productId === productId && item.status === 'accepted').reduce((sum, item) => sum + item.quantity, 0)
  return Math.max(0, stock - reserved)
}

export type PrototypeCommand =
  | { type: 'openAccount'; name: string; mode: Account['mode'] }
  | { type: 'addItems'; accountId: string; items: CartItem[]; deliver: boolean; accessId?: string }
  | { type: 'accept' | 'fulfill'; consumptionId: string }
  | { type: 'reject'; consumptionId: string; reason: string }
  | { type: 'reverse'; consumptionId: string; reason: string; returnStock: boolean }
  | { type: 'pay'; input: PaymentInput }
  | { type: 'settlePix'; paymentId: string; approved: boolean }
  | { type: 'refund'; paymentId: string; amountCents: number; reason: string }
  | { type: 'closeAccount'; accountId: string }
  | { type: 'openCash'; openingCents: number }
  | { type: 'moveCash'; kind: 'supply' | 'withdraw'; amountCents: number; reason: string }
  | { type: 'closeCash'; countedCents: number; reason: string; sessionId?: string }

class RuleError extends Error {}
function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message)
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (record(value)) return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, canonical(value[key])]))
  return value
}

/** A synchronous, atomic demo transaction. This never calls a production API. */
export function applyCommand<T = unknown>(state: PrototypeState, actorId: ActorId, command: PrototypeCommand, operationId: string, offline = false, now = new Date().toISOString()): { state: PrototypeState; result: Result<T> } {
  // Payer contact/document fields are transient form data, not financial
  // identity. The idempotency record only fingerprints payment allocation.
  let financialCommand: PrototypeCommand = command
  if (command.type === 'pay') {
    const { payerName: _name, payerEmail: _email, payerTaxId: _taxId, ...input } = command.input
    financialCommand = { type: 'pay', input }
  }
  const fingerprint = JSON.stringify(canonical({ actorId, command: financialCommand }))
  const previous = state.operations.find((operation) => operation.id === operationId)
  if (previous) return { state, result: previous.fingerprint === fingerprint ? previous.value as Result<T> : { ok: false, error: 'Esta ação já foi usada com outros dados. Inicie uma nova ação.' } }
  if (!operationId.trim()) return { state, result: { ok: false, error: 'Não foi possível identificar a ação. Tente novamente.' } }
  if (offline) return { state, result: { ok: false, error: 'Sem conexão simulada. Nada foi confirmado. Seu pedido permanece na tela; tente novamente quando a conexão voltar.' } }
  const draft = JSON.parse(JSON.stringify(state)) as PrototypeState
  let result: Result<T>
  try {
    requireRule(actor(actorId), 'Selecione uma pessoa da equipe.')
    const value = execute(draft, actorId, command, now)
    result = { ok: true, value: value as T }
  } catch (error) {
    if (!(error instanceof RuleError)) throw error
    // A rejected transaction cannot retain any of the draft's partial writes.
    const untouched = { ...state, operations: [...state.operations, { id: operationId, fingerprint, value: { ok: false, error: error.message } }] }
    return { state: untouched, result: { ok: false, error: error.message } }
  }
  draft.operations.push({ id: operationId, fingerprint, value: result })
  return { state: draft, result }
}

function execute(state: PrototypeState, actorId: ActorId, command: PrototypeCommand, now: string): unknown {
  const supervisor = () => requireRule(actorId === 'supervisor', 'Esta ação precisa da supervisão.')
  const openAccount = (id: string, accessId?: string) => {
    const account = state.accounts.find((item) => item.id === id)
    requireRule(account, 'Comanda não encontrada.')
    if (accessId !== undefined) requireRule(accessId === account.accessId && !account.accessRevoked && Date.parse(account.accessExpiresAt) > Date.parse(now), 'Este acesso à comanda não está disponível. Peça um novo QR à equipe.')
    requireRule(account.state === 'open', 'Esta comanda já foi fechada.')
    return account
  }
  const consumption = (id: string) => {
    const item = state.consumptions.find((entry) => entry.id === id)
    requireRule(item, 'Item não encontrado.')
    openAccount(item.accountId)
    return item
  }
  const ownCash = () => {
    const session = state.cashSessions.find((item) => item.actorId === actorId && item.state === 'open')
    requireRule(session, 'Abra seu caixa para receber ou movimentar dinheiro.')
    return session
  }
  const addMovement = (session: CashSession, kind: 'payment' | 'supply' | 'withdraw' | 'refund', amountCents: number, reason: string, originId?: string) => {
    session.expectedCents += kind === 'withdraw' || kind === 'refund' ? -amountCents : amountCents
    state.cashMovements.push({ id: newId('movement'), sessionId: session.id, kind, amountCents, reason, createdAt: now, ...(originId ? { originId } : {}) })
  }
  switch (command.type) {
    case 'openAccount': {
      requireRule(has(command.mode, ['immediate', 'tab']), 'Escolha venda ou comanda.')
      requireRule(command.name.trim().length <= 80, 'Use um nome com até 80 letras.')
      const account: Account = { id: newId('account'), number: Math.max(0, ...state.accounts.map((item) => item.number)) + 1, name: command.name.trim(), mode: command.mode, state: 'open', createdAt: now, accessId: newId('demo-access'), accessExpiresAt: new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString(), accessRevoked: false }
      state.accounts.push(account)
      return account
    }
    case 'addItems': {
      const account = openAccount(command.accountId, command.accessId)
      requireRule(command.items.length > 0, 'Escolha pelo menos um produto.')
      const quantities = new Map<string, number>()
      for (const item of command.items) {
        requireRule(integer(item.quantity, 1) && item.quantity <= 999, 'Use uma quantidade inteira de 1 a 999.')
        quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity)
      }
      const visitor = command.accessId !== undefined
      const result: Consumption[] = []
      // Validate the entire cart before creating or delivering any item.
      for (const [productId, quantity] of quantities) {
        const product = state.products.find((item) => item.id === productId)
        requireRule(product, 'Um produto não está mais disponível. Confira o pedido.')
        requireRule(quantity <= 999, 'Use até 999 unidades de cada produto.')
        requireRule(availableStock(state, productId) >= quantity, `Não há ${product.name} suficiente. Quantidade disponível: ${availableStock(state, productId)}.`)
        const fulfilled = !visitor && command.deliver && !product.prepared
        result.push({ id: newId('consumption'), accountId: account.id, productId, name: product.name, quantity, priceCents: product.priceCents, costCents: product.costCents, status: visitor ? 'requested' : fulfilled ? 'fulfilled' : 'accepted', source: visitor ? 'selfservice' : 'attendant', actorId: visitor ? 'selfservice' : actorId, createdAt: now, ...(!visitor ? { acceptedAt: now } : {}), ...(fulfilled ? { fulfilledAt: now } : {}) })
      }
      for (const item of result) if (item.status === 'fulfilled') state.products.find((product) => product.id === item.productId)!.stock -= item.quantity
      state.consumptions.push(...result)
      return result
    }
    case 'accept': {
      const item = consumption(command.consumptionId)
      requireRule(item.status === 'requested', 'Este item já foi conferido pela equipe.')
      requireRule(availableStock(state, item.productId) >= item.quantity, 'Estoque insuficiente. Recuse o item ou ajuste a quantidade em um novo pedido.')
      item.status = 'accepted'; item.acceptedAt = now
      return item
    }
    case 'reject': {
      const item = consumption(command.consumptionId)
      requireRule(item.status === 'requested', 'Somente um pedido ainda não confirmado pode ser recusado.')
      requireRule(command.reason.trim(), 'Informe por que o item foi recusado.')
      item.status = 'rejected'; item.reason = command.reason.trim()
      return item
    }
    case 'fulfill': {
      const item = consumption(command.consumptionId)
      requireRule(item.status === 'accepted', 'Confirme o pedido antes de entregar. Cada entrega pode ocorrer uma única vez.')
      const product = state.products.find((entry) => entry.id === item.productId)
      requireRule(product && product.stock >= item.quantity, 'Não há estoque suficiente para entregar este item.')
      product.stock -= item.quantity; item.status = 'fulfilled'; item.fulfilledAt = now
      return item
    }
    case 'reverse': {
      supervisor()
      const item = consumption(command.consumptionId)
      requireRule(item.status === 'accepted' || item.status === 'fulfilled', 'Este consumo não pode ser corrigido novamente.')
      requireRule(command.reason.trim(), 'Informe o motivo da correção.')
      const totals = accountTotals(state, item.accountId)
      requireRule(totals.totalCents - item.priceCents * item.quantity >= totals.paidCents + totals.pendingCents, 'Estorne o valor recebido e resolva o Pix pendente antes de retirar este consumo.')
      if (item.status === 'fulfilled' && command.returnStock) {
        const product = state.products.find((entry) => entry.id === item.productId)
        requireRule(product, 'Produto não encontrado para devolver ao estoque.')
        product.stock += item.quantity
      }
      item.reason = `${command.reason.trim()} · ${item.status === 'fulfilled' ? command.returnStock ? 'Produto devolvido ao estoque' : 'Sem devolução ao estoque' : 'Reserva de estoque liberada'} · ${actorNames[actorId]}`
      item.status = 'reversed'
      return item
    }
    case 'pay': {
      const input = command.input
      const account = openAccount(input.accountId, input.accessId)
      requireRule(integer(input.amountCents, 1), 'Informe um valor maior que zero, com no máximo dois centavos decimais.')
      requireRule(has(input.method, ['cash', 'card', 'pix']), 'Escolha Dinheiro, Cartão ou Pix.')
      requireRule(input.accessId === undefined || input.method === 'pix', 'Neste QR, o pagamento é somente por Pix. Para outro meio, fale com a equipe.')
      if (input.method === 'pix') {
        requireRule(typeof input.payerName === 'string' && input.payerName.trim().length >= 2 && input.payerName.trim().length <= 100, 'Informe o nome de quem paga, com 2 a 100 letras.')
        requireRule(typeof input.payerEmail === 'string' && input.payerEmail.length <= 150 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.payerEmail.trim()), 'Confira o e-mail de quem paga.')
        const document = input.payerTaxId?.replace(/[.\-/\s]/g, '') ?? ''
        requireRule(/^\d{11}$|^\d{14}$/.test(document) && !/^(\d)\1+$/.test(document), 'Informe um CPF com 11 números ou um CNPJ com 14 números. Use dados fictícios nesta demonstração.')
      }
      const totals = accountTotals(state, account.id)
      requireRule(input.amountCents <= totals.payableCents, totals.pendingCents > 0 ? 'Parte deste valor já está em um Pix pendente. Resolva o Pix ou receba apenas o valor disponível.' : 'O valor é maior que o saldo da comanda.')
      let cashSession: CashSession | undefined
      let tenderedCents = input.amountCents
      if (input.method === 'cash') {
        cashSession = ownCash()
        tenderedCents = input.tenderedCents ?? input.amountCents
        requireRule(integer(tenderedCents) && tenderedCents >= input.amountCents, 'O dinheiro recebido precisa cobrir este pagamento.')
        requireRule(tenderedCents - input.amountCents <= cashSession.expectedCents, 'Não há dinheiro suficiente no seu caixa para este troco.')
      }
      requireRule(input.method !== 'card' || input.cardApproved === true, 'Confirme a aprovação na maquininha antes de registrar o cartão.')
      const payment = { id: newId('payment'), accountId: account.id, method: input.method, amountCents: input.amountCents, tenderedCents, changeCents: tenderedCents - input.amountCents, state: input.method === 'pix' ? 'pending' as const : 'approved' as const, actorId: input.accessId === undefined ? actorId : 'selfservice', ...(cashSession ? { cashSessionId: cashSession.id } : {}), createdAt: now, ...(input.method !== 'pix' ? { confirmedAt: now } : {}), refundedCents: 0, feeCents: input.method === 'card' ? Math.round(input.amountCents * 0.02) : 0 }
      state.payments.push(payment)
      if (cashSession) addMovement(cashSession, 'payment', payment.amountCents, `Pagamento da comanda ${account.number}`, payment.id)
      return payment
    }
    case 'settlePix': {
      supervisor()
      const payment = state.payments.find((item) => item.id === command.paymentId)
      requireRule(payment && payment.method === 'pix' && payment.state === 'pending', 'Este Pix já foi resolvido ou não foi encontrado.')
      const account = state.accounts.find((item) => item.id === payment.accountId)
      requireRule(account?.state === 'open', 'Esta comanda já foi fechada.')
      payment.state = command.approved ? 'approved' : 'declined'
      if (command.approved) payment.confirmedAt = now
      return payment
    }
    case 'refund': {
      supervisor()
      const payment = state.payments.find((item) => item.id === command.paymentId)
      requireRule(payment?.state === 'approved', 'Somente pagamentos confirmados podem ser estornados.')
      requireRule(integer(command.amountCents, 1) && command.amountCents <= payment.amountCents - payment.refundedCents, 'O estorno precisa ser positivo e caber no valor ainda recebido.')
      requireRule(command.reason.trim(), 'Informe o motivo do estorno.')
      let cashSession: CashSession | undefined
      if (payment.method === 'cash') {
        // Supervisors may return cash from the original, still-open till.
        // A historic, closed till must never have its reconciliation rewritten.
        cashSession = state.cashSessions.find((session) => session.id === payment.cashSessionId && session.state === 'open')
        requireRule(cashSession, 'O caixa original deste pagamento já foi fechado. O estorno em dinheiro precisa ser conciliado com a supervisão em um novo caixa; esta demonstração só permite estorno no caixa original aberto.')
        requireRule(cashSession.expectedCents >= command.amountCents, 'Seu caixa não tem dinheiro suficiente para este estorno.')
      }
      const refund = { id: newId('refund'), paymentId: payment.id, accountId: payment.accountId, amountCents: command.amountCents, reason: command.reason.trim(), createdAt: now }
      payment.refundedCents += command.amountCents
      const account = state.accounts.find((item) => item.id === payment.accountId)
      if (account?.state === 'closed') { account.state = 'open'; delete account.closedAt; account.accessRevoked = true }
      state.refunds.push(refund)
      if (cashSession) addMovement(cashSession, 'refund', command.amountCents, refund.reason, refund.id)
      return refund
    }
    case 'closeAccount': {
      const account = openAccount(command.accountId)
      const totals = accountTotals(state, account.id)
      requireRule(totals.dueCents === 0 && totals.pendingCents === 0, 'Receba o saldo e resolva os pagamentos pendentes antes de fechar.')
      requireRule(!state.consumptions.some((item) => item.accountId === account.id && (item.status === 'requested' || item.status === 'accepted')), 'Confira e entregue os pedidos pendentes antes de fechar.')
      account.state = 'closed'; account.closedAt = now; account.accessRevoked = true
      return account
    }
    case 'openCash': {
      requireRule(integer(command.openingCents), 'Informe um fundo de caixa válido.')
      requireRule(!state.cashSessions.some((item) => item.actorId === actorId && item.state === 'open'), 'Você já tem um caixa aberto.')
      const session: CashSession = { id: newId('cash'), actorId, state: 'open', openingCents: command.openingCents, expectedCents: command.openingCents, createdAt: now }
      state.cashSessions.push(session)
      state.cashMovements.push({ id: newId('movement'), sessionId: session.id, kind: 'opening', amountCents: command.openingCents, reason: 'Abertura de caixa fictício', createdAt: now })
      return session
    }
    case 'moveCash': {
      const session = ownCash()
      requireRule(has(command.kind, ['supply', 'withdraw']), 'Escolha colocar ou retirar dinheiro.')
      requireRule(integer(command.amountCents, 1), 'Informe um valor maior que zero.')
      requireRule(command.reason.trim(), 'Informe o motivo da movimentação.')
      requireRule(command.kind !== 'withdraw' || command.amountCents <= session.expectedCents, 'Não há esse valor no seu caixa.')
      addMovement(session, command.kind, command.amountCents, command.reason.trim())
      return session
    }
    case 'closeCash': {
      const session = command.sessionId ? state.cashSessions.find((item) => item.id === command.sessionId) : ownCash()
      requireRule(session?.state === 'open', 'Este caixa já foi fechado ou não foi encontrado.')
      requireRule(session.actorId === actorId || actorId === 'supervisor', 'Você só pode fechar o seu próprio caixa.')
      requireRule(integer(command.countedCents), 'Informe o dinheiro contado no caixa.')
      const difference = command.countedCents - session.expectedCents
      if (difference !== 0) {
        supervisor()
        requireRule(command.reason.trim(), 'A supervisão precisa registrar o motivo da diferença.')
      }
      if (session.actorId !== actorId) requireRule(command.reason.trim(), 'Informe o motivo do fechamento pela supervisão.')
      session.state = 'closed'; session.countedCents = command.countedCents; session.differenceCents = difference; session.closedAt = now; session.reason = command.reason.trim()
      return session
    }
  }
}

const localDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
export function getReport(state: PrototypeState, metric: Metric, fromDate: string, toDate: string): Report {
  const inPeriod = (iso?: string) => Boolean(iso && localDay(iso) >= fromDate && localDay(iso) <= toDate)
  const accountLink = (id: string) => `/prototipo/gestao/comandas/${encodeURIComponent(id)}`
  const accountLabel = (id: string) => { const account = state.accounts.find((item) => item.id === id); return `Comanda ${account?.number ?? '—'}${account?.name ? ` · ${account.name}` : ''}` }
  const paymentLink = (id: string) => `/prototipo/gestao/pagamentos/${encodeURIComponent(id)}`
  const cashLink = (id: string) => `/prototipo/gestao/caixas/${encodeURIComponent(id)}`
  const now = new Date().toISOString()
  let rows: ReportRow[] = []
  let title = ''; let explanation = ''; let unit: Report['unit'] = 'money'
  const current = ['receivable', 'pending', 'lowStock', 'cash', 'requests'].includes(metric)
  switch (metric) {
    case 'consumed':
      title = 'Consumo confirmado'; explanation = 'Itens aceitos ou entregues pela data de confirmação. Pedidos esperando a equipe e correções não compõem este total.'
      rows = state.consumptions.filter((item) => (item.status === 'accepted' || item.status === 'fulfilled') && inPeriod(item.acceptedAt)).map((item) => ({ id: item.id, label: accountLabel(item.accountId), detail: `${item.quantity} × ${item.name}`, date: item.acceptedAt!, amountCents: item.priceCents * item.quantity, href: accountLink(item.accountId) }))
      break
    case 'received':
      title = 'Pagamentos confirmados'; explanation = 'Valor bruto dos pagamentos confirmados no período. Estornos e taxas aparecem separadamente; este valor não representa saldo bancário.'
      rows = state.payments.filter((item) => item.state === 'approved' && inPeriod(item.confirmedAt)).map((item) => ({ id: item.id, label: accountLabel(item.accountId), detail: item.method === 'cash' ? 'Dinheiro' : item.method === 'card' ? 'Cartão · maquininha confirmada' : 'Pix · confirmação simulada', date: item.confirmedAt!, amountCents: item.amountCents, href: paymentLink(item.id) }))
      break
    case 'refunds':
      title = 'Estornos'; explanation = 'Valores estornados pela supervisão no período, com motivo registrado.'
      rows = state.refunds.filter((item) => inPeriod(item.createdAt)).map((item) => ({ id: item.id, label: accountLabel(item.accountId), detail: item.reason, date: item.createdAt, amountCents: item.amountCents, href: paymentLink(item.paymentId) }))
      break
    case 'fees':
      title = 'Taxas confirmadas'; explanation = 'Taxa fictícia de 2% nos cartões confirmados no período, apenas para validar a apresentação. Não representa contrato real com adquirente.'
      rows = state.payments.filter((item) => item.state === 'approved' && item.feeCents > 0 && inPeriod(item.confirmedAt)).map((item) => ({ id: item.id, label: accountLabel(item.accountId), detail: 'Taxa de cartão simulada · 2%', date: item.confirmedAt!, amountCents: item.feeCents, href: paymentLink(item.id) }))
      break
    case 'receivable':
      title = 'Falta receber agora'; explanation = 'Saldos das comandas abertas, incluindo valores que ainda aguardam confirmação de Pix.'
      rows = state.accounts.filter((item) => item.state === 'open' && accountTotals(state, item.id).dueCents > 0).map((item) => ({ id: item.id, label: accountLabel(item.id), detail: 'Saldo ainda não confirmado', date: now, amountCents: accountTotals(state, item.id).dueCents, href: accountLink(item.id) }))
      break
    case 'pending':
      title = 'Pix pendentes agora'; explanation = 'Pagamentos esperando o controle de provedor simulado. Não são pagamentos aprovados nem dinheiro em caixa.'
      rows = state.payments.filter((item) => item.state === 'pending').map((item) => ({ id: item.id, label: accountLabel(item.accountId), detail: 'Esperando confirmação simulada', date: item.createdAt, amountCents: item.amountCents, href: paymentLink(item.id) }))
      break
    case 'lowStock':
      title = 'Estoque baixo agora'; explanation = 'Produtos com quantidade disponível no mínimo ou abaixo dele. Reservas dos pedidos aceitos já são descontadas.'; unit = 'count'
      rows = state.products.filter((item) => availableStock(state, item.id) <= item.minimum).map((item) => ({ id: item.id, label: item.name, detail: `${availableStock(state, item.id)} disponíveis · mínimo ${item.minimum}`, date: now, count: 1, href: `/prototipo/gestao/estoque/${encodeURIComponent(item.id)}` }))
      break
    case 'cash':
      title = 'Dinheiro nos caixas abertos'; explanation = 'Dinheiro esperado nas sessões físicas abertas agora, com fundo e movimentos. Pix e cartão não entram no caixa.'
      rows = state.cashSessions.filter((item) => item.state === 'open').map((item) => ({ id: item.id, label: `Caixa de ${actorNames[item.actorId]}`, detail: 'Dinheiro esperado · caixa aberto', date: now, amountCents: item.expectedCents, href: cashLink(item.id) }))
      break
    case 'differences':
      title = 'Diferenças de caixa'; explanation = 'Soma dos valores absolutos das diferenças dos fechamentos no período. Cada detalhe mostra se faltou ou sobrou dinheiro.'
      rows = state.cashSessions.filter((item) => item.state === 'closed' && item.differenceCents !== 0 && inPeriod(item.closedAt)).map((item) => ({ id: item.id, label: `Caixa de ${actorNames[item.actorId]}`, detail: `${(item.differenceCents ?? 0) < 0 ? 'Faltou' : 'Sobrou'} ${money(Math.abs(item.differenceCents ?? 0))} · ${item.reason}`, date: item.closedAt!, amountCents: Math.abs(item.differenceCents ?? 0), href: cashLink(item.id) }))
      break
    case 'requests':
      title = 'Itens esperando a equipe'; explanation = 'Pedidos QR ainda não aceitos. Não compõem consumo cobrável nem reservam estoque.'; unit = 'count'
      rows = state.consumptions.filter((item) => item.status === 'requested').map((item) => ({ id: item.id, label: accountLabel(item.accountId), detail: `${item.quantity} × ${item.name}`, date: item.createdAt, count: 1, href: accountLink(item.accountId) }))
      break
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
  return { title, explanation, unit, current, rows, value: rows.reduce((sum, item) => sum + (unit === 'money' ? item.amountCents ?? 0 : item.count ?? 0), 0) }
}

/** Reject corrupt or incompatible local data instead of spreading it into screens. */
export function isPrototypeState(value: unknown): value is PrototypeState {
  if (!record(value) || value.version !== 1) return false
  const arrays = ['products', 'accounts', 'consumptions', 'payments', 'cashSessions', 'cashMovements', 'refunds', 'operations'] as const
  if (!arrays.every((key) => Array.isArray(value[key]) && value[key].every(record))) return false
  const state = value as unknown as PrototypeState
  if (!arrays.every((key) => state[key].every((item) => string(item.id) && item.id.length > 0) && new Set(state[key].map((item) => item.id)).size === state[key].length)) return false
  if (!state.products.every((p) => [p.name, p.description, p.category, p.image].every(string) && [p.priceCents, p.costCents, p.stock, p.minimum, p.order].every((n) => integer(n)) && typeof p.prepared === 'boolean' && typeof p.favorite === 'boolean')) return false
  if (!state.accounts.every((a) => integer(a.number, 1) && string(a.name) && has(a.mode, ['immediate', 'tab']) && has(a.state, ['open', 'closed']) && date(a.createdAt) && optionalDate(a.closedAt) && string(a.accessId) && date(a.accessExpiresAt) && typeof a.accessRevoked === 'boolean')) return false
  if (!state.consumptions.every((c) => state.accounts.some((a) => a.id === c.accountId) && state.products.some((p) => p.id === c.productId) && string(c.name) && string(c.actorId) && integer(c.quantity, 1) && integer(c.priceCents) && integer(c.costCents) && has(c.status, ['requested', 'accepted', 'fulfilled', 'rejected', 'reversed']) && has(c.source, ['attendant', 'selfservice']) && date(c.createdAt) && optionalDate(c.acceptedAt) && optionalDate(c.fulfilledAt) && (!(c.status === 'accepted' || c.status === 'fulfilled') || date(c.acceptedAt)) && (c.status !== 'fulfilled' || date(c.fulfilledAt)) && (c.reason === undefined || string(c.reason)))) return false
  if (!state.cashSessions.every((c) => actor(c.actorId) && has(c.state, ['open', 'closed']) && integer(c.openingCents) && integer(c.expectedCents) && optionalInteger(c.countedCents) && (c.differenceCents === undefined || Number.isSafeInteger(c.differenceCents)) && date(c.createdAt) && optionalDate(c.closedAt) && (c.reason === undefined || string(c.reason)))) return false
  if (!state.payments.every((p) => state.accounts.some((a) => a.id === p.accountId) && has(p.method, ['cash', 'card', 'pix']) && has(p.state, ['pending', 'approved', 'declined']) && integer(p.amountCents, 1) && integer(p.tenderedCents) && integer(p.changeCents) && integer(p.refundedCents) && p.refundedCents <= p.amountCents && integer(p.feeCents) && string(p.actorId) && date(p.createdAt) && optionalDate(p.confirmedAt) && (p.state !== 'approved' || date(p.confirmedAt)) && (p.cashSessionId === undefined || state.cashSessions.some((c) => c.id === p.cashSessionId)))) return false
  if (!state.cashMovements.every((m) => state.cashSessions.some((c) => c.id === m.sessionId) && has(m.kind, ['opening', 'payment', 'supply', 'withdraw', 'refund']) && integer(m.amountCents) && string(m.reason) && date(m.createdAt))) return false
  if (!state.refunds.every((r) => state.payments.some((p) => p.id === r.paymentId && p.accountId === r.accountId) && integer(r.amountCents, 1) && string(r.reason) && date(r.createdAt))) return false
  if (!state.operations.every((o) => string(o.fingerprint) && !/"payer(?:Name|Email|TaxId)"\s*:/.test(o.fingerprint) && record(o.value) && (o.value.ok === true && 'value' in o.value || o.value.ok === false && string(o.value.error)))) return false
  if (new Set(state.accounts.map((a) => a.number)).size !== state.accounts.length || new Set(state.accounts.map((a) => a.accessId)).size !== state.accounts.length) return false
  if (Object.keys(actorNames).some((id) => state.cashSessions.filter((c) => c.actorId === id && c.state === 'open').length > 1)) return false
  if (state.products.some((p) => state.consumptions.filter((c) => c.productId === p.id && c.status === 'accepted').reduce((sum, c) => sum + c.quantity, 0) > p.stock)) return false
  if (state.accounts.some((a) => { const totals = accountTotals(state, a.id); return totals.paidCents + totals.pendingCents > totals.totalCents })) return false
  return true
}
