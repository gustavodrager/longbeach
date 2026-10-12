import { useEffect, useState } from 'react'
import { dateTime, money, type Tab, type TabItem } from './api'
import { Status } from './components'

export function useAttentionClock() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

export function waitingTime(since: string | undefined, now: number) {
  const elapsed = since ? now - Date.parse(since) : NaN
  if (!Number.isFinite(elapsed) || elapsed < 0) return null
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return 'menos de 1 min'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
  return `${Math.floor(hours / 24)} d${hours % 24 ? ` ${hours % 24} h` : ''}`
}

export function tabAttention(tab: Tab, now: number) {
  if (tab.state !== 'Open') return []
  const messages: string[] = []
  const requested = tab.items.filter(item => item.state === 'Requested').length
  const accepted = tab.items.filter(item => item.state === 'Accepted').length
  if (requested) messages.push(`Aceite pendente (${requested})`)
  if (accepted) messages.push(`Entrega pendente (${accepted})`)
  if (tab.pending > 0) messages.push(`Pagamento em confirmação: ${money(tab.pending)}`)
  const refund = tab.payments.reduce((sum, payment) => sum + (payment.refundPending || 0), 0)
  if (refund > 0) messages.push(`Estorno em confirmação: ${money(refund)}`)
  if (now - Date.parse(tab.createdAtUtc) >= 86_400_000) messages.push(`Aberta há ${waitingTime(tab.createdAtUtc, now)} · conferir`)
  return messages
}

export function TabAttention({ tab, now }: { tab: Tab; now: number }) {
  const messages = tabAttention(tab, now)
  return <>
    <span className="lb-tab-state">{tab.state === 'Closed' ? 'Encerrada' : 'Aberta'}</span>
    <small>{tab.state === 'Closed' ? `Encerrada em ${dateTime(tab.closedAtUtc ?? undefined)}` : `Aberta em ${dateTime(tab.createdAtUtc)}`}</small>
    {messages.length > 0 && <span className="lb-tab-attention" aria-label="Pendências da comanda">{messages.map(message => <Status key={message} tone="warning">{message}</Status>)}</span>}
  </>
}

export function OrderWaiting({ item, now }: { item: TabItem; now: number }) {
  if (item.state !== 'Requested' && item.state !== 'Accepted') return null
  const since = item.state === 'Requested' ? item.createdAtUtc : item.acceptedAtUtc ?? item.createdAtUtc
  const duration = waitingTime(since, now)
  if (!duration) return <p className="ux-note">Tempo de espera a conferir.</p>
  return <p className="lb-order-waiting">{item.state === 'Requested' ? 'Aguardando aceite' : 'Aguardando entrega'} há {duration}</p>
}
