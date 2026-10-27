import { useState } from 'react'

export function CopyPix({ code }: { code: string }) {
  const [message, setMessage] = useState('')
  async function copy() {
    try { await navigator.clipboard.writeText(code); setMessage('Código copiado. Abra seu banco para pagar.') }
    catch { setMessage('Não foi possível copiar automaticamente. Selecione o código abaixo e copie.') }
  }
  return <div className="pix-copy"><button type="button" className="ux-button primary" onClick={() => void copy()}>Copiar código Pix</button><p role="status">{message}</p><label className="ux-field">Pix copia e cola<textarea readOnly value={code} rows={3} onFocus={event => event.currentTarget.select()} /></label></div>
}
