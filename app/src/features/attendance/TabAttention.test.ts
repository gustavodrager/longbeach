import { tabAttention, waitingTime } from './TabAttention'
import type { Tab } from './api'
const createdAtUtc = '2026-10-10T23:30:00Z'
const tab: Tab = { id:'tab',number:1,name:'Teste',mode:'Tab',state:'Open',locationId:'bar',actorId:'operator',total:0,paid:0,pending:0,due:0,payable:0,createdAtUtc,items:[],payments:[],history:[],allowedActions:[] }
it('sinaliza 24 horas decorridas, sem confundir a mudança de dia com atraso',()=>{
 expect(tabAttention(tab, Date.parse(createdAtUtc)+86_399_999)).toEqual([])
 expect(tabAttention(tab, Date.parse(createdAtUtc)+86_400_000)).toEqual(['Aberta há 1 d · conferir'])
 expect(tabAttention({...tab,state:'Closed'},Date.parse(createdAtUtc)+86_400_000)).toEqual([])
 expect(tabAttention({...tab,createdAtUtc:'invalid'},Date.now())).toEqual([])
})
it('tempo de espera trata minutos, horas e datas inválidas sem duração negativa',()=>{
 const now=Date.parse(createdAtUtc)
 expect(waitingTime(createdAtUtc,now+59_999)).toBe('menos de 1 min')
 expect(waitingTime(createdAtUtc,now+65*60_000)).toBe('1 h 5 min')
 expect(waitingTime(createdAtUtc,now+25*3_600_000)).toBe('1 d 1 h')
 expect(waitingTime(createdAtUtc,now-1)).toBeNull();expect(waitingTime(undefined,now)).toBeNull()
})
