import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { Destination } from './navigation'

export function SectionNavigation({ items, activeHref, label, className }: {
  items: Destination[]; activeHref: string; label: string; className: string
}) {
  const navigation = useRef<HTMLElement>(null)
  useEffect(() => {
    const element = navigation.current
    const active = element?.querySelector<HTMLAnchorElement>('a[aria-current="page"]')
    if (!element || !active) return
    const reveal = () => {
      const area = element.getBoundingClientRect(), item = active.getBoundingClientRect()
      if (!area.width || !item.width) return
      // Leave space for focus and never change the page's saved height.
      const delta = item.left < area.left + 8 ? item.left - area.left - 8
        : item.right > area.right - 8 ? item.right - area.right + 8 : 0
      if (delta) element.scrollLeft = Math.max(0, element.scrollLeft + delta)
    }
    reveal()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(reveal)
    observer.observe(element)
    observer.observe(active)
    return () => observer.disconnect()
  }, [activeHref])
  return <nav ref={navigation} className={className} aria-label={label}>{items.map(item =>
    <Link key={item.href} to={item.href} aria-current={item.href === activeHref ? 'page' : undefined}>{item.label}</Link>
  )}</nav>
}
