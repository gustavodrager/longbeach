import { useAuth } from '../auth/authContext'
import { useRef, useState } from 'react'
import type { Account, Config, Payment } from './api'
import { post, date } from './api'
import { CardFields, emptyCard } from './CardFields'
import { encryptCard } from './card'
import { money } from '../attendance/api'
export function AccountCheckout({ account, config, base, resume, subscription = false, subscriptionOperationId, done }: { account: Account; config: Config; base: string; resume?: Payment; subscription?: boolean; subscriptionOperationId?: string; done: () => Promise<unknown> }) {
  const { user } = useAuth()
  const [method, setMethod] = useState(resume?.method ?? (subscription || !config.pixEnabled ? 'CreditCard' : 'Pix'))
  const [card, setCard] = useState(emptyCard); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const [name, setName] = useState(user?.name ?? ''); const [email, setEmail] = useState(user?.email ?? ''); const [taxId, setTaxId] = useState(''); const [phone, setPhone] = useState(''); const [consent, setConsent] = useState(false)
  const [amount, setAmount] = useState(String(resume?.amount ?? account.payable)); const [started, setStarted] = useState(false)
  const operation = useRef(resume?.operationId ?? subscriptionOperationId ?? crypto.randomUUID())
  const submitting = useRef(false)
  const submittedAmount = useRef<number | undefined>(undefined)
  const total = account.kind === 'Bar' ? Number(amount.replace(',', '.')) : account.payable
  async function submit() {
    if (submitting.current) return
    submitting.current = true; setBusy(true); setError('')
    try {
      const publicKey = subscription ? config.subscriptionPublicKey : config.cardPublicKey
      const encryptedCard = method === 'CreditCard' ? await encryptCard(publicKey ?? '', card) : undefined
      const securityCode = subscription ? card.securityCode : undefined
      setCard(emptyCard); setStarted(true)
      submittedAmount.current ??= resume?.amount ?? total
      await post(`${base}/accounts/${account.id}/${subscription ? 'subscriptions' : 'payments'}`, subscription
        ? { operationId: operation.current, name, email, taxId, phone, encryptedCard, securityCode, consent, expectedAmount: account.total, expectedFirstDue: account.dueDate }
        : { operationId: operation.current, method, name, email, taxId, encryptedCard, amount: submittedAmount.current })
      await done()
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível confirmar. Consulte a conta antes de repetir.'); await done() }
    finally { submitting.current = false; setBusy(false) }
  }
  return <form className="ux-panel" onSubmit={e => { e.preventDefault(); void submit() }}>
    <h3>{subscription ? 'Autorizar mensalidade automática' : resume ? 'Retomar o mesmo pagamento' : 'Pagar esta conta'}</h3>
    <p>{subscription ? `${money(account.total)} por mês. Primeira cobrança em ${date(account.dueDate)}.` : money(resume?.amount ?? total)}</p>
    {account.kind === 'Bar' && !resume && <label className="ux-field">Valor a pagar<input required inputMode="decimal" disabled={busy || started} value={amount} onChange={e => setAmount(e.target.value)} /></label>}
    {!subscription && !resume && <label className="ux-field">Forma de pagamento<select disabled={busy || started} value={method} onChange={e => setMethod(e.target.value)}><option value="Pix" disabled={!config.pixEnabled}>Pix</option><option value="CreditCard" disabled={!config.cardEnabled}>Crédito à vista</option></select></label>}
    <label className="ux-field">Nome do pagador<input required maxLength={150} disabled={busy} value={name} onChange={e => setName(e.target.value)} /></label>
    <label className="ux-field">E-mail<input required type="email" maxLength={subscription ? 60 : 320} disabled={busy} value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label className="ux-field">CPF ou CNPJ<input required inputMode="numeric" pattern="([0-9]{11}|[0-9]{14})" maxLength={14} disabled={busy} value={taxId} onChange={e => setTaxId(e.target.value.replace(/\D/g, ''))} /></label>
    {subscription && <label className="ux-field">Telefone com DDD<input required inputMode="tel" pattern="[0-9]{10,11}" maxLength={11} value={phone} disabled={busy} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} /></label>}
    {method === 'CreditCard' && <CardFields value={card} change={setCard} disabled={busy} />}
    {subscription && <label><input type="checkbox" required checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} /> Autorizo a cobrança mensal de {money(account.total)} no cartão. Posso cancelar cobranças futuras na minha área.</label>}
    {error && <p role="alert">{error}</p>}
    <button className="ux-button primary" disabled={busy || (subscription ? !config.subscriptionsEnabled : method === 'Pix' ? !config.pixEnabled : !config.cardEnabled)}>{busy ? 'Confirmando…' : subscription ? 'Autorizar cobrança mensal' : resume || started ? 'Retomar o mesmo pagamento' : 'Confirmar pagamento'}</button>
    {started && <p role="status">Se houver falha, retome esta operação. Não inicie uma segunda cobrança.</p>}
  </form>
}
