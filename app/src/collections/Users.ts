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
          'Grants permission to manage other users (create, read all, update all, delete). Only existing admins can change this field.',
      },
    },
  ],
}
