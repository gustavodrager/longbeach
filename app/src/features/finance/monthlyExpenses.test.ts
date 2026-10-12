import { expenseBreakdown, matchesControlGroup } from './monthlyExpenses'
it('soma cada despesa uma vez e preserva categorias antigas, receitas e zero',()=>{
  const lines=[
    {direction:'Receita',category:'Fixa',amountCents:9000},
    ...['Fixa','Variável','Parcela','Acerto','Operação'].map((category,index)=>({direction:'Despesa',category,amountCents:(index+1)*100})),
    {direction:'Despesa',category:'Variável',amountCents:0},
  ]
  expect(expenseBreakdown(lines)).toEqual({fixedCents:100,variableCents:200,installmentCents:300,adjustmentCents:400,otherCents:500})
  expect(lines.filter(line=>matchesControlGroup(line,'fixas'))).toEqual([lines[1]])
  expect(lines.filter(line=>matchesControlGroup(line,'outras'))).toEqual([lines[5]])
  expect(lines.filter(line=>matchesControlGroup(line,'receitas'))).toEqual([lines[0]])
  expect(lines.filter(line=>matchesControlGroup(line,'invalido'))).toHaveLength(lines.length)
})
