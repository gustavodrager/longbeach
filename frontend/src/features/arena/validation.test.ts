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

it('aula avulsa exige cliente explícito e professor ativo, sem matrícula', () => {
  const single: Reservation = { ...reservation, activityKind: 'SingleLesson', customerId: 'customer', teacherId: 'teacher' }
  expect(check('reservations', single, data())).toBeNull()
  expect(check('reservations', { ...single, customerId: null }, data())).toMatch(/Selecione o cliente/)
  expect(check('reservations', { ...single, teacherId: '' }, data())).toMatch(/professor ativo/)
  const snapshot = data(); snapshot.team[0] = { ...snapshot.team[0]!, status: 'Inativo' }
  expect(check('reservations', single, snapshot)).toMatch(/professor ativo/)
})

it('cancela aula avulsa existente com professor inativo preservando a identificação', () => {
  const single: Reservation = { ...reservation, activityKind: 'SingleLesson', customerId: 'customer', teacherId: 'teacher' }
  const snapshot = data(); snapshot.reservations = [single]; snapshot.team[0] = { ...snapshot.team[0]!, status: 'Inativo' }
  expect(check('reservations', { ...single, status: 'Cancelada' }, snapshot)).toBeNull()
  expect(check('reservations', { ...single, status: 'Cancelada', teacherId: '' }, snapshot)).toMatch(/professor cadastrado/)
})

it.each([{ rentalGroupId: 'monthly' }, { groupId: 'weekly' }, { status: 'Bloqueio' }])('aula avulsa não aceita contexto de grupo ou bloqueio: %j', patch => {
  expect(check('reservations', { ...reservation, activityKind: 'SingleLesson', customerId: 'customer', teacherId: 'teacher', ...patch }, data())).toMatch(/encontro individual/)
})

it.each([{ activityKind: 'Trial', teacherId: 'teacher' }, { teacherId: 'teacher' }, { rentalGroupId: 'monthly' }, { groupId: 'weekly' }])('preserva o tipo de encontros vinculados existentes: %j', previous => {
  const snapshot = data(); snapshot.reservations = [{ ...reservation, ...previous } as Reservation]
  expect(check('reservations', { ...reservation, activityKind: 'SingleLesson', customerId: 'customer', teacherId: 'teacher' }, snapshot)).toMatch(/tipo deste encontro/)
})


it.each([null, 'rock', ['rock', 'rock'], ['desconhecido'], ['Rock'], [1], Array(16).fill('rock')])('recusa preferências musicais inválidas: %j', musicPreferences => {
  expect(check('rentalGroups', {...group,musicPreferences},data())).toMatch(/preferências musicais/)
})
it('preferências musicais são opcionais e independentes do acordo e dos integrantes', () => {
  expect(check('rentalGroups',group,data())).toBeNull()
  expect(check('rentalGroups',{...group,musicPreferences:[]},data())).toBeNull()
  expect(check('rentalGroups',{...group,musicPreferences:['rock','pagode']},data())).toBeNull()
})
