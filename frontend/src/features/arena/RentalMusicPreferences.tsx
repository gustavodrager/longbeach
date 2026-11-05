import { rentalMusicGenres, type RentalMusicGenre } from './rentalMusic'
import './rental-music.css'

type Props = { value?: readonly RentalMusicGenre[]; onChange: (value: RentalMusicGenre[]) => void; disabled?: boolean }
export function RentalMusicPreferences({ value = [], onChange, disabled = false }: Props) {
  const selected = new Set(value)
  return <fieldset className="rental-music-field" disabled={disabled}>
    <legend>Preferências musicais (opcional)</legend>
    <div className="rental-music-options">{rentalMusicGenres.map(option => <label key={option.id}>
      <input type="checkbox" checked={selected.has(option.id)} onChange={event => {
        const next = new Set(selected)
        if (event.target.checked) next.add(option.id)
        else next.delete(option.id)
        onChange(rentalMusicGenres.filter(item => next.has(item.id)).map(item => item.id))
      }} />{option.label}
    </label>)}</div>
  </fieldset>
}
export function RentalMusicSummary({ value }: { value?: readonly RentalMusicGenre[] }) {
  const selected = rentalMusicGenres.filter(option => value?.includes(option.id))
  if (!selected.length) return null
  return <section className="rental-music-summary" aria-label="Preferências musicais">
    <h3>Preferências musicais</h3>
    <ul>{selected.map(option => <li key={option.id}>{option.label}</li>)}</ul>
  </section>
}
