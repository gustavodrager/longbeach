export type ActorId = 'marina' | 'rafael' | 'supervisor'
export type Product = {
  id: string; name: string; description: string; category: string
  priceCents: number; costCents: number; stock: number; minimum: number
  image: string; prepared: boolean; favorite: boolean; order: number
}
export type ConsumptionStatus = 'requested' | 'accepted' | 'fulfilled' | 'rejected' | 'reversed'
export type Consumption = {
  id: string; accountId: string; productId: string; name: string
  quantity: number; priceCents: number; costCents: number
  status: ConsumptionStatus; source: 'attendant' | 'selfservice'
  actorId: string; createdAt: string; acceptedAt?: string; fulfilledAt?: string
  reason?: string
}
export type Account = {
  id: string; number: number; name: string; mode: 'immediate' | 'tab'
  state: 'open' | 'closed'; createdAt: string; closedAt?: string
  accessId: string; accessExpiresAt: string; accessRevoked: boolean
}
export type Payment = {
  id: string; accountId: string; method: 'cash' | 'card' | 'pix'
  amountCents: number; tenderedCents: number; changeCents: number
  state: 'pending' | 'approved' | 'declined'; actorId: string
  cashSessionId?: string; createdAt: string; confirmedAt?: string
  refundedCents: number; feeCents: number
}
export type CashMovement = {
  id: string; sessionId: string; kind: 'opening' | 'payment' | 'supply' | 'withdraw' | 'refund'
  amountCents: number; reason: string; createdAt: string; originId?: string
}
export type CashSession = {
  id: string; actorId: ActorId; state: 'open' | 'closed'
  openingCents: number; expectedCents: number; countedCents?: number
  differenceCents?: number; createdAt: string; closedAt?: string; reason?: string
}
export type Refund = { id: string; paymentId: string; accountId: string; amountCents: number; reason: string; createdAt: string }
export type Operation = { id: string; fingerprint: string; value: unknown }
export type PrototypeState = {
  version: 1; products: Product[]; accounts: Account[]; consumptions: Consumption[]
  payments: Payment[]; cashSessions: CashSession[]; cashMovements: CashMovement[]
  refunds: Refund[]; operations: Operation[]
}
export type CartItem = { productId: string; quantity: number }
export type AccountTotals = { totalCents: number; paidCents: number; pendingCents: number; dueCents: number; payableCents: number }
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
export type Metric = 'consumed' | 'received' | 'refunds' | 'fees' | 'receivable' | 'pending' | 'lowStock' | 'cash' | 'differences' | 'requests'
export type ReportRow = { id: string; label: string; detail: string; date: string; amountCents?: number; count?: number; href: string }
export type Report = { title: string; value: number; unit: 'money' | 'count'; current: boolean; rows: ReportRow[]; explanation: string }
export type PaymentInput = {
  accountId: string; amountCents: number; method: Payment['method']; tenderedCents?: number
  cardApproved?: boolean; payerName?: string; payerEmail?: string; payerTaxId?: string
  accessId?: string
}
export type PrototypeApi = {
  state: PrototypeState; actorId: ActorId; offline: boolean; storageError: string
  setActorId: (id: ActorId) => void; setOffline: (offline: boolean) => void
  reset: () => void
  openAccount: (name: string, mode: Account['mode'], operationId: string) => Result<Account>
  addItems: (accountId: string, items: CartItem[], deliver: boolean, operationId: string, accessId?: string) => Result<Consumption[]>
  accept: (consumptionId: string, operationId: string) => Result<Consumption>
  reject: (consumptionId: string, reason: string, operationId: string) => Result<Consumption>
  fulfill: (consumptionId: string, operationId: string) => Result<Consumption>
  reverse: (consumptionId: string, reason: string, returnStock: boolean, operationId: string) => Result<Consumption>
  pay: (input: PaymentInput, operationId: string) => Result<Payment>
  settlePix: (paymentId: string, approved: boolean, operationId: string) => Result<Payment>
  refund: (paymentId: string, amountCents: number, reason: string, operationId: string) => Result<Refund>
  closeAccount: (accountId: string, operationId: string) => Result<Account>
  openCash: (openingCents: number, operationId: string) => Result<CashSession>
  moveCash: (kind: 'supply' | 'withdraw', amountCents: number, reason: string, operationId: string) => Result<CashSession>
  closeCash: (countedCents: number, reason: string, operationId: string, sessionId?: string) => Result<CashSession>
}
