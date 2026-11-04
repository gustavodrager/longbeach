import { useEffect, useState } from 'react'
import { ModalPanel } from '../../components/managementUi'

export function InitialAccessReceipt({ name, login, password, expiresAt, onClose }: { name: string; login: string; password: string; expiresAt?: string; onClose: () => void }) {
  const [copyError, setCopyError] = useState('')
  const [copied, setCopied] = useState(false)
  const expiry = expiresAt ? Date.parse(expiresAt) : undefined
  const [expired, setExpired] = useState(() => expiry !== undefined && (!Number.isFinite(expiry) || expiry <= Date.now()))
  useEffect(() => {
    if (expiry === undefined || !Number.isFinite(expiry)) return
    if (expiry <= Date.now()) { setExpired(true); return }
    const timer = setTimeout(() => setExpired(true), Math.min(expiry - Date.now(), 2_147_483_647))
    return () => clearTimeout(timer)
  }, [expiry])
  async function copy() {
    if (expired || expiry !== undefined && expiry <= Date.now()) { setExpired(true); return }
    setCopyError('')
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(`Usuário: ${login}\nSenha temporária: ${password}`)
      setCopied(true)
    } catch { setCopyError('Não foi possível copiar. Selecione os dados e copie manualmente.') }
  }
  return <ModalPanel title="Acesso inicial" onClose={onClose} className="staff-access-receipt">
    <div className="editor-body">
      <p><strong>{name}</strong></p>
      {expired ? <p role="alert">A senha temporária expirou. Feche este aviso e gere um novo acesso inicial na ficha da pessoa.</p> : <>
        <label className="operation-field">Usuário<input value={login} readOnly autoComplete="off" /></label>
        <label className="operation-field">Senha temporária<input value={password} readOnly autoComplete="off" spellCheck={false} /></label>
        <p className="arena-hint">Copie agora. A senha não poderá ser consultada novamente.</p>
        {expiry !== undefined && Number.isFinite(expiry) && <p>Válida até {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(expiry))}.</p>}
        <p className="arena-hint">A pessoa deverá definir uma nova senha antes de acessar o sistema.</p>
      </>}
      {copyError && <p role="alert" className="arena-error">{copyError}</p>}
      {copied && <p role="status">Dados copiados.</p>}
      <div className="form-actions"><button type="button" className="primary-button" disabled={expired} onClick={() => void copy()}>Copiar acesso</button><button type="button" className="secondary-link" onClick={onClose}>Concluir</button></div>
    </div>
  </ModalPanel>
}
