import { describe, it, beforeAll, expect } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import type { User } from '@/payload-types'

let payload: Payload

// 全ての integration spec を本ファイルに集約し、top-level の `beforeAll` で
// Payload を 1 度だけ初期化する。spec ファイルを複数に分けると 2 つ目以降の
// `getPayload` で `pushDevSchema` が同一 DB に対して再度 CREATE TABLE を
// 投げ、`relation "X" already exists` で落ちるため。`vitest` の `singleFork +
// isolate: false` でも spec ファイル間のモジュール再評価により Payload
// シングルトンが共有されないので、ここに統合する以外に確実な方法が無い。
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
    // 前回実行のフィクスチャを削除して suite を冪等に保つ
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
    // Payload の field-level access は disallowed な write を silent drop する仕様 (operation
    // 自体は成功する) のため、update が resolve しても値は変化しないことを assert する。
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
    // 行レベル制約 `{ id: { equals: user.id } }` で結果セットが絞られるため、他ユーザーの
    // id を直接指定すると制約外となり Payload は not-found として reject する。
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
    // 同じ行レベル制約が update にも効く。対象行が非 admin の許可セット外のため、
    // silent no-op ではなく明示的に reject する。
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
