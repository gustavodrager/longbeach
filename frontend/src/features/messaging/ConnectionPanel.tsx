import { useContext, useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import { ModalPanel } from '../../components/managementUi'
import { useAuth } from '../auth/authContext'
import { hasPermission } from '../auth/access'
import { MessagingDelivery, dateTime, messagingCommand, useMessagingAction, useMessagingQuery, useMessagingRefresh, type Connection } from './api'
import { ActionNotice, QueryNotice } from './shared'

const connectionLabels: Record<string, string> = { Disabled: 'Desativado', Suspended: 'Conexão suspensa', Connected: 'Conectado', Ready: 'Conectado', Disconnected: 'Desconectado', Offline: 'Desconectado', Connecting: 'Conectando', Syncing: 'Sincronizando', LoggedOut: 'Precisa reconectar', Unpaired: 'Precisa conectar', Pairing: 'Aguardando leitura do QR Code', QR: 'Aguardando leitura do QR Code', Unavailable: 'Conexão indisponível', NotConfigured: 'Conexão ainda não configurada' }
function PairQr({ code }: { code: string }) {
  const source = useMemo(() => { try { if (!code || code.length > 4096) return ''; const qr = qrcode(0, 'M'); qr.addData(code); qr.make(); return qr.createDataURL(6, 16) } catch { return '' } }, [code])
  return source ? <img className="whatsapp-pair-qr" src={source} alt="QR Code para conectar o WhatsApp da arena" /> : <p role="status">Aguardando um QR Code válido.</p>
}
function ConnectionManager({ close }: { close: () => void }) {
  const query = useMessagingQuery<Connection>('/connection', 5_000, true, 'messaging:manage'); const action = useMessagingAction(); const refresh = useMessagingRefresh()
  return <ModalPanel title="Conexão do WhatsApp" onClose={close}><div className="whatsapp-dialog-content"><p>Conecte somente o WhatsApp da arena pelo menu de dispositivos vinculados do celular.</p><QueryNotice query={query} label="consultar a conexão" />{query.data && <><strong>{connectionLabels[query.data.state] ?? query.data.state}</strong>{query.data.detail && <p>{query.data.detail}</p>}{query.data.updatedAtUtc && <small>Atualizado em {dateTime(query.data.updatedAtUtc)}</small>}{query.data.qrCode && <PairQr code={query.data.qrCode} />}</>}<ActionNotice action={action} /><div className="whatsapp-inline-actions"><button className="primary-link" type="button" disabled={action.busy} onClick={() => void action.run(async () => { const result = await messagingCommand<Connection>('/connection/pair'); await refresh(); return result }, 'Solicitação de conexão registrada.')}>Gerar QR Code</button><button className="secondary-link" type="button" disabled={action.busy} onClick={() => void action.run(async () => { const result = await messagingCommand<Connection>('/connection/reconnect'); await refresh(); return result }, 'Reconexão solicitada.')}>Reconectar</button></div><p className="whatsapp-muted">Enquanto a conexão estiver indisponível, os envios continuam visíveis para acompanhamento.</p></div></ModalPanel>
}
export function ConnectionStatus() {
  const { user } = useAuth(); const query = useMessagingQuery<Connection>('/connection', 15_000); const [open, setOpen] = useState(false)
  const delivery = useContext(MessagingDelivery)
  const ready = query.data && ['Connected', 'Ready'].includes(query.data.state)
  return <div className="whatsapp-connection"><span className={`whatsapp-connection-indicator ${ready && !query.isError ? 'is-ready' : ''}`} aria-hidden="true" /><span role="status">{query.isError ? 'Não foi possível conferir a conexão' : query.data ? connectionLabels[query.data.state] ?? query.data.state : 'Conferindo conexão…'}</span>{hasPermission(user, 'messaging:manage') && <button className="text-button" type="button" onClick={() => setOpen(true)}>Gerenciar conexão</button>}{delivery.waiting && <p className="whatsapp-delivery-notice" role="status">Envios aguardam a conexão ser ativada. Mensagens colocadas na fila serão enviadas quando ela voltar.</p>}{open && <ConnectionManager close={() => setOpen(false)} />}</div>
}
