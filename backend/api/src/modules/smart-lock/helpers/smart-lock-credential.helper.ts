import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { SmartLockCredentialType } from '../types/smart-lock.types';

type UnsafeCredentialPayload = Record<string, unknown> & {
  pin?: unknown;
  pinPlaintext?: unknown;
  pin_plaintext?: unknown;
  fingerprintTemplate?: unknown;
  fingerprint_template?: unknown;
  fingerprintData?: unknown;
  fingerprint_data?: unknown;
  biometricData?: unknown;
  biometric_data?: unknown;
};

export class SmartLockCredentialHelper {
  static assertNoPlainSecrets(payload: UnsafeCredentialPayload): void {
    const forbiddenFields = [
      'pin',
      'pinPlaintext',
      'pin_plaintext',
      'fingerprintTemplate',
      'fingerprint_template',
      'fingerprintData',
      'fingerprint_data',
      'biometricData',
      'biometric_data',
    ];
    const leakedField = forbiddenFields.find((field) => payload[field] !== undefined);
    if (leakedField) {
      throw new BadRequestException({
        code: 'SMART_LOCK_CREDENTIAL_SECRET_NOT_STORABLE',
        message: `Credential field ${leakedField} must not be stored in PostgreSQL`,
      });
    }
  }

  static displayHash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  static maskCardNumber(cardNumber: string): string {
    const normalized = cardNumber.replace(/\s+/g, '');
    if (normalized.length <= 4) {
      return '****';
    }
    return `${'*'.repeat(Math.max(normalized.length - 4, 4))}${normalized.slice(-4)}`;
  }

  static assertCredentialShape(type: SmartLockCredentialType, input: { pinDisplayHash?: string; fingerIndex?: string; cardNumberMasked?: string }): void {
    if (type === 'pin' && (input.fingerIndex || input.cardNumberMasked)) {
      throw new BadRequestException({ code: 'SMART_LOCK_PIN_FIELD_MISMATCH', message: 'PIN credential cannot store card or fingerprint fields' });
    }
    if (type === 'card' && (input.pinDisplayHash || input.fingerIndex)) {
      throw new BadRequestException({ code: 'SMART_LOCK_CARD_FIELD_MISMATCH', message: 'Card credential cannot store PIN or fingerprint fields' });
    }
    if (type === 'fingerprint' && (input.pinDisplayHash || input.cardNumberMasked)) {
      throw new BadRequestException({
        code: 'SMART_LOCK_FINGERPRINT_FIELD_MISMATCH',
        message: 'Fingerprint credential cannot store PIN or card fields',
      });
    }
  }
}
