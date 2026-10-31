import { useEffect, useRef, useState, type FormEvent } from 'react'
import '../bar/stock-clean.css'
import { EditorPanel, useUnsavedChanges } from '../../components/managementUi'
import { Field, SaveRow } from '../../pages/arenaUi'
import { useOperations, type InventoryItem } from './DemoDataProvider'
import { materialKinds, materialQuantity, parseMaterialQuantity, validMaterialQuantity, type MaterialHistory, type MaterialMovementInput, type MaterialSnapshot } from './materialStock'

function snapshotOf(item: MaterialSnapshot): MaterialSnapshot {
  return { name: item.name, quantity: item.quantity, version: item.version ?? 0, unit: item.unit ?? '', location: item.location ?? '', nature: item.nature ?? 'Unclassified' }
}

export function MaterialStockPanel({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const data = useOperations()
  const initial = data.materialAttempt(item.id)
  const [snapshot, setSnapshot] = useState(() => snapshotOf(initial?.snapshot ?? item))
  const [kind, setKind] = useState<MaterialMovementInput['kind']>(initial?.input.kind ?? 'Receipt')
  const [amount, setAmount] = useState(initial ? String(initial.input.quantity) : '')
  const [reason, setReason] = useState(initial?.input.reason ?? '')
  const [destination, setDestination] = useState(initial?.input.destination ?? '')
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const mounted = useRef(false)
  const { markSaved } = useUnsavedChanges()
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const attempt = data.materialAttempt(item.id)
  const busy = refreshing || attempt?.status === 'sending'
  const uncertain = attempt?.status === 'uncertain'
  const stale = attempt?.status === 'conflict'
  const confirmed = attempt?.status === 'confirmed'
  const value = parseMaterialQuantity(amount)
  const after = value === null ? null : Math.round((kind === 'Count' ? value : snapshot.quantity + (kind === 'Receipt' ? value : -value)) * 1000) / 1000
  const valid = value !== null && (kind === 'Count' || value > 0)
    && after !== null && validMaterialQuantity(after) && after !== snapshot.quantity
    && Number.isInteger(snapshot.version) && reason.trim().length > 0 && reason.trim().length <= 500
    && destination.trim().length > 0 && destination.trim().length <= 160
    && snapshot.location.trim().length > 0 && snapshot.unit.trim().length > 0
  const frozen = busy || uncertain || stale || confirmed

  function close() {
    data.acknowledgeMaterialMovement(item.id)
    onClose()
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (locked.current || busy || stale || confirmed || (!attempt && !valid) || !data.canMoveMaterials) return
    locked.current = true; setError('')
    const input = attempt?.input ?? {
      operationId: crypto.randomUUID(), expectedVersion: snapshot.version!, kind, quantity: value!,
      reason: reason.trim(), destination: destination.trim(),
    }
    try {
      await data.moveMaterial(item.id, input, snapshot)
      if (mounted.current) { markSaved(); close() }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar a movimentação.')
    } finally { locked.current = false }
  }
  async function refresh() {
    if (locked.current || busy) return
    locked.current = true; setRefreshing(true); setError('')
    try {
      const fresh = await data.refreshMaterial(item.id)
      if (mounted.current) { setSnapshot(snapshotOf(fresh)); setAmount(''); setKind('Receipt') }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o saldo. Tente novamente.')
    } finally {
      locked.current = false
      if (mounted.current) setRefreshing(false)
    }
  }

  return <EditorPanel title={`Movimentar ${snapshot.name}`} className="stock-clean" busy={busy} onClose={close}>
    <p>Saldo conferido: <strong>{materialQuantity(snapshot.quantity)} {snapshot.unit}</strong> · {snapshot.location || 'Informe o local no cadastro'}</p>
    {error && <p role="alert">{error}</p>}
    {!data.canMoveMaterials ? <p role="alert">Movimentações exigem uma sessão individual com acesso ao estoque.</p>
      : confirmed ? <><p role="status">Esta movimentação já foi confirmada. O saldo atual está na ficha do material.</p><button type="button" onClick={close}>Concluir</button></>
        : stale ? <><p role="status">O saldo mudou. Atualize e confira a quantidade antes de iniciar outra solicitação.</p><button type="button" disabled={busy} onClick={() => void refresh()}>{refreshing ? 'Atualizando saldo…' : 'Atualizar saldo e refazer'}</button></>
          : <form className="operation-form" onSubmit={submit}>
            {uncertain && <p role="status">A confirmação não chegou. Confira a mesma solicitação para evitar duplicação. Se fechar esta janela, ela continuará pendente ao retornar.</p>}
            {attempt?.status === 'sending' && <p role="status">Aguardando a confirmação desta movimentação…</p>}
            <fieldset disabled={frozen} className="arena-form-group" aria-label="Movimentação de material"><div className="field-grid">
              <Field label="Tipo de movimentação" value={kind} onChange={next => setKind(next as MaterialMovementInput['kind'])} options={Object.entries(materialKinds).filter(([key]) => (key !== 'Count' || data.canAdjustMaterials) && (key !== 'Consumption' || snapshot.nature === 'Consumable')).map(([key, label]) => ({ value: key, label }))} />
              <label className="operation-field">{kind === 'Count' ? `Quantidade contada (${snapshot.unit})` : `Quantidade (${snapshot.unit})`}<input required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} aria-invalid={amount !== '' && value === null} /></label>
              <label className="operation-field">Motivo ou documento de referência<input required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
              <label className="operation-field">Área ou responsável pelo destino<input required maxLength={160} value={destination} onChange={event => setDestination(event.target.value)} /></label>
            </div></fieldset>
            {amount !== '' && after !== null && <p>Saldo após a confirmação: <strong>{materialQuantity(after)} {snapshot.unit}</strong></p>}
            {amount !== '' && value === null && <p role="alert">Informe uma quantidade positiva ou zero, com até três casas decimais.</p>}
            {!snapshot.location && <p role="alert">Informe onde o material fica guardado antes de movimentar.</p>}
            {!snapshot.unit && <p role="alert">Este cadastro antigo não informa a unidade. Confira a ficha antes de movimentar.</p>}
            {!Number.isInteger(snapshot.version) && <p role="alert">Atualize a ficha para conferir a versão atual do material.</p>}
            <SaveRow busy={busy} disabled={(!uncertain && !valid) || !data.canMoveMaterials} label={uncertain ? 'Conferir mesma solicitação' : 'Confirmar movimentação'} />
          </form>}
  </EditorPanel>
}

export function MaterialStockHistory({ item }: { item: InventoryItem }) {
  const { materialHistory } = useOperations()
  const [page, setPage] = useState(1)
  const [history, setHistory] = useState<MaterialHistory | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setHistory(null); setError('')
    void materialHistory(item.id, page).then(
      result => { if (active) setHistory(result) },
      cause => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível ler o histórico.') },
    )
    return () => { active = false }
  }, [materialHistory, item.id, item.version, page, revision])
  return <section className="operation-card stock-clean"><h2>Movimentações confirmadas</h2>
    {error ? <p role="alert">{error} <button type="button" onClick={() => setRevision(current => current + 1)}>Tentar novamente</button></p> : !history ? <p role="status">Carregando movimentações…</p> : <>
      {!history.total && <p>Nenhuma movimentação registrada. Saldo anterior preservado.</p>}
      <div className="movement-list">{history.items.map(row => <article key={row.id} className="operation-card">
        <strong>{materialKinds[row.kind]} · {materialQuantity(row.quantity)} {row.unit}</strong>
        <p>{materialQuantity(row.before)} → {materialQuantity(row.after)} {row.unit} · {row.location}</p>
        <p>{row.reason} · Destino: {row.destination}</p>
        <small>{new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.occurredAt))} · {row.actorName || 'Operador não informado'}</small>
      </article>)}</div>
      {history.total > 50 && <nav aria-label="Páginas do histórico de materiais"><button type="button" disabled={page <= 1} onClick={() => setPage(current => current - 1)}>Anterior</button><span> Página {page} </span><button type="button" disabled={page * 50 >= history.total} onClick={() => setPage(current => current + 1)}>Próxima</button></nav>}
    </>}
  </section>
}
