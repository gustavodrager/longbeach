import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/http'
import { useAuth } from '../auth/authContext'
import { hasPermission } from '../auth/access'
import { money, type TabReport } from './api'

export function DashboardBarAttention() {
  const { user } = useAuth()
  const allowed = hasPermission(user, 'bar:finance:read')
  const query = useQuery({
    queryKey: ['bar-runtime', user?.id, '/tabs/reports/pending-payments'],
    queryFn: async () => {
      const report = await apiFetch<TabReport>('/api/v1/bar/tabs/reports/pending-payments?pageSize=1')
      if (!report?.rows || !Number.isFinite(report.value) || !report.updatedAtUtc) throw new Error('Consulta de Pix incompleta.')
      return report
    },
    enabled: allowed,
    refetchInterval: 30_000,
  })
  if (!allowed) return null
  if (query.isPending) return <p className="arena-hint" role="status">Consultando Pix pendentes…</p>
  if (query.isError || query.data.available === false) return <p className="arena-hint">Pix pendentes: consulta indisponível. <Link to="/bar/indicadores/pending-payments">Conferir pagamentos →</Link></p>
  if (query.data.value <= 0) return null
  return <ul className="dashboard-alerts dashboard-pix-alert"><li><Link to="/bar/indicadores/pending-payments"><span className="dashboard-alert-count" aria-hidden="true">!</span><span><strong>Pix aguardando confirmação · {money(query.data.value)}</strong><small>Comandas do sistema · ainda não é recebimento confirmado</small></span><span className="dashboard-alert-action">Conferir Pix →</span></Link></li></ul>
}
