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
