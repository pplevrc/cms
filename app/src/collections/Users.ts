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
      name: 'isAdmin',
      type: 'checkbox',
      defaultValue: false,
      access: {
        update: ({ req: { user } }) => Boolean(user?.isAdmin),
      },
      admin: {
        description:
          '他ユーザーを管理する権限を付与する (作成・全件参照・全件更新・削除)。本フィールドの変更は既存の admin のみ可能。',
      },
    },
  ],
}
