import type { Access } from 'payload'

/**
 * Users collection 用の access。admin は全 row を read / edit でき、非 admin は
 * 自分自身の row のみ。非 admin には行レベルのクエリ制約
 * `{ id: { equals: user.id } }` を返し、Payload が DB レイヤで結果セットを
 * 絞り込む。
 *
 * 未認証リクエストには false (拒否) を返し、匿名トラフィックがユーザーレコード
 * を一覧できないようにする。
 */
export const isOwnerOrAdmin: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.isAdmin) return true
  return { id: { equals: user.id } }
}
