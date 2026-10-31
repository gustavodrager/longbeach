import { Field } from '../../pages/arenaUi'
import { allocationFields, legacyUnit, type BusinessAllocation } from './businessUnits'
import { receiptSources, receiptUnit, type FinancialReceipt, type ReceiptSource, type ReceivingAccount } from './receiptSources'

export function ReceiptSourceFields({ origin, value, onChange }: { origin: string; value: FinancialReceipt; onChange: (value: FinancialReceipt & BusinessAllocation) => void }) {
  const fixed = legacyUnit(origin)
  return <>
    <Field label="Origem do recebimento" value={value.receiptSource ?? ''} onChange={source => onChange({ receiptSource: (source || null) as ReceiptSource | null, ...allocationFields(receiptUnit(source) ?? fixed ?? 'unclassified') })} options={[
      { value: '', label: 'Ainda não identificada / outra origem' },
      ...receiptSources.filter(option => !fixed || receiptUnit(option.value) === fixed),
    ]} />
    <Field label="Conta de recebimento" required={value.receiptSource === 'CourtPix'} value={value.receivingAccount ?? ''} onChange={account => onChange({ receivingAccount: (account || null) as ReceivingAccount | null })} options={[
      { value: '', label: 'Não informada' }, { value: 'PagBank', label: 'PagBank' }, { value: 'C6', label: 'C6' },
    ]} />
    <p className="arena-hint">Maquininha/PagVendas: Bar, inclusive Pix. Pix de aulas, mensalidades e serviços da Quadra: Quadra. Informar a conta não confirma crédito no banco.</p>
  </>
}
