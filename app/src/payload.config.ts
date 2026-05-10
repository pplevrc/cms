import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { requireEnv } from './lib/env'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// CORS / CSRF allow-list は env vars 経由でのみ指定。`*` (全許可) は許容しない。
// 値はカンマ区切り (例: `http://localhost:3000,https://admin.example.com`)。
// 詳細は designs/03-public-repo-security-model.md 参照。
const allowedOrigins = requireEnv('ALLOWED_ORIGINS')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

// 区切り文字だけの値 (例: `, ,`) は trim / filter 後に空配列となる。boot 自体は
// 成功するが Payload の cors / csrf が空配列で起動するため、すべての browser
// origin が reject される silent failure を生む。`*` ガードと対称に boot 時点で
// 明示 throw する。
if (allowedOrigins.length === 0) {
  throw new Error(
    'ALLOWED_ORIGINS には少なくとも 1 つのオリジンを明示的に指定してください (カンマ区切り)。',
  )
}

// CLAUDE.md §4-7「CORS / CSRF を `*` で実装しない」を env vars の設定ミスから
// 守るためのガード。`ALLOWED_ORIGINS=*` で起動した場合、配列要素ベース判定の
// Payload で全許可と等価になる経路が生まれるため、boot 時点で明示 throw する。
if (allowedOrigins.includes('*')) {
  throw new Error(
    'ALLOWED_ORIGINS に `*` (全許可) は指定できません。許可するオリジンをカンマ区切りで明示的に列挙してください。',
  )
}

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media],
  cors: allowedOrigins,
  csrf: allowedOrigins,
  editor: lexicalEditor(),
  secret: requireEnv('PAYLOAD_SECRET'),
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: requireEnv('DATABASE_URL'),
    },
  }),
  sharp,
  plugins: [],
})
