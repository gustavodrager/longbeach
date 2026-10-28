import { agendaReferenceDate, changeAgendaView, type AgendaView } from './agendaNavigation'

it('anchors a future list without date to its period, including reservation prefill', () => {
  const params = new URLSearchParams('view=list&from=2027-06-15&to=2027-07-20&activity=livre')
  expect(agendaReferenceDate(params, '2026-10-28')).toBe('2027-06-15')
  for (const target of ['day', 'week'] as const) {
    const next = changeAgendaView(params, target, 'list')
    expect(next.get('view')).toBe(target)
    expect(next.get('date')).toBe('2027-06-15')
    expect(next.get('from')).toBe('2027-06-15')
    expect(next.get('to')).toBe('2027-07-20')
    expect(next.get('activity')).toBe('livre')
    expect(agendaReferenceDate(next)).toBe('2027-06-15')
  }
  expect(params.has('date')).toBe(false)
})

it.each([
  ['view=list&date=2026-10-28&from=2027-01-02', '2027-01-02'],
  ['view=list&date=2027-02-03', '2027-02-03'],
  ['view=day&date=2027-03-04&from=2020-01-01', '2027-03-04'],
  ['view=week&from=2027-04-05', '2027-04-05'],
  ['from=2027-05-06', '2027-05-06'],
  ['', '2026-10-28'],
])('chooses the reference date from %s', (query, expected) => {
  expect(agendaReferenceDate(new URLSearchParams(query), '2026-10-28')).toBe(expected)
})

it('turns the visible week into the same list period across the year boundary', () => {
  const next = changeAgendaView(new URLSearchParams('date=2027-01-01&from=2020-01-01&to=2020-12-31'), 'list', 'week')
  expect(next.get('from')).toBe('2026-12-28')
  expect(next.get('to')).toBe('2027-01-03')
  expect(next.get('date')).toBe('2026-12-28')
  expect(next.get('view')).toBe('list')
})

it('turns a day into a one-day list instead of reusing an old list period', () => {
  const next = changeAgendaView(new URLSearchParams('date=2028-02-29&from=2020-01-01&to=2020-12-31'), 'list', 'day')
  expect(next.get('date')).toBe('2028-02-29')
  expect(next.get('from')).toBe('2028-02-29')
  expect(next.get('to')).toBe('2028-02-29')
})

it('uses the effective source view when the URL view is absent or stale', () => {
  const params = new URLSearchParams('view=week&date=2026-10-28&from=2027-06-15&to=2027-06-30')
  expect(changeAgendaView(params, 'day', 'list').get('date')).toBe('2027-06-15')
  const mobile = changeAgendaView(new URLSearchParams('date=2027-01-01'), 'list', 'day')
  expect(mobile.get('from')).toBe('2027-01-01')
  expect(mobile.get('to')).toBe('2027-01-01')
})

it('keeps an existing list period and aligns its stale date anchor', () => {
  const next = changeAgendaView(new URLSearchParams('view=list&date=2020-01-01&from=2027-06-15&to=2027-08-20'), 'list', 'list')
  expect(next.get('date')).toBe('2027-06-15')
  expect(next.get('from')).toBe('2027-06-15')
  expect(next.get('to')).toBe('2027-08-20')
})

it.each(['q=Grupo+futuro&court=court-synthetic&activity=mensalista&status=Confirmada&group=group-synthetic&returnTo=%2Fmensalistas%3Fmonth%3D2027-06&tag=a&tag=b', 'tag=a&returnTo=%2Fmensalistas%3Fmonth%3D2027-06&group=group-synthetic&status=Confirmada&activity=mensalista&court=court-synthetic&q=Grupo+futuro&tag=b'])('preserves filters and unrelated context regardless of parameter position: %s', filters => {
  const params = new URLSearchParams(`view=list&from=2027-06-15&to=2027-06-30&acao=editar&registro=old&page=4&${filters}`)
  const original = params.toString()
  const next = changeAgendaView(params, 'week', 'list')
  for (const key of ['q', 'court', 'activity', 'status', 'group', 'returnTo', 'tag']) expect(next.getAll(key)).toEqual(params.getAll(key))
  for (const key of ['acao', 'registro', 'page']) expect(next.has(key)).toBe(false)
  expect(params.toString()).toBe(original)
  expect(next).not.toBe(params)
})

it.each(['not-a-date', '2027-02-30', '', '10000-01-01'])('preserves invalid reference %j for validation without crashing', invalid => {
  const params = new URLSearchParams({ view: 'list', from: invalid, to: '2027-06-30', date: '2026-10-28' })
  expect(agendaReferenceDate(params, '2020-01-01')).toBe(invalid)
  for (const target of ['day', 'week', 'list'] as AgendaView[]) {
    expect(changeAgendaView(params, target, 'list').get('date')).toBe(invalid)
  }
  const week = changeAgendaView(new URLSearchParams({ date: invalid }), 'list', 'week')
  expect(week.get('from')).toBe(invalid)
  expect(week.get('to')).toBe(invalid)
})

it.each(['0001-01-01', '9999-12-31'])('avoids week overflow at the supported date boundary %s', date => {
  const next = changeAgendaView(new URLSearchParams({ date }), 'list', 'week')
  expect(next.get('date')).toBe(date)
  expect(next.get('from')).toBe(date)
  expect(next.get('to')).toBe(date)
})
