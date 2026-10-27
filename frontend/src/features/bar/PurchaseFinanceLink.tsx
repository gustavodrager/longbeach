import { Link } from 'react-router-dom'
import { hasPermission } from '../auth/access'
import { useAuth } from '../auth/authContext'

export function PurchaseFinanceLink({ purchaseId }: { purchaseId: string }) {
  const { user } = useAuth()
  return hasPermission(user, 'finance:write') ? <Link className="secondary-link" to={`/financeiro/despesas?purchase=${encodeURIComponent(purchaseId)}`}>Financeiro da compra →</Link> : null
}
