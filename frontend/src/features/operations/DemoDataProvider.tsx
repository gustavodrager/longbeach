import { hasPermission } from '../auth/access'
import type { RentalGroup, RentalMonth, RentalAttendance } from '../arena/rentals'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { apiFetch, ApiError } from '../../lib/http'
import { validateArenaRecord } from '../arena/validation'
import { expandRecurringReservations, validateRecurringInput } from '../arena/recurring'
import { useAuth } from '../auth/authContext'
import type { ArenaClass, Court, Enrollment, FinanceEntry, Maintenance, Presence, RecurringReservationInput, RecurringReservationResponse, Reservation } from '../arena/types'
import { canCompleteMaterialUnit, readDemoMaterialOperations, sameMaterialOperation, validMaterialQuantity, type DemoMaterialOperations, type MaterialAttempt, type MaterialHistory, type MaterialMovementInput, type MaterialMovementRow, type MaterialNature, type MaterialSnapshot } from './materialStock'

export type Student = {
  id: string; version?: number; costsVisible?: boolean; name: string; phone: string; birthDate: string; address: string; shirtSize: string; shortsSize: string
  weeklyClasses: string; days: string; class1: string; class2: string; monthlyAmount: number; paymentStatus: string
  paymentDate: string; statementName: string; status: string; notes: string
}
export type TeamMember = {
  id: string; version?: number; costsVisible?: boolean; name: string; phone: string; role: string; payAmount: number | null; payBasis: string
  paymentFrequency: string; paymentDay: string; status: string; notes: string
}
export type InventoryItem = {
  id: string; version?: number; costsVisible?: boolean; name: string; category: string; unit: string; quantity: number; minimum: number
  unitCost: number; location: string; notes: string; paymentMethod: string; movements: InventoryMovement[]; nature?: MaterialNature
}
export type InventoryMovement = { id: string; kind: 'Entrada' | 'Baixa'; quantity: number; occurredAt: string }
export type ProjectTask = { id: string; title: string; done: boolean }
export type ArenaProject = {
  id: string; version?: number; costsVisible?: boolean; name: string; description: string; status: string; startDate: string; dueDate: string
  owner: string; estimatedCost: number; actualCost: number; tasks: ProjectTask[]; notes: string
}

type New<T> = Omit<T, 'id'>
export type OperationalData = {
  students: Student[]; team: TeamMember[]; inventory: InventoryItem[]; projects: ArenaProject[]
  courts: Court[]; reservations: Reservation[]; classes: ArenaClass[]; enrollments: Enrollment[]
  rentalGroups: RentalGroup[]; rentalMonths: RentalMonth[]; rentalAttendances: RentalAttendance[]
  presences: Presence[]; financeEntries: FinanceEntry[]; maintenance: Maintenance[]
}
export type OperationalKind = keyof OperationalData
export const operationalPermissions: Record<OperationalKind, { read: string; write: string }> = {
  students: { read: 'students:read', write: 'students:write' }, team: { read: 'employees:read', write: 'employees:write' },
  inventory: { read: 'inventory:read', write: 'inventory:write' }, projects: { read: 'projects:read', write: 'projects:write' },
  courts: { read: 'projects:read', write: 'projects:write' }, reservations: { read: 'projects:read', write: 'projects:write' },
  classes: { read: 'students:read', write: 'students:write' }, enrollments: { read: 'students:read', write: 'students:write' },
  presences: { read: 'students:read', write: 'students:write' }, financeEntries: { read: 'finance:read', write: 'finance:write' },
  rentalGroups: { read: 'projects:read', write: 'projects:write' }, rentalMonths: { read: 'projects:read', write: 'projects:write' }, rentalAttendances: { read: 'projects:read', write: 'projects:write' },
  maintenance: { read: 'projects:read', write: 'projects:write' },
}
type Operations = OperationalData & {
  persistenceStatus: 'local' | 'connecting' | 'connected' | 'error'; persistenceMessage: string
  saving: boolean; scheduleRevision: number; dataUpdatedAt: string | null; refreshFailed: boolean
  canRead: (kind: OperationalKind) => boolean; canWrite: (kind: OperationalKind) => boolean
  reload: () => Promise<void>
  saveRentalGroup: (value: New<RentalGroup>, id?: string) => Promise<string>
  saveRentalAttendance: (value: New<RentalAttendance>, id?: string) => Promise<string>
  saveStudent: (value: New<Student>, id?: string) => Promise<string>
  saveTeamMember: (value: New<TeamMember>, id?: string) => Promise<string>
  saveInventoryItem: (value: New<InventoryItem>, id?: string) => Promise<string>
  materialSessionKey: string; canReadMaterialHistory: boolean; canMoveMaterials: boolean; canAdjustMaterials: boolean
  materialAttempt: (id: string) => MaterialAttempt | undefined
  acknowledgeMaterialMovement: (id: string) => void
  moveMaterial: (id: string, input: MaterialMovementInput, snapshot: MaterialSnapshot) => Promise<void>
  refreshMaterial: (id: string) => Promise<InventoryItem>
  materialHistory: (id: string, page: number) => Promise<MaterialHistory>
  saveProject: (value: New<ArenaProject>, id?: string) => Promise<string>
  saveCourt: (value: New<Court>, id?: string) => Promise<string>
  saveReservation: (value: New<Reservation>, id?: string) => Promise<string>
  saveRecurringReservations: (value: RecurringReservationInput) => Promise<RecurringReservationResponse>
  saveClass: (value: New<ArenaClass>, id?: string) => Promise<string>
  saveEnrollment: (value: New<Enrollment>, id?: string) => Promise<string>
  savePresence: (value: New<Presence>, id?: string) => Promise<string>
  saveFinanceEntry: (value: New<FinanceEntry>, id?: string) => Promise<string>
  saveMaintenance: (value: New<Maintenance>, id?: string) => Promise<string>
}
const Context = createContext<Operations | null>(null)
const storageKey = 'longbeach-os-demo-v1'
const kinds = Object.keys(operationalPermissions) as OperationalKind[]
const empty = (): OperationalData => ({ students: [], team: [], inventory: [], projects: [], courts: [], reservations: [], classes: [], enrollments: [], presences: [], rentalGroups: [], rentalMonths: [], rentalAttendances: [], financeEntries: [], maintenance: [] })
function readDemo(): OperationalData {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<OperationalData>
    return Object.fromEntries(kinds.map(kind => [kind, Array.isArray(value[kind]) ? value[kind] : []])) as OperationalData
  } catch { return empty() }
}
const makeId = () => globalThis.crypto.randomUUID()
type DemoRecurringOperations = Record<string, { fingerprint: string; ids: string[] }>
function readDemoRecurring(): DemoRecurringOperations {
  try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}').__recurringOperations ?? {} } catch { return {} }
}

// Demonstration storage is intentionally isolated. Production never imports browser records.
export function DemoDataProvider({ enabled, demoMode = false, children }: { enabled: boolean; demoMode?: boolean; children: ReactNode }) {
  const { user } = useAuth()
  const remote = enabled && (!demoMode || (import.meta.env.VITE_OPERATIONAL_STORAGE === 'postgres' && Boolean(import.meta.env.VITE_API_URL)))
  const owner = demoMode && !remote ? 'demo' : user ? `${user.id}:${[...user.roles].sort().join(',')}:${[...user.permissions].sort().join(',')}` : 'signed-out'
  const ownerRef = useRef(owner)
  const sessionEpoch = useRef(0)
  if (ownerRef.current !== owner) { ownerRef.current = owner; sessionEpoch.current += 1 }
  const loadEpoch = useRef(0)
  const mutationEpoch = useRef(0)
  const activeLoad = useRef<{ owner: string; session: number; load: number } | null>(null)
  const hasRemoteSnapshot = useRef(false)
  const pending = useRef(new Set<string>())
  const retryIds = useRef(new Map<string, string>())
  const demoRecurring = useRef<DemoRecurringOperations>(demoMode && !remote ? readDemoRecurring() : {})
  const demoMaterials = useRef<DemoMaterialOperations>(demoMode && !remote ? readDemoMaterialOperations() : {})
  const materialAttempts = useRef(new Map<string, MaterialAttempt & { owner: string; session: number }>())
  const [materialRevision, setMaterialRevision] = useState(0)
  const [data, setData] = useState<OperationalData>(() => enabled && demoMode && !remote ? readDemo() : empty())
  const dataEpoch = useRef(sessionEpoch.current)
  const dataRef = useRef(data); dataRef.current = data
  const [saving, setSaving] = useState(false)
  const [scheduleRevision, setScheduleRevision] = useState(0)
  const [persistenceStatus, setPersistenceStatus] = useState<Operations['persistenceStatus']>(remote ? 'connecting' : 'local')
  const persistenceRef = useRef(persistenceStatus); persistenceRef.current = persistenceStatus
  const [persistenceMessage, setPersistenceMessage] = useState('')
  const [dataUpdatedAt, setDataUpdatedAt] = useState<string | null>(demoMode && !remote ? new Date().toISOString() : null)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const can = useCallback((kind: OperationalKind, operation: 'read' | 'write') => demoMode || hasPermission(user, operationalPermissions[kind][operation]), [demoMode, user])
  const canRead = useCallback((kind: OperationalKind) => can(kind, 'read'), [can])
  const canWrite = useCallback((kind: OperationalKind) => can(kind, 'write'), [can])
  const canReadMaterialHistory = enabled && (demoMode && !remote || Boolean(user) && hasPermission(user, 'inventory:read'))
  const canMoveMaterials = canReadMaterialHistory && (demoMode && !remote || hasPermission(user, 'inventory:write'))
  const canAdjustMaterials = canMoveMaterials && (demoMode && !remote || hasPermission(user, 'inventory:adjust'))
  const load = useCallback(async (background = false) => {
    if (!enabled) return
    if (pending.current.size > 0) { if (!background) setPersistenceMessage('Aguarde a confirmação do cadastro antes de atualizar.'); return }
    if (!remote) { demoRecurring.current = readDemoRecurring(); demoMaterials.current = readDemoMaterialOperations(); setData(readDemo()); setPersistenceStatus('local'); setDataUpdatedAt(new Date().toISOString()); setRefreshFailed(false); return }
    if (!demoMode && !user) { setData(empty()); setDataUpdatedAt(null); return }
    if (activeLoad.current?.owner === owner && activeLoad.current.session === sessionEpoch.current && activeLoad.current.load === loadEpoch.current) return
    const requestOwner = owner, requestEpoch = sessionEpoch.current, requestLoad = ++loadEpoch.current, requestMutation = mutationEpoch.current
    activeLoad.current = { owner: requestOwner, session: requestEpoch, load: requestLoad }
    if (!hasRemoteSnapshot.current) {
      persistenceRef.current = 'connecting'; setPersistenceStatus('connecting'); setPersistenceMessage('Carregando os registros da arena…')
    }
    const isCurrent = () => ownerRef.current === requestOwner && sessionEpoch.current === requestEpoch && loadEpoch.current === requestLoad && mutationEpoch.current === requestMutation
    try {
      const allowedKinds = kinds.filter(canRead).filter(kind => !demoMode || ['students', 'team', 'inventory', 'projects'].includes(kind))
      const entries = await Promise.all(allowedKinds.map(async kind => [kind, await apiFetch<OperationalData[typeof kind]>(`/api/v1/operations/${kind}`)] as const))
      if (!isCurrent()) return
      const next = { ...empty(), ...Object.fromEntries(entries) }
      setData(next); dataRef.current = next
      hasRemoteSnapshot.current = true
      setRefreshFailed(false)
      setDataUpdatedAt(new Date().toISOString()); persistenceRef.current = 'connected'; setPersistenceStatus('connected'); setPersistenceMessage('Dados sincronizados com o PostgreSQL.')
    } catch (error) {
      if (!isCurrent()) return
      setRefreshFailed(hasRemoteSnapshot.current)
      if (!hasRemoteSnapshot.current) { persistenceRef.current = 'error'; setPersistenceStatus('error') }
      setPersistenceMessage(hasRemoteSnapshot.current ? 'Não foi possível atualizar os registros. A última leitura foi preservada; confira a conexão e tente novamente.' : error instanceof Error ? error.message : 'Não foi possível carregar os registros. Tente novamente.')
    } finally {
      if (activeLoad.current?.load === requestLoad) activeLoad.current = null
    }
  }, [enabled, remote, demoMode, user, owner, canRead])
  const reload = useCallback(() => load(), [load])
  useEffect(() => {
    const next = remote ? empty() : enabled && demoMode ? readDemo() : empty()
    dataEpoch.current = sessionEpoch.current; dataRef.current = next; setData(next); setDataUpdatedAt(null); setRefreshFailed(false)
    hasRemoteSnapshot.current = false; loadEpoch.current += 1; activeLoad.current = null
    pending.current.clear(); retryIds.current.clear(); materialAttempts.current.clear(); setMaterialRevision(current => current + 1); setSaving(false)
    void reload()
    return () => { loadEpoch.current += 1 }
  }, [reload, remote, enabled, demoMode])
  useEffect(() => {
    if (!enabled || !remote || (!demoMode && !user)) return
    const refresh = () => {
      if (document.visibilityState !== 'hidden' && navigator.onLine !== false) void load(true)
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    const interval = window.setInterval(refresh, 30_000)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [enabled, remote, demoMode, user, load])
  useEffect(() => {
    if (!enabled || !demoMode || remote) return
    try { localStorage.setItem(storageKey, JSON.stringify({ ...data, __recurringOperations: demoRecurring.current, __materialOperations: demoMaterials.current })) } catch { setPersistenceMessage('O navegador não conseguiu guardar os dados de teste.'); setPersistenceStatus('error') }
  }, [data, enabled, demoMode, remote])
  const save = useCallback(async <K extends OperationalKind>(kind: K, input: Omit<OperationalData[K][number], 'id'>, existingId?: string) => {
    if (!enabled || (!demoMode && !user) || !canWrite(kind)) throw new Error('Você não tem permissão para alterar este cadastro.')
    if (remote && persistenceRef.current !== 'connected') throw new Error('Atualize os dados antes de salvar. O formulário permanece aberto.')
    const intent = `${kind}:${JSON.stringify(input)}`
    const id = existingId ?? retryIds.current.get(intent) ?? makeId(), key = `${kind}:${id}`, requestOwner = owner, requestEpoch = sessionEpoch.current
    if (!existingId) retryIds.current.set(intent, id)
    if (pending.current.has(key)) throw new Error('Este cadastro já está sendo salvo. Aguarde a confirmação.')
    pending.current.add(key); mutationEpoch.current += 1; activeLoad.current = null; setSaving(true)
    const record = { ...input, id }
    if (kind === 'inventory') {
      const material = record as InventoryItem
      if (!canRead('financeEntries') || !canWrite('financeEntries') || material.costsVisible === false) {
        delete (material as Partial<InventoryItem>).unitCost; delete (material as Partial<InventoryItem>).paymentMethod
      }
    }
    if (!remote) {
      if (kind === 'inventory') {
        const material = record as InventoryItem, previous = dataRef.current.inventory.find(row => row.id === id)
        if (!(material.unit ?? '').trim() || !(material.location ?? '').trim() || !validMaterialQuantity(material.quantity) || !validMaterialQuantity(material.minimum) || (previous ? material.quantity !== previous.quantity || (material.unit ?? '').trim() !== (previous.unit ?? '').trim() && !canCompleteMaterialUnit(previous) || JSON.stringify(material.movements ?? []) !== JSON.stringify(previous.movements ?? []) : material.quantity !== 0 || (material.movements ?? []).length > 0)) {
          pending.current.delete(key); setSaving(pending.current.size > 0); throw new Error('Registre alterações de saldo em Movimentar. Preserve a unidade e os registros anteriores.')
        }
        material.version = (previous?.version ?? 0) + 1
      }
      const error = validateArenaRecord(kind, record, dataRef.current)
      if (error) { pending.current.delete(key); setSaving(pending.current.size > 0); throw new Error(error) }
    }
    try {
      const saved = remote ? await apiFetch<OperationalData[K][number]>(`/api/v1/operations/${kind}/${id}`, { method: 'PUT', body: JSON.stringify(record) }) : record
      if (ownerRef.current !== requestOwner || sessionEpoch.current !== requestEpoch) throw new Error('A sessão mudou. Atualize os dados antes de continuar.')
      const rows = dataRef.current[kind] as { id: string }[]
      const next = { ...dataRef.current, [kind]: rows.some(row => row.id === id) ? rows.map(row => row.id === id ? saved : row) : [...rows, saved] }
      dataRef.current = next; setData(next); if (!remote) setDataUpdatedAt(new Date().toISOString())
      if (['courts','classes','reservations'].includes(kind)) setScheduleRevision(value => value + 1)
      retryIds.current.delete(intent)
      setPersistenceMessage(remote ? 'Alterações salvas no PostgreSQL.' : 'Alterações salvas neste navegador de teste.')
      return id
    } catch (error) {
      if (ownerRef.current === requestOwner && sessionEpoch.current === requestEpoch) setPersistenceMessage(error instanceof Error ? error.message : 'Não foi possível salvar. Seu formulário permanece aberto.')
      throw error
    } finally { if (ownerRef.current === requestOwner && sessionEpoch.current === requestEpoch) { pending.current.delete(key); setSaving(pending.current.size > 0) } }
  }, [enabled, demoMode, user, canRead, canWrite, remote, persistenceStatus, owner])
  const saveRecurringReservations = useCallback(async (input: RecurringReservationInput): Promise<RecurringReservationResponse> => {
    if (!enabled || (!demoMode && !user) || !canWrite('reservations')) throw new ApiError(403, 'Você não tem permissão para criar reservas recorrentes.')
    if (remote && persistenceRef.current !== 'connected') throw new ApiError(503, 'Atualize os dados antes de salvar. O formulário permanece aberto.')
    const key = `recurring:${input.operationId}`, requestOwner = owner, requestEpoch = sessionEpoch.current
    if (pending.current.has(key)) throw new ApiError(425, 'Este grupo já está sendo salvo. Aguarde a confirmação.')
    pending.current.add(key); mutationEpoch.current += 1; activeLoad.current = null; setSaving(true)
    try {
      let saved: RecurringReservationResponse
      if (remote) saved = await apiFetch<RecurringReservationResponse>('/api/v1/operations/reservations/recurring', { method: 'POST', body: JSON.stringify(input) })
      else {
        const normalized = { ...input, operationId: input.operationId.toLowerCase(), groupTitle: input.groupTitle.trim(), customerName: input.customerName.trim(), phone: input.phone.trim(), notes: input.notes.trim() }
        const error = validateRecurringInput(normalized)
        if (error) throw new ApiError(400, error)
        const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(normalized)))), value => value.toString(16).padStart(2,'0')).join('')
        const previous = demoRecurring.current[normalized.operationId]
        if (previous) {
          if (previous.fingerprint !== fingerprint) throw new ApiError(409, 'Esta solicitação já foi usada para outro grupo. Confira as reservas antes de criar uma nova solicitação.')
          const rows = previous.ids.map(id => dataRef.current.reservations.find(row => row.id === id))
          if (rows.some(row => !row)) throw new ApiError(409, 'O grupo está incompleto. Confira os registros antes de repetir.')
          saved = { groupId: normalized.operationId, groupTitle: normalized.groupTitle, reservations: rows as Reservation[] }
        } else {
          const rows = await expandRecurringReservations(normalized)
          if (ownerRef.current !== requestOwner || sessionEpoch.current !== requestEpoch) throw new Error('A sessão mudou. Atualize os dados antes de continuar.')
          let snapshot = dataRef.current
          for (const row of rows) {
            if (kinds.some(kind => snapshot[kind].some(item => item.id === row.id || item.id === normalized.operationId))) throw new ApiError(409, 'Uma identificação do grupo já está em uso.')
            const error = validateArenaRecord('reservations', row, snapshot)
            if (error) throw new ApiError(400, `Nenhuma reserva foi criada. Semana ${row.occurrenceIndex}: ${error}`)
            snapshot = { ...snapshot, reservations: [...snapshot.reservations, row] }
          }
          const operations = { ...demoRecurring.current, [normalized.operationId]: { fingerprint, ids: rows.map(row => row.id) } }
          // One browser write preserves the complete group; no partial local batch is acknowledged.
          localStorage.setItem(storageKey, JSON.stringify({ ...snapshot, __recurringOperations: operations, __materialOperations: demoMaterials.current }))
          demoRecurring.current = operations
          saved = { groupId: normalized.operationId, groupTitle: normalized.groupTitle, reservations: rows }
        }
      }
      if (ownerRef.current !== requestOwner || sessionEpoch.current !== requestEpoch) throw new Error('A sessão mudou. Atualize os dados antes de continuar.')
      const ids = new Set(saved.reservations.map(row => row.id))
      const next = { ...dataRef.current, reservations: [...dataRef.current.reservations.filter(row => !ids.has(row.id)), ...saved.reservations] }
      dataRef.current = next; setData(next); if (!remote) setDataUpdatedAt(new Date().toISOString()); setPersistenceMessage(`${saved.reservations.length} reservas do grupo foram confirmadas.`)
      setScheduleRevision(value => value + 1)
      return saved
    } catch (error) {
      if (ownerRef.current === requestOwner && sessionEpoch.current === requestEpoch) setPersistenceMessage(error instanceof Error ? error.message : 'Não foi possível confirmar o grupo. Seu formulário permanece aberto.')
      throw error
    } finally { if (ownerRef.current === requestOwner && sessionEpoch.current === requestEpoch) { pending.current.delete(key); setSaving(pending.current.size > 0) } }
  }, [enabled, demoMode, user, canWrite, remote, owner])
  const materialAttempt = useCallback((id: string) => {
    const attempt = materialAttempts.current.get(id)
    return attempt?.owner === owner && attempt.session === sessionEpoch.current ? attempt : undefined
  }, [owner])
  const acknowledgeMaterialMovement = useCallback((id: string) => {
    if (materialAttempt(id)?.status !== 'confirmed') return
    materialAttempts.current.delete(id); setMaterialRevision(current => current + 1)
  }, [materialAttempt])
  const moveMaterial = useCallback(async (id: string, input: MaterialMovementInput, snapshot: MaterialSnapshot) => {
    if (!canMoveMaterials || input.kind === 'Count' && !canAdjustMaterials) throw new ApiError(403, 'Você não tem permissão para esta movimentação.')
    const previous = materialAttempt(id), key = `inventory:${id}`, requestOwner = owner, requestEpoch = sessionEpoch.current
    if (previous?.status === 'conflict') throw new ApiError(409, 'Atualize e confira o saldo antes de iniciar outra solicitação.')
    if (previous && !sameMaterialOperation(previous.input, input)) throw new ApiError(425, 'Confira a solicitação pendente antes de iniciar outra movimentação.')
    if (previous?.status === 'confirmed') return
    if (pending.current.has(key)) throw new ApiError(425, 'Aguarde a confirmação desta movimentação.')
    if (remote && persistenceRef.current !== 'connected') throw new ApiError(503, 'Atualize os dados antes de movimentar.')
    const current = () => ownerRef.current === requestOwner && sessionEpoch.current === requestEpoch
    const checkpoint = (status: MaterialAttempt['status']) => {
      materialAttempts.current.set(id, { input: { ...input }, snapshot: { ...snapshot }, status, owner: requestOwner, session: requestEpoch })
      setMaterialRevision(revision => revision + 1)
    }
    pending.current.add(key); mutationEpoch.current += 1; activeLoad.current = null; setSaving(true); checkpoint('sending')
    try {
      let material: InventoryItem
      if (remote) {
        if (navigator.onLine === false) throw new ApiError(0, 'Sem conexão. Confira a mesma solicitação quando estiver online.')
        const saved = await apiFetch<{ material: InventoryItem; movement: MaterialMovementRow }>(`/api/v1/materials/${id}/movements`, { method: 'POST', body: JSON.stringify(input) })
        material = saved.material
      } else {
        // The local demonstration has its own ledger; production never reads these browser receipts.
        if (!demoMode) throw new ApiError(403, 'Movimentação local disponível apenas na demonstração.')
        const existing = dataRef.current.inventory.find(row => row.id === id)
        if (!existing) throw new ApiError(404, 'Material não encontrado.')
        const receipt = demoMaterials.current[input.operationId]
        if (receipt) {
          if (receipt.materialId !== id || receipt.actorId !== 'demo' || !sameMaterialOperation(receipt.input, input)) throw new ApiError(409, 'Solicitação já utilizada. Confira o histórico.')
          material = existing
        } else {
          if (input.expectedVersion !== (existing.version ?? 0)) throw new ApiError(409, 'O saldo mudou. Atualize e confira a quantidade.')
          if (!validMaterialQuantity(input.quantity) || input.kind !== 'Count' && input.quantity <= 0 || !input.reason.trim() || input.reason.trim().length > 500 || !input.destination.trim() || input.destination.trim().length > 160 || !(existing.location ?? '').trim() || !(existing.unit ?? '').trim()) throw new ApiError(400, 'Confira quantidade, motivo, destino, unidade e local do material.')
          if (input.kind === 'Consumption' && existing.nature !== 'Consumable') throw new ApiError(400, 'Consumo exige um material classificado como material de consumo.')
          const after = Math.round((input.kind === 'Count' ? input.quantity : existing.quantity + (input.kind === 'Receipt' ? input.quantity : -input.quantity)) * 1000) / 1000
          if (!validMaterialQuantity(after) || after === existing.quantity) throw new ApiError(400, 'O saldo deve mudar e não pode ficar negativo.')
          material = { ...existing, quantity: after, version: (existing.version ?? 0) + 1 }
          const movement: MaterialMovementRow = { id: makeId(), materialId: id, kind: input.kind, before: existing.quantity, quantity: Math.round((after - existing.quantity) * 1000) / 1000, after, unit: existing.unit, location: existing.location, reason: input.reason, destination: input.destination, actorId: 'demo', actorName: 'Demonstração local', occurredAt: new Date().toISOString() }
          const receipts = { ...demoMaterials.current, [input.operationId]: { input: { ...input }, materialId: id, actorId: 'demo', movement } }
          const next = { ...dataRef.current, inventory: dataRef.current.inventory.map(row => row.id === id ? material : row) }
          localStorage.setItem(storageKey, JSON.stringify({ ...next, __recurringOperations: demoRecurring.current, __materialOperations: receipts }))
          demoMaterials.current = receipts
        }
      }
      if (!current()) throw new Error('A sessão mudou. Atualize os dados antes de continuar.')
      const next = { ...dataRef.current, inventory: dataRef.current.inventory.map(row => row.id === id ? material : row) }
      dataRef.current = next; setData(next); checkpoint('confirmed')
      if (!remote) setDataUpdatedAt(new Date().toISOString())
      setPersistenceMessage('Movimentação confirmada. O saldo do material foi atualizado.')
    } catch (error) {
      if (current()) {
        if (error instanceof ApiError && error.status === 409) checkpoint('conflict')
        else if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500 || [408, 425, 429].includes(error.status)) checkpoint('uncertain')
        else { materialAttempts.current.delete(id); setMaterialRevision(revision => revision + 1) }
      }
      throw error
    } finally { if (current()) { pending.current.delete(key); setSaving(pending.current.size > 0) } }
  }, [canMoveMaterials, canAdjustMaterials, materialAttempt, owner, remote, demoMode])
  const refreshMaterial = useCallback(async (id: string): Promise<InventoryItem> => {
    if (!enabled || !canRead('inventory') || remote && !user) throw new ApiError(403, 'Você não tem permissão para consultar o estoque.')
    const attempt = materialAttempt(id), key = `inventory:${id}`, requestOwner = owner, requestEpoch = sessionEpoch.current
    if (attempt?.status === 'sending' || attempt?.status === 'uncertain') throw new ApiError(425, 'Confira a mesma solicitação antes de atualizar o saldo.')
    if (pending.current.has(key)) throw new ApiError(425, 'Aguarde a confirmação desta movimentação.')
    pending.current.add(key); mutationEpoch.current += 1; activeLoad.current = null; setSaving(true)
    try {
      const rows = remote ? await apiFetch<InventoryItem[]>('/api/v1/operations/inventory') : dataRef.current.inventory
      if (ownerRef.current !== requestOwner || sessionEpoch.current !== requestEpoch) throw new Error('A sessão mudou. Atualize os dados antes de continuar.')
      const fresh = rows.find(row => row.id === id)
      if (!fresh) throw new ApiError(404, 'Material não encontrado na leitura atual.')
      const next = { ...dataRef.current, inventory: dataRef.current.inventory.map(row => row.id === id ? fresh : row) }
      dataRef.current = next; setData(next)
      materialAttempts.current.delete(id); setMaterialRevision(revision => revision + 1)
      return fresh
    } finally { if (ownerRef.current === requestOwner && sessionEpoch.current === requestEpoch) { pending.current.delete(key); setSaving(pending.current.size > 0) } }
  }, [enabled, canRead, remote, user, materialAttempt, owner])
  const materialHistory = useCallback(async (id: string, page: number): Promise<MaterialHistory> => {
    if (!enabled || !canRead('inventory') || remote && !user) throw new ApiError(403, 'Entre com uma sessão individual para consultar as movimentações.')
    const requestOwner = owner, requestEpoch = sessionEpoch.current
    const history = remote ? await apiFetch<MaterialHistory>(`/api/v1/materials/${id}/movements?page=${page}`) : (() => {
      const items = Object.values(demoMaterials.current).filter(row => row.materialId === id).map(row => row.movement).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      return { items: items.slice((page - 1) * 50, page * 50), page, total: items.length }
    })()
    if (ownerRef.current !== requestOwner || sessionEpoch.current !== requestEpoch) throw new Error('A sessão mudou. Consulte o histórico novamente.')
    return history
  }, [enabled, canRead, remote, user, owner])
  const value = useMemo<Operations>(() => ({
    ...(dataEpoch.current === sessionEpoch.current ? data : empty()), persistenceStatus, persistenceMessage, saving, scheduleRevision, dataUpdatedAt, refreshFailed, canRead, canWrite, reload,
    saveRentalGroup: (v,id) => save('rentalGroups',v,id), saveRentalAttendance: (v,id) => save('rentalAttendances',v,id),
    saveStudent: (v,id) => save('students',v,id), saveTeamMember: (v,id) => save('team',v,id),
    saveInventoryItem: (v,id) => save('inventory',v,id), saveProject: (v,id) => save('projects',v,id),
    saveCourt: (v,id) => save('courts',v,id), saveReservation: (v,id) => save('reservations',v,id),
    saveRecurringReservations,
    materialSessionKey: `${owner}:${sessionEpoch.current}`, canReadMaterialHistory, canMoveMaterials, canAdjustMaterials, materialAttempt, acknowledgeMaterialMovement, moveMaterial, refreshMaterial, materialHistory,
    saveClass: (v,id) => save('classes',v,id), saveEnrollment: (v,id) => save('enrollments',v,id),
    savePresence: (v,id) => save('presences',v,id), saveFinanceEntry: (v,id) => save('financeEntries',v,id), saveMaintenance: (v,id) => save('maintenance',v,id),
  }), [data, persistenceStatus, persistenceMessage, saving, scheduleRevision, dataUpdatedAt, refreshFailed, canRead, canWrite, reload, save, saveRecurringReservations, owner, canReadMaterialHistory, canMoveMaterials, canAdjustMaterials, materialAttempt, acknowledgeMaterialMovement, moveMaterial, refreshMaterial, materialHistory, materialRevision])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useOptionalOperations() { return useContext(Context) }
export function useOperations() {
  const context = useContext(Context)
  if (!context) throw new Error('Os dados operacionais precisam do DemoDataProvider.')
  return context
}
