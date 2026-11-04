import type { AuthUser } from '../auth/types'
import { hasPermission, hasStaffAction, hasStaffMenu } from '../auth/access'

/** Some legacy read endpoints require write-shaped grants; menu actions remain authoritative. */
export const canOperateStock = (user: AuthUser | null | undefined, permission?: string) => Boolean(user) && hasStaffMenu(user, 'stock') && hasStaffAction(user, 'stock.operate') && (!permission || hasPermission(user, permission))
