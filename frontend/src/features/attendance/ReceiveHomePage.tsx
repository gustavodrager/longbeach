import { tabTitle } from './tabTitle'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarFrame, LoadState } from './Core'
import { Empty, Header } from './components'
import { money, useBarData, type PageResult, type Tab } from './api'

export function ReceiveHomePage() {
  const [search,setSearch]=useState('')
  const [page,setPage]=useState(1)
  const query=useBarData<PageResult<Tab>>(`/tabs?state=Open&search=${encodeURIComponent(search)}&page=${page}&pageSize=24`)
  const items=query.data?.items.filter(tab=>tab.payable>0)??[]
  return <BarFrame className="lb-tabs-page"><Header title="Receber" />
    <label className="ux-search">Buscar comanda<input type="search" value={search} maxLength={80} onChange={event=>{setSearch(event.target.value);setPage(1)}} placeholder="Número ou nome" /></label>
    <LoadState query={query}/>
    {query.data&&!query.isError&&(items.length?<div className="ux-list">{items.map(tab=><Link className="ux-panel ux-list-row" key={tab.id} to={`/atendimento/receber/${tab.id}`}><div><strong>{tabTitle(tab)}</strong></div><strong>{money(tab.payable)}</strong></Link>)}</div>:<Empty title="Nenhuma comanda a receber nesta página" />)}
    {query.data&&query.data.total>24&&<nav className="ux-actions" aria-label="Páginas de recebimentos"><button type="button" className="ux-button secondary" disabled={page===1||query.isFetching} onClick={()=>setPage(current=>current-1)}>Anterior</button><span>Página {page}</span><button type="button" className="ux-button secondary" disabled={page*24>=query.data.total||query.isFetching} onClick={()=>setPage(current=>current+1)}>Próxima</button></nav>}
  </BarFrame>
}
