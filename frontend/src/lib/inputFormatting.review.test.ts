import { createElement as h } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormattedInput } from '../components/FormattedInput'

afterEach(cleanup)

it('associa o valor canônico ao formulário indicado mesmo quando o campo fica fora dele', () => {
  render(h('div', null,
    h('form', { id: 'review-external-form' }),
    h(FormattedInput, { format: 'money', name: 'amount', form: 'review-external-form', defaultValue: '1234.56', 'aria-label': 'Valor externo' }),
  ))
  const form = document.getElementById('review-external-form') as HTMLFormElement
  expect(new FormData(form).get('amount')).toBe('1234.56')
  fireEvent.change(screen.getByLabelText('Valor externo'), { target: { value: '2.345,67' } })
  expect(new FormData(form).getAll('amount')).toEqual(['2345.67'])
})

it.each(['R$ ', '   '])('mantém obrigatório um valor monetário canonicamente vazio: %j', async draft => {
  const submitted = vi.fn()
  render(h('form', { 'aria-label': 'Pagamento obrigatório', onSubmit: (event: { preventDefault: () => void }) => { event.preventDefault(); submitted() } },
    h(FormattedInput, { format: 'money', name: 'amount', required: true, 'aria-label': 'Valor obrigatório' }),
    h('button', { type: 'submit' }, 'Confirmar'),
  ))
  const input = screen.getByLabelText('Valor obrigatório') as HTMLInputElement
  await userEvent.setup().type(input, `${draft}{enter}`)
  expect(submitted).not.toHaveBeenCalled()
  expect(input.checkValidity()).toBe(false)
  expect((screen.getByRole('form') as HTMLFormElement).checkValidity()).toBe(false)
})

it('envia somente o canônico, respeita limites e exclui valores desabilitados', () => {
  render(h('form', { 'aria-label': 'Pagamento limitado' },
    h(FormattedInput, { format: 'money', name: 'amount', min: 0, max: 2000, defaultValue: '1234.56', required: true, 'aria-label': 'Valor limitado' }),
    h(FormattedInput, { format: 'money', name: 'disabledAmount', disabled: true, defaultValue: 10 }),
  ))
  const form = screen.getByRole('form') as HTMLFormElement
  const input = screen.getByLabelText('Valor limitado') as HTMLInputElement
  expect([...new FormData(form).entries()]).toEqual([['amount', '1234.56']])
  fireEvent.change(input, { target: { value: '-0,01' } })
  expect(input.checkValidity()).toBe(false)
  fireEvent.change(input, { target: { value: 'R$ 2.000,01' } })
  expect(input.checkValidity()).toBe(false)
  fireEvent.change(input, { target: { value: '2.000,00' } })
  expect(input.checkValidity()).toBe(true)
  expect(new FormData(form).getAll('amount')).toEqual(['2000.00'])
})

it('não dispara alterações de valor apenas ao focar e desfocar', () => {
  const changed = vi.fn()
  render(h(FormattedInput, { format: 'money', value: '1234.56', onValueChange: changed, 'aria-label': 'Valor estável' }))
  const input = screen.getByLabelText('Valor estável')
  fireEvent.focus(input)
  fireEvent.blur(input)
  fireEvent.focus(input)
  fireEvent.blur(input)
  expect(input).toHaveValue('R$ 1.234,56')
  expect(changed).not.toHaveBeenCalled()
})

it('preserva custo com três casas digitadas com ponto quando a precisão permite seis', () => {
  const changed = vi.fn()
  render(h(FormattedInput, { format: 'money', decimalPlaces: 6, onValueChange: changed, 'aria-label': 'Custo preciso' }))
  fireEvent.change(screen.getByLabelText('Custo preciso'), { target: { value: '0.123' } })
  expect(changed).toHaveBeenLastCalledWith('0.123')
})
