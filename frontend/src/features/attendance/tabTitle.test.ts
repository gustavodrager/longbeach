import { personName, tabCustomerName, tabTitle } from './tabTitle'

it('mantém o nome salvo na comanda antes do cadastro e normaliza espaços', () => {
  expect(tabTitle({ number: 1, name: '  Grupo\n da tarde ', customer: { id: 'customer-a', name: 'Cliente Exemplo', incomplete: false } })).toBe('Comanda 01 - Grupo da tarde')
  expect(tabTitle({ number: 1, name: 'Visitante', customer: { id: 'customer-a', name: 'Cliente Exemplo', incomplete: false } })).toBe('Comanda 01 - Cliente Exemplo')
})
it.each(['', '  ', 'Visitante', ' visitante '])('mantém só o número sem nome real (%j)', name => {
  expect(tabTitle({ number: 1, name })).toBe('Comanda 01')
})
it('mantém nome manual e números maiores, sem confundir responsável com cliente', () => {
  const tab = { number: 104, name: '  Turma   de quinta ', responsible: { id: 'payer', name: 'Outra pessoa' } }
  expect(tabTitle(tab)).toBe('Comanda 104 - Turma de quinta')
  expect(tabCustomerName({ number: 1, name: '', customer: null })).toBe('')
})
it('não inventa nem corta nomes longos ou caracteres de texto', () => {
  const name = '<Cliente & Exemplo> ' + 'Nome comprido '.repeat(15).trim()
  expect(tabTitle({ number: 9, customer: { id: 'customer-a', name, incomplete: false } })).toBe(`Comanda 09 - ${name}`)
  expect(personName(undefined)).toBe('')
})
