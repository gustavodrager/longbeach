import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import { DemoDataProvider } from '../features/operations/DemoDataProvider'
import type { AuthUser } from '../features/auth/types'
import { CourtsPage, AgendaPage, FinanceDetailsPage, FinancePage, MaintenanceDetailsPage, ReservationDetailsPage } from './ArenaPages'
import { DashboardPage } from './DashboardPage'
import { ProjectDetailsPage, TeamDetailsPage } from './OperationsPages'
import { today } from './arenaUi'

const owner: AuthUser={id:'11111111-1111-1111-1111-111111111111',name:'Admin teste',email:'teste@example.com',roles:['Owner'],permissions:[]}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})}
function RouteState(){const location=useLocation();return <output data-testid="route">{location.pathname}{location.search}</output>}
function start(path:string,demoMode=true,user:AuthUser=owner){
  const auth:AuthContextValue={user,isBootstrapping:false,signIn:async()=>{},signInWithGoogle:async()=>{},signOut:async()=>{},changePassword:async()=>{}, completeFirstAccessWithGoogle: async () => {}}
  const query=new QueryClient({defaultOptions:{queries:{retry:false}}})
  return render(<QueryClientProvider client={query}><AuthContext.Provider value={auth}><DemoDataProvider enabled demoMode={demoMode}><MemoryRouter initialEntries={[path]}><RouteState /><Routes><Route path="/" element={<DashboardPage />} /><Route path="/quadras" element={<CourtsPage />} /><Route path="/agenda" element={<AgendaPage />} /><Route path="/agenda/:reservationId" element={<ReservationDetailsPage />} /><Route path="/financeiro" element={<FinancePage />} /><Route path="/financeiro/:entryId" element={<FinanceDetailsPage />} /><Route path="/equipe/:memberId" element={<TeamDetailsPage />} /><Route path="/projetos/:projectId" element={<ProjectDetailsPage />} /><Route path="/manutencao/:maintenanceId" element={<MaintenanceDetailsPage />} /></Routes></MemoryRouter></DemoDataProvider></AuthContext.Provider></QueryClientProvider>)
}
const court={id:'22222222-2222-2222-2222-222222222222',name:'Quadra 1',sport:'Futevôlei',status:'Disponível',openingTime:'07:00',closingTime:'23:00'}
beforeEach(()=>{localStorage.clear();sessionStorage.clear();vi.stubEnv('VITE_DEMO_MODE','true');vi.stubEnv('VITE_OPERATIONAL_STORAGE','local')})
afterEach(()=>vi.unstubAllEnvs())

it('não apresenta cadastros operacionais ausentes como zero confirmado',async()=>{
  start('/')
  for(const label of ['Reservas de hoje','Tempo de quadra disponível hoje','Valores vencidos a receber','Materiais para repor','Projetos com prazo vencido','Manutenções urgentes abertas']) {
    const card=screen.getByRole('link',{name:new RegExp(label)})
    expect(within(card).getByText('Ainda não disponível')).toBeInTheDocument()
  }
  expect(screen.getByText('Faltam as quadras e seus horários de funcionamento.')).toBeInTheDocument()
})

it('mantém zero real quando há cadastros e nenhum atende ao filtro',async()=>{
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({inventory:[{id:'material-test',name:'Rede',quantity:5,minimum:2}]}))
  start('/')
  expect(within(screen.getByRole('link',{name:/Materiais para repor/})).getByText('0')).toBeInTheDocument()
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
  fireEvent.change(screen.getByLabelText('Quadra'),{target:{value:court.id}})
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
  await user.selectOptions(screen.getByLabelText('Quadra'),court.id)
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
  start(`/agenda?date=${today()}`,false,{...owner,roles:['Operations'],permissions:['projects:read']})
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
  expect(await screen.findByRole('heading',{name:'Agenda e recepção'})).toBeInTheDocument()
  expect(screen.getByLabelText('Mostrar')).toHaveValue('reservations')
  expect(screen.getByRole('link',{name:/Reserva confirmada/})).toBeInTheDocument()
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
  await user.click(screen.getByRole('button', {name:'+ Adicionar quadra'}))
  await user.type(screen.getByLabelText('Nome da quadra'), 'Quadra principal')
  fireEvent.change(screen.getByLabelText('Abre às'), {target:{value:'06:00'}})
  fireEvent.change(screen.getByLabelText('Fecha às'), {target:{value:'24:00'}})
  await user.click(screen.getByLabelText('Sábado'))
  await user.click(screen.getByLabelText('Domingo'))
  await user.click(screen.getByRole('button', {name:'Salvar quadra'}))
  expect(await screen.findByText('Quadra principal')).toBeInTheDocument()
  const saved = JSON.parse(localStorage.getItem('longbeach-os-demo-v1')??'{}').courts
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({openingTime:'06:00',closingTime:'24:00',operatingDays:[1,2,3,4,5],scheduleConfirmed:false})
  expect(screen.getByText('Agenda atual aguardando conferência')).toBeInTheDocument()
})

it('distingue horas de funcionamento de horas livres com agenda não conferida', async () => {
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[{...court,openingTime:'06:00',closingTime:'24:00',operatingDays:[1,2,3,4,5],scheduleConfirmed:false}]}))
  start('/agenda?date=2026-10-06')
  expect(await screen.findByText('Disponibilidade não verificada')).toBeInTheDocument()
  expect(screen.queryByText(/18 h disponíveis/)).not.toBeInTheDocument()
})

it('mostra fechamento no sábado sem atribuir capacidade livre à quadra', async () => {
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[{...court,openingTime:'06:00',closingTime:'24:00',operatingDays:[1,2,3,4,5]}]}))
  start('/agenda?date=2026-10-10')
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

const fridayClass={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',name:'Aula de sexta',sport:'Futevôlei',courtId:court.id,weekDay:5,startDate:'2026-10-09',startTime:'17:00',endTime:'18:00',teacherId:'',capacity:6,studentIds:[],status:'Ativa',notes:''}
const fridayReservation={id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',name:'Locação de sexta',courtId:court.id,date:'2026-10-09',startTime:'19:00',endTime:'20:00',customerName:'Grupo teste',phone:'',amount:100,status:'Confirmada',notes:''}

it('lista aulas por ocorrência junto das reservas e mantém a mesma seleção no dia',async()=>{
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[court],classes:[fridayClass],reservations:[fridayReservation]}))
  start('/agenda?view=list&from=2026-10-09&to=2026-10-16&date=2026-10-09')
  expect(await screen.findByText('3 atividades')).toBeInTheDocument()
  expect(screen.getAllByRole('link',{name:/Aula de sexta/})).toHaveLength(2)
  expect(screen.getByRole('link',{name:/Locação de sexta/})).toBeInTheDocument()
  await userEvent.setup().selectOptions(screen.getByLabelText('Visualização'),'day')
  expect(await screen.findByText('2 atividades')).toBeInTheDocument()
  expect(screen.getAllByRole('link',{name:/Aula de sexta/})).toHaveLength(1)
})

it('não projeta aulas antes da vigência e filtra aula pelo nome e pela quadra',async()=>{
  const otherCourt={...court,id:'cccccccc-cccc-cccc-cccc-cccccccccccc',name:'Quadra 2'}
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[court,otherCourt],classes:[fridayClass,{...fridayClass,id:'dddddddd-dddd-dddd-dddd-dddddddddddd',courtId:otherCourt.id,name:'Aula em outra quadra'}],reservations:[fridayReservation]}))
  start(`/agenda?view=list&from=2026-10-02&to=2026-10-09&court=${court.id}&q=Aula`)
  expect(await screen.findByText('1 atividade')).toBeInTheDocument()
  expect(screen.getAllByRole('link',{name:/Aula de sexta/})).toHaveLength(1)
  expect(screen.queryByText('Aula em outra quadra')).not.toBeInTheDocument()
  expect(screen.queryByText('Locação de sexta')).not.toBeInTheDocument()
})

it('filtro de situação limita a seleção sem alterar a ocupação real',async()=>{
  localStorage.setItem('longbeach-os-demo-v1',JSON.stringify({courts:[court],classes:[fridayClass],reservations:[fridayReservation]}))
  start('/agenda?date=2026-10-09&status=Confirmada')
  expect(await screen.findByText('1 h reservadas ou bloqueadas · 1 h de aulas · 14 h livres no dia')).toBeInTheDocument()
  expect(screen.queryByRole('link',{name:/Aula de sexta/})).not.toBeInTheDocument()
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
  expect(screen.getByRole('link',{name:/Locação de sexta/})).toBeInTheDocument()
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
  start('/agenda?date=2026-10-09')
  expect(await screen.findByText('2 atividades')).toBeInTheDocument()
  const disclosure=screen.getByText('Filtros').closest('details')!
  expect(disclosure).not.toHaveAttribute('open')
  const user=userEvent.setup();await user.click(screen.getByText('Filtros'))
  await user.type(screen.getByRole('searchbox',{name:'Buscar'}),'Aula')
  expect(await screen.findByText('1 atividade')).toBeInTheDocument()
  await user.click(screen.getByRole('link',{name:'Limpar filtros'}))
  expect(await screen.findByText('2 atividades')).toBeInTheDocument()
})
