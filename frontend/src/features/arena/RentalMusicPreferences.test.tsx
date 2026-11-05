import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RentalMusicPreferences, RentalMusicSummary } from './RentalMusicPreferences'
import type { RentalMusicGenre } from './rentalMusic'

function Editor({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState<RentalMusicGenre[]>([])
  return <><RentalMusicPreferences value={value} onChange={setValue} disabled={disabled} /><RentalMusicSummary value={value} /></>
}
it('permite escolher vários estilos e retirar todos com teclado', async () => {
  const user = userEvent.setup(); render(<Editor />)
  expect(screen.getByRole('group', { name: 'Preferências musicais (opcional)' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Preferências musicais' })).not.toBeInTheDocument()
  await user.tab(); expect(screen.getByRole('checkbox', { name: 'Rock' })).toHaveFocus()
  await user.keyboard(' '); await user.tab(); await user.keyboard(' ')
  expect(screen.getByRole('checkbox', { name: 'Rock' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Pop' })).toBeChecked()
  expect(screen.getByRole('region', { name: 'Preferências musicais' })).toHaveTextContent('RockPop')
  await user.click(screen.getByRole('checkbox', { name: 'Rock' })); await user.click(screen.getByRole('checkbox', { name: 'Pop' }))
  expect(screen.queryByRole('region', { name: 'Preferências musicais' })).not.toBeInTheDocument()
})
it('respeita o bloqueio de envio sem trocar a seleção', async () => {
  render(<RentalMusicPreferences value={['rock', 'pagode']} onChange={vi.fn()} disabled />)
  expect(screen.getByRole('checkbox', { name: 'Rock' })).toBeChecked()
  screen.getAllByRole('checkbox').forEach(input => expect(input).toBeDisabled())
})
it('conserva rótulos conhecidos ao consultar um cadastro anterior', () => {
  const { rerender } = render(<RentalMusicSummary />)
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
  rerender(<RentalMusicSummary value={['forro-piseiro', 'rap-hip-hop', 'brega-arrocha']} />)
  expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['Forró / Piseiro', 'Rap / Hip-hop', 'Brega / Arrocha'])
})
