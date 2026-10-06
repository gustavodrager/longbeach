import type { Named } from './api'

/** Attendance always uses Bar; other locations remain available to stock management. */
export function barLocation(locations: Named[] | undefined) {
  const matches = locations?.filter(location => location.name.trim().toLocaleLowerCase('pt-BR') === 'bar') ?? []
  return matches.length === 1 ? matches[0] : undefined
}
