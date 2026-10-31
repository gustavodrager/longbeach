import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Heading } from '../../pages/arenaUi'
import { useAuth } from '../auth/authContext'
import { hasPermission } from '../auth/access'
import './stock-clean.css'
export const amount = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
export function StockPage({ title, children }: { title: string; children: ReactNode }) {
  return <main className="operation-page arena-page stock-page stock-clean"><Heading title={title} eyebrow=""/>{children}</main>
}
export function StockActions() {
  const { user } = useAuth()
  return <nav className="stock-actions" aria-label="Ações do estoque">
    {hasPermission(user, 'bar:stock:manage') && <Link to="/bar/inventario">Contar estoque</Link>}
    {hasPermission(user, 'bar:purchases:manage') && <Link to="/bar/compras">Receber compra</Link>}
    {hasPermission(user, 'bar:stock:output') && <Link to="/bar/perdas">Registrar perda ou consumo</Link>}
    {hasPermission(user, 'bar:stock:read') && <Link to="/bar/estoque?secao=movimentos">Movimentações</Link>}
  </nav>
}
