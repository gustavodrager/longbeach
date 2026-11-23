import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../auth/authContext'
import type { AuthUser } from '../auth/types'
import { DemoDataProvider, useOperations, type OperationalData } from '../operations/DemoDataProvider'
import { blankStudent } from '../operations/studentDraft'
import { ClassStudents } from './ClassStudents'
import type { ArenaClass, Enrollment } from './types'

const owner: AuthUser = { id: 'manager-test', name: 'Gestão de teste', email: 'manager@example.invalid', roles: ['Manager'], permissions: [] }
const student = { ...blankStudent(), id: 'student-a', name: 'Aluno de teste', monthlyAmount: 999 }
const lesson: ArenaClass = { id: 'class-a', name: 'Iniciante', sport: 'Futevôlei', courtId: 'court-a', weekDay: 1, startTime: '18:00', endTime: '19:00', teacherId: 'teacher-a', capacity: 8, studentIds: [], status: 'Ativa', notes: '' }
const enrollment: Enrollment = { id: 'enrollment-a', version: 7, name: 'Aluno de teste · Iniciante', studentId: student.id, classId: lesson.id, startDate: '2026-10-01', status: 'Ativa', monthlyAmount: 150 }
const history: Enrollment = { ...enrollment, id: 'enrollment-history', version: 2, status: 'Encerrada', endDate: '2026-10-15', monthlyAmount: 90 }
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

function server(enrollments = [enrollment, history]) {
  const data: Partial<OperationalData> = { students: [student], classes: [lesson], enrollments }
  const writes: { path: string; body: Enrollment }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as Enrollment
      writes.push({ path, body })
      const saved = { ...body, version: (body.version ?? 0) + 1 }
      data.enrollments = data.enrollments!.map(row => row.id === body.id ? saved : row)
      return json(saved)
    }
    const kind = new URL(path, 'https://test.invalid').pathname.split('/').pop() as keyof OperationalData
    return json(data[kind] ?? [])
  })
  return { data, writes }
}

function Probe() {
  const data = useOperations()
  return <output data-testid="records">{JSON.stringify({ students: data.students, enrollments: data.enrollments })}</output>
}
function mount(user = owner) {
  const auth: AuthContextValue = { user, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
  return render(<AuthContext.Provider value={auth}><MemoryRouter><DemoDataProvider enabled><ClassStudents lesson={lesson} /><Probe /></DemoDataProvider></MemoryRouter></AuthContext.Provider>)
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
afterEach(cleanup)

it('edita o valor do vínculo existente, preservando histórico e distinguindo desconto, zero e a combinar', async () => {
  const { data, writes } = server()
  mount()
  const values = [{ input: '140,00', amount: 140 }, { input: '0', amount: 0 }, { input: '', amount: null }]
  for (const [index, value] of values.entries()) {
    fireEvent.click(await screen.findByRole('button', { name: 'Editar mensalidade de Aluno de teste' }))
    const panel = within(screen.getByRole('dialog', { name: 'Editar mensalidade' }))
    fireEvent.change(panel.getByLabelText('Mensalidade nesta turma (R$)'), { target: { value: value.input } })
    fireEvent.click(panel.getByRole('button', { name: 'Salvar mensalidade' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar mensalidade' })).not.toBeInTheDocument())
    expect(writes[index]).toEqual({ path: `/api/v1/operations/enrollments/${enrollment.id}`, body: { ...enrollment, version: 7 + index, monthlyAmount: value.amount } })
    expect(data.enrollments).toEqual([{ ...enrollment, version: 8 + index, monthlyAmount: value.amount }, history])
    expect(data.students).toEqual([student])
  }
  expect(writes).toHaveLength(3)
  expect(screen.getByText('Mensalidade a combinar')).toBeVisible()
})

it('não oferece edição para preço oculto, vínculo encerrado ou acesso sem escrita financeira', async () => {
  const hidden: Enrollment = { ...enrollment, id: 'enrollment-hidden', costsVisible: false, monthlyAmount: null }
  server([enrollment, hidden, history])
  mount()
  await screen.findByRole('button', { name: 'Editar mensalidade de Aluno de teste' })
  expect(screen.getAllByRole('button', { name: /Editar mensalidade de/ })).toHaveLength(1)
  cleanup()
  mount({ ...owner, id: 'operations-test', roles: ['Operations'], permissions: ['students:read', 'students:write'] })
  await waitFor(() => expect(JSON.parse(screen.getByTestId('records').textContent!).enrollments).toHaveLength(3))
  expect(screen.queryByRole('button', { name: /Editar mensalidade de/ })).not.toBeInTheDocument()
})
