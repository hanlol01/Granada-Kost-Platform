import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { RequestAuditContext } from '../../property/types/property.types';
import {
  AdminBillingWorklistQueryDto,
  AdminW06PaymentsQueryDto,
  AdminW06ProofsQueryDto,
  CreateOtherChargeDto,
  RecordManualPaymentDto,
  RejectManualPaymentDto,
  ReviewPaymentProofDto,
  ReversePaymentDto,
  VerifyManualPaymentDto,
  VoidInvoiceDto,
  W06PaymentPurpose,
} from '../dto/w06-billing.dto';
import { CreateMyPaymentProofDto } from '../dto/create-my-payment-proof.dto';
import {
  createBillingInvoicePdf,
  createBillingReceiptPdf,
  type BillingInvoiceDocument,
  type BillingReceiptDocument,
} from '../helpers/billing-document.helper';

type LeaseTupleRow = {
  id: string;
  property_id: string;
  resident_id: string;
  room_id: string;
  occupancy_id: string | null;
  lease_status: string;
  start_date: string;
  end_date: string;
  contract_rent_amount: string;
  dp_required_amount: string;
  security_deposit_required_amount: string;
  payment_plan_type: 'annual_full' | 'monthly_installments' | 'two_month_installments';
  snapshot_monthly_price: string;
  snapshot_room_number: string;
  snapshot_kost_type_name: string;
  building_code: string;
  resident_name: string;
  remaining_days: number;
};

type PaymentRow = {
  id: string;
  property_id: string;
  resident_id: string;
  lease_id: string;
  payment_code: string;
  payment_method: 'bank_transfer' | 'cash';
  payment_status: 'pending_confirmation' | 'verified' | 'rejected' | 'reversed';
  payment_purpose: W06PaymentPurpose;
  amount: string;
  paid_at: Date;
  verified_at: Date | null;
  proof_id: string | null;
  reference_number: string | null;
  notes: string | null;
};

type InvoiceLockRow = {
  id: string;
  property_id: string;
  resident_id: string;
  lease_id: string;
  invoice_status: string;
  invoice_purpose: 'rent' | 'other_charge';
  due_date: string;
  total_amount: string;
  credit_amount: string;
  allocated_amount: string;
};

type AllocationIntentRow = { invoice_id: string; intended_amount: string };
type PaymentProjectionRow = {
  id: string;
  payment_code: string;
  payment_method: string;
  payment_status: string;
  payment_purpose: string | null;
  amount: string;
  paid_at: Date | null;
  verified_at: Date | null;
  reversal_id: string | null;
  receipt_id: string | null;
  allocations: Array<{ invoice_id: string; amount: string | number }>;
};
type PaymentWorkspaceRow = PaymentProjectionRow & {
  resident_id: string;
  lease_id: string;
  resident_name: string;
  room_number: string;
  reference_number: string | null;
  rent_allocation_amount: string;
  settles_rent_contract: boolean;
  evidence: Array<{
    id: string;
    original_filename: string;
    mime_type: string;
    file_size_bytes: string | number;
    content_path: string;
  }>;
};
type InvoiceProjectionRow = {
  id: string;
  invoice_code: string;
  invoice_status: string;
  invoice_purpose: string | null;
  total_amount: string;
  outstanding_amount: string;
  due_date: string;
  coverage_start: string;
  coverage_end: string;
};
type ContractSettlementProjectionRow = {
  id: string;
  state: 'awaiting_activation' | 'open' | 'termination_pending' | 'terminated' | 'paid';
  invoice_id: string;
  activated_at: Date | null;
  original_due_at: Date | null;
  extension_due_at: Date | null;
  extension_reason: string | null;
  total_amount: string;
  credit_amount: string;
  allocated_amount: string;
  initial_payment_allocated: string;
  deposit_offset_amount: string;
  termination_case_id: string | null;
  termination_status: 'pending' | 'cancelled' | 'checked_out' | null;
  planned_checkout_date: string | null;
};

export function summarizeContractSettlementRentPayments({
  invoiceCreditAmount,
  allocatedAmount,
  onboardingAllocatedAmount,
}: {
  invoiceCreditAmount: number;
  allocatedAmount: number;
  onboardingAllocatedAmount: number;
}) {
  const initialRentCredit = Math.max(0, invoiceCreditAmount + onboardingAllocatedAmount);
  return {
    initialRentCredit,
    additionalRentPayments: Math.max(0, allocatedAmount - onboardingAllocatedAmount),
  };
}
type ProofProjectionRow = {
  id: string;
  invoice_id: string;
  proof_status: string;
  claimed_amount: string;
  payment_purpose: W06PaymentPurpose;
  uploaded_at: Date;
  reviewed_at: Date | null;
  reject_reason: string | null;
};
type ProofWorkspaceRow = ProofProjectionRow & {
  invoice_code: string;
  resident_id: string;
  resident_name: string;
  room_number: string;
  notes: string | null;
  evidence: Array<{
    id: string;
    original_filename: string;
    mime_type: string;
    file_size_bytes: string | number;
    content_path: string;
  }>;
};
type InvoiceDocumentRow = {
  invoice_code: string;
  invoice_status: string;
  invoice_purpose: 'rent' | 'other_charge';
  snapshot_resident_name: string;
  snapshot_room_number: string;
  snapshot_building_code: string;
  coverage_start: string;
  coverage_end: string;
  due_date: string;
  total_amount: string;
  outstanding_amount: string;
  issued_at: Date | null;
};
type ReceiptDocumentRow = {
  receipt_code: string;
  amount: string;
  issued_at: Date;
  payment_code: string;
  payment_method: string;
  payment_purpose: string;
  paid_at: Date | null;
  resident_name: string;
  room_number: string;
  allocations: Array<{ invoice_code: string; amount: string | number }>;
};
type ReplayRow = {
  request_fingerprint: string;
  command_status: string;
  response_body: { data: Record<string, unknown> } | null;
};

type SafePaymentResult = {
  payment_id: string;
  payment_code: string;
  payment_status: 'pending_confirmation' | 'verified' | 'rejected' | 'reversed';
  payment_purpose: W06PaymentPurpose;
  amount: number;
  receipt_id: string | null;
};

export type InitialOnboardingPaymentInput = {
  propertyId: string;
  residentId: string;
  leaseId: string;
  firstRentInvoiceId: string;
  method: 'bank_transfer' | 'cash';
  dpAmount: number;
  securityDepositAmount: number;
  evidenceFileIds: string[];
  paymentNote?: string;
  commandFingerprint: string;
  actor: UserAccessContext;
  context: RequestAuditContext;
};

export type InitialOnboardingPaymentSummary = {
  method: 'bank_transfer' | 'cash';
  status: 'pending_confirmation' | 'verified';
  dpRecordedAmount: number;
  securityDepositRecordedAmount: number;
  dpVerifiedAmount: number;
  securityDepositVerifiedAmount: number;
  receipts: Array<{
    id: string;
    purpose: 'dp' | 'security_deposit';
    amount: number;
  }>;
};

const IDEMPOTENCY_MIN = 16;
const IDEMPOTENCY_MAX = 128;

@Injectable()
export class W06BillingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
  ) {}

  async currentWorklist(user: UserAccessContext, query: AdminBillingWorklistQueryDto) {
    await this.properties.assertCanReadProperty(user, query.property_id);
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const month = this.normalizeMonth(query.month);
    const order =
      query.sort === 'due_date_desc'
        ? 'i.due_date DESC,i.id DESC'
        : query.sort === 'resident_asc'
          ? 'i.snapshot_resident_name ASC,i.due_date ASC,i.id ASC'
          : 'i.due_date ASC,i.id ASC';
    const values = [
      query.property_id,
      month,
      query.search?.trim() || null,
      query.status ?? null,
      query.due_within_days ?? null,
      limit,
      offset,
    ];
    const common = `
      FROM invoices i
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(pa.allocated_amount),0)
               - COALESCE(sum(pra.reversed_amount),0) AS net_allocated
        FROM payment_allocations pa
        LEFT JOIN payment_reversal_allocations pra ON pra.original_allocation_id=pa.id
        WHERE pa.invoice_id=i.id
      ) allocation ON true
      WHERE i.property_id=$1
        AND i.lease_id IS NOT NULL
        AND i.authority_source='contract_schedule'
        AND i.invoice_status IN ('issued','partially_paid','overdue')
        AND ($4::text IS NULL OR i.invoice_status=$4)
        AND (
          date_trunc('month',i.due_date)::date=$2::date
          OR (i.due_date<$2::date AND GREATEST(i.total_amount-i.credit_amount-COALESCE(allocation.net_allocated,0),0)>0)
        )
        AND ($3::text IS NULL
          OR i.snapshot_resident_name ILIKE '%'||$3||'%'
          OR i.snapshot_room_number ILIKE '%'||$3||'%'
          OR i.snapshot_building_code ILIKE '%'||$3||'%'
          OR i.invoice_code ILIKE '%'||$3||'%')
        AND ($5::int IS NULL OR (
          i.due_date >= (now() AT TIME ZONE 'Asia/Jakarta')::date
          AND i.due_date <= ((now() AT TIME ZONE 'Asia/Jakarta')::date + $5::int)
        ))`;
    const [count, page] = await Promise.all([
      this.database.client.query<{ total: string }>(
        `SELECT count(*) AS total ${common}`,
        values.slice(0, 5),
      ),
      this.database.client.query<{
        id: string;
        invoice_code: string;
        resident_id: string;
        lease_id: string;
        resident_name: string;
        room_number: string;
        coverage_start: string;
        coverage_end: string;
        due_date: string;
        invoice_status: string;
        total_amount: string;
        outstanding_amount: string;
      }>(
        `SELECT i.id,i.invoice_code,i.resident_id,i.lease_id,
                i.snapshot_resident_name AS resident_name,i.snapshot_room_number AS room_number,
                COALESCE(i.cycle_start_date,i.snapshot_period_start_date)::text AS coverage_start,
                COALESCE(i.cycle_end_date,i.snapshot_period_end_date)::text AS coverage_end,
                i.due_date::text,i.invoice_status,i.total_amount,
                GREATEST(i.total_amount-i.credit_amount-COALESCE(allocation.net_allocated,0),0) AS outstanding_amount
         ${common} ORDER BY ${order} LIMIT $6 OFFSET $7`,
        values,
      ),
    ]);
    return {
      data: page.rows.map((row) => ({
        id: row.id,
        invoice_code: row.invoice_code,
        resident_id: row.resident_id,
        lease_id: row.lease_id,
        resident_name: row.resident_name,
        room_number: row.room_number,
        coverage_start: row.coverage_start,
        coverage_end: row.coverage_end,
        due_date: row.due_date,
        invoice_status: this.publicInvoiceStatus(row.invoice_status),
        total_amount: this.money(row.total_amount),
        outstanding_amount: this.money(row.outstanding_amount),
      })),
      meta: { limit, offset, total: Number(count.rows[0]?.total ?? 0), month },
    };
  }

  async residentDetail(user: UserAccessContext, propertyId: string, residentId: string) {
    await this.properties.assertCanReadProperty(user, propertyId);
    const lease = await this.database.client.query<LeaseTupleRow>(
      `${this.leaseTupleSql()} WHERE l.property_id=$1 AND l.resident_id=$2
       AND l.lease_status IN ('awaiting_activation','active','completed')
       ORDER BY CASE l.lease_status WHEN 'active' THEN 0 WHEN 'awaiting_activation' THEN 1 ELSE 2 END,l.created_at DESC`,
      [propertyId, residentId],
    );
    if (lease.rows.length !== 1) {
      if (lease.rows.length === 0)
        throw new NotFoundException({
          code: 'BILLING_RESIDENT_NOT_FOUND',
          message: 'Billing resident not found',
        });
      throw new ConflictException({
        code: 'BILLING_RESIDENT_AMBIGUOUS',
        message: 'Resident billing context requires reconciliation',
      });
    }
    return {
      data: await this.projectResidentBilling(this.database.client, lease.rows[0], 'admin'),
    };
  }

  async paymentWorkspace(user: UserAccessContext, query: AdminW06PaymentsQueryDto) {
    await this.properties.assertCanReadProperty(user, query.property_id);
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const values = [
      query.property_id,
      query.status ?? null,
      query.search?.trim() || null,
      query.method ?? null,
      query.purpose ?? null,
      query.due_within_days ?? null,
      limit,
      offset,
    ];
    const common = `
         FROM payments p
         JOIN leases lease ON lease.id=p.lease_id AND lease.property_id=p.property_id
         JOIN residents resident ON resident.id=p.resident_id AND resident.property_id=p.property_id
         JOIN rooms room ON room.id=lease.room_id AND room.property_id=p.property_id
         LEFT JOIN payment_reversals reversal ON reversal.payment_id=p.id
         WHERE p.property_id=$1
           AND p.authority_source IN ('manual_transfer','audited_cash')
           AND ($2::text IS NULL OR CASE WHEN reversal.id IS NULL THEN p.payment_status ELSE 'reversed' END=$2)
           AND ($3::text IS NULL
             OR resident.full_name ILIKE '%'||$3||'%'
             OR room.number ILIKE '%'||$3||'%'
             OR p.payment_code ILIKE '%'||$3||'%'
             OR COALESCE(p.reference_number,'') ILIKE '%'||$3||'%')
            AND ($4::text IS NULL OR p.payment_method=$4)
            AND ($5::text IS NULL OR p.payment_purpose=$5)
            AND ($6::int IS NULL OR EXISTS (
              SELECT 1
              FROM payment_allocations deadline_allocation
              JOIN invoices deadline_invoice
                ON deadline_invoice.id=deadline_allocation.invoice_id
                AND deadline_invoice.property_id=p.property_id
              WHERE deadline_allocation.payment_id=p.id
                AND deadline_invoice.invoice_purpose='rent'
                AND deadline_invoice.authority_source='contract_schedule'
                AND deadline_invoice.due_date >= (now() AT TIME ZONE 'Asia/Jakarta')::date
                AND deadline_invoice.due_date <= ((now() AT TIME ZONE 'Asia/Jakarta')::date + $6::int)
            ))`;
    const [count, page] = await Promise.all([
      this.database.client.query<{ total: string }>(
        `SELECT count(*) AS total ${common}`,
        values.slice(0, 6),
      ),
      this.database.client.query<PaymentWorkspaceRow>(
        `SELECT p.id,p.payment_code,p.payment_method,p.payment_status,p.payment_purpose,p.amount,p.paid_at,p.verified_at,p.reference_number,
                p.resident_id,p.lease_id,resident.full_name AS resident_name,room.number AS room_number,
                reversal.id AS reversal_id,receipt.id AS receipt_id,
                COALESCE(allocation_summary.rent_amount,0) AS rent_allocation_amount,
                (COALESCE(rent_contract.fully_paid,false) AND latest_rent_payment.id=p.id) AS settles_rent_contract,
                COALESCE(allocation_rows.items,'[]'::jsonb) AS allocations,
                COALESCE(evidence_rows.items,'[]'::jsonb) AS evidence
         FROM payments p
         JOIN leases lease ON lease.id=p.lease_id AND lease.property_id=p.property_id
         JOIN residents resident ON resident.id=p.resident_id AND resident.property_id=p.property_id
         JOIN rooms room ON room.id=lease.room_id AND room.property_id=p.property_id
         LEFT JOIN payment_reversals reversal ON reversal.payment_id=p.id
         LEFT JOIN payment_receipts receipt ON receipt.payment_id=p.id AND receipt.receipt_kind='payment'
         LEFT JOIN LATERAL (
           SELECT COALESCE(sum(allocation.allocated_amount) FILTER(WHERE invoice.invoice_purpose='rent'),0) AS rent_amount
           FROM payment_allocations allocation
           JOIN invoices invoice ON invoice.id=allocation.invoice_id AND invoice.property_id=p.property_id
           WHERE allocation.payment_id=p.id
         ) allocation_summary ON true
         LEFT JOIN LATERAL (
           SELECT count(*)>0 AND bool_and(
             GREATEST(invoice.total_amount-invoice.credit_amount-COALESCE(invoice_allocation.net,0),0)=0
           ) AS fully_paid
           FROM invoices invoice
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(allocation.allocated_amount),0)-COALESCE(sum(reversal_allocation.reversed_amount),0) AS net
             FROM payment_allocations allocation
             LEFT JOIN payment_reversal_allocations reversal_allocation
               ON reversal_allocation.original_allocation_id=allocation.id
             WHERE allocation.invoice_id=invoice.id
           ) invoice_allocation ON true
           WHERE invoice.property_id=p.property_id AND invoice.lease_id=p.lease_id
             AND invoice.invoice_purpose='rent' AND invoice.invoice_status<>'void'
         ) rent_contract ON true
         LEFT JOIN LATERAL (
           SELECT candidate.id
           FROM payments candidate
           JOIN payment_allocations candidate_allocation ON candidate_allocation.payment_id=candidate.id
           JOIN invoices candidate_invoice ON candidate_invoice.id=candidate_allocation.invoice_id
             AND candidate_invoice.property_id=candidate.property_id
             AND candidate_invoice.lease_id=candidate.lease_id
             AND candidate_invoice.invoice_purpose='rent'
           LEFT JOIN payment_reversals candidate_reversal ON candidate_reversal.payment_id=candidate.id
           WHERE candidate.property_id=p.property_id AND candidate.lease_id=p.lease_id
             AND candidate.payment_status='verified' AND candidate_reversal.id IS NULL
           ORDER BY candidate.verified_at DESC NULLS LAST,candidate.paid_at DESC,candidate.id DESC
           LIMIT 1
         ) latest_rent_payment ON true
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(jsonb_build_object('invoice_id',allocation.invoice_id,'amount',allocation.allocated_amount) ORDER BY allocation.invoice_id) AS items
           FROM payment_allocations allocation
           WHERE allocation.payment_id=p.id
         ) allocation_rows ON true
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(jsonb_build_object(
             'id',file.id,'original_filename',file.original_filename,'mime_type',file.mime_type,
             'file_size_bytes',file.file_size_bytes,'content_path','/files/'||file.id||'/content'
           ) ORDER BY file.id) AS items
           FROM payment_evidence_files junction
           JOIN files file ON file.id=junction.file_id
             AND file.property_id=p.property_id AND file.is_deleted=false
           WHERE junction.payment_id=p.id AND junction.property_id=p.property_id
         ) evidence_rows ON true
         WHERE p.property_id=$1
           AND p.authority_source IN ('manual_transfer','audited_cash')
           AND ($2::text IS NULL OR CASE WHEN reversal.id IS NULL THEN p.payment_status ELSE 'reversed' END=$2)
           AND ($3::text IS NULL
             OR resident.full_name ILIKE '%'||$3||'%'
             OR room.number ILIKE '%'||$3||'%'
             OR p.payment_code ILIKE '%'||$3||'%'
             OR COALESCE(p.reference_number,'') ILIKE '%'||$3||'%')
            AND ($4::text IS NULL OR p.payment_method=$4)
            AND ($5::text IS NULL OR p.payment_purpose=$5)
            AND ($6::int IS NULL OR EXISTS (
              SELECT 1
              FROM payment_allocations deadline_allocation
              JOIN invoices deadline_invoice
                ON deadline_invoice.id=deadline_allocation.invoice_id
                AND deadline_invoice.property_id=p.property_id
              WHERE deadline_allocation.payment_id=p.id
                AND deadline_invoice.invoice_purpose='rent'
                AND deadline_invoice.authority_source='contract_schedule'
                AND deadline_invoice.due_date >= (now() AT TIME ZONE 'Asia/Jakarta')::date
                AND deadline_invoice.due_date <= ((now() AT TIME ZONE 'Asia/Jakarta')::date + $6::int)
            ))
          ORDER BY p.paid_at DESC,p.id DESC
          LIMIT $7 OFFSET $8`,
        values,
      ),
    ]);
    return {
      data: page.rows.map((row) => this.sanitizeWorkspacePayment(row)),
      meta: { limit, offset, total: Number(count.rows[0]?.total ?? 0) },
    };
  }

  async proofWorkspace(user: UserAccessContext, query: AdminW06ProofsQueryDto) {
    await this.properties.assertCanReadProperty(user, query.property_id);
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const values = [query.property_id, query.status ?? null, limit, offset];
    const [count, page] = await Promise.all([
      this.database.client.query<{ total: string }>(
        `SELECT count(*) AS total FROM payment_proofs WHERE property_id=$1 AND payment_method='bank_transfer' AND ($2::text IS NULL OR proof_status=$2)`,
        values.slice(0, 2),
      ),
      this.database.client.query<ProofWorkspaceRow>(
        `SELECT proof.id,proof.invoice_id,invoice.invoice_code,proof.resident_id,invoice.snapshot_resident_name AS resident_name,invoice.snapshot_room_number AS room_number,proof.proof_status,proof.claimed_amount,proof.payment_purpose,proof.uploaded_at,proof.reviewed_at,proof.reject_reason,proof.notes,COALESCE(jsonb_agg(jsonb_build_object('id',file.id,'original_filename',file.original_filename,'mime_type',file.mime_type,'file_size_bytes',file.file_size_bytes,'content_path','/files/'||file.id||'/content')) FILTER(WHERE file.id IS NOT NULL),'[]'::jsonb) AS evidence FROM payment_proofs proof JOIN invoices invoice ON invoice.id=proof.invoice_id AND invoice.property_id=proof.property_id LEFT JOIN payment_proof_files junction ON junction.payment_proof_id=proof.id LEFT JOIN files file ON file.id=junction.file_id AND file.property_id=proof.property_id AND file.is_deleted=false WHERE proof.property_id=$1 AND proof.payment_method='bank_transfer' AND ($2::text IS NULL OR proof.proof_status=$2) GROUP BY proof.id,invoice.id ORDER BY proof.uploaded_at DESC,proof.id DESC LIMIT $3 OFFSET $4`,
        values,
      ),
    ]);
    return {
      data: page.rows.map((value) => {
        const row = value;
        const evidence = Array.isArray(row.evidence)
          ? row.evidence.map((file) => {
              return {
                id: file.id,
                original_filename: file.original_filename,
                mime_type: file.mime_type,
                file_size_bytes: this.money(file.file_size_bytes),
                content_path: file.content_path,
              };
            })
          : [];
        return {
          id: row.id,
          invoice_id: row.invoice_id,
          invoice_code: row.invoice_code,
          resident_id: row.resident_id,
          resident_name: row.resident_name,
          room_number: row.room_number,
          proof_status: row.proof_status,
          claimed_amount: this.money(row.claimed_amount),
          payment_purpose: row.payment_purpose,
          uploaded_at: row.uploaded_at.toISOString(),
          reviewed_at: row.reviewed_at?.toISOString() ?? null,
          reject_reason: row.reject_reason,
          notes: row.notes,
          evidence,
        };
      }),
      meta: { limit, offset, total: Number(count.rows[0]?.total ?? 0) },
    };
  }

  async myBilling(user: UserAccessContext) {
    const contexts = await this.database.client.query<LeaseTupleRow>(
      `${this.leaseTupleSql()}
       JOIN property_memberships pm ON pm.property_id=l.property_id AND pm.user_id=$1 AND pm.membership_status='active'
       WHERE resident.user_id=$1 AND l.lease_status IN ('awaiting_activation','active')
       ORDER BY l.created_at DESC`,
      [user.id],
    );
    if (contexts.rows.length !== 1) {
      throw new ConflictException({
        code:
          contexts.rows.length === 0
            ? 'RESIDENT_BILLING_CONTEXT_EMPTY'
            : 'RESIDENT_BILLING_CONTEXT_AMBIGUOUS',
        message: 'Resident billing context is unavailable',
      });
    }
    return {
      data: await this.projectResidentBilling(this.database.client, contexts.rows[0], 'self'),
    };
  }

  async submitMyProof(
    user: UserAccessContext,
    dto: CreateMyPaymentProofDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    const idempotencyKey = this.requireKey(key);
    const contextRows = await this.database.client.query<{
      property_id: string;
      resident_id: string;
      lease_id: string;
    }>(
      `SELECT i.property_id,i.resident_id,i.lease_id
       FROM invoices i
       JOIN residents resident ON resident.id=i.resident_id AND resident.property_id=i.property_id
       JOIN property_memberships membership ON membership.property_id=i.property_id
         AND membership.user_id=$2 AND membership.membership_status='active'
       WHERE i.id=$1 AND resident.user_id=$2 AND i.lease_id IS NOT NULL`,
      [dto.invoice_id, user.id],
    );
    if (contextRows.rows.length !== 1)
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    const scope = contextRows.rows[0];
    const route = '/my/payment-proofs';
    const fingerprint = this.fingerprint({ dto });
    return this.database.transaction(async (client) => {
      await this.lockProperty(client, scope.property_id);
      const replay = await this.claim(
        client,
        scope.property_id,
        user.id,
        route,
        idempotencyKey,
        fingerprint,
        context,
      );
      if (replay) return { data: replay };
      await this.lockLeaseTuple(client, scope.property_id, scope.lease_id, scope.resident_id);
      const invoice = await client.query<InvoiceLockRow>(
        `SELECT i.id,i.property_id,i.resident_id,i.lease_id,i.invoice_status,i.invoice_purpose,i.due_date::text,i.total_amount,i.credit_amount,
                COALESCE(a.net,0) AS allocated_amount
         FROM invoices i
         LEFT JOIN LATERAL(SELECT COALESCE(sum(pa.allocated_amount),0)-COALESCE(sum(pra.reversed_amount),0) AS net FROM payment_allocations pa LEFT JOIN payment_reversal_allocations pra ON pra.original_allocation_id=pa.id WHERE pa.invoice_id=i.id)a ON true
         WHERE i.id=$1 AND i.property_id=$2 AND i.resident_id=$3 AND i.lease_id=$4 FOR UPDATE OF i`,
        [dto.invoice_id, scope.property_id, scope.resident_id, scope.lease_id],
      );
      const selected = invoice.rows[0];
      if (!selected || ['paid', 'void', 'draft'].includes(selected.invoice_status))
        throw new ConflictException({
          code: 'PAYMENT_INVOICE_NOT_ELIGIBLE',
          message: 'Invoice cannot receive a proof',
        });
      const expectedPurpose = dto.payment_purpose === 'other_charge' ? 'other_charge' : 'rent';
      if (
        dto.payment_purpose !== 'security_deposit' &&
        selected.invoice_purpose !== expectedPurpose
      )
        throw new ConflictException({
          code: 'PAYMENT_PURPOSE_MISMATCH',
          message: 'Payment purpose does not match invoice authority',
        });
      if (dto.payment_purpose !== 'dp' && dto.payment_purpose !== 'security_deposit') {
        const outstanding =
          this.money(selected.total_amount) -
          this.money(selected.credit_amount) -
          this.money(selected.allocated_amount);
        if (dto.claimed_amount > outstanding)
          throw new UnprocessableEntityException({
            code: 'PAYMENT_OVER_ALLOCATION',
            message: 'Claim exceeds current invoice outstanding',
          });
      }
      await this.validateEvidence(client, dto.file_ids, scope.property_id, user.id, true);
      const proof = await client.query<{ id: string; uploaded_at: Date }>(
        `INSERT INTO payment_proofs(property_id,resident_id,lease_id,invoice_id,payment_account_id,proof_status,claimed_amount,payment_method,payment_purpose,notes,uploaded_by_user_id,command_fingerprint)
         VALUES($1,$2,$3,$4,$5,'pending_review',$6,'bank_transfer',$7,$8,$9,$10)
         ON CONFLICT(property_id,command_fingerprint) WHERE command_fingerprint IS NOT NULL DO NOTHING
         RETURNING id,uploaded_at`,
        [
          scope.property_id,
          scope.resident_id,
          scope.lease_id,
          dto.invoice_id,
          dto.payment_account_id ?? null,
          dto.claimed_amount,
          dto.payment_purpose,
          dto.notes?.trim() || null,
          user.id,
          fingerprint,
        ],
      );
      if (!proof.rows[0])
        throw new ConflictException({
          code: 'PAYMENT_PROOF_DUPLICATE',
          message: 'An equivalent payment proof already exists',
        });
      for (const fileId of dto.file_ids.slice().sort())
        await client.query(
          `INSERT INTO payment_proof_files(payment_proof_id,file_id,uploaded_by_user_id) VALUES($1,$2,$3)`,
          [proof.rows[0].id, fileId, user.id],
        );
      const result = {
        id: proof.rows[0].id,
        invoice_id: dto.invoice_id,
        proof_status: 'pending_review' as const,
        claimed_amount: dto.claimed_amount,
        payment_purpose: dto.payment_purpose,
        uploaded_at: proof.rows[0].uploaded_at.toISOString(),
      };
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: scope.property_id,
          action: 'billing.payment_proof_submitted',
          resourceType: 'payment_proof',
          resourceId: proof.rows[0].id,
          afterData: result,
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.event(
        client,
        scope.property_id,
        `payment_proof.submitted:${proof.rows[0].id}`,
        'payment_proof.submitted',
        'payment_proof',
        proof.rows[0].id,
        user.id,
        context,
        {
          proof_id: proof.rows[0].id,
          invoice_id: dto.invoice_id,
          payment_purpose: dto.payment_purpose,
          claimed_amount: dto.claimed_amount,
        },
      );
      await this.complete(
        client,
        user.id,
        route,
        idempotencyKey,
        result,
        'payment_proof',
        proof.rows[0].id,
        201,
      );
      return { data: result };
    });
  }

  async myReceipt(user: UserAccessContext, receiptId: string) {
    const result = await this.database.client.query<{
      id: string;
      receipt_code: string;
      receipt_kind: string;
      amount: string;
      issued_at: Date;
      safe_snapshot: Record<string, unknown>;
    }>(
      `SELECT receipt.id,receipt.receipt_code,receipt.receipt_kind,receipt.amount,receipt.issued_at,receipt.safe_snapshot FROM payment_receipts receipt LEFT JOIN payments payment ON payment.id=receipt.payment_id LEFT JOIN payment_reversals reversal ON reversal.receipt_id=receipt.id LEFT JOIN payments reversed_payment ON reversed_payment.id=reversal.payment_id JOIN residents resident ON resident.id=COALESCE(payment.resident_id,reversed_payment.resident_id) JOIN property_memberships membership ON membership.property_id=receipt.property_id AND membership.user_id=$2 AND membership.membership_status='active' WHERE receipt.id=$1 AND resident.user_id=$2`,
      [receiptId, user.id],
    );
    if (result.rows.length !== 1)
      throw new NotFoundException({ code: 'RECEIPT_NOT_FOUND', message: 'Receipt not found' });
    const row = result.rows[0];
    return {
      data: {
        id: row.id,
        receipt_code: row.receipt_code,
        receipt_kind: row.receipt_kind,
        amount: this.money(row.amount),
        issued_at: row.issued_at.toISOString(),
        snapshot: row.safe_snapshot,
      },
    };
  }

  /**
   * W05 invokes this only after it has created and locked the awaiting-activation
   * lease plus its first issued rent invoice. It deliberately receives the W05
   * transaction client: onboarding owns the one logical command/idempotency
   * boundary, while W06 remains the sole writer of payment, allocation, deposit,
   * receipt, audit, and event records.
   */
  async recordInitialOnboardingPaymentsInTransaction(
    client: PoolClient,
    input: InitialOnboardingPaymentInput,
  ): Promise<InitialOnboardingPaymentSummary> {
    if (!Number.isSafeInteger(input.dpAmount) || input.dpAmount < 0)
      throw new BadRequestException({
        code: 'ONBOARDING_DP_AMOUNT_INVALID',
        message: 'Initial DP must be a non-negative exact amount',
      });
    if (!Number.isSafeInteger(input.securityDepositAmount) || input.securityDepositAmount < 0)
      throw new BadRequestException({
        code: 'ONBOARDING_SECURITY_DEPOSIT_INVALID',
        message: 'Security deposit must be a non-negative exact amount',
      });
    if (!/^[a-f0-9]{64}$/i.test(input.commandFingerprint))
      throw new BadRequestException({
        code: 'ONBOARDING_PAYMENT_FINGERPRINT_INVALID',
        message: 'Initial payment command requires a canonical fingerprint',
      });

    const lease = await this.lockLeaseTuple(
      client,
      input.propertyId,
      input.leaseId,
      input.residentId,
    );
    await this.validateEvidence(
      client,
      input.evidenceFileIds,
      input.propertyId,
      input.actor.id,
      input.method === 'bank_transfer',
    );

    const status = input.method === 'cash' ? 'verified' : 'pending_confirmation';
    const payments: Array<{
      purpose: Extract<W06PaymentPurpose, 'dp' | 'security_deposit'>;
      amount: number;
      allocations: Array<{ invoice_id: string; amount: number }>;
    }> = [];
    const receipts: InitialOnboardingPaymentSummary['receipts'] = [];
    if (input.dpAmount > 0)
      payments.push({
        purpose: 'dp',
        amount: input.dpAmount,
        allocations: [{ invoice_id: input.firstRentInvoiceId, amount: input.dpAmount }],
      });
    if (input.securityDepositAmount > 0)
      payments.push({
        purpose: 'security_deposit',
        amount: input.securityDepositAmount,
        allocations: [],
      });

    for (const item of payments) {
      const invoiceRows = await this.lockAndValidateInvoices(
        client,
        lease,
        item.allocations,
        item.purpose,
      );
      const childFingerprint = `onboarding:${input.commandFingerprint}:${item.purpose}`;
      const payment = await client.query<PaymentRow>(
        `INSERT INTO payments(property_id,resident_id,lease_id,payment_code,payment_method,payment_status,payment_purpose,amount,paid_at,received_by_user_id,verified_by_user_id,verified_at,reference_number,notes,authority_source,command_fingerprint)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),$9::uuid,CASE WHEN $6='verified' THEN $9::uuid ELSE NULL END,CASE WHEN $6='verified' THEN now() ELSE NULL END,NULL,$10,CASE WHEN $5='cash' THEN 'audited_cash' ELSE 'manual_transfer' END,$11)
         ON CONFLICT(property_id,command_fingerprint) WHERE command_fingerprint IS NOT NULL DO NOTHING
         RETURNING id,property_id,resident_id,lease_id,payment_code,payment_method,payment_status,payment_purpose,amount,paid_at,verified_at,proof_id,reference_number,notes`,
        [
          input.propertyId,
          input.residentId,
          input.leaseId,
          `PAY-ONB-${input.commandFingerprint.slice(0, 16).toUpperCase()}-${item.purpose === 'dp' ? 'DP' : 'DEP'}`,
          input.method,
          status,
          item.purpose,
          item.amount,
          input.actor.id,
          input.paymentNote?.trim() || null,
          childFingerprint,
        ],
      );
      if (!payment.rows[0])
        throw new ConflictException({
          code: 'ONBOARDING_PAYMENT_DUPLICATE_COMMAND',
          message: 'Initial onboarding payment command already exists',
        });
      await this.insertIntents(client, payment.rows[0], item.allocations);
      await this.attachEvidence(
        client,
        payment.rows[0].id,
        input.propertyId,
        input.evidenceFileIds,
        input.method,
        input.actor.id,
      );
      const receiptId =
        status === 'verified'
          ? await this.applyVerifiedEffects(
              client,
              payment.rows[0],
              lease,
              invoiceRows,
              input.actor.id,
            )
          : null;
      const result = this.safePayment(payment.rows[0], receiptId);
      if (receiptId)
        receipts.push({
          id: receiptId,
          purpose: item.purpose,
          amount: item.amount,
        });
      await this.audit.write(
        {
          actorUserId: input.actor.id,
          propertyId: input.propertyId,
          action:
            status === 'verified'
              ? 'billing.onboarding_cash_recorded'
              : 'billing.onboarding_transfer_recorded',
          resourceType: 'payment',
          resourceId: payment.rows[0].id,
          afterData: result,
          resultStatus: 'success',
          ...input.context,
        },
        client,
      );
      await this.event(
        client,
        input.propertyId,
        `payment.recorded:${payment.rows[0].id}`,
        'payment.recorded',
        'payment',
        payment.rows[0].id,
        input.actor.id,
        input.context,
        {
          payment_id: payment.rows[0].id,
          payment_status: status,
          payment_purpose: item.purpose,
          amount: item.amount,
          source: 'resident_onboarding',
        },
      );
    }

    return {
      method: input.method,
      status,
      dpRecordedAmount: input.dpAmount,
      securityDepositRecordedAmount: input.securityDepositAmount,
      dpVerifiedAmount: status === 'verified' ? input.dpAmount : 0,
      securityDepositVerifiedAmount: status === 'verified' ? input.securityDepositAmount : 0,
      receipts,
    };
  }

  async recordManualPayment(
    user: UserAccessContext,
    dto: RecordManualPaymentDto,
    key: string | undefined,
    context: RequestAuditContext,
  ): Promise<{ data: SafePaymentResult }> {
    const idempotencyKey = this.requireKey(key);
    await this.properties.assertCanReadProperty(user, dto.property_id);
    const fingerprint = this.fingerprint({ dto });
    return this.database.transaction(async (client) => {
      await this.lockProperty(client, dto.property_id);
      const replay = await this.claim(
        client,
        dto.property_id,
        user.id,
        '/admin/billing/payments/manual',
        idempotencyKey,
        fingerprint,
        context,
      );
      if (replay) return { data: replay as unknown as SafePaymentResult };
      const lease = await this.lockLeaseTuple(
        client,
        dto.property_id,
        dto.lease_id,
        dto.resident_id,
      );
      await this.validateEvidence(
        client,
        dto.evidence_file_ids ?? [],
        dto.property_id,
        user.id,
        dto.method === 'bank_transfer',
      );
      const amount = this.allocationTotal(dto.allocations);
      if (dto.payment_purpose === 'security_deposit') {
        if (dto.allocations.length !== 0)
          throw new BadRequestException({
            code: 'DEPOSIT_INVOICE_ALLOCATION_FORBIDDEN',
            message: 'Security deposit cannot fund rent invoices',
          });
      } else if (dto.allocations.length === 0) {
        throw new BadRequestException({
          code: 'PAYMENT_ALLOCATIONS_REQUIRED',
          message: 'Explicit invoice allocations are required',
        });
      }
      const effectiveAmount =
        dto.payment_purpose === 'security_deposit' ? this.moneyFromUnknown(dto.amount) : amount;
      if (dto.payment_purpose !== 'security_deposit' && dto.amount !== effectiveAmount)
        throw new BadRequestException({
          code: 'PAYMENT_ALLOCATION_TOTAL_MISMATCH',
          message: 'Allocation sum must equal payment amount',
        });
      if (effectiveAmount <= 0)
        throw new BadRequestException({
          code: 'PAYMENT_AMOUNT_INVALID',
          message: 'Payment amount must be positive',
        });
      const invoiceRows = await this.lockAndValidateInvoices(
        client,
        lease,
        dto.allocations,
        dto.payment_purpose,
      );
      await this.assertContractSettlementPaymentEligibility(
        client,
        lease,
        dto.payment_purpose,
        dto.allocations,
        invoiceRows,
      );
      const status = dto.method === 'cash' ? 'verified' : 'pending_confirmation';
      const payment = await client.query<PaymentRow>(
        `INSERT INTO payments(property_id,resident_id,lease_id,payment_code,payment_method,payment_status,payment_purpose,amount,paid_at,received_by_user_id,verified_by_user_id,verified_at,reference_number,notes,authority_source,command_fingerprint)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamptz,now()),$10::uuid,CASE WHEN $6='verified' THEN $10::uuid ELSE NULL END,CASE WHEN $6='verified' THEN now() ELSE NULL END,$11,$12,CASE WHEN $5='cash' THEN 'audited_cash' ELSE 'manual_transfer' END,$13)
         ON CONFLICT(property_id,command_fingerprint) WHERE command_fingerprint IS NOT NULL DO NOTHING
         RETURNING id,property_id,resident_id,lease_id,payment_code,payment_method,payment_status,payment_purpose,amount,paid_at,verified_at,proof_id,reference_number,notes`,
        [
          dto.property_id,
          dto.resident_id,
          dto.lease_id,
          this.paymentCode(),
          dto.method,
          status,
          dto.payment_purpose,
          effectiveAmount,
          dto.paid_at ?? null,
          user.id,
          dto.reference_number?.trim() || null,
          dto.note?.trim() || null,
          fingerprint,
        ],
      );
      if (!payment.rows[0])
        throw new ConflictException({
          code: 'PAYMENT_DUPLICATE_COMMAND',
          message: 'An equivalent payment command already exists',
        });
      await this.insertIntents(client, payment.rows[0], dto.allocations);
      await this.attachEvidence(
        client,
        payment.rows[0].id,
        dto.property_id,
        dto.evidence_file_ids ?? [],
        dto.method,
        user.id,
      );
      const receiptId =
        status === 'verified'
          ? await this.applyVerifiedEffects(client, payment.rows[0], lease, invoiceRows, user.id)
          : null;
      const result = this.safePayment(payment.rows[0], receiptId);
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: status === 'verified' ? 'billing.cash_recorded' : 'billing.transfer_recorded',
          resourceType: 'payment',
          resourceId: payment.rows[0].id,
          afterData: result,
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.event(
        client,
        dto.property_id,
        `payment.recorded:${payment.rows[0].id}`,
        'payment.recorded',
        'payment',
        payment.rows[0].id,
        user.id,
        context,
        {
          payment_id: payment.rows[0].id,
          payment_status: status,
          payment_purpose: dto.payment_purpose,
          amount: effectiveAmount,
        },
      );
      await this.complete(
        client,
        user.id,
        '/admin/billing/payments/manual',
        idempotencyKey,
        result,
        'payment',
        payment.rows[0].id,
        201,
      );
      return { data: result };
    });
  }

  async verifyManualPayment(
    user: UserAccessContext,
    paymentId: string,
    dto: VerifyManualPaymentDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    const idempotencyKey = this.requireKey(key);
    await this.properties.assertCanReadProperty(user, dto.property_id);
    const route = '/admin/billing/payments/:paymentId/verify';
    const fingerprint = this.fingerprint({ paymentId, dto });
    return this.database.transaction(async (client) => {
      await this.lockProperty(client, dto.property_id);
      const replay = await this.claim(
        client,
        dto.property_id,
        user.id,
        route,
        idempotencyKey,
        fingerprint,
        context,
      );
      if (replay) return { data: replay };
      const scope = await client.query<{ lease_id: string; resident_id: string }>(
        `SELECT lease_id,resident_id FROM payments WHERE id=$1 AND property_id=$2`,
        [paymentId, dto.property_id],
      );
      if (!scope.rows[0])
        throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' });
      const lease = await this.lockLeaseTuple(
        client,
        dto.property_id,
        scope.rows[0].lease_id,
        scope.rows[0].resident_id,
      );
      const paymentResult = await client.query<PaymentRow>(
        `SELECT id,property_id,resident_id,lease_id,payment_code,payment_method,payment_status,payment_purpose,amount,paid_at,verified_at,proof_id,reference_number,notes
         FROM payments WHERE id=$1 AND property_id=$2 FOR UPDATE`,
        [paymentId, dto.property_id],
      );
      const payment = paymentResult.rows[0];
      if (!payment)
        throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' });
      if (payment.payment_status !== 'pending_confirmation')
        throw new ConflictException({
          code: 'PAYMENT_NOT_PENDING',
          message: 'Payment is not pending confirmation',
        });
      if (payment.payment_method !== 'bank_transfer')
        throw new ConflictException({
          code: 'PAYMENT_METHOD_NOT_VERIFIABLE',
          message: 'Only a bank transfer can be verified',
        });
      const evidence = await client.query(
        `SELECT id FROM payment_evidence_files WHERE payment_id=$1 ORDER BY id FOR UPDATE`,
        [payment.id],
      );
      if (!evidence.rowCount)
        throw new ConflictException({
          code: 'TRANSFER_PROOF_REQUIRED',
          message: 'Bank transfer proof is required',
        });
      if (payment.proof_id) {
        const proof = await client.query<{ proof_status: string }>(
          `SELECT proof_status FROM payment_proofs WHERE id=$1 AND property_id=$2 FOR UPDATE`,
          [payment.proof_id, dto.property_id],
        );
        if (proof.rows[0]?.proof_status !== 'pending_review')
          throw new ConflictException({
            code: 'PAYMENT_PROOF_NOT_REVIEWABLE',
            message: 'Payment proof is not pending review',
          });
      }
      const intents = await this.lockIntents(client, payment.id);
      const invoiceRows = await this.lockAndValidateInvoices(
        client,
        lease,
        intents.map((item) => ({
          invoice_id: item.invoice_id,
          amount: this.money(item.intended_amount),
        })),
        payment.payment_purpose,
      );
      await this.assertContractSettlementPaymentEligibility(
        client,
        lease,
        payment.payment_purpose,
        intents.map((item) => ({
          invoice_id: item.invoice_id,
          amount: this.money(item.intended_amount),
        })),
        invoiceRows,
      );
      await client.query(
        `UPDATE payments SET payment_status='verified',verified_by_user_id=$2,verified_at=now(),updated_at=now() WHERE id=$1 AND payment_status='pending_confirmation'`,
        [payment.id, user.id],
      );
      if (payment.proof_id)
        await client.query(
          `UPDATE payment_proofs SET proof_status='verified',reviewed_by_user_id=$2,reviewed_at=now(),payment_id=$1,updated_at=now() WHERE id=$3 AND proof_status='pending_review'`,
          [payment.id, user.id, payment.proof_id],
        );
      payment.payment_status = 'verified';
      payment.verified_at = new Date();
      const receiptId = await this.applyVerifiedEffects(
        client,
        payment,
        lease,
        invoiceRows,
        user.id,
      );
      const result = this.safePayment(payment, receiptId);
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: 'billing.payment_verified',
          resourceType: 'payment',
          resourceId: payment.id,
          afterData: result,
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.event(
        client,
        dto.property_id,
        `payment.verified:${payment.id}`,
        'payment.verified',
        'payment',
        payment.id,
        user.id,
        context,
        {
          payment_id: payment.id,
          payment_purpose: payment.payment_purpose,
          amount: this.money(payment.amount),
        },
      );
      await this.complete(
        client,
        user.id,
        route,
        idempotencyKey,
        result,
        'payment',
        payment.id,
        200,
      );
      return { data: result };
    });
  }

  async rejectManualPayment(
    user: UserAccessContext,
    paymentId: string,
    dto: RejectManualPaymentDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    const idempotencyKey = this.requireKey(key);
    await this.properties.assertCanReadProperty(user, dto.property_id);
    const route = '/admin/billing/payments/:paymentId/reject';
    const fingerprint = this.fingerprint({ paymentId, dto });
    return this.database.transaction(async (client) => {
      await this.lockProperty(client, dto.property_id);
      const replay = await this.claim(
        client,
        dto.property_id,
        user.id,
        route,
        idempotencyKey,
        fingerprint,
        context,
      );
      if (replay) return { data: replay };
      const scope = await client.query<{ lease_id: string; resident_id: string }>(
        `SELECT lease_id,resident_id FROM payments WHERE id=$1 AND property_id=$2 FOR UPDATE`,
        [paymentId, dto.property_id],
      );
      if (!scope.rows[0])
        throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' });
      await this.lockLeaseTuple(
        client,
        dto.property_id,
        scope.rows[0].lease_id,
        scope.rows[0].resident_id,
      );
      const paymentResult = await client.query<PaymentRow>(
        `SELECT id,property_id,resident_id,lease_id,payment_code,payment_method,payment_status,payment_purpose,amount,paid_at,verified_at,proof_id,reference_number,notes
         FROM payments WHERE id=$1 AND property_id=$2 FOR UPDATE`,
        [paymentId, dto.property_id],
      );
      const payment = paymentResult.rows[0];
      if (!payment)
        throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' });
      if (payment.payment_status !== 'pending_confirmation')
        throw new ConflictException({
          code: 'PAYMENT_NOT_PENDING',
          message: 'Payment is not pending confirmation',
        });
      if (payment.payment_method !== 'bank_transfer')
        throw new ConflictException({
          code: 'PAYMENT_METHOD_NOT_REJECTABLE',
          message: 'Only a bank transfer can be rejected',
        });
      const evidence = await client.query(
        `SELECT id FROM payment_evidence_files WHERE payment_id=$1 ORDER BY id FOR UPDATE`,
        [payment.id],
      );
      if (!evidence.rowCount)
        throw new ConflictException({
          code: 'TRANSFER_PROOF_REQUIRED',
          message: 'Bank transfer proof is required',
        });
      if (payment.proof_id)
        await client.query(
          `SELECT id FROM payment_proofs WHERE id=$1 AND property_id=$2 FOR UPDATE`,
          [payment.proof_id, dto.property_id],
        );
      await client.query(
        `UPDATE payments SET payment_status='rejected',updated_at=now() WHERE id=$1 AND property_id=$2 AND payment_status='pending_confirmation'`,
        [payment.id, dto.property_id],
      );
      if (payment.proof_id)
        await client.query(
          `UPDATE payment_proofs SET proof_status='rejected',reject_reason=$2,reviewed_by_user_id=$3,reviewed_at=now(),updated_at=now() WHERE id=$1 AND property_id=$4 AND proof_status='pending_review'`,
          [payment.proof_id, dto.reason.trim(), user.id, dto.property_id],
        );
      payment.payment_status = 'rejected';
      const result = this.safePayment(payment, null);
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: 'billing.payment_rejected',
          resourceType: 'payment',
          resourceId: payment.id,
          afterData: { payment_status: result.payment_status, reason: dto.reason.trim() },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.event(
        client,
        dto.property_id,
        'payment.rejected:' + payment.id,
        'payment.rejected',
        'payment',
        payment.id,
        user.id,
        context,
        { payment_id: payment.id, payment_status: 'rejected' },
      );
      await this.complete(
        client,
        user.id,
        route,
        idempotencyKey,
        result,
        'payment',
        payment.id,
        200,
      );
      return { data: result };
    });
  }

  async verifyProof(
    user: UserAccessContext,
    proofId: string,
    dto: VerifyManualPaymentDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    const idempotencyKey = this.requireKey(key);
    await this.properties.assertCanReadProperty(user, dto.property_id);
    const route = '/admin/billing/payment-proofs/:proofId/verify';
    const fingerprint = this.fingerprint({ proofId, dto });
    return this.database.transaction(async (client) => {
      await this.lockProperty(client, dto.property_id);
      const replay = await this.claim(
        client,
        dto.property_id,
        user.id,
        route,
        idempotencyKey,
        fingerprint,
        context,
      );
      if (replay) return { data: replay };
      const scope = await client.query<{ lease_id: string; resident_id: string }>(
        `SELECT COALESCE(pp.lease_id,i.lease_id) AS lease_id,pp.resident_id FROM payment_proofs pp JOIN invoices i ON i.id=pp.invoice_id WHERE pp.id=$1 AND pp.property_id=$2`,
        [proofId, dto.property_id],
      );
      if (!scope.rows[0]?.lease_id)
        throw new NotFoundException({
          code: 'PAYMENT_PROOF_NOT_FOUND',
          message: 'Payment proof not found',
        });
      const lease = await this.lockLeaseTuple(
        client,
        dto.property_id,
        scope.rows[0].lease_id,
        scope.rows[0].resident_id,
      );
      const proofResult = await client.query<{
        id: string;
        invoice_id: string;
        resident_id: string;
        lease_id: string | null;
        claimed_amount: string;
        payment_method: string;
        payment_purpose: W06PaymentPurpose;
        proof_status: string;
        notes: string | null;
      }>(
        `SELECT id,invoice_id,resident_id,lease_id,claimed_amount,payment_method,payment_purpose,proof_status,notes FROM payment_proofs WHERE id=$1 AND property_id=$2 FOR UPDATE`,
        [proofId, dto.property_id],
      );
      const proof = proofResult.rows[0];
      if (!proof)
        throw new NotFoundException({
          code: 'PAYMENT_PROOF_NOT_FOUND',
          message: 'Payment proof not found',
        });
      if (proof.proof_status !== 'pending_review')
        throw new ConflictException({
          code: 'PAYMENT_PROOF_NOT_REVIEWABLE',
          message: 'Payment proof is not pending review',
        });
      if (proof.payment_method !== 'bank_transfer')
        throw new ConflictException({
          code: 'PAYMENT_PROOF_METHOD_INVALID',
          message: 'Only bank-transfer proof is accepted',
        });
      const files = await client.query<{
        file_id: string;
        property_id: string | null;
        file_purpose: string | null;
        is_deleted: boolean | null;
        mime_type: string | null;
        file_size_bytes: string | null;
      }>(
        `SELECT junction.file_id,file.property_id,file.file_purpose,file.is_deleted,file.mime_type,file.file_size_bytes FROM payment_proof_files junction JOIN files file ON file.id=junction.file_id WHERE junction.payment_proof_id=$1 ORDER BY junction.file_id FOR UPDATE OF junction,file`,
        [proof.id],
      );
      if (
        !files.rowCount ||
        files.rows.some(
          (file) =>
            file.property_id !== dto.property_id ||
            file.file_purpose !== 'payment_proof' ||
            file.is_deleted !== false ||
            !['image/jpeg', 'image/png', 'application/pdf'].includes(file.mime_type ?? '') ||
            this.money(file.file_size_bytes ?? '0') <= 0 ||
            this.money(file.file_size_bytes ?? '0') > 5_242_880,
        )
      )
        throw new ConflictException({
          code: 'TRANSFER_PROOF_REQUIRED',
          message: 'Safe bank transfer proof is required',
        });
      const amount = this.money(proof.claimed_amount);
      const allocations =
        proof.payment_purpose === 'security_deposit'
          ? []
          : proof.payment_purpose === 'dp'
            ? await this.oldestRentAllocations(client, lease, amount)
            : [{ invoice_id: proof.invoice_id, amount }];
      const invoiceRows = await this.lockAndValidateInvoices(
        client,
        lease,
        allocations,
        proof.payment_purpose,
      );
      const paymentResult = await client.query<PaymentRow>(
        `INSERT INTO payments(property_id,resident_id,lease_id,payment_code,payment_method,payment_status,payment_purpose,amount,paid_at,received_by_user_id,verified_by_user_id,verified_at,proof_id,notes,authority_source,command_fingerprint) VALUES($1,$2,$3,$4,'bank_transfer','verified',$5,$6,now(),$7,$7,now(),$8,$9,'manual_transfer',$10) RETURNING id,property_id,resident_id,lease_id,payment_code,payment_method,payment_status,payment_purpose,amount,paid_at,verified_at,proof_id,reference_number,notes`,
        [
          dto.property_id,
          proof.resident_id,
          lease.id,
          this.paymentCode(),
          proof.payment_purpose,
          amount,
          user.id,
          proof.id,
          proof.notes,
          this.fingerprint({ proofId: proof.id }),
        ],
      );
      const payment = paymentResult.rows[0];
      await this.insertIntents(client, payment, allocations);
      for (const file of files.rows)
        await client.query(
          `INSERT INTO payment_evidence_files(property_id,payment_id,file_id,evidence_kind,created_by_user_id) VALUES($1,$2,$3,'transfer_proof',$4)`,
          [dto.property_id, payment.id, file.file_id, user.id],
        );
      await client.query(
        `UPDATE payment_proofs SET proof_status='verified',reviewed_by_user_id=$2,reviewed_at=now(),payment_id=$3,lease_id=$4,updated_at=now() WHERE id=$1`,
        [proof.id, user.id, payment.id, lease.id],
      );
      const receiptId = await this.applyVerifiedEffects(
        client,
        payment,
        lease,
        invoiceRows,
        user.id,
      );
      const result = this.safePayment(payment, receiptId);
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: 'billing.payment_proof_verified',
          resourceType: 'payment_proof',
          resourceId: proof.id,
          afterData: { proof_status: 'verified', payment_id: payment.id, receipt_id: receiptId },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.event(
        client,
        dto.property_id,
        `payment.verified:${payment.id}`,
        'payment.verified',
        'payment',
        payment.id,
        user.id,
        context,
        { payment_id: payment.id, payment_purpose: payment.payment_purpose, amount },
      );
      await this.complete(
        client,
        user.id,
        route,
        idempotencyKey,
        result,
        'payment',
        payment.id,
        200,
      );
      return { data: result };
    });
  }

  async rejectProof(
    user: UserAccessContext,
    proofId: string,
    dto: ReviewPaymentProofDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    const idempotencyKey = this.requireKey(key);
    const reason = dto.reason?.trim();
    if (!reason)
      throw new BadRequestException({
        code: 'PAYMENT_PROOF_REJECT_REASON_REQUIRED',
        message: 'A safe rejection reason is required',
      });
    await this.properties.assertCanReadProperty(user, dto.property_id);
    const route = '/admin/billing/payment-proofs/:proofId/reject';
    const fingerprint = this.fingerprint({
      proofId,
      dto: { property_id: dto.property_id, reason },
    });
    return this.database.transaction(async (client) => {
      await this.lockProperty(client, dto.property_id);
      const replay = await this.claim(
        client,
        dto.property_id,
        user.id,
        route,
        idempotencyKey,
        fingerprint,
        context,
      );
      if (replay) return { data: replay };
      const proof = await client.query<{ id: string; proof_status: string }>(
        `SELECT id,proof_status FROM payment_proofs WHERE id=$1 AND property_id=$2 FOR UPDATE`,
        [proofId, dto.property_id],
      );
      if (!proof.rows[0])
        throw new NotFoundException({
          code: 'PAYMENT_PROOF_NOT_FOUND',
          message: 'Payment proof not found',
        });
      if (proof.rows[0].proof_status !== 'pending_review')
        throw new ConflictException({
          code: 'PAYMENT_PROOF_NOT_REVIEWABLE',
          message: 'Payment proof is not pending review',
        });
      await client.query(
        `UPDATE payment_proofs SET proof_status='rejected',reviewed_by_user_id=$2,reviewed_at=now(),reject_reason=$3,updated_at=now() WHERE id=$1`,
        [proofId, user.id, reason],
      );
      const result = { proof_id: proofId, proof_status: 'rejected' as const };
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: 'billing.payment_proof_rejected',
          resourceType: 'payment_proof',
          resourceId: proofId,
          afterData: result,
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.event(
        client,
        dto.property_id,
        `payment_proof.rejected:${proofId}`,
        'payment_proof.rejected',
        'payment_proof',
        proofId,
        user.id,
        context,
        result,
      );
      await this.complete(
        client,
        user.id,
        route,
        idempotencyKey,
        result,
        'payment_proof',
        proofId,
        200,
      );
      return { data: result };
    });
  }

  async reversePayment(
    user: UserAccessContext,
    paymentId: string,
    dto: ReversePaymentDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    const idempotencyKey = this.requireKey(key);
    await this.properties.assertCanReadProperty(user, dto.property_id);
    const route = '/admin/billing/payments/:paymentId/reverse';
    const fingerprint = this.fingerprint({ paymentId, dto });
    return this.database.transaction(async (client) => {
      await this.lockProperty(client, dto.property_id);
      const replay = await this.claim(
        client,
        dto.property_id,
        user.id,
        route,
        idempotencyKey,
        fingerprint,
        context,
      );
      if (replay) return { data: replay };
      const scope = await client.query<{ lease_id: string; resident_id: string }>(
        `SELECT lease_id,resident_id FROM payments WHERE id=$1 AND property_id=$2`,
        [paymentId, dto.property_id],
      );
      if (!scope.rows[0])
        throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' });
      const lease = await this.lockLeaseTuple(
        client,
        dto.property_id,
        scope.rows[0].lease_id,
        scope.rows[0].resident_id,
      );
      const paymentResult = await client.query<PaymentRow>(
        `SELECT id,property_id,resident_id,lease_id,payment_code,payment_method,payment_status,payment_purpose,amount,paid_at,verified_at,proof_id,reference_number,notes FROM payments WHERE id=$1 AND property_id=$2 FOR UPDATE`,
        [paymentId, dto.property_id],
      );
      const payment = paymentResult.rows[0];
      if (payment.payment_status !== 'verified')
        throw new ConflictException({
          code: 'PAYMENT_NOT_REVERSIBLE',
          message: 'Only a verified payment can be reversed',
        });
      const existing = await client.query(
        `SELECT id FROM payment_reversals WHERE payment_id=$1 FOR UPDATE`,
        [payment.id],
      );
      if (existing.rowCount)
        throw new ConflictException({
          code: 'PAYMENT_ALREADY_REVERSED',
          message: 'Payment was already reversed',
        });
      const allocations = await client.query<{
        id: string;
        invoice_id: string;
        allocated_amount: string;
      }>(
        `SELECT id,invoice_id,allocated_amount FROM payment_allocations WHERE payment_id=$1 ORDER BY invoice_id,id FOR UPDATE`,
        [payment.id],
      );
      const invoiceIds = allocations.rows.map((row) => row.invoice_id);
      if (invoiceIds.length)
        await client.query(
          `SELECT id FROM invoices WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
          [invoiceIds],
        );
      if (payment.payment_purpose === 'security_deposit') {
        const balance = await this.depositBalance(client, lease.id);
        if (balance < this.money(payment.amount))
          throw new ConflictException({
            code: 'DEPOSIT_REVERSAL_BALANCE_CONFLICT',
            message: 'Deposit balance is insufficient for payment reversal',
          });
      }
      const receipt = await this.insertReceipt(
        client,
        dto.property_id,
        null,
        'reversal',
        this.money(payment.amount),
        user.id,
        { payment_code: payment.payment_code, reason: dto.reason.trim() },
      );
      const reversal = await client.query<{ id: string; reversed_at: Date }>(
        `INSERT INTO payment_reversals(property_id,payment_id,reason,reversed_by_user_id,receipt_id) VALUES($1,$2,$3,$4,$5) RETURNING id,reversed_at`,
        [dto.property_id, payment.id, dto.reason.trim(), user.id, receipt],
      );
      for (const allocation of allocations.rows)
        await client.query(
          `INSERT INTO payment_reversal_allocations(property_id,reversal_id,original_allocation_id,invoice_id,reversed_amount) VALUES($1,$2,$3,$4,$5)`,
          [
            dto.property_id,
            reversal.rows[0].id,
            allocation.id,
            allocation.invoice_id,
            allocation.allocated_amount,
          ],
        );
      if (payment.payment_purpose === 'security_deposit')
        await client.query(
          `INSERT INTO lease_deposit_transactions(property_id,lease_id,transaction_type,direction,amount,payment_id,reason_type,reason,settlement_status,settled_at,settled_by_user_id,metadata,created_by_user_id,reversal_id) VALUES($1,$2,'refund','debit',$3,$4,'payment_reversal',$5,'settled',now(),$6,$7::jsonb,$6,$8)`,
          [
            dto.property_id,
            lease.id,
            payment.amount,
            payment.id,
            dto.reason.trim(),
            user.id,
            JSON.stringify({ source: 'payment_reversal' }),
            reversal.rows[0].id,
          ],
        );
      for (const invoiceId of invoiceIds) await this.refreshInvoiceStatus(client, invoiceId);
      const result = {
        reversal_id: reversal.rows[0].id,
        payment_id: payment.id,
        receipt_id: receipt,
        reversed_at: reversal.rows[0].reversed_at.toISOString(),
        amount: this.money(payment.amount),
      };
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: 'billing.payment_reversed',
          resourceType: 'payment_reversal',
          resourceId: reversal.rows[0].id,
          afterData: result,
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.event(
        client,
        dto.property_id,
        `payment.reversed:${payment.id}`,
        'payment.reversed',
        'payment',
        payment.id,
        user.id,
        context,
        {
          payment_id: payment.id,
          reversal_id: reversal.rows[0].id,
          amount: this.money(payment.amount),
        },
      );
      await this.complete(
        client,
        user.id,
        route,
        idempotencyKey,
        result,
        'payment_reversal',
        reversal.rows[0].id,
        201,
      );
      return { data: result };
    });
  }

  async createOtherCharge(
    user: UserAccessContext,
    dto: CreateOtherChargeDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    const idempotencyKey = this.requireKey(key);
    await this.properties.assertCanReadProperty(user, dto.property_id);
    const route = '/admin/billing/other-charges';
    const fingerprint = this.fingerprint({ dto });
    return this.database.transaction(async (client) => {
      await this.lockProperty(client, dto.property_id);
      const replay = await this.claim(
        client,
        dto.property_id,
        user.id,
        route,
        idempotencyKey,
        fingerprint,
        context,
      );
      if (replay) return { data: replay };
      const lease = await this.lockLeaseTuple(
        client,
        dto.property_id,
        dto.lease_id,
        dto.resident_id,
      );
      await this.validateEvidence(
        client,
        dto.evidence_file_ids ?? [],
        dto.property_id,
        user.id,
        dto.category === 'documented_damage',
        'complaint_attachment',
      );
      const period = await client.query<{ id: string }>(
        `INSERT INTO billing_periods(property_id,period_key,start_date,end_date,due_date,status,created_by_user_id) VALUES($1,$2,$3::date,$3::date,$3::date,'open',$4) ON CONFLICT(property_id,period_key) DO UPDATE SET updated_at=billing_periods.updated_at RETURNING id`,
        [dto.property_id, `OTHER-${dto.due_date}`, dto.due_date, user.id],
      );
      const invoice = await client.query<{ id: string; invoice_code: string }>(
        `INSERT INTO invoices(property_id,resident_id,room_id,occupancy_id,billing_period_id,lease_id,invoice_code,invoice_status,subtotal_amount,total_amount,due_date,issued_at,snapshot_period_key,snapshot_period_start_date,snapshot_period_end_date,snapshot_room_number,snapshot_resident_name,snapshot_monthly_price,cycle_start_date,cycle_end_date,snapshot_billing_cycle,snapshot_rent_amount,generation_source,invoice_purpose,other_charge_type,other_charge_description,authority_source,snapshot_building_code,snapshot_category_name,snapshot_contract_rent_amount,snapshot_payment_plan_type,created_by_user_id,command_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,'issued',$8,$8,$9::date,now(),$10,$9::date,$9::date,$11,$12,$13,$9::date,$9::date,'monthly',$13,'manual','other_charge',$14,$15,'other_charge',$16,$17,$18,$19,$20,$21) ON CONFLICT(property_id,command_fingerprint) WHERE command_fingerprint IS NOT NULL DO NOTHING RETURNING id,invoice_code`,
        [
          dto.property_id,
          dto.resident_id,
          lease.room_id,
          lease.occupancy_id,
          period.rows[0].id,
          lease.id,
          `OTH-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
          dto.amount,
          dto.due_date,
          `OTHER-${dto.due_date}`,
          lease.snapshot_room_number,
          lease.resident_name,
          lease.snapshot_monthly_price,
          dto.category,
          dto.description.trim(),
          lease.building_code,
          lease.snapshot_kost_type_name,
          lease.contract_rent_amount,
          lease.payment_plan_type,
          user.id,
          fingerprint,
        ],
      );
      if (!invoice.rows[0])
        throw new ConflictException({
          code: 'OTHER_CHARGE_DUPLICATE',
          message: 'An equivalent other charge already exists',
        });
      await client.query(
        `INSERT INTO invoice_line_items(invoice_id,line_type,description,quantity,unit_amount,total_amount,sort_order,metadata) VALUES($1,'other',$2,1,$3,$3,0,$4::jsonb)`,
        [
          invoice.rows[0].id,
          dto.description.trim(),
          dto.amount,
          JSON.stringify({
            category: dto.category,
            evidence_file_ids: dto.evidence_file_ids ?? [],
          }),
        ],
      );
      for (const fileId of (dto.evidence_file_ids ?? []).slice().sort())
        await client.query(
          `INSERT INTO invoice_evidence_files(property_id,invoice_id,file_id,evidence_kind,created_by_user_id) VALUES($1,$2,$3,$4,$5)`,
          [
            dto.property_id,
            invoice.rows[0].id,
            fileId,
            dto.category === 'documented_damage' ? 'damage_evidence' : 'other_charge_evidence',
            user.id,
          ],
        );
      const result = {
        invoice_id: invoice.rows[0].id,
        invoice_code: invoice.rows[0].invoice_code,
        invoice_status: 'issued' as const,
        invoice_purpose: 'other_charge' as const,
        amount: dto.amount,
        due_date: dto.due_date,
      };
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: 'billing.other_charge_created',
          resourceType: 'invoice',
          resourceId: invoice.rows[0].id,
          afterData: result,
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.event(
        client,
        dto.property_id,
        `invoice.other_charge_created:${invoice.rows[0].id}`,
        'invoice.other_charge_created',
        'invoice',
        invoice.rows[0].id,
        user.id,
        context,
        result,
      );
      await this.complete(
        client,
        user.id,
        route,
        idempotencyKey,
        result,
        'invoice',
        invoice.rows[0].id,
        201,
      );
      return { data: result };
    });
  }

  async voidInvoice(
    user: UserAccessContext,
    invoiceId: string,
    dto: VoidInvoiceDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    const idempotencyKey = this.requireKey(key);
    await this.properties.assertCanReadProperty(user, dto.property_id);
    const route = '/admin/billing/invoices/:invoiceId/void';
    const fingerprint = this.fingerprint({ invoiceId, dto });
    return this.database.transaction(async (client) => {
      await this.lockProperty(client, dto.property_id);
      const replay = await this.claim(
        client,
        dto.property_id,
        user.id,
        route,
        idempotencyKey,
        fingerprint,
        context,
      );
      if (replay) return { data: replay };
      const scope = await client.query<{ lease_id: string; resident_id: string }>(
        `SELECT lease_id,resident_id FROM invoices WHERE id=$1 AND property_id=$2`,
        [invoiceId, dto.property_id],
      );
      if (!scope.rows[0]?.lease_id)
        throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
      await this.lockLeaseTuple(
        client,
        dto.property_id,
        scope.rows[0].lease_id,
        scope.rows[0].resident_id,
      );
      const invoice = await client.query<{
        id: string;
        invoice_status: string;
        installment_id: string | null;
        allocated: string;
      }>(
        `SELECT i.id,i.invoice_status,i.installment_id,COALESCE(a.net,0) AS allocated FROM invoices i LEFT JOIN LATERAL(SELECT COALESCE(sum(pa.allocated_amount),0)-COALESCE(sum(pra.reversed_amount),0) AS net FROM payment_allocations pa LEFT JOIN payment_reversal_allocations pra ON pra.original_allocation_id=pa.id WHERE pa.invoice_id=i.id)a ON true WHERE i.id=$1 AND i.property_id=$2 FOR UPDATE OF i`,
        [invoiceId, dto.property_id],
      );
      const row = invoice.rows[0];
      if (!row)
        throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
      if (
        !['draft', 'issued', 'overdue'].includes(row.invoice_status) ||
        this.money(row.allocated) !== 0
      )
        throw new ConflictException({
          code: 'INVOICE_NOT_VOIDABLE',
          message: 'Invoice with payment activity cannot be voided',
        });
      await client.query(
        `UPDATE invoices SET invoice_status='void',voided_at=now(),voided_by_user_id=$2,void_reason=$3,updated_at=now() WHERE id=$1`,
        [invoiceId, user.id, dto.reason.trim()],
      );
      if (row.installment_id)
        await client.query(
          `UPDATE lease_installments SET installment_status='void' WHERE id=$1 AND invoice_id=$2`,
          [row.installment_id, invoiceId],
        );
      const result = { invoice_id: invoiceId, invoice_status: 'void' as const };
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: 'billing.invoice_voided',
          resourceType: 'invoice',
          resourceId: invoiceId,
          afterData: { ...result, reason: dto.reason.trim() },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.event(
        client,
        dto.property_id,
        `invoice.voided:${invoiceId}`,
        'invoice.voided',
        'invoice',
        invoiceId,
        user.id,
        context,
        result,
      );
      await this.complete(
        client,
        user.id,
        route,
        idempotencyKey,
        result,
        'invoice',
        invoiceId,
        200,
      );
      return { data: result };
    });
  }

  async paymentDetail(user: UserAccessContext, propertyId: string, paymentId: string) {
    await this.properties.assertCanReadProperty(user, propertyId);
    const result = await this.database.client.query<PaymentProjectionRow>(
      `SELECT p.id,p.payment_code,p.payment_method,p.payment_status,p.payment_purpose,p.amount,p.paid_at,p.verified_at,p.reference_number,p.notes,r.id AS reversal_id,receipt.id AS receipt_id,COALESCE(jsonb_agg(jsonb_build_object('invoice_id',pa.invoice_id,'amount',pa.allocated_amount)) FILTER(WHERE pa.id IS NOT NULL),'[]'::jsonb) AS allocations FROM payments p LEFT JOIN payment_reversals r ON r.payment_id=p.id LEFT JOIN payment_receipts receipt ON receipt.payment_id=p.id AND receipt.receipt_kind='payment' LEFT JOIN payment_allocations pa ON pa.payment_id=p.id WHERE p.id=$1 AND p.property_id=$2 GROUP BY p.id,r.id,receipt.id`,
      [paymentId, propertyId],
    );
    if (!result.rows[0])
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' });
    return { data: this.sanitizePaymentDetail(result.rows[0]) };
  }

  async receipt(user: UserAccessContext, propertyId: string, receiptId: string) {
    await this.properties.assertCanReadProperty(user, propertyId);
    const result = await this.database.client.query<{
      id: string;
      receipt_code: string;
      receipt_kind: string;
      amount: string;
      issued_at: Date;
      safe_snapshot: Record<string, unknown>;
    }>(
      `SELECT id,receipt_code,receipt_kind,amount,issued_at,safe_snapshot FROM payment_receipts WHERE id=$1 AND property_id=$2`,
      [receiptId, propertyId],
    );
    if (!result.rows[0])
      throw new NotFoundException({ code: 'RECEIPT_NOT_FOUND', message: 'Receipt not found' });
    const row = result.rows[0];
    return {
      data: {
        id: row.id,
        receipt_code: row.receipt_code,
        receipt_kind: row.receipt_kind,
        amount: this.money(row.amount),
        issued_at: row.issued_at.toISOString(),
        snapshot: row.safe_snapshot,
      },
    };
  }

  async receiptDocument(
    user: UserAccessContext,
    propertyId: string,
    receiptId: string,
  ): Promise<BillingReceiptDocument> {
    await this.properties.assertCanReadProperty(user, propertyId);
    const result = await this.database.client.query<ReceiptDocumentRow>(
      `SELECT receipt.receipt_code,receipt.amount,receipt.issued_at,
              payment.payment_code,payment.payment_method,payment.payment_purpose,payment.paid_at,
              resident.full_name AS resident_name,room.number AS room_number,
              COALESCE(jsonb_agg(jsonb_build_object(
                'invoice_code',invoice.invoice_code,'amount',allocation.allocated_amount
              ) ORDER BY invoice.invoice_code) FILTER(WHERE allocation.id IS NOT NULL),'[]'::jsonb) AS allocations
       FROM payment_receipts receipt
       JOIN payments payment ON payment.id=receipt.payment_id AND payment.property_id=receipt.property_id
       JOIN residents resident ON resident.id=payment.resident_id AND resident.property_id=payment.property_id
       JOIN leases lease ON lease.id=payment.lease_id AND lease.property_id=payment.property_id
       JOIN rooms room ON room.id=lease.room_id AND room.property_id=payment.property_id
       LEFT JOIN payment_allocations allocation ON allocation.payment_id=payment.id
       LEFT JOIN invoices invoice ON invoice.id=allocation.invoice_id AND invoice.property_id=payment.property_id
       WHERE receipt.id=$1 AND receipt.property_id=$2 AND receipt.receipt_kind='payment'
       GROUP BY receipt.id,payment.id,resident.id,room.id`,
      [receiptId, propertyId],
    );
    const row = result.rows[0];
    if (!row)
      throw new NotFoundException({
        code: 'RECEIPT_DOCUMENT_NOT_FOUND',
        message: 'Receipt document not found',
      });
    return createBillingReceiptPdf({
      receiptCode: row.receipt_code,
      paymentCode: row.payment_code,
      paymentMethod: row.payment_method,
      paymentPurpose: row.payment_purpose,
      residentName: row.resident_name,
      roomNumber: row.room_number,
      amount: this.money(row.amount),
      paidAt: row.paid_at,
      issuedAt: row.issued_at,
      allocations: (Array.isArray(row.allocations) ? row.allocations : []).map((allocation) => ({
        invoiceCode: allocation.invoice_code,
        amount: this.money(allocation.amount),
      })),
    });
  }

  async invoiceDocument(
    user: UserAccessContext,
    propertyId: string,
    invoiceId: string,
  ): Promise<BillingInvoiceDocument> {
    await this.properties.assertCanReadProperty(user, propertyId);
    const result = await this.database.client.query<InvoiceDocumentRow>(
      `${this.invoiceDocumentSql()}
       WHERE invoice.id=$1 AND invoice.property_id=$2
         AND invoice.lease_id IS NOT NULL AND invoice.invoice_status<>'draft'`,
      [invoiceId, propertyId],
    );
    if (result.rows.length !== 1)
      throw new NotFoundException({
        code: 'INVOICE_DOCUMENT_NOT_FOUND',
        message: 'Invoice document not found',
      });
    return this.renderInvoiceDocument(result.rows[0]);
  }

  async myInvoiceDocument(
    user: UserAccessContext,
    invoiceId: string,
  ): Promise<BillingInvoiceDocument> {
    const result = await this.database.client.query<InvoiceDocumentRow>(
      `${this.invoiceDocumentSql()}
       JOIN residents resident ON resident.id=invoice.resident_id AND resident.property_id=invoice.property_id
       JOIN property_memberships membership ON membership.property_id=invoice.property_id
         AND membership.user_id=$2 AND membership.membership_status='active'
       WHERE invoice.id=$1 AND resident.user_id=$2
         AND invoice.lease_id IS NOT NULL AND invoice.invoice_status<>'draft'`,
      [invoiceId, user.id],
    );
    if (result.rows.length !== 1)
      throw new NotFoundException({
        code: 'INVOICE_DOCUMENT_NOT_FOUND',
        message: 'Invoice document not found',
      });
    return this.renderInvoiceDocument(result.rows[0]);
  }

  private async projectResidentBilling(
    client: { query: PoolClient['query'] },
    lease: LeaseTupleRow,
    view: 'admin' | 'self',
  ) {
    const [invoiceResult, paymentResult, proofResult, installmentResult, settlementResult] =
      await Promise.all([
        client.query<InvoiceProjectionRow>(
          `SELECT i.id,i.invoice_code,i.invoice_status,i.invoice_purpose,i.total_amount,i.due_date::text,COALESCE(i.cycle_start_date,i.snapshot_period_start_date)::text AS coverage_start,COALESCE(i.cycle_end_date,i.snapshot_period_end_date)::text AS coverage_end,GREATEST(i.total_amount-i.credit_amount-COALESCE(a.net,0),0) AS outstanding_amount FROM invoices i LEFT JOIN LATERAL(SELECT COALESCE(sum(pa.allocated_amount),0)-COALESCE(sum(pra.reversed_amount),0) AS net FROM payment_allocations pa LEFT JOIN payment_reversal_allocations pra ON pra.original_allocation_id=pa.id WHERE pa.invoice_id=i.id)a ON true WHERE i.property_id=$1 AND i.lease_id=$2 ORDER BY i.due_date DESC,i.id DESC`,
          [lease.property_id, lease.id],
        ),
        client.query<PaymentProjectionRow>(
          `SELECT p.id,p.payment_code,p.payment_method,p.payment_status,p.payment_purpose,p.amount,p.paid_at,p.verified_at,r.id AS reversal_id,receipt.id AS receipt_id,COALESCE(jsonb_agg(jsonb_build_object('invoice_id',pa.invoice_id,'amount',pa.allocated_amount)) FILTER(WHERE pa.id IS NOT NULL),'[]'::jsonb) AS allocations FROM payments p LEFT JOIN payment_reversals r ON r.payment_id=p.id LEFT JOIN payment_receipts receipt ON receipt.payment_id=p.id AND receipt.receipt_kind='payment' LEFT JOIN payment_allocations pa ON pa.payment_id=p.id WHERE p.property_id=$1 AND p.lease_id=$2 AND p.authority_source IN ('manual_transfer','audited_cash') GROUP BY p.id,r.id,receipt.id ORDER BY p.paid_at DESC,p.id DESC`,
          [lease.property_id, lease.id],
        ),
        client.query<ProofProjectionRow>(
          `SELECT pp.id,pp.invoice_id,pp.proof_status,pp.claimed_amount,pp.payment_purpose,pp.uploaded_at,pp.reviewed_at,pp.reject_reason FROM payment_proofs pp WHERE pp.property_id=$1 AND COALESCE(pp.lease_id,$2)=$2 AND pp.resident_id=$3 ORDER BY pp.uploaded_at DESC`,
          [lease.property_id, lease.id, lease.resident_id],
        ),
        client.query<{ total: string; paid: string; next_due: string | null }>(
          `SELECT count(*) AS total,count(*) FILTER(WHERE installment_status='paid') AS paid,(min(due_date) FILTER(WHERE installment_status IN('scheduled','issued','partially_paid')))::text AS next_due FROM lease_installments WHERE property_id=$1 AND lease_id=$2`,
          [lease.property_id, lease.id],
        ),
        client.query<ContractSettlementProjectionRow>(
          `SELECT settlement.id,settlement.state,settlement.invoice_id,
                settlement.activated_at,settlement.original_due_at,
                settlement.extension_due_at,settlement.extension_reason,
                invoice.total_amount,invoice.credit_amount,
                COALESCE(allocation.net,0) AS allocated_amount,
                COALESCE(initial_payment.net,0) AS initial_payment_allocated,
                COALESCE(offsets.amount,0) AS deposit_offset_amount,
                termination.id AS termination_case_id,termination.status AS termination_status,
                termination.planned_checkout_date::text AS planned_checkout_date
           FROM lease_contract_settlements settlement
           JOIN invoices invoice ON invoice.id=settlement.invoice_id
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(payment_allocation.allocated_amount),0)
                      - COALESCE(sum(reversal_allocation.reversed_amount),0) AS net
               FROM payment_allocations payment_allocation
               LEFT JOIN payment_reversal_allocations reversal_allocation
                 ON reversal_allocation.original_allocation_id=payment_allocation.id
              WHERE payment_allocation.invoice_id=invoice.id
           ) allocation ON true
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(payment_allocation.allocated_amount) FILTER (WHERE payment.payment_code LIKE 'PAY-ONB-%'),0)
                      - COALESCE(sum(reversal_allocation.reversed_amount) FILTER (WHERE payment.payment_code LIKE 'PAY-ONB-%'),0) AS net
               FROM payment_allocations payment_allocation
               JOIN payments payment ON payment.id=payment_allocation.payment_id
               LEFT JOIN payment_reversal_allocations reversal_allocation
                 ON reversal_allocation.original_allocation_id=payment_allocation.id
              WHERE payment_allocation.invoice_id=invoice.id
           ) initial_payment ON true
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(amount),0) AS amount
               FROM contract_settlement_deposit_offsets
              WHERE settlement_id=settlement.id
           ) offsets ON true
           LEFT JOIN lease_termination_cases termination
             ON termination.settlement_id=settlement.id AND termination.status='pending'
          WHERE settlement.property_id=$1 AND settlement.lease_id=$2`,
          [lease.property_id, lease.id],
        ),
      ]);
    const invoices = invoiceResult.rows.map((row) => this.sanitizeInvoice(row));
    const payments = paymentResult.rows.map((row) => this.sanitizePaymentDetail(row));
    const deposit = await this.depositProjection(client, lease);
    const rentInvoiced = invoices
      .filter((row) => row.invoice_purpose === 'rent')
      .reduce((sum, row) => sum + row.total_amount, 0);
    const rentOutstanding = invoices
      .filter((row) => row.invoice_purpose === 'rent')
      .reduce((sum, row) => sum + row.outstanding_amount, 0);
    const progress = installmentResult.rows[0] ?? { total: '0', paid: '0', next_due: null };
    const settlement = settlementResult.rows[0] ?? null;
    const contractSettlement = settlement ? this.projectContractSettlement(settlement) : null;
    return {
      lease: {
        id: lease.id,
        ...(view === 'admin'
          ? { resident_id: lease.resident_id }
          : { property_id: lease.property_id }),
        status: lease.lease_status,
        start_date: lease.start_date,
        end_date: lease.end_date,
        payment_plan: lease.payment_plan_type,
        contract_rent: this.money(lease.contract_rent_amount),
        monthly_rate: this.money(lease.snapshot_monthly_price),
        remaining_days: Math.max(0, Number(lease.remaining_days)),
        note: 'DP adalah kredit sewa; deposit keamanan adalah liabilitas terpisah dan tidak dihitung sebagai sewa.',
      },
      summary: {
        rent_invoiced: rentInvoiced,
        rent_paid: rentInvoiced - rentOutstanding,
        rent_outstanding: rentOutstanding,
        security_deposit_required: this.money(lease.security_deposit_required_amount),
        deposit_collected: deposit.collected,
        deposit_deducted: deposit.deducted,
        deposit_refunded: deposit.refunded,
        deposit_balance: deposit.balance,
        installment_paid: Number(progress.paid),
        installment_total: Number(progress.total),
        next_due_date: progress.next_due,
        overdue_count: invoices.filter(
          (row) => row.invoice_status === 'overdue' && row.outstanding_amount > 0,
        ).length,
      },
      contract_settlement: contractSettlement,
      invoices,
      payments,
      proofs: proofResult.rows.map((row) => ({
        id: row.id,
        invoice_id: row.invoice_id,
        proof_status: row.proof_status,
        claimed_amount: this.money(row.claimed_amount),
        payment_purpose: row.payment_purpose,
        uploaded_at: row.uploaded_at.toISOString(),
        reviewed_at: row.reviewed_at?.toISOString() ?? null,
        reject_reason: row.reject_reason,
      })),
    };
  }

  private invoiceDocumentSql() {
    return `SELECT invoice.invoice_code,invoice.invoice_status,invoice.invoice_purpose,
                   invoice.snapshot_resident_name,invoice.snapshot_room_number,
                   invoice.snapshot_building_code,
                   COALESCE(invoice.cycle_start_date,invoice.snapshot_period_start_date)::text AS coverage_start,
                   COALESCE(invoice.cycle_end_date,invoice.snapshot_period_end_date)::text AS coverage_end,
                   invoice.due_date::text,invoice.total_amount,invoice.issued_at,
                   GREATEST(invoice.total_amount-invoice.credit_amount-COALESCE(allocation.net,0),0) AS outstanding_amount
              FROM invoices invoice
              LEFT JOIN LATERAL (
                SELECT COALESCE(sum(payment_allocation.allocated_amount),0)
                       - COALESCE(sum(reversal_allocation.reversed_amount),0) AS net
                  FROM payment_allocations payment_allocation
                  LEFT JOIN payment_reversal_allocations reversal_allocation
                    ON reversal_allocation.original_allocation_id=payment_allocation.id
                 WHERE payment_allocation.invoice_id=invoice.id
              ) allocation ON true`;
  }

  private renderInvoiceDocument(row: InvoiceDocumentRow): BillingInvoiceDocument {
    return createBillingInvoicePdf({
      invoiceCode: row.invoice_code,
      invoiceStatus: this.publicInvoiceStatus(row.invoice_status),
      invoicePurpose: row.invoice_purpose,
      residentName: row.snapshot_resident_name,
      roomNumber: row.snapshot_room_number,
      buildingCode: row.snapshot_building_code,
      coverageStart: row.coverage_start,
      coverageEnd: row.coverage_end,
      dueDate: row.due_date,
      totalAmount: this.money(row.total_amount),
      outstandingAmount: this.money(row.outstanding_amount),
      issuedAt: row.issued_at,
    });
  }

  /**
   * Contract settlement is an authority on top of the ordinary allocation
   * ledger. It never changes the allocation rules; it decides whether a new
   * rent/DP allocation is allowed to be partial at this instant.
   */
  private async assertContractSettlementPaymentEligibility(
    client: PoolClient,
    lease: LeaseTupleRow,
    purpose: W06PaymentPurpose,
    allocations: Array<{ invoice_id: string; amount: number }>,
    invoiceRows: InvoiceLockRow[],
  ): Promise<void> {
    if (purpose !== 'rent' && purpose !== 'dp') return;
    const settlementResult = await client.query<ContractSettlementProjectionRow>(
      `SELECT settlement.id,settlement.state,settlement.invoice_id,
              settlement.activated_at,settlement.original_due_at,
              settlement.extension_due_at,settlement.extension_reason,
              invoice.total_amount,invoice.credit_amount,
              COALESCE(allocation.net,0) AS allocated_amount,
              COALESCE(offsets.amount,0) AS deposit_offset_amount,
              termination.id AS termination_case_id,termination.status AS termination_status,
              termination.planned_checkout_date::text AS planned_checkout_date
         FROM lease_contract_settlements settlement
         JOIN invoices invoice
           ON invoice.id=settlement.invoice_id
          AND invoice.property_id=settlement.property_id
          AND invoice.lease_id=settlement.lease_id
         LEFT JOIN LATERAL (
           SELECT COALESCE(sum(payment_allocation.allocated_amount),0)
                    - COALESCE(sum(reversal_allocation.reversed_amount),0) AS net
             FROM payment_allocations payment_allocation
             LEFT JOIN payment_reversal_allocations reversal_allocation
               ON reversal_allocation.original_allocation_id=payment_allocation.id
            WHERE payment_allocation.invoice_id=invoice.id
         ) allocation ON true
         LEFT JOIN LATERAL (
           SELECT COALESCE(sum(amount),0) AS amount
             FROM contract_settlement_deposit_offsets
            WHERE settlement_id=settlement.id
         ) offsets ON true
         LEFT JOIN lease_termination_cases termination
           ON termination.settlement_id=settlement.id AND termination.status='pending'
        WHERE settlement.property_id=$1 AND settlement.lease_id=$2
        FOR UPDATE OF settlement,invoice`,
      [lease.property_id, lease.id],
    );
    if (settlementResult.rows.length > 1)
      throw new ConflictException({
        code: 'CONTRACT_SETTLEMENT_AMBIGUOUS',
        message: 'Contract settlement authority requires reconciliation',
      });
    const settlement = settlementResult.rows[0];
    if (!settlement) return;

    if (
      !allocations.length ||
      allocations.some((item) => item.invoice_id !== settlement.invoice_id)
    )
      throw new ConflictException({
        code: 'CONTRACT_SETTLEMENT_ALLOCATION_SCOPE_INVALID',
        message: 'Rent payment must be allocated only to the contract settlement invoice',
      });
    if (!invoiceRows.some((invoice) => invoice.id === settlement.invoice_id))
      throw new ConflictException({
        code: 'CONTRACT_SETTLEMENT_INVOICE_MISSING',
        message: 'Contract settlement invoice is unavailable',
      });
    if (settlement.state === 'awaiting_activation')
      throw new ConflictException({
        code: 'CONTRACT_SETTLEMENT_NOT_ACTIVE',
        message: 'Contract settlement starts only after room activation',
      });
    if (settlement.state === 'terminated')
      throw new ConflictException({
        code: 'CONTRACT_SETTLEMENT_TERMINATED',
        message: 'A terminated lease cannot receive a contract settlement payment',
      });

    const outstanding = Math.max(
      0,
      this.money(settlement.total_amount) -
        this.money(settlement.credit_amount) -
        this.money(settlement.allocated_amount),
    );
    const requested = allocations.reduce((sum, item) => sum + item.amount, 0);
    if (requested > outstanding)
      throw new UnprocessableEntityException({
        code: 'CONTRACT_SETTLEMENT_AMOUNT_EXCEEDS_BALANCE',
        message: 'Payment amount cannot exceed the remaining contract-rent balance',
        details: { outstanding_amount: outstanding },
      });
    // The ordinary settlement window remains open through D+7. An approved
    // extension replaces that grace window: it expires exactly at the extended
    // deadline and may only be granted once.
    const partialWindowResult = settlement.original_due_at
      ? await client.query<{ passed: boolean }>(
          `SELECT now() > CASE
             WHEN $2::timestamptz IS NULL THEN $1::timestamptz + INTERVAL '7 days'
             ELSE $2::timestamptz
           END AS passed`,
          [settlement.original_due_at, settlement.extension_due_at],
        )
      : null;
    const partialWindowClosed = partialWindowResult?.rows[0]?.passed === true;
    const mustSettleInFull = settlement.termination_status === 'pending' || partialWindowClosed;
    if (mustSettleInFull && requested !== outstanding)
      throw new UnprocessableEntityException({
        code: 'CONTRACT_SETTLEMENT_FULL_PAYMENT_REQUIRED',
        message:
          'After the partial-payment window closes, the remaining contract-rent balance must be paid in full',
        details: { outstanding_amount: outstanding },
      });
  }

  private projectContractSettlement(row: ContractSettlementProjectionRow) {
    const total = this.money(row.total_amount);
    const credit = this.money(row.credit_amount);
    const allocated = this.money(row.allocated_amount);
    const paymentBreakdown = summarizeContractSettlementRentPayments({
      invoiceCreditAmount: credit,
      allocatedAmount: allocated,
      onboardingAllocatedAmount: this.money(row.initial_payment_allocated),
    });
    const depositOffset = this.money(row.deposit_offset_amount);
    const outstanding = Math.max(0, total - credit - allocated);
    const dueAt = row.extension_due_at ?? row.original_due_at;
    const now = Date.now();
    const dueAtTime = dueAt ? new Date(dueAt).getTime() : null;
    const isPaid = outstanding === 0;
    const overdue = Boolean(!isPaid && dueAtTime && now > dueAtTime);
    const partialPaymentDeadlineTime = row.extension_due_at
      ? dueAtTime
      : dueAtTime
        ? dueAtTime + 7 * 24 * 60 * 60 * 1000
        : null;
    const adminActionRequired = Boolean(
      !isPaid && partialPaymentDeadlineTime && now > partialPaymentDeadlineTime,
    );
    const daysUntilDue = dueAtTime ? Math.ceil((dueAtTime - now) / (24 * 60 * 60 * 1000)) : null;
    const reminderStage =
      daysUntilDue === null || isPaid
        ? null
        : daysUntilDue <= -7
          ? 'D+7'
          : daysUntilDue <= -1
            ? 'D+1'
            : daysUntilDue === 0
              ? 'H-0'
              : daysUntilDue <= 7
                ? 'H-7'
                : daysUntilDue <= 14
                  ? 'H-14'
                  : daysUntilDue <= 30
                    ? 'H-30'
                    : null;
    const status = isPaid
      ? 'paid'
      : row.termination_status === 'pending'
        ? 'termination_pending'
        : adminActionRequired
          ? 'admin_action_required'
          : overdue
            ? 'overdue'
            : row.extension_due_at
              ? 'extended'
              : row.state;
    const finalDeadlinePassed = adminActionRequired;
    return {
      id: row.id,
      invoice_id: row.invoice_id,
      status,
      activated_at: row.activated_at?.toISOString() ?? null,
      original_due_at: row.original_due_at?.toISOString() ?? null,
      extension_due_at: row.extension_due_at?.toISOString() ?? null,
      extension_reason: row.extension_reason,
      effective_due_at: dueAt?.toISOString() ?? null,
      contract_rent_amount: total,
      initial_rent_credit: paymentBreakdown.initialRentCredit,
      payment_allocated: paymentBreakdown.additionalRentPayments,
      deposit_offset_amount: depositOffset,
      outstanding_amount: outstanding,
      reminder_stage: reminderStage,
      admin_action_required: adminActionRequired,
      partial_payment_allowed:
        !isPaid && row.termination_status !== 'pending' && !finalDeadlinePassed,
      full_payment_required:
        !isPaid && (row.termination_status === 'pending' || finalDeadlinePassed),
      extension_available:
        !isPaid && !row.extension_due_at && overdue && row.termination_status !== 'pending',
      termination_case: row.termination_case_id
        ? {
            id: row.termination_case_id,
            status: row.termination_status,
            planned_checkout_date: row.planned_checkout_date,
          }
        : null,
    };
  }

  private async lockAndValidateInvoices(
    client: PoolClient,
    lease: LeaseTupleRow,
    allocations: Array<{ invoice_id: string; amount: number }>,
    purpose: W06PaymentPurpose,
  ): Promise<InvoiceLockRow[]> {
    if (!allocations.length) return [];
    const ids = [...new Set(allocations.map((item) => item.invoice_id))].sort();
    if (ids.length !== allocations.length)
      throw new BadRequestException({
        code: 'PAYMENT_ALLOCATION_DUPLICATE',
        message: 'Invoice allocations must be unique',
      });
    const result = await client.query<InvoiceLockRow>(
      `SELECT i.id,i.property_id,i.resident_id,i.lease_id,i.invoice_status,i.invoice_purpose,i.due_date::text,i.total_amount,i.credit_amount,COALESCE(a.net,0) AS allocated_amount FROM invoices i LEFT JOIN LATERAL(SELECT COALESCE(sum(pa.allocated_amount),0)-COALESCE(sum(pra.reversed_amount),0) AS net FROM payment_allocations pa LEFT JOIN payment_reversal_allocations pra ON pra.original_allocation_id=pa.id WHERE pa.invoice_id=i.id)a ON true WHERE i.id=ANY($1::uuid[]) ORDER BY i.id FOR UPDATE OF i`,
      [ids],
    );
    if (result.rows.length !== ids.length)
      throw new ConflictException({
        code: 'PAYMENT_INVOICE_SCOPE_MISMATCH',
        message: 'One or more invoices are unavailable',
      });
    const requested = new Map(allocations.map((item) => [item.invoice_id, item.amount]));
    for (const invoice of result.rows) {
      if (
        invoice.property_id !== lease.property_id ||
        invoice.resident_id !== lease.resident_id ||
        invoice.lease_id !== lease.id
      )
        throw new ConflictException({
          code: 'PAYMENT_INVOICE_SCOPE_MISMATCH',
          message: 'Invoice does not belong to the selected lease',
        });
      if (['paid', 'void', 'draft'].includes(invoice.invoice_status))
        throw new ConflictException({
          code: 'PAYMENT_INVOICE_NOT_ELIGIBLE',
          message: 'Invoice cannot receive an allocation',
        });
      const expectedPurpose = purpose === 'other_charge' ? 'other_charge' : 'rent';
      if (invoice.invoice_purpose !== expectedPurpose)
        throw new ConflictException({
          code: 'PAYMENT_PURPOSE_MISMATCH',
          message: 'Payment purpose does not match invoice authority',
        });
      const outstanding =
        this.money(invoice.total_amount) -
        this.money(invoice.credit_amount) -
        this.money(invoice.allocated_amount);
      const requestedAmount = requested.get(invoice.id)!;
      if (requestedAmount > outstanding)
        throw new UnprocessableEntityException({
          code: 'PAYMENT_OVER_ALLOCATION',
          message: 'Allocation exceeds current invoice outstanding',
        });
    }
    if (purpose === 'dp') {
      const oldest = await client.query<{ id: string }>(
        `SELECT i.id FROM invoices i LEFT JOIN LATERAL(SELECT COALESCE(sum(pa.allocated_amount),0)-COALESCE(sum(pra.reversed_amount),0) AS net FROM payment_allocations pa LEFT JOIN payment_reversal_allocations pra ON pra.original_allocation_id=pa.id WHERE pa.invoice_id=i.id)a ON true WHERE i.property_id=$1 AND i.lease_id=$2 AND i.invoice_purpose='rent' AND i.invoice_status IN('issued','partially_paid','overdue') AND i.total_amount-i.credit_amount-COALESCE(a.net,0)>0 ORDER BY i.due_date,i.id LIMIT $3`,
        [lease.property_id, lease.id, ids.length],
      );
      const requestedOrder = result.rows
        .slice()
        .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id))
        .map((row) => row.id);
      if (oldest.rows.map((row) => row.id).join(',') !== requestedOrder.join(','))
        throw new ConflictException({
          code: 'DP_ALLOCATION_ORDER_INVALID',
          message: 'DP must allocate to oldest outstanding rent invoices first',
        });
    }
    return result.rows;
  }

  private async oldestRentAllocations(client: PoolClient, lease: LeaseTupleRow, amount: number) {
    const result = await client.query<{ id: string; outstanding: string }>(
      `SELECT i.id,GREATEST(i.total_amount-i.credit_amount-COALESCE(a.net,0),0) AS outstanding FROM invoices i LEFT JOIN LATERAL(SELECT COALESCE(sum(pa.allocated_amount),0)-COALESCE(sum(pra.reversed_amount),0) AS net FROM payment_allocations pa LEFT JOIN payment_reversal_allocations pra ON pra.original_allocation_id=pa.id WHERE pa.invoice_id=i.id)a ON true WHERE i.property_id=$1 AND i.lease_id=$2 AND i.resident_id=$3 AND i.invoice_purpose='rent' AND i.invoice_status IN('issued','partially_paid','overdue') AND i.total_amount-i.credit_amount-COALESCE(a.net,0)>0 ORDER BY i.due_date,i.id FOR UPDATE OF i`,
      [lease.property_id, lease.id, lease.resident_id],
    );
    let remaining = amount;
    const allocations: Array<{ invoice_id: string; amount: number }> = [];
    for (const invoice of result.rows) {
      if (remaining === 0) break;
      const allocated = Math.min(remaining, this.money(invoice.outstanding));
      allocations.push({ invoice_id: invoice.id, amount: allocated });
      remaining -= allocated;
    }
    if (remaining !== 0)
      throw new UnprocessableEntityException({
        code: 'PAYMENT_OVERPAYMENT',
        message: 'Payment exceeds outstanding rent',
      });
    return allocations;
  }

  private async applyVerifiedEffects(
    client: PoolClient,
    payment: PaymentRow,
    lease: LeaseTupleRow,
    invoices: InvoiceLockRow[],
    actorId: string,
  ): Promise<string> {
    const receiptAllocations: Array<{ invoice_id: string; amount: number }> = [];
    if (payment.payment_purpose === 'security_deposit') {
      const balance = await this.depositBalance(client, lease.id);
      const amount = this.money(payment.amount);
      const required = this.money(lease.security_deposit_required_amount);
      if (required > 0 && balance + amount > required)
        throw new UnprocessableEntityException({
          code: 'DEPOSIT_OVERPAYMENT',
          message: 'Security deposit exceeds the frozen lease requirement',
        });
      await client.query(
        `INSERT INTO lease_deposit_transactions(property_id,lease_id,transaction_type,direction,amount,payment_id,reason_type,reason,settlement_status,settled_at,settled_by_user_id,metadata,created_by_user_id) VALUES($1,$2,CASE WHEN $3=0 THEN 'collection' ELSE 'top_up' END,'credit',$4,$5,'w06_verified_payment','Verified security-deposit funding','settled',now(),$6,$7::jsonb,$6)`,
        [
          lease.property_id,
          lease.id,
          balance,
          payment.amount,
          payment.id,
          actorId,
          JSON.stringify({ source: 'w06_manual_payment' }),
        ],
      );
    } else {
      const intents = await this.lockIntents(client, payment.id);
      const byInvoice = new Map(intents.map((item) => [item.invoice_id, item.intended_amount]));
      for (const invoice of invoices) {
        const amount = byInvoice.get(invoice.id);
        if (!amount)
          throw new ConflictException({
            code: 'PAYMENT_ALLOCATION_INTENT_MISSING',
            message: 'Payment allocation intent is missing',
          });
        await client.query(
          `INSERT INTO payment_allocations(payment_id,target_type,target_id,invoice_id,allocated_amount,lease_id,allocation_purpose) VALUES($1,'invoice',$2,$2,$3,$4,$5)`,
          [payment.id, invoice.id, amount, lease.id, payment.payment_purpose],
        );
        receiptAllocations.push({ invoice_id: invoice.id, amount: this.money(amount) });
        await this.refreshInvoiceStatus(client, invoice.id);
      }
    }
    await this.syncOnboardingFinancialProjection(client, lease);
    return this.insertReceipt(
      client,
      lease.property_id,
      payment.id,
      'payment',
      this.money(payment.amount),
      actorId,
      {
        payment_code: payment.payment_code,
        payment_method: payment.payment_method,
        payment_purpose: payment.payment_purpose,
        lease_id: lease.id,
        allocations: receiptAllocations,
      },
    );
  }

  private async refreshInvoiceStatus(client: PoolClient, invoiceId: string) {
    await client.query(
      `UPDATE invoices i
          SET invoice_status=CASE
                WHEN GREATEST(i.total_amount-i.credit_amount-COALESCE(a.net,0),0)=0 THEN 'paid'
                WHEN COALESCE(a.net,0)>0 THEN 'partially_paid'
                WHEN settlement.id IS NOT NULL
                  AND settlement.activated_at IS NOT NULL
                  AND COALESCE(settlement.extension_due_at,settlement.original_due_at)<now()
                  THEN 'overdue'
                WHEN settlement.id IS NULL
                  AND i.due_date<(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
                  THEN 'overdue'
                ELSE 'issued'
              END,
              paid_at=CASE WHEN GREATEST(i.total_amount-i.credit_amount-COALESCE(a.net,0),0)=0 THEN now() ELSE NULL END,
              updated_at=now()
         FROM (
           SELECT COALESCE(sum(pa.allocated_amount),0)-COALESCE(sum(pra.reversed_amount),0) AS net
             FROM payment_allocations pa
             LEFT JOIN payment_reversal_allocations pra ON pra.original_allocation_id=pa.id
            WHERE pa.invoice_id=$1
         ) a
         LEFT JOIN lease_contract_settlements settlement ON settlement.invoice_id=$1
        WHERE i.id=$1 AND i.invoice_status<>'void'`,
      [invoiceId],
    );
    await client.query(
      `UPDATE lease_installments installment SET installment_status=CASE invoice.invoice_status WHEN 'paid' THEN 'paid' WHEN 'partially_paid' THEN 'partially_paid' WHEN 'void' THEN 'void' ELSE 'issued' END FROM invoices invoice WHERE invoice.id=$1 AND installment.invoice_id=invoice.id`,
      [invoiceId],
    );
    // A normal fully paid settlement is closed automatically. A pending
    // termination deliberately remains pending until an admin records the
    // cancellation reason, preserving that operational audit trail.
    await client.query(
      `UPDATE lease_contract_settlements settlement
          SET state='paid',updated_at=now()
        WHERE settlement.invoice_id=$1
          AND settlement.state='open'
          AND NOT EXISTS (
            SELECT 1 FROM invoices invoice
            LEFT JOIN LATERAL (
              SELECT COALESCE(sum(payment_allocation.allocated_amount),0)
                       - COALESCE(sum(reversal_allocation.reversed_amount),0) AS net
                FROM payment_allocations payment_allocation
                LEFT JOIN payment_reversal_allocations reversal_allocation
                  ON reversal_allocation.original_allocation_id=payment_allocation.id
               WHERE payment_allocation.invoice_id=invoice.id
            ) allocation ON true
            WHERE invoice.id=$1
              AND GREATEST(invoice.total_amount-invoice.credit_amount-COALESCE(allocation.net,0),0)>0
          )`,
      [invoiceId],
    );
  }

  /** Keep the legacy W05 commitment amounts as a read model of verified W06 ledger state. */
  private async syncOnboardingFinancialProjection(client: PoolClient, lease: LeaseTupleRow) {
    await client.query(
      `UPDATE onboarding_commitments commitment
       SET dp_verified_amount=COALESCE((
             SELECT sum(payment.amount)
             FROM payments payment
             LEFT JOIN payment_reversals reversal ON reversal.payment_id=payment.id
             WHERE payment.property_id=commitment.property_id
               AND payment.lease_id=commitment.lease_id
               AND payment.payment_purpose='dp'
               AND payment.payment_status='verified'
               AND reversal.id IS NULL
               AND EXISTS (SELECT 1 FROM payment_allocations allocation WHERE allocation.payment_id=payment.id)
           ),0),
           security_deposit_funded_amount=COALESCE((
             SELECT sum(CASE ledger.direction WHEN 'credit' THEN ledger.amount ELSE -ledger.amount END)
             FROM lease_deposit_transactions ledger
             WHERE ledger.property_id=commitment.property_id
               AND ledger.lease_id=commitment.lease_id
           ),0),
           updated_at=now()
       WHERE commitment.property_id=$1 AND commitment.lease_id=$2`,
      [lease.property_id, lease.id],
    );
  }

  private async lockLeaseTuple(
    client: PoolClient,
    propertyId: string,
    leaseId: string,
    residentId: string,
  ) {
    const result = await client.query<LeaseTupleRow>(
      `${this.leaseTupleSql()} WHERE l.id=$1 AND l.property_id=$2 AND l.resident_id=$3 FOR UPDATE OF l,resident,room,building`,
      [leaseId, propertyId, residentId],
    );
    if (!result.rows[0])
      throw new NotFoundException({
        code: 'LEASE_BILLING_SCOPE_NOT_FOUND',
        message: 'Lease billing context not found',
      });
    if (!['awaiting_activation', 'active'].includes(result.rows[0].lease_status))
      throw new ConflictException({
        code: 'LEASE_BILLING_STATUS_INVALID',
        message: 'Lease cannot accept billing activity',
      });
    return result.rows[0];
  }
  private leaseTupleSql() {
    return `SELECT l.id,l.property_id,l.resident_id,l.room_id,l.occupancy_id,l.lease_status,l.start_date::text,l.end_date::text,l.contract_rent_amount,l.dp_required_amount,l.security_deposit_required_amount,l.payment_plan_type,l.snapshot_monthly_price,l.snapshot_room_number,l.snapshot_kost_type_name,building.building_code,resident.full_name AS resident_name,GREATEST(l.end_date-(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date,0) AS remaining_days FROM leases l JOIN residents resident ON resident.id=l.resident_id AND resident.property_id=l.property_id JOIN rooms room ON room.id=l.room_id AND room.property_id=l.property_id JOIN room_buildings building ON building.id=room.building_id AND building.property_id=l.property_id`;
  }
  private async lockProperty(client: PoolClient, propertyId: string) {
    const result = await client.query(`SELECT id FROM properties WHERE id=$1 FOR UPDATE`, [
      propertyId,
    ]);
    if (!result.rowCount)
      throw new NotFoundException({ code: 'PROPERTY_NOT_FOUND', message: 'Property not found' });
  }
  private async lockIntents(client: PoolClient, paymentId: string) {
    const result = await client.query<AllocationIntentRow>(
      `SELECT invoice_id,intended_amount FROM payment_allocation_intents WHERE payment_id=$1 ORDER BY invoice_id FOR UPDATE`,
      [paymentId],
    );
    return result.rows;
  }
  private async insertIntents(
    client: PoolClient,
    payment: PaymentRow,
    allocations: Array<{ invoice_id: string; amount: number }>,
  ) {
    for (const allocation of allocations
      .slice()
      .sort((a, b) => a.invoice_id.localeCompare(b.invoice_id)))
      await client.query(
        `INSERT INTO payment_allocation_intents(property_id,payment_id,lease_id,invoice_id,intended_amount) VALUES($1,$2,$3,$4,$5)`,
        [
          payment.property_id,
          payment.id,
          payment.lease_id,
          allocation.invoice_id,
          allocation.amount,
        ],
      );
  }
  private async validateEvidence(
    client: PoolClient,
    fileIds: string[],
    propertyId: string,
    uploaderId: string,
    required: boolean,
    filePurpose: 'payment_proof' | 'complaint_attachment' = 'payment_proof',
  ) {
    const ids = [...new Set(fileIds)].sort();
    if (ids.length !== fileIds.length)
      throw new BadRequestException({
        code: 'PAYMENT_EVIDENCE_DUPLICATE',
        message: 'Evidence files must be unique',
      });
    if (required && ids.length === 0)
      throw new BadRequestException({
        code: 'TRANSFER_PROOF_REQUIRED',
        message: 'Bank transfer proof is required',
      });
    if (!ids.length) return;
    const files = await client.query<{ id: string }>(
      `SELECT id FROM files WHERE id=ANY($1::uuid[]) AND property_id=$2 AND uploader_user_id=$3 AND file_purpose=$4 AND is_deleted=false AND mime_type IN('image/jpeg','image/png','application/pdf') AND file_size_bytes BETWEEN 1 AND 5242880 ORDER BY id FOR UPDATE`,
      [ids, propertyId, uploaderId, filePurpose],
    );
    if (files.rows.length !== ids.length)
      throw new ConflictException({
        code: 'PAYMENT_EVIDENCE_SCOPE_INVALID',
        message: 'Payment evidence is unavailable',
      });
  }
  private async attachEvidence(
    client: PoolClient,
    paymentId: string,
    propertyId: string,
    fileIds: string[],
    method: string,
    actorId: string,
  ) {
    for (const fileId of fileIds.slice().sort())
      await client.query(
        `INSERT INTO payment_evidence_files(property_id,payment_id,file_id,evidence_kind,created_by_user_id) VALUES($1,$2,$3,$4,$5)`,
        [
          propertyId,
          paymentId,
          fileId,
          method === 'cash' ? 'cash_evidence' : 'transfer_proof',
          actorId,
        ],
      );
  }
  private async depositBalance(client: { query: PoolClient['query'] }, leaseId: string) {
    const result = await client.query<{ balance: string }>(
      `SELECT COALESCE(sum(CASE direction WHEN 'credit' THEN amount ELSE -amount END),0) AS balance FROM lease_deposit_transactions WHERE lease_id=$1`,
      [leaseId],
    );
    const balance = this.money(result.rows[0]?.balance ?? '0');
    if (balance < 0)
      throw new ConflictException({
        code: 'DEPOSIT_LEDGER_NEGATIVE',
        message: 'Deposit ledger requires reconciliation',
      });
    return balance;
  }
  private async depositProjection(client: { query: PoolClient['query'] }, lease: LeaseTupleRow) {
    const result = await client.query<{
      collected: string;
      deducted: string;
      refunded: string;
      balance: string;
    }>(
      `SELECT COALESCE(sum(amount) FILTER(WHERE direction='credit'),0) AS collected,COALESCE(sum(amount) FILTER(WHERE transaction_type='deduction'),0) AS deducted,COALESCE(sum(amount) FILTER(WHERE transaction_type='refund'),0) AS refunded,COALESCE(sum(CASE direction WHEN 'credit' THEN amount ELSE -amount END),0) AS balance FROM lease_deposit_transactions WHERE property_id=$1 AND lease_id=$2`,
      [lease.property_id, lease.id],
    );
    const row = result.rows[0];
    return {
      collected: this.money(row.collected),
      deducted: this.money(row.deducted),
      refunded: this.money(row.refunded),
      balance: this.money(row.balance),
    };
  }
  private async insertReceipt(
    client: PoolClient,
    propertyId: string,
    paymentId: string | null,
    kind: 'payment' | 'reversal',
    amount: number,
    actorId: string,
    snapshot: Record<string, unknown>,
  ) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO payment_receipts(property_id,payment_id,receipt_code,receipt_kind,amount,issued_by_user_id,safe_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id`,
      [
        propertyId,
        paymentId,
        `RCT-${randomUUID().replaceAll('-', '').slice(0, 14).toUpperCase()}`,
        kind,
        amount,
        actorId,
        JSON.stringify(snapshot),
      ],
    );
    return result.rows[0].id;
  }
  private async event(
    client: PoolClient,
    propertyId: string,
    eventKey: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    actorId: string,
    context: RequestAuditContext,
    payload: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,correlation_id,actor_user_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        propertyId,
        eventKey,
        eventType,
        aggregateType,
        aggregateId,
        context.correlationId ?? null,
        actorId,
        JSON.stringify(payload),
      ],
    );
  }
  private async claim(
    client: PoolClient,
    propertyId: string,
    actorId: string,
    route: string,
    key: string,
    fingerprint: string,
    context: RequestAuditContext,
  ) {
    const inserted = await client.query(
      `INSERT INTO idempotency_commands(property_id,actor_user_id,route,idempotency_key,request_fingerprint,command_status,correlation_id) VALUES($1,$2,$3,$4,$5,'pending',$6) ON CONFLICT(actor_user_id,route,idempotency_key) DO NOTHING RETURNING id`,
      [propertyId, actorId, route, key, fingerprint, context.correlationId ?? null],
    );
    if (inserted.rowCount) return null;
    const existing = await client.query<ReplayRow>(
      `SELECT request_fingerprint,command_status,response_body FROM idempotency_commands WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3 FOR UPDATE`,
      [actorId, route, key],
    );
    const command = existing.rows[0];
    if (!command || command.request_fingerprint !== fingerprint)
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency-Key was used for another command',
      });
    if (command.command_status !== 'succeeded' || !command.response_body)
      throw new ConflictException({
        code: 'IDEMPOTENCY_COMMAND_IN_PROGRESS',
        message: 'Billing command is still in progress',
      });
    return command.response_body.data;
  }
  private async complete(
    client: PoolClient,
    actorId: string,
    route: string,
    key: string,
    result: Record<string, unknown>,
    resourceType: string,
    resourceId: string,
    status: number,
  ) {
    await client.query(
      `UPDATE idempotency_commands SET command_status='succeeded',response_status=$4,response_body=$5::jsonb,resource_type=$6,resource_id=$7,completed_at=now() WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3`,
      [actorId, route, key, status, JSON.stringify({ data: result }), resourceType, resourceId],
    );
  }
  private requireKey(value: string | undefined) {
    const key = value?.trim();
    if (!key || key.length < IDEMPOTENCY_MIN || key.length > IDEMPOTENCY_MAX)
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key is required',
      });
    return key;
  }
  private fingerprint(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
  private paymentCode() {
    return `PAY-${randomUUID().replaceAll('-', '').slice(0, 14).toUpperCase()}`;
  }
  private allocationTotal(allocations: Array<{ amount: number }>) {
    let total = 0n;
    for (const allocation of allocations) {
      if (!Number.isSafeInteger(allocation.amount) || allocation.amount <= 0)
        throw new BadRequestException({
          code: 'PAYMENT_ALLOCATION_INVALID',
          message: 'Allocation amount must be an exact positive integer',
        });
      total += BigInt(allocation.amount);
    }
    return this.money(total.toString());
  }
  private moneyFromUnknown(value: unknown) {
    if (!Number.isSafeInteger(value) || Number(value) <= 0)
      throw new BadRequestException({
        code: 'PAYMENT_AMOUNT_REQUIRED',
        message: 'An exact payment amount is required',
      });
    return Number(value);
  }
  private money(value: string | number) {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(number))
      throw new ConflictException({
        code: 'MONEY_OUT_OF_RANGE',
        message: 'Financial value requires reconciliation',
      });
    return number;
  }
  private safePayment(payment: PaymentRow, receiptId: string | null): SafePaymentResult {
    return {
      payment_id: payment.id,
      payment_code: payment.payment_code,
      payment_status: payment.payment_status,
      payment_purpose: payment.payment_purpose,
      amount: this.money(payment.amount),
      receipt_id: receiptId,
    };
  }
  private sanitizeInvoice(row: InvoiceProjectionRow) {
    return {
      id: row.id,
      invoice_code: row.invoice_code,
      invoice_status: this.publicInvoiceStatus(row.invoice_status),
      invoice_purpose: row.invoice_purpose === 'other_charge' ? 'other_charge' : 'rent',
      total_amount: this.money(row.total_amount),
      outstanding_amount: this.money(row.outstanding_amount),
      due_date: row.due_date,
      coverage_start: row.coverage_start,
      coverage_end: row.coverage_end,
    };
  }
  private sanitizePaymentDetail(row: PaymentProjectionRow) {
    const allocations = Array.isArray(row.allocations)
      ? row.allocations.map((allocation) => {
          return {
            invoice_id: allocation.invoice_id,
            amount: this.money(allocation.amount),
          };
        })
      : [];
    return {
      id: row.id,
      payment_code: row.payment_code,
      payment_method: row.payment_method,
      payment_status: row.reversal_id ? 'reversed' : row.payment_status,
      payment_purpose: row.payment_purpose,
      amount: this.money(row.amount),
      paid_at: row.paid_at?.toISOString() ?? null,
      verified_at: row.verified_at?.toISOString() ?? null,
      reversal_id: row.reversal_id,
      receipt_id: row.receipt_id,
      allocations,
    };
  }
  private sanitizeWorkspacePayment(row: PaymentWorkspaceRow) {
    const payment = this.sanitizePaymentDetail(row);
    return {
      ...payment,
      resident_id: row.resident_id,
      lease_id: row.lease_id,
      resident_name: row.resident_name,
      room_number: row.room_number,
      reference_number: row.reference_number,
      rent_allocation_amount: this.money(row.rent_allocation_amount),
      settles_rent_contract: row.settles_rent_contract === true,
      evidence: (Array.isArray(row.evidence) ? row.evidence : []).map((file) => ({
        id: file.id,
        original_filename: file.original_filename,
        mime_type: file.mime_type,
        file_size_bytes: this.money(file.file_size_bytes),
        content_path: file.content_path,
      })),
    };
  }
  private publicInvoiceStatus(status: string) {
    return status === 'unpaid' ? 'issued' : status;
  }
  private normalizeMonth(value: string | undefined) {
    const month = value ?? new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new BadRequestException({
        code: 'BILLING_MONTH_INVALID',
        message: 'month must use YYYY-MM',
      });
    return `${month}-01`;
  }
}
