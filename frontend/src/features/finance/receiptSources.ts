import { allocationChoice, legacyUnit, type BusinessAllocation, type BusinessUnitId } from './businessUnits'

export type ReceiptSource = 'PagBankTerminal' | 'PagVendas' | 'CourtPix'
export type ReceivingAccount = 'PagBank' | 'C6'
export type FinancialReceipt = { receiptSource?: ReceiptSource | null; receivingAccount?: ReceivingAccount | null }
export const receiptSources: { value: ReceiptSource; label: string }[] = [
  { value: 'PagBankTerminal', label: 'Venda na maquininha PagBank · Bar' },
  { value: 'PagVendas', label: 'Venda no PagVendas · Bar' },
  { value: 'CourtPix', label: 'Pix de aula, mensalidade ou serviço da Quadra' },
]
export function receiptUnit(source?: string | null): BusinessUnitId | undefined {
  return source === 'PagBankTerminal' || source === 'PagVendas' ? 'bar' : source === 'CourtPix' ? 'quadra' : undefined
}
export function receiptSourceLabel(source?: ReceiptSource | null): string {
  return receiptSources.find(option => option.value === source)?.label ?? 'Não identificada'
}
export function receiptError(row: FinancialReceipt & BusinessAllocation & { direction: string; origin: string }): string | null {
  if (row.receiptSource != null && !receiptSources.some(option => option.value === row.receiptSource)) return 'Confira a origem do recebimento.'
  if (row.receivingAccount != null && !['PagBank', 'C6'].includes(row.receivingAccount)) return 'Confira a conta de recebimento.'
  if (row.direction !== 'Receber' && (row.receiptSource != null || row.receivingAccount != null)) return 'A origem e a conta de recebimento só se aplicam a contas a receber.'
  if (row.receiptSource === 'CourtPix' && !row.receivingAccount) return 'Informe se o Pix da Quadra foi destinado ao PagBank ou ao C6.'
  const expected = receiptUnit(row.receiptSource), originUnit = legacyUnit(row.origin)
  if (expected && (originUnit && originUnit !== expected || allocationChoice(row.origin, row) !== expected)) return 'A unidade deve corresponder à origem do recebimento: maquininha e PagVendas no Bar; Pix de serviços da Quadra na Quadra.'
  return null
}
