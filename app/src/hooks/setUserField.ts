import type { FieldHook } from 'payload'

export interface SetUserFieldOptions {
  /**
   * true の場合、毎回の update operation でフィールド値を上書きする (`updatedBy` 用途)。
   * false (default) の場合は create 時のみ値をセットし、以降の update では維持する
   * (`createdBy` 用途。監査トレイル目的で不変に保つ)。
   */
  always?: boolean
}

/**
 * リクエスト元ユーザーの id をリレーションシップフィールドに自動で埋める
 * field-level beforeChange hook。
 *
 * デフォルト挙動 (引数なし) は create 時のみ値をセットし、以降の update では
 * 値を触らない (`createdBy` 監査フィールド向け)。`{ always: true }` を渡すと
 * 毎回の update でも上書きする (`updatedBy` 監査フィールド向け)。
 */
export const setUserField =
  (options: SetUserFieldOptions = {}): FieldHook =>
  ({ req, value, operation }) => {
    if (operation === 'create' && req.user) {
      return req.user.id
    }
    if (operation === 'update' && options.always && req.user) {
      return req.user.id
    }
    return value
  }
