import type { Access } from 'payload'

/**
 * Users collection access: admins see/edit all rows; non-admins see/edit only their own row.
 * Returns a row-level query constraint (`{ id: { equals: user.id } }`) for non-admins,
 * which Payload narrows the result set with at the database layer.
 *
 * Returns false (deny) for unauthenticated requests so that anonymous traffic
 * cannot list user records.
 */
export const isOwnerOrAdmin: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.isAdmin) return true
  return { id: { equals: user.id } }
}
