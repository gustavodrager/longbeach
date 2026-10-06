import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { apiFetch } from '../../lib/http'
import { Disclosure, EditorPanel, RecordTable, useUnsavedChanges } from '../../components/managementUi'
import { Field, Notes, SaveRow, today } from '../../pages/arenaUi'
import { centsMoney } from './FinancialHistory'

export type ControlLine = { id: string; label: string; direction: 'Receita' | 'Despesa'; category: 'Operação' | 'Fixa' | 'Variável' | 'Parcela' | 'Acerto'; costCenter: 'Arena' | 'Bar' | 'Escola' | 'Locações'; amountCents: number; basis: 'Informado' | 'Estimado'; source: string; sourceMonth: string | null }
export type MonthlyControl = { month: string; version: number; lines: ControlLine[]; notes: string; updatedAtUtc?: string }
type Report = { month: string; months: string[]; control: MonthlyControl | null }
const monthLabel = (month: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(month + '-01T12:00:00Z'))
export function controlTotals(lines: ControlLine[]) {
  const income = lines.filter(x => x.direction === 'Receita').reduce((s, x) => s + x.amountCents, 0)
  const expense = lines.filter(x => x.direction === 'Despesa').reduce((s, x) => s + x.amountCents, 0)
  const estimated = lines.filter(x => x.direction === 'Despesa' && x.basis === 'Estimado').reduce((s, x) => s + x.amountCents, 0)
  return { income, expense, result: income - expense, estimated, hasEstimates: lines.some(x => x.basis === 'Estimado') }
}
function ValueCards({ control }: { control: MonthlyControl }) {
  const total = controlTotals(control.lines)
  return <div className="arena-metric-grid">
    <article className="arena-metric"><span className="arena-metric-label">Receitas</span><strong>{centsMoney(total.income)}</strong><small>{monthLabel(control.month)}</small></article>
    <article className="arena-metric"><span className="arena-metric-label">Despesas{total.hasEstimates ? ' previstas' : ''}</span><strong>{centsMoney(total.expense)}</strong><small>{total.hasEstimates ? `${centsMoney(total.estimated)} em despesas estimadas` : 'Valores informados'}</small></article>
    <article className="arena-metric"><span className="arena-metric-label">Resultado{total.hasEstimates ? ' estimado' : ''}</span><strong>{centsMoney(total.result)}</strong><small>Receitas menos despesas</small></article>
  </div>
}
export function MonthlyControlPage() {
  const { user } = useAuth(); const owner = Boolean(user?.roles.includes('Owner'))
  const [params, setParams] = useSearchParams(); const cache = useQueryClient(); const guard = useUnsavedChanges()
  const selected = params.get('month'); const query = useQuery({ queryKey: ['monthly-control', user?.id, selected], queryFn: () => apiFetch<Report>(`/api/v1/financial-history/monthly-controls${selected ? `?month=${encodeURIComponent(selected)}` : ''}`), enabled: owner, refetchInterval: 60_000 })
  const [edit, setEdit] = useState<{ base: MonthlyControl; line: ControlLine } | null>(null)
  const [staged, setStaged] = useState<MonthlyControl | null>(null); const [source, setSource] = useState<ControlLine | null>(null)
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('')
  const control = query.data?.control; const month = query.data?.month ?? selected ?? today().slice(0, 7)
  const action = params.get('acao'); const recordId = params.get('registro'); const hydrated = useRef('')
  useEffect(() => {
    if (action !== 'editar' && action !== 'novo') { hydrated.current = ''; setEdit(null); return }
    const key = `${month}:${action}:${recordId}`
    if (!control || hydrated.current === key) return
    const line = action === 'editar' ? control.lines.find(item => item.id === recordId) : { id: recordId ?? crypto.randomUUID(), label: '', direction: 'Despesa', category: 'Fixa', costCenter: 'Arena', amountCents: 0, basis: 'Informado', source: '', sourceMonth: month } as ControlLine
    if (line) { hydrated.current = key; setEdit({ base: structuredClone(control), line: { ...line } }) }
  }, [action, recordId, control, month])
  const close = () => { setStaged(null); setError(''); const next = new URLSearchParams(params); next.delete('acao'); next.delete('registro'); setParams(next, { replace: true, preventScrollReset: true }) }
  const open = (line?: ControlLine) => {
    if (!control) return
    setError(''); setNotice('')
    const next = new URLSearchParams(params); next.set('acao', line ? 'editar' : 'novo'); next.set('registro', line?.id ?? crypto.randomUUID()); setParams(next, { preventScrollReset: true })
  }
  const save = async (next: MonthlyControl) => {
    setBusy(true); setError('')
    try {
      await apiFetch(`/api/v1/financial-history/monthly-controls/${next.month}`, { method: 'PUT', body: JSON.stringify({ version: next.version, lines: next.lines, notes: next.notes }) })
      guard.markSaved(); close(); setNotice('Controle atualizado.'); const search = new URLSearchParams({ month: next.month }); setParams(search, { replace: true })
      await Promise.all([cache.invalidateQueries({ queryKey: ['monthly-control'] }), cache.invalidateQueries({ queryKey: ['dashboard-balances'] })])
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar o controle.') } finally { setBusy(false) }
  }
  const importReview = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
    setError(''); setNotice('')
    try {
      if (file.size > 65536) throw new Error('A revisão deve ter até 64 KB.')
      const input = JSON.parse(await file.text()) as MonthlyControl
      if (!input || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.month) || !Number.isInteger(input.version) || !Array.isArray(input.lines) || !input.lines.length || input.lines.length > 100 || typeof input.notes !== 'string' || input.lines.some(line => !line || typeof line.id !== 'string' || typeof line.label !== 'string' || !['Receita', 'Despesa'].includes(line.direction) || !Number.isSafeInteger(line.amountCents) || line.amountCents < 0 || !['Informado', 'Estimado'].includes(line.basis) || typeof line.source !== 'string')) throw new Error('A revisão não contém um controle mensal válido.')
      setStaged(input)
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível ler a revisão.') }
  }
  if (!owner) return <main className="operation-page arena-page"><h1>Controle mensal</h1><p role="alert">Disponível apenas para os proprietários.</p></main>
  return <main className="operation-page arena-page">
    <header className="page-heading"><div><h1>Controle mensal</h1></div>{control && <button className="primary-button" onClick={() => open()}>Adicionar valor</button>}</header>
    <div className="compact-filters"><Field label="Competência" type="month" value={selected ?? month} onChange={value => { if (value) { setParams({ month: value }); setNotice('') } }} />{Boolean(query.data?.months.length) && <Field label="Meses registrados" value={month} onChange={value => setParams({ month: value })} options={[...new Set([month, ...query.data!.months])].sort().reverse().map(value => ({ value, label: monthLabel(value) }))} />}</div>
    {query.isPending && <p role="status">Carregando controle…</p>}{query.isError && <p role="alert">Não foi possível carregar. <button onClick={() => void query.refetch()}>Tentar novamente</button></p>}
    {error && !edit && !staged && <p role="alert" className="arena-message arena-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {control ? <><ValueCards control={control} />
      <p className="arena-hint">Valores estimados ficam identificados até a conferência.</p>
      <RecordTable label="Receitas e despesas do mês" columns={['Descrição', 'Área', 'Tipo', 'Valor', 'Base', 'Ações']} rows={control.lines.map(line => ({ key: line.id, cells: [line.label, line.costCenter, `${line.direction} · ${line.category}`, centsMoney(line.amountCents), line.basis === 'Estimado' ? `Estimativa · ${line.sourceMonth ? monthLabel(line.sourceMonth) : 'Referência pendente'}` : 'Informado', <span className="arena-record-actions"><button type="button" aria-label={`Editar ${line.label}`} onClick={() => open(line)}>Editar</button><button type="button" aria-label={`Ver origem de ${line.label}`} onClick={() => setSource(line)}>Origem</button></span>] }))} />
      <Disclosure title="Conferência do mês"><p className="detail-notes">{control.notes}</p><p>Atualizado: {control.updatedAtUtc ? new Date(control.updatedAtUtc).toLocaleString('pt-BR') : 'A confirmar'}</p><p>Este controle reúne o resultado mensal. Os pagamentos e saldos bancários mantêm seus registros de origem.</p></Disclosure>
    </> : !query.isPending && !query.isError && <p>Nenhum controle registrado nesta competência.</p>}
    <Disclosure title="Importar revisão"><label className="operation-field">Arquivo de revisão<input type="file" accept=".json,application/json" onChange={event => void importReview(event)} /></label><p className="arena-hint">Os valores são apresentados para conferência antes de salvar.</p></Disclosure>
    {source && <EditorPanel title="Origem do valor" onClose={() => setSource(null)}><h3>{source.label} · {centsMoney(source.amountCents)}</h3><p className="detail-notes">{source.source}</p></EditorPanel>}
    {edit && <EditorPanel title="Editar valor do mês" busy={busy} onClose={close}><LineForm key={edit.line.id} initial={edit.line} month={edit.base.month} busy={busy} error={error} cancel={close} submit={line => void save({ ...edit.base, lines: edit.base.lines.some(x => x.id === line.id) ? edit.base.lines.map(x => x.id === line.id ? line : x) : [...edit.base.lines, line] })} /></EditorPanel>}
    {staged && <EditorPanel title="Conferir revisão mensal" busy={busy} onClose={close}><p>{monthLabel(staged.month)} · {staged.lines.length} valores</p><ValueCards control={staged} />{error && <p role="alert">{error}</p>}<RecordTable label="Valores da revisão" columns={['Descrição','Valor','Base']} rows={staged.lines.map(line => ({ key: line.id, cells: [line.label, centsMoney(line.amountCents), line.basis] }))} /><Disclosure title="Origem e observações"><p className="detail-notes">{staged.notes}</p>{staged.lines.map(line => <p key={line.id}><strong>{line.label}:</strong> {line.source}</p>)}</Disclosure><form onSubmit={event => { event.preventDefault(); void save(staged) }}><SaveRow busy={busy} onCancel={close} label="Salvar controle mensal" /></form></EditorPanel>}
  </main>
}
function LineForm({ initial, month, busy, error, submit, cancel }: { initial: ControlLine; month: string; busy: boolean; error: string; submit: (line: ControlLine) => void; cancel: () => void }) {
  const [line, setLine] = useState(initial); const [amount, setAmount] = useState((initial.amountCents / 100).toFixed(2))
  const update = (key: keyof ControlLine, value: string | null) => setLine(current => ({ ...current, [key]: value }))
  const send = (event: FormEvent) => { event.preventDefault(); const numeric = Number(amount); if (Number.isFinite(numeric)) submit({ ...line, amountCents: Math.round(numeric * 100) }) }
  return <form onSubmit={send}>{error && <p role="alert">{error}</p>}<div className="field-grid">
    <Field label="Descrição" required value={line.label} onChange={v => update('label', v)} />
    <Field label="Valor (R$)" required type="number" min={0} step="0.01" value={amount} onChange={setAmount} />
    <Field label="Movimento" value={line.direction} onChange={v => update('direction', v)} options={['Receita', 'Despesa']} />
    <Field label="Tipo" value={line.category} onChange={v => update('category', v)} options={['Operação', 'Fixa', 'Variável', 'Parcela', 'Acerto']} />
    <Field label="Área" value={line.costCenter} onChange={v => update('costCenter', v)} options={['Arena', 'Bar', 'Escola', 'Locações']} />
    <Field label="Base do valor" value={line.basis} onChange={v => update('basis', v)} options={['Informado', 'Estimado']} />
    <Field label="Mês de referência" type="month" required={line.basis === 'Estimado'} value={line.sourceMonth ?? ''} onChange={v => update('sourceMonth', v || null)} />
    <Notes label="Origem e motivo da alteração" value={line.source} onChange={v => update('source', v)} />
  </div><p className="arena-hint">Competência: {monthLabel(month)}.</p><SaveRow busy={busy} onCancel={cancel} label="Salvar valor" /></form>
}
