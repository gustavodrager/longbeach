import { Field } from '../../pages/arenaUi'
import { allocationChoice, allocationFields, allocationOptions, legacyUnit, type BusinessAllocation } from './businessUnits'

export function BusinessAllocationField({ origin, value, onChange, receiptBusinessUnit }: { origin: string; value: BusinessAllocation; onChange: (value: BusinessAllocation) => void; receiptBusinessUnit?: 'bar' | 'quadra' }) {
  const fixed = receiptBusinessUnit ?? legacyUnit(origin)
  return <>
    <Field label="Unidade de negócio / destinação" value={allocationChoice(origin, value)} onChange={choice => onChange(allocationFields(choice))} options={fixed ? allocationOptions.filter(option => option.value === fixed) : allocationOptions} />
    <p className="arena-hint">{receiptBusinessUnit ? 'Unidade definida pela origem do recebimento.' : fixed ? 'Unidade definida pela origem. Escola e Locações pertencem à Quadra.' : 'Compartilhado fica separado das duas unidades até definir o rateio. Use A classificar quando ainda não houver confirmação.'}</p>
  </>
}
