import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../lib/http'
import { useOperations } from '../features/operations/DemoDataProvider'
import type { RecurringReservationInput, Reservation } from '../features/arena/types'
import { Breadcrumb, Field, Feedback, Group, Heading, NoAccess, Notes, SaveRow, displayDate, today, useFilters, validDate } from './arenaUi'

export function recurringDates(startDate: string, weeks: number) {
  if (!validDate(startDate) || !Number.isInteger(weeks) || weeks < 1 || weeks > 12) return []
  const start = new Date(`${startDate}T12:00:00Z`)
  return Array.from({ length: weeks }, (_, index) => {
    const date = new Date(start); date.setUTCDate(start.getUTCDate() + index * 7)
    return date.toISOString().slice(0, 10)
  })
}

export function RecurringReservationsPage() {
  const data = useOperations(); const filters = useFilters(); const navigate = useNavigate()
  const operationId = useRef(crypto.randomUUID()); const locked = useRef(false)
  const retry = useRef<RecurringReservationInput | null>(null)
  const [busy, setBusy] = useState(false); const [uncertain, setUncertain] = useState(false); const [error, setError] = useState('')
  const [form, setForm] = useState<Omit<RecurringReservationInput, 'operationId'>>(() => ({
    groupTitle: '', courtId: data.courts.length === 1 ? data.courts[0].id : filters.params.get('court') ?? '', startDate: filters.params.get('date') ?? today(),
    startTime: '18:00', endTime: '19:00', weeks: 4, customerName: '', phone: '', amount: 0, notes: '',
  }))
  useEffect(() => { if (data.courts.length === 1 && !form.courtId) setForm(current => ({ ...current, courtId: data.courts[0].id })) }, [data.courts, form.courtId])
  const dates = recurringDates(form.startDate, form.weeks)
  if (!data.canRead('reservations') || !data.canWrite('reservations')) return <NoAccess />

  async function submit(event: FormEvent) {
    event.preventDefault(); if (locked.current) return
    if (!retry.current && (!form.groupTitle.trim() || !form.courtId || !dates.length || !/^\d{2}:\d{2}$/.test(form.startTime) || !/^\d{2}:\d{2}$/.test(form.endTime) || form.startTime >= form.endTime)) {
      setError('Informe o nome do grupo, a quadra, uma data válida, de 1 a 12 semanas e o horário de início e término.'); return
    }
    retry.current ??= { ...form, groupTitle: form.groupTitle.trim(), operationId: operationId.current }
    locked.current = true; setBusy(true); setError('')
    try {
      const result = await data.saveRecurringReservations(retry.current)
      const occurrences = result.reservations.map(item => item.date).sort()
      const params = new URLSearchParams({ view: 'list', group: result.groupId, court: form.courtId, from: occurrences[0] ?? form.startDate, to: occurrences.at(-1) ?? form.startDate })
      navigate(`/agenda?${params}`)
    } catch (cause) {
      const rejected = data.persistenceStatus === 'local' || cause instanceof ApiError && [400, 403, 409, 422].includes(cause.status)
      setUncertain(!rejected)
      const detail = cause instanceof Error ? cause.message : 'Não foi possível confirmar o grupo.'
      setError(rejected ? detail : `${detail} O resultado ainda não foi confirmado. Repita este envio antes de criar outro grupo.`)
      if (rejected) { retry.current = null; operationId.current = crypto.randomUUID() }
    } finally { locked.current = false; setBusy(false) }
  }

  const disabled = busy || uncertain
  return <main className="operation-page arena-page">
    <Breadcrumb to={filters.href('/agenda')} label="Agenda e recepção" />
    <Heading title="Reservas semanais" description="Reserve o mesmo horário para um grupo, uma vez por semana. Cada ocorrência terá sua própria ficha, com acesso ao registro de cobrança." />
    <Feedback />
    {error && <p className="arena-message arena-error" role="alert">{error}</p>}
    <form className="operation-card operation-form" onSubmit={submit}>
      <fieldset className="arena-input-lock" disabled={disabled}>
        <Group title="1. Grupo e período">
          <Field label="Nome do grupo de reservas" required value={form.groupTitle} onChange={groupTitle => setForm({ ...form, groupTitle })} />
          {data.courts.length !== 1 && <Field label="Quadra" required value={form.courtId} onChange={courtId => setForm({ ...form, courtId })} options={[{ value: '', label: 'Escolha a quadra' }, ...data.courts.filter(item => item.status === 'Disponível').map(item => ({ value: item.id, label: item.name }))]} />}
          <Field label="Primeira reserva" required type="date" value={form.startDate} onChange={startDate => setForm({ ...form, startDate })} />
          <Field label="Número de semanas" required type="number" min={1} max={12} step="1" value={form.weeks} onChange={weeks => setForm({ ...form, weeks: Number(weeks) })} />
        </Group>
        <Group title="2. Horário semanal">
          <Field label="Começa às" required type="time" value={form.startTime} onChange={startTime => setForm({ ...form, startTime })} />
          <Field label="Termina às" required type="end-time" placeholder="HH:mm ou 24:00" value={form.endTime} onChange={endTime => setForm({ ...form, endTime })} />
        </Group>
        <details className="arena-extra-fields"><summary>Cliente, valor e observações (opcionais)</summary><div className="field-grid">
          <Field label="Nome do cliente ou responsável" value={form.customerName} onChange={customerName => setForm({ ...form, customerName })} />
          <Field label="Telefone" type="tel" value={form.phone} onChange={phone => setForm({ ...form, phone })} />
          {data.canWrite('financeEntries') && <Field label="Valor por ocorrência (R$)" type="number" min={0} value={form.amount} onChange={amount => setForm({ ...form, amount: Number(amount) })} />}
          <Notes value={form.notes} onChange={notes => setForm({ ...form, notes })} />
        </div></details>
      </fieldset>
      {dates.length > 0 && <section className="arena-recurring-preview" aria-label="Conferir ocorrências"><h2>{dates.length} {dates.length === 1 ? 'reserva' : 'reservas'} · {form.startTime}–{form.endTime}</h2><p>De {displayDate(dates[0])} a {displayDate(dates.at(-1))}, sempre no mesmo dia da semana.</p><ol>{dates.map(date => <li key={date}>{displayDate(date)}</li>)}</ol></section>}
      <p className="arena-hint">Todos os horários serão conferidos, incluindo aulas e bloqueios. Se um horário estiver ocupado, o grupo inteiro será recusado. O valor combinado não comprova pagamento.</p>
      <SaveRow label={uncertain ? 'Repetir confirmação do grupo' : 'Criar reservas semanais'} busy={busy} disabled={!data.courts.length || data.persistenceStatus === 'connecting'} onCancel={uncertain ? undefined : () => navigate(filters.href('/agenda'))} />
      {uncertain && <p className="arena-hint" role="status">Os dados deste envio estão preservados nesta tela. A repetição usa o mesmo identificador e não cria ocorrências duplicadas.</p>}
    </form>
    {!data.courts.length && <p className="arena-message">Cadastre uma quadra disponível antes de criar o grupo. <Link to="/quadras">Ver quadras →</Link></p>}
  </main>
}

export function ReservationGroupDetails({ reservation }: { reservation: Reservation }) {
  const data = useOperations(); const filters = useFilters()
  if (!reservation.groupId) return null
  const rows = data.reservations.filter(item => item.groupId === reservation.groupId).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
  const groupLink = filters.href('/agenda', { view: 'list', group: reservation.groupId, from: rows[0]?.date ?? reservation.date, to: rows.at(-1)?.date ?? reservation.date, q: '', status: '', page: '', activity: '', date: '' })
  return <section className="operation-card"><h2>Grupo semanal · {reservation.groupTitle}</h2>
    <p className="arena-hint">Ocorrência {reservation.occurrenceIndex} de {rows.length}. Alterar ou cancelar esta reserva afeta somente esta ocorrência.</p>
    <div className="arena-slots">{rows.map(item => <Link className="arena-slot" key={item.id} to={filters.href(`/agenda/${item.id}`)} aria-label={`${displayDate(item.date)} · ${item.startTime}–${item.endTime} · ocorrência ${item.occurrenceIndex} · ${item.status}`} aria-current={item.id === reservation.id ? 'page' : undefined}><strong>{displayDate(item.date)}</strong><span>{item.startTime}–{item.endTime} · ocorrência {item.occurrenceIndex}</span><span>{item.status}</span></Link>)}</div>
    <div className="arena-actions"><Link className="secondary-link" to={groupLink}>Ver todas as ocorrências na agenda →</Link></div>
  </section>
}
