import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { applyCommand, createInitialState, isPrototypeState, prototypeStorageKey, type PrototypeCommand } from './model'
import type { ActorId, PrototypeApi, PrototypeState, Result } from './types'

const Context = createContext<PrototypeApi | null>(null)
function load(): { state: PrototypeState; error: string } {
  try {
    const raw = window.localStorage.getItem(prototypeStorageKey)
    if (!raw) return { state: createInitialState(), error: '' }
    const candidate: unknown = JSON.parse(raw)
    if (isPrototypeState(candidate)) return { state: candidate, error: '' }
    return { state: createInitialState(), error: 'Os dados fictícios salvos estavam incompatíveis. A demonstração foi reiniciada com segurança.' }
  } catch {
    return { state: createInitialState(), error: 'Não foi possível recuperar a demonstração deste navegador. Os dados fictícios foram reiniciados.' }
  }
}

export function PrototypeProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(load)
  const [state, setState] = useState(initial.state)
  const [actorId, updateActor] = useState<ActorId>('marina')
  const [offline, updateOffline] = useState(false)
  const [storageError, setStorageError] = useState(initial.error)
  // Commands read these refs rather than a render snapshot, so two clicks in
  // the same React batch cannot both spend or deliver the same balance.
  const stateRef = useRef(state)
  const actorRef = useRef(actorId)
  const offlineRef = useRef(offline)
  useEffect(() => {
    // Save the fixture once so a client link opened in another tab starts from
    // exactly the same fictional account identifiers and expiration times.
    try { window.localStorage.setItem(prototypeStorageKey, JSON.stringify(stateRef.current)) }
    catch { setStorageError('Leitura disponível, mas este navegador não conseguiu guardar os dados fictícios.') }
    const synchronize = (event: StorageEvent) => {
      if (event.key !== prototypeStorageKey || event.storageArea && event.storageArea !== window.localStorage) return
      try {
        const next: unknown = event.newValue ? JSON.parse(event.newValue) : null
        if (!isPrototypeState(next)) {
          setStorageError('Os dados recebidos de outra aba estão inválidos. Esta tela preservou o estado e seus rascunhos; reinicie a demonstração se necessário.')
          return
        }
        stateRef.current = next
        setState(next)
        setStorageError('')
      } catch {
        setStorageError('Não foi possível ler a atualização de outra aba. Seu rascunho continua nesta tela.')
      }
    }
    window.addEventListener('storage', synchronize)
    return () => window.removeEventListener('storage', synchronize)
  }, [])
  function commit(next: PrototypeState) {
    stateRef.current = next
    setState(next)
    try {
      window.localStorage.setItem(prototypeStorageKey, JSON.stringify(next))
      setStorageError('')
    } catch {
      setStorageError('A demonstração continua nesta tela, mas o navegador não conseguiu salvar. Recarregar pode perder estas alterações fictícias.')
    }
  }
  function run<T>(command: PrototypeCommand, operationId: string): Result<T> {
    const transaction = applyCommand<T>(stateRef.current, actorRef.current, command, operationId, offlineRef.current)
    if (transaction.state !== stateRef.current) commit(transaction.state)
    return transaction.result
  }
  const api: PrototypeApi = {
    state, actorId, offline, storageError,
    setActorId: (id) => { if (id === 'marina' || id === 'rafael' || id === 'supervisor') { actorRef.current = id; updateActor(id) } },
    setOffline: (value) => { offlineRef.current = value; updateOffline(value) },
    reset: () => {
      // Restrict cleanup to this prototype. Real app sessions and local data
      // belong to their own storage contracts and must remain untouched.
      for (const name of ['sessionStorage', 'localStorage'] as const) {
        try {
          const storage = window[name]
          const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
          for (const key of keys) if (key && (key === 'longbeach-ux-sale-draft' || key.startsWith('longbeach-ux-payment') || key === 'longbeach-client-draft' || key.startsWith('longbeach-client-draft:'))) storage.removeItem(key)
        } catch { /* Reset remains usable in memory when browser storage fails. */ }
      }
      offlineRef.current = false; updateOffline(false); commit(createInitialState())
    },
    openAccount: (name, mode, operationId) => run({ type: 'openAccount', name, mode }, operationId),
    addItems: (accountId, items, deliver, operationId, accessId) => run({ type: 'addItems', accountId, items, deliver, accessId }, operationId),
    accept: (consumptionId, operationId) => run({ type: 'accept', consumptionId }, operationId),
    reject: (consumptionId, reason, operationId) => run({ type: 'reject', consumptionId, reason }, operationId),
    fulfill: (consumptionId, operationId) => run({ type: 'fulfill', consumptionId }, operationId),
    reverse: (consumptionId, reason, returnStock, operationId) => run({ type: 'reverse', consumptionId, reason, returnStock }, operationId),
    pay: (input, operationId) => run({ type: 'pay', input }, operationId),
    settlePix: (paymentId, approved, operationId) => run({ type: 'settlePix', paymentId, approved }, operationId),
    refund: (paymentId, amountCents, reason, operationId) => run({ type: 'refund', paymentId, amountCents, reason }, operationId),
    closeAccount: (accountId, operationId) => run({ type: 'closeAccount', accountId }, operationId),
    openCash: (openingCents, operationId) => run({ type: 'openCash', openingCents }, operationId),
    moveCash: (kind, amountCents, reason, operationId) => run({ type: 'moveCash', kind, amountCents, reason }, operationId),
    closeCash: (countedCents, reason, operationId, sessionId) => run({ type: 'closeCash', countedCents, reason, sessionId }, operationId),
  }
  return <Context.Provider value={api}>{children}</Context.Provider>
}

export function usePrototype(): PrototypeApi {
  const context = useContext(Context)
  if (!context) throw new Error('usePrototype deve ser usado dentro de PrototypeProvider.')
  return context
}
