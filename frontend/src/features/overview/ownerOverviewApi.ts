import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/http'
import { canManageStaff } from '../auth/access'
import { useAuth } from '../auth/authContext'
import { staffScopeKey } from '../auth/staffScope'

export type GoalEstimate = {
  estimatedMonthlyCents: number | null; averageMonthlyCents: number | null
  sampleCount: number; priceReference: 'weekday' | 'segment' | 'missing'; usesFallback: boolean
}
export type WeekdayOverview = {
  weekDay: number; classes: number; enrollmentPlaces: number; rentalGroups: number
  schoolGoal: GoalEstimate; rentalGoal: GoalEstimate
}
export type CompetenceFinance = {
  billedCents: number; receivedCents: number; outstandingCents: number; overdueCents: number
  chargeCount: number; partiallyPaidCount: number; manualPaidCount: number; overdueChargeCount: number; basis: 'competence'
}
export type OwnerOverview = {
  month: string; asOfDate: string; queriedAtUtc: string; timeZone: string
  school: { activeStudents: number; activeEnrollments: number; activeClasses: number; knownMonthlyCents: number; priceSampleCount: number; missingPriceCount: number }
  rentals: { activeGroups: number; knownMonthlyCents: number; priceSampleCount: number; missingPriceCount: number }
  recurring: { knownMonthlyCents: number; missingPriceCount: number; schoolTargetMonthlyCents: number | null; rentalTargetMonthlyCents: number | null; targetMonthlyCents: number | null; barTargetMonthlyCents: number | null }
  targets: { classesPerWeekday: number; placesPerClass: number; rentalGroupsPerWeekday: number; weeklyClasses: number; weeklyPlaces: number; weeklyRentalGroups: number }
  weekdays: WeekdayOverview[]
  finance: {
    school: CompetenceFinance; rentals: CompetenceFinance
    otherSchool: Omit<CompetenceFinance, 'basis'> & { basis: 'due-date' }
    bar: { consumedCents: number; grossReceivedCents: number; refundsCents: number; netReceivedCents: number; consumedItemCount: number; receivedPaymentCount: number; confirmedRefundCount: number; basis: 'confirmation-date'; source: 'bar-tabs' }
    barLegacy: { grossReceivedCents: number; refundsCents: number; netReceivedCents: number; receivedEventCount: number; refundEventCount: number; basis: 'event-date'; source: 'legacy-bar-events' }
  }
  warnings: { code: string; count: number; message: string }[]
}

export const validOverviewMonth = (value: string) => /^20\d{2}-(0[1-9]|1[0-2])$/.test(value)

const integers = (value: unknown, fields: string[]) => Boolean(value && typeof value === 'object'
  && fields.every(field => Number.isSafeInteger((value as Record<string, unknown>)[field])))
const counts = (value: unknown, fields: string[]) => integers(value, fields)
  && fields.every(field => (value as Record<string, number>)[field] >= 0)
const optionalMoney = (value: unknown) => value === null || Number.isSafeInteger(value)

async function loadOverview(month: string, signal: AbortSignal): Promise<OwnerOverview> {
  const value = await apiFetch<OwnerOverview>(`/api/v1/owner-overview?${new URLSearchParams({ month })}`, { signal })
  const goal = (row: GoalEstimate | undefined) => row && optionalMoney(row.estimatedMonthlyCents)
    && optionalMoney(row.averageMonthlyCents) && Number.isSafeInteger(row.sampleCount) && row.sampleCount >= 0
    && ['weekday', 'segment', 'missing'].includes(row.priceReference) && typeof row.usesFallback === 'boolean'
  // An incomplete response must never look like an empty, zero-valued business.
  if (!value || value.month !== month || !/^\d{4}-\d{2}-\d{2}$/.test(value.asOfDate)
    || !Number.isFinite(Date.parse(value.queriedAtUtc)) || value.timeZone !== 'America/Sao_Paulo'
    || !integers(value.school, ['activeStudents', 'activeEnrollments', 'activeClasses', 'knownMonthlyCents', 'priceSampleCount', 'missingPriceCount'])
    || !counts(value.school, ['activeStudents', 'activeEnrollments', 'activeClasses', 'priceSampleCount', 'missingPriceCount'])
    || !integers(value.rentals, ['activeGroups', 'knownMonthlyCents', 'priceSampleCount', 'missingPriceCount'])
    || !counts(value.rentals, ['activeGroups', 'priceSampleCount', 'missingPriceCount'])
    || !integers(value.recurring, ['knownMonthlyCents', 'missingPriceCount'])
    || value.recurring.missingPriceCount < 0
    || !['schoolTargetMonthlyCents', 'rentalTargetMonthlyCents', 'targetMonthlyCents', 'barTargetMonthlyCents'].every(key => optionalMoney(value.recurring[key as keyof OwnerOverview['recurring']]))
    || !integers(value.targets, ['classesPerWeekday', 'placesPerClass', 'rentalGroupsPerWeekday', 'weeklyClasses', 'weeklyPlaces', 'weeklyRentalGroups'])
    || Object.values(value.targets).some(target => target <= 0)
    || !Array.isArray(value.weekdays) || value.weekdays.length !== 7 || new Set(value.weekdays.map(row => row.weekDay)).size !== 7
    || value.weekdays.some(row => !counts(row, ['weekDay', 'classes', 'enrollmentPlaces', 'rentalGroups']) || row.weekDay > 6 || !goal(row.schoolGoal) || !goal(row.rentalGoal))
    || ![value.finance?.school, value.finance?.rentals].every(row => integers(row, ['billedCents', 'receivedCents', 'outstandingCents', 'overdueCents']) && row.basis === 'competence')
    || !integers(value.finance?.otherSchool, ['billedCents', 'receivedCents', 'outstandingCents', 'overdueCents']) || value.finance.otherSchool.basis !== 'due-date'
    || ![value.finance.school, value.finance.rentals, value.finance.otherSchool].every(row => counts(row, ['chargeCount', 'partiallyPaidCount', 'manualPaidCount', 'overdueChargeCount']))
    || !integers(value.finance?.bar, ['consumedCents', 'grossReceivedCents', 'refundsCents', 'netReceivedCents', 'consumedItemCount', 'receivedPaymentCount', 'confirmedRefundCount'])
    || !counts(value.finance.bar, ['consumedItemCount', 'receivedPaymentCount', 'confirmedRefundCount'])
    || value.finance.bar.basis !== 'confirmation-date' || value.finance.bar.source !== 'bar-tabs'
    || !integers(value.finance?.barLegacy, ['grossReceivedCents', 'refundsCents', 'netReceivedCents', 'receivedEventCount', 'refundEventCount'])
    || !counts(value.finance.barLegacy, ['receivedEventCount', 'refundEventCount'])
    || value.finance.barLegacy.basis !== 'event-date' || value.finance.barLegacy.source !== 'legacy-bar-events'
    || !Array.isArray(value.warnings) || value.warnings.some(row => !row || typeof row.code !== 'string' || typeof row.message !== 'string' || !Number.isSafeInteger(row.count) || row.count < 0)) {
    throw new Error('A visão geral recebida está incompleta. Tente atualizar novamente.')
  }
  return value
}

export function useOwnerOverview(month: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['owner-overview', staffScopeKey(user), month],
    queryFn: ({ signal }) => loadOverview(month, signal),
    enabled: canManageStaff(user) && validOverviewMonth(month),
    staleTime: 60_000,
    retry: false,
  })
}
