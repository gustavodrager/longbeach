import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { centsMoney } from './FinancialHistory'

type Payments = { month: string; records: number; paidRecords: number; paidNames: number; paidAmountCents: number; unpaidRecords: number; otherRecords: number }
type Rentals = { payments: Payments; scheduleRecords: number; weeklyMinutes: number | null; invalidSchedules: number; schedule: { day: string; hours: string; records: number; paidRecords: number; unpaidRecords: number }[] }
type Lessons = { month: string; records: number; lessons: number; cancelledRecords: number; otherRecords: number; minutes: number | null; invalidHours: number; attendances: number | null; missingAttendance: number; averageAttendance: number | null; lastDate: string }
type Summary = { months: string[]; students: Payments | null; rentals: Rentals | null; lessons: Lessons | null }
const number = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const monthLabel = (value: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T12:00:00Z`))
const sourceLink = (month: string, series: string) => `/financeiro/historico?${new URLSearchParams({ month, series })}`

function Card({ title, value, month, series, children }: { title: string; value: string | null; month?: string; series: string; children?: ReactNode }) {
  const content = <><span className="arena-metric-label">{title}</span><strong>{value ?? 'Sem dados completos'}</strong><small>{month ? monthLabel(month) : 'Sem registros no período'}</small>{children}{month && <span className="arena-link-label">Conferir controle →</span>}</>
  return month ? <Link className={`arena-metric ${value === null ? 'arena-metric-unavailable' : ''}`} to={sourceLink(month, series)}>{content}</Link>
    : <div className="arena-metric arena-metric-unavailable">{content}</div>
}

export function ArenaHistoryOverview() {
  const { user } = useAuth()
  const [month, setMonth] = useState('')
  const query = useQuery({
    queryKey: ['arena-history-summary', user?.id, month],
    queryFn: async () => {
      const result = await apiFetch<Summary>(`/api/v1/financial-history/arena-summary${month ? `?month=${month}` : ''}`)
      if (!Array.isArray(result.months) || result.students === undefined || result.rentals === undefined || result.lessons === undefined) throw new Error('Resumo dos controles inválido.')
      return result
    },
    enabled: Boolean(user?.roles.includes('Owner')),
    refetchInterval: 60_000,
  })
  if (!user?.roles.includes('Owner')) return null
  const report = query.data; const students = report?.students; const rentals = report?.rentals; const lessons = report?.lessons
  return <section className="arena-dashboard-section" aria-labelledby="arena-history-title">
    <div className="arena-section-heading"><div><p className="arena-section-eyebrow">CONTROLES DA ESCOLA E DAS QUADRAS</p><h2 id="arena-history-title">Escola e aluguel de quadras</h2></div></div>
    <div className="arena-toolbar"><label className="operation-field">Mês dos controles<select value={month} onChange={event => setMonth(event.target.value)}><option value="">Último mês de cada controle</option>{month && !report?.months.includes(month) && <option value={month}>{monthLabel(month)}</option>}{report?.months.map(value => <option key={value} value={value}>{monthLabel(value)}</option>)}</select></label><p className="arena-hint">Histórico das planilhas. Cada indicador mostra seu mês de referência.</p></div>
    {query.isPending && <p role="status">Carregando controles da escola e das quadras…</p>}
    {query.isError && <p role="alert" className="arena-message arena-error">Não foi possível atualizar os controles da escola e das quadras. <button type="button" onClick={() => void query.refetch()}>Tentar novamente</button></p>}
    {report && <>
      <div className="arena-metric-grid">
        <Card title="Mensalidades de alunos pagas" value={students ? centsMoney(students.paidAmountCents) : null} month={students?.month} series="alunos">
          {students && <><small>{students.paidNames} nomes com pagamento · {students.paidRecords} registros pagos</small><small>{students.unpaidRecords} registros a conferir: Não Pago ou Cobrado</small>{students.otherRecords > 0 && <small>{students.otherRecords} registros em outras situações</small>}</>}
        </Card>
        <Card title="Aluguéis de mensalistas pagos" value={rentals ? centsMoney(rentals.payments.paidAmountCents) : null} month={rentals?.payments.month} series="mensalistas">
          {rentals && <><small>{rentals.payments.paidRecords} registros pagos · {rentals.payments.unpaidRecords} a conferir</small>{rentals.payments.otherRecords > 0 && <small>{rentals.payments.otherRecords} registros em outras situações</small>}<small>Pagamentos marcados como Pago no controle</small></>}
        </Card>
        <Card title="Horas semanais dos mensalistas" value={rentals?.weeklyMinutes != null ? `${number(rentals.weeklyMinutes / 60)} h/semana` : null} month={rentals?.payments.month} series="mensalistas">
          {rentals && <><small>{rentals.scheduleRecords} registros com situação Pago, Não Pago ou Cobrado</small>{rentals.invalidSchedules > 0 && <small>{rentals.invalidSchedules} registros sem dia ou intervalo válido</small>}<small>Soma dos intervalos semanais informados</small></>}
        </Card>
        <Card title="Aulas registradas" value={lessons ? number(lessons.lessons) : null} month={lessons?.month} series="aulas">
          {lessons && <><small>{lessons.minutes === null ? `${lessons.invalidHours} horários a conferir` : `${number(lessons.minutes / 60)} horas de aula no controle`}</small><small>{lessons.cancelledRecords} canceladas excluídas{lessons.otherRecords > 0 ? ` · ${lessons.otherRecords} em outras situações` : ''}</small><small>Última data registrada: {lessons.lastDate.split('-').reverse().join('/')}</small></>}
        </Card>
        <Card title="Participações em aulas" value={lessons?.attendances != null ? number(lessons.attendances) : null} month={lessons?.month} series="aulas">
          {lessons && <><small>{lessons.averageAttendance === null ? 'Média indisponível' : `Média de ${number(lessons.averageAttendance)} alunos por aula registrada`}</small><small>{lessons.missingAttendance > 0 ? `${lessons.missingAttendance} aulas sem quantidade válida` : 'Um aluno pode participar de várias aulas'}</small></>}
        </Card>
      </div>
      {rentals && <details className="arena-history-details"><summary>Ver horários dos mensalistas · {monthLabel(rentals.payments.month)}</summary><p>Referências semanais da planilha. A identificação da quadra e as reservas de cada data precisam ser confirmadas na agenda.</p>{rentals.schedule.length > 0 ? <div className="table-scroll"><table><caption>Horários informados por registros de mensalistas</caption><thead><tr><th>Dia</th><th>Horário</th><th>Registros pagos</th><th>A conferir</th></tr></thead><tbody>{rentals.schedule.map(slot => <tr key={`${slot.day}:${slot.hours}`}><td>{slot.day}</td><td>{slot.hours}</td><td>{slot.paidRecords}</td><td>{slot.unpaidRecords}</td></tr>)}</tbody></table></div> : <p>Sem horários válidos neste período.</p>}</details>}
      <details className="arena-history-details"><summary>Como os indicadores são calculados</summary><ul><li>Recebimentos: soma dos valores das linhas marcadas como Pago, por mês e controle. Esses valores podem compor o resumo mensal da arena; somá-los novamente duplicaria receitas.</li><li>Nomes com pagamento: nomes distintos após padronizar espaços e letras. A conferência não substitui o cadastro individual de alunos.</li><li>A conferir: quantidade de linhas Não Pago ou Cobrado. O campo Valor Pago não informa necessariamente o valor devido.</li><li>Horas semanais: duração final menos inicial, somada por registro de mensalista com dia e horário válidos. Entregou Horário e Revisão ficam fora. Não é uma taxa de ocupação das quadras.</li><li>Aulas: linhas com data individual e situação Pago ou Aula Ruivo. Cancelamentos e resumos mensais ficam fora. Participações somam a quantidade de alunos; a média divide essa soma pelas aulas incluídas.</li></ul></details>
    </>}
  </section>
}
