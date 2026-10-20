import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CopyPix } from './CopyPix'
import { PixQr } from './PixQr'

afterEach(cleanup)

it('gera uma imagem local válida e preserva exatamente o código bancário para cópia', () => {
  const payload = '00020101021226800014br.gov.bcb.pix2558example.invalid/pix/0012345678905204000053039865406100.005802BR5910LONG BEACH6009SAO PAULO62070503***6304ABCD'
  const network = vi.spyOn(globalThis, 'fetch')
  render(<><PixQr code={payload} /><CopyPix code={payload} /></>)
  const source = screen.getByRole('img', { name: 'QR Code Pix desta conta' }).getAttribute('src')!
  expect(source).toMatch(/^data:image\/gif;base64,/)
  const gif = atob(source.split(',')[1])
  expect(['GIF87a', 'GIF89a']).toContain(gif.slice(0, 6))
  expect(gif.charCodeAt(6) | gif.charCodeAt(7) << 8).toBeGreaterThan(100)
  expect(gif.at(-1)).toBe(';')
  expect(screen.getByLabelText('Pix copia e cola')).toHaveValue(payload)
  expect(network).not.toHaveBeenCalled()
})

it.each(['x'.repeat(2049), '\ud800', 'invalid\u0000payload'])('mantém a cópia disponível quando o conteúdo não pode gerar QR com segurança', code => {
  render(<><PixQr code={code} /><CopyPix code={code} /></>)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.getByText(/Não foi possível exibir o QR Code/)).toBeInTheDocument()
  expect(screen.getByLabelText('Pix copia e cola')).toHaveValue(code)
  expect(screen.getByRole('button', { name: 'Copiar código Pix' })).toBeEnabled()
})
