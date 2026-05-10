import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/isAdmin'
import { isOwnerOrAdmin } from '../access/isOwnerOrAdmin'
import { requireEnvNumber } from '../lib/env'

// ブルートフォース対策パラメータ。値の根拠は designs/private/auth-parameters.md。
// requireEnvNumber は NaN / Infinity のみを弾く。Payload 仕様で意味のある値域
// (maxLoginAttempts: 0 以上整数、0 は lockout 機能 disable / lockTime: 1 以上
// 整数 ms) からの逸脱は silent に lockout を無効化する経路になるため、boot
// 時点で明示 throw する。値そのものはエラーメッセージに含めない (将来 secret
// 性のあるパラメータに転用された場合の log 漏出を避けるため)。
const maxLoginAttempts = requireEnvNumber('AUTH_MAX_LOGIN_ATTEMPTS')
if (!Number.isInteger(maxLoginAttempts) || maxLoginAttempts < 0) {
  throw new Error(
    'AUTH_MAX_LOGIN_ATTEMPTS は 0 以上の整数である必要があります (0 を指定すると lockout 機能が無効化されます)',
  )
}

const lockTime = requireEnvNumber('AUTH_LOCK_TIME_MS')
if (!Number.isInteger(lockTime) || lockTime <= 0) {
  throw new Error('AUTH_LOCK_TIME_MS は 1 以上の整数 (ms) である必要があります')
}

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    maxLoginAttempts,
    lockTime,
    cookies: {
      // CLAUDE.md §4-8「Cookie の secure: false を本番設定に含めない」を
      // NODE_ENV の表記揺れに対しても守るため default-secure に倒す。
      // 明示的に dev / test と判定できる環境のみ secure: false。それ以外
      // (production / staging / 未設定 / "Production" 等の typo) は secure: true。
      secure:
        process.env.NODE_ENV !== 'development' &&
        process.env.NODE_ENV !== 'test',
      sameSite: 'Strict',
      // COOKIE_DOMAIN は本番ドメイン用 (例: .example.com)。未設定なら
      // host-only cookie として発行される (Payload デフォルト挙動)。
      domain: process.env.COOKIE_DOMAIN || undefined,
    },
  },
  access: {
    create: isAdmin,
    read: isOwnerOrAdmin,
    update: isOwnerOrAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      options: [
        { label: '管理者 (admin)', value: 'admin' },
        { label: 'モデレータ (moderator)', value: 'moderator' },
        { label: '編集者 (editor)', value: 'editor' },
      ],
      defaultValue: 'editor',
      required: true,
      access: {
        update: ({ req: { user } }) => user?.role === 'admin',
      },
      admin: {
        description:
          'ユーザー権限。admin = ユーザー管理および全管理操作、moderator = 全コンテンツの作成 / 編集 / 削除、editor = 自分の作成エントリのみ更新。本フィールドの変更は admin のみ可能。',
      },
    },
  ],
}
