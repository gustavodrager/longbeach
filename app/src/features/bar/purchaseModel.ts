export type PurchaseProduct = { id:string; name:string; code:string; purchaseUnit:string; saleUnit:string; conversionFactor:number; active:boolean }
export type Purchase = { id:string; document:string; state:string; version:number; supplierId:string; total:number; freight:number; discount:number; paymentMethod:string; accountReference?:string; purchasedAtUtc?:string; items:{productId:string; quantity:number; received:number; purchaseUnit:string; conversion?:number}[] }
export type PurchaseHistory = {items:Purchase[];page:number;pageSize:number;total:number;awaiting:number;partial:number;completed:number}
export type PurchaseRow = { productId:string; quantity:string; cost:string; total:string }
export const quantityText = (value:number) => value.toLocaleString('pt-BR',{maximumFractionDigits:3})
export function decimal(value:string, places=3):number|null {
  if (!new RegExp(`^\\d+(?:[.,]\\d{1,${places}})?$`).test(value.trim())) return null
  const number=Number(value.trim().replace(',','.'))
  return Number.isFinite(number)&&number<=99_999_999?number:null
}
// Match the server's midpoint-to-even rounding for decimal monetary totals.
function roundEven(value:number) { const floor=Math.floor(value);return Math.abs(value-floor-.5)<1e-7 ? floor+(floor%2) : Math.round(value) }
export function rowTotal(row:PurchaseRow) {
  const quantity=decimal(row.quantity),cost=decimal(row.cost,2),reported=row.total.trim()===''?null:decimal(row.total,2)
  if(quantity===null||quantity<=0)return {error:'Informe uma quantidade maior que zero.',total:0}
  if(cost===null)return {error:'Informe o custo com até duas casas decimais.',total:0}
  if(quantity*cost>99_999_999)return {error:'O subtotal excede o limite permitido.',total:0};
  const cents=roundEven(Math.round(quantity*1000)*Math.round(cost*100)/1000)
  if(row.total.trim()!==''&&(reported===null||Math.abs(Math.round(reported*100)-cents)>Math.max(1,roundEven(quantity*.5))))return {error:'Total diferente de quantidade × custo. Confira a unidade ou o custo líquido.',total:0}
  return {error:'',total:reported??cents/100}
}
export const purchaseDate = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
