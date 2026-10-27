import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

export function PixQr({ code }: { code: string }) {
  const src = useMemo(() => {
    // Keep the bank's payload intact and bound local QR generation work.
    if (!code || code.length > 2048 || /[\u0000-\u001f\u007f]/.test(code)) return null
    try {
      encodeURIComponent(code) // Reject malformed Unicode rather than silently replacing it.
      const bytes = new TextEncoder().encode(code)
      if (bytes.length > 2048) return null
      const qr = qrcode(0, 'M')
      qr.addData(Array.from(bytes, byte => String.fromCharCode(byte)).join(''), 'Byte')
      qr.make()
      return qr.createDataURL(6, 24)
    } catch {
      return null
    }
  }, [code])

  return src
    ? <img className="lb-pix-qr" src={src} alt="QR Code Pix desta conta" />
    : <p role="status">Não foi possível exibir o QR Code. Use o Pix copia e cola abaixo.</p>
}
