import { Context } from 'telegraf'
import { UserRole } from '../database/models/users/user.entity'
import { User } from '../database/models/users/user.entity'

export function isGroupChat(ctx: Context): boolean {
  const type = ctx.chat?.type
  return type === 'group' || type === 'supergroup'
}

export async function isAdmin(ctx: Context, userId?: number): Promise<boolean> {
  if (!ctx.chat || !ctx.from) return false
  const uid = userId ?? ctx.from.id
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, uid)
    return ['creator', 'administrator'].includes((member.status as string) || '')
  } catch {
    return false
  }
}

export function containsInviteLink(text?: string): boolean {
  if (!text) return false
  const regex = /(t\.me\/[\w_]+|https?:\/\/t\.me\/[\w_]+|telegram\.me\/[\w_]+)/i
  return regex.test(text)
}

export function getSessionKey(ctx: Context): string | undefined {
  if (!ctx.chat || !ctx.from) return undefined
  return `${ctx.chat.id}:${ctx.from.id}`
}

export function hasRole(user: User | null, requiredRole: UserRole): boolean {
  if (!user) return false
  const hierarchy = [UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.DIRECTOR]
  const userLevel = hierarchy.indexOf(user.role)
  const requiredLevel = hierarchy.indexOf(requiredRole)
  return userLevel >= requiredLevel
}

export function formatMessageWithName(message: string, firstName?: string): string {
  if (!firstName) {
    return message
  }
  // Add "имя, " at the beginning if message doesn't already start with it
  if (message.startsWith(`${firstName},`)) {
    return message
  }
  return `${firstName}, ${message}`
}

