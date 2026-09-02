import type { PoolClient } from 'pg';

export type FinancialTransactionFamily = 'TRX' | 'REF' | 'BTL';

export type FinancialTransactionPurpose =
  | 'BOOKING'
  | 'DP'
  | 'SEWA'
  | 'LUNAS'
  | 'DEPOSIT'
  | 'TAMBAH-DEPOSIT'
  | 'TAGIHAN-LAIN'
  | 'CHECKOUT'
  | 'KELEBIHAN-BAYAR'
  | 'CANCEL';

export async function nextFinancialTransactionCode(
  client: PoolClient,
  family: FinancialTransactionFamily,
  purpose: FinancialTransactionPurpose,
  occurredAt?: string | Date | null,
): Promise<string> {
  const result = await client.query<{ code: string }>(
    `SELECT next_financial_transaction_code($1,$2,$3::timestamptz) AS code`,
    [family, purpose, occurredAt ?? null],
  );
  const code = result.rows[0]?.code;
  if (!code) throw new Error('Financial transaction code could not be generated');
  return code;
}
