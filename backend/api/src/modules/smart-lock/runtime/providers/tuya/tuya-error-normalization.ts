/**
 * Normalized Smart Lock provider error codes (M13B freeze, Section 12).
 * Raw Tuya payloads/messages never cross the provider boundary; only these codes plus
 * safe generic copy reach domain services and API clients.
 */
export const SMART_LOCK_PROVIDER_ERROR_CODES = {
  CONFIG_MISSING: 'CONFIG_MISSING',
  SIGNATURE_INVALID: 'SIGNATURE_INVALID',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  API_NOT_SUBSCRIBED: 'API_NOT_SUBSCRIBED',
  DEVICE_OFFLINE: 'DEVICE_OFFLINE',
  INSTRUCTION_NOT_SUPPORTED: 'INSTRUCTION_NOT_SUPPORTED',
  TOKEN_ERROR: 'TOKEN_ERROR',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_CONNECTION_ERROR: 'PROVIDER_CONNECTION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  LIVE_COMMAND_DISABLED: 'LIVE_COMMAND_DISABLED',
  DEVICE_NOT_MAPPED: 'DEVICE_NOT_MAPPED',
  UNSUPPORTED_CAPABILITY: 'UNSUPPORTED_CAPABILITY',
  UNKNOWN_PROVIDER_ERROR: 'UNKNOWN_PROVIDER_ERROR',
  /** M13C transitional: read-only sync is scheduled for M13D/M13E. */
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
} as const;

export type SmartLockProviderErrorCode = keyof typeof SMART_LOCK_PROVIDER_ERROR_CODES;

export type NormalizedTuyaError = {
  errorCode: SmartLockProviderErrorCode;
  resultStatus: 'failed' | 'timeout' | 'device_offline';
  errorMessage: string;
};

/** Initial Tuya business-code mapping; to be refined with real observations in M13D/M13E. */
const TUYA_CODE_MAP: Record<number, SmartLockProviderErrorCode> = {
  1001: 'SIGNATURE_INVALID',
  1004: 'SIGNATURE_INVALID',
  1010: 'TOKEN_ERROR',
  1011: 'TOKEN_ERROR',
  1012: 'TOKEN_ERROR',
  1013: 'TOKEN_ERROR',
  1106: 'PERMISSION_DENIED',
  1114: 'PERMISSION_DENIED',
  2001: 'DEVICE_OFFLINE',
  2008: 'INSTRUCTION_NOT_SUPPORTED',
  2009: 'INSTRUCTION_NOT_SUPPORTED',
  28841002: 'API_NOT_SUBSCRIBED',
  28841101: 'API_NOT_SUBSCRIBED',
};

const SAFE_MESSAGES: Partial<Record<SmartLockProviderErrorCode, string>> = {
  CONFIG_MISSING: 'Tuya provider configuration is incomplete.',
  SIGNATURE_INVALID: 'Tuya rejected the request signature (check credentials, system clock, and region).',
  PERMISSION_DENIED: 'Tuya denied permission for this operation.',
  API_NOT_SUBSCRIBED: 'A required Tuya API service is not subscribed on the cloud project.',
  DEVICE_OFFLINE: 'The device is offline or sleeping.',
  INSTRUCTION_NOT_SUPPORTED: 'The device does not support this instruction.',
  TOKEN_ERROR: 'Tuya token is invalid or expired.',
  PROVIDER_TIMEOUT: 'The Tuya request timed out.',
  PROVIDER_CONNECTION_ERROR: 'The Tuya endpoint could not be reached.',
  RATE_LIMITED: 'Too many requests; the operation was rate limited.',
  UNKNOWN_PROVIDER_ERROR: 'Tuya provider request failed.',
};

export function normalizeTuyaApiError(code?: number | string, msg?: string): NormalizedTuyaError {
  const numericCode = typeof code === 'string' ? Number(code) : code;
  let errorCode: SmartLockProviderErrorCode | undefined =
    numericCode !== undefined && Number.isFinite(numericCode) ? TUYA_CODE_MAP[numericCode] : undefined;
  if (!errorCode && msg) {
    errorCode = matchByMessage(msg);
  }
  if (!errorCode) {
    errorCode = 'UNKNOWN_PROVIDER_ERROR';
  }
  const resultStatus = errorCode === 'DEVICE_OFFLINE' ? 'device_offline' : 'failed';
  const suffix = numericCode !== undefined && Number.isFinite(numericCode) ? ` (tuya_code=${numericCode})` : '';
  return {
    errorCode,
    resultStatus,
    // Safe generic copy only; the raw Tuya `msg` text is intentionally discarded here.
    errorMessage: `${SAFE_MESSAGES[errorCode] ?? 'Tuya provider request failed.'}${suffix}`,
  };
}

function matchByMessage(msg: string): SmartLockProviderErrorCode | undefined {
  const normalized = msg.toLowerCase();
  if (normalized.includes('sign')) return 'SIGNATURE_INVALID';
  if (normalized.includes('token')) return 'TOKEN_ERROR';
  if (normalized.includes('permission')) return 'PERMISSION_DENIED';
  if (normalized.includes('subscri')) return 'API_NOT_SUBSCRIBED';
  if (normalized.includes('offline')) return 'DEVICE_OFFLINE';
  if (normalized.includes('not support')) return 'INSTRUCTION_NOT_SUPPORTED';
  if (normalized.includes('rate') || normalized.includes('frequent')) return 'RATE_LIMITED';
  return undefined;
}
