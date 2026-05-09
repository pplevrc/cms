/**
 * 必須 env vars を取得するヘルパ。未設定 (undefined) または空文字列なら起動時に
 * 明示エラーで落ちる。空文字列フォールバックを許すと設定漏れが silent failure
 * になり、認証鍵が空 / DB 未接続のまま動作する経路が生まれるため許容しない。
 *
 * 数値や bool が必要な呼び出し側は `Number(requireEnv('X'))` のように呼び出し側で
 * 変換する (型変換ヘルパは現時点で需要が出ていないので導入しない)。
 */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') {
    throw new Error(
      `環境変数 ${name} が設定されていません。ローカル環境では app/.env (リポジトリルートで \`make setup\` で生成可) を、CI 環境では GitHub Actions Secrets を、本番環境ではホスティング側 env vars を確認してください。`,
    )
  }
  return value
}
