import type { FieldHook } from 'payload'

export interface SetUserFieldOptions {
  /**
   * When true, overwrite the field's value on every update operation (suitable for `updatedBy`).
   * When false (default), set the value only on create (suitable for `createdBy`, which should
   * remain immutable for audit-trail purposes).
   */
  always?: boolean
}

/**
 * Field-level beforeChange hook that fills a relationship field with the requesting user's id.
 *
 * Default behaviour (no options) sets the value on `create` only and leaves it untouched on
 * subsequent updates — appropriate for `createdBy` audit fields. Pass `{ always: true }` to
 * overwrite on every update — appropriate for `updatedBy` audit fields.
 */
export const setUserField =
  (options: SetUserFieldOptions = {}): FieldHook =>
  ({ req, value, operation }) => {
    if (operation === 'create' && req.user) {
      return req.user.id
    }
    if (operation === 'update' && options.always && req.user) {
      return req.user.id
    }
    return value
  }
