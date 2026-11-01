import type { RentalGroup, RentalMonth } from './rentals'
import type { Reservation } from './types'
import { rentalAgendaPreviews } from './rentalAgendaPreviews'

const group: RentalGroup = {
  id: 'synthetic-group', name: 'Grupo demonstração', courtId: 'court-test', sport: 'Futevôlei', weekDay: 1,
  startTime: '20:00', endTime: '22:00', startDate: '2026-01-01', endDate: '', status: 'Ativo', capacity: 8,
  organizerId: '', backupId: '', members: [], monthlyAmount: null, dueDay: null, fifthPolicy: 'A confirmar', extraAmount: null, notes: '',
}
const month: RentalMonth = { id: 'synthetic-month', version: 1, name: 'Mês de teste', rentalGroupId: group.id, month: '2026-10', dates: [], amount: null, dueDate: '', createCharge: false, members: [] }
const reservation: Reservation = { id: 'synthetic-meeting', name: group.name, courtId: group.courtId, date: '2026-10-05', startTime: group.startTime, endTime: group.endTime, customerName: '', phone: '', amount: 0, status: 'Confirmada', notes: '', rentalGroupId: group.id, rentalMonth: '2026-10' }
const dates = (groups = [group], months: RentalMonth[] = [], reservations: Reservation[] = [], from = '2026-10-01', to = '2026-10-31') => rentalAgendaPreviews(groups, months, reservations, from, to).map(row => row.date)

it('projeta as segundas sem criar registros de reserva ou cobrança', () => {
  const result = rentalAgendaPreviews([group], [], [], '2026-10-01', '2026-10-31')
  expect(result.map(row => row.date)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
  expect(result[0]).toEqual({ group, date: '2026-10-05', startTime: '20:00', endTime: '22:00' })
  expect(Object.keys(result[0]).sort()).toEqual(['date', 'endTime', 'group', 'startTime'])
})

it.each([0, 1, 2, 3, 4, 5, 6])('usa o dia UTC %s sem deslocamento de fuso na virada de ano', weekDay => {
  const result = dates([{ ...group, weekDay }], [], [], '2026-12-28', '2027-01-03')
  expect(result).toHaveLength(1)
  expect(new Date(`${result[0]}T00:00:00Z`).getUTCDay()).toBe(weekDay)
})

it('respeita início e fim inclusivos do acordo e do período consultado', () => {
  expect(dates([{ ...group, startDate: '2026-10-12', endDate: '2026-10-19' }])).toEqual(['2026-10-12', '2026-10-19'])
  expect(dates([group], [], [], '2026-10-12', '2026-10-12')).toEqual(['2026-10-12'])
  expect(dates([{ ...group, startDate: '2026-11-01' }])).toEqual([])
  expect(dates([{ ...group, endDate: '2026-09-30' }])).toEqual([])
})

it.each(['Pausado', 'Encerrado'] as const)('não projeta grupo %s', status => {
  expect(dates([{ ...group, status }])).toEqual([])
})

it('mantém competências geradas mesmo que todas as datas tenham sido removidas ou canceladas', () => {
  expect(dates([group], [month])).toEqual([])
  expect(dates([group], [], [{ ...reservation, status: 'Cancelada' }])).toEqual([])
  expect(dates([group], [], [{ ...reservation, status: 'Bloqueio' }])).toEqual([])
})

it('a competência original de uma remarcação prevalece sobre o mês da nova data', () => {
  const moved = { ...reservation, date: '2026-11-02', rentalMonth: '2026-10' }
  expect(dates([group], [], [moved])).toEqual([])
  expect(dates([group], [], [moved], '2026-11-01', '2026-11-30')).toEqual(['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
})

it('conserva a previsão no mesmo dia quando a reposição de outro mês tem horário diferente', () => {
  const moved = { ...reservation, date: '2026-11-02', rentalMonth: '2026-10', startTime: '18:00', endTime: '19:00' }
  expect(dates([group], [], [moved], '2026-11-02', '2026-11-02')).toEqual(['2026-11-02'])
})

it.each([undefined, '', '2026-13', 'inválido'])('usa o mês da data para reservas legadas com competência %s', rentalMonth => {
  expect(dates([group], [], [{ ...reservation, rentalMonth }])).toEqual([])
})

it('diferencia o vínculo mensalista das recorrências avulsas e dos nomes iguais', () => {
  const other = { ...group, id: 'other-group' }
  expect(dates([group], [{ ...month, rentalGroupId: other.id }], [{ ...reservation, rentalGroupId: other.id }])).toHaveLength(4)
  expect(dates([group], [], [{ ...reservation, rentalGroupId: undefined, groupId: group.id }])).toHaveLength(4)
})

it('limita o intervalo a 366 dias inclusivos e rejeita datas normalizadas ou fora do domínio', () => {
  expect(dates([group], [], [], '2026-01-01', '2027-01-01').length).toBeGreaterThan(0)
  for (const [from, to] of [['2026-01-01', '2027-01-02'], ['2026-10-02', '2026-10-01'], ['2026-02-30', '2026-03-01'], ['0000-01-01', '0000-01-02'], ['2026-1-01', '2026-01-02'], ['2026-01-01', '10000-01-01'], ['', '2026-01-01']]) expect(dates([group], [], [], from, to)).toEqual([])
  expect(dates([{ ...group, startDate: '0001-01-01' }], [], [], '0001-01-01', '0001-01-07')).toEqual(['0001-01-01'])
  expect(dates([{ ...group, weekDay: 5 }], [], [], '9999-12-31', '9999-12-31')).toEqual(['9999-12-31'])
})

it('aceita 24:00 somente no final e não projeta acordos incompletos ou inválidos', () => {
  expect(rentalAgendaPreviews([{ ...group, startTime: '23:00', endTime: '24:00' }], [], [], '2026-10-05', '2026-10-05')[0].endTime).toBe('24:00')
  const invalid: Partial<RentalGroup>[] = [
    { id: '' }, { courtId: ' ' }, { weekDay: 7 }, { weekDay: 1.5 }, { weekDay: -1 }, { startDate: '2026-02-30' },
    { endDate: '2026-02-30' }, { startDate: '2026-10-20', endDate: '2026-10-01' },
    { startTime: '24:00' }, { startTime: '20:60' }, { startTime: '8:00' }, { endTime: '24:01' }, { startTime: '22:00', endTime: '20:00' }, { endTime: '20:00' },
  ]
  for (const patch of invalid) expect(dates([{ ...group, ...patch }])).toEqual([])
})

it('ordena por data, horário e identificação do grupo sem duplicar o mesmo acordo', () => {
  const alpha = { ...group, id: 'a' }, beta = { ...group, id: 'b' }, early = { ...group, id: 'z', startTime: '18:00', endTime: '19:00' }
  const result = rentalAgendaPreviews([beta, alpha, early, alpha], [], [], '2026-10-05', '2026-10-12')
  expect(result.map(row => [row.date, row.startTime, row.group.id])).toEqual([
    ['2026-10-05', '18:00', 'z'], ['2026-10-05', '20:00', 'a'], ['2026-10-05', '20:00', 'b'],
    ['2026-10-12', '18:00', 'z'], ['2026-10-12', '20:00', 'a'], ['2026-10-12', '20:00', 'b'],
  ])
})

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
it('preserva os arrays, os objetos de origem e os vínculos de negócio', () => {
  const input = freeze({ groups: [{ ...group, members: [...group.members] }], months: [{ ...month, month: '2026-09', dates: [] }], reservations: [{ ...reservation, date: '2026-09-07', rentalMonth: '2026-09' }] })
  const before = JSON.stringify(input)
  expect(rentalAgendaPreviews(input.groups, input.months, input.reservations, '2026-10-01', '2026-10-31')).toHaveLength(4)
  expect(JSON.stringify(input)).toBe(before)
})
