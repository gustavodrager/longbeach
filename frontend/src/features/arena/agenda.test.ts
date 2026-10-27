import { clockTime, weekDates, reservationUrl } from './agenda'
it('semana começa na segunda e atravessa mês e ano sem mudar o dia por fuso',()=>{
  expect(weekDates('2027-01-01')).toEqual(['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03'])
  expect(weekDates('2026-11-01')[0]).toBe('2026-10-26')
})
it('prefill limita a primeira hora ao intervalo e suporta meia-noite',()=>{
  expect(clockTime(1440)).toBe('24:00')
  expect(new URL(reservationUrl('2026-10-09','court','23:30','24:00'),'http://localhost').searchParams.get('end')).toBe('24:00')
  expect(new URL(reservationUrl('2026-10-09','court','06:00','12:00'),'http://localhost').searchParams.get('end')).toBe('07:00')
})
it('preserva o período e os filtros ao abrir uma reserva, sem carregar ações de outro formulário',()=>{
  const context = new URLSearchParams('view=list&from=2026-10-01&to=2026-10-31&activity=livre&acao=editar&registro=antigo')
  const params = new URL(reservationUrl('2026-10-09','court','18:00','22:00','list',context),'http://localhost').searchParams
  expect(params.get('view')).toBe('list')
  expect(params.get('from')).toBe('2026-10-01')
  expect(params.get('to')).toBe('2026-10-31')
  expect(params.get('activity')).toBe('livre')
  expect(params.get('end')).toBe('19:00')
  expect(params.has('acao')).toBe(false)
  expect(params.has('registro')).toBe(false)
})
