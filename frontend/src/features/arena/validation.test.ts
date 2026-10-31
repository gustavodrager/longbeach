import { validateArenaRecord } from './validation'
import type { ArenaClass, Court, Reservation } from './types'
import type { RentalGroup } from './rentals'
import type { OperationalData, OperationalKind } from '../operations/DemoDataProvider'

const check = <T extends { id: string }>(kind: OperationalKind, input: T, snapshot: OperationalData) => validateArenaRecord(kind, input, snapshot)
const court: Court = { id: 'court', name: 'Quadra de teste', sport: 'Futevôlei', status: 'Disponível', openingTime: '07:00', closingTime: '23:00', scheduleConfirmed: true }
const lesson: ArenaClass = { id: 'lesson', name: 'Turma de teste', courtId: court.id, sport: 'Futevôlei', weekDay: 0, startDate: '2030-05-01', startTime: '18:00', endTime: '19:00', teacherId: 'teacher', capacity: 8, studentIds: [], status: 'Ativa', notes: '' }
const reservation: Reservation = { id: 'reservation', name: 'Reserva de teste', courtId: court.id, date: '2030-05-05', startTime: '18:00', endTime: '19:00', customerName: '', phone: '', amount: 0, status: 'Confirmada', notes: '' }
const group: RentalGroup = { id: 'group', name: 'Grupo de teste', sport: 'Futevôlei', courtId: court.id, weekDay: 0, startTime: '18:00', endTime: '19:00', startDate: '2030-05-01', endDate: '', status: 'Ativo', capacity: null, organizerId: '', backupId: '', members: [], monthlyAmount: null, dueDay: null, fifthPolicy: 'A confirmar', extraAmount: null, notes: '' }
const data = (value: Court = court): OperationalData => ({
  students: [], team: [{ id: 'teacher', name: 'Professor de teste', phone: '', role: 'Professor', payAmount: null, payBasis: '', paymentFrequency: '', paymentDay: '', status: 'Ativo', notes: '' }],
  inventory: [], projects: [], courts: [value], reservations: [], classes: [], enrollments: [], rentalGroups: [], rentalMonths: [], rentalAttendances: [], presences: [], financeEntries: [], maintenance: [],
})
const legacy = [{ label: 'sem lista', operatingDays: undefined }, { label: 'lista vazia', operatingDays: [] }, { label: 'dias úteis legados', operatingDays: [1, 2, 3, 4, 5] }]

it.each(legacy.flatMap(value => Array.from({ length: 7 }, (_, weekDay) => ({ ...value, weekDay }))))('aceita reservas, aulas e mensalistas: $label, dia $weekDay', ({ operatingDays, weekDay }) => {
  const snapshot = data({ ...court, operatingDays })
  expect(check('reservations', { ...reservation, date: `2030-05-${String(5 + weekDay).padStart(2, '0')}` }, snapshot)).toBeNull()
  expect(check('classes', { ...lesson, weekDay }, snapshot)).toBeNull()
  expect(check('rentalGroups', { ...group, weekDay }, snapshot)).toBeNull()
})

it.each([-1, 7, 1.5, Number.NaN])('recusa dia de turma ou grupo inválido: %s', weekDay => {
  expect(check('classes', { ...lesson, weekDay }, data())).toMatch(/dia da semana/)
  expect(check('rentalGroups', { ...group, weekDay }, data())).toMatch(/dia e o horário/)
})

it.each(['', 'invalid', '2030-02-30', '0000-01-01'])('recusa datas inválidas: %s', date => {
  expect(check('reservations', { ...reservation, date }, data())).toMatch(/data válida/)
  expect(check('rentalGroups', { ...group, startDate: date }, data())).toMatch(/datas do acordo/)
  if (date) expect(check('classes', { ...lesson, startDate: date }, data())).toMatch(/data de início/)
})

it('mantém horários, manutenção e conflitos ao liberar todos os dias', () => {
  const snapshot = data({ ...court, operatingDays: [] })
  expect(check('reservations', { ...reservation, startTime: '06:00' }, snapshot)).toMatch(/horário/)
  expect(check('classes', { ...lesson, endTime: '24:00' }, snapshot)).toMatch(/horário/)
  expect(check('rentalGroups', { ...group, startTime: '06:00' }, snapshot)).toMatch(/horário/)
  const maintenance = data({ ...court, status: 'Manutenção', operatingDays: [] })
  expect(check('reservations', reservation, maintenance)).toMatch(/manutenção/)
  expect(check('classes', lesson, maintenance)).toMatch(/manutenção/)
  snapshot.reservations = [{ ...reservation, id: 'existing' }]
  expect(check('reservations', reservation, snapshot)).toMatch(/já está ocupado/)
  expect(check('classes', lesson, snapshot)).toMatch(/já está ocupado/)
  snapshot.reservations = []
  snapshot.classes = [{ ...lesson, id: 'existing' }]
  expect(check('reservations', reservation, snapshot)).toMatch(/já está ocupado/)
})

it('permite lista vazia ou restrita sem ignorar estrutura inválida nem horários com reservas', () => {
  for (const operatingDays of [[], [1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6]]) {
    const value = { ...court, operatingDays }, snapshot = data(value)
    snapshot.classes = [lesson]
    expect(check('courts', value, snapshot)).toBeNull()
    expect(check('courts', { ...value, closingTime: '18:30' }, snapshot)).toMatch(/Ajuste a agenda/)
  }
  for (const operatingDays of [[-1], [7], [1.5], [1, 1], [0, 1, 2, 3, 4, 5, 6, 0]]) {
    expect(check('courts', { ...court, operatingDays }, data())).toMatch(/dias informados/)
  }
})
