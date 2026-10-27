import { useState } from 'react'
import { apiFetch } from '../../lib/http'

type GradeItem = { id: string; kind: string; name: string; sourceSheet: string; sourceRow: number; body: { weekDay?: number; startTime?: string; endTime?: string; capacity?: number; monthlyAmount?: number | null }; conflict: string | null }
type GradePreview = { batchId: string; sourceName: string; applied: boolean; canApply: boolean; confirmationToken: string; items: GradeItem[] }
const labels: Record<string, string> = { team: 'Professor', classes: 'Turma', enrollments: 'Matrícula' }
const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export function GradeImportReview({ batchId, sourceName, onApplied, kind = 'classes' }: { batchId: string; sourceName: string; kind?: 'classes' | 'rentals'; onApplied: () => Promise<void> }) {
  const rentals = kind === 'rentals'
  const endpoint = rentals ? 'rental-groups' : 'class-grade'
  const label = rentals ? 'grupos mensalistas' : 'grade de aulas'
  const [preview, setPreview] = useState<GradePreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function inspect() {
    setBusy(true); setError(''); setPreview(null)
    try { setPreview(await apiFetch<GradePreview>(`/api/v1/imports/${batchId}/${endpoint}`)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível conferir a grade.') }
    finally { setBusy(false) }
  }
  async function apply() {
    if (!preview?.canApply) return
    setBusy(true); setError('')
    try {
      setPreview(await apiFetch<GradePreview>(`/api/v1/imports/${batchId}/${endpoint}/apply`, { method: 'POST', body: JSON.stringify({ confirmationToken: preview.confirmationToken }) }))
      await onApplied()
    } catch (failure) { setPreview(null); setError(failure instanceof Error ? failure.message : 'Confira a grade novamente.') }
    finally { setBusy(false) }
  }
  return <div className="grade-import-review">
    <button type="button" disabled={busy} onClick={() => void inspect()} aria-label={`Conferir ${label}: ${sourceName}`}>Conferir {label}</button>
    {error && <p role="alert">{error}</p>}
    {preview && <section className="foundation-card" aria-label={`Conferência: ${label}`}>
      <h2>Conferir {label}</h2>
      {!rentals && <p>{preview.items.filter(item => item.kind === 'classes').length} turmas · {preview.items.filter(item => item.kind === 'enrollments').length} matrículas.</p>}
      {rentals ? <p>{preview.items.length} grupos. Integrantes, responsável, vencimento e quinto encontro podem ficar a confirmar. Após cadastrar, revise os encontros de cada mês. Esta importação não cria reservas, cobranças nem pagamentos.</p> : <p>A grade usa os alunos existentes. Valores ainda não informados ficam a combinar; esta importação não gera cobranças nem pagamentos.</p>}
      <div className="table-scroll"><table><thead><tr><th>Cadastro</th><th>Nome</th><th>Horário e acordo</th><th>Conferência</th></tr></thead><tbody>
        {preview.items.map(item => <tr key={item.id}><td>{rentals ? 'Mensalista' : labels[item.kind]}</td><td>{item.name}</td><td>{rentals ? `${days[item.body.weekDay!]} · ${item.body.startTime}–${item.body.endTime} · ${item.body.monthlyAmount == null ? 'A combinar' : item.body.monthlyAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês` : item.kind === 'classes' ? `${days[item.body.weekDay!]} · ${item.body.startTime}–${item.body.endTime} · ${item.body.capacity} vagas` : '—'}</td><td>{item.conflict ?? (preview.applied ? 'Aplicado' : 'Pronto para cadastrar')}</td></tr>)}
      </tbody></table></div>
      {preview.applied ? <p role="status">{rentals ? 'Grupos cadastrados em Mensalistas.' : 'Grade aplicada à Escola e à Agenda.'}</p> : <button className="button-primary" type="button" disabled={busy || !preview.canApply} onClick={() => void apply()}>{rentals ? 'Aplicar grupos conferidos' : 'Aplicar grade conferida'}</button>}
    </section>}
  </div>
}
