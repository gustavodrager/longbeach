import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GradeImportReview } from './GradeImportReview'

const preview = { batchId: 'batch', sourceName: 'grade.json', applied: false, canApply: true, confirmationToken: 'verified', items: [{ id: 'lesson', kind: 'classes', name: 'Sexta 17h', sourceSheet: 'Grade', sourceRow: 35, body: { weekDay: 5, startTime: '17:00', endTime: '18:00', capacity: 6 }, conflict: null }] }
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
afterEach(() => vi.restoreAllMocks())
it('reconcilia a capacidade e só aplica o lote conferido', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => response(String(url).endsWith('/apply') ? { ...preview, applied: true, canApply: false } : preview))
  const onApplied = vi.fn().mockResolvedValue(undefined)
  render(<GradeImportReview batchId="batch" sourceName="grade.json" onApplied={onApplied} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Conferir grade de aulas: grade.json' }))
  expect(await screen.findByText('Sexta · 17:00–18:00 · 6 vagas')).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'Aplicar grade conferida' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Grade aplicada à Escola e à Agenda.')
  expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({ confirmationToken: 'verified' })
  expect(onApplied).toHaveBeenCalledOnce()
})
it('impede aplicação quando a capacidade ou os vínculos conflitam', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ ...preview, canApply: false, items: [{ ...preview.items[0], conflict: 'A aula conflita com uma reserva.' }] }))
  render(<GradeImportReview batchId="batch" sourceName="grade.json" onApplied={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Conferir grade de aulas: grade.json' }))
  expect(await screen.findByText('A aula conflita com uma reserva.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Aplicar grade conferida' })).toBeDisabled()
})
it('concilia mensalistas por esquema independente sem gerar cobranças', async()=>{
  const fetch = vi.spyOn(globalThis,'fetch').mockImplementation(async url => response({...preview,items:[{...preview.items[0],kind:'rentalGroups',name:'Turma de teste',body:{weekDay:2,startTime:'20:00',endTime:'22:00',monthlyAmount:700}}],applied:String(url).endsWith('/apply')}))
  render(<GradeImportReview kind="rentals" batchId="batch" sourceName="mensalistas.json" onApplied={vi.fn()} />)
  await userEvent.click(screen.getByRole('button',{name:'Conferir grupos mensalistas: mensalistas.json'}))
  expect(await screen.findByText(/Terça · 20:00–22:00/)).toHaveTextContent('700,00')
  await userEvent.click(screen.getByRole('button',{name:'Aplicar grupos conferidos'}))
  expect(await screen.findByRole('status')).toHaveTextContent('Grupos cadastrados em Mensalistas.')
  expect(String(fetch.mock.calls[1][0])).toContain('/rental-groups/apply')
})
