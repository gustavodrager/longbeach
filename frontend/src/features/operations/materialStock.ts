export type MaterialNature = 'Consumable' | 'Unclassified' | 'Reusable' | 'Asset'
export type MaterialMovementInput = {
  operationId: string
  expectedVersion: number
  kind: 'Receipt' | 'Consumption' | 'Loss' | 'Count'
  quantity: number
  reason: string
  destination: string
}
export type MaterialMovementRow = {
  id: string; materialId: string; kind: MaterialMovementInput['kind']
  before: number; quantity: number; after: number; unit: string; location: string
  reason: string; destination: string; actorId: string; actorName: string | null; occurredAt: string
}
export type MaterialHistory = { items: MaterialMovementRow[]; page: number; total: number }
export type MaterialSnapshot = {
  name: string; quantity: number; version?: number; unit: string; location: string; nature?: MaterialNature
}
export type MaterialAttempt = {
  input: MaterialMovementInput
  snapshot: MaterialSnapshot
  status: 'sending' | 'uncertain' | 'conflict' | 'confirmed'
}
export type DemoMaterialOperations = Record<string, {
  input: MaterialMovementInput; materialId: string; actorId: string; movement: MaterialMovementRow
}>

export const materialKinds = { Receipt: 'Entrada', Consumption: 'Consumo', Loss: 'Perda', Count: 'Contagem física' }
export const materialNatures = [
  { value: 'Consumable', label: 'Material de consumo' },
  { value: 'Unclassified', label: 'A classificar' },
  { value: 'Reusable', label: 'Equipamento reutilizável' },
  { value: 'Asset', label: 'Bem patrimonial' },
]
export const materialQuantity = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
export const validMaterialQuantity = (value: number) => Number.isFinite(value) && value >= 0 && value <= 99999999 && Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001
export function canCompleteMaterialUnit(item: { unit?: string; quantity: number; movements?: unknown }) {
  return !(item.unit ?? '').trim() && item.quantity === 0
    && (item.movements == null || Array.isArray(item.movements) && item.movements.length === 0)
}
export function parseMaterialQuantity(value: string): number | null {
  const text = value.trim()
  if (!/^\d+(?:[.,]\d{1,3})?$/.test(text)) return null
  const quantity = Number(text.replace(',', '.'))
  return validMaterialQuantity(quantity) ? quantity : null
}
export function sameMaterialOperation(left: MaterialMovementInput, right: MaterialMovementInput) {
  return left.operationId === right.operationId && left.expectedVersion === right.expectedVersion
    && left.kind === right.kind && left.quantity === right.quantity
    && left.reason === right.reason && left.destination === right.destination
}
export function readDemoMaterialOperations(): DemoMaterialOperations {
  try { return JSON.parse(localStorage.getItem('longbeach-os-demo-v1') ?? '{}').__materialOperations ?? {} }
  catch { return {} }
}
