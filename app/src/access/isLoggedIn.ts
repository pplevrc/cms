import type { Access } from 'payload'

/**
 * Allow any authenticated request, regardless of role.
 * Use as a baseline gate to deny anonymous traffic without imposing role checks.
 */
export const isLoggedIn: Access = ({ req: { user } }) => Boolean(user)
