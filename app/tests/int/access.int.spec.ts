import { describe, it, beforeAll, expect } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import type { User } from '@/payload-types'

let payload: Payload
let admin: User
let nonAdmin: User

describe('Users collection access control', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })

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
        isAdmin: true,
      },
    })

    nonAdmin = await payload.create({
      collection: 'users',
      data: {
        email: 'user-access@test.local',
        password: 'test12345',
        isAdmin: false,
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

  it('non-admin cannot escalate isAdmin to true on their own record', async () => {
    await expect(
      payload.update({
        collection: 'users',
        id: nonAdmin.id,
        data: { isAdmin: true },
        user: nonAdmin,
        overrideAccess: false,
      }),
    ).rejects.toBeTruthy()
  })

  it('non-admin cannot create new users', async () => {
    await expect(
      payload.create({
        collection: 'users',
        data: {
          email: 'should-fail@test.local',
          password: 'test12345',
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
})
