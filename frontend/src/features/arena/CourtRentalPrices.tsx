import type { Court } from './types'
import { Field, Group, currency } from '../../pages/arenaUi'

export function CourtRentalPrices({ court, change }: { court: Omit<Court, 'id'>; change: (next: Omit<Court, 'id'>) => void }) {
  return <Group title="Serviços de aluguel">
    <Field label="Aluguel avulso por hora (R$)" type="number" min={0} step="0.01" value={court.hourlyRentalAmount ?? ''} onChange={v => change({ ...court, hourlyRentalAmount: v === '' ? null : Number(v) })} />
    <Field label="Pacote de sábado ou domingo (R$)" type="number" min={0} step="0.01" value={court.weekendPackageAmount ?? ''} onChange={v => change({ ...court, weekendPackageAmount: v === '' ? null : Number(v) })} />
    <Field label="Duração do pacote (horas)" type="number" min={1} max={24} step="0.5" value={court.weekendPackageHours ?? ''} onChange={v => change({ ...court, weekendPackageHours: v === '' ? null : Number(v) })} />
    <Field label="Saída até (sábado ou domingo)" type="time" value={court.weekendPackageLatestEndTime ?? ''} onChange={v => change({ ...court, weekendPackageLatestEndTime: v || null })} />
  </Group>
}
export function CourtPriceSummary({ court }: { court: Court }) {
  if (court.costsVisible === false || court.hourlyRentalAmount == null && court.weekendPackageAmount == null) return null
  return <small>{court.hourlyRentalAmount != null && <>Avulso: {currency(court.hourlyRentalAmount)}/h</>}{court.weekendPackageAmount != null && <> · Sábado ou domingo: {currency(court.weekendPackageAmount)} / {court.weekendPackageHours ?? '—'} h{court.weekendPackageLatestEndTime && ` · saída até ${court.weekendPackageLatestEndTime}`}</>}</small>
}
