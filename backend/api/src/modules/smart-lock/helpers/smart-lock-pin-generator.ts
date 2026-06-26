import { randomInt } from 'crypto';
import { SMART_LOCK_DEFAULTS } from '../constants/smart-lock.constants';

export class SmartLockPinGenerator {
  static generate(length = SMART_LOCK_DEFAULTS.pinLength): string {
    const min = 10 ** (length - 1);
    const max = 10 ** length;
    return randomInt(min, max).toString();
  }
}
