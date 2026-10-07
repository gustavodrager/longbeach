import { Link } from 'react-router-dom'
import { centsMoney } from './FinancialHistory'
import { expenseGroups, type ExpenseBreakdown } from './monthlyExpenses'
import './monthly-expenses.css'

export function ExpenseComposition({ totals, month, activeGroup, showOther = false }: { totals: ExpenseBreakdown; month: string; activeGroup?: string; showOther?: boolean }) {
  return <nav aria-label="Despesas por tipo" className="expense-composition">
    {expenseGroups.filter(group => group.key !== 'outras' || showOther || totals.otherCents !== 0).map(group =>
      <Link key={group.key} to={`/financeiro/controle-mensal?${new URLSearchParams({ month, grupo: group.key })}`}
        preventScrollReset aria-current={activeGroup === group.key ? 'page' : undefined}>
        <span>{group.label}</span><strong>{centsMoney(totals[group.field])}</strong>
      </Link>)}
  </nav>
}
