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
    if(init?.method==='PUT'){ const saved={...JSON.parse(String(init.body)),version:1};rows.push(saved);return json(saved,201) }
    if(path.includes('/preview'))return json({groupId,groupVersion:1,month,dates:[],amount:null,dueDate:today(),errors:[],warnings:[],existingMonthId:null})
    return json(path.endsWith('/courts')?[court]:path.endsWith('/rentalGroups')?rows:[])
  })
  start('/mensalistas/novo')
  await screen.findByRole('option',{name:'Quadra 1'})
  fireEvent.change(screen.getByLabelText('Nome do grupo'),{target:{value:'Turma nova'}})
  fireEvent.change(screen.getByLabelText('Quadra'),{target:{value:courtId}})
  fireEvent.change(screen.getByLabelText('Integrante 1 · nome completo'),{target:{value:'Pessoa Um'}})
  fireEvent.click(screen.getByRole('button',{name:'+ Adicionar integrante'}))
  fireEvent.change(screen.getByLabelText('Integrante 2 · nome completo'),{target:{value:'Pessoa Dois'}})
  fireEvent.click(screen.getByRole('button',{name:'Salvar grupo'}))
  await screen.findByRole('heading',{name:'Todos da turma'})
  expect(screen.getByRole('heading',{name:'Turma nova'})).toBeInTheDocument()
  expect(rows[0].members.map(m=>m.name)).toEqual(['Pessoa Um','Pessoa Dois'])
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
