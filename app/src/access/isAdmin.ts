import type { Access } from 'payload'

/**
 * `role === 'admin'` のユーザーのみ許可する。
 * 未認証リクエストおよび非 admin ユーザー (moderator / editor) には false を返す。
 */
export const isAdmin: Access = ({ req: { user } }) => user?.role === 'admin'
