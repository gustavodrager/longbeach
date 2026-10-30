import type { PublishedMenuDocument } from './menuTypes'

export type DisplayPage = PublishedMenuDocument['pages'][number] & { part: number; parts: number }

/** Split long categories instead of shrinking the tablet's type. */
export function paginateMenu(pages: PublishedMenuDocument['pages'], capacity = 7): DisplayPage[] {
  return pages.flatMap(page => {
    const groups: typeof page.items[] = []
    let group: typeof page.items = []
    let weight = 0
    for (const item of page.items) {
      const itemWeight = 1 + Math.floor(item.name.length / 32) * .4 + (item.description ? Math.ceil(item.description.length / 48) * .5 : 0)
      if (group.length && weight + itemWeight > capacity) { groups.push(group); group = []; weight = 0 }
      group.push(item); weight += itemWeight
    }
    if (group.length) groups.push(group)
    return groups.map((items, index) => ({ ...page, items, part: index + 1, parts: groups.length }))
  })
}

export function isPublishedMenu(value: unknown): value is PublishedMenuDocument {
  if (!value || typeof value !== 'object') return false
  const doc = value as PublishedMenuDocument
  return Number.isSafeInteger(doc.version) && doc.version > 0 && typeof doc.title === 'string' && doc.title.length <= 160
    && typeof doc.publishedAtUtc === 'string' && Number.isFinite(Date.parse(doc.publishedAtUtc))
    && Array.isArray(doc.pages) && doc.pages.length > 0 && doc.pages.length <= 40
    && doc.pages.every(page => page && typeof page === 'object' && typeof page.id === 'string' && typeof page.title === 'string' && page.title.length <= 160
      && Number.isInteger(page.durationSeconds) && page.durationSeconds >= 5 && page.durationSeconds <= 120
      && Array.isArray(page.items) && page.items.length > 0 && page.items.length <= 100
      && page.items.every(item => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string' && item.name.length <= 160
        && typeof item.description === 'string' && item.description.length <= 1000
        && Number.isFinite(item.price) && item.price > 0 && item.price <= 99999999))
}

export const menuCacheKey = 'longbeach:published-menu:v1'
export function readMenuCache(): PublishedMenuDocument | null {
  try {
    const json = localStorage.getItem(menuCacheKey)
    if (!json || json.length > 1_000_000) return null
    const value: unknown = JSON.parse(json)
    return isPublishedMenu(value) ? value : null
  } catch { return null }
}
export function cacheMenu(menu: PublishedMenuDocument | null) {
  try { if (menu) localStorage.setItem(menuCacheKey, JSON.stringify(menu)); else localStorage.removeItem(menuCacheKey) } catch { /* Playback also works when browser storage is unavailable. */ }
}
