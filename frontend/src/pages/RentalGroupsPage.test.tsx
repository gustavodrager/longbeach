import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../features/auth/authContext'
import { DemoDataProvider } from '../features/operations/DemoDataProvider'
import { RentalGroupPage, RentalGroupsPage } from './RentalGroupsPage'
import { FinanceDetailsPage } from './ArenaPages'
import type { RentalGroup } from '../features/arena/rentals'
import { today } from './arenaUi'
const groupId = '11111111-2222-3333-4444-555555555555'
const courtId = '22222222-2222-2222-2222-222222222222'
const month = today().slice(0, 7)
const court = { id: courtId, name: 'Quadra 1', status: 'Disponível', openingTime: '06:00', closingTime: '24:00', operatingDays: [1,2,3,4,5] }
const group: RentalGroup = { id: groupId, version: 1, name: 'Turma de teste', sport: 'Futevôlei', courtId, weekDay: 5, startTime: '20:00', endTime: '22:00', startDate: '2026-01-01', endDate: '', status: 'Ativo', capacity: 12, members: [{ id: 'a', name: 'Pessoa A', phone: '', status: 'Ativo' }, { id: 'b', name: 'Pessoa B', phone: '', status: 'Ativo' }], organizerId: 'a', backupId: 'b', monthlyAmount: 500, extraAmount: null, fifthPolicy: 'Incluído', dueDay: 10, notes: '' }
const clients: QueryClient[] = []
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function start(path: string, permissions?: string[]) {
  const auth: AuthContextValue = { user: { id: 'test-owner', name: 'Teste', email: 'teste@example.invalid', roles: permissions ? [] : ['Owner'], permissions: permissions ?? [] }, isBootstrapping: false, signIn: async()=>{}, signInWithGoogle: async()=>{}, signOut: async()=>{}, changePassword: async()=>{}, completeFirstAccessWithGoogle: async()=>{} }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client)
  render(<QueryClientProvider client={client}><AuthContext.Provider value={auth}><DemoDataProvider enabled><MemoryRouter initialEntries={[path]}><Routes><Route path="/mensalistas" element={<RentalGroupsPage />} /><Route path="/mensalistas/:groupId" element={<RentalGroupPage />} /><Route path="/financeiro/:entryId" element={<FinanceDetailsPage />} /></Routes></MemoryRouter></DemoDataProvider></AuthContext.Provider></QueryClientProvider>)
}
beforeEach(()=>{ vi.stubEnv('VITE_DEMO_MODE','false'); localStorage.clear() })
afterEach(()=>{ clients.splice(0).forEach(c=>c.clear()); vi.unstubAllEnvs() })
it('salva todos os integrantes e permanece no grupo cadastrado', async()=>{
  const rows: RentalGroup[] = []
  vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
    const path=String(input)
    if(path.includes('/customers/lookup?')){const name=new URL(path,'https://test.invalid').searchParams.get('search')!;return json([{id:`client-${name}`,name,phoneHint:'•••• 8888',incomplete:false}])}
    if(init?.method==='PUT'){ const saved={...JSON.parse(String(init.body)),version:1};rows.push(saved);return json(saved,201) }
    if(path.includes('/preview'))return json({groupId,groupVersion:1,month,dates:[],amount:null,dueDate:today(),errors:[],warnings:[],existingMonthId:null})
    return json(path.endsWith('/courts')?[court]:path.endsWith('/rentalGroups')?rows:[])
  })
  start('/mensalistas/novo')
  await screen.findByRole('option',{name:'Quadra 1'})
  fireEvent.change(screen.getByLabelText('Nome do grupo'),{target:{value:'Turma nova'}})
  fireEvent.change(screen.getByLabelText('Quadra'),{target:{value:courtId}})
  fireEvent.click(screen.getByText('2. Integrantes'))
  fireEvent.change(screen.getByRole('searchbox',{name:'Buscar integrante 1 · cliente'}),{target:{value:'Pessoa Um'}})
  fireEvent.click(await screen.findByRole('button',{name:'Pessoa Um · •••• 8888 · Ref. ESSOA UM'}))
  fireEvent.click(screen.getByRole('button',{name:'+ Adicionar integrante'}))
  fireEvent.change(screen.getByRole('searchbox',{name:'Buscar integrante 2 · cliente'}),{target:{value:'Pessoa Dois'}})
  fireEvent.click(await screen.findByRole('button',{name:'Pessoa Dois · •••• 8888 · Ref. SOA DOIS'}))
  fireEvent.click(screen.getByRole('button',{name:'Salvar grupo'}))
  fireEvent.click(await screen.findByRole('button',{name:'Integrantes'}))
  await screen.findByRole('heading',{name:'Todos da turma'})
  expect(screen.getByRole('heading',{name:'Turma nova'})).toBeInTheDocument()
  expect(rows[0].members.map(m=>m.name)).toEqual(['Pessoa Um','Pessoa Dois'])
  expect(rows[0].members.map(m=>m.customerId)).toEqual(['client-Pessoa Um','client-Pessoa Dois'])
  expect(rows[0].monthlyAmount).toBeNull()
})
it('conflitos impedem confirmar o mês; mensalidade exige escolha explícita', async()=>{
  let conflict=true
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
    const path=String(input)
    if(init?.method==='POST')return json({message:'Conflito detectado ao confirmar. Nenhuma reserva criada.'},400)
    if(path.includes('/preview'))return json({groupId,groupVersion:1,month,dates:[`${month}-02`,`${month}-09`],amount:500,dueDate:`${month}-10`,errors:conflict?['Aula ocupa o horário de 09/10.']:[],warnings:[],existingMonthId:null})
    return json(path.endsWith('/courts')?[court]:path.endsWith('/rentalGroups')?[group]:[])
  })
  start(`/mensalistas/${groupId}`)
  fireEvent.click(await screen.findByRole('button',{name:'Encontros e presença'}))
  await screen.findByText('Aula ocupa o horário de 09/10.')
  expect(screen.getByRole('button',{name:'Confirmar 2 encontros'})).toBeDisabled()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  conflict=false; await clients[0].invalidateQueries({queryKey:['rental-preview']})
  await waitFor(()=>expect(screen.getByRole('button',{name:'Confirmar 2 encontros'})).toBeEnabled())
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Confirmar 2 encontros e cobrança'}))
  await screen.findByText('Conflito detectado ao confirmar. Nenhuma reserva criada.')
  expect(fetch.mock.calls.filter(([,init])=>init?.method==='POST').map(([,init])=>JSON.parse(String(init?.body)))).toEqual([{month,groupVersion:1,createCharge:true}])
})
it('recepção vê integrantes, sem valores nem consultas financeiras do bar', async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(input)=>{
    const path=String(input)
    if(path.includes('/preview'))return json({groupId,groupVersion:1,month,dates:[],amount:null,dueDate:today(),errors:[],warnings:[],existingMonthId:null})
    return json(path.endsWith('/rentalGroups')?[{...group,costsVisible:false,monthlyAmount:null,extraAmount:null}]:path.endsWith('/courts')?[court]:[])
  })
  start(`/mensalistas/${groupId}`,['projects:read','projects:write'])
  fireEvent.click(await screen.findByRole('button',{name:'Integrantes'}))
  await screen.findByRole('heading',{name:'Todos da turma'})
  expect(screen.queryByText('Mensalidade combinada')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading',{name:'A resenha no bar'})).not.toBeInTheDocument()
  expect(fetch.mock.calls.some(([path])=>String(path).includes('/bar?'))).toBe(false)
})
it('mensalidade criada depois dos encontros preserva competência, origem e vencimento',async()=>{
  const cycle={id:'cycle-test',name:'Turma teste · 2026-10',rentalGroupId:groupId,month:'2026-10',amount:500,dueDate:'2026-10-10',dates:[],members:[],createCharge:false,version:1}
  vi.spyOn(globalThis,'fetch').mockImplementation(async(input)=>json(String(input).endsWith('/rentalMonths')?[cycle]:[]))
  start('/financeiro/novo?origin=Locações&sourceKind=rentalMonths&source=cycle-test&month=2026-10')
  await waitFor(()=>expect(screen.getByLabelText('Descrição do lançamento')).toHaveValue('Mensalista · Turma teste · 2026-10'))
  expect(screen.getByLabelText('Valor (R$)')).toHaveValue(500)
  expect(screen.getByLabelText('Vencimento')).toHaveValue('2026-10-10')
  expect(screen.getByLabelText('Competência da mensalidade')).toHaveValue('2026-10')
})
it('cadastra grupo sem inventar integrantes, capacidade ou vencimento', async()=>{
  const rows: RentalGroup[] = []
  vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
    const path=String(input)
    if(init?.method==='PUT'){ const saved={...JSON.parse(String(init.body)),version:1};rows.push(saved);return json(saved,201) }
    if(path.includes('/preview'))return json({groupId,groupVersion:1,month,dates:[`${month}-02`],amount:500,dueDate:'',errors:[],warnings:[],existingMonthId:null})
    return json(path.endsWith('/courts')?[court]:path.endsWith('/rentalGroups')?rows:[])
  })
  start('/mensalistas/novo')
  await screen.findByRole('option',{name:'Quadra 1'})
  fireEvent.change(screen.getByLabelText('Nome do grupo'),{target:{value:'Turma a completar'}})
  fireEvent.change(screen.getByLabelText('Quadra'),{target:{value:courtId}})
  fireEvent.click(screen.getByRole('button',{name:'Salvar grupo'}))
  fireEvent.click(await screen.findByRole('button',{name:'Integrantes'}))
  await screen.findByRole('heading',{name:'Todos da turma'})
  expect(rows[0]).toMatchObject({members:[],organizerId:'',capacity:null,dueDay:null})
  fireEvent.click(screen.getByRole('button',{name:'Encontros e presença'}))
  await waitFor(()=>expect(screen.getByRole('checkbox')).toBeDisabled())
  expect(screen.getByRole('button',{name:'Confirmar 1 encontros'})).toBeEnabled()
})

it('combina busca, situação e dia e preserva os filtros ao voltar da ficha', async()=>{
  vi.spyOn(globalThis,'fetch').mockImplementation(async(input)=>json(String(input).endsWith('/rentalGroups') ? [group, {...group,id:'paused',name:'Turma pausada',status:'Pausado'}] : String(input).endsWith('/courts') ? [court] : []))
  start('/mensalistas?status=Ativo&day=5&q=Pessoa&month=2026-10')
  const card = await screen.findByRole('link',{name:'Ver Turma de teste'})
  expect(screen.queryByRole('link',{name:/Turma pausada/})).not.toBeInTheDocument()
  fireEvent.click(card)
  await screen.findByRole('heading',{name:'Turma de teste'})
  fireEvent.click(screen.getByRole('link',{name:'← Mensalistas'}))
  expect(await screen.findByRole('searchbox',{name:'Buscar'})).toHaveValue('Pessoa')
  expect(screen.getByLabelText('Situação do grupo')).toHaveValue('Ativo')
  expect(screen.getByLabelText('Dia da semana')).toHaveValue('5')
  fireEvent.click(screen.getByRole('link',{name:'Limpar filtros'}))
  expect(await screen.findByRole('link',{name:/Turma pausada/})).toBeInTheDocument()
  expect(screen.getByLabelText('Mês dos encontros')).toHaveValue('2026-10')
})
it('pendências do mês respeitam vigência e confirmação e não inventam falta em grupos futuros', async()=>{
  const rows = [group, {...group,id:'future',name:'Turma futura',startDate:'2027-01-01'}, {...group,id:'confirmed',name:'Turma confirmada'}, {...group,id:'incomplete',name:'Turma incompleta',status:'Pausado',members:[],organizerId:''}]
  vi.spyOn(globalThis,'fetch').mockImplementation(async(input)=>json(String(input).endsWith('/rentalGroups') ? rows : String(input).endsWith('/rentalMonths') ? [{id:'month',rentalGroupId:'confirmed',month:'2026-10',members:[]}] : []))
  start('/mensalistas?month=2026-10&pending=yes')
  expect(await screen.findByRole('article',{name:'Turma de teste'})).toHaveTextContent('Confirmar encontros de 10/2026')
  expect(screen.queryByRole('link',{name:/Turma futura/})).not.toBeInTheDocument()
  expect(screen.queryByRole('link',{name:/Turma confirmada/})).not.toBeInTheDocument()
  expect(screen.getByRole('article',{name:'Turma incompleta'})).toHaveTextContent('Definir responsável')
  expect(screen.getByRole('article',{name:'Turma incompleta'})).not.toHaveTextContent('Confirmar encontros')
})
it('cancelar novo grupo retorna à lista filtrada sem criar registros',async()=>{
  const fetch = vi.spyOn(globalThis,'fetch').mockImplementation(async(input)=>json(String(input).endsWith('/rentalGroups') ? [group] : String(input).endsWith('/courts') ? [court] : []))
  start('/mensalistas?status=Ativo&month=2026-11')
  fireEvent.click(await screen.findByRole('link',{name:'+ Cadastrar grupo'}))
  await screen.findByRole('button',{name:'Salvar grupo'})
  fireEvent.click(screen.getByRole('button',{name:'Cancelar'}))
  expect(await screen.findByLabelText('Mês dos encontros')).toHaveValue('2026-11')
  expect(screen.getByLabelText('Situação do grupo')).toHaveValue('Ativo')
  expect(fetch.mock.calls.some(([,init])=>init?.method==='PUT')).toBe(false)
})

function editableFixture() {
  const saved: {kind: string; body: Record<string, unknown>}[] = []
  const tables: Record<string, Record<string, unknown>[]> = {
    courts: [court], rentalGroups: [{...group}],
    rentalMonths: [{id:'test-month',version:1,name:'Outubro teste',rentalGroupId:groupId,month,dates:[today()],amount:500,dueDate:today(),members:group.members,createCharge:true}],
    reservations: [{id:'test-meeting',version:4,name:'Encontro teste',courtId,date:today(),startTime:'20:00',endTime:'22:00',customerName:'Pessoa A',phone:'',amount:0,status:'Confirmada',notes:'',rentalGroupId:groupId,rentalMonth:month}],
    financeEntries: [{id:'test-charge',version:3,name:'Mensalidade teste',direction:'Receber',origin:'Locações',amount:500,dueDate:today(),status:'Pendente',paidDate:'',notes:'',sourceKind:'rentalMonths',sourceId:'test-month',month}],
  }
  let failure = false
  vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
    const path=String(input)
    const kind = path.split('/operations/')[1]?.split('/')[0]
    if(path.includes('/customers/lookup?'))return json([{id:'client-b',name:'Pessoa B corrigida',phoneHint:'',incomplete:true}])
    if(init?.method==='PUT'){
      if(failure)return json({message:'Falha de teste; tente novamente.'},503)
      const body=JSON.parse(String(init.body)); saved.push({kind,body})
      const result={...body,version:(body.version??0)+1}
      tables[kind]=(tables[kind]??[]).filter(row=>row.id!==body.id).concat(result)
      return json(result)
    }
    return json(tables[kind]??[])
  })
  return {saved,tables, fail:(value:boolean)=>{failure=value}}
}
it('edita na listagem sem alterar encontros, cobrança ou integrantes e busca sem acentos',async()=>{
  const fixture=editableFixture()
  fixture.tables.rentalGroups[0].name='Turma João'
  start('/mensalistas?q=joao')
  fireEvent.click(await screen.findByRole('button',{name:'Editar'}))
  fireEvent.change(screen.getByLabelText('Nome do grupo'),{target:{value:'Turma João atualizada'}})
  fireEvent.change(screen.getByLabelText('Valor mensal (R$)'),{target:{value:'550'}})
  fireEvent.click(screen.getByRole('button',{name:'Salvar grupo'}))
  await screen.findByRole('heading',{name:'Turma João atualizada'})
  expect(fixture.saved).toHaveLength(1)
  expect(fixture.saved[0]).toMatchObject({kind:'rentalGroups',body:{version:1,monthlyAmount:550,members:group.members}})
  expect(fixture.tables.financeEntries[0].amount).toBe(500)
  expect(fixture.tables.reservations[0].startTime).toBe('20:00')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it('corrige integrante e função na própria ficha preservando os integrantes do mês',async()=>{
  const fixture=editableFixture()
  start(`/mensalistas/${groupId}`)
  fireEvent.click(await screen.findByRole('button',{name:'Integrantes'}))
  fireEvent.click(screen.getAllByRole('button',{name:'Editar integrante'})[1])
  fireEvent.change(screen.getByRole('searchbox',{name:'Buscar cliente do integrante'}),{target:{value:'Pessoa B'}})
  fireEvent.click(await screen.findByRole('button',{name:'Pessoa B corrigida · Telefone pendente · Cadastro incompleto · Ref. CLIENTB'}))
  fireEvent.change(screen.getByLabelText('Função no grupo'),{target:{value:'Responsável'}})
  fireEvent.click(screen.getByRole('button',{name:'Salvar integrante'}))
  await screen.findByText('Pessoa B corrigida')
  expect(fixture.saved[0].body).toMatchObject({organizerId:'b',backupId:'',version:1})
  expect((fixture.saved[0].body.members as {id:string;customerId?:string}[]).find(m=>m.id==='b')).toMatchObject({customerId:'client-b'})
  expect(fixture.tables.rentalMonths[0].members).toEqual(group.members)
})
it('mantém a edição após falha e salva encontro sem modificar vínculo ou mensalidade',async()=>{
  const fixture=editableFixture()
  start(`/mensalistas/${groupId}`)
  fireEvent.click(await screen.findByRole('button',{name:'Encontros e presença'}))
  fireEvent.click(screen.getByRole('button',{name:'Editar encontro'}))
  fireEvent.change(screen.getByLabelText('Início do encontro'),{target:{value:'19:00'}})
  fixture.fail(true)
  fireEvent.click(screen.getByRole('button',{name:'Salvar encontro'}))
  await screen.findByText('Falha de teste; tente novamente.')
  expect(screen.getByLabelText('Início do encontro')).toHaveValue('19:00')
  fixture.fail(false)
  fireEvent.click(screen.getByRole('button',{name:'Salvar encontro'}))
  await waitFor(()=>expect(screen.queryByLabelText('Início do encontro')).not.toBeInTheDocument())
  expect(fixture.saved).toHaveLength(1)
  expect(fixture.saved[0]).toMatchObject({kind:'reservations',body:{version:4,startTime:'19:00',rentalGroupId:groupId,rentalMonth:month,amount:0}})
  expect(fixture.tables.financeEntries[0].amount).toBe(500)
})
it('exige confirmação manual de recebimento e invalida ao alterar o valor',async()=>{
  const fixture=editableFixture()
  start(`/mensalistas/${groupId}`)
  fireEvent.click(await screen.findByRole('button',{name:'Financeiro'}))
  fireEvent.click(screen.getByRole('button',{name:'Editar mensalidade / registrar recebimento'}))
  fireEvent.change(screen.getByLabelText('Situação da mensalidade'),{target:{value:'Pago'}})
  expect(screen.getByRole('button',{name:'Salvar mensalidade'})).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.change(screen.getByLabelText('Valor deste mês (R$)'),{target:{value:'525'}})
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button',{name:'Salvar mensalidade'}))
  await screen.findByText(/Recebimento preservado/)
  expect(fixture.saved).toHaveLength(1)
  expect(fixture.saved[0]).toMatchObject({kind:'financeEntries',body:{version:3,amount:525,status:'Pago',sourceId:'test-month',sourceKind:'rentalMonths',month,businessUnitId:'quadra'}})
  expect(fixture.tables.rentalGroups[0].monthlyAmount).toBe(500)
  expect(screen.queryByRole('button',{name:'Editar mensalidade / registrar recebimento'})).not.toBeInTheDocument()
})
it('não oferece edição com permissão somente de leitura',async()=>{
  editableFixture()
  start(`/mensalistas/${groupId}`,['projects:read','reservations:read','courts:read','finance:read'])
  await screen.findByRole('heading',{name:group.name})
  expect(screen.queryByRole('button',{name:'Editar grupo e integrantes'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Integrantes'}))
  expect(screen.queryByRole('button',{name:'Editar integrante'})).not.toBeInTheDocument()
})
it('marca presenças independentes sem duplicar cliques durante rede lenta',async()=>{
  const fixture=editableFixture()
  const original=vi.mocked(globalThis.fetch).getMockImplementation()!
  let release: (()=>void) | undefined
  const gate=new Promise<void>(resolve=>{release=resolve})
  let writes=0
  vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
    if(init?.method==='PUT' && String(input).includes('/rentalAttendances/')){writes++;await gate}
    return original(input,init)
  })
  start(`/mensalistas/${groupId}`)
  fireEvent.click(await screen.findByRole('button',{name:'Encontros e presença'}))
  const buttons=screen.getAllByRole('button',{name:'Presente'})
  fireEvent.click(buttons[0]);fireEvent.click(buttons[0])
  expect(buttons[0]).toBeDisabled()
  expect(buttons[1]).toBeEnabled()
  fireEvent.click(buttons[1])
  expect(writes).toBe(2)
  release!()
  await waitFor(()=>expect(fixture.saved.filter(x=>x.kind==='rentalAttendances')).toHaveLength(2))
  await waitFor(()=>expect(buttons[0]).toHaveAttribute('aria-pressed','true'))
})
it('mantém um único editor aberto e protege cancelamento com alterações',async()=>{
  editableFixture()
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
  start(`/mensalistas/${groupId}`)
  fireEvent.click(await screen.findByRole('button',{name:'Integrantes'}))
  fireEvent.click(screen.getAllByRole('button',{name:'Editar integrante'})[0])
  expect(screen.getByRole('button',{name:'Editar integrante'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Função no grupo'),{target:{value:'Suplente'}})
  fireEvent.click(screen.getByRole('button',{name:'Cancelar'}))
  expect(confirm).toHaveBeenCalled()
  expect(screen.getByLabelText('Função no grupo')).toHaveValue('Suplente')
  confirm.mockReturnValue(true)
  fireEvent.click(screen.getByRole('button',{name:'Cancelar'}))
  expect(screen.queryByLabelText('Função no grupo')).not.toBeInTheDocument()
  expect(screen.getAllByRole('button',{name:'Editar integrante'})[0]).toBeEnabled()
})

it('limpar seleção temporária do integrante legado no grupo restaura nome e telefone anteriores',async()=>{
 const fixture=editableFixture();const oldMembers=[{...group.members[0],phone:'5511988887777'},group.members[1]];fixture.tables.rentalGroups[0].members=oldMembers
 start(`/mensalistas/${groupId}`);fireEvent.click(await screen.findByRole('button',{name:'Editar grupo e integrantes'}));fireEvent.change(screen.getByRole('searchbox',{name:'Buscar integrante 1 · cliente'}),{target:{value:'Pessoa'}});fireEvent.click(await screen.findByRole('button',{name:'Pessoa B corrigida · Telefone pendente · Cadastro incompleto · Ref. CLIENTB'}));fireEvent.click(screen.getByRole('button',{name:'Continuar sem identificar'}));fireEvent.change(screen.getByLabelText('Nome do grupo'),{target:{value:'Turma legada preservada'}});fireEvent.click(screen.getByRole('button',{name:'Salvar grupo'}));await screen.findByRole('heading',{name:'Turma legada preservada'});expect((fixture.saved[0].body.members as typeof group.members)[0]).toMatchObject({id:'a',name:'Pessoa A',phone:'5511988887777'});expect(fixture.tables.rentalMonths[0].members).toEqual(group.members)
})
it('limpar seleção temporária no editor individual preserva telefone e identidade legados',async()=>{
 const fixture=editableFixture();fixture.tables.rentalGroups[0].members=[{...group.members[0],phone:'5511988887777'},group.members[1]]
 start(`/mensalistas/${groupId}`);fireEvent.click(await screen.findByRole('button',{name:'Integrantes'}));fireEvent.click(screen.getAllByRole('button',{name:'Editar integrante'})[0]);fireEvent.change(screen.getByRole('searchbox',{name:'Buscar cliente do integrante'}),{target:{value:'Pessoa'}});fireEvent.click(await screen.findByRole('button',{name:'Pessoa B corrigida · Telefone pendente · Cadastro incompleto · Ref. CLIENTB'}));fireEvent.click(screen.getByRole('button',{name:'Continuar sem identificar'}));fireEvent.change(screen.getByLabelText('Função no grupo'),{target:{value:'Suplente'}});fireEvent.click(screen.getByRole('button',{name:'Salvar integrante'}));await screen.findByText('Integrante atualizado.');expect((fixture.saved[0].body.members as typeof group.members)[0]).toMatchObject({id:'a',name:'Pessoa A',phone:'5511988887777'});expect(fixture.tables.rentalMonths[0].members).toEqual(group.members)
})
