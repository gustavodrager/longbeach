import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../lib/http'
import { canManageStaff } from '../auth/access'
import { staffScopeKey } from '../auth/staffScope'
import { useAuth } from '../auth/authContext'
import type { TeamMember } from '../operations/DemoDataProvider'

export type StaffAccessType = { id: string; name: string; role: string; menus: string[]; actions: string[]; memberCount: number; version: number }
export type StaffMenu = { id: string; label: string; area: string; path: string; typeIds: string[] }
export type StaffAction = { id: string; label: string; menuId: string; typeIds: string[]; requiresActions?: string[] | null }
export type StaffCatalog = { menus: StaffMenu[]; actions: StaffAction[] }
export type StaffAccount = { id: string; name: string; username: string | null; phoneLogin: string | null; role: string; isActive: boolean; googleLinked: boolean; localPasswordEnabled: boolean; linkedTeamId: string | null }
export type StaffAccessStatus = { teamId: string; userId: string | null; typeId: string | null; phoneLogin: string | null; username: string | null; isActive: boolean; requiresFirstAccess: boolean; initialAccessExpiresAtUtc: string | null; googleLinked: boolean; localPasswordEnabled: boolean; version: number; isOwner: boolean }
export type StaffContext = { types: StaffAccessType[]; catalog: StaffCatalog; members: StaffAccessStatus[]; accounts: StaffAccount[] }
export type StaffAccessInput = { mode: 'create' | 'link' | 'keep' | 'none'; typeId: string; phoneLogin?: string | null; username?: string | null; userId?: string | null; version: number }
export type StaffMemberInput = { member: Omit<TeamMember, 'id'> & { id: string }; access: StaffAccessInput; operationId: string }
export type StaffMemberResult = { member: TeamMember; access: StaffAccessStatus; initialPassword?: string; initialPasswordExpiresAtUtc?: string }
export type StaffTypeInput = Pick<StaffAccessType, 'name' | 'menus' | 'actions' | 'version'>

const base = '/api/v1/staff-access'
export function useStaffContext() {
  const { user } = useAuth()
  const allowed = canManageStaff(user)
  return useQuery({ queryKey: ['staff-access', staffScopeKey(user)], queryFn: async ({ signal }) => {
    const context = await apiFetch<StaffContext>(`${base}/context`, { signal })
    if (!context || !Array.isArray(context.types) || !Array.isArray(context.members) || !Array.isArray(context.accounts) || !Array.isArray(context.catalog?.menus) || !Array.isArray(context.catalog?.actions)) throw new Error('Os acessos da equipe não estão disponíveis. Tente atualizar.')
    return context
  }, enabled: allowed, retry: false, staleTime: 0, gcTime: 0 })
}
export const saveStaffMember = (teamId: string, input: StaffMemberInput) => apiFetch<StaffMemberResult>(`${base}/members/${encodeURIComponent(teamId)}`, { method: 'PUT', body: JSON.stringify(input) })
export const getStaffAccess = (teamId: string) => apiFetch<StaffAccessStatus>(`${base}/members/${encodeURIComponent(teamId)}`)
export const saveStaffType = (typeId: string, input: StaffTypeInput) => apiFetch<StaffAccessType>(`${base}/types/${encodeURIComponent(typeId)}`, { method: 'PUT', body: JSON.stringify(input) })
export const staffAccessCommand = (teamId: string, action: 'reset' | 'block' | 'reactivate', version: number, operationId: string) => apiFetch<StaffMemberResult | StaffAccessStatus>(`${base}/members/${encodeURIComponent(teamId)}/${action}`, { method: 'POST', body: JSON.stringify({ version, operationId }) })
export const staffError = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível confirmar. Confira a conexão e tente novamente.'
export const staffStatusLabel = (status: StaffAccessStatus | undefined) => !status?.userId ? 'Acesso pendente' : !status.isActive ? 'Bloqueado' : status.requiresFirstAccess ? 'Primeiro acesso pendente' : 'Ativo'
