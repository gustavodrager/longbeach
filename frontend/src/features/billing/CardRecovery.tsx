import { useState } from 'react'
import { CardFields, emptyCard } from './CardFields'
import { encryptCard } from './card'
import type { TabPayment } from '../attendance/api'
export function CardRecovery({ payment, publicKey, busy, resume }: { payment: TabPayment; publicKey?: string; busy: boolean; resume: (payer: { name: string; email: string; taxId: string; encryptedCard: string }) => Promise<unknown> }) {
  const [card, setCard] = useState(emptyCard); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [taxId, setTaxId] = useState(''); const [error, setError] = useState(''); const [working, setWorking] = useState(false)
  if (payment.method !== 'CreditCard' || payment.state !== 'Pending' || !payment.canResume) return null
  async function submit() { setWorking(true); setError(''); try { const encryptedCard = await encryptCard(publicKey ?? '', card); setCard(emptyCard); await resume({ name, email, taxId, encryptedCard }) } catch { setError('Confira os dados ou a conexão e retome a mesma cobrança.') } finally { setWorking(false) } }
  return <form className="ux-panel" onSubmit={e => { e.preventDefault(); void submit() }}><h2>Retomar o mesmo pagamento</h2><p>O valor continua reservado. Informe o mesmo pagador e cartão para recuperar a operação.</p><fieldset disabled={busy || working}><label className="ux-field">Nome do pagador<input required value={name} onChange={e => setName(e.target.value)} /></label><label className="ux-field">E-mail<input required type="email" value={email} onChange={e => setEmail(e.target.value)} /></label><label className="ux-field">CPF / CNPJ<input required maxLength={14} value={taxId} onChange={e => setTaxId(e.target.value.replace(/\D/g, ''))} /></label><CardFields value={card} change={setCard} disabled={busy || working} /><button disabled={!publicKey}>Retomar pagamento</button></fieldset>{error && <p role="alert">{error}</p>}</form>
}
