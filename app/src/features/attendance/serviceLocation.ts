import type { Named } from './api'

/** Attendance and stock management use the same unique Bar stock. */
export function barLocation(locations: Named[] | undefined) {
  const matches = locations?.filter(location => location.name.trim().toLocaleLowerCase('pt-BR') === 'bar') ?? []
  return matches.length === 1 ? matches[0] : undefined
}
