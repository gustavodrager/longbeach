export const rentalMusicGenres = [
  { id: 'rock', label: 'Rock' },
  { id: 'pop', label: 'Pop' },
  { id: 'pagode', label: 'Pagode' },
  { id: 'samba', label: 'Samba' },
  { id: 'sertanejo', label: 'Sertanejo' },
  { id: 'mpb', label: 'MPB' },
  { id: 'funk', label: 'Funk' },
  { id: 'forro-piseiro', label: 'Forró / Piseiro' },
  { id: 'rap-hip-hop', label: 'Rap / Hip-hop' },
  { id: 'trap', label: 'Trap' },
  { id: 'eletronica', label: 'Eletrônica' },
  { id: 'reggae', label: 'Reggae' },
  { id: 'axe', label: 'Axé' },
  { id: 'gospel', label: 'Gospel' },
  { id: 'brega-arrocha', label: 'Brega / Arrocha' },
] as const

export type RentalMusicGenre = typeof rentalMusicGenres[number]['id']
const knownGenres = new Set<string>(rentalMusicGenres.map(option => option.id))
export function validRentalMusicPreferences(value: unknown): value is RentalMusicGenre[] {
  return Array.isArray(value) && value.length <= rentalMusicGenres.length
    && value.every(item => typeof item === 'string' && knownGenres.has(item))
    && new Set(value).size === value.length
}
