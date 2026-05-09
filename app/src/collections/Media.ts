import type { CollectionConfig } from 'payload'

import { setUserField } from '../hooks/setUserField'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      access: {
        update: () => false,
      },
      hooks: {
        beforeChange: [setUserField()],
      },
    },
  ],
  upload: true,
}
