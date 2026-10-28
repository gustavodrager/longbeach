import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Court, CourtScheduleBlock, CourtScheduleRow } from '../features/arena/types'
import { AgendaAvailability, occupiedIntervals } from './AgendaAvailability'

const court: Court = {
  id: 'court-synthetic', name: 'Quadra fictícia', sport: 'Beach Tennis',
  status: 'Disponível', openingTime: '06:00', closingTime: '24:00',
}
const block = (startTime: string, endTime: string): CourtScheduleBlock => ({
  source: 'Reserva', sourceId: null, startTime, endTime,
})
function schedule(overrides: Partial<CourtScheduleRow> = {}): CourtScheduleRow {
  return {
    courtId: court.id, openingTime: court.openingTime, closingTime: court.closingTime,
    availableMinutes: 960, reservedMinutes: 120, classMinutes: 0,
    closedForMaintenance: false, hasConflict: false,
    blocks: [block('08:00', '10:00')],
    freeIntervals: [{ startTime: '06:00', endTime: '08:00' }, { startTime: '10:00', endTime: '24:00' }],
    ...overrides,
  }
}
function summary(rows: CourtScheduleRow[], flags: { failed?: boolean; loading?: boolean } = {}) {
  return <MemoryRouter initialEntries={['/agenda?view=day&date=2030-05-06']}>
    <AgendaAvailability date="2030-05-06" courts={[court]} rows={rows}
      failed={flags.failed ?? false} loading={flags.loading ?? false} />
  </MemoryRouter>
}

afterEach(cleanup)

describe('occupiedIntervals', () => {
  it('unifies unsorted, nested and chained overlaps while preserving real gaps', () => {
    const row = schedule({ blocks: [
      block('12:00', '13:00'), block('08:30', '09:00'), block('09:30', '11:00'),
      block('08:00', '10:00'), block('08:00', '09:30'),
    ] })
    expect(occupiedIntervals(row)).toEqual([
      { startTime: '08:00', endTime: '11:00' }, { startTime: '12:00', endTime: '13:00' },
    ])
  })

  it('joins adjacent intervals without bridging a free minute', () => {
    expect(occupiedIntervals(schedule({ blocks: [
      block('10:01', '11:00'), block('09:00', '10:00'), block('08:00', '09:00'),
    ] }))).toEqual([
      { startTime: '08:00', endTime: '10:00' }, { startTime: '10:01', endTime: '11:00' },
    ])
  })

  it('clips to operating hours and discards outside or empty intervals', () => {
    expect(occupiedIntervals(schedule({ openingTime: '08:00', closingTime: '18:00', blocks: [
      block('05:00', '07:00'), block('07:30', '09:00'), block('12:00', '12:00'),
      block('17:00', '19:00'), block('19:00', '20:00'),
    ] }))).toEqual([
      { startTime: '08:00', endTime: '09:00' }, { startTime: '17:00', endTime: '18:00' },
    ])
  })

  it('retains midnight as the end of the selected day', () => {
    expect(occupiedIntervals(schedule({ blocks: [block('23:30', '24:00')] })))
      .toEqual([{ startTime: '23:30', endTime: '24:00' }])
    expect(occupiedIntervals(schedule({ blocks: [] }))).toEqual([])
  })

  it('does not sort or modify the input row and its blocks', () => {
    const row = schedule({ blocks: [block('09:00', '11:00'), block('08:00', '10:00')] })
    const before = structuredClone(row)
    row.blocks.forEach(Object.freeze)
    Object.freeze(row.blocks)
    Object.freeze(row)
    const result = occupiedIntervals(row)
    expect(result).toEqual([{ startTime: '08:00', endTime: '11:00' }])
    expect(row).toEqual(before)
    result[0].endTime = '12:00'
    expect(row).toEqual(before)
  })
})

describe('AgendaAvailability query states', () => {
  it('ends the loading message when a completed query has no row for the court', () => {
    const { rerender } = render(summary([], { loading: true }))
    expect(screen.getByText('Consultando os horários…')).toBeVisible()
    rerender(summary([]))
    expect(screen.queryByText('Consultando os horários…')).not.toBeInTheDocument()
    expect(screen.getByText(/Não foi possível conferir os horários desta quadra/)).toBeVisible()
    expect(screen.queryByRole('term')).not.toBeInTheDocument()
  })

  it('does not show stale free intervals when the query failed', () => {
    render(summary([schedule()], { failed: true }))
    expect(screen.getByText(/Não foi possível conferir estes horários/)).toBeVisible()
    expect(screen.queryByText('06:00–08:00')).not.toBeInTheDocument()
    expect(screen.queryByText('Consultando os horários…')).not.toBeInTheDocument()
  })

  it.each([
    { closedForDay: true, message: 'Fechado neste dia' },
    { closedForMaintenance: true, message: 'Em manutenção' },
  ])('shows $message before pending availability', ({ message, ...flags }) => {
    render(summary([schedule({ ...flags, schedulePending: true, freeIntervals: null, availableMinutes: null })]))
    expect(screen.getByText(new RegExp(message))).toHaveTextContent('sem horários para reservar')
    expect(screen.queryByText(/Aguarde a confirmação/)).not.toBeInTheDocument()
    expect(screen.queryByRole('term')).not.toBeInTheDocument()
  })

  it('does not convert unconfirmed availability into a free or empty result', () => {
    render(summary([schedule({ schedulePending: true, freeIntervals: null, availableMinutes: null })]))
    expect(screen.getByText(/Aguarde a confirmação do funcionamento/)).toBeVisible()
    expect(screen.queryByText('Sem horários livres neste dia')).not.toBeInTheDocument()
    expect(screen.queryByRole('term')).not.toBeInTheDocument()
  })

  it('renders the occupied union separately from confirmed free intervals', () => {
    render(summary([schedule({ blocks: [block('09:00', '10:00'), block('08:00', '09:30')] })]))
    const occupied = screen.getByText('Ocupado', { selector: 'dt' }).parentElement!
    expect(within(occupied).getByText('08:00–10:00')).toBeVisible()
    expect(within(occupied).queryByText('06:00–08:00')).not.toBeInTheDocument()
    expect(screen.getByText('06:00–08:00')).toBeVisible()
    expect(screen.getByText('10:00–24:00')).toBeVisible()
  })
})
