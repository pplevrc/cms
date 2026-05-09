import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/isAdmin'
import { isOwnerOrAdmin } from '../access/isOwnerOrAdmin'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
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
