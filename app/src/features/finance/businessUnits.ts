export type BusinessUnitId = 'bar' | 'quadra'
export type BusinessAllocation = { allocationScope?: 'Unit' | 'Shared' | 'Unclassified' | null; businessUnitId?: BusinessUnitId | null }
export type AllocationChoice = BusinessUnitId | 'shared' | 'unclassified'

export const allocationOptions: { value: AllocationChoice; label: string }[] = [
  { value: 'bar', label: 'Bar' }, { value: 'quadra', label: 'Quadra' },
  { value: 'shared', label: 'Compartilhado · sem rateio' }, { value: 'unclassified', label: 'A classificar' },
]
export function legacyUnit(origin: string): BusinessUnitId | undefined {
  return origin === 'Bar' ? 'bar' : origin === 'Escola' || origin === 'Locações' ? 'quadra' : undefined
}
export function allocationChoice(origin: string, row: BusinessAllocation): AllocationChoice {
  if (row.allocationScope === 'Unit' && (row.businessUnitId === 'bar' || row.businessUnitId === 'quadra')) return row.businessUnitId
  if (row.allocationScope === 'Shared') return 'shared'
  if (row.allocationScope === 'Unclassified') return 'unclassified'
  return legacyUnit(origin) ?? 'unclassified'
}
export function allocationFields(choice: string): BusinessAllocation {
  if (choice === 'bar' || choice === 'quadra') return { allocationScope: 'Unit', businessUnitId: choice }
  return { allocationScope: choice === 'shared' ? 'Shared' : 'Unclassified', businessUnitId: null }
}
export function allocationLabel(origin: string, row: BusinessAllocation): string {
  return allocationOptions.find(option => option.value === allocationChoice(origin, row))!.label
}
export function allocationError(origin: string, row: BusinessAllocation): string | null {
  const { allocationScope: scope, businessUnitId: unit } = row
  if (scope == null && unit == null) return null
  if (scope === 'Unit' ? unit !== 'bar' && unit !== 'quadra' : !['Shared', 'Unclassified'].includes(scope ?? '') || unit != null) return 'Confira a unidade de negócio e a classificação do lançamento.'
  const expected = legacyUnit(origin)
  return expected && (scope !== 'Unit' || unit !== expected) ? 'A unidade de negócio deve corresponder à origem: Bar ou Quadra (Escola e Locações).' : null
}
