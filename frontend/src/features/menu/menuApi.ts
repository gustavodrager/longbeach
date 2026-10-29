import { apiFetch } from '../../lib/http'
import type { MenuAdminState, MenuCatalogProduct, MenuDocument, PublishedMenuDocument } from './menuTypes'

const menuPath = '/api/v1/bar/menu'
export const loadMenu = () => apiFetch<MenuAdminState>(menuPath)
export const saveMenu = (version: number, draft: MenuDocument) => apiFetch<MenuAdminState>(menuPath, {
  method: 'PUT', body: JSON.stringify({ version, draft }),
})
export const publishMenu = (version: number) => apiFetch<MenuAdminState>(`${menuPath}/publish`, {
  method: 'POST', body: JSON.stringify({ version }),
})
export const loadMenuCatalog = async (): Promise<MenuCatalogProduct[]> => {
  const entries = await apiFetch<{ product: MenuCatalogProduct }[]>('/api/v1/bar/products')
  return entries.map(entry => entry.product)
}
export const loadPublishedMenu = () => apiFetch<PublishedMenuDocument>('/api/v1/menu/published')
