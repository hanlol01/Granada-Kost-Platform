export type LeaseStatus = 'active' | 'ended' | 'cancelled' | 'transferred';
export type BillingCycle = 'monthly' | 'yearly';
export type DepositTransactionType =
  | 'collection'
  | 'carry_forward'
  | 'top_up'
  | 'deduction'
  | 'refund';
export type DepositDirection = 'credit' | 'debit';
export type RefundSettlementStatus = 'pending' | 'settled' | 'waived';

export type LeaseAuditContext = {
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};

export type IdempotentResult<T> = {
  status: number;
  body: { data: T };
  replayed: boolean;
};

export type LeaseSummary = {
  id: string;
  property_id: string;
  lease_code: string;
  lease_status: LeaseStatus;
  start_date: string;
  end_date: string | null;
  billing_cycle: BillingCycle;
  billing_anchor_day: number;
  next_billing_date: string;
  resident: {
    id: string;
    full_name_masked: string;
  };
  room: {
    id: string;
    number: string;
  };
  kost_type: {
    id: string;
    name: string;
  };
  last_invoice: {
    id: string;
    invoice_code: string;
    invoice_status: string;
    due_date: string;
    total_amount: number;
  } | null;
  outstanding_amount: number;
};

export type LeaseDepositEntry = {
  id: string;
  transaction_type: DepositTransactionType;
  direction: DepositDirection;
  amount: number;
  reason_type: string | null;
  reason: string | null;
  settlement_status: RefundSettlementStatus;
  created_at: Date;
};
