import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/isAdmin'
import { isOwnerOrAdmin } from '../access/isOwnerOrAdmin'
import { requireEnvNumber } from '../lib/env'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    // ブルートフォース対策。値の根拠は designs/private/auth-parameters.md。
    // requireEnvNumber は NaN / Infinity を弾く。Number(requireEnv(...)) では
    // env 値が文字列 (例: "abc") の場合 NaN が通り、`attempts >= NaN` が常に
    // false で永久に lockout が発動しない silent failure 経路ができる。
    maxLoginAttempts: requireEnvNumber('AUTH_MAX_LOGIN_ATTEMPTS'),
    lockTime: requireEnvNumber('AUTH_LOCK_TIME_MS'),
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
