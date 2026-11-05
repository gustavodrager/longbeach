import type { Tab } from './api'

type TabIdentity = Pick<Tab, 'number'> & Partial<Pick<Tab, 'name' | 'customer'>>
export const personName = (name?: string | null) => name?.trim().replace(/\s+/gu, ' ') ?? ''
export function tabCustomerName(tab: TabIdentity) {
  const identified = personName(tab.customer?.name)
  if (identified) return identified
  const named = personName(tab.name)
  return named.toLocaleLowerCase('pt-BR') === 'visitante' ? '' : named
}
export function tabTitle(tab: TabIdentity) {
  const name = tabCustomerName(tab)
  return `Comanda ${String(tab.number).padStart(2, '0')}${name ? ` - ${name}` : ''}`
}
