import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { usePrototype } from './PrototypeProvider'
import { availableStock, money } from './model'
import type { CartItem } from './types'

const iconPaths = {
  sell: 'M3 7h18l-2 13H5L3 7Zm4 0V5a5 5 0 0 1 10 0v2',
  tabs: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6',
  orders: 'M4 6h16v15H4V6Zm4-3h8v6H8V3Zm0 11h8m-8 3h5',
  cash: 'M3 7h18v13H3V7Zm3-4h12v4M3 13h18m-8 3h3',
  arrow: 'M5 12h14m-5-5 5 5-5 5', plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14', check: 'm5 12 4 4L19 6',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',
  close: 'm6 6 12 12M6 18 18 6',
  qr: 'M3 3h6v6H3V3Zm12 0h6v6h-6V3ZM3 15h6v6H3v-6Zm12 0h3v3h3v3h-6v-6ZM3 12h3m6-9v3m0 6h3m6 0v3m-9 3v3',
  card: 'M3 5h18v14H3V5Zm0 5h18M6 15h4',
  pix: 'm12 2 10 10-10 10L2 12 12 2Zm-6 6 6 6 6-6m-12 8 6-6 6 6',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6',
  alert: 'm12 3 10 18H2L12 3Zm0 6v5m0 3v.1',
  back: 'M19 12H5m5-5-5 5 5 5',
  chart: 'M4 3v18h17M8 16v-4m5 4V7m5 9v-6',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v.1',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM10 3h4l1 3 3 1 3 3v4l-3 1-1 3-3 3h-4l-1-3-3-1-3-3v-4l3-1 1-3 3-3Z',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2',
  logout: 'M9 3H3v18h6m5-15 6 6-6 6m-7-6h13',
  copy: 'M8 8h13v13H8V8ZM3 16V3h13',
} satisfies Record<string, string>

export function Icon({ name, size = 24 }: { name: keyof typeof iconPaths; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPaths[name]} /></svg>
}

export function Status({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'neutral' }) {
  return <span className={`ux-status ${tone}`}><Icon name={tone === 'success' ? 'check' : tone === 'danger' ? 'alert' : tone === 'warning' ? 'clock' : 'tabs'} size={16} />{children}</span>
}

export function PageHeader({ eyebrow, title, description, backTo, children }: { eyebrow?: string; title: string; description?: string; backTo?: string; children?: ReactNode }) {
  return <header className="ux-page-header">{backTo && <Link to={backTo} className="ux-back"><Icon name="back" size={20} />Voltar</Link>}<div className="ux-heading-line"><div>{eyebrow && <p className="ux-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="ux-description">{description}</p>}</div>{children}</div></header>
}

export function Notice({ message, error }: { message?: string; error?: string }) {
  return <>{error && <p className="ux-notice error" role="alert"><Icon name="alert" />{error}</p>}{message && <p className="ux-notice success" role="status"><Icon name="check" />{message}</p>}</>
}

export function EmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="ux-empty"><span className="ux-empty-symbol"><Icon name="sun" size={32} /></span><h2>{title}</h2><p>{description}</p>{children}</div>
}

export function QuantityControl({ name, quantity, onChange, max = Infinity, disabled = false }: { name: string; quantity: number; onChange: (value: number) => void; max?: number; disabled?: boolean }) {
  return <div className="ux-quantity"><button type="button" aria-label={`Retirar uma unidade de ${name}`} onClick={() => onChange(Math.max(0, quantity - 1))} disabled={disabled || quantity <= 0}><Icon name="minus" size={20} /></button><output aria-label={`Quantidade de ${name}`} aria-live="polite">{quantity}</output><button type="button" aria-label={`Adicionar uma unidade de ${name}`} onClick={() => onChange(quantity + 1)} disabled={disabled || quantity >= max}><Icon name="plus" size={20} /></button></div>
}

export function ProductPicker({ cart, onChange, disabled = false }: { cart: CartItem[]; onChange: (items: CartItem[]) => void; disabled?: boolean }) {
  const { state } = usePrototype()
  const [category, setCategory] = useState('Favoritos')
  const [search, setSearch] = useState('')
  const categories = ['Favoritos', 'Todos', ...new Set(state.products.map(product => product.category))]
  const products = [...state.products].sort((a, b) => a.order - b.order).filter(product => (
    (search || category === 'Todos' || category === 'Favoritos' && product.favorite || product.category === category)
    && `${product.name} ${product.description}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))
  ))
  function change(productId: string, quantity: number) {
    const remaining = cart.filter(item => item.productId !== productId)
    onChange(quantity > 0 ? [...remaining, { productId, quantity }] : remaining)
  }
  return <section className="ux-picker" aria-label="Escolher produtos"><label className="ux-search"><Icon name="search" /><input type="search" placeholder="Procurar produto" aria-label="Procurar produto" value={search} onChange={event => setSearch(event.target.value)} /></label><div className="ux-categories" aria-label="Categorias">{categories.map(item => <button className={category === item ? 'selected' : ''} key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="ux-products">{products.map(product => {
    const quantity = cart.find(item => item.productId === product.id)?.quantity ?? 0
    const stock = availableStock(state, product.id)
    return <article className={`ux-product ${quantity > 0 ? 'in-cart' : ''}`} key={product.id}><button className="ux-product-add" type="button" aria-label={`Adicionar ${product.name} por ${money(product.priceCents)}${stock <= 0 ? ' · Esgotado' : ''}`} disabled={disabled || quantity >= stock} onClick={() => change(product.id, quantity + 1)}><div className="ux-product-art"><img src={product.image} alt="" />{product.prepared && <span className="ux-product-preparation"><Icon name="clock" size={14} />Preparado</span>}{quantity > 0 && <span className="ux-product-count" aria-hidden="true">{quantity}</span>}</div><strong>{product.name}</strong><span className="ux-product-description">{product.description}</span><span className="ux-product-price">{money(product.priceCents)}<span className="ux-product-plus"><Icon name="plus" size={18} /></span></span>{stock <= 0 && <span className="ux-product-unavailable">Esgotado</span>}</button>{quantity > 0 && <QuantityControl name={product.name} quantity={quantity} max={stock} disabled={disabled} onChange={value => change(product.id, value)} />}</article>
  })}</div>{products.length === 0 && <EmptyState title="Produto não encontrado" description="Tente outro nome ou escolha uma categoria." />}</section>
}
