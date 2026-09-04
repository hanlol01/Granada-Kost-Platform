import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AdminPaymentVerificationPolicy = {
  mode: 'manual' | 'automatic_admin_entry';
  automaticVerificationActive: boolean;
  automaticVerificationUntil: string | null;
  requiresActualPaymentDate: boolean;
  transferEvidenceRequired: boolean;
};

export type AdminPaymentVerificationDecision = {
  status: 'pending_confirmation' | 'verified';
  automaticallyVerified: boolean;
  policy: AdminPaymentVerificationPolicy;
};

@Injectable()
export class AdminPaymentVerificationPolicyService {
  constructor(private readonly config: ConfigService) {}

  current(propertyId: string, now = new Date()): AdminPaymentVerificationPolicy {
    const enabled = this.config.get<boolean>('billing.adminPaymentAutoVerify.enabled') === true;
    const untilValue = this.config.get<string>('billing.adminPaymentAutoVerify.until');
    const propertyIds =
      this.config.get<string[]>('billing.adminPaymentAutoVerify.propertyIds') ?? [];
    const until = untilValue ? new Date(untilValue) : null;
    const validUntil = until !== null && Number.isFinite(until.getTime()) ? until : null;
    const automaticVerificationActive = Boolean(
      enabled &&
      propertyIds.includes(propertyId) &&
      validUntil &&
      validUntil.getTime() >= now.getTime(),
    );

    return {
      mode: automaticVerificationActive ? 'automatic_admin_entry' : 'manual',
      automaticVerificationActive,
      automaticVerificationUntil: validUntil?.toISOString() ?? null,
      requiresActualPaymentDate: automaticVerificationActive,
      transferEvidenceRequired: !automaticVerificationActive,
    };
  }

  decide(
    propertyId: string,
    method: 'cash' | 'bank_transfer',
    now = new Date(),
  ): AdminPaymentVerificationDecision {
    const policy = this.current(propertyId, now);
    const automaticallyVerified = method === 'bank_transfer' && policy.automaticVerificationActive;
    return {
      status: method === 'cash' || automaticallyVerified ? 'verified' : 'pending_confirmation',
      automaticallyVerified,
      policy,
    };
  }
}
