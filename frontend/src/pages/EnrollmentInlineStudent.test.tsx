import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import type { AuthUser } from '../features/auth/types'
import { DemoDataProvider, useOperations, type OperationalData, type Student } from '../features/operations/DemoDataProvider'
import { blankStudent } from '../features/operations/studentDraft'
import { EnrollmentsPage } from './ArenaPages'

const owner: AuthUser = { id: 'enrollment-manager', name: 'Gestão de teste', email: 'manager@example.invalid', roles: ['Manager'], permissions: [] }
const lesson = { id: 'class-a', name: 'Turma de exemplo', sport: 'Futevôlei', courtId: 'court-a', weekDay: 1, startTime: '18:00', endTime: '19:00', teacherId: 'teacher-a', capacity: 8, studentIds: [], status: 'Ativa' as const, notes: '' }
const person = { id: 'customer-a', name: 'Cliente de exemplo', phoneHint: '•••• 7777', incomplete: false }
const clients: QueryClient[] = []
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function Probe() { const data = useOperations(); return <output data-testid="records">{JSON.stringify({ students: data.students, enrollments: data.enrollments })}</output> }
function Navigation() { const navigate = useNavigate(); return <button onClick={() => navigate('/escola/matriculas?class=class-a')}>Sair da edição</button> }
function mount(demoMode = false, user = owner) {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(query)
  const auth: AuthContextValue = { user, isBootstrapping: false, signIn: async () => {}, signInWithGoogle: async () => {}, signOut: async () => {}, changePassword: async () => {}, completeFirstAccessWithGoogle: async () => {} }
  return render(<QueryClientProvider client={query}><AuthContext.Provider value={auth}><DemoDataProvider enabled demoMode={demoMode}><MemoryRouter initialEntries={['/escola/matriculas?class=class-a&acao=novo']}><Routes><Route path="/escola/matriculas" element={<><EnrollmentsPage /><Probe /><Navigation /></>} /></Routes></MemoryRouter></DemoDataProvider></AuthContext.Provider></QueryClientProvider>)
}
function records(): { students: Student[]; enrollments: { studentId: string; classId: string; startDate: string; monthlyAmount: number }[] } { return JSON.parse(screen.getByTestId('records').textContent!) }
type Write = { path: string; body: Record<string, unknown> }
function server({ students = [], studentWrite, lookups = [person] }: { students?: Student[]; studentWrite?: (write: Write, attempt: number) => Response | Promise<Response>; lookups?: typeof person[] } = {}) {
  const data: Partial<OperationalData> = { students, classes: [lesson], enrollments: [] }
  const writes: Write[] = []
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    if (path.startsWith('/api/v1/customers/lookup?')) return json(lookups)
    if (init?.method === 'POST' && path === '/api/v1/customers?scope=students') { writes.push({ path, body: JSON.parse(String(init.body)) }); return json(person, 201) }
    if (init?.method === 'PUT') {
      const write = { path, body: JSON.parse(String(init.body)) }; writes.push(write)
      if (path.includes('/students/')) {
        const count = writes.filter(item => item.path.includes('/students/')).length
        if (studentWrite) return studentWrite(write, count)
        const saved = { ...write.body, name: person.name, phone: '11988887777', version: 1 } as Student
        data.students = [...(data.students ?? []), saved]; return json(saved, 201)
      }
      data.enrollments = [write.body as unknown as OperationalData['enrollments'][number]]; return json(write.body, 201)
    }
    const kind = new URL(path, 'https://test.invalid').pathname.split('/').pop() as keyof OperationalData
    return json(data[kind] ?? [])
  })
  return { writes, fetch }
}
async function editor() { const panel = await screen.findByRole('dialog', { name: 'Matrícula' }); await within(panel).findByRole('option', { name: lesson.name }); return within(panel) }
async function chooseCustomer() {
  fireEvent.change(screen.getByLabelText('Buscar cliente do novo aluno'), { target: { value: 'Cliente' } })
  fireEvent.click(await screen.findByRole('button', { name: /Cliente de exemplo.*7777/ }))
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.stubEnv('VITE_OPERATIONAL_STORAGE', 'local'); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.unstubAllEnvs() })

it('cadastra aluno no modo local e conserva turma, início e mensalidade até salvar a matrícula', async () => {
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify({ classes: [lesson] }))
  const fetch = vi.spyOn(globalThis, 'fetch')
  mount(true); const panel = await editor()
  fireEvent.change(panel.getByLabelText('Início da matrícula'), { target: { value: '2026-11-01' } })
  fireEvent.change(panel.getByLabelText('Mensalidade combinada (R$)'), { target: { value: '300,50' } })
  fireEvent.blur(panel.getByLabelText('Mensalidade combinada (R$)'))
  fireEvent.click(panel.getByRole('button', { name: '+ Cadastrar aluno' }))
  expect(panel.getByLabelText('Nome do novo aluno')).toHaveFocus()
  fireEvent.change(panel.getByLabelText('Nome do novo aluno'), { target: { value: 'Aluno local de exemplo' } })
  fireEvent.change(panel.getByLabelText('Telefone do novo aluno'), { target: { value: '(11) 98888-7777' } })
  fireEvent.submit(panel.getByRole('button', { name: 'Salvar matrícula' }).closest('form')!)
  expect(records().students).toHaveLength(0)
  expect(records().enrollments).toHaveLength(0)
  fireEvent.click(panel.getByRole('button', { name: 'Cadastrar aluno e selecionar' }))
  await waitFor(() => expect(panel.getByLabelText('Aluno')).toHaveValue(records().students[0].id))
  await waitFor(() => expect(panel.getByLabelText('Aluno')).toHaveFocus())
  expect(panel.getByLabelText('Turma')).toHaveValue('class-a')
  expect(panel.getByLabelText('Início da matrícula')).toHaveValue('2026-11-01')
  expect(panel.getByLabelText('Mensalidade combinada (R$)')).toHaveValue('R$ 300,50')
  expect(records().enrollments).toHaveLength(0)
  expect(document.querySelectorAll('form')).toHaveLength(1)
  fireEvent.click(panel.getByRole('button', { name: 'Salvar matrícula' }))
  await waitFor(() => expect(records().enrollments).toHaveLength(1))
  expect(records().enrollments[0]).toMatchObject({ studentId: records().students[0].id, classId: 'class-a', startDate: '2026-11-01', monthlyAmount: 300.5 })
  expect(fetch).not.toHaveBeenCalled()
})

it('voltar do novo aluno preserva também situação e encerramento da matrícula', async () => {
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify({ classes: [lesson] }))
  mount(true); const panel = await editor()
  fireEvent.change(panel.getByLabelText('Início da matrícula'), { target: { value: '2026-11-01' } })
  fireEvent.change(panel.getByLabelText('Mensalidade combinada (R$)'), { target: { value: '150,25' } })
  fireEvent.change(panel.getByLabelText('Situação'), { target: { value: 'Encerrada' } })
  fireEvent.change(panel.getByLabelText('Data de encerramento'), { target: { value: '2026-11-03' } })
  fireEvent.click(panel.getByRole('button', { name: '+ Cadastrar aluno' }))
  fireEvent.change(panel.getByLabelText('Nome do novo aluno'), { target: { value: 'Rascunho de aluno' } })
  fireEvent.click(panel.getByRole('button', { name: 'Voltar à matrícula' }))
  await waitFor(() => expect(panel.getByLabelText('Aluno')).toHaveFocus())
  expect(panel.getByLabelText('Turma')).toHaveValue('class-a')
  expect(panel.getByLabelText('Início da matrícula')).toHaveValue('2026-11-01')
  expect(panel.getByLabelText('Mensalidade combinada (R$)')).toHaveValue('150,25')
  expect(panel.getByLabelText('Situação')).toHaveValue('Encerrada')
  expect(panel.getByLabelText('Data de encerramento')).toHaveValue('2026-11-03')
  expect(records().students).toHaveLength(0)
  expect(records().enrollments).toHaveLength(0)
})

it('cria contato canônico e perfil de aluno uma vez, sem criar login ou submeter matrícula', async () => {
  const { writes } = server(); mount(); const panel = await editor()
  fireEvent.click(panel.getByRole('button', { name: '+ Cadastrar aluno' }))
  expect(panel.getByLabelText('Buscar cliente do novo aluno')).toHaveFocus()
  fireEvent.click(panel.getByRole('button', { name: '+ Cadastrar cliente' }))
  fireEvent.change(panel.getByLabelText('Nome do novo cliente'), { target: { value: person.name } })
  fireEvent.change(panel.getByLabelText('Telefone do novo cliente'), { target: { value: '(11) 98888-7777' } })
  fireEvent.click(panel.getByRole('button', { name: 'Cadastrar e selecionar' }))
  await waitFor(() => expect(panel.getByRole('combobox', { name: 'Cliente do novo aluno selecionado' })).toHaveValue(person.id))
  const add = panel.getByRole('button', { name: 'Cadastrar aluno e selecionar' })
  act(() => { fireEvent.click(add); fireEvent.click(add) })
  await waitFor(() => expect(panel.getByLabelText('Aluno')).toHaveValue(records().students[0].id))
  expect(writes).toHaveLength(2)
  expect(writes[0]).toMatchObject({ path: '/api/v1/customers?scope=students', body: { name: person.name, phone: '11988887777', operationId: expect.any(String) } })
  expect(writes[1].path).toContain('/api/v1/operations/students/')
  expect(writes[1].body).toMatchObject({ customerId: person.id, name: person.name, phone: '', monthlyAmount: 0, status: 'A confirmar' })
  expect(writes[1].body).not.toHaveProperty('userId')
  expect(writes.some(write => /auth|billing|enrollments/.test(write.path))).toBe(false)
  expect(records().enrollments).toHaveLength(0)
  expect(panel.getByLabelText('Turma')).toHaveValue('class-a')
})

it('recupera contato pendente ao reabrir e exige seleção explícita antes de criar aluno', async () => {
  const pending = { operationId: '11111111-1111-4111-8111-111111111111', name: person.name, phone: '11988887777' }
  localStorage.setItem('lb-confirmation:customer-create-v1:enrollment-manager:students:enrollment:novo', JSON.stringify(pending))
  const { writes } = server(); mount(); const panel = await editor()
  fireEvent.click(panel.getByRole('button', { name: '+ Cadastrar aluno' }))
  fireEvent.click(panel.getByRole('button', { name: 'Conferir criação pendente' }))
  const recovered = await panel.findByRole('button', { name: 'Selecionar cliente recuperado' })
  expect(writes).toEqual([{ path: '/api/v1/customers?scope=students', body: pending }])
  expect(records().students).toHaveLength(0)
  expect(records().enrollments).toHaveLength(0)
  fireEvent.click(recovered)
  expect(panel.getByRole('combobox', { name: 'Cliente do novo aluno selecionado' })).toHaveValue(person.id)
  expect(panel.getByLabelText('Turma')).toHaveValue('class-a')
})

it('seleciona ficha existente do cliente sem duplicar aluno nem seus outros papéis', async () => {
  const student: Student = { ...blankStudent(), id: 'existing-student', customerId: person.id, name: person.name }
  const { writes } = server({ students: [student] }); mount(); const panel = await editor()
  fireEvent.click(panel.getByRole('button', { name: '+ Cadastrar aluno' })); await chooseCustomer()
  fireEvent.click(panel.getByRole('button', { name: 'Selecionar aluno cadastrado' }))
  expect(panel.getByLabelText('Aluno')).toHaveValue(student.id)
  expect(records().students).toHaveLength(1)
  expect(writes).toHaveLength(0)
  expect(panel.getByLabelText('Turma')).toHaveValue('class-a')
})

it('repete o mesmo aluno após resposta perdida e mantém a matrícula aberta', async () => {
  const { writes } = server({ studentWrite: (write, attempt) => attempt === 1 ? json({ detail: 'Resposta interrompida' }, 503) : json({ ...write.body, name: person.name, phone: '11988887777' }) })
  mount(); const panel = await editor()
  fireEvent.click(panel.getByRole('button', { name: '+ Cadastrar aluno' })); await chooseCustomer()
  fireEvent.click(panel.getByRole('button', { name: 'Cadastrar aluno e selecionar' }))
  await panel.findByText('Resposta interrompida')
  const retry = panel.getByRole('button', { name: 'Conferir cadastro do aluno' })
  await waitFor(() => expect(retry).toBeEnabled()); fireEvent.click(retry)
  await waitFor(() => expect(panel.getByLabelText('Aluno')).toHaveValue(records().students[0].id))
  expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0])
  expect(records().enrollments).toHaveLength(0)
  expect(panel.getByLabelText('Turma')).toHaveValue('class-a')
})

it('conflito de criação recarrega e reutiliza o aluno criado em outro atendimento', async () => {
  const students: Student[] = []
  const existing: Student = { ...blankStudent(), id: 'student-created-elsewhere', customerId: person.id, name: person.name }
  const { writes } = server({ students, studentWrite: () => { students.push(existing); return json({ detail: 'Este cliente já tem uma ficha de aluno.' }, 409) } })
  mount(); const panel = await editor()
  fireEvent.click(panel.getByRole('button', { name: '+ Cadastrar aluno' })); await chooseCustomer()
  fireEvent.click(panel.getByRole('button', { name: 'Cadastrar aluno e selecionar' }))
  fireEvent.click(await panel.findByRole('button', { name: 'Selecionar aluno cadastrado' }))
  expect(panel.getByLabelText('Aluno')).toHaveValue(existing.id)
  expect(writes).toHaveLength(1)
  expect(records().students).toHaveLength(1)
  expect(records().enrollments).toHaveLength(0)
  expect(panel.getByLabelText('Turma')).toHaveValue('class-a')
})

it('resposta de um painel anterior não seleciona aluno nem fecha outro cadastro em andamento', async () => {
  let finish: (() => void) | undefined
  server({ studentWrite: write => new Promise<Response>(resolve => { finish = () => resolve(json({ ...write.body, name: person.name, phone: '11988887777' })) }) })
  mount(); let panel = await editor()
  fireEvent.click(panel.getByRole('button', { name: '+ Cadastrar aluno' })); await chooseCustomer()
  fireEvent.click(panel.getByRole('button', { name: 'Cadastrar aluno e selecionar' }))
  await waitFor(() => expect(finish).toBeDefined())
  fireEvent.click(screen.getByRole('button', { name: 'Sair da edição' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Matrícula' })).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Matricular aluno' })); panel = await editor()
  fireEvent.change(panel.getByLabelText('Início da matrícula'), { target: { value: '2026-11-02' } })
  fireEvent.click(panel.getByRole('button', { name: '+ Cadastrar aluno' }))
  await act(async () => { finish!() })
  await waitFor(() => expect(records().students).toHaveLength(1))
  expect(panel.getByLabelText('Aluno')).toHaveValue('')
  expect(panel.getByRole('group', { name: 'Cadastrar aluno na matrícula' })).toBeInTheDocument()
  expect(panel.getByLabelText('Início da matrícula')).toHaveValue('2026-11-02')
  expect(records().enrollments).toHaveLength(0)
})

it('duplicidade legada após conflito permite voltar à matrícula para escolher a ficha', async () => {
  const students: Student[] = []
  const { writes } = server({ students, studentWrite: () => { students.push(...['first-student', 'second-student'].map(id => ({ ...blankStudent(), id, customerId: person.id, name: person.name }))); return json({ detail: 'Confira o aluno existente.' }, 409) } })
  mount(); const panel = await editor()
  fireEvent.click(panel.getByRole('button', { name: '+ Cadastrar aluno' })); await chooseCustomer()
  fireEvent.click(panel.getByRole('button', { name: 'Cadastrar aluno e selecionar' }))
  await panel.findByText('Este cliente tem mais de uma ficha de aluno. Volte à matrícula e escolha a ficha existente.')
  const back = panel.getByRole('button', { name: 'Voltar à matrícula' })
  await waitFor(() => expect(back).toBeEnabled()); fireEvent.click(back)
  expect(panel.getByLabelText('Aluno')).toHaveValue('')
  expect(panel.getByLabelText('Turma')).toHaveValue('class-a')
  expect(panel.getAllByRole('option', { name: person.name })).toHaveLength(2)
  expect(writes).toHaveLength(1)
  expect(records().enrollments).toHaveLength(0)
})

it('permite usar cliente existente e esconde criação de contato sem customers:write', async () => {
  const operator: AuthUser = { ...owner, id: 'enrollment-operator', roles: ['Operations'], permissions: ['students:read', 'students:write'] }
  const { writes } = server(); mount(false, operator); const panel = await editor()
  fireEvent.click(panel.getByRole('button', { name: '+ Cadastrar aluno' }))
  expect(panel.queryByRole('button', { name: '+ Cadastrar cliente' })).not.toBeInTheDocument()
  await chooseCustomer(); fireEvent.click(panel.getByRole('button', { name: 'Cadastrar aluno e selecionar' }))
  await waitFor(() => expect(records().students).toHaveLength(1))
  expect(writes).toHaveLength(1); expect(writes[0].path).toContain('/operations/students/')
})

it('não oferece criação ou matrícula para consulta sem students:write', async () => {
  const reader: AuthUser = { ...owner, id: 'enrollment-reader', roles: ['Operations'], permissions: ['students:read'] }
  server(); mount(false, reader)
  await screen.findByRole('heading', { name: 'Matrículas' })
  expect(screen.queryByRole('dialog', { name: 'Matrícula' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '+ Cadastrar aluno' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Matricular aluno' })).not.toBeInTheDocument()
})
