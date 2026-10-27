import { useMemo } from 'react'
import qrcode from 'qrcode-generator'
export function AccessQr({ url }: { url: string }) {
  const src = useMemo(() => { const code = qrcode(0, 'M'); code.addData(url); code.make(); return code.createDataURL(6, 4) }, [url])
  return <img className="lb-tab-qr" src={src} alt="QR Code para abrir somente esta comanda" />
}
