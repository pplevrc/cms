import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/isAdmin'
import { isOwnerOrAdmin } from '../access/isOwnerOrAdmin'
import { requireEnv } from '../lib/env'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    // ブルートフォース対策。値の根拠は designs/private/auth-parameters.md。
    maxLoginAttempts: Number(requireEnv('AUTH_MAX_LOGIN_ATTEMPTS')),
    lockTime: Number(requireEnv('AUTH_LOCK_TIME_MS')),
    cookies: {
      // 本番 (HTTPS 前提) では secure cookie 必須。dev は http://localhost で動かすため
      // production 限定で secure: true にし、それ以外は false に倒す。
      secure: process.env.NODE_ENV === 'production',
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
