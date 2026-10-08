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

it('filtra despesas pela URL, preserva total do mês e mantém o grupo depois da edição',async()=>{
  let saved: MonthlyControl = structuredClone(control)
  saved.lines[1].basis='Informado'
  saved.lines.push({...saved.lines[1],id:'33333333-3333-3333-3333-333333333333',label:'Compra teste',category:'Variável',amountCents:2500})
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async (_input,init)=>{
    if(init?.method==='PUT') saved={...saved,...JSON.parse(String(init.body)),version:saved.version+1}
    return new Response(JSON.stringify(init?.method==='PUT'?saved:{month:'2026-09',months:['2026-09'],control:saved}))
  })
  const user=userEvent.setup();wrap('/financeiro/controle-mensal?month=2026-09&grupo=variaveis')
  expect(await screen.findByRole('button',{name:'Editar Compra teste'})).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Editar Energia teste'})).not.toBeInTheDocument()
  expect(screen.getByText('R$ 165,00')).toBeInTheDocument()
  expect(screen.queryByText(/Valores estimados ficam/)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:'Editar Compra teste'}))
  await user.selectOptions(screen.getByLabelText('Área'),'Bar')
  await user.click(screen.getByRole('button',{name:'Salvar valor'}))
  await screen.findByText('Controle atualizado.')
  expect(screen.getByRole('link',{name: /Despesas variáveis/})).toHaveAttribute('aria-current','page')
  expect(screen.queryByRole('button',{name:'Editar Energia teste'})).not.toBeInTheDocument()
  const payload=JSON.parse(String(fetch.mock.calls.find(([,init])=>init?.method==='PUT')![1]!.body))
  expect(payload.lines).toHaveLength(3)
  expect(payload.lines.map((line:{amountCents:number})=>line.amountCents)).toEqual([10000,14000,2500])
  await user.click(screen.getByRole('link',{name: /Despesas fixas/}))
  expect(await screen.findByRole('button',{name:'Editar Energia teste'})).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Editar Compra teste'})).not.toBeInTheDocument()
})
it('mostra grupo vazio e inicia novo valor com a classificação selecionada',async()=>{
  vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({month:'2026-09',months:['2026-09'],control})))
  const user=userEvent.setup();wrap('/financeiro/controle-mensal?month=2026-09&grupo=parcelas')
  expect(await screen.findByText('Nenhum registro neste grupo para setembro de 2026.')).toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:'Adicionar valor'}))
  expect(await screen.findByLabelText('Tipo')).toHaveValue('Parcela')
})

it('revisa unidade e filtra linhas sem alterar o total mensal nem ratear despesas',async()=>{
  let saved:MonthlyControl=structuredClone(control)
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async (_input,init)=>{
    if(init?.method==='PUT')saved={...saved,...JSON.parse(String(init.body)),version:saved.version+1}
    return new Response(JSON.stringify(init?.method==='PUT'?saved:{month:'2026-09',months:['2026-09'],control:saved}))
  })
  const user=userEvent.setup();wrap()
  await user.click(await screen.findByRole('button',{name:'Editar Energia teste'}))
  await user.selectOptions(screen.getByLabelText('Unidade de negócio / destinação'),'shared')
  await user.click(screen.getByRole('button',{name:'Salvar valor'}))
  await screen.findByText('Controle atualizado.')
  const input=JSON.parse(String(fetch.mock.calls.find(([,init])=>init?.method==='PUT')![1]!.body))
  expect(input.lines[1]).toMatchObject({allocationScope:'Shared',businessUnitId:null,amountCents:14000})
  await user.selectOptions(await screen.findByLabelText('Unidade / destinação'),'shared')
  expect(screen.getByRole('button',{name:'Editar Energia teste'})).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Editar Receita teste'})).not.toBeInTheDocument()
  expect(screen.getByText('-R$ 40,00')).toBeInTheDocument()
})
