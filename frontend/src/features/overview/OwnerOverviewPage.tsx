import { Link, useSearchParams } from 'react-router-dom'
import { Disclosure } from '../../components/managementUi'
import { ApiError } from '../../lib/http'
import { today } from '../../pages/arenaUi'
import { canManageStaff } from '../auth/access'
import { useAuth } from '../auth/authContext'
import { useOwnerOverview, validOverviewMonth, type CompetenceFinance, type GoalEstimate, type OwnerOverview } from './ownerOverviewApi'
import './owner-overview.css'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const dateLabel = (value: string) => value.split('-').reverse().join('/')
const monthLabel = (value: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T12:00:00Z`))
const money = (cents: number) => currency.format(cents / 100)
const estimatedMoney = (cents: number | null) => cents === null ? 'Sem referência de preço' : money(cents)
const weekdays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]
const isSchoolGoalDay = (day: number) => day >= 1 && day <= 5
const schoolGoalTotals = (report: OwnerOverview) => report.weekdays.filter(row => isSchoolGoalDay(row.weekDay))
  .reduce((total, row) => ({ classes: total.classes + row.classes, enrollments: total.enrollments + row.enrollmentPlaces }), { classes: 0, enrollments: 0 })

function GoalProgress({ value, target, label }: { value: number; target: number; label: string }) {
  if (target <= 0) return <div className="owner-goal-progress"><strong>{number.format(value)}</strong><small>Sem meta</small></div>
  return <div className="owner-goal-progress">
    <span><strong>{number.format(value)}</strong> <span>de {number.format(target)}</span></span>
    <div className="owner-goal-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(value, target)} aria-valuetext={`${number.format(value)} de ${number.format(target)}${value > target ? ' · acima da meta' : ''}`}>
      <span style={{ width: `${target > 0 ? Math.min(100, Math.max(0, value / target * 100)) : 0}%` }} />
    </div>
  </div>
}

function KnownPrice({ cents, samples, missing }: { cents: number; samples: number; missing: number }) {
  return <><strong>{samples > 0 ? money(cents) : missing > 0 ? 'A combinar' : 'Sem mensalidades'}</strong>
    <span>{samples > 0 ? `${samples} mensalidade(s) com valor definido` : 'Nenhum valor definido'}{missing > 0 ? ` · ${missing} a combinar` : ''}</span></>
}

function ActiveBase({ report }: { report: OwnerOverview }) {
  const { school, rentals, recurring } = report
  const schoolGoals = schoolGoalTotals(report)
  const hasWeekendClasses = school.activeClasses > schoolGoals.classes
  const hasPrices = school.priceSampleCount > 0 || rentals.priceSampleCount > 0
  return <section className="owner-section" aria-labelledby="owner-base-heading">
    <div className="owner-section-heading"><div><h2 id="owner-base-heading">Alunos e mensalistas</h2><p>Base ativa em {dateLabel(report.asOfDate)} · a competência abaixo não altera esta base.</p></div></div>
    <div className="owner-base-grid">
      <article className="owner-base-card" aria-labelledby="owner-school-heading">
        <div className="owner-card-top"><h3 id="owner-school-heading">Alunos</h3><Link to="/alunos">Ver alunos <span aria-hidden="true">→</span></Link></div>
        <p className="owner-big-number"><strong>{number.format(school.activeStudents)}</strong>{' '}<span>alunos únicos com matrícula ativa</span></p>
        <div className="owner-base-counts"><span><strong>{number.format(schoolGoals.enrollments)} / {report.targets.weeklyPlaces}</strong> matrículas<small>meta de vagas · segunda a sexta</small></span><span><strong>{number.format(schoolGoals.classes)} / {report.targets.weeklyClasses}</strong> turmas ativas<small>meta da grade · segunda a sexta</small></span></div>
        {hasWeekendClasses && <p className="owner-note">Base completa: {number.format(school.activeEnrollments)} matrícula(s) em {number.format(school.activeClasses)} turma(s), incluindo o fim de semana. As atividades de sábado e domingo ficam fora da meta de aulas.</p>}
        <div className="owner-known-price"><span>Mensalidades conhecidas · aulas</span><KnownPrice cents={school.knownMonthlyCents} samples={school.priceSampleCount} missing={school.missingPriceCount} /></div>
        {school.activeEnrollments === 0 && <p className="owner-empty-note">Nenhuma matrícula ativa nesta leitura.</p>}
        <Link className="owner-detail-link" to="/escola/matriculas">Conferir matrículas e mensalidades <span aria-hidden="true">→</span></Link>
      </article>
      <article className="owner-base-card" aria-labelledby="owner-rentals-heading">
        <div className="owner-card-top"><h3 id="owner-rentals-heading">Mensalistas</h3><Link to="/mensalistas">Ver mensalistas <span aria-hidden="true">→</span></Link></div>
        <p className="owner-big-number"><strong>{number.format(rentals.activeGroups)}</strong>{' '}<span>grupos com contrato ativo</span></p>
        <p className="owner-base-explanation">Cada grupo conta uma vez, independentemente do número de integrantes.</p>
        <div className="owner-known-price"><span>Mensalidades conhecidas · mensalistas</span><KnownPrice cents={rentals.knownMonthlyCents} samples={rentals.priceSampleCount} missing={rentals.missingPriceCount} /></div>
        {rentals.activeGroups === 0 && <p className="owner-empty-note">Nenhum grupo mensalista ativo nesta leitura.</p>}
        <Link className="owner-detail-link" to="/mensalistas">Conferir contratos e mensalidades <span aria-hidden="true">→</span></Link>
      </article>
    </div>
    <div className="owner-recurring-total"><div><span>Recorrência mensal conhecida</span><strong>{hasPrices ? money(recurring.knownMonthlyCents) : recurring.missingPriceCount > 0 ? 'A combinar' : 'Sem mensalidades'}</strong>{recurring.missingPriceCount > 0 && <small>Subtotal conhecido · {recurring.missingPriceCount} mensalidade(s) a combinar</small>}<p>Aulas + mensalistas · valores combinados na base ativa.</p></div><div><span>Meta recorrente estimada</span><strong>{estimatedMoney(recurring.targetMonthlyCents)}</strong><p>Preços conhecidos aplicados às metas da grade. Detalhamento por dia abaixo.</p></div></div>
  </section>
}

function FinanceRow({ label, value, to }: { label: string; value: Omit<CompetenceFinance, 'basis'>; to: string }) {
  return <tr><th scope="row"><Link to={to}>{label} <span aria-hidden="true">→</span></Link><small>{value.chargeCount} cobrança(s) nesta seleção</small></th>
    <td data-label="Cobrado">{money(value.billedCents)}</td><td data-label="Recebido dessas cobranças">{money(value.receivedCents)}</td><td data-label="Falta receber"><strong>{money(value.outstandingCents)}</strong>{value.overdueChargeCount > 0 && <small className="owner-overdue">Deste saldo, {money(value.overdueCents)} vencidos · {value.overdueChargeCount} cobrança(s)</small>}{value.partiallyPaidCount > 0 && <small>{value.partiallyPaidCount} pagamento(s) parcial(is)</small>}</td>
  </tr>
}

function FinancialOverview({ report }: { report: OwnerOverview }) {
  const { finance } = report
  const barPeriod = new URLSearchParams({ de: `${report.month}-01`, ate: new Date(Date.UTC(Number(report.month.slice(0, 4)), Number(report.month.slice(5, 7)), 0)).toISOString().slice(0, 10) })
  return <section className="owner-section" aria-labelledby="owner-finance-heading">
    <div className="owner-section-heading"><div><h2 id="owner-finance-heading">Faturamento e recebimentos</h2><p>{monthLabel(report.month)} · mensalidades e Bar têm referências de período diferentes.</p></div><Link className="owner-detail-link" to="/recebimentos">Abrir recebimentos <span aria-hidden="true">→</span></Link></div>
    <div className="owner-bar-summary" aria-label="Resumo dos recebimentos líquidos do Bar"><div><span>Comandas atuais · recebido líquido</span><strong>{money(finance.bar.netReceivedCents)}</strong></div>{(finance.barLegacy.receivedEventCount > 0 || finance.barLegacy.refundEventCount > 0) && <div><span>Vendas anteriores do Bar · recebido líquido</span><strong>{money(finance.barLegacy.netReceivedCents)}</strong></div>}<p>{monthLabel(report.month)} · recebido bruto menos os estornos de cada origem.</p></div>
    <div className="owner-finance-card">
      <h3>Mensalidades da competência</h3>
      <p className="owner-note">Cobranças de {monthLabel(report.month)} · recebido e saldo atualizados até esta leitura.</p>
      <div className="owner-table-wrap"><table className="owner-finance-table" aria-label="Mensalidades por competência"><thead><tr><th scope="col">Origem</th><th scope="col">Cobrado</th><th scope="col">Recebido dessas cobranças</th><th scope="col">Falta receber</th></tr></thead><tbody>
        <FinanceRow label="Mensalidades das aulas" value={finance.school} to="/financeiro?origin=Escola&direction=Receber&sourceKind=enrollments&range=all" />
        <FinanceRow label="Mensalistas" value={finance.rentals} to="/financeiro?origin=Loca%C3%A7%C3%B5es&sourceKind=rentalMonths&direction=Receber&range=all" />
      </tbody></table></div>
      {(finance.school.manualPaidCount > 0 || finance.rentals.manualPaidCount > 0) && <p className="owner-note">Inclui baixas manuais informadas: {finance.school.manualPaidCount} em aulas e {finance.rentals.manualPaidCount} em mensalistas. Consulte a origem para conferir o pagamento.</p>}
      <Disclosure title="Como ler as mensalidades"><p className="owner-note">O recebido considera a liquidação dessas cobranças até esta leitura, mesmo quando o pagamento ocorreu em outro mês. Os links de origem abrem os lançamentos para conferência de todas as competências.</p></Disclosure>
    </div>
    <div className="owner-finance-card">
      <h3>Outras receitas de aulas</h3>
      <p className="owner-note">Vencimentos no mês · aulas avulsas, experimentais e lançamentos identificados da escola.</p>
      {finance.otherSchool.chargeCount > 0 ? <><div className="owner-table-wrap"><table className="owner-finance-table" aria-label="Outras receitas de aulas por vencimento"><thead><tr><th scope="col">Origem</th><th scope="col">Cobrado</th><th scope="col">Recebido dessas cobranças</th><th scope="col">Falta receber</th></tr></thead><tbody>
        <FinanceRow label="Outras receitas de aulas" value={finance.otherSchool} to="/financeiro?origin=Escola&direction=Receber&range=all" />
      </tbody></table></div>{finance.otherSchool.manualPaidCount > 0 && <p className="owner-note">Inclui {finance.otherSchool.manualPaidCount} baixa(s) manual(is) informada(s).</p>}</> : <p className="owner-empty-note">Nenhuma outra cobrança de aulas com vencimento neste mês.</p>}
      <Disclosure title="O que entra nas outras receitas de aulas"><p className="owner-note">Esta seleção usa o vencimento no mês, e o recebido mostra a liquidação atual dessas cobranças. Não é recebimento de caixa do mês. As mensalidades já apresentadas acima ficam fora desta seleção; o link abre os lançamentos da escola de todas as competências para conferência.</p></Disclosure>
    </div>
    <div className="owner-finance-card owner-bar-card">
      <div className="owner-card-top"><h3>Bar no período</h3><Link to={`/bar/indicadores?${barPeriod}`}>Conferir Bar <span aria-hidden="true">→</span></Link></div>
      <dl className="owner-bar-metrics">
        <div><dt>Consumo confirmado</dt><dd>{money(finance.bar.consumedCents)}<small>{finance.bar.consumedItemCount} item(ns) · data da confirmação do consumo</small></dd></div>
        <div><dt>Recebido bruto</dt><dd>{money(finance.bar.grossReceivedCents)}<small>{finance.bar.receivedPaymentCount} pagamento(s) confirmado(s)</small></dd></div>
        <div><dt>Estornos confirmados</dt><dd>{money(finance.bar.refundsCents)}<small>{finance.bar.confirmedRefundCount} estorno(s) no período</small></dd></div>
        <div className="owner-bar-net"><dt>Recebido líquido</dt><dd>{money(finance.bar.netReceivedCents)}<small>Recebimentos menos estornos confirmados no período</small></dd></div>
      </dl>
      {finance.bar.consumedItemCount === 0 && finance.bar.receivedPaymentCount === 0 && finance.bar.confirmedRefundCount === 0 && <p className="owner-empty-note">Nenhum consumo, pagamento ou estorno confirmado do Bar neste período.</p>}
      <p className="owner-note">Movimentos confirmados no mês. Consumo e recebimento são medidas diferentes.</p>
      <Disclosure title="Período e origem dos valores do Bar"><p className="owner-note">Este bloco usa as comandas atuais e a data de confirmação de cada movimento. As mensalidades usam a competência da cobrança. Por isso, estes valores não formam um total de caixa. Pix pendente e extratos importados ficam fora da composição. As vendas anteriores do Bar aparecem em um bloco separado abaixo.</p></Disclosure>
    </div>
    {finance.barLegacy.receivedEventCount > 0 || finance.barLegacy.refundEventCount > 0 ? <section className="owner-finance-card owner-legacy-card" aria-labelledby="owner-legacy-heading">
      <div className="owner-card-top"><h3 id="owner-legacy-heading">Vendas anteriores do Bar</h3><Link to="/bar/vendas">Conferir vendas <span aria-hidden="true">→</span></Link></div>
      <p className="owner-note">Recebimentos e estornos das vendas anteriores, pela data de cada movimento no mês. Valores separados das comandas atuais.</p>
      <dl className="owner-bar-metrics owner-legacy-metrics">
        <div><dt>Recebido bruto</dt><dd>{money(finance.barLegacy.grossReceivedCents)}<small>{finance.barLegacy.receivedEventCount} evento(s) de recebimento</small></dd></div>
        <div><dt>Estornos registrados</dt><dd>{money(finance.barLegacy.refundsCents)}<small>{finance.barLegacy.refundEventCount} evento(s) de estorno</small></dd></div>
        <div className="owner-bar-net"><dt>Recebido líquido</dt><dd>{money(finance.barLegacy.netReceivedCents)}<small>Não somado ao bloco de comandas atuais</small></dd></div>
      </dl>
    </section> : <p className="owner-note">Vendas anteriores do Bar: nenhum recebimento ou estorno registrado neste mês.</p>}
  </section>
}

function PriceReference({ goal }: { goal: GoalEstimate }) {
  return <><strong>{estimatedMoney(goal.estimatedMonthlyCents)}</strong><small>{goal.averageMonthlyCents === null ? 'Sem mensalidade conhecida para estimar' : `${money(goal.averageMonthlyCents)} por mensalidade · ${goal.sampleCount} referência(s)`}</small>{goal.averageMonthlyCents !== null && <small>{goal.usesFallback ? 'Usa a média do segmento: sem preço conhecido neste dia' : 'Usa os preços conhecidos deste dia'}</small>}</>
}

function WeeklyGoals({ report }: { report: OwnerOverview }) {
  const { targets, recurring } = report
  const schoolGoals = schoolGoalTotals(report)
  const rows = weekdayOrder.map(day => report.weekdays.find(row => row.weekDay === day)!)
  const placesPerDay = targets.classesPerWeekday * targets.placesPerClass
  return <section className="owner-section" aria-labelledby="owner-goals-heading">
    <div className="owner-section-heading"><div><h2 id="owner-goals-heading">Metas da semana</h2><p>Grade ativa em {dateLabel(report.asOfDate)} · aulas de segunda a sexta: {targets.classesPerWeekday} turmas por dia e {targets.placesPerClass} vagas por turma. Mensalistas de segunda a domingo: {targets.rentalGroupsPerWeekday} grupos por dia.</p></div><Link className="owner-detail-link" to="/escola">Abrir grade de aulas <span aria-hidden="true">→</span></Link></div>
    <div className="owner-goals-card"><table className="owner-goals-table" aria-label="Metas por dia da semana"><thead><tr><th scope="col">Dia da semana</th><th scope="col">Aulas recorrentes</th><th scope="col">Vagas ocupadas</th><th scope="col">Grupos mensalistas</th></tr></thead><tbody>{rows.map(row => <tr key={row.weekDay}>
      <th scope="row">{weekdays[row.weekDay]}</th>
      <td data-label="Aulas"><GoalProgress value={row.classes} target={isSchoolGoalDay(row.weekDay) ? targets.classesPerWeekday : 0} label={`Aulas de ${weekdays[row.weekDay]}`} /></td>
      <td data-label="Vagas"><GoalProgress value={row.enrollmentPlaces} target={isSchoolGoalDay(row.weekDay) ? placesPerDay : 0} label={`Vagas de ${weekdays[row.weekDay]}`} /><small>{row.classes > 0 ? `${number.format(row.enrollmentPlaces / row.classes)} aluno(s) por aula, em média${isSchoolGoalDay(row.weekDay) ? ` · meta ${targets.placesPerClass}` : ''}` : 'Sem aulas ativas neste dia'}</small></td>
      <td data-label="Mensalistas"><GoalProgress value={row.rentalGroups} target={targets.rentalGroupsPerWeekday} label={`Mensalistas de ${weekdays[row.weekDay]}`} /></td>
    </tr>)}</tbody><tfoot><tr><th scope="row">Total nas metas</th><td data-label="Aulas"><strong>{number.format(schoolGoals.classes)} de {targets.weeklyClasses}</strong><small>Segunda a sexta</small></td><td data-label="Vagas"><strong>{number.format(schoolGoals.enrollments)} de {targets.weeklyPlaces}</strong><small>Segunda a sexta</small></td><td data-label="Mensalistas"><strong>{number.format(report.rentals.activeGroups)} de {targets.weeklyRentalGroups}</strong><small>Segunda a domingo</small></td></tr></tfoot></table></div>
    <p className="owner-note">A meta de {targets.weeklyPlaces} vagas corresponde a matrículas na grade de segunda a sexta, não a pessoas diferentes. Um aluno em duas aulas ocupa duas vagas. A ocupação mostra matrículas, não presenças realizadas. Aulas e matrículas de sábado e domingo permanecem visíveis, sem meta nesses dias.</p>
    <div className="owner-target-money"><div><h3>Mensalidade estimada ao atingir as metas</h3><p>Estimativa com os preços combinados na base ativa. Não é cobrança emitida nem receita garantida.</p></div><strong>{estimatedMoney(recurring.targetMonthlyCents)}</strong>
      <dl><div><dt>Aulas</dt><dd>{estimatedMoney(recurring.schoolTargetMonthlyCents)}</dd></div><div><dt>Mensalistas</dt><dd>{estimatedMoney(recurring.rentalTargetMonthlyCents)}</dd></div><div><dt>Bar</dt><dd>Sem meta em reais</dd></div></dl>
    </div>
    <Disclosure title="Preços usados na estimativa das metas"><p className="owner-note">A estimativa de aulas soma somente segunda a sexta; a de mensalistas mantém os sete dias. Em cada dia com meta, usa a média das mensalidades conhecidas do mesmo dia. Quando não existe preço naquele dia, usa a média conhecida do segmento. Mensalidades a combinar ficam fora da média; preços explicitamente definidos em zero continuam sendo considerados. Sem referência em um segmento, sua meta em reais e o total ficam sem estimativa.</p>
      <div className="owner-table-wrap"><table className="owner-estimate-table" aria-label="Estimativa de mensalidades por dia"><thead><tr><th scope="col">Dia da semana</th><th scope="col">Meta de aulas</th><th scope="col">Meta de mensalistas</th></tr></thead><tbody>{rows.map(row => <tr key={row.weekDay}><th scope="row">{weekdays[row.weekDay]}</th><td>{isSchoolGoalDay(row.weekDay) ? <PriceReference goal={row.schoolGoal} /> : <span>Sem meta de aulas</span>}</td><td><PriceReference goal={row.rentalGoal} /></td></tr>)}</tbody></table></div>
    </Disclosure>
  </section>
}

export function OwnerOverviewPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const month = params.get('month') ?? today().slice(0, 7)
  const validMonth = validOverviewMonth(month)
  const query = useOwnerOverview(month)
  if (!canManageStaff(user)) return null
  const denied = query.error instanceof ApiError && [401, 403].includes(query.error.status)
  const report = denied ? undefined : query.data
  const changeMonth = (value: string) => {
    if (!validOverviewMonth(value)) return
    const next = new URLSearchParams(params); next.set('month', value)
    setParams(next, { preventScrollReset: true })
  }
  return <main className="operation-page arena-page owner-overview">
    <header className="owner-heading"><div><p className="owner-eyebrow">Gestão da arena</p><h1>Visão geral</h1><p>Alunos, mensalistas, faturamento e metas.</p></div><div className="owner-header-actions"><label className="owner-month-field">Competência financeira<input type="month" value={validMonth ? month : ''} min="2000-01" max="2099-12" onChange={event => changeMonth(event.target.value)} /></label><button type="button" className="secondary-link" disabled={query.isFetching || !validMonth} onClick={() => void query.refetch()}>{query.isFetching ? 'Atualizando…' : 'Atualizar'}</button></div></header>
    <nav className="owner-shortcuts" aria-label="Acessos da gestão"><Link to="/alunos">Alunos</Link><Link to="/escola/matriculas">Matrículas</Link><Link to="/mensalistas">Mensalistas</Link><Link to="/financeiro">Financeiro</Link><Link to="/bar/indicadores">Bar</Link><Link to={`/agenda?date=${today()}&view=day`}>Agenda de hoje</Link></nav>
    {!validMonth && <p role="alert" className="owner-message owner-error">Escolha uma competência válida para consultar o painel.</p>}
    {validMonth && query.isPending && <p role="status" className="owner-message">Carregando a visão geral da arena…</p>}
    {query.isError && <div role="alert" className="owner-message owner-error"><p>{report ? 'Não foi possível atualizar. A última leitura está preservada e pode estar desatualizada.' : denied ? 'Sua conta não possui acesso à visão dos donos.' : 'Não foi possível carregar a visão geral. Tente novamente.'}</p>{!denied && <button type="button" className="secondary-link" disabled={query.isFetching} onClick={() => void query.refetch()}>Tentar novamente</button>}</div>}
    {report && <><p className="owner-read-at" role="status">{query.isError ? 'Última leitura preservada' : 'Atualizado em'} {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: report.timeZone }).format(new Date(report.queriedAtUtc))} · horário de São Paulo.</p>
      <ActiveBase report={report} />
      <FinancialOverview report={report} />
      <WeeklyGoals report={report} />
      <section className="owner-section owner-attention" aria-labelledby="owner-attention-heading"><div className="owner-section-heading"><div><h2 id="owner-attention-heading">Pontos para conferir</h2><p>Qualidade dos cadastros e das origens usadas neste resumo.</p></div></div>{report.warnings.length > 0 ? <ul>{report.warnings.map((warning, index) => <li key={`${warning.code}:${index}`}><span className="owner-warning-count">{number.format(warning.count)}</span><span>{warning.message}</span></li>)}</ul> : <p className="owner-note">Nenhum ponto de conferência identificado nesta leitura.</p>}</section>
    </>}
  </main>
}
