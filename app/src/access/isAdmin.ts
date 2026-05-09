import type { Access } from 'payload'

/**
 * 認証済みかつ `isAdmin === true` のユーザーのみ許可する。
 * 未認証リクエストおよび非 admin ユーザーには false を返す。
 */
export const isAdmin: Access = ({ req: { user } }) => Boolean(user?.isAdmin)
