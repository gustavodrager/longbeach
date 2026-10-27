import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
export type Availability = { date: string; courtId?: string; status: 'Available' | 'Closed' | 'Pending'; freeIntervals: { startTime: string; endTime: string }[]; updatedAtUtc: string }
export function AvailabilityPicker({ date, courtId, disabled, onPick }: { date: string; courtId?: string; disabled: boolean; onPick: (start: string, end: string, courtId?: string) => void }) {
  const { user } = useAuth()
  const query = useQuery({ queryKey: ['portal', user?.id, 'availability', date, courtId], queryFn: () => apiFetch<Availability>(`/api/v1/me/portal/availability?date=${date}${courtId ? `&courtId=${encodeURIComponent(courtId)}` : ''}`), enabled: /^\d{4}-\d{2}-\d{2}$/.test(date), retry: false, refetchInterval: 30000, refetchOnWindowFocus: true })
  if (!date) return <p>Escolha uma data para consultar os horários livres.</p>
  if (query.isPending) return <p role="status">Conferindo horários…</p>
  if (query.isError) return <p role="alert">Não foi possível consultar a disponibilidade. <button type="button" onClick={() => void query.refetch()}>Consultar novamente</button> Você pode enviar uma preferência para análise, sem garantia de vaga.</p>
  const data = query.data
  function pick(start: string, end: string) {
    const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
    const finish = Math.min(minutes(start) + 60, minutes(end))
    onPick(start, finish === 1440 ? '00:00' : `${String(Math.floor(finish / 60)).padStart(2, '0')}:${String(finish % 60).padStart(2, '0')}`, data?.courtId)
  }
  return <section className="portal-availability" aria-label="Disponibilidade da data">
    <h2>Horários livres</h2>
    {data?.status === 'Available' ? <>{data.freeIntervals.length ? <div className="portal-slot-list">{data.freeIntervals.map(i => <button type="button" key={i.startTime} disabled={disabled} onClick={() => pick(i.startTime, i.endTime)}>{i.startTime}–{i.endTime}<span> Usar início deste intervalo</span></button>)}</div> : <p>Nenhum intervalo livre nesta data. Escolha outro dia ou envie uma preferência para análise.</p>}</> : <p>{data?.status === 'Closed' ? 'A arena está fechada ou indisponível nesta data.' : 'O funcionamento ainda precisa ser confirmado pela equipe.'} Escolha outra data ou peça orientação.</p>}
    <p>A consulta não segura o horário. A equipe confere novamente antes de confirmar. Para aulas, também é preciso confirmar um professor.</p>
  </section>
}
