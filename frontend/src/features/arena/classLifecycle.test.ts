import { classScheduledOn, deletionDateLabel, enrollmentCoversDate } from './classLifecycle'
import type { ArenaClass, Enrollment } from './types'

const lesson: ArenaClass = {
  id: 'class', name: 'Turma teste', courtId: 'court', teacherId: 'teacher', sport: 'Futevôlei',
  status: 'Encerrada', weekDay: 4, startTime: '18:00', endTime: '19:00', capacity: 8, studentIds: [], notes: '',
  startDate: '2026-11-01', deletedAt: '2026-11-12T22:00:00Z', deletedEffectiveDate: '2026-11-12', deletedPreviousStatus: 'Ativa',
}

it('preserva a grade anterior e corta as próximas ocorrências da turma excluída', () => {
  expect(classScheduledOn(lesson, '2026-10-29')).toBe(false)
  expect(classScheduledOn(lesson, '2026-11-05')).toBe(true)
  expect(classScheduledOn(lesson, '2026-11-12')).toBe(true)
  expect(classScheduledOn(lesson, '2026-11-19')).toBe(false)
  expect(classScheduledOn(lesson, '2026-11-11')).toBe(false)
})

it('considera o horário local de São Paulo no próprio dia da exclusão', () => {
  expect(classScheduledOn({ ...lesson, deletedAt: '2026-11-12T20:59:59Z' }, '2026-11-12')).toBe(false)
  expect(classScheduledOn({ ...lesson, deletedAt: '2026-11-12T21:00:00Z' }, '2026-11-12')).toBe(false)
  expect(classScheduledOn({ ...lesson, deletedAt: '2026-11-12T21:00:00.001Z' }, '2026-11-12')).toBe(true)
  expect(classScheduledOn({ ...lesson, deletedAt: '2026-11-12T21:00:01Z' }, '2026-11-12')).toBe(true)
  expect(classScheduledOn({ ...lesson, deletedAt: 'invalid' }, '2026-11-12')).toBe(false)
  expect(deletionDateLabel(lesson.deletedAt!)).toContain('19:00')
})

it.each(['Pausada', 'Encerrada'] as const)('não inventa projeções para turma que estava %s', deletedPreviousStatus => {
  expect(classScheduledOn({ ...lesson, deletedPreviousStatus }, '2026-11-05')).toBe(false)
})

it('não torna elegível uma matrícula cancelada antes de começar', () => {
  const enrollment: Enrollment = { id: 'enrollment', name: 'Matrícula', studentId: 'student', classId: lesson.id, status: 'Encerrada', monthlyAmount: 150, startDate: '2026-12-01', endDate: '2026-12-01', closedByClassDeletion: true, cancelledBeforeStart: true }
  expect(enrollmentCoversDate(enrollment, '2026-12-01')).toBe(false)
  expect(enrollmentCoversDate({ ...enrollment, cancelledBeforeStart: false }, '2026-12-01')).toBe(true)
})
