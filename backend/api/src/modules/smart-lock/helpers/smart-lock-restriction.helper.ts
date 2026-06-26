import { SMART_LOCK_DEFAULTS } from '../constants/smart-lock.constants';
import { SmartLockRestrictionRecord } from '../types/smart-lock.types';

export class SmartLockRestrictionHelper {
  static gracePeriodEndsAt(from = new Date(), gracePeriodHours = SMART_LOCK_DEFAULTS.gracePeriodHours): Date {
    return new Date(from.getTime() + gracePeriodHours * 60 * 60 * 1000);
  }

  static shouldSuggestLift(restriction: SmartLockRestrictionRecord, clearedReference: { refType?: string; refId?: string }): boolean {
    if (restriction.restrictionStatus !== 'applied' && restriction.restrictionStatus !== 'approved') {
      return false;
    }
    if (!clearedReference.refType || !clearedReference.refId) {
      return false;
    }
    return restriction.reasonRefType === clearedReference.refType && restriction.reasonRefId === clearedReference.refId;
  }
}
