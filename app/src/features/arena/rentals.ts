export type RentalMember = { id: string; name: string; phone: string; status: 'Ativo' | 'Inativo' }
export type RentalGroup = {
  id: string; version?: number; costsVisible?: boolean; name: string; sport: string; courtId: string; weekDay: number; startTime: string; endTime: string
  startDate: string; endDate: string; status: 'Ativo' | 'Pausado' | 'Encerrado'; capacity: number; organizerId: string; backupId: string; members: RentalMember[]
  monthlyAmount: number | null; dueDay: number; fifthPolicy: 'A confirmar' | 'Incluído' | 'Extra'; extraAmount: number | null; notes: string
}
export type RentalMonth = { id: string; version: number; costsVisible?: boolean; name: string; rentalGroupId: string; month: string; dates: string[]; amount: number | null; dueDate: string; createCharge: boolean; members: Pick<RentalMember, 'id' | 'name'>[] }
export type RentalAttendance = { id: string; version?: number; name: string; rentalGroupId: string; reservationId: string; memberId: string; status: 'Presente' | 'Ausente' | 'Não informado' }
export type RentalPreview = { groupId: string; month: string; groupVersion: number; dates: string[]; amount: number | null; dueDate: string; errors: string[]; warnings: string[]; existingMonthId: string | null }
export type RentalBar = { tabId: string; number: number; name: string; state: string; reservationId: string; memberId: string | null; version: number; total: number; paid: number; due: number }
export const weekDays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
export const fifthPolicies = [{ value: 'A confirmar', label: 'A confirmar com o grupo' }, { value: 'Incluído', label: 'Quinto encontro incluído no mês' }, { value: 'Extra', label: 'Quinto encontro com valor adicional' }]
