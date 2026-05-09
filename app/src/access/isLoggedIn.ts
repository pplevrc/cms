import type { Access } from 'payload'

/**
 * role を問わず、認証済みリクエストを全て許可する。
 * 匿名トラフィックを弾くベースラインゲートとして使う (role 制約は別途課す)。
 */
export const isLoggedIn: Access = ({ req: { user } }) => Boolean(user)
