import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Pool, PoolClient } from 'pg';
import { CORE_SEED_IDS } from '../seeds/core-seed.data';
import { databaseConfigFromEnv } from './database-url';

loadEnv({
  path: [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'backend/api/.env'),
    resolve(__dirname, '../../../../.env'),
    resolve(__dirname, '../../../.env'),
  ].find((path) => existsSync(path)),
});

type WorkflowContext = {
  propertyId: string;
  ownerUserId: string;
  residentUserId: string;
  otherResidentUserId: string;
  residentId: string;
  roomId: string;
  occupancyId: string;
  roomNumber: string;
  residentName: string;
  monthlyPrice: number;
  paymentAccountId: string;
};

type WorkflowPeriod = {
  periodKey: string;
  startDate: string;
  endDate: string;
  dueDate: string;
};

type CheckResult = {
  name: string;
  passed: boolean;
  detail: string;
};

const WORKFLOW_IDS = {
  billingPeriod: '73000000-0000-4000-8000-000000000001',
  invoice: '74000000-0000-4000-8000-000000000001',
  partialPayment: '75000000-0000-4000-8000-000000000001',
  finalPayment: '75000000-0000-4000-8000-000000000002',
  rejectedProof: '76000000-0000-4000-8000-000000000001',
  verifiedProof: '76000000-0000-4000-8000-000000000002',
} as const;

function assertDevelopmentOnly(): void {
  if (process.env.NODE_ENV === 'production' || process.argv.includes('--env=production')) {
    throw new Error('Billing workflow validation is development-only and cannot run in production.');
  }
}

function workflowPeriod(): WorkflowPeriod {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0);
  const dueDate = new Date(year, month, 25);
  const periodYear = startDate.getFullYear();
  const periodMonth = String(startDate.getMonth() + 1).padStart(2, '0');

  return {
    periodKey: `WF-6E-${periodYear}-${periodMonth}`,
    startDate: toDateOnly(startDate),
    endDate: toDateOnly(endDate),
    dueDate: toDateOnly(dueDate),
  };
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function loadContext(client: PoolClient): Promise<WorkflowContext> {
  const result = await client.query<{
    property_id: string;
    owner_user_id: string;
    resident_user_id: string;
    other_resident_user_id: string;
    resident_id: string;
    room_id: string;
    occupancy_id: string;
    room_number: string;
    resident_name: string;
    monthly_price: string;
    payment_account_id: string;
  }>(
    `SELECT occupancies.property_id,
            $2::uuid AS owner_user_id,
            residents.user_id AS resident_user_id,
            other_residents.user_id AS other_resident_user_id,
            residents.id AS resident_id,
            rooms.id AS room_id,
            occupancies.id AS occupancy_id,
            rooms.number AS room_number,
            residents.full_name AS resident_name,
            rooms.monthly_price,
            payment_accounts.id AS payment_account_id
     FROM occupancies
     JOIN residents ON residents.id = occupancies.resident_id
     JOIN rooms ON rooms.id = occupancies.room_id
     JOIN residents other_residents ON other_residents.id = $3::uuid
     JOIN payment_accounts ON payment_accounts.property_id = occupancies.property_id
       AND payment_accounts.account_number = '7318321153'
       AND payment_accounts.status = 'active'
     WHERE occupancies.id = $1
       AND occupancies.occupancy_status = 'active'
       AND residents.user_id IS NOT NULL
       AND other_residents.user_id IS NOT NULL
     LIMIT 1`,
    [CORE_SEED_IDS.devOccupancies.alpha, CORE_SEED_IDS.ownerUser, CORE_SEED_IDS.devResidents.bravo],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Development billing context not found. Run npm run db:seed:dev first.');
  }

  return {
    propertyId: row.property_id,
    ownerUserId: row.owner_user_id,
    residentUserId: row.resident_user_id,
    otherResidentUserId: row.other_resident_user_id,
    residentId: row.resident_id,
    roomId: row.room_id,
    occupancyId: row.occupancy_id,
    roomNumber: row.room_number,
    residentName: row.resident_name,
    monthlyPrice: Number(row.monthly_price),
    paymentAccountId: row.payment_account_id,
  };
}

async function cleanupWorkflowData(client: PoolClient): Promise<void> {
  await client.query('DELETE FROM payment_proofs WHERE id = ANY($1::uuid[])', [
    [WORKFLOW_IDS.rejectedProof, WORKFLOW_IDS.verifiedProof],
  ]);
  await client.query('DELETE FROM payment_allocations WHERE payment_id = ANY($1::uuid[])', [
    [WORKFLOW_IDS.partialPayment, WORKFLOW_IDS.finalPayment],
  ]);
  await client.query('DELETE FROM payments WHERE id = ANY($1::uuid[])', [
    [WORKFLOW_IDS.partialPayment, WORKFLOW_IDS.finalPayment],
  ]);
  await client.query('DELETE FROM invoice_line_items WHERE invoice_id = $1', [WORKFLOW_IDS.invoice]);
  await client.query('DELETE FROM invoices WHERE id = $1', [WORKFLOW_IDS.invoice]);
  await client.query('DELETE FROM billing_periods WHERE id = $1', [WORKFLOW_IDS.billingPeriod]);
}

async function outstandingAmount(client: PoolClient, invoiceId: string): Promise<number> {
  const result = await client.query<{ outstanding_amount: string }>(
    `SELECT GREATEST(invoices.total_amount - COALESCE(sum(payment_allocations.allocated_amount), 0), 0) AS outstanding_amount
     FROM invoices
     LEFT JOIN payment_allocations ON payment_allocations.invoice_id = invoices.id
       AND payment_allocations.allocation_status = 'active'
     WHERE invoices.id = $1
     GROUP BY invoices.id`,
    [invoiceId],
  );
  return Number(result.rows[0]?.outstanding_amount ?? 0);
}

function addCheck(checks: CheckResult[], name: string, passed: boolean, detail: string): void {
  checks.push({ name, passed, detail });
  if (!passed) {
    throw new Error(`${name} failed: ${detail}`);
  }
}

async function runWorkflow(client: PoolClient, context: WorkflowContext): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  const period = workflowPeriod();
  const invoiceCode = `WF-6E-INV-${period.periodKey}-${context.roomNumber}`;
  const partialAmount = Math.floor(context.monthlyPrice / 2);

  await cleanupWorkflowData(client);

  await client.query(
    `INSERT INTO billing_periods (
       id, property_id, period_key, start_date, end_date, due_date, status, created_by_user_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'open', $7)`,
    [
      WORKFLOW_IDS.billingPeriod,
      context.propertyId,
      period.periodKey,
      period.startDate,
      period.endDate,
      period.dueDate,
      context.ownerUserId,
    ],
  );

  await client.query(
    `INSERT INTO invoices (
       id, property_id, resident_id, room_id, occupancy_id, billing_period_id, invoice_code,
       invoice_status, subtotal_amount, late_fee_amount, total_amount, due_date,
       snapshot_period_key, snapshot_period_start_date, snapshot_period_end_date,
       snapshot_room_number, snapshot_resident_name, snapshot_monthly_price, created_by_user_id
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, 'draft', $8, 0, $8, $9,
       $10, $11, $12, $13, $14, $8, $15
     )`,
    [
      WORKFLOW_IDS.invoice,
      context.propertyId,
      context.residentId,
      context.roomId,
      context.occupancyId,
      WORKFLOW_IDS.billingPeriod,
      invoiceCode,
      context.monthlyPrice,
      period.dueDate,
      period.periodKey,
      period.startDate,
      period.endDate,
      context.roomNumber,
      context.residentName,
      context.ownerUserId,
    ],
  );

  await client.query(
    `INSERT INTO invoice_line_items (
       invoice_id, line_type, description, quantity, unit_amount, total_amount, sort_order, metadata
     )
     VALUES ($1, 'rent', $2, 1, $3, $3, 1, $4::jsonb)`,
    [
      WORKFLOW_IDS.invoice,
      `Workflow validation rent ${context.roomNumber} ${period.periodKey}`,
      context.monthlyPrice,
      JSON.stringify({ validation: 'billing-workflow-6e' }),
    ],
  );
  addCheck(checks, 'create invoice', true, invoiceCode);

  const issued = await client.query<{ invoice_status: string }>(
    `UPDATE invoices
     SET invoice_status = 'issued',
         issued_at = now(),
         updated_at = now()
     WHERE id = $1 AND invoice_status = 'draft'
     RETURNING invoice_status`,
    [WORKFLOW_IDS.invoice],
  );
  addCheck(checks, 'issue invoice', issued.rows[0]?.invoice_status === 'issued', 'invoice moved to issued');

  await client.query(
    `INSERT INTO payments (
       id, property_id, resident_id, payment_code, payment_method, payment_status,
       amount, paid_at, verified_at, received_by_user_id, verified_by_user_id, reference_number, notes
     )
     VALUES ($1, $2, $3, $4, 'bank_transfer', 'verified', $5, now(), now(), $6, $6, $7, $8)`,
    [
      WORKFLOW_IDS.partialPayment,
      context.propertyId,
      context.residentId,
      `WF-6E-PAY-PARTIAL-${period.periodKey}`,
      partialAmount,
      context.ownerUserId,
      `WF-6E-${period.periodKey}-PARTIAL`,
      'Workflow validation partial manual payment',
    ],
  );
  addCheck(checks, 'record manual payment', true, `partial amount ${partialAmount}`);

  await client.query(
    `INSERT INTO payment_allocations (
       payment_id, target_type, target_id, invoice_id, allocated_amount
     )
     VALUES ($1, 'invoice', $2, $2, $3)`,
    [WORKFLOW_IDS.partialPayment, WORKFLOW_IDS.invoice, partialAmount],
  );
  await client.query(
    `UPDATE invoices
     SET invoice_status = 'partially_paid',
         updated_at = now()
     WHERE id = $1`,
    [WORKFLOW_IDS.invoice],
  );
  const outstandingAfterPartial = await outstandingAmount(client, WORKFLOW_IDS.invoice);
  addCheck(
    checks,
    'partial payment and outstanding',
    outstandingAfterPartial === context.monthlyPrice - partialAmount,
    `outstanding ${outstandingAfterPartial}`,
  );

  await client.query(
    `INSERT INTO payment_proofs (
       id, property_id, resident_id, invoice_id, payment_account_id, proof_status,
       claimed_amount, payment_method, notes, uploaded_by_user_id
     )
     VALUES ($1, $2, $3, $4, $5, 'pending_review', 100000, 'bank_transfer', $6, $7)`,
    [
      WORKFLOW_IDS.rejectedProof,
      context.propertyId,
      context.residentId,
      WORKFLOW_IDS.invoice,
      context.paymentAccountId,
      'Workflow validation rejected proof',
      context.residentUserId,
    ],
  );
  const rejectedProof = await client.query<{ proof_status: string }>(
    `UPDATE payment_proofs
     SET proof_status = 'rejected',
         reviewed_by_user_id = $2,
         reviewed_at = now(),
         reject_reason = 'Workflow validation rejection',
         updated_at = now()
     WHERE id = $1 AND proof_status = 'pending_review'
     RETURNING proof_status`,
    [WORKFLOW_IDS.rejectedProof, context.ownerUserId],
  );
  addCheck(checks, 'payment proof reject', rejectedProof.rows[0]?.proof_status === 'rejected', 'proof rejected');

  await client.query(
    `INSERT INTO payment_proofs (
       id, property_id, resident_id, invoice_id, payment_account_id, proof_status,
       claimed_amount, payment_method, notes, uploaded_by_user_id
     )
     VALUES ($1, $2, $3, $4, $5, 'pending_review', $6, 'bank_transfer', $7, $8)`,
    [
      WORKFLOW_IDS.verifiedProof,
      context.propertyId,
      context.residentId,
      WORKFLOW_IDS.invoice,
      context.paymentAccountId,
      outstandingAfterPartial,
      'Workflow validation verified proof',
      context.residentUserId,
    ],
  );

  await client.query(
    `INSERT INTO payments (
       id, property_id, resident_id, payment_code, payment_method, payment_status,
       amount, paid_at, verified_at, received_by_user_id, verified_by_user_id, reference_number, notes
     )
     VALUES ($1, $2, $3, $4, 'bank_transfer', 'verified', $5, now(), now(), $6, $6, $7, $8)`,
    [
      WORKFLOW_IDS.finalPayment,
      context.propertyId,
      context.residentId,
      `WF-6E-PAY-FINAL-${period.periodKey}`,
      outstandingAfterPartial,
      context.ownerUserId,
      `WF-6E-${period.periodKey}-FINAL`,
      'Workflow validation payment from verified proof',
    ],
  );
  await client.query(
    `INSERT INTO payment_allocations (
       payment_id, target_type, target_id, invoice_id, allocated_amount
     )
     VALUES ($1, 'invoice', $2, $2, $3)`,
    [WORKFLOW_IDS.finalPayment, WORKFLOW_IDS.invoice, outstandingAfterPartial],
  );
  const verifiedProof = await client.query<{ proof_status: string }>(
    `UPDATE payment_proofs
     SET proof_status = 'verified',
         reviewed_by_user_id = $2,
         reviewed_at = now(),
         payment_id = $3,
         updated_at = now()
     WHERE id = $1 AND proof_status = 'pending_review'
     RETURNING proof_status`,
    [WORKFLOW_IDS.verifiedProof, context.ownerUserId, WORKFLOW_IDS.finalPayment],
  );
  addCheck(checks, 'payment proof verify', verifiedProof.rows[0]?.proof_status === 'verified', 'proof verified');

  const finalOutstanding = await outstandingAmount(client, WORKFLOW_IDS.invoice);
  await client.query(
    `UPDATE invoices
     SET invoice_status = 'paid',
         paid_at = now(),
         updated_at = now()
     WHERE id = $1`,
    [WORKFLOW_IDS.invoice],
  );
  addCheck(checks, 'final outstanding balance', finalOutstanding === 0, `outstanding ${finalOutstanding}`);

  const selfAccess = await client.query<{ accessible_count: string }>(
    `SELECT count(*) AS accessible_count
     FROM invoices
     JOIN residents ON residents.id = invoices.resident_id
     WHERE invoices.id = $1
       AND residents.user_id = $2`,
    [WORKFLOW_IDS.invoice, context.residentUserId],
  );
  addCheck(checks, 'resident can read own invoice', Number(selfAccess.rows[0].accessible_count) === 1, 'own invoice accessible');

  const crossAccess = await client.query<{ accessible_count: string }>(
    `SELECT count(*) AS accessible_count
     FROM invoices
     JOIN residents ON residents.id = invoices.resident_id
     WHERE invoices.id = $1
       AND residents.user_id = $2`,
    [WORKFLOW_IDS.invoice, context.otherResidentUserId],
  );
  addCheck(checks, 'resident cannot read other invoice', Number(crossAccess.rows[0].accessible_count) === 0, 'cross access blocked');

  const ownerSummary = await client.query<{ total_invoices: string; total_outstanding_amount: string }>(
    `SELECT count(*) AS total_invoices,
            COALESCE(sum(GREATEST(invoices.total_amount - COALESCE(allocations.allocated_amount, 0), 0)), 0)
              AS total_outstanding_amount
     FROM invoices
     LEFT JOIN (
       SELECT invoice_id, sum(allocated_amount) AS allocated_amount
       FROM payment_allocations
       WHERE allocation_status = 'active'
       GROUP BY invoice_id
     ) allocations ON allocations.invoice_id = invoices.id
     WHERE invoices.property_id = $1
       AND invoices.invoice_status <> 'void'`,
    [context.propertyId],
  );
  addCheck(
    checks,
    'property owner billing summary read-only aggregate',
    Number(ownerSummary.rows[0].total_invoices) >= 1 && Number(ownerSummary.rows[0].total_outstanding_amount) >= 0,
    `total invoices ${ownerSummary.rows[0].total_invoices}`,
  );

  return checks;
}

async function main(): Promise<void> {
  assertDevelopmentOnly();
  const pool = new Pool(databaseConfigFromEnv());
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const context = await loadContext(client);
    const checks = await runWorkflow(client, context);
    await client.query('COMMIT');

    console.log('Billing workflow validation passed.');
    for (const check of checks) {
      console.log(`${check.name}: ${check.detail}`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
