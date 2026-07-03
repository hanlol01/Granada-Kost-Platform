import { createHash, createHmac, randomUUID } from 'crypto';

/**
 * Tuya Cloud Open API request signing helpers (HMAC-SHA256), re-implemented cleanly from
 * the Tuya signing specification (legacy PoC used as reference knowledge only, never copied).
 *
 * String to sign: METHOD \n SHA256(body) \n \n canonicalPath
 * Sign payload:   client_id + access_token + t + nonce + stringToSign
 * Signature:      uppercase hex HMAC-SHA256 using the client secret.
 */

export function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** Sorts query parameters so the signed path is canonical and stable. */
export function canonicalizePath(path: string): string {
  const [rawPath, rawQuery] = path.split('?');
  if (!rawQuery) {
    return rawPath;
  }
  const params = rawQuery.split('&').filter(Boolean).sort();
  return `${rawPath}?${params.join('&')}`;
}

/**
 * Builds the Tuya string-to-sign. The body content passed here MUST be byte-identical to
 * the request body actually sent (exact-body signing rule, M13B freeze Section 6).
 */
export function buildStringToSign(method: string, bodyContent: string, path: string): string {
  return [method.toUpperCase(), sha256Hex(bodyContent), '', canonicalizePath(path)].join('\n');
}

export type TuyaSignInput = {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  t: string;
  nonce: string;
  stringToSign: string;
};

export function signRequest(input: TuyaSignInput): string {
  const payload = `${input.clientId}${input.accessToken ?? ''}${input.t}${input.nonce}${input.stringToSign}`;
  return createHmac('sha256', input.clientSecret).update(payload, 'utf8').digest('hex').toUpperCase();
}

export function createNonce(): string {
  return randomUUID();
}
