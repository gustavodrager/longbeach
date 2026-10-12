export type ExpenseBreakdown = { fixedCents: number; variableCents: number; installmentCents: number; adjustmentCents: number; otherCents: number }
export const expenseGroups = [
  { key: 'fixas', category: 'Fixa', field: 'fixedCents', label: 'Despesas fixas' },
  { key: 'variaveis', category: 'Variável', field: 'variableCents', label: 'Despesas variáveis' },
  { key: 'parcelas', category: 'Parcela', field: 'installmentCents', label: 'Parcelas' },
  { key: 'acertos', category: 'Acerto', field: 'adjustmentCents', label: 'Acertos e devoluções' },
  { key: 'outras', category: 'Operação', field: 'otherCents', label: 'Outras despesas' },
] as const
type ExpenseLine = { direction: string; category: string; amountCents: number }
export function expenseBreakdown(lines: ExpenseLine[]): ExpenseBreakdown {
  const total: ExpenseBreakdown = { fixedCents: 0, variableCents: 0, installmentCents: 0, adjustmentCents: 0, otherCents: 0 }
  for (const line of lines) {
    if (line.direction !== 'Despesa') continue
    const group = expenseGroups.find(item => item.category === line.category)
    total[group?.field ?? 'otherCents'] += line.amountCents
  }
  return total
}
export function matchesControlGroup(line: ExpenseLine, group: string) {
  if (group === 'receitas') return line.direction === 'Receita'
  const expense = expenseGroups.find(item => item.key === group)
  if (!expense) return true
  return line.direction === 'Despesa' && (group === 'outras'
    ? !expenseGroups.slice(0, 4).some(item => item.category === line.category)
    : line.category === expense.category)
}
