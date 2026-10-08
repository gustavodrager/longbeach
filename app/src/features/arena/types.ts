import type { BusinessAllocation } from '../finance/businessUnits'
export type Court = { id: string; version?: number; costsVisible?: boolean; name: string; sport: string; status: 'Disponível' | 'Manutenção'; openingTime: string; closingTime: string; operatingDays?: number[]; scheduleConfirmed?: boolean; hourlyRentalAmount?: number | null; weekendPackageAmount?: number | null; weekendPackageHours?: number | null; weekendPackageLatestEndTime?: string | null }
export type Reservation = {
  id: string; version?: number; costsVisible?: boolean; name: string; courtId: string; date: string; startTime: string; endTime: string
  customerName: string; phone: string; amount: number; status: 'Confirmada' | 'Chegou' | 'Concluída' | 'Cancelada' | 'Bloqueio'; notes: string
  rentalGroupId?: string; rentalMonth?: string; groupId?: string; groupTitle?: string; occurrenceIndex?: number
}
export type RecurringReservationInput = {
  operationId: string; groupTitle: string; courtId: string; startDate: string; startTime: string; endTime: string; weeks: number
  customerName: string; phone: string; amount: number; notes: string
}
export type RecurringReservationResponse = { groupId: string; groupTitle: string; reservations: Reservation[] }
export type ArenaClass = {
  id: string; version?: number; costsVisible?: boolean; name: string; sport: string; courtId: string; weekDay: number; startTime: string; endTime: string
  startDate?: string; teacherId: string; capacity: number; studentIds: string[]; status: 'Ativa' | 'Pausada' | 'Encerrada'; notes: string
}
export type Enrollment = { id: string; version?: number; costsVisible?: boolean; name: string; studentId: string; classId: string; startDate: string; endDate?: string; status: 'Ativa' | 'Encerrada'; monthlyAmount: number | null }
export type Presence = { id: string; version?: number; costsVisible?: boolean; name: string; classId: string; studentId: string; date: string; status: 'Presente' | 'Ausente' }
export type FinanceEntry = BusinessAllocation & {
  id: string; version?: number; costsVisible?: boolean; name: string; direction: 'Receber' | 'Pagar'; origin: 'Bar' | 'Escola' | 'Locações' | 'Arena'
  amount: number; dueDate: string; status: 'Pendente' | 'Pago' | 'Cancelado'; paidDate: string; notes: string
  sourceId?: string; sourceKind?: 'rentalMonths' | 'enrollments' | 'reservations' | 'projects' | 'maintenance'; month?: string
}
export type Maintenance = {
  id: string; version?: number; costsVisible?: boolean; name: string; area: string; owner: string; dueDate: string
  status: 'Aberta' | 'Em andamento' | 'Concluída' | 'Cancelada'; priority: 'Normal' | 'Urgente'; notes: string
}

export type CourtScheduleBlock = { source: 'Aula' | 'Reserva' | 'Bloqueio'; startTime: string; endTime: string; sourceId: string | null }
export type CourtScheduleRow = { courtId: string; openingTime: string; closingTime: string; availableMinutes: number | null; operatingMinutes?: number; closedForDay?: boolean; schedulePending?: boolean; reservedMinutes: number; classMinutes: number; closedForMaintenance: boolean; hasConflict: boolean; blocks: CourtScheduleBlock[] }
export type CourtSchedule = { date: string; updatedAtUtc: string; courts: CourtScheduleRow[] }
