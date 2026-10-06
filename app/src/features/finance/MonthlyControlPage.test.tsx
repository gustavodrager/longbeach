import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { MonthlyControlPage, controlTotals, type MonthlyControl } from './MonthlyControlPage'
const auth = vi.hoisted(() => ({ roles: ['Owner'] }))
vi.mock('../auth/authContext', () => ({ useAuth: () => ({ user: { id: 'owner-test', roles: auth.roles } }) }))
const control: MonthlyControl = { month:'2026-09',version:3,notes:'Referência anterior, sem pagamento presumido',lines:[
  { id:'11111111-1111-1111-1111-111111111111',label:'Receita teste',direction:'Receita',category:'Operação',costCenter:'Arena',amountCents:10000,basis:'Informado',source:'Controle de teste',sourceMonth:'2026-09' },
  { id:'22222222-2222-2222-2222-222222222222',label:'Energia teste',direction:'Despesa',category:'Fixa',costCenter:'Arena',amountCents:14000,basis:'Estimado',source:'Mês de referência',sourceMonth:'2026-08' },
] }
function wrap(path = "/"){ return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter initialEntries={[path]}><MonthlyControlPage /></MemoryRouter></QueryClientProvider>) }
afterEach(()=>{vi.restoreAllMocks();auth.roles=['Owner']})
it('separa estimativas, conserva déficit e bloqueia consulta de equipe',async()=>{
  expect(controlTotals(control.lines)).toEqual({income:10000,expense:14000,result:-4000,estimated:14000,hasEstimates:true})
  const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({month:'2026-09',months:['2026-09'],control})))
  const view=wrap();expect(await screen.findByText('-R$ 40,00')).toBeInTheDocument();expect(screen.getByText(/Estimativa · agosto/)).toBeInTheDocument()
  view.unmount();fetch.mockClear();auth.roles=['Operations'];wrap();expect(fetch).not.toHaveBeenCalled();expect(screen.getByRole('alert')).toHaveTextContent('proprietários')
})
it('envia revisão com a versão original e mantém o formulário quando outra pessoa já editou',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async (_input,init)=>init?.method==='PUT'?new Response(JSON.stringify({message:'Este controle mudou. Atualize a página.'}),{status:409}):new Response(JSON.stringify({month:'2026-09',months:['2026-09'],control})))
  const user=userEvent.setup();wrap();await user.click(await screen.findByRole('button',{name:'Editar Energia teste'}))
  const amount=screen.getByLabelText('Valor (R$)');await user.clear(amount);await user.type(amount,'120');await user.click(screen.getByRole('button',{name:'Salvar valor'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Este controle mudou')
  await waitFor(()=>expect(fetch.mock.calls.some(([,init])=>init?.method==='PUT')).toBe(true))
  const input=JSON.parse(String(fetch.mock.calls.find(([,init])=>init?.method==='PUT')![1]!.body));expect(input.version).toBe(3);expect(input.lines[1].amountCents).toBe(12000)
  expect(screen.getByLabelText('Valor (R$)')).toHaveValue(120)
})

it('restaura a edição ao abrir um link direto',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({month:'2026-09',months:['2026-09'],control})))
  wrap('/financeiro/controle-mensal?month=2026-09&acao=editar&registro=22222222-2222-2222-2222-222222222222')
  expect(await screen.findByLabelText('Valor (R$)')).toHaveValue(140)
})
