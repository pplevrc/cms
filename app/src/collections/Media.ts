import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/isAdmin'
import { isLoggedIn } from '../access/isLoggedIn'
import { setUserField } from '../hooks/setUserField'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    // Media URLs are intentionally public — public-site reads images via the storage adapter.
    read: () => true,
    // Writes require auth so `setUserField` always has a user to record on `createdBy`,
    // and so anonymous traffic cannot upload arbitrary media to the bucket.
    create: isLoggedIn,
    update: isLoggedIn,
    // Deletion is restricted to admins; logged-in editors can only update / re-upload.
    delete: isAdmin,
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
