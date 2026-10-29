export type MenuItem = {
  id: string
  name: string
  description: string
  visible: boolean
  productIds: string[]
}

export type MenuPage = {
  id: string
  title: string
  durationSeconds: number
  visible: boolean
  items: MenuItem[]
}

export type MenuDocument = { title: string; pages: MenuPage[] }
export type PublishedMenuItem = { id: string; name: string; description: string; price: number }
export type PublishedMenuPage = { id: string; title: string; durationSeconds: number; items: PublishedMenuItem[] }
export type PublishedMenuDocument = {
  version: number
  publishedAtUtc: string
  title: string
  pages: PublishedMenuPage[]
}
export type MenuAdminState = { version: number; draft: MenuDocument; published: PublishedMenuDocument | null }
export type MenuCatalogProduct = { id: string; name: string; salePrice: number; active: boolean }
export type MenuItemResolution = { price?: number; issue?: string }

export function resolveMenuItem(item: MenuItem, catalog: ReadonlyMap<string, MenuCatalogProduct>): MenuItemResolution {
  if (!item.productIds.length) return { issue: 'Vincule pelo menos um produto do cadastro.' }
  const products = item.productIds.map(id => catalog.get(id))
  if (products.some(product => !product)) return { issue: 'Um produto vinculado não foi encontrado. Revise os vínculos.' }
  if (products.some(product => !product!.active)) return { issue: 'Há produto inativo no grupo. Revise os vínculos ou o cadastro.' }
  if (products.some(product => !Number.isFinite(product!.salePrice) || product!.salePrice <= 0 || product!.salePrice > 99_999_999)) return { issue: 'Há produto sem preço de venda válido. Corrija o cadastro.' }
  const price = products[0]!.salePrice
  if (products.some(product => product!.salePrice !== price)) return { issue: 'Os produtos do grupo têm preços diferentes. Separe as opções ou corrija o cadastro.' }
  return { price }
}

export function resolveMenuPreview(document: MenuDocument, products: MenuCatalogProduct[]): { pages: PublishedMenuPage[]; issues: string[] } {
  const catalog = new Map(products.map(product => [product.id, product]))
  const issues: string[] = []
  const pages = document.pages.filter(page => page.visible).map(page => ({
    id: page.id, title: page.title, durationSeconds: page.durationSeconds,
    items: page.items.filter(item => item.visible).flatMap(item => {
      const result = resolveMenuItem(item, catalog)
      if (result.issue) { issues.push(`${page.title} / ${item.name}: ${result.issue}`); return [] }
      return [{ id: item.id, name: item.name, description: item.description, price: result.price! }]
    }),
  })).filter(page => page.items.length > 0)
  if (!pages.length) issues.push('Inclua ao menos uma página visível com um item válido para publicar.')
  return { pages, issues }
}
