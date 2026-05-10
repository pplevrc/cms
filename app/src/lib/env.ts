/**
 * 必須 env vars を取得するヘルパ。未設定 (undefined) または空文字列なら起動時に
 * 明示エラーで落ちる。空文字列フォールバックを許すと設定漏れが silent failure
 * になり、認証鍵が空 / DB 未接続のまま動作する経路が生まれるため許容しない。
 */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') {
    throw new Error(
      `環境変数 ${name} が設定されていません。ローカル環境ではプロジェクトの env ファイル、CI 環境では CI 側の secrets、本番環境ではホスティング側 env vars をそれぞれ確認してください。`,
    )
  }
  return value
}

/**
 * 必須 env vars を有限数として取得するヘルパ。`requireEnv` で値の存在を保証した
 * 上で、`Number()` 変換結果が NaN / Infinity になる場合 (env vars 値が数値で
 * パースできない場合) は起動時に明示エラーで落ちる。
 *
 * 単純な `Number(requireEnv('X'))` は NaN を silent に通すため、防御パラメータ
 * (`maxLoginAttempts` / `lockTime` 等) の env vars が誤設定されると検査が
 * 効かなくなる経路が残る。本ヘルパで明示 throw に倒す。値そのものはエラー
 * メッセージに含めない (将来 secret 性のあるパラメータに転用された場合の
 * log 漏出を避けるため)。
 */
export function requireEnvNumber(name: string): number {
  const raw = requireEnv(name)
  const n = Number(raw)
  if (!Number.isFinite(n)) {
    throw new Error(`環境変数 ${name} は有限の数値である必要があります`)
  }
  return n
}
