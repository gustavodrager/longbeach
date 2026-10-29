import { ApiError } from '../../lib/http'
import { validCustomerPhone, type CustomerCreate } from './api'

export function readCustomerCreation(raw: string): CustomerCreate | null {
  try {
    const value = JSON.parse(raw) as CustomerCreate
    return value && typeof value.operationId === 'string' && /^[a-f0-9-]{36}$/i.test(value.operationId) && typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 240 && typeof value.phone === 'string' && validCustomerPhone(value.phone) && (value.email === undefined || value.email === null || typeof value.email === 'string') ? value : null
  } catch { return null }
}
export function rememberCustomerCreation(save: (value: string) => void, input: CustomerCreate) {
  try { save(JSON.stringify(input)) } catch { throw new ApiError(400, 'O navegador não conseguiu preservar a confirmação. Nenhum novo pedido de cadastro foi enviado.') }
}
