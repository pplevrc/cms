import { describe, it, beforeAll, expect } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import type { User } from '@/payload-types'

let payload: Payload

// All integration specs share a single Payload init via this top-level
// `beforeAll`. Splitting into multiple `*.int.spec.ts` files causes
// Payload's `pushDevSchema` to attempt a second CREATE TABLE round on
// the same database in subsequent specs, which fails with
// "relation already exists" — see commit history for the consolidation.
beforeAll(async () => {
  const payloadConfig = await config
  payload = await getPayload({ config: payloadConfig })
})

describe('API smoke', () => {
  it('fetches users', async () => {
    const users = await payload.find({
      collection: 'users',
    })
    expect(users).toBeDefined()
  })
})

describe('Users collection access control', () => {
  let admin: User
  let nonAdmin: User

  beforeAll(async () => {
    // Clean prior fixtures so the suite is repeatable
    await payload.delete({
      collection: 'users',
      where: {
        email: { in: ['admin-access@test.local', 'user-access@test.local'] },
      },
    })

    admin = await payload.create({
      collection: 'users',
      data: {
        email: 'admin-access@test.local',
        password: 'test12345',
        role: 'admin',
      },
    })

    nonAdmin = await payload.create({
      collection: 'users',
      data: {
        email: 'user-access@test.local',
        password: 'test12345',
        role: 'editor',
      },
    })
  })

  it('admin can read all users', async () => {
    const result = await payload.find({
      collection: 'users',
      user: admin,
      overrideAccess: false,
    })
    const ids = result.docs.map((doc) => doc.id)
    expect(ids).toContain(admin.id)
    expect(ids).toContain(nonAdmin.id)
  })

  it('non-admin can read only their own record', async () => {
    const result = await payload.find({
      collection: 'users',
      user: nonAdmin,
      overrideAccess: false,
    })
    expect(result.docs.length).toBe(1)
    expect(result.docs[0]?.id).toBe(nonAdmin.id)
  })

  it('non-admin (editor) cannot escalate their own role to admin', async () => {
    // Payload's field-level access silently drops disallowed writes rather than rejecting
    // the whole operation, so the update succeeds but the value stays unchanged.
    const updated = await payload.update({
      collection: 'users',
      id: nonAdmin.id,
      data: { role: 'admin' },
      user: nonAdmin,
      overrideAccess: false,
    })
    expect(updated.role).toBe('editor')
  })

  it('non-admin cannot create new users', async () => {
    await expect(
      payload.create({
        collection: 'users',
        data: {
          email: 'should-fail@test.local',
          password: 'test12345',
          role: 'editor',
        },
        user: nonAdmin,
        overrideAccess: false,
      }),
    ).rejects.toBeTruthy()
  })

  it('non-admin cannot delete other users', async () => {
    await expect(
      payload.delete({
        collection: 'users',
        id: admin.id,
        user: nonAdmin,
        overrideAccess: false,
      }),
    ).rejects.toBeTruthy()
  })

  it('non-admin cannot read another user by id', async () => {
    // Row-level constraint `{ id: { equals: user.id } }` narrows the result set; reading
    // a different user's id falls outside the constraint and Payload reports not-found.
    await expect(
      payload.findByID({
        collection: 'users',
        id: admin.id,
        user: nonAdmin,
        overrideAccess: false,
      }),
    ).rejects.toBeTruthy()
  })

  it('non-admin cannot update another user by id', async () => {
    // Same row-level constraint applies on update; the target row falls outside the
    // non-admin's permitted set and Payload rejects rather than silently no-op-ing.
    await expect(
      payload.update({
        collection: 'users',
        id: admin.id,
        data: { email: 'hijacked@test.local' },
        user: nonAdmin,
        overrideAccess: false,
      }),
    ).rejects.toBeTruthy()
  })
})
