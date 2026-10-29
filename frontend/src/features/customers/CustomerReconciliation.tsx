import { useEffect, useRef, useState } from 'react'
import { EditorPanel, useUnsavedChanges } from '../../components/managementUi'
import { DetailList } from '../../pages/arenaUi'
import { hasPermission, isManagement } from '../auth/access'
import { useAuth } from '../auth/authContext'
import { backfillCustomers, customerReference, mergeCustomers, previewCustomerBackfill, previewCustomerMerge, undoCustomerMerge, useCustomerCandidates, useCustomerCommand, useCustomerDuplicates, useCustomerMergeHistory, type Customer, type CustomerBackfillPreview, type CustomerBackfillResult, type CustomerMergeHistory, type CustomerMergeInput, type CustomerMergePreview, type CustomerMergeResult } from './api'

type ReviewedMerge = CustomerMergeResult & Partial<Pick<CustomerMergeHistory, 'sourceName' | 'targetName'>>
function CustomerReference({ customer }: { customer: Customer }) {
  const profiles = customer.profiles.filter(value => ['Aluno', 'Mensalista', 'Bar'].includes(value))
  return <small className="customer-reference">{customerReference(customer.id)} · {profiles.length ? `Vínculos: ${profiles.join(' · ')}` : 'Sem vínculo informado'}</small>
}
function storedReceipt(key: string): ReviewedMerge | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null') as ReviewedMerge | null
    return value && [value.mergeId, value.customerId, value.aliasId].every(id => typeof id === 'string' && id.length > 0) && Number.isInteger(value.sourceVersion) && Number.isInteger(value.targetVersion) && typeof value.undone === 'boolean' && (value.sourceName === undefined || typeof value.sourceName === 'string') && (value.targetName === undefined || typeof value.targetName === 'string') ? value : null
  } catch { return null }
}

export function CustomerReconciliation({ customer }: { customer?: Customer }) {
  const { user } = useAuth()
  if (!isManagement(user) || !hasPermission(user, 'customers:merge')) return null
  // Session-bound state never survives a change of operator or permission set.
  return <Reconciliation key={`${user!.id}:${[...user!.permissions].sort().join(',')}`} customer={customer} actorId={user!.id} />
}
function Reconciliation({ customer, actorId }: { customer?: Customer; actorId: string }) {
  const [mode, setMode] = useState<'merge' | 'backfill' | 'undo' | ''>('')
  const [busy, setBusy] = useState(false)
  const key = `lb-customer-merge-receipt-v1:${actorId}`
  const [receipt, setReceipt] = useState(() => storedReceipt(key))
  const [undo, setUndo] = useState<ReviewedMerge | null>(null)
  const [historyVisible, setHistoryVisible] = useState(false)
  const history = useCustomerMergeHistory(customer?.id ?? '', historyVisible)
  const [storageWarning, setStorageWarning] = useState(false)
  const { markSaved } = useUnsavedChanges()
  const confirmed = (result: ReviewedMerge) => {
    setReceipt(result)
    try { sessionStorage.setItem(key, JSON.stringify(result)) } catch { setStorageWarning(true) }
    markSaved(); setBusy(false); setMode(''); setUndo(null)
  }
  return <section className="operation-card customer-reconciliation">
    <h2>Revisão do cadastro</h2><p>Sem união automática por nome ou telefone. A gestão confere as pessoas, os vínculos e o cadastro que será mantido.</p>
    <div className="customer-detail-actions"><button type="button" className="secondary-link" disabled={busy} onClick={() => setMode('merge')}>Revisar duplicados e unificar</button>{!customer && <button type="button" className="secondary-link" disabled={busy} onClick={() => setMode('backfill')}>Conferir cadastros antigos</button>}</div>
    {receipt && (!customer || receipt.customerId === customer.id || receipt.aliasId === customer.id) && <div className="customer-merge-review" role="status"><p>{receipt.undone ? 'A última unificação foi desfeita.' : 'Unificação confirmada. O histórico original foi preservado.'}</p>{receipt.sourceName && receipt.targetName && <p>{receipt.sourceName} · {customerReference(receipt.aliasId)} → {receipt.targetName} · {customerReference(receipt.customerId)}</p>}{!receipt.undone && typeof receipt.sourceName === 'string' && typeof receipt.targetName === 'string' ? <button type="button" className="secondary-link" disabled={busy} onClick={() => { setUndo(receipt); setMode('undo') }}>Revisar retorno da última unificação</button> : !receipt.undone && <p>Consulte o histórico na ficha do cadastro mantido para conferir os nomes e revisar o retorno.</p>}</div>}
    {customer && <section><h3>Histórico de unificações</h3><p>Disponível nesta ficha após recarregar. Cada retorno exige nova conferência das versões atuais.</p><button type="button" className="secondary-link" disabled={busy || history.isFetching} onClick={() => { if (historyVisible) void history.refetch(); else setHistoryVisible(true) }}>{historyVisible ? 'Atualizar histórico de unificações' : 'Consultar histórico de unificações'}</button>{historyVisible && <>{history.isFetching && <p role="status">Consultando histórico…</p>}{history.isError ? <p role="alert">Não foi possível consultar o histórico. Tente atualizar antes de desfazer.</p> : history.data && <>{history.data.map(item => <article className="customer-merge-review" key={item.mergeId}><p><strong>{item.sourceName}</strong> · {customerReference(item.aliasId)} → <strong>{item.targetName}</strong> · {customerReference(item.customerId)}</p><p>{item.undone ? 'Unificação desfeita' : 'Unificação confirmada'}</p>{!item.undone && <button type="button" className="secondary-link" disabled={busy || history.isFetching} onClick={() => { setUndo(item); setMode('undo') }}>Revisar retorno de {item.sourceName} · {customerReference(item.aliasId)}</button>}</article>)}{!history.data.length && <p>Nenhuma unificação registrada nesta família de cadastros.</p>}</>}</>}</section>}
    {storageWarning && <p role="alert">O navegador não conseguiu guardar o comprovante desta revisão. Consulte o histórico na ficha do cliente para recuperar o retorno.</p>}
    {mode && <EditorPanel title={mode === 'merge' ? 'Conferir unificação' : mode === 'undo' ? 'Desfazer unificação' : 'Conferir cadastros antigos'} busy={busy} onClose={() => setMode('')}>
      {mode === 'merge' ? <MergeReview customer={customer} busyChanged={setBusy} confirmed={confirmed} /> : mode === 'undo' && undo ? <UndoReview receipt={undo} busyChanged={setBusy} confirmed={confirmed} /> : <BackfillReview busyChanged={setBusy} />}
    </EditorPanel>}
  </section>
}

function CustomerChoice({ label, value, excludeId, changed, disabled }: { label: string; value: Customer | null; excludeId?: string; changed: (value: Customer | null) => void; disabled: boolean }) {
  const [search, setSearch] = useState('')
  const query = useCustomerCandidates(search.trim(), !value && !disabled)
  const candidates = query.data?.items.filter(person => person.id !== excludeId) ?? []
  return <fieldset disabled={disabled} className="customer-picker"><legend>{label}</legend>{value ? <><strong>{value.name}</strong><p>{value.phone || 'Telefone pendente'} · {value.email || 'Sem e-mail de contato'}</p><CustomerReference customer={value} /><button className="text-button" type="button" onClick={() => { changed(null); setSearch('') }}>Escolher outra pessoa</button></> : <>
    <label className="operation-field">{`Buscar ${label.toLocaleLowerCase('pt-BR')}`}<input type="search" maxLength={240} placeholder="Nome ou telefone, ao menos 3 caracteres" value={search} onChange={event => setSearch(event.target.value)} /></label>
    {search.trim().length >= 3 && <>{query.isFetching && <p role="status">Buscando…</p>}{query.isError ? <p role="alert">Não foi possível buscar. <button type="button" onClick={() => void query.refetch()}>Tentar novamente</button></p> : query.data && <div className="customer-search-results">{candidates.map(person => <button key={person.id} type="button" className="customer-option" onClick={() => changed(person)}><span>{person.name} · {person.phone || 'Telefone pendente'}</span><CustomerReference customer={person} /></button>)}{!candidates.length && <p>Nenhum outro cadastro encontrado.</p>}</div>}</>}
  </>}</fieldset>
}

function MergeReview({ customer, busyChanged, confirmed }: { customer?: Customer; busyChanged: (busy: boolean) => void; confirmed: (result: ReviewedMerge) => void }) {
  const duplicates = useCustomerDuplicates(true)
  const [source, setSource] = useState<Customer | null>(customer ?? null)
  const [target, setTarget] = useState<Customer | null>(null)
  const [preview, setPreview] = useState<CustomerMergePreview | null>(null)
  const [reason, setReason] = useState('')
  const [checked, setChecked] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const command = useCustomerCommand()
  const attempt = useRef<CustomerMergeInput | null>(null)
  useEffect(() => { busyChanged(command.busy || uncertain) }, [command.busy, uncertain, busyChanged])
  const change = (setter: (value: Customer | null) => void, value: Customer | null) => { setter(value); setPreview(null); setChecked(false); attempt.current = null }
  async function inspect() {
    if (!source || !target || source.id === target.id) return
    setPreview(null); setChecked(false); attempt.current = null
    const value = await command.run(() => previewCustomerMerge(source.id, target.id))
    if (value) setPreview(value)
  }
  async function apply() {
    if (!preview?.canMerge || !checked || !reason.trim()) return
    const input = attempt.current ?? { operationId: crypto.randomUUID(), sourceId: preview.sourceId, targetId: preview.targetId, sourceVersion: preview.sourceVersion, targetVersion: preview.targetVersion, previewToken: preview.previewToken, reason: reason.trim() }
    attempt.current = input
    const result = await command.run(() => mergeCustomers(input))
    if (result) confirmed({ ...result, sourceName: source!.name, targetName: target!.name })
    else if ([400, 403, 409, 422].includes(command.failureStatus())) { setUncertain(false); setPreview(null); setChecked(false); attempt.current = null }
    else setUncertain(true)
  }
  return <div className="customer-editor">
    <p>Os dados de contato do destino serão mantidos. Matrículas, presenças, comandas e pagamentos anteriores conservam seus registros. Contas de acesso distintas bloqueiam a unificação.</p>
    <p className="arena-hint">A referência curta diferencia fichas com o mesmo nome e telefone. Os vínculos mostrados são os já cadastrados, independentemente de onde a ficha começou.</p>
    {!uncertain && <details><summary>Possíveis duplicados para conferência</summary>{duplicates.isFetching && <p role="status">Consultando possíveis duplicados…</p>}{duplicates.isError ? <p role="alert">Não foi possível consultar as sugestões.</p> : duplicates.data && <>{duplicates.data.map(pair => <article className="customer-merge-review" key={pair.first.id + ':' + pair.second.id}><p><strong>{pair.first.name}</strong> · {pair.first.phone || 'Telefone pendente'}<CustomerReference customer={pair.first} /></p><p><strong>{pair.second.name}</strong> · {pair.second.phone || 'Telefone pendente'}<CustomerReference customer={pair.second} /></p><p>{pair.reasons.join(' · ')}</p><button type="button" className="secondary-link" disabled={command.busy || pair.first.id === pair.second.id} onClick={() => { setSource(pair.first); setTarget(pair.second); setPreview(null); setChecked(false); attempt.current = null }}>Conferir estas duas pessoas</button></article>)}{!duplicates.data.length && <p>Nenhuma sugestão. Ainda é possível escolher dois cadastros para revisão manual.</p>}</>}</details>}
    <CustomerChoice label="Cadastro de origem" value={source} excludeId={target?.id} changed={value => change(setSource, value)} disabled={command.busy || uncertain} />
    <CustomerChoice label="Cadastro a manter" value={target} excludeId={source?.id} changed={value => change(setTarget, value)} disabled={command.busy || uncertain} />
    {!uncertain && <button type="button" className="secondary-link" disabled={command.busy || !source || !target || source.id === target.id} onClick={() => void inspect()}>Conferir impacto da unificação</button>}
    {preview && <section className="customer-merge-review"><h3>Conferência do impacto</h3><DetailList items={[["Cadastro de origem", `${source?.name} · ${customerReference(preview.sourceId)}`], ["Cadastro a manter", `${target?.name} · ${customerReference(preview.targetId)}`], ["Vínculos da origem", preview.sourceLinks], ["Vínculos do destino", preview.targetLinks]]} />{preview.warnings.map((warning, index) => <p key={index}>{warning}</p>)}{!preview.canMerge ? <p role="alert">Unificação bloqueada. Confira os cadastros indicados.</p> : <>
      <label className="operation-field">Motivo da unificação<textarea required maxLength={500} disabled={command.busy || uncertain} value={reason} onChange={event => { setReason(event.target.value); setChecked(false); attempt.current = null }} /></label>
      <label className="rental-checkbox"><input type="checkbox" disabled={command.busy || uncertain} checked={checked} onChange={event => setChecked(event.target.checked)} />Conferi que é a mesma pessoa e quero manter {target?.name} · {customerReference(preview.targetId)}.</label>
      <button type="button" className="primary-button" disabled={command.busy || !checked || !reason.trim()} onClick={() => void apply()}>{uncertain ? 'Conferir a mesma unificação' : command.busy ? 'Confirmando…' : 'Confirmar unificação'}</button>
    </>}</section>}
    {uncertain && <p role="status">O resultado ainda não foi confirmado. Mantenha esta revisão aberta e confira a mesma operação; os dados estão preservados.</p>}
    {command.error && <p role="alert">{command.error}{command.conflict && ' Faça uma nova conferência; nenhum resultado foi presumido.'}</p>}
  </div>
}

function UndoReview({ receipt, busyChanged, confirmed }: { receipt: ReviewedMerge; busyChanged: (busy: boolean) => void; confirmed: (result: ReviewedMerge) => void }) {
  const [checked, setChecked] = useState(false)
  const command = useCustomerCommand()
  const operation = useRef(crypto.randomUUID())
  useEffect(() => { busyChanged(command.busy) }, [command.busy, busyChanged])
  return <div className="customer-editor">{receipt.sourceName && receipt.targetName && <h3>Restaurar {receipt.sourceName} separado de {receipt.targetName}</h3>}<p>Origem: {customerReference(receipt.aliasId)} · Cadastro mantido: {customerReference(receipt.customerId)}</p><p>O retorno usa o comprovante da unificação confirmada. Se os cadastros ou os vínculos mudaram, o sistema interrompe a operação para nova revisão.</p><p>Este retorno preserva o histórico operacional e não altera acessos ao portal nem cobranças.</p><label className="rental-checkbox"><input type="checkbox" disabled={command.busy} checked={checked} onChange={event => setChecked(event.target.checked)} />Conferi a unificação indicada e quero desfazê-la, preservando o histórico.</label><button type="button" className="primary-button" disabled={!checked || command.busy || command.conflict} onClick={async () => { const value = await command.run(() => undoCustomerMerge(receipt, operation.current)); if (value) confirmed({ ...value, sourceName: receipt.sourceName, targetName: receipt.targetName }) }}>Confirmar retorno da unificação</button>{command.error && <p role="alert">{command.error}</p>}</div>
}

const kindNames: Record<string, string> = { students: 'Alunos', rentalMembers: 'Integrantes mensalistas', reservations: 'Reservas', users: 'Contas de acesso', barTabs: 'Comandas', barSales: 'Vendas anteriores', tabs: 'Comandas', sales: 'Vendas anteriores' }
function BackfillReview({ busyChanged }: { busyChanged: (busy: boolean) => void }) {
  const [preview, setPreview] = useState<CustomerBackfillPreview | null>(null)
  const [result, setResult] = useState<CustomerBackfillResult | null>(null)
  const [checked, setChecked] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const operation = useRef(crypto.randomUUID())
  const command = useCustomerCommand()
  const { markSaved } = useUnsavedChanges()
  useEffect(() => { busyChanged(command.busy || uncertain) }, [command.busy, uncertain, busyChanged])
  return <div className="customer-editor"><p>Esta conferência identifica os cadastros antigos que ainda precisam de vínculo com Clientes. Dados existentes sem telefone continuam pendentes; pessoas parecidas não são unificadas automaticamente.</p>
    {!uncertain && !result && <button className="secondary-link" type="button" disabled={command.busy} onClick={async () => { setPreview(null); setChecked(false); const value = await command.run(previewCustomerBackfill); if (value) { setPreview(value); operation.current = crypto.randomUUID() } }}>Preparar conferência</button>}
    {preview && !result && <section className="customer-merge-review"><h3>Cadastros antigos a revisar</h3><DetailList items={[["Registros conferidos", preview.sources], ["Novos clientes previstos", preview.create], ["Já vinculados", preview.existing], ["Com contato incompleto", preview.incomplete]]} />{Object.entries(preview.byKind).map(([kind, count]) => <p key={kind}>{kindNames[kind] ?? 'Outros vínculos'}: {count}</p>)}
      {preview.conflicts.length > 0 ? <><p role="alert">Corrija as origens indicadas antes de aplicar. Nenhum dado inválido será inventado ou descartado.</p><ul>{preview.conflicts.map((conflict, index) => <li key={index}>{kindNames[conflict.kind] ?? 'Cadastro de origem'} · {conflict.reason}</li>)}</ul></> : <><label className="rental-checkbox"><input type="checkbox" disabled={command.busy || uncertain || preview.sources <= preview.existing} checked={checked} onChange={event => setChecked(event.target.checked)} />Conferi o resultado e autorizo criar os vínculos previstos, preservando os cadastros anteriores.</label><button type="button" className="primary-button" disabled={!checked || command.busy || preview.sources <= preview.existing} onClick={async () => {
        const value = await command.run(() => backfillCustomers(operation.current, preview.previewToken))
        if (value) { setResult(value); setUncertain(false); markSaved() }
        else if ([400, 403, 409, 422].includes(command.failureStatus())) { setUncertain(false); setPreview(null); setChecked(false) }
        else setUncertain(true)
      }}>{uncertain ? 'Conferir a mesma aplicação' : 'Aplicar vínculos conferidos'}</button>{preview.sources <= preview.existing && <p>Nenhum vínculo pendente nesta conferência.</p>}</>}
    </section>}
    {result && <p role="status">Concluído: {result.created} clientes criados e {result.linked} vínculos registrados em {result.sources} origens.</p>}
    {uncertain && <p role="status">A confirmação foi interrompida. Confira a mesma aplicação antes de fechar esta revisão.</p>}{command.error && <p role="alert">{command.error}</p>}
  </div>
}
