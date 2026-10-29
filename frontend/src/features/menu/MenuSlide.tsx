import { useState } from 'react'
import type { MenuDocument, MenuCatalogProduct, PublishedMenuDocument } from './menuTypes'
import { paginateMenu, type DisplayPage } from './menuPresentationModel'
import './menu-display.css'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export function MenuSlide({ page, title = 'Cardápio' }: { page: PublishedMenuDocument['pages'][number] | DisplayPage; title?: string }) {
  return <article className="menu-slide" aria-label={page.title}>
    <header className="menu-slide-header">
      <div className="menu-brand-pair"><img src="/brand/menu-longbeach.png" alt="LongBeach Arena" /><span aria-hidden="true" /><img src="/brand/menu-quebranunca.png" alt="QuebraNunca" /></div>
      <p className="menu-slide-title">{title}</p>
    </header>
    <div className="menu-category-heading"><h1>{page.title}</h1>{'parts' in page && page.parts > 1 && <span>{page.part}/{page.parts}</span>}</div>
    <ul className="menu-product-list">{page.items.map(item => <li key={item.id}>
      <div><span className="menu-product-name">{item.name}</span>{item.description && <p>{item.description}</p>}</div>
      <strong className="menu-product-price">{Number.isFinite(item.price) && item.price > 0 ? currency.format(item.price) : '—'}</strong>
    </li>)}</ul>
    <footer className="menu-slide-footer">Bebidas alcoólicas: venda proibida para menores de 18 anos.</footer>
  </article>
}

export function MenuPreview({ document, products, selectedPageId }: { document: MenuDocument; products: MenuCatalogProduct[]; selectedPageId?: string }) {
  const [index, setIndex] = useState(0)
  const byId = new Map(products.map(product => [product.id, product]))
  const resolved = document.pages.filter(page => page.visible && (!selectedPageId || page.id === selectedPageId)).map(page => ({
    ...page, items: page.items.filter(item => item.visible).map(item => {
      const linked = item.productIds.map(id => byId.get(id))
      const first = linked[0]
      const valid = first && first.active && first.salePrice > 0 && linked.every(product => product?.active && product.salePrice === first.salePrice)
      return { id: item.id, name: item.name, description: item.description, price: valid ? first.salePrice : 0 }
    }),
  }))
  const pages = paginateMenu(resolved)
  const page = pages[Math.min(index, pages.length - 1)]
  if (!page) return <p className="menu-preview-empty">Adicione itens visíveis para conferir a prévia.</p>
  return <div className="menu-preview"><p className="menu-preview-label">Prévia • traços indicam vínculos ou preços pendentes</p><MenuSlide title={document.title} page={page} />
    {pages.length > 1 && <nav aria-label="Páginas da prévia"><button type="button" onClick={() => setIndex(i => (i + pages.length - 1) % pages.length)}>Anterior</button><span>{Math.min(index, pages.length - 1) + 1} de {pages.length}</span><button type="button" onClick={() => setIndex(i => (i + 1) % pages.length)}>Próxima</button></nav>}
  </div>
}
