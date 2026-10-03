import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'

export type Student = {
  id: string; name: string; phone: string; birthDate: string; address: string; shirtSize: string; shortsSize: string
  weeklyClasses: string; days: string; class1: string; class2: string; monthlyAmount: number; paymentStatus: string
  paymentDate: string; statementName: string; status: string; notes: string
}
export type TeamMember = {
  id: string; name: string; phone: string; role: string; payAmount: number; payBasis: string
  paymentFrequency: string; paymentDay: string; status: string; notes: string
}
export type InventoryItem = {
  id: string; name: string; category: string; unit: string; quantity: number; minimum: number
  unitCost: number; location: string; notes: string; paymentMethod: string; movements: InventoryMovement[]
}
export type InventoryMovement = { id: string; kind: 'Entrada' | 'Baixa'; quantity: number; occurredAt: string }
export type ProjectTask = { id: string; title: string; done: boolean }
export type ArenaProject = {
  id: string; name: string; description: string; status: string; startDate: string; dueDate: string
  owner: string; estimatedCost: number; actualCost: number; tasks: ProjectTask[]; notes: string
}

type New<T> = Omit<T, 'id'>
type Operations = {
  students: Student[]; team: TeamMember[]; inventory: InventoryItem[]; projects: ArenaProject[]
  persistenceStatus: 'local' | 'connecting' | 'connected' | 'error'
  persistenceMessage: string
  saveStudent: (value: New<Student>, id?: string) => string
  saveTeamMember: (value: New<TeamMember>, id?: string) => void
  saveInventoryItem: (value: New<InventoryItem>, id?: string) => void
  adjustStock: (id: string, amount: number) => void
  saveProject: (value: New<ArenaProject>, id?: string) => void
}
const Context = createContext<Operations | null>(null)
const storageKey = 'longbeach-os-demo-v1'
const getApiUrl = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const isPostgresEnabled = () => import.meta.env.VITE_OPERATIONAL_STORAGE === 'postgres' && Boolean(getApiUrl())
type Stored = Pick<Operations, 'students' | 'team' | 'inventory' | 'projects'>
const empty: Stored = { students: [], team: [], inventory: [], projects: [] }
function readStored(): Stored {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return empty
    const value = JSON.parse(raw) as Partial<Stored>
    return { students: value.students ?? [], team: value.team ?? [], inventory: value.inventory ?? [], projects: value.projects ?? [] }
  } catch { return empty }
}
const makeId = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
  const random = Math.floor(Math.random() * 16)
  return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
})

export function DemoDataProvider({ enabled, demoMode = false, children }: { enabled: boolean; demoMode?: boolean; children: ReactNode }) {
  const { user } = useAuth()
  const [data, setData] = useState<Stored>(() => enabled ? readStored() : empty)
  const postgresEnabled = isPostgresEnabled() && enabled
  const [persistenceStatus, setPersistenceStatus] = useState<Operations['persistenceStatus']>(postgresEnabled ? 'connecting' : 'local')
  const [persistenceMessage, setPersistenceMessage] = useState('')
  useEffect(() => { if (enabled) localStorage.setItem(storageKey, JSON.stringify(data)) }, [data, enabled])
  useEffect(() => {
    if (!postgresEnabled || (!demoMode && !user)) return
    let active = true
    const kinds = ['students', 'team', 'inventory', 'projects'] as const
    const load = async () => {
      try {
        const remote = await Promise.all(kinds.map(async (kind) => {
          return await apiFetch<Stored[typeof kind]>(`/api/v1/operations/${kind}`)
        }))
        if (!active) return
        const stored = readStored()
        const localOnly = kinds.map((kind, index) => stored[kind].filter((item) => !remote[index].some((row) => row.id === item.id)))
        await Promise.all(kinds.flatMap((kind, index) => localOnly[index].map((item) => writeRemote(kind, item))))
        if (!active) return
        const next = Object.fromEntries(kinds.map((kind, index) => [kind, [...remote[index], ...localOnly[index]]])) as Stored
        setData(next)
        setPersistenceMessage(localOnly.some((rows) => rows.length > 0) ? 'Cadastros locais sincronizados com o PostgreSQL.' : 'Dados sincronizados com o PostgreSQL.')
        setPersistenceStatus('connected')
      } catch {
        if (active) {
          setPersistenceMessage('Não foi possível acessar o banco. Os dados continuam salvos neste navegador e serão sincronizados quando a conexão voltar.')
          setPersistenceStatus('error')
        }
      }
    }
    void load()
    return () => { active = false }
  }, [postgresEnabled, demoMode, user?.id])
  const value = useMemo<Operations>(() => ({
    ...data,
    persistenceStatus,
    persistenceMessage,
    saveStudent: (student, id) => {
      const key = id ?? makeId()
      const saved = { ...student, id: key }
      setData((current) => ({ ...current, students: id ? current.students.map((item) => item.id === id ? saved : item) : [...current.students, saved] }))
      void persist('students', saved, markWriteError, markWriteSuccess)
      return key
    },
    saveTeamMember: (member, id) => {
      const saved = { ...member, id: id ?? makeId() }
      setData((current) => ({ ...current, team: id ? current.team.map((item) => item.id === id ? saved : item) : [...current.team, saved] }))
      void persist('team', saved, markWriteError, markWriteSuccess)
    },
    saveInventoryItem: (item, id) => {
      const saved = { ...item, id: id ?? makeId() }
      setData((current) => ({ ...current, inventory: id ? current.inventory.map((row) => row.id === id ? saved : row) : [...current.inventory, saved] }))
      void persist('inventory', saved, markWriteError, markWriteSuccess)
    },
    adjustStock: (id, amount) => {
      const inventory = data.inventory.map((item) => item.id === id ? { ...item, quantity: Math.max(0, item.quantity + amount), movements: [...(item.movements ?? []), { id: makeId(), kind: amount > 0 ? 'Entrada' as const : 'Baixa' as const, quantity: Math.abs(amount), occurredAt: new Date().toISOString() }] } : item)
      const saved = inventory.find((item) => item.id === id)
      setData((current) => ({ ...current, inventory }))
      if (saved) void persist('inventory', saved, markWriteError, markWriteSuccess)
    },
    saveProject: (project, id) => {
      const saved = { ...project, id: id ?? makeId() }
      setData((current) => ({ ...current, projects: id ? current.projects.map((item) => item.id === id ? saved : item) : [...current.projects, saved] }))
      void persist('projects', saved, markWriteError, markWriteSuccess)
    },
  }), [data, persistenceStatus, persistenceMessage])
  function markWriteError() {
    setPersistenceStatus('error')
    setPersistenceMessage('Um registro não chegou ao PostgreSQL. Ele permanece neste navegador; tente salvar novamente quando a conexão voltar.')
  }
  function markWriteSuccess() {
    setPersistenceStatus('connected')
    setPersistenceMessage('Alterações salvas no PostgreSQL.')
  }
  return <Context.Provider value={value}>{children}</Context.Provider>
}

async function writeRemote(kind: string, record: { id: string }) {
  await apiFetch(`/api/v1/operations/${kind}/${record.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record),
  })
}

async function persist(kind: string, record: { id: string }, onError: () => void, onSuccess: () => void) {
  if (!isPostgresEnabled()) return
  try {
    await writeRemote(kind, record)
    onSuccess()
  } catch {
    onError()
  }
}

export function useOperations() {
  const context = useContext(Context)
  if (!context) throw new Error('Operation data must be used inside DemoDataProvider.')
  return context
}
