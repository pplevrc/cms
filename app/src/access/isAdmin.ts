import type { Access } from 'payload'

/**
 * Allow only authenticated admin users (`isAdmin === true`).
 * Returns false for unauthenticated requests and non-admin users.
 */
export const isAdmin: Access = ({ req: { user } }) => Boolean(user?.isAdmin)
