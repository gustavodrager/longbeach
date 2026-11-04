import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FormattedInput } from './FormattedInput'

function Money({ initial = 0, changed = (_: string) => {} }: { initial?: number; changed?: (value: string) => void }) {
  const [value, setValue] = useState(initial)
  return <label>Valor<FormattedInput format="money" required value={value} min={0} onValueChange={next => { changed(next); setValue(Number(next)) }} /></label>
}

describe('valor visível e valor enviado', () => {
  it('edita reais normalmente, cola milhares e não renova uma operação ao focar/desfocar', async () => {
    const user = userEvent.setup(); const changed = vi.fn(); render(<Money initial={1234.56} changed={changed} />)
    const input = screen.getByRole('textbox', { name: 'Valor' })
    expect(input).toHaveValue('R$ 1.234,56')
    await user.click(input); expect(input).toHaveValue('1.234,56'); await user.tab(); expect(input).toHaveValue('R$ 1.234,56'); expect(changed).not.toHaveBeenCalled()
    await user.click(input); await user.clear(input); await user.type(input, '25,75'); await user.tab()
    expect(input).toHaveValue('R$ 25,75'); expect(changed).toHaveBeenLastCalledWith('25.75')
    fireEvent.change(input, { target: { value: 'R$ 2.345,67' } }); fireEvent.blur(input)
    expect(input).toHaveValue('R$ 2.345,67'); expect(changed).toHaveBeenLastCalledWith('2345.67')
  })
  it('mantém separador parcial e não transforma a terceira casa digitada em milhares', async () => {
    const user = userEvent.setup(); render(<Money />); const input = screen.getByRole('textbox', { name: 'Valor' })
    await user.click(input); await user.clear(input); await user.type(input, '7,25'); expect(input).toHaveValue('7,25'); await user.tab(); expect(input).toHaveValue('R$ 7,25')
    await user.click(input); await user.clear(input); await user.type(input, '1.234'); expect(input).toHaveValue('1.234'); expect(input).toBeInvalid()
    await user.tab(); expect(input).toHaveValue('1.234')
  })
  it('mantém seis casas, min/max, required canônico e FormData sem máscara', () => {
    render(<form aria-label="Compra"><label>Custo<FormattedInput name="cost" format="money" decimalPlaces={6} required min={0} max={10} defaultValue="0.123456" /></label></form>)
    const input = screen.getByRole('textbox', { name: 'Custo' }); const form = screen.getByRole('form') as HTMLFormElement
    expect(input).toHaveValue('R$ 0,123456'); expect(new FormData(form).get('cost')).toBe('0.123456')
    fireEvent.change(input, { target: { value: '0.123' } }); expect(new FormData(form).get('cost')).toBe('0.123'); expect(input).toBeValid()
    fireEvent.change(input, { target: { value: '11,00' } }); expect(input).toBeInvalid()
    fireEvent.change(input, { target: { value: 'R$ ' } }); expect(input).toBeInvalid(); expect(new FormData(form).get('cost')).toBe('')
  })
  it('atualiza um valor externo e permite zero e vazio opcionais', () => {
    const { rerender } = render(<label>Valor<FormattedInput format="money" value="" /></label>); const input = screen.getByRole('textbox', { name: 'Valor' })
    expect(input).toHaveValue(''); expect(input).toBeValid()
    rerender(<label>Valor<FormattedInput format="money" value={0} /></label>); expect(input).toHaveValue('R$ 0,00')
    rerender(<label>Valor<FormattedInput format="money" value={1234.56} /></label>); expect(input).toHaveValue('R$ 1.234,56')
  })
})

describe('máscaras de contato e identidade', () => {
  it('aceita telefone formatado colado sem cortar dígitos e mantém o valor canônico', async () => {
    const user = userEvent.setup(); const changed = vi.fn(); render(<label>Telefone<FormattedInput format="phone" name="phone" onValueChange={changed} maxLength={15} pattern="[0-9]{10,15}" /></label>)
    const input = screen.getByRole('textbox', { name: 'Telefone' }); await user.click(input); await user.paste('(11) 98765-4321')
    expect(input).toHaveValue('(11) 98765-4321'); expect(changed).toHaveBeenLastCalledWith('11987654321'); expect(input).toBeValid()
    await user.clear(input); await user.type(input, '5511987654321'); expect(input).toHaveValue('+55 (11) 98765-4321'); expect(input).toBeValid()
  })
  it('valida CPF/CNPJ sobre dígitos e preserva zero inicial e edição no meio', async () => {
    const user = userEvent.setup(); const changed = vi.fn(); render(<label>Documento<FormattedInput format="document" name="taxId" onValueChange={changed} required maxLength={14} pattern="[0-9]{11}|[0-9]{14}" /></label>)
    const input = screen.getByRole('textbox', { name: 'Documento' }) as HTMLInputElement; await user.click(input); await user.paste('01.234.567/0001-89')
    expect(input).toHaveValue('01.234.567/0001-89'); expect(changed).toHaveBeenLastCalledWith('01234567000189'); expect(input).toBeValid()
    input.setSelectionRange(3, 4); await user.type(input, '9', { skipClick: true }); expect(changed).toHaveBeenLastCalledWith('01934567000189')
    await user.clear(input); await user.type(input, '01234567890'); expect(input).toHaveValue('012.345.678-90'); expect(input).toBeValid()
    await user.clear(input); await user.type(input, '123'); expect(input).toBeInvalid()
  })
  it('preserva texto legado de telefone até ser editado e respeita disabled', () => {
    render(<form aria-label="Contato"><label>Telefone<FormattedInput format="phone" name="phone" defaultValue="Contato antigo a conferir" disabled /></label></form>)
    expect(screen.getByRole('textbox')).toHaveValue('Contato antigo a conferir'); expect(new FormData(screen.getByRole('form') as HTMLFormElement).has('phone')).toBe(false)
  })
  it('mantém o sinal de DDI e permite apagar separadores sem prender o cursor', async () => {
    const user = userEvent.setup(); const changed = vi.fn(); render(<label>Telefone<FormattedInput format="phone" onValueChange={changed} /></label>)
    const input = screen.getByRole('textbox', { name: 'Telefone' }) as HTMLInputElement
    await user.type(input, '+14155552671'); expect(input).toHaveValue('+14155552671'); expect(changed).toHaveBeenLastCalledWith('+14155552671')
    await user.clear(input); await user.type(input, '11987654321'); expect(input).toHaveValue('(11) 98765-4321')
    input.setSelectionRange(5, 5); await user.keyboard('{Backspace}'); expect(changed).toHaveBeenLastCalledWith('1987654321')
    await user.clear(input); expect(input).toHaveValue('')
  })
})
