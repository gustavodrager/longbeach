const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const validCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function reportPeriodError(params: URLSearchParams) {
  const from = params.get('de') || today(), to = params.get('ate') || from
  if (!validCalendarDate(from) || !validCalendarDate(to)) return 'Escolha datas válidas para o período.'
  if (to < from) return 'A data final precisa ser igual ou posterior à inicial.'
  const days = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000 + 1
  return days > 366 ? 'Selecione no máximo 366 dias, incluindo as datas inicial e final.' : null
}
export function reportPeriod(params: URLSearchParams) {
  const from = params.get('de') || today(), to = params.get('ate') || from
  if (reportPeriodError(params)) return ''
  const start = new Date(`${from}T00:00:00-03:00`), end = new Date(`${to}T00:00:00-03:00`)
  return `fromUtc=${encodeURIComponent(start.toISOString())}&toUtc=${encodeURIComponent(new Date(end.getTime() + 86_400_000).toISOString())}`
}
