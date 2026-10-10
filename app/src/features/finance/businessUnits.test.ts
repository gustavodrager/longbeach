import { allocationChoice, allocationError, allocationFields } from './businessUnits'

it('particiona as duas unidades e as pendências sem duplicar valores ou presumir rateio', () => {
  const rows = [
    { origin: 'Bar', amount: 80 }, { origin: 'Escola', amount: 200 }, { origin: 'Locações', amount: 100 },
    { origin: 'Arena', amount: 50 }, { origin: 'Arena', amount: 20, ...allocationFields('shared') },
  ]
  const totals = Object.fromEntries(['bar', 'quadra', 'shared', 'unclassified'].map(choice => [choice, rows.filter(row => allocationChoice(row.origin,row) === choice).reduce((sum,row)=>sum+row.amount,0)]))
  expect(totals).toEqual({bar:80,quadra:300,shared:20,unclassified:50})
  expect(Object.values(totals).reduce((a,b)=>a+b,0)).toBe(450)
  expect(allocationError('Escola',allocationFields('bar'))).toBeTruthy()
  expect(allocationError('Arena',allocationFields('shared'))).toBeNull()
})
