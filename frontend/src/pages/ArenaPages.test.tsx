import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import { DemoDataProvider } from '../features/operations/DemoDataProvider'
import type { AuthUser } from '../features/auth/types'
import { ClassDetailsPage, CourtsPage, AgendaPage, FinanceDetailsPage, FinancePage, MaintenanceDetailsPage, ReservationDetailsPage } from './ArenaPages'
import { DashboardPage } from './DashboardPage'
import { ProjectDetailsPage, TeamDetailsPage, StudentDetailsPage } from './OperationsPages'
import { today } from './arenaUi'

const owner: AuthUser={id:'11111111-1111-1111-1111-111111111111',name:'Admin teste',email:'teste@example.com',roles:['Owner'],permissions:[]}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})}
function RouteState(){const location=useLocation();return <output data-testid="route">{location.pathname}{location.search}</output>}
function start(path:string,demoMode=true,user:AuthUser=owner,staleTime=0){
  const auth:AuthContextValue={user,isBootstrapping:false,signIn:async()=>{},signInWithGoogle:async()=>{},signOut:async()=>{},changePassword:async()=>{}, completeFirstAccessWithGoogle: async () => {}}
  const query=new QueryClient({defaultOptions:{queries:{retry:false,staleTime}}})
  return render(<QueryClientProvider client={query}><AuthContext.Provider value={auth}><DemoDataProvider enabled demoMode={demoMode}><MemoryRouter initialEntries={[path]}><RouteState /><Routes><Route path="/" element={<DashboardPage />} /><Route path="/quadras" element={<CourtsPage />} /><Route path="/agenda" element={<AgendaPage />} /><Route path="/agenda/:reservationId" element={<ReservationDetailsPage />} /><Route path="/escola/:classId" element={<ClassDetailsPage />} /><Route path="/escola/turmas/:classId" element={<ClassDetailsPage />} /><Route path="/financeiro" element={<FinancePage />} /><Route path="/financeiro/:entryId" element={<FinanceDetailsPage />} /><Route path="/alunos/:studentId" element={<StudentDetailsPage />} /><Route path="/equipe/:memberId" element={<TeamDetailsPage />} /><Route path="/projetos/:projectId" element={<ProjectDetailsPage />} /><Route path="/manutencao/:maintenanceId" element={<MaintenanceDetailsPage />} /></Routes></MemoryRouter></DemoDataProvider></AuthContext.Provider></QueryClientProvider>)
}
const court={id:'22222222-2222-2222-2222-222222222222',name:'Quadra 1',sport:'Futevôlei',status:'Disponível',openingTime:'07:00',closingTime:'23:00'}
beforeEach(()=>{localStorage.clear();sessionStorage.clear();vi.stubEnv('VITE_DEMO_MODE','true');vi.stubEnv('VITE_OPERATIONAL_STORAGE','local')})
afterEach(()=>vi.unstubAllEnvs())

it('distingue falta de cadastro de zero e recolhe áreas ainda não configuradas', async () => {
  start('/')
  expect(within(screen.getByRole('link', { name: /Reservas de hoje/ })).getByText('Sem cadastros')).toBeInTheDocument()
  expect(within(screen.getByRole('link', { name: /Tempo de quadra disponível hoje/ })).getByText('Sem quadras')).toBeInTheDocument()
  expect(screen.getByText('Cadastros ainda não disponíveis para acompanhar pendências.')).toBeInTheDocument()
  await userEvent.click(screen.getByText('Cadastros a completar'))
  expect(screen.getAllByText('Sem cadastros · acompanhamento ainda não iniciado')).toHaveLength(4)
  expect(screen.queryByText('Nenhuma pendência nos cadastros consultados.')).not.toBeInTheDocument()
})

it('omite alertas zerados quando o estoque cadastrado está acima do mínimo', async () => {
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify({ inventory: [{ id: 'material-test', name: 'Rede', quantity: 5, minimum: 2 }] }))
  start('/')
  expect(screen.queryByRole('link', { name: /Materiais para repor/ })).not.toBeInTheDocument()
  expect(screen.getByText('Nenhuma pendência nos cadastros consultados.')).toBeInTheDocument()
})

it('destaca apenas pendências existentes e abre sua composição sem filtro de período', async () => {
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify({ inventory: [{ id: 'material-test', name: 'Rede', quantity: 1, minimum: 2 }] }))
  start('/?from=2020-01-01&to=2020-01-02')
  expect(screen.getByRole('link', { name: /Materiais para repor/ })).toHaveAttribute('href', '/administracao/materiais?low=1')
  expect(screen.queryByRole('link', { name: /Projetos com prazo vencido/ })).not.toBeInTheDocument()
})

it('períodos rápidos alteram as duas datas e preservam a operação de hoje', async () => {
  const day = today()
  start('/?from=2020-01-01&to=2020-01-02')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Este mês' }))
  expect(screen.getByLabelText('De')).toHaveValue(day.slice(0, 7) + '-01')
  expect(screen.getByLabelText('Até')).toHaveValue(day)
  expect(screen.getByRole('link', { name: /Reservas de hoje/ })).toHaveAttribute('href', expect.stringContaining('date=' + day))
  await user.click(screen.getByRole('button', { name: 'Hoje' }))
  expect(screen.getByLabelText('De')).toHaveValue(day)
  expect(screen.getByLabelText('Até')).toHaveValue(day)
  fireEvent.change(screen.getByLabelText('De'), { target: { value: '2099-01-01' } })
  expect(screen.getByText(/Escolha um período válido/)).toHaveAttribute('role', 'alert')
  expect(screen.queryByRole('link', { name: /Recebimentos registrados/ })).not.toBeInTheDocument()
})

it('calcula a grade atual sem duplicar alunos nem incluir turmas futuras ou encerradas',()=>{
  const current={id:'current',name:'Turma atual',status:'Ativa',startDate:'2020-01-01',startTime:'17:00',endTime:'18:00',capacity:6}
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({classes:[current,{...current,id:'second'},{...current,id:'future',startDate:'2099-01-01'},{...current,id:'closed',status:'Encerrada'}],enrollments:[{id:'one',studentId:'student',classId:'current',status:'Ativa',startDate:'2020-01-01'},{id:'two',studentId:'student',classId:'second',status:'Ativa',startDate:'2020-01-01'},{id:'three',studentId:'another',classId:'future',status:'Ativa',startDate:'2099-01-01'}]}))
  start('/')
  const section=screen.getByRole('region',{name:'Grade de aulas atual'})
  expect(within(section).getByText('2 h de aulas por semana')).toBeInTheDocument()
  expect(within(section).getByText('2/12')).toBeInTheDocument()
  expect(within(within(section).getByRole('link',{name:/Alunos na grade atual/})).getByText('1')).toBeInTheDocument()
})

it('registra reserva uma vez em dois envios e preserva filtros ao abrir a ficha',async()=>{
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[court]}))
  start(`/agenda/novo?date=${today()}&court=${court.id}`)
  fireEvent.change(screen.getByLabelText('Nome da reserva'),{target:{value:'Treino do grupo'}})
  expect(screen.queryByLabelText('Quadra')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Nome do cliente ou grupo'),{target:{value:'Grupo A'}})
  const form=screen.getByRole('button',{name:'Salvar reserva'}).closest('form')!
  act(()=>{fireEvent.submit(form);fireEvent.submit(form)})
  expect(await screen.findByRole('heading',{name:'Treino do grupo'})).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem('longbeach-os-demo-v1')??'{}').reservations).toHaveLength(1)
  expect(screen.getByTestId('route')).toHaveTextContent(`date=${today()}`)
  expect(screen.getByRole('link',{name:'← Agenda e recepção'})).toHaveAttribute('href',expect.stringContaining(`court=${court.id}`))
})

it('mostra recebimentos pela data paga, abre a composição e preserva período ao voltar',async()=>{
  const day=today();const paid={id:'33333333-3333-3333-3333-333333333333',name:'Mensalidade de teste',direction:'Receber',origin:'Escola',amount:120,dueDate:'2000-01-01',status:'Pago',paidDate:day,notes:''}
  const pending={...paid,id:'44444444-4444-4444-4444-444444444444',name:'Valor ainda pendente',amount:80,status:'Pendente',paidDate:'',dueDate:day}
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({financeEntries:[paid,pending]}))
  start(`/?from=${day}&to=${day}`)
  const user=userEvent.setup();const card=screen.getByRole('link',{name:/Recebimentos registrados/})
  expect(within(card).getByText(/120,00/)).toBeInTheDocument()
  await user.click(card)
  expect(await screen.findByRole('heading',{name:'Financeiro operacional'})).toBeInTheDocument()
  expect(screen.queryByText('Valor ainda pendente')).not.toBeInTheDocument()
  await user.click(screen.getByRole('link',{name:/Mensalidade de teste/}))
  expect(await screen.findByRole('heading',{name:'Mensalidade de teste'})).toBeInTheDocument()
  expect(screen.getByTestId('route')).toHaveTextContent('dateField=paidDate')
  await user.click(screen.getByRole('link',{name:/← (Financeiro|Lançamentos)/}))
  expect(screen.getByTestId('route')).toHaveTextContent(`from=${day}`)
  expect(screen.getByTestId('route')).toHaveTextContent('status=Pago')
})

it('falha ao salvar mantém a reserva e reenvia o mesmo identificador sem duplicar',async()=>{
  vi.stubEnv('VITE_DEMO_MODE','false');let attempts=0
  const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
    if(init?.method==='PUT'){attempts++;if(attempts===1)return json({message:'Falha temporária ao salvar.'},503);return json(JSON.parse(String(init.body)),201)}
    return json(String(input).endsWith('/courts')?[court]:[])
  })
  start('/agenda/novo',false)
  const user=userEvent.setup();await waitFor(()=>expect(screen.queryByText('Carregando registros da arena…')).not.toBeInTheDocument())
  await user.type(screen.getByLabelText('Nome da reserva'),'Reserva com conexão instável')
  expect(screen.queryByLabelText('Quadra')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:'Salvar reserva'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha temporária')
  expect(screen.getByLabelText('Nome da reserva')).toHaveValue('Reserva com conexão instável')
  await user.click(screen.getByRole('button',{name:'Salvar reserva'}))
  expect(await screen.findByRole('heading',{name:'Reserva com conexão instável'})).toBeInTheDocument()
  const writes=fetchMock.mock.calls.filter(([,init])=>init?.method==='PUT')
  expect(writes).toHaveLength(2)
  expect(writes[0][0]).toBe(writes[1][0])
})

it('produção lê a API e não envia cadastros locais do navegador',async()=>{
  vi.stubEnv('VITE_DEMO_MODE','false')
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({students:[{id:'legado-local',name:'Não importar automaticamente'}]}))
  const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(json([]))
  start('/',false)
  await waitFor(()=>expect(fetchMock).toHaveBeenCalledWith('/api/v1/operations/students',expect.any(Object)))
  await waitFor(()=>expect(screen.queryByText('Carregando registros da arena…')).not.toBeInTheDocument())
  expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='PUT')).toHaveLength(0)
  expect(screen.queryByText('Não importar automaticamente')).not.toBeInTheDocument()
})

it('não apresenta custo redigido como zero para uma pessoa sem acesso financeiro',async()=>{
  vi.stubEnv('VITE_DEMO_MODE','false')
  const employee={id:'55555555-5555-5555-5555-555555555555',name:'Pessoa da equipe',phone:'',role:'Professor de futevôlei',payAmount:0,payBasis:'Por hora',paymentFrequency:'Semanal',paymentDay:'',status:'Ativo',notes:'Observação do acordo financeiro restrito',costsVisible:false}
  vi.spyOn(globalThis,'fetch').mockResolvedValue(json([employee]))
  start(`/equipe/${employee.id}`,false,{...owner,roles:['Operations'],permissions:['employees:read']})
  expect(await screen.findByRole('heading',{name:'Pessoa da equipe'})).toBeInTheDocument()
  expect(screen.getByText('Acesso restrito')).toBeInTheDocument()
  expect(screen.queryByText(/R\$\s*0,00/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Editar dados'})).not.toBeInTheDocument()
  expect(screen.queryByText('Observação do acordo financeiro restrito')).not.toBeInTheDocument()
})

it('cobrança criada pela reserva conserva a origem e volta ao lançamento específico',async()=>{
  const reservation={id:'66666666-6666-6666-6666-666666666666',name:'Treino de sábado',courtId:court.id,date:today(),startTime:'10:00',endTime:'11:00',customerName:'Grupo A',phone:'',amount:150,status:'Confirmada',notes:''}
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[court],reservations:[reservation]}))
  start(`/financeiro/novo?origin=Locações&source=${reservation.id}&range=all`)
  expect(screen.getByLabelText('Descrição do lançamento')).toHaveValue('Locação · Treino de sábado')
  expect(screen.getByLabelText('Valor (R$)')).toHaveValue(150)
  fireEvent.click(screen.getByRole('button',{name:'Salvar lançamento'}))
  expect(await screen.findByRole('heading',{name:'Locação · Treino de sábado'})).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem('longbeach-os-demo-v1')??'{}').financeEntries[0]).toMatchObject({sourceId:reservation.id,sourceKind:'reservations',origin:'Locações',status:'Pendente',amount:150})
  expect(screen.getByRole('link',{name:'Ver registro de origem →'})).toHaveAttribute('href',`/agenda/${reservation.id}`)
  expect(screen.getByRole('link',{name:/← (Financeiro|Lançamentos)/})).toHaveAttribute('href',expect.stringContaining(`source=${reservation.id}`))
})

it('recepção considera aulas na disponibilidade sem divulgar turma, professor ou alunos',async()=>{
  vi.stubEnv('VITE_DEMO_MODE','false')
  const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async(input)=>{
    const path=String(input)
    if(path.includes('/courts/schedule?'))return json({date:today(),updatedAtUtc:new Date().toISOString(),courts:[{courtId:court.id,openingTime:'07:00',closingTime:'23:00',availableMinutes:780,reservedMinutes:60,classMinutes:120,closedForMaintenance:false,hasConflict:false,blocks:[{source:'Aula',startTime:'18:00',endTime:'20:00',sourceId:null}]}]})
    return json(path.endsWith('/courts')?[court]:[])
  })
  start(`/agenda?view=day&date=${today()}`,false,{...owner,roles:['Operations'],permissions:['projects:read']})
  expect(await screen.findByText('1 h reservadas ou bloqueadas · 2 h de aulas · 13 h livres no dia')).toBeInTheDocument()
  expect(screen.getByText('Aula',{selector:'strong'})).toBeInTheDocument()
  expect(screen.queryByRole('link',{name:/18:00.*Aula/})).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([input])=>String(input).endsWith('/students')||String(input).endsWith('/classes')||String(input).endsWith('/team'))).toBe(false)
})

it('reservas de hoje abre exatamente a composição do indicador, sem bloqueios, canceladas ou aulas',async()=>{
  const day=today();const reservation={id:'77777777-7777-7777-7777-777777777777',name:'Reserva confirmada',courtId:court.id,date:day,startTime:'10:00',endTime:'11:00',customerName:'Grupo teste',phone:'',amount:100,status:'Confirmada',notes:''}
  const block={...reservation,id:'88888888-8888-8888-8888-888888888888',name:'Bloqueio para limpeza',status:'Bloqueio',startTime:'11:00',endTime:'12:00'}
  const canceled={...reservation,id:'99999999-9999-9999-9999-999999999999',name:'Reserva cancelada',status:'Cancelada'}
  const lesson={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',name:'Turma do dia',sport:'Futevôlei',courtId:court.id,weekDay:new Date(`${day}T12:00:00`).getDay(),startTime:'18:00',endTime:'19:00',teacherId:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',capacity:8,studentIds:[],status:'Ativa',notes:''}
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[court],reservations:[reservation,block,canceled],classes:[lesson]}))
  start('/')
  const card=screen.getByRole('link',{name:/Reservas de hoje/})
  expect(within(card).getByText('1')).toBeInTheDocument()
  await userEvent.setup().click(card)
  expect(await screen.findByRole('heading',{name:'Agenda'})).toBeInTheDocument()
  expect(screen.getByLabelText('Mostrar')).toHaveValue('reservations')
  expect(screen.getByRole('button',{name:/Reserva confirmada/})).toBeInTheDocument()
  expect(screen.queryByText('Bloqueio para limpeza')).not.toBeInTheDocument()
  expect(screen.queryByText('Reserva cancelada')).not.toBeInTheDocument()
  expect(screen.queryByText('Turma do dia')).not.toBeInTheDocument()
})

it('despesa criada pela manutenção conserva vínculo, tipo e retorno ao serviço original',async()=>{
  const maintenance={id:'cccccccc-cccc-cccc-cccc-cccccccccccc',name:'Trocar rede da quadra',area:'Quadra 1',owner:'Equipe teste',dueDate:today(),status:'Aberta',priority:'Normal',notes:''}
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({maintenance:[maintenance]}))
  start(`/manutencao/${maintenance.id}`)
  const user=userEvent.setup();await user.click(screen.getByRole('link',{name:'Ver despesas vinculadas →'}))
  await user.click(screen.getByRole('link',{name:'+ Novo lançamento'}))
  expect(screen.getByLabelText('Descrição do lançamento')).toHaveValue('Manutenção · Trocar rede da quadra')
  expect(screen.getByLabelText('Tipo')).toHaveValue('Pagar')
  expect(screen.getByLabelText('Origem')).toHaveValue('Arena')
  fireEvent.change(screen.getByLabelText('Valor (R$)'),{target:{value:'90'}})
  await user.click(screen.getByRole('button',{name:'Salvar lançamento'}))
  expect(await screen.findByRole('heading',{name:'Manutenção · Trocar rede da quadra'})).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem('longbeach-os-demo-v1')??'{}').financeEntries[0]).toMatchObject({sourceId:maintenance.id,sourceKind:'maintenance',origin:'Arena',direction:'Pagar',amount:90})
  expect(screen.getByRole('link',{name:'Ver registro de origem →'})).toHaveAttribute('href',`/manutencao/${maintenance.id}`)
  await user.click(screen.getByRole('link',{name:/← (Financeiro|Lançamentos)/}))
  expect(screen.getByRole('link',{name:/Manutenção · Trocar rede da quadra/})).toBeInTheDocument()
  expect(screen.getByTestId('route')).toHaveTextContent('sourceKind=maintenance')
})

it('remover ou renomear uma tarefa não transfere identidade nem conclusão para outra tarefa',async()=>{
  const project={id:'dddddddd-dddd-dddd-dddd-dddddddddddd',name:'Cuidar da arena',description:'',status:'Em andamento',startDate:'',dueDate:'',owner:'Equipe teste',estimatedCost:0,actualCost:0,notes:'',tasks:[{id:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',title:'Comprar rede',done:true},{id:'ffffffff-ffff-ffff-ffff-ffffffffffff',title:'Instalar rede',done:false}]}
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({projects:[project]}))
  start(`/projetos/${project.id}`)
  const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Editar projeto'}))
  await user.click(screen.getByRole('button',{name:'Remover tarefa 1'}))
  expect(screen.getByLabelText('Tarefa 1')).toHaveValue('Instalar rede')
  expect(screen.getByRole('checkbox',{name:'Concluir tarefa 1'})).not.toBeChecked()
  fireEvent.change(screen.getByLabelText('Tarefa 1'),{target:{value:'Instalar e conferir rede'}})
  await user.click(screen.getByRole('button',{name:'+ Adicionar tarefa'}))
  fireEvent.change(screen.getByLabelText('Tarefa 2'),{target:{value:'Liberar quadra'}})
  await user.click(screen.getByRole('button',{name:'Salvar projeto'}))
  await waitFor(()=>expect(JSON.parse(localStorage.getItem('longbeach-os-demo-v1')??'{}').projects[0].tasks).toHaveLength(2))
  const tasks=JSON.parse(localStorage.getItem('longbeach-os-demo-v1')??'{}').projects[0].tasks
  expect(tasks[0]).toEqual({id:project.tasks[1].id,title:'Instalar e conferir rede',done:false})
  expect(tasks[1]).toMatchObject({title:'Liberar quadra',done:false})
  expect(tasks[1].id).not.toBe(project.tasks[0].id)
  expect(tasks[1].id).not.toBe(project.tasks[1].id)
})


it('salva dias úteis até meia-noite mantendo a conferência da agenda pendente', async () => {
  start('/quadras')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', {name:'Configurar funcionamento'}))
  await user.type(screen.getByLabelText('Nome da quadra'), 'Quadra principal')
  fireEvent.change(screen.getByLabelText('Abre às'), {target:{value:'06:00'}})
  fireEvent.change(screen.getByLabelText('Fecha às'), {target:{value:'24:00'}})
  await user.click(screen.getByLabelText('Sábado'))
  await user.click(screen.getByLabelText('Domingo'))
  await user.click(screen.getByRole('button', {name:'Salvar quadra'}))
  expect(await screen.findByText('Funcionamento da arena')).toBeInTheDocument()
  expect(screen.queryByRole('button', {name:'+ Adicionar quadra'})).not.toBeInTheDocument()
  const saved = JSON.parse(localStorage.getItem('longbeach-os-demo-v1')??'{}').courts
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({name:'Quadra principal',openingTime:'06:00',closingTime:'24:00',operatingDays:[1,2,3,4,5],scheduleConfirmed:false})
  expect(screen.getByText('Agenda atual aguardando conferência')).toBeInTheDocument()
})

it('distingue horas de funcionamento de horas livres com agenda não conferida', async () => {
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[{...court,openingTime:'06:00',closingTime:'24:00',operatingDays:[1,2,3,4,5],scheduleConfirmed:false}]}))
  start('/agenda?view=day&date=2026-10-06')
  expect(await screen.findByText('Disponibilidade não verificada')).toBeInTheDocument()
  expect(screen.queryByText(/18 h disponíveis/)).not.toBeInTheDocument()
})

it('mostra fechamento no sábado sem atribuir capacidade livre à quadra', async () => {
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[{...court,openingTime:'06:00',closingTime:'24:00',operatingDays:[1,2,3,4,5]}]}))
  start('/agenda?view=day&date=2026-10-10')
  expect(await screen.findByText('Fechada neste dia da semana')).toBeInTheDocument()
  expect(screen.queryByText(/18 h disponíveis/)).not.toBeInTheDocument()
})

it('filtra financeiro por unidade sem atribuir Arena automaticamente à Quadra',async()=>{
  const row={direction:'Receber',amount:100,dueDate:today(),status:'Pendente',paidDate:'',notes:''}
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({financeEntries:[
    {...row,id:'bar-test',name:'Venda teste unidade',origin:'Bar'},
    {...row,id:'court-test',name:'Aula teste unidade',origin:'Escola'},
    {...row,id:'pending-test',name:'Referência indefinida',origin:'Arena'},
  ]}))
  const user=userEvent.setup();start('/financeiro?range=all&unit=quadra')
  expect(await screen.findByText('Aula teste unidade')).toBeInTheDocument()
  expect(screen.queryByText('Venda teste unidade')).not.toBeInTheDocument()
  expect(screen.queryByText('Referência indefinida')).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Unidade / destinação'),'unclassified')
  expect(await screen.findByText('Referência indefinida')).toBeInTheDocument()
  expect(screen.queryByText('Aula teste unidade')).not.toBeInTheDocument()
})

it('salva destinação compartilhada sem transformar o custo em duas despesas',async()=>{
  const user=userEvent.setup();start('/financeiro/novo')
  await user.type(screen.getByLabelText('Descrição do lançamento'),'Limpeza compartilhada')
  await user.selectOptions(screen.getByLabelText('Tipo'),'Pagar')
  await user.selectOptions(screen.getByLabelText('Unidade de negócio / destinação'),'shared')
  await user.clear(screen.getByLabelText('Valor (R$)'));await user.type(screen.getByLabelText('Valor (R$)'),'100')
  await user.click(screen.getByRole('button',{name:'Salvar lançamento'}))
  await waitFor(()=>{
    const saved=JSON.parse(localStorage.getItem('longbeach-os-demo-v1')!).financeEntries
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({amount:100,allocationScope:'Shared',businessUnitId:null,status:'Pendente'})
  })
})

it.each(['PagBank', 'C6'])('registra Pix da Quadra na conta %s sem dar baixa automática', async account => {
  const user=userEvent.setup();start('/financeiro/novo')
  await user.type(screen.getByLabelText('Descrição do lançamento'),'Aula particular teste')
  await user.selectOptions(screen.getByLabelText('Origem do recebimento'),'CourtPix')
  expect(screen.getByLabelText('Unidade de negócio / destinação')).toHaveValue('quadra')
  expect(screen.getByLabelText('Conta de recebimento')).toBeRequired()
  await user.selectOptions(screen.getByLabelText('Conta de recebimento'),account)
  await user.clear(screen.getByLabelText('Valor (R$)'));await user.type(screen.getByLabelText('Valor (R$)'),'120')
  await user.click(screen.getByRole('button',{name:'Salvar lançamento'}))
  await waitFor(()=>expect(JSON.parse(localStorage.getItem('longbeach-os-demo-v1')!).financeEntries[0]).toMatchObject({
    receiptSource:'CourtPix',receivingAccount:account,businessUnitId:'quadra',allocationScope:'Unit',amount:120,status:'Pendente',paidDate:'',
  }))
  expect(screen.getByText('Pix de aula, mensalidade ou serviço da Quadra')).toBeInTheDocument()
})

it('maquininha e PagVendas fixam Bar; trocar para despesa remove os dados de recebimento', async () => {
  const user=userEvent.setup();start('/financeiro/novo')
  for(const source of ['PagBankTerminal','PagVendas']) {
    await user.selectOptions(screen.getByLabelText('Origem do recebimento'),source)
    expect(screen.getByLabelText('Unidade de negócio / destinação')).toHaveValue('bar')
  }
  await user.selectOptions(screen.getByLabelText('Conta de recebimento'),'C6')
  await user.selectOptions(screen.getByLabelText('Tipo'),'Pagar')
  expect(screen.queryByLabelText('Origem do recebimento')).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Tipo'),'Receber')
  expect(screen.getByLabelText('Origem do recebimento')).toHaveValue('')
  expect(screen.getByLabelText('Conta de recebimento')).toHaveValue('')
})

const fridayClass={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',name:'Aula de sexta',sport:'Futevôlei',courtId:court.id,weekDay:5,startDate:'2026-10-09',startTime:'17:00',endTime:'18:00',teacherId:'',capacity:6,studentIds:[],status:'Ativa',notes:''}
const fridayReservation={id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',name:'Locação de sexta',courtId:court.id,date:'2026-10-09',startTime:'19:00',endTime:'20:00',customerName:'Grupo teste',phone:'',amount:100,status:'Confirmada',notes:''}

it('lista aulas por ocorrência junto das reservas e mantém a mesma seleção no dia',async()=>{
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[court],classes:[fridayClass],reservations:[fridayReservation]}))
  start('/agenda?view=list&from=2026-10-09&to=2026-10-16&date=2026-10-09')
  expect(await screen.findByText('3 atividades')).toBeInTheDocument()
  expect(screen.getAllByRole('button',{name:/Aula de sexta/})).toHaveLength(2)
  expect(screen.getByRole('button',{name:/Locação de sexta/})).toBeInTheDocument()
  await userEvent.setup().selectOptions(screen.getByLabelText('Visualização'),'day')
  expect(await screen.findByText('2 atividades')).toBeInTheDocument()
  expect(screen.getAllByRole('button',{name:/Aula de sexta/})).toHaveLength(1)
})

it('não projeta aulas antes da vigência e filtra aula pelo nome e pela quadra',async()=>{
  const otherCourt={...court,id:'cccccccc-cccc-cccc-cccc-cccccccccccc',name:'Quadra 2'}
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[court,otherCourt],classes:[fridayClass,{...fridayClass,id:'dddddddd-dddd-dddd-dddd-dddddddddddd',courtId:otherCourt.id,name:'Aula em outra quadra'}],reservations:[fridayReservation]}))
  start(`/agenda?view=list&from=2026-10-02&to=2026-10-09&court=${court.id}&q=Aula`)
  expect(await screen.findByText('1 atividade')).toBeInTheDocument()
  expect(screen.getAllByRole('button',{name:/Aula de sexta/})).toHaveLength(1)
  expect(screen.queryByText('Aula em outra quadra')).not.toBeInTheDocument()
  expect(screen.queryByText('Locação de sexta')).not.toBeInTheDocument()
})

it('filtro de situação limita a seleção sem alterar a ocupação real',async()=>{
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[court],classes:[fridayClass],reservations:[fridayReservation]}))
  start('/agenda?view=day&date=2026-10-09&status=Confirmada')
  expect(await screen.findByText('1 h reservadas ou bloqueadas · 1 h de aulas · 14 h livres no dia')).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:/Aula de sexta/})).not.toBeInTheDocument()
  expect(screen.getByText(/A disponibilidade também considera as aulas/)).toBeInTheDocument()
})

it('falha da consulta por período não transforma aulas desconhecidas em agenda vazia',async()=>{
  vi.stubEnv('VITE_DEMO_MODE','false')
  vi.spyOn(globalThis,'fetch').mockImplementation(async(input)=>{
    const path=String(input)
    if(path.includes('/schedule-range'))return json({message:'Consulta indisponível'},503)
    if(path.endsWith('/courts'))return json([court])
    if(path.endsWith('/reservations'))return json([fridayReservation])
    return json([])
  })
  start('/agenda?view=list&from=2026-10-09&to=2026-10-09',false)
  expect(await screen.findByText(/As aulas não puderam ser consultadas/)).toBeInTheDocument()
  expect(screen.queryByText('Nenhuma atividade corresponde aos filtros.')).not.toBeInTheDocument()
  expect(screen.queryByText('1 atividade')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:/Locação de sexta/})).toBeInTheDocument()
})

it('ocupação de aula sem permissão da Escola aparece sem nome ou link privado',async()=>{
  vi.stubEnv('VITE_DEMO_MODE','false')
  const reception: AuthUser={...owner,roles:['Operations'],permissions:['projects:read']}
  vi.spyOn(globalThis,'fetch').mockImplementation(async(input)=>{
    const path=String(input)
    if(path.includes('/schedule-range'))return json({from:'2026-10-09',to:'2026-10-09',days:[{date:'2026-10-09',courts:[{courtId:court.id,blocks:[{source:'Aula',startTime:'17:00',endTime:'18:00',sourceId:null}]}]}]})
    if(path.endsWith('/courts'))return json([court])
    return json([])
  })
  start('/agenda?view=list&from=2026-10-09&to=2026-10-09',false,reception)
  expect(await screen.findByText('1 atividade')).toBeInTheDocument()
  expect(screen.queryByRole('link',{name:/Aula/})).not.toBeInTheDocument()
  expect(screen.getByText('Ocupa a quadra neste horário')).toBeInTheDocument()
})

it('mantém filtros recolhidos e permite abrir, pesquisar e limpar a seleção',async()=>{
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[court],classes:[fridayClass],reservations:[fridayReservation]}))
  start('/agenda?view=day&date=2026-10-09')
  expect(await screen.findByText('2 atividades')).toBeInTheDocument()
  const disclosure=screen.getByText('Filtros').closest('details')!
  expect(disclosure).not.toHaveAttribute('open')
  const user=userEvent.setup();await user.click(screen.getByText('Filtros'))
  await user.type(screen.getByRole('searchbox',{name:'Buscar'}),'Aula')
  expect(await screen.findByText('1 atividade')).toBeInTheDocument()
  await user.click(screen.getByRole('link',{name:'Limpar filtros'}))
  expect(await screen.findByText('2 atividades')).toBeInTheDocument()
})

it('abre a semana por padrão, soma ocupação sem duplicar e destaca sem liberar horários',async()=>{
  const group={id:'group-monthly',name:'Mensalistas da noite',members:[],organizerId:'',notes:''}
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[{...court,openingTime:'16:00',closingTime:'22:00',operatingDays:[5],scheduleConfirmed:true}],classes:[fridayClass],rentalGroups:[group],reservations:[{...fridayReservation,rentalGroupId:group.id,startTime:'17:30',endTime:'19:00'},{...fridayReservation,id:'canceled',status:'Cancelada',name:'Cancelada não ocupa',startTime:'20:00',endTime:'21:00'}]}))
  start('/agenda?date=2026-10-09')
  await userEvent.click(screen.getByText('Resumo da semana'))
  const dashboard=screen.getByRole('region',{name:'Resumo da semana'})
  await waitFor(()=>expect(within(dashboard).getByText('4 h')).toBeInTheDocument())
  expect(within(dashboard).getByText('2 h')).toBeInTheDocument()
  expect(screen.queryByText('Quadra 1')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Quadra')).not.toBeInTheDocument()
  expect(screen.queryByText('Cancelada não ocupa')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:/Aula.*17:00–18:00.*Aula de sexta/})).toBeInTheDocument()
  const member=screen.getByRole('button',{name:/Mensalista.*17:30–19:00.*Mensalistas da noite/})
  expect(member).toBeInTheDocument()
  const user=userEvent.setup();await user.click(screen.getByText('Filtros'))
  await user.selectOptions(screen.getByLabelText('Destacar atividade'),'aula')
  expect(member).toHaveClass('is-muted')
  expect(within(dashboard).getByText('4 h')).toBeInTheDocument()
  expect(screen.getByRole('link',{name:'Nova reserva 09/10/2026 19:00–22:00'})).toHaveAttribute('href',expect.stringContaining('end=20%3A00'))
})

it('detalhes de aula mostram cadastro atual e voltam ao mesmo horário com foco',async()=>{
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[court],classes:[{...fridayClass,teacherId:'teacher'}],team:[{id:'teacher',name:'Professor Teste'}],students:[{id:'student',name:'Aluna Teste'}],enrollments:[{id:'enroll',classId:fridayClass.id,studentId:'student',status:'Ativa'}]}))
  start('/agenda?date=2026-10-09')
  const trigger=await screen.findByRole('button',{name:/Aula.*17:00–18:00.*Aula de sexta/})
  const user=userEvent.setup();await user.click(trigger)
  const panel=screen.getByRole('dialog',{name:'Aula de sexta'})
  expect(within(panel).getByText('Professor Teste')).toBeInTheDocument()
  expect(within(panel).getByText('Aluna Teste')).toBeInTheDocument()
  expect(within(panel).getByText('Cadastro atual da turma e das matrículas.')).toBeInTheDocument()
  expect(within(panel).queryByText(/cobrança|mensalidade/i)).not.toBeInTheDocument()
  await user.click(within(panel).getByRole('button',{name:'Fechar Aula de sexta'}))
  await waitFor(()=>expect(trigger).toHaveFocus())
  expect(screen.getByTestId('route')).toHaveTextContent('/agenda?date=2026-10-09')
})

it('mensalista usa participantes do mês; recorrência avulsa continua locação',async()=>{
  const group={id:'monthly',name:'Grupo mensal',organizerId:'owner',members:[{id:'owner',name:'Responsável atual',status:'Ativo'},{id:'new',name:'Participante novo',status:'Ativo'}],notes:''}
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[court],rentalGroups:[group],rentalMonths:[{id:'month',rentalGroupId:group.id,month:'2026-10',members:[{id:'old',name:'Participante do mês'}]}],reservations:[{...fridayReservation,rentalGroupId:group.id,rentalMonth:'2026-10'},{...fridayReservation,id:'generic',name:'Recorrência avulsa',groupId:'recurring',startTime:'20:00',endTime:'21:00'}]}))
  start('/agenda?date=2026-10-09')
  await userEvent.setup().click(await screen.findByRole('button',{name:/Mensalista.*Grupo mensal/}))
  const panel=screen.getByRole('dialog',{name:'Grupo mensal'})
  expect(within(panel).getByText('Participante do mês')).toBeInTheDocument()
  expect(within(panel).queryByText('Participante novo')).not.toBeInTheDocument()
  expect(within(panel).getByText('Responsável atual')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:/Locação.*Recorrência avulsa/})).toBeInTheDocument()
})

it('não anuncia intervalos livres com funcionamento pendente',async()=>{
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[{...court,scheduleConfirmed:false}],classes:[fridayClass]}))
  start('/agenda?date=2026-10-09')
  await screen.findByRole('button',{name:/Aula.*Aula de sexta/})
  expect(screen.queryByRole('link',{name:/Nova reserva 09\/10/})).not.toBeInTheDocument()
  await userEvent.click(screen.getByText('Resumo da semana'))
  expect(within(screen.getByRole('region',{name:'Resumo da semana'})).getByText('A confirmar')).toBeInTheDocument()
})

it('intervalo parcial preenche reserva e escolhe a única quadra automaticamente',async()=>{
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[{...court,openingTime:'23:30',closingTime:'24:00'}]}))
  start('/agenda?date=2026-10-09')
  await userEvent.setup().click(await screen.findByRole('link',{name:'Nova reserva 09/10/2026 23:30–24:00'}))
  expect(screen.getByLabelText('Começa às')).toHaveValue('23:30')
  expect(screen.getByLabelText('Termina às')).toHaveValue('24:00')
  expect(screen.queryByLabelText('Quadra')).not.toBeInTheDocument()
})

it('semana falha informa painel parcial e não oferece novas reservas em lacunas',async()=>{
  vi.stubEnv('VITE_DEMO_MODE','false')
  vi.spyOn(globalThis,'fetch').mockImplementation(async input=>String(input).includes('/schedule-range')?json({message:'Indisponível'},503):json(String(input).endsWith('/courts')?[court]:[]))
  start('/agenda?date=2026-10-09',false)
  expect(await screen.findByRole('alert')).toHaveTextContent('Agenda incompleta')
  expect(screen.getByRole('button',{name:'Tentar novamente'})).toBeInTheDocument()
  expect(screen.queryByRole('link',{name:/Nova reserva 09\/10/})).not.toBeInTheDocument()
})

it('semana preserva ocupação da aula sem carregar ou revelar cadastros da escola',async()=>{
  vi.stubEnv('VITE_DEMO_MODE','false')
  const reception:AuthUser={...owner,roles:['Operations'],permissions:['projects:read']}
  const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{
    const path=String(input)
    if(path.includes('/schedule-range'))return json({from:'2026-10-05',to:'2026-10-11',days:Array.from({length:7},(_,index)=>({date:`2026-10-${String(index+5).padStart(2,'0')}`,courts:[{courtId:court.id,openingTime:'07:00',closingTime:'23:00',availableMinutes:index===4?900:960,occupiedMinutes:index===4?60:0,schedulePending:false,blocks:index===4?[{source:'Aula',startTime:'17:00',endTime:'18:00',sourceId:null}]:[],freeIntervals:index===4?[{startTime:'07:00',endTime:'17:00'},{startTime:'18:00',endTime:'23:00'}]:[{startTime:'07:00',endTime:'23:00'}]}]}))})
    return json(path.endsWith('/courts')?[court]:[])
  })
  start('/agenda?date=2026-10-09',false,reception)
  await userEvent.setup().click(await screen.findByRole('button',{name:/Aula.*17:00–18:00/}))
  const panel=screen.getByRole('dialog',{name:'Aula'})
  expect(within(panel).getByText('Detalhes da aula indisponíveis para seu acesso.')).toBeInTheDocument()
  expect(within(panel).queryByRole('link',{name:/turma/i})).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([input])=>/\/(students|classes|team)$/.test(String(input)))).toBe(false)
})

it('salvar na API invalida imediatamente a disponibilidade mesmo com cache de 30 segundos',async()=>{
  vi.stubEnv('VITE_DEMO_MODE','false')
  let saved:Record<string,unknown>|null=null, scheduleReads=0
  vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
    const path=String(input)
    if(init?.method==='PUT'){saved={...JSON.parse(String(init.body)),version:1};return json(saved,201)}
    if(path.includes('/schedule-range')){
      scheduleReads++
      return json({from:'2026-10-05',to:'2026-10-11',days:Array.from({length:7},(_,index)=>({date:`2026-10-${String(index+5).padStart(2,'0')}`,courts:[{courtId:court.id,openingTime:'18:00',closingTime:'19:00',availableMinutes:index===4&&saved?0:60,occupiedMinutes:index===4&&saved?60:0,blocks:index===4&&saved?[{source:'Reserva',startTime:'18:00',endTime:'19:00',sourceId:saved.id}]:[],freeIntervals:index===4&&saved?[]:[{startTime:'18:00',endTime:'19:00'}]}]}))})
    }
    if(path.endsWith('/courts'))return json([{...court,openingTime:'18:00',closingTime:'19:00'}])
    if(path.endsWith('/reservations'))return json(saved?[saved]:[])
    return json([])
  })
  start('/agenda?date=2026-10-09',false,owner,30_000)
  const user=userEvent.setup()
  await user.click(await screen.findByRole('link',{name:'Nova reserva 09/10/2026 18:00–19:00'}))
  await user.type(screen.getByLabelText('Nome da reserva'),'Reserva imediata')
  await user.click(screen.getByRole('button',{name:'Salvar reserva'}))
  await screen.findByRole('heading',{name:'Reserva imediata'})
  await user.click(screen.getByRole('link',{name:'← Agenda e recepção'}))
  expect(await screen.findByRole('button',{name:/Locação.*Reserva imediata/})).toBeInTheDocument()
  expect(scheduleReads).toBe(2)
  expect(screen.queryByRole('link',{name:'Nova reserva 09/10/2026 18:00–19:00'})).not.toBeInTheDocument()
  await userEvent.click(screen.getByText('Resumo da semana'))
  expect(within(screen.getByRole('region',{name:'Resumo da semana'})).getByText('6 h')).toBeInTheDocument()
  expect(screen.getByRole('link',{name:'+ Nova reserva'})).not.toHaveAttribute('href',expect.stringContaining('start='))
})

it('o atalho das aulas de hoje abre somente a composição da grade do dia', async () => {
  const day = today()
  const lesson = { id: 'class-today', name: 'Aula do dia', courtId: court.id, weekDay: new Date(day + 'T12:00:00Z').getUTCDay(), startTime: '18:00', endTime: '19:00', capacity: 6, studentIds: [], teacherId: '', status: 'Ativa', notes: '' }
  const reservation = { id: 'reservation-today', name: 'Reserva fora do filtro', courtId: court.id, date: day, startTime: '16:00', endTime: '17:00', customerName: 'Grupo', status: 'Confirmada', notes: '' }
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify({ courts: [court], classes: [lesson], reservations: [reservation] }))
  start('/')
  await userEvent.click(screen.getByRole('link', { name: /Turmas com aula hoje/ }))
  expect(await screen.findByRole('button', { name: /Aula do dia/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Reserva fora do filtro/ })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Mostrar')).toHaveValue('classes')
})


it('selecionar somente aulas limpa filtros antigos de reserva e mantém a seleção entre visualizações', async () => {
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify({ courts: [court], classes: [fridayClass], reservations: [fridayReservation] }))
  start('/agenda?view=list&from=2026-10-09&to=2026-10-09&date=2026-10-09&status=Confirmada&group=grupo-antigo')
  const user = userEvent.setup()
  await user.selectOptions(screen.getByLabelText('Mostrar'), 'classes')
  expect(await screen.findByRole('button', { name: /Aula de sexta/ })).toBeInTheDocument()
  expect(screen.getByLabelText('Situação da reserva')).toHaveValue('')
  expect(screen.getByTestId('route')).not.toHaveTextContent('group=')
  expect(screen.queryByRole('button', { name: /Locação de sexta/ })).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Visualização'), 'week')
  expect(await screen.findByRole('button', { name: /Aula de sexta/ })).toBeInTheDocument()
})

it('selecionar aulas na semana remove filtros antigos de situação e grupo', async () => {
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify({ courts: [court], classes: [fridayClass], reservations: [fridayReservation] }))
  start('/agenda?date=2026-10-09&status=Confirmada&group=grupo-antigo')
  await userEvent.setup().selectOptions(screen.getByLabelText('Destacar atividade'), 'aula')
  expect(await screen.findByRole('button', { name: /Aula de sexta/ })).toBeInTheDocument()
  expect(screen.getByTestId('route')).not.toHaveTextContent('status=')
  expect(screen.getByTestId('route')).not.toHaveTextContent('group=')
})

it('abre o dia no celular, permite escolher outro dia e respeita a semana explícita', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  try {
    const view = start('/agenda?date=2026-10-09')
    expect(screen.getByLabelText('Visualização')).toHaveValue('day')
    await userEvent.click(screen.getByRole('link', { name: '08/10/2026' }))
    expect(screen.getByTestId('route')).toHaveTextContent('date=2026-10-08')
    expect(screen.getByRole('link', { name: '08/10/2026' })).toHaveAttribute('aria-current', 'date')
    view.unmount()
    start('/agenda?view=week&date=2026-10-09')
    expect(screen.getByLabelText('Visualização')).toHaveValue('week')
  } finally { vi.unstubAllGlobals() }
})

it('preserva a seleção de mensalistas ao trocar semana por dia e lista', async () => {
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify({ courts: [court], classes: [fridayClass], reservations: [fridayReservation, {...fridayReservation, id:'monthly', rentalGroupId:'group', name:'Mensalista teste', startTime:'20:00', endTime:'21:00'}] }))
  start('/agenda?date=2026-10-09&activity=mensalista')
  const user = userEvent.setup()
  await user.selectOptions(screen.getByLabelText('Visualização'), 'day')
  expect(await screen.findByText('1 atividade')).toBeInTheDocument()
  expect(screen.getByRole('button', {name:/Mensalista teste/})).toBeInTheDocument()
  expect(screen.queryByRole('button', {name:/Locação de sexta/})).not.toBeInTheDocument()
  expect(screen.queryByRole('button', {name:/Aula de sexta/})).not.toBeInTheDocument()
  expect(screen.getByText('Filtrando: Mensalistas')).toBeVisible()
  await user.selectOptions(screen.getByLabelText('Visualização'), 'list')
  expect(await screen.findByText('1 atividade')).toBeInTheDocument()
  await user.click(screen.getByRole('link', {name:'Limpar filtros'}))
  expect(await screen.findByText('3 atividades')).toBeInTheDocument()
})

it('consulta horários livres no período e preserva a visualização ao reservar', async () => {
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify({ courts:[court], classes:[fridayClass], reservations:[fridayReservation] }))
  start('/agenda?view=list&date=2026-10-09&activity=livre')
  expect(await screen.findByText('3 horários livres')).toBeInTheDocument()
  expect(screen.queryByRole('button', {name:/Aula de sexta/})).not.toBeInTheDocument()
  expect(screen.getAllByRole('link', {name:'Reservar'})[0]).toHaveAttribute('href',expect.stringContaining('view=list'))
})

it('não apresenta disponibilidade pendente como zero horários livres', async () => {
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify({ courts:[{...court,scheduleConfirmed:false}] }))
  start('/agenda?view=list&date=2026-10-09&activity=livre')
  expect(await screen.findByText('Disponibilidade a confirmar')).toBeInTheDocument()
  expect(screen.queryByText('0 horários livres')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', {name:'Reservar'})).not.toBeInTheDocument()
})

it('reserva a partir do dia retorna ao mesmo dia ao cancelar', async () => {
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify({ courts:[court], reservations:[fridayReservation] }))
  start('/agenda?view=day&date=2026-10-09')
  const free = await screen.findByRole('region', {name:'Horários livres'})
  const user = userEvent.setup()
  await user.click(within(free).getAllByRole('link', {name:'+ Nova reserva'})[0])
  expect(screen.getByLabelText('Começa às')).toHaveValue('07:00')
  await user.click(screen.getByRole('button', {name:'Cancelar'}))
  expect(screen.getByLabelText('Visualização')).toHaveValue('day')
  expect(screen.getByTestId('route')).toHaveTextContent('date=2026-10-09')
})


it.each([
  { typedName: '', expectedName: 'Futevôlei · Segunda-feira · 18:00–19:00' },
  { typedName: '   ', expectedName: 'Futevôlei · Segunda-feira · 18:00–19:00' },
  { typedName: 'Iniciantes', expectedName: 'Iniciantes' },
])('cadastra turma com nome opcional: "$typedName"', async ({ typedName, expectedName }) => {
  vi.stubEnv('VITE_DEMO_MODE', 'false')
  const teacher = { id: '12345678-1234-1234-1234-123456789abc', name: 'Professor Teste', status: 'Ativo' }
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body))
      return body.name.trim() ? json({ ...body, version: 1 }, 201) : json({ message: 'O nome deve ter entre 1 e 240 caracteres.' }, 400)
    }
    return json(String(input).endsWith('/courts') ? [court] : String(input).endsWith('/team') ? [teacher] : [])
  })
  start('/escola/novo', false)
  const user = userEvent.setup()
  await screen.findByRole('option', { name: teacher.name })
  const name = screen.getByLabelText('Nome da turma (opcional)')
  expect(name).not.toBeRequired()
  if (typedName) await user.type(name, typedName)
  await user.selectOptions(screen.getByLabelText('Professor'), teacher.id)
  await user.selectOptions(screen.getByLabelText('Quadra'), court.id)
  await user.click(screen.getByRole('button', { name: 'Salvar turma' }))
  expect(await screen.findByRole('heading', { name: expectedName })).toBeInTheDocument()
  const writes = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')
  expect(writes).toHaveLength(1)
  expect(writes[0][0]).toMatch(/\/operations\/classes\//)
  expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({ name: expectedName, sport: 'Futevôlei', teacherId: teacher.id, courtId: court.id, weekDay: 1, startTime: '18:00', endTime: '19:00', capacity: 8 })
})

it('permite limpar o nome na edição mantendo a turma e usando o horário atual', async () => {
  const teacher = { id: 'professor', name: 'Professor Teste', status: 'Ativo' }
  const lesson = { id: 'turma', name: 'Nome anterior', sport: 'Beach tennis', courtId: court.id, teacherId: teacher.id, weekDay: 3, startTime: '19:00', endTime: '20:00', capacity: 8, studentIds: [], status: 'Ativa', notes: '' }
  localStorage.setItem('longbeach-os-demo-v1', JSON.stringify({ courts: [court], team: [teacher], classes: [lesson] }))
  start('/escola/turmas/turma')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Editar turma' }))
  const name = screen.getByLabelText('Nome da turma (opcional)')
  expect(name).not.toBeRequired()
  await user.clear(name)
  fireEvent.change(screen.getByLabelText('Começa às'), { target: { value: '20:00' } })
  fireEvent.change(screen.getByLabelText('Termina às'), { target: { value: '21:00' } })
  await user.click(screen.getByRole('button', { name: 'Salvar turma' }))
  expect(await screen.findByRole('heading', { name: 'Beach tennis · Quarta-feira · 20:00–21:00' })).toBeInTheDocument()
  const saved = JSON.parse(localStorage.getItem('longbeach-os-demo-v1') ?? '{}').classes
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({ ...lesson, name: 'Beach tennis · Quarta-feira · 20:00–21:00', startTime: '20:00', endTime: '21:00' })
})

it('aluno mantém ID e vínculos próprios ao salvar cliente legado sem telefone',async()=>{
 vi.stubEnv('VITE_DEMO_MODE','false')
 const student={id:'legacy-student',customerId:'canonical-child',name:'Aluno de exemplo',phone:'',birthDate:'',address:'',shirtSize:'',shortsSize:'',weeklyClasses:'1',days:'',class1:'',class2:'',monthlyAmount:0,paymentStatus:'A confirmar',paymentDate:'',statementName:'',status:'Ativo',notes:''}
 const writes:{url:string;body:Record<string,unknown>}[]=[];const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{const url=String(input);if(init?.method==='PUT'){const body=JSON.parse(String(init.body));writes.push({url,body});return json({...body,name:'Aluno canônico atualizado',phone:'11912345678'})}return json(url.endsWith('/students')?[student]:[])})
 start('/alunos/legacy-student',false);fireEvent.click(await screen.findByRole('button',{name:'Editar dados'}));expect(screen.getByRole('group',{name:'Cliente do aluno'})).toHaveTextContent(student.name);expect(screen.getByRole('combobox',{name:'Cliente do aluno selecionado'})).toBeRequired();expect(screen.queryByLabelText('Telefone')).not.toBeInTheDocument();fireEvent.change(screen.getByLabelText('Aulas por semana'),{target:{value:'2'}});fireEvent.click(screen.getByRole('button',{name:'Salvar cadastro'}));await screen.findByRole('heading',{name:'Aluno canônico atualizado'});expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({url:'/api/v1/operations/students/legacy-student',body:{id:'legacy-student',customerId:'canonical-child',weeklyClasses:'2',phone:''}});expect(writes[0].body).not.toHaveProperty('userId');expect(fetch.mock.calls.some(([url])=>String(url).includes('/billing'))).toBe(false)
})
it('reserva usa cliente escolhido sem criar login ou atribuir responsável financeiro',async()=>{
 vi.stubEnv('VITE_DEMO_MODE','false');const writes:Record<string,unknown>[]=[]
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{const url=String(input);if(init?.method==='PUT'){const body=JSON.parse(String(init.body));writes.push(body);return json({...body,customerName:'Cliente canônico',phone:'11912345678'})}if(url.includes('/customers/lookup?'))return json([{id:'canonical-reservation',name:'Cliente de exemplo',phoneHint:'•••• 5678',incomplete:false}]);return json(url.endsWith('/courts')?[court]:[])})
 start('/agenda/novo',false);await waitFor(()=>expect(screen.queryByText('Carregando registros da arena…')).not.toBeInTheDocument());fireEvent.change(screen.getByLabelText('Nome da reserva'),{target:{value:'Jogo de exemplo'}});fireEvent.change(screen.getByRole('searchbox',{name:'Buscar cliente da reserva'}),{target:{value:'Cliente'}});fireEvent.click(await screen.findByRole('button',{name:'Cliente de exemplo · •••• 5678 · Ref. ERVATION'}));fireEvent.click(screen.getByRole('button',{name:'Salvar reserva'}));await screen.findByRole('heading',{name:'Jogo de exemplo'});expect(writes[0]).toMatchObject({customerId:'canonical-reservation'});expect(writes[0]).not.toHaveProperty('responsibleUserId');expect(writes[0]).not.toHaveProperty('userId')
})

it.each(['','5511988887777'])('aluno anterior sem customerId preserva contato %s e permite mudar situação antes da reconciliação',async(phone)=>{
 vi.stubEnv('VITE_DEMO_MODE','false');const student={id:'unlinked-student',name:'Aluno anterior',phone,birthDate:'',address:'',shirtSize:'',shortsSize:'',weeklyClasses:'1',days:'',class1:'',class2:'',monthlyAmount:0,paymentStatus:'A confirmar',paymentDate:'',statementName:'',status:'Ativo',notes:''};const writes:Record<string,unknown>[]=[]
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{const url=String(input);if(init?.method==='PUT'){const body=JSON.parse(String(init.body));writes.push(body);return json({...body,customerId:'registered-legacy'})}if(url.includes('/customers/lookup?'))return json([{id:'temporary-client',name:'Pessoa temporária',phoneHint:'•••• 1111',incomplete:false}]);return json(url.endsWith('/students')?[student]:[])})
 start('/alunos/unlinked-student',false);fireEvent.click(await screen.findByRole('button',{name:'Editar dados'}));expect(screen.getByText(/Cadastro anterior: Aluno anterior/)).toBeInTheDocument();expect(screen.queryByRole('combobox',{name:'Cliente do aluno selecionado'})).not.toBeInTheDocument()
 if(phone){fireEvent.change(screen.getByRole('searchbox',{name:'Buscar cliente do aluno'}),{target:{value:'Pessoa'}});fireEvent.click(await screen.findByRole('button',{name:'Pessoa temporária · •••• 1111 · Ref. RYCLIENT'}));fireEvent.click(screen.getByRole('button',{name:'Continuar sem identificar'}))}
 fireEvent.change(screen.getByLabelText('Situação'),{target:{value:'Pausado'}});fireEvent.click(screen.getByRole('button',{name:'Salvar cadastro'}));await screen.findByRole('heading',{name:'Aluno anterior'});expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({id:'unlinked-student',name:student.name,phone,status:'Pausado'})
})
it('novo aluno continua exigindo cliente selecionado antes de salvar',async()=>{
 vi.stubEnv('VITE_DEMO_MODE','false');const requests=vi.spyOn(globalThis,'fetch').mockResolvedValue(json([]));start('/alunos/novo',false);await waitFor(()=>expect(screen.queryByText('Carregando registros da arena…')).not.toBeInTheDocument());expect(screen.getByRole('combobox',{name:'Cliente do aluno selecionado'})).toBeRequired();fireEvent.click(screen.getByRole('button',{name:'Salvar cadastro'}));expect(requests.mock.calls.some(([,init])=>init?.method==='PUT')).toBe(false)
})
