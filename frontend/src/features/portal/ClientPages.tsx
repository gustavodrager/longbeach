import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/authContext'
import { ApiError, apiFetch } from '../../lib/http'
import { money } from '../attendance/api'
import { AccountItems } from '../billing/AccountItems'
import type { Account } from '../billing/api'
import { moveDate } from '../arena/agenda'
import { AvailabilityPicker } from './AvailabilityPicker'
import './portal-service-clean.css'
import { HelpContact } from './ClientLayout'
import type { Customer } from '../customers/api'
import { dayLabel, label, messageOf, send, today, usePortal, type Appointment, type Options, type PortalRequest, type Profile } from './api'

export function QueryState({query}:{query:{isPending:boolean;isError:boolean;refetch:()=>unknown}}) { return query.isPending?<p role="status">Carregando sua área…</p>:query.isError?<div className="portal-alert" role="alert">Não foi possível atualizar. <button onClick={()=>void query.refetch()}>Tentar novamente</button></div>:null }
export function PortalHome() {
  const profile = usePortal<Profile>('profile')
  const agenda = usePortal<Appointment[]>('agenda')
  const requests = usePortal<PortalRequest[]>('requests')
  const { user } = useAuth()
  const accounts = useQuery({ queryKey: ['billing', user?.id, '/api/v1/me/billing'], queryFn: () => apiFetch<Account[]>('/api/v1/me/billing/accounts'), refetchOnWindowFocus: true })
  const next = agenda.data?.find(a => a.canChange)
  const pending = requests.data?.filter(r => ['Sent', 'Reviewing', 'Alternative'].includes(r.status)) ?? []
  const recentReplies = requests.data?.filter(r => ['Confirmed', 'Declined', 'Withdrawn'].includes(r.status)).slice(0, 2) ?? []
  const currentAccounts = !accounts.isError ? accounts.data : undefined
  const due = currentAccounts?.reduce((total, a) => total + a.payable, 0)
  const inConfirmation = currentAccounts?.reduce((total, a) => total + a.pending, 0) ?? 0
  const bar = currentAccounts?.some(a => a.kind === 'Bar' && a.state === 'Open')
  return <div className="portal-home">
    <header className="portal-title"><h1>Minha área</h1></header>
    <QueryState query={agenda} />
    {next ? <section className="portal-next" aria-labelledby="next-appointment">
      <div className="portal-card-top"><span>Próximo compromisso</span><strong className="portal-status">{next.status}</strong></div>
      <h2 id="next-appointment">{next.title}</h2>
      <p className="portal-time">{dayLabel(next.date)} · {next.startTime}–{next.endTime}</p>
      {(next.court || next.teacher) && <p className="portal-appointment-place">{[next.court, next.teacher && `Professor: ${next.teacher}`].filter(Boolean).join(' · ')}</p>}
      <Link className="portal-primary" to={`/minha-area/agenda?atividade=${encodeURIComponent(next.key)}`}>Ver compromisso</Link>
      {profile.data?.reminders && next.date === today() && <p role="status">É hoje!</p>}
    </section> : !agenda.isPending && !agenda.isError && <section className="portal-next"><h2>Nenhum compromisso agendado</h2><p>Nos próximos 60 dias.</p></section>}
    <nav className="portal-quick-actions" aria-label="Solicitar atividade">
      <Link to="/minha-area/solicitar?tipo=Reservation">Solicitar quadra</Link>
      <Link to="/minha-area/solicitar?tipo=Trial">Aula experimental</Link>
    </nav>
    {profile.data && !profile.isError && profile.data.links.length === 0 && <section className="portal-home-notice" aria-labelledby="welcome-title">
      <h2 id="welcome-title">Cadastro sem vínculos</h2>
      <p>Peça à equipe para vincular suas aulas ou reservas. Criar conta não confirma matrícula nem reserva.</p>
      <div className="portal-actions"><Link to="/minha-area/perfil">Conferir perfil</Link><Link to="/minha-area/ajuda">Solicitar vínculo</Link></div>
    </section>}
    <div className="portal-home-grid">
      <section className="portal-card" aria-labelledby="home-requests">
        <h2 id="home-requests">Solicitações</h2><QueryState query={requests} />
        {pending.length > 0 ? <p><strong>{pending.length}</strong> em acompanhamento</p> : !requests.isPending && !requests.isError && <p>Nenhuma solicitação pendente.</p>}
        {recentReplies.map(r => <p key={r.id}>{label(r.kind)}: <strong>{label(r.status)}</strong>{r.reply && <> — {r.reply}</>}</p>)}
        <Link to="/minha-area/agenda#solicitacoes">Ver solicitações e respostas</Link>
      </section>
      <section className="portal-card" aria-labelledby="home-payments">
        <h2 id="home-payments">Pagamentos</h2><QueryState query={accounts} />
        {currentAccounts && <>
          {due ? <p className="portal-payment-summary"><strong>{money(due)}</strong><span>Disponível para pagar</span></p> : <p>Nenhum valor disponível para pagar.</p>}
          {inConfirmation > 0 && <p>{money(inConfirmation)} em confirmação</p>}
          <Link to="/minha-area/pagamentos">Ver contas</Link>
        </>}
      </section>
      {bar && <section className="portal-card" aria-labelledby="home-tab"><h2 id="home-tab">Comanda aberta</h2><Link to="/minha-area/bar">Ver comanda</Link></section>}
    </div>
  </div>
}

function AppointmentCard({appointment:a,expanded=false}:{appointment:Appointment;expanded?:boolean}) {
  const cache=useQueryClient();const [score,setScore]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false)
  async function rate(e:FormEvent){e.preventDefault();setBusy(true);setMessage('');try{await send('/api/v1/me/portal/ratings',{appointmentKey:a.key,score:Number(score)});setMessage('Obrigado por avaliar sua visita.');await cache.invalidateQueries({queryKey:['portal']})}catch(e){setMessage(messageOf(e))}finally{setBusy(false)}}
  return <article className="portal-card portal-appointment-card"><div className="portal-card-top"><span>{a.activityKind==='Trial'?'Aula experimental':a.kind}</span><strong className="portal-status">{a.status}</strong></div><h2>{a.title}</h2><p className="portal-time">{dayLabel(a.date)} · {a.startTime}–{a.endTime}</p>{(a.court||a.teacher)&&<p>{[a.court,a.teacher&&`Professor: ${a.teacher}`].filter(Boolean).join(' · ')}</p>}<details open={expanded||undefined}><summary>Opções</summary>{a.instructions&&<p>{a.instructions}</p>}{a.canChange&&<div className="portal-actions"><Link to={`/minha-area/solicitar?tipo=Reschedule&atividade=${encodeURIComponent(a.key)}`}>Solicitar remarcação</Link><Link to={`/minha-area/solicitar?tipo=Cancellation&atividade=${encodeURIComponent(a.key)}`}>Solicitar cancelamento</Link></div>}<Link to="/minha-area/ajuda">Preciso de ajuda</Link></details>
    {a.canRate&&<form className="portal-rating" onSubmit={e=>void rate(e)}><label>Como foi sua visita?<select required value={score} onChange={e=>setScore(e.target.value)}><option value="">Escolha uma nota</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} de 5</option>)}</select></label><button disabled={busy}>{busy?'Enviando…':'Enviar avaliação'}</button></form>}{a.rating&&<p>Você avaliou esta visita com {a.rating} de 5.</p>}{message&&<p role="status">{message}</p>}
  </article>
}
export function RequestCard({request:r}:{request:PortalRequest}) {
  const options=usePortal<Options>('options');const cache=useQueryClient();const [busy,setBusy]=useState(false);const [error,setError]=useState('')
  async function accept(){setBusy(true);setError('');try{await send(`/api/v1/me/portal/requests/${r.id}/accept`,{version:r.version});await cache.invalidateQueries({queryKey:['portal']})}catch(e){setError(messageOf(e))}finally{setBusy(false)}}
  async function withdraw(){setBusy(true);setError('');try{await send(`/api/v1/me/portal/requests/${r.id}/withdraw`,{version:r.version});await cache.invalidateQueries({queryKey:['portal']})}catch(e){setError(messageOf(e))}finally{setBusy(false)}}
  return <article className="portal-card"><div className="portal-card-top"><span>{label(r.kind)}</span><strong className="portal-status">{label(r.status)}</strong></div>{r.date&&<p>{dayLabel(r.date)} · {r.startTime}–{r.endTime}</p>}{r.courtId&&(options.data?.courts.length??0)>1&&<p>{options.data?.courts.find(c=>c.id===r.courtId)?.name??'Quadra indicada pela equipe'}</p>}{r.amount!=null&&<p>Valor combinado: {money(r.amount)}</p>}{r.message&&<p>Você: {r.message}</p>}{r.reply&&<p><strong>Resposta da equipe:</strong> {r.reply}</p>}{r.history && r.history.length > 1 && <details><summary>Histórico da solicitação</summary><ol>{r.history.map((h,i)=><li key={i}><strong>{label(h.status)}</strong> · {new Date(h.atUtc).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}<p>{h.reply}</p>{h.date&&<p>{dayLabel(h.date)} · {h.startTime}–{h.endTime}</p>}</li>)}</ol></details>}{r.status==='Alternative'&&<><p>Este horário ainda não está reservado. Ao aceitar, vamos conferir a disponibilidade novamente.</p><button disabled={busy} onClick={()=>void accept()}>{busy?'Conferindo…':'Aceitar este horário'}</button></>}{['Sent','Reviewing'].includes(r.status)&&<p>Aguarde a confirmação da equipe.{r.appointmentKey?' Seu compromisso atual continua válido.':' O envio não garante a vaga.'}</p>}{['Sent','Reviewing','Alternative'].includes(r.status)&&<button disabled={busy} onClick={()=>void withdraw()}>{r.status==='Alternative'?'Recusar proposta e encerrar pedido':'Retirar solicitação'}</button>}{error&&<p role="alert">{error}</p>}</article>
}
export function PortalAgenda() {
  const query=usePortal<Appointment[]>('agenda');const requests=usePortal<PortalRequest[]>('requests');const [params]=useSearchParams();const [past,setPast]=useState(false)
  const rows=query.data?.filter(a=>past?a.date<today():a.date>=today())??[]
  return <div className="portal-service-clean portal-agenda-page"><header className="portal-title"><h1>Minha agenda</h1></header><div className="portal-actions"><Link className="portal-primary" to="/minha-area/solicitar?tipo=Reservation">Solicitar quadra</Link><Link to="/minha-area/solicitar?tipo=Trial">Aula experimental</Link></div><nav className="portal-filters" aria-label="Período da agenda"><button aria-pressed={!past} onClick={()=>setPast(false)}>Próximos</button><button aria-pressed={past} onClick={()=>setPast(true)}>Histórico</button></nav><QueryState query={query}/>{!query.isPending&&!query.isError&&!rows.length&&<section className="portal-card"><h2>{past?'Nenhuma visita nos últimos 30 dias':'Nenhum compromisso nos próximos 60 dias'}</h2><p>Peça à equipe para conferir o vínculo de aulas ou reservas.</p><Link to="/minha-area/ajuda">Conferir meu cadastro</Link></section>}{rows.map(a=><AppointmentCard key={a.key} appointment={a} expanded={a.key===params.get('atividade')}/>)}<section id="solicitacoes"><h2>Minhas solicitações</h2><QueryState query={requests}/>{requests.data?.map(r=><RequestCard key={r.id} request={r}/>)}{!requests.isPending&&!requests.isError&&requests.data?.length===0&&<p>Nenhuma solicitação.</p>}</section></div>
}
export function PortalRequestForm({help=false}:{help?:boolean}) {
  const [params]=useSearchParams()
  return <RequestForm key={`${help}:${params.toString()}`} help={help}/>
}
function RequestForm({help=false}:{help?:boolean}) {
  const [params]=useSearchParams();const navigate=useNavigate();const cache=useQueryClient();const options=usePortal<Options>('options');const agenda=usePortal<Appointment[]>('agenda')
  const kind=help?'Help':params.get('tipo')??'Reservation';const appointmentKey=params.get('atividade');const original=agenda.data?.find(a=>a.key===appointmentKey)
  const { user }=useAuth(); const draftKey=`lb-portal-request-v1:${user?.id}:${kind}:${appointmentKey??''}`
  const [draft]=useState(()=>{try { const saved=JSON.parse(sessionStorage.getItem(draftKey)??'null'); return saved && typeof saved.operationId==='string' && ['date','startTime','endTime','message'].every(k=>typeof saved[k]==='string') ? saved as {operationId:string;date:string;startTime:string;endTime:string;courtId?:string;message:string} : null }catch{return null}})
  const [date,setDate]=useState(draft?.date??'');const [start,setStart]=useState(draft?.startTime??'');const [end,setEnd]=useState(draft?.endTime==='24:00'?'00:00':draft?.endTime??'');const [court,setCourt]=useState(draft?.courtId??'');const [message,setMessage]=useState(draft?.message??'');const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [uncertain,setUncertain]=useState(Boolean(draft));const operation=useRef(draft?.operationId??crypto.randomUUID());const lock=useRef(false)
  const slot=['Trial','Reservation','Reschedule'].includes(kind)
  const effectiveCourt = uncertain ? court : court || (options.data?.courts.length === 1 ? options.data.courts[0].id : '')
  const valid=['Trial','Reservation','Reschedule','Cancellation','Help'].includes(kind)
  async function submit(e:FormEvent){
    e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');setUncertain(true);setCourt(effectiveCourt)
    const body={operationId:operation.current,kind,appointmentKey,date,startTime:start,endTime:end==='00:00'?'24:00':end,courtId:effectiveCourt||null,message}
    try{sessionStorage.setItem(draftKey,JSON.stringify(body))}catch{/* Current page retains the same intent. */}
    try{await send('/api/v1/me/portal/requests',body);try{sessionStorage.removeItem(draftKey)}catch{/* optional storage */}await cache.invalidateQueries({queryKey:['portal']});navigate('/minha-area/agenda#solicitacoes')}
    catch(e){if(e instanceof ApiError&&[400,422].includes(e.status)){setUncertain(false);try{sessionStorage.removeItem(draftKey)}catch{/* optional storage */}operation.current=crypto.randomUUID()}setError(messageOf(e))}
    finally{lock.current=false;setBusy(false)}
  }
  if(!valid)return <p>Solicitação não encontrada. <Link to="/minha-area/agenda">Voltar à agenda</Link></p>
  const titles:Record<string,string>={Reservation:'Solicitar quadra',Trial:'Aula experimental',Reschedule:'Solicitar remarcação',Cancellation:'Solicitar cancelamento',Help:'Preciso de ajuda'}
  return <div className="portal-service-clean portal-request-page"><Link className="portal-back" to="/minha-area/agenda">← Voltar à agenda</Link><header className="portal-title"><h1>{titles[kind]}</h1><p className="portal-request-consequence">{help?'A resposta aparece em Minhas solicitações.':'Enviar esta solicitação não garante a vaga nem altera seu compromisso atual.'}</p></header>{original&&<section className="portal-card"><h2>{original.title}</h2><p>{dayLabel(original.date)} · {original.startTime}–{original.endTime}</p></section>}
    <form className="portal-card portal-form portal-service-form" onSubmit={e=>void submit(e)}><fieldset disabled={busy||uncertain}>{slot&&<><div className="portal-actions" aria-label="Escolher data rapidamente"><button type="button" onClick={()=>setDate(today())}>Hoje</button><button type="button" onClick={()=>setDate(moveDate(today(),1))}>Amanhã</button></div><label>Data desejada<input type="date" required min={today()} value={date} onChange={e=>setDate(e.target.value)}/></label><AvailabilityPicker date={date} courtId={effectiveCourt||undefined} disabled={busy||uncertain} onPick={(from,to,id)=>{setStart(from);setEnd(to);if(id)setCourt(id)}}/><div className="portal-two"><label>Das<input type="time" required value={start} onChange={e=>setStart(e.target.value)}/></label><label>Até<input type="time" aria-describedby="end-time-hint" required value={end} onChange={e=>setEnd(e.target.value)}/></label></div><p id="end-time-hint">00:00 significa meia-noite ao final desse dia.</p>{(options.data?.courts.length??0)>1&&<label>Preferência de quadra<select value={court} onChange={e=>setCourt(e.target.value)}><option value="">A equipe pode indicar</option>{options.data?.courts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}</>}<label>{help?'Como podemos ajudar?':'Mensagem para a equipe'}<textarea required={help||kind==='Cancellation'} maxLength={1000} rows={3} value={message} onChange={e=>setMessage(e.target.value)}/></label></fieldset>{error&&<p role="alert">{error}</p>}{uncertain&&!busy&&<p>Verifique o envio para recuperar a mesma solicitação.</p>}<button className="portal-primary" disabled={busy||(['Reschedule','Cancellation'].includes(kind)&&!original?.canChange)}>{busy?'Enviando…':uncertain?'Verificar envio':'Enviar solicitação'}</button></form>{help&&<HelpContact/>}</div>
}
export function PortalBar() {
  const {user}=useAuth();const accounts=useQuery({queryKey:['billing',user?.id,'/api/v1/me/billing'],queryFn:()=>apiFetch<Account[]>('/api/v1/me/billing/accounts'),refetchInterval:15000});const [error,setError]=useState('');const [busy,setBusy]=useState('')
  async function open(id:string){setBusy(id);setError('');try{const access=await send<{token:string}>(`/api/v1/me/portal/bar/${id}/access`,{operationId:crypto.randomUUID()});window.location.assign(`/cliente#token=${encodeURIComponent(access.token)}`)}catch(e){setError(messageOf(e))}finally{setBusy('')}}
  return <div className="portal-service-clean portal-bar-page"><header className="portal-title"><h1>Bar</h1></header><QueryState query={accounts}/>{(!accounts.isError ? accounts.data : undefined)?.filter(a=>a.kind==='Bar'&&a.state==='Open').map(a=><article className="portal-card" key={a.id}><h2>{a.title}</h2><dl className="billing-totals"><div><dt>Total da comanda</dt><dd>{money(a.total)}</dd></div><div><dt>Já pago</dt><dd>{money(a.paid)}</dd></div><div><dt>Em confirmação</dt><dd>{money(a.pending)}</dd></div><div><dt>Disponível para pagar</dt><dd>{money(a.payable)}</dd></div></dl><AccountItems account={a}/><div className="portal-actions"><Link className="portal-primary" to={`/minha-area/pagamentos?conta=${encodeURIComponent(a.id)}`}>Ver conta e pagar</Link><button disabled={Boolean(busy)} onClick={()=>void open(a.id)}>{busy===a.id?'Abrindo…':'Abrir cardápio e comanda'}</button></div></article>)}{accounts.data&&!accounts.isError&&!accounts.data.some(a=>a.kind==='Bar'&&a.state==='Open')&&<section className="portal-card"><h2>Nenhuma comanda aberta</h2><p>Peça à equipe o QR da sua comanda para pedir pelo celular.</p></section>}{error&&<p role="alert">{error}</p>}<section className="portal-card"><h2>Pagamentos e comprovantes</h2><Link to="/minha-area/pagamentos">Ver pagamentos</Link></section><HelpContact/></div>
}
type ProfileIntent = { input: { operationId: string; name: string; phone: string; expectedVersion?: number }; reminders: boolean; canonical?: {name: string; phone: string} }
function readProfileIntent(key: string): ProfileIntent | null {
  try {
    const value=JSON.parse(sessionStorage.getItem(key)??'null') as ProfileIntent|null
    return value&&typeof value.input?.operationId==='string'&&typeof value.input.name==='string'&&typeof value.input.phone==='string'&&typeof value.reminders==='boolean'&&(value.input.expectedVersion===undefined||Number.isInteger(value.input.expectedVersion))&&(!value.canonical||typeof value.canonical.name==='string'&&typeof value.canonical.phone==='string')?value:null
  } catch { return null }
}
function ProfileForm({profile,customer,refresh,refreshing}:{profile:Profile;customer:Customer|null;refresh:()=>Promise<{data?:Customer|null;isError?:boolean}>;refreshing:boolean}) {
  const {user,signOut}=useAuth();const cache=useQueryClient();const draftKey=`lb-own-customer-v1:${user?.id}`
  const [pending,setPending]=useState(()=>readProfileIntent(draftKey))
  const [expectedVersion,setExpectedVersion]=useState(customer?.version)
  const [needsReview,setNeedsReview]=useState(false);const [currentContact,setCurrentContact]=useState<Customer|null|undefined>()
  const [name,setName]=useState(pending?.input.name??customer?.name??profile.name);const [phone,setPhone]=useState(pending?.input.phone??customer?.phone??profile.phone)
  const [reminders,setReminders]=useState(pending?.reminders??profile.reminders);const [message,setMessage]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false)
  const lock=useRef(false);const mounted=useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  async function readCurrent(){
    try {const latest=await refresh();if(mounted.current&&!latest.isError&&latest.data!==undefined)setCurrentContact(latest.data)}
    catch {/* Keep the conflict and the original draft until a fresh read succeeds. */}
  }
  function confirmCurrent(useCurrent:boolean){
    if(currentContact===undefined)return
    if(useCurrent){setName(currentContact?.name??profile.name);setPhone(currentContact?.phone??profile.phone)}
    setExpectedVersion(currentContact?.version);setNeedsReview(false);setCurrentContact(undefined);setError('')
  }
  async function save(e:FormEvent){
    e.preventDefault();if(lock.current||refreshing||needsReview)return;lock.current=true;setBusy(true);setMessage('');setError('')
    let intent:ProfileIntent=pending??{input:{operationId:crypto.randomUUID(),name:name.trim(),phone,...(expectedVersion!==undefined?{expectedVersion}:{})},reminders}
    try {
      sessionStorage.setItem(draftKey,JSON.stringify(intent));setPending(intent)
      if(!intent.canonical){
        const saved=await send<Customer>('/api/v1/me/customer',intent.input,'PUT')
        intent={...intent,canonical:{name:saved.name,phone:saved.phone}}
        sessionStorage.setItem(draftKey,JSON.stringify(intent))
        if(!mounted.current)return
        setPending(intent);setExpectedVersion(saved.version);cache.setQueryData(['own-customer',user?.id],saved)
      }
      await send('/api/v1/me/portal/profile',{...intent.canonical,reminders:intent.reminders},'PUT')
      sessionStorage.removeItem(draftKey)
      if(!mounted.current)return
      setPending(null);setName(intent.canonical!.name);setPhone(intent.canonical!.phone);setMessage('Perfil atualizado.')
      await Promise.all([cache.invalidateQueries({queryKey:['portal']}),cache.invalidateQueries({queryKey:['own-customer',user?.id]})])
    } catch(cause) {
      if(!mounted.current)return
      if(cause instanceof ApiError&&[400,401,403,404,409,422].includes(cause.status)){
        sessionStorage.removeItem(draftKey);setPending(null)
        if(cause.status===409){setNeedsReview(true);setCurrentContact(undefined);await readCurrent()}
      }
      setError(cause instanceof ApiError?messageOf(cause):'Não foi possível confirmar o perfil. Confira o armazenamento e a conexão e repita o mesmo envio.')
    } finally {lock.current=false;if(mounted.current)setBusy(false)}
  }
  return <><form className="portal-card portal-form" onSubmit={e=>void save(e)}><p>Cadastro pessoal: não substitui o cadastro de um aluno dependente nem cria vínculos de acesso ou cobrança.</p><fieldset disabled={busy||Boolean(pending)}><label>Como você quer ser chamado?<input required maxLength={240} value={name} onChange={e=>setName(e.target.value)}/></label><label>Telefone com DDD<input required={!customer} pattern={customer?.incomplete?undefined:"[0-9]{10,15}"} inputMode="tel" autoComplete="tel-national" maxLength={15} value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,''))}/></label>{customer?.incomplete&&<p>Seu cadastro anterior está com telefone pendente. Você pode completá-lo aqui; seus atendimentos continuam disponíveis.</p>}<p>E-mail de acesso: {profile.email||'Ainda não vinculado'}</p><label className="portal-check"><input type="checkbox" checked={reminders} onChange={e=>setReminders(e.target.checked)}/> Mostrar lembretes de atividades na minha área</label></fieldset><p>Essa opção não ativa mensagens por WhatsApp, SMS ou e-mail.</p>{pending&&!busy&&<p role="status">Confira o mesmo envio antes de editar os dados novamente.</p>}<button disabled={busy||refreshing||needsReview}>{busy?'Salvando…':pending?'Conferir perfil':'Salvar perfil'}</button>{needsReview&&<section aria-label="Conferência do cadastro atualizado"><p>O cadastro mudou. Seus dados digitados foram preservados. Confira o contato atual antes de salvar novamente.</p>{currentContact!==undefined?<><p>Cadastro atual: {currentContact?.name??'Ainda não criado'} · {currentContact?.phone||'Telefone pendente'}</p><button type="button" disabled={busy||refreshing} onClick={()=>confirmCurrent(true)}>Usar cadastro atualizado</button><button type="button" disabled={busy||refreshing} onClick={()=>confirmCurrent(false)}>Manter meus dados após conferir</button></>:<button type="button" disabled={busy} onClick={()=>void readCurrent()}>Consultar cadastro atualizado</button>}</section>}{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}</form><section className="portal-card"><h2>Meus vínculos com a arena</h2>{profile.links.map(l=><p key={`${l.kind}:${l.sourceId}`}>{l.kind==='students'?'Aluno':l.kind==='rentalGroups'?'Grupo':'Reserva'} · {l.name}</p>)}{!profile.links.length&&<p>Nenhum vínculo cadastrado. Se você já frequenta a arena, peça à equipe para conferir seu cadastro.</p>}<Link to="/minha-area/ajuda">Solicitar correção de cadastro</Link></section><section className="portal-card"><h2>Acesso e segurança</h2><Link to="/minha-area/seguranca">Segurança da conta</Link><details><summary>Recuperar acesso</summary><p>Para recuperar seu acesso ou corrigir o e-mail, peça ajuda à equipe para confirmar sua identidade.</p></details><button onClick={()=>void signOut()}>Sair da minha conta</button></section></>
}
export function PortalProfile(){
  const {user}=useAuth();const query=usePortal<Profile>('profile')
  const own=useQuery({queryKey:['own-customer',user?.id],queryFn:({signal})=>apiFetch<Customer|null>('/api/v1/me/customer',{signal}),enabled:Boolean(user),retry:false,refetchOnWindowFocus:true})
  const allowed=!(own.error instanceof ApiError&&[401,403,404,410].includes(own.error.status))
  return <div className="portal-service-clean portal-profile-page"><header className="portal-title"><h1>Meu perfil</h1></header><QueryState query={query}/><QueryState query={own}/>{user&&query.data&&!query.isError&&own.data!==undefined&&allowed&&<ProfileForm key={`${user.id}:${user.roles.join(',')}:${user.permissions.join(',')}`} profile={query.data} customer={own.data} refresh={own.refetch} refreshing={own.isFetching||own.isError}/>}</div>
}
