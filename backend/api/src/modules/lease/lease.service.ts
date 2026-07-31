import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { UserAccessContext } from '../iam/types/iam.types';
import {
  CloseLeaseDto,
  CollectDepositDto,
  CreateLeaseDto,
  CreateLeaseResidentDto,
  ListLeasesQueryDto,
  SettleRefundDto,
  UpdateLeaseDto,
  WaiveRefundDto,
  ListLeaseResidentOptionsQueryDto,
} from './lease.dto';
import { dueDateWithinCycle, nextBillingStart, previousDate } from './lease-date.helper';
import { LeaseFeatureService } from './lease-feature.service';
import { LeaseRepository } from './lease.repository';
import type {
  BillingCycle,
  DepositDirection,
  DepositTransactionType,
  IdempotentResult,
  LeaseAuditContext,
  LeaseDepositEntry,
  LeaseStatus,
  LeaseSummary,
  RefundSettlementStatus,
} from './lease.types';

type PropertyLockRow = {
  id: string;
  default_due_day: number | null;
};

type RoomLockRow = {
  id: string;
  property_id: string;
  number: string;
  room_status: string;
  kost_type_id: string | null;
};

type KostTypeLockRow = {
  id: string;
  property_id: string;
  name: string;
  monthly_price: string;
  yearly_price: string;
  deposit_amount: string;
  status: string;
  deleted_at: Date | null;
};

type ResidentLockRow = {
  id: string;
  property_id: string;
  full_name: string;
  resident_status: string;
  ktp_file_id: string | null;
  profile_photo_file_id: string | null;
};

type LeaseLockRow = {
  id: string;
  property_id: string;
  lease_code: string;
  resident_id: string;
  room_id: string;
  occupancy_id: string;
  kost_type_id: string;
  lease_status: LeaseStatus;
  start_date: string;
  end_date: string | null;
  billing_cycle: BillingCycle;
  billing_anchor_day: number;
  next_billing_date: string;
  snapshot_monthly_price: string;
  snapshot_yearly_price: string;
  snapshot_deposit_amount: string;
  snapshot_room_number: string;
  snapshot_kost_type_name: string;
  notes: string | null;
  deposit_collected_amount: string;
  deposit_deduction_amount: string;
  deposit_refunded_amount: string;
};

type InvoiceLockRow = {
  id: string;
  invoice_code: string;
  invoice_status: string;
  total_amount: string;
  due_date: string;
};

type IdempotencyRow = {
  id: string;
  request_fingerprint: string;
  command_status: 'pending' | 'succeeded' | 'failed';
  response_status: number | null;
  response_body: unknown;
};

type DepositLedgerRow = {
  id: string;
  transaction_type: DepositTransactionType;
  direction: DepositDirection;
  amount: string;
  reason_type: string | null;
  reason: string | null;
  settlement_status: RefundSettlementStatus;
  created_at: Date;
};

type SummaryRow = {
  id: string;
  property_id: string;
  lease_code: string;
  lease_status: LeaseStatus;
  start_date: string;
  end_date: string | null;
  billing_cycle: BillingCycle;
  billing_anchor_day: number;
  next_billing_date: string;
  resident_id: string;
  resident_name: string;
  room_id: string;
  room_number: string;
  kost_type_id: string;
  kost_type_name: string;
  last_invoice_id: string | null;
  last_invoice_code: string | null;
  last_invoice_status: string | null;
  last_invoice_due_date: string | null;
  last_invoice_total_amount: string | null;
  outstanding_amount: string;
};

type LeaseDetailRow = LeaseLockRow & {
  resident_name: string;
  room_number: string;
  kost_type_name: string;
};

type InvoiceReadRow = {
  id: string;
  invoice_code: string;
  invoice_status: string;
  cycle_start_date: string | null;
  cycle_end_date: string | null;
  due_date: string;
  total_amount: string;
  outstanding_amount: string;
};

type LeaseResidentOptionRow = {
  id: string;
  full_name: string;
  resident_status: 'active' | 'inactive';
};

type CommandOutput<T> = {
  data: T;
  resourceType: string;
  resourceId: string;
};

type PaymentRow = { id: string; payment_code: string };

@Injectable()
export class LeaseService {
  constructor(
    private readonly leases: LeaseRepository,
    private readonly features: LeaseFeatureService = new LeaseFeatureService(leases),
  ) {}

  async list(user: UserAccessContext, query: ListLeasesQueryDto) {
    if (query.property_id) this.assertPropertyScope(user, query.property_id);
    const scopedPropertyIds = this.scopeIds(user);
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const filters = [
      '$1::uuid[] IS NULL OR leases.property_id = ANY($1::uuid[])',
      '$2::uuid IS NULL OR leases.property_id = $2',
      '$3::text IS NULL OR leases.lease_status = $3',
      '$4::uuid IS NULL OR leases.resident_id = $4',
      '$5::uuid IS NULL OR leases.room_id = $5',
      '$6::uuid IS NULL OR leases.kost_type_id = $6',
      `($7::text IS NULL OR leases.lease_code ILIKE '%' || $7 || '%' OR residents.full_name ILIKE '%' || $7 || '%' OR rooms.number ILIKE '%' || $7 || '%')`,
    ].join('\n         AND ');
    const values = [
      scopedPropertyIds,
      query.property_id ?? null,
      query.status ?? null,
      query.resident_id ?? null,
      query.room_id ?? null,
      query.kost_type_id ?? null,
      query.q?.trim() || null,
    ];

    const [countResult, rowsResult] = await Promise.all([
      this.leases.query<{ total: string }>(
        `SELECT count(*) AS total
         FROM leases
         JOIN residents ON residents.id = leases.resident_id
         JOIN rooms ON rooms.id = leases.room_id
         WHERE ${filters}`,
        values,
      ),
      this.leases.query<SummaryRow>(
        `SELECT
           leases.id, leases.property_id, leases.lease_code, leases.lease_status,
           leases.start_date::text, leases.end_date::text, leases.billing_cycle,
           leases.billing_anchor_day, leases.next_billing_date::text,
           residents.id AS resident_id, residents.full_name AS resident_name,
           rooms.id AS room_id, rooms.number AS room_number,
           kost_types.id AS kost_type_id, kost_types.name AS kost_type_name,
           latest_invoice.id AS last_invoice_id,
           latest_invoice.invoice_code AS last_invoice_code,
           latest_invoice.invoice_status AS last_invoice_status,
           latest_invoice.due_date::text AS last_invoice_due_date,
           latest_invoice.total_amount AS last_invoice_total_amount,
           COALESCE(outstanding.outstanding_amount, 0)::text AS outstanding_amount
         FROM leases
         JOIN residents ON residents.id = leases.resident_id
         JOIN rooms ON rooms.id = leases.room_id
         JOIN kost_types ON kost_types.id = leases.kost_type_id
         LEFT JOIN LATERAL (
           SELECT invoices.id, invoices.invoice_code, invoices.invoice_status, invoices.due_date, invoices.total_amount
           FROM invoices
           WHERE invoices.lease_id = leases.id
           ORDER BY invoices.cycle_start_date DESC NULLS LAST, invoices.created_at DESC
           LIMIT 1
         ) latest_invoice ON true
         LEFT JOIN LATERAL (
           SELECT COALESCE(sum(GREATEST(invoices.total_amount - COALESCE(allocations.allocated_amount, 0), 0)), 0) AS outstanding_amount
           FROM invoices
           LEFT JOIN (
             SELECT invoice_id, sum(allocated_amount) AS allocated_amount
             FROM payment_allocations
             WHERE allocation_status = 'active'
             GROUP BY invoice_id
           ) allocations ON allocations.invoice_id = invoices.id
           WHERE invoices.lease_id = leases.id AND invoices.invoice_status <> 'void'
         ) outstanding ON true
         WHERE ${filters}
         ORDER BY leases.created_at DESC
         LIMIT $8 OFFSET $9`,
        [...values, limit, offset],
      ),
    ]);

    return {
      data: rowsResult.rows.map((row) => this.toSummary(row)),
      meta: { total: Number(countResult.rows[0]?.total ?? 0), limit, offset },
    };
  }

  async listOverdue(user: UserAccessContext, propertyId?: string, limit = 20, offset = 0) {
    if (propertyId) this.assertPropertyScope(user, propertyId);
    const values = [this.scopeIds(user), propertyId ?? null];
    const overdueWhere = `($1::uuid[] IS NULL OR leases.property_id = ANY($1::uuid[]))
         AND ($2::uuid IS NULL OR leases.property_id = $2)
         AND invoices.invoice_status IN ('issued', 'unpaid', 'partially_paid', 'overdue')
         AND invoices.due_date < (now() AT TIME ZONE 'Asia/Jakarta')::date
         AND invoices.total_amount > COALESCE(allocations.allocated_amount, 0)`;
    const allocationJoin = `LEFT JOIN (
         SELECT invoice_id, sum(allocated_amount) AS allocated_amount
         FROM payment_allocations
         WHERE allocation_status = 'active'
         GROUP BY invoice_id
       ) allocations ON allocations.invoice_id = invoices.id`;
    const [countResult, rowsResult] = await Promise.all([
      this.leases.query<{ total: string }>(
        `SELECT count(DISTINCT leases.id) AS total
         FROM leases
         JOIN invoices ON invoices.lease_id = leases.id
         ${allocationJoin}
         WHERE ${overdueWhere}`,
        values,
      ),
      this.leases.query<SummaryRow>(
        `SELECT DISTINCT ON (leases.id)
           leases.id, leases.property_id, leases.lease_code, leases.lease_status,
           leases.start_date::text, leases.end_date::text, leases.billing_cycle,
           leases.billing_anchor_day, leases.next_billing_date::text,
           residents.id AS resident_id, residents.full_name AS resident_name,
           rooms.id AS room_id, rooms.number AS room_number,
           kost_types.id AS kost_type_id, kost_types.name AS kost_type_name,
           invoices.id AS last_invoice_id, invoices.invoice_code AS last_invoice_code,
           invoices.invoice_status AS last_invoice_status, invoices.due_date::text AS last_invoice_due_date,
           invoices.total_amount AS last_invoice_total_amount,
           GREATEST(invoices.total_amount - COALESCE(allocations.allocated_amount, 0), 0)::text AS outstanding_amount
         FROM leases
         JOIN residents ON residents.id = leases.resident_id
         JOIN rooms ON rooms.id = leases.room_id
         JOIN kost_types ON kost_types.id = leases.kost_type_id
         JOIN invoices ON invoices.lease_id = leases.id
         ${allocationJoin}
         WHERE ${overdueWhere}
         ORDER BY leases.id, invoices.due_date ASC, invoices.created_at ASC
         LIMIT $3 OFFSET $4`,
        [...values, limit, offset],
      ),
    ]);
    return {
      data: rowsResult.rows.map((row) => this.toSummary(row)),
      meta: { total: Number(countResult.rows[0]?.total ?? 0), limit, offset },
    };
  }

  async listResidentOptions(user: UserAccessContext, query: ListLeaseResidentOptionsQueryDto) {
    if (query.property_id) this.assertPropertyScope(user, query.property_id);

    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;
    const values = [this.scopeIds(user), query.property_id ?? null];
    const where = [
      '$1::uuid[] IS NULL OR residents.property_id = ANY($1::uuid[])',
      '$2::uuid IS NULL OR residents.property_id = $2',
      "residents.resident_status IN ('active', 'inactive')",
    ].join('\n         AND ');

    const [countResult, rowsResult] = await Promise.all([
      this.leases.query<{ total: string }>(
        `SELECT count(*) AS total FROM residents WHERE ${where}`,
        values,
      ),
      this.leases.query<LeaseResidentOptionRow>(
        `SELECT residents.id, residents.full_name, residents.resident_status
         FROM residents
         WHERE ${where}
         ORDER BY residents.full_name ASC, residents.id ASC
         LIMIT $3 OFFSET $4`,
        [...values, limit, offset],
      ),
    ]);

    return {
      data: rowsResult.rows.map((row) => ({
        id: row.id,
        display_name_masked: this.maskName(row.full_name),
        resident_status: row.resident_status,
      })),
      meta: {
        total: Number(countResult.rows[0]?.total ?? 0),
        limit,
        offset,
      },
    };
  }

  async get(user: UserAccessContext, leaseId: string) {
    const lease = await this.getLeaseDetail(leaseId);
    this.assertPropertyScope(user, lease.property_id);
    const [ledger, invoices, history, facilities, transferLinks] = await Promise.all([
      this.leases.query<DepositLedgerRow>(
        `SELECT id, transaction_type, direction, amount, settlement_status, created_at
         FROM lease_deposit_transactions WHERE lease_id = $1 ORDER BY created_at, id`,
        [leaseId],
      ),
      this.readInvoices(leaseId),
      this.leases.query<{
        id: string;
        event_type: string;
        event_date: string;
        created_at: Date;
      }>(
        `SELECT id, event_type, event_date::text, created_at
         FROM lease_history WHERE lease_id = $1 ORDER BY created_at, id`,
        [leaseId],
      ),
      this.leases.query<{ id: string; name: string }>(
        `SELECT room_facilities.id, room_facilities.name
         FROM kost_type_facility_assignments
         JOIN room_facilities ON room_facilities.id = kost_type_facility_assignments.facility_id
         WHERE kost_type_facility_assignments.kost_type_id = $1
         ORDER BY room_facilities.sort_order, room_facilities.name`,
        [lease.kost_type_id],
      ),
      this.leases.query<{ id: string; direction: string }>(
        `SELECT id,
                CASE WHEN from_lease_id = $1 THEN 'out' ELSE 'in' END AS direction
         FROM room_transfer_records
         WHERE from_lease_id = $1 OR to_lease_id = $1
         ORDER BY created_at DESC`,
        [leaseId],
      ),
    ]);

    const deposit = ledger.rows.map((row) => ({
      id: row.id,
      transaction_type: row.transaction_type,
      direction: row.direction,
      amount: Number(row.amount),
      settlement_status: row.settlement_status,
      created_at: row.created_at,
    }));
    return {
      data: {
        lease: this.toDetail(lease),
        deposit_summary: this.depositSummary(ledger.rows, Number(lease.snapshot_deposit_amount)),
        deposit_ledger: deposit,
        invoices: invoices.rows.map((row) => this.toInvoiceRead(row)),
        history: history.rows.map((row) => ({
          id: row.id,
          event_type: row.event_type,
          event_date: row.event_date,
          created_at: row.created_at,
        })),
        kost_type_facilities: facilities.rows.map((row) => ({ id: row.id, name: row.name })),
        transfer_links: transferLinks.rows,
      },
    };
  }

  async billingSummary(user: UserAccessContext, leaseId: string) {
    const scope = await this.lookupLeaseScope(leaseId);
    this.assertPropertyScope(user, scope.property_id);
    const invoices = await this.readInvoices(leaseId);
    const data = invoices.rows.map((row) => this.toInvoiceRead(row));
    return {
      data: {
        lease_id: leaseId,
        invoices: data,
        total_amount: data.reduce((total, invoice) => total + invoice.total_amount, 0),
        outstanding_amount: data.reduce((total, invoice) => total + invoice.outstanding_amount, 0),
      },
    };
  }

  async create(
    user: UserAccessContext,
    dto: CreateLeaseDto,
    idempotencyKey: string | undefined,
    context: LeaseAuditContext,
  ): Promise<IdempotentResult<Record<string, unknown>>> {
    this.assertPropertyScope(user, dto.property_id);
    await this.features.assertWriteEnabled(dto.property_id);
    this.assertExactlyOneResident(dto);
    return this.executeCommand(
      user,
      dto.property_id,
      'POST /leases',
      idempotencyKey,
      dto,
      context,
      201,
      async (client, today) => {
        if (dto.start_date !== today) {
          throw new UnprocessableEntityException({
            code: 'LEASE_START_DATE_MUST_BE_TODAY',
            message: 'V1 leases may only start on the current Asia/Jakarta business date',
          });
        }

        const property = await this.lockProperty(client, dto.property_id);
        const room = await this.lockRoom(client, dto.room_id);
        if (room.property_id !== dto.property_id) {
          throw new UnprocessableEntityException({
            code: 'PROPERTY_SCOPE_MISMATCH',
            message: 'Room property does not match lease property',
          });
        }
        if (room.room_status !== 'vacant') {
          throw new UnprocessableEntityException({
            code: 'ROOM_NOT_LEASABLE',
            message: 'Room must be vacant before creating a lease',
          });
        }
        if (!room.kost_type_id) {
          throw new UnprocessableEntityException({
            code: 'ROOM_KOST_TYPE_MISMATCH',
            message: 'Room has no kost type',
          });
        }
        const kostType = await this.lockKostType(client, room.kost_type_id, today);
        if (
          kostType.property_id !== dto.property_id ||
          kostType.status !== 'active' ||
          kostType.deleted_at
        ) {
          throw new UnprocessableEntityException({
            code: 'ROOM_KOST_TYPE_MISMATCH',
            message: 'Room kost type is not active in this property',
          });
        }

        const resident = dto.resident_id
          ? await this.lockResident(client, dto.resident_id)
          : await this.createNestedResident(
              client,
              dto.property_id,
              dto.resident as CreateLeaseResidentDto,
              user.id,
            );
        if (resident.property_id !== dto.property_id) {
          throw new UnprocessableEntityException({
            code: 'PROPERTY_SCOPE_MISMATCH',
            message: 'Resident property does not match lease property',
          });
        }
        if (resident.resident_status !== 'active') {
          throw new UnprocessableEntityException({
            code: 'LEASE_RESIDENT_CONFLICT',
            message: 'Resident must be active',
          });
        }

        const occupancyResult = await client.query<{ id: string }>(
          `INSERT INTO occupancies (
           property_id, room_id, resident_id, start_date, occupancy_status, created_by_user_id
         ) VALUES ($1, $2, $3, $4::date, 'active', $5) RETURNING id`,
          [dto.property_id, room.id, resident.id, today, user.id],
        );
        const occupancyId = occupancyResult.rows[0].id;
        const anchorDay = dto.billing_anchor_day ?? Number(today.slice(-2));
        const nextBillingDate = nextBillingStart(today, dto.billing_cycle, anchorDay);
        const cycleEndDate = previousDate(nextBillingDate);
        const rentAmount =
          dto.billing_cycle === 'monthly'
            ? Number(kostType.monthly_price)
            : Number(kostType.yearly_price);
        const leaseCode = this.newLeaseCode(today);
        const leaseResult = await client.query<LeaseLockRow>(
          `INSERT INTO leases (
           property_id, lease_code, resident_id, room_id, occupancy_id, kost_type_id,
           lease_status, start_date, billing_cycle, billing_anchor_day, next_billing_date,
           snapshot_monthly_price, snapshot_yearly_price, snapshot_deposit_amount,
           snapshot_room_number, snapshot_kost_type_name, notes, created_by_user_id, updated_by_user_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6, 'active', $7::date, $8, $9, $10::date,
           $11, $12, $13, $14, $15, $16, $17, $17
         )
         RETURNING ${this.leaseColumns()}`,
          [
            dto.property_id,
            leaseCode,
            resident.id,
            room.id,
            occupancyId,
            kostType.id,
            today,
            dto.billing_cycle,
            anchorDay,
            nextBillingDate,
            kostType.monthly_price,
            kostType.yearly_price,
            kostType.deposit_amount,
            room.number,
            kostType.name,
            dto.notes?.trim() ?? null,
            user.id,
          ],
        );
        const lease = leaseResult.rows[0];
        await client.query(
          `UPDATE rooms SET room_status = 'occupied', updated_by_user_id = $2, updated_at = now() WHERE id = $1`,
          [room.id, user.id],
        );
        await client.query(
          `INSERT INTO occupancy_history (
           occupancy_id, property_id, room_id, resident_id, event_type, to_status, event_date, actor_user_id, metadata
         ) VALUES ($1, $2, $3, $4, 'check_in', 'active', $5::date, $6, $7::jsonb)`,
          [
            occupancyId,
            dto.property_id,
            room.id,
            resident.id,
            today,
            user.id,
            JSON.stringify({ source: 'lease' }),
          ],
        );

        const invoiceCode = `INV-${leaseCode}-${today.replaceAll('-', '')}`;
        const invoiceResult = await client.query<{
          id: string;
          invoice_code: string;
          invoice_status: string;
          due_date: string;
          total_amount: string;
        }>(
          `INSERT INTO invoices (
           property_id, resident_id, room_id, occupancy_id, billing_period_id, lease_id,
           invoice_code, invoice_status, subtotal_amount, late_fee_amount, total_amount,
           due_date, issued_at, snapshot_period_key, snapshot_period_start_date, snapshot_period_end_date,
           snapshot_room_number, snapshot_resident_name, snapshot_monthly_price,
           cycle_start_date, cycle_end_date, snapshot_billing_cycle, snapshot_rent_amount,
           generation_source, created_by_user_id
         ) VALUES (
           $1, $2, $3, $4, NULL, $5, $6, 'issued', $7, 0, $7, $8::date, now(),
           $9, $10::date, $11::date, $12, $13, $14, $10::date, $11::date, $15, $7, 'auto', $16
         )
         RETURNING id, invoice_code, invoice_status, due_date::text, total_amount`,
          [
            dto.property_id,
            resident.id,
            room.id,
            occupancyId,
            lease.id,
            invoiceCode,
            rentAmount,
            dueDateWithinCycle(today, cycleEndDate, property.default_due_day ?? 25),
            `lease:${leaseCode}:${today}`,
            today,
            cycleEndDate,
            room.number,
            resident.full_name,
            kostType.monthly_price,
            dto.billing_cycle,
            user.id,
          ],
        );
        const invoice = invoiceResult.rows[0];
        await client.query(
          `INSERT INTO invoice_line_items (invoice_id, line_type, description, quantity, unit_amount, total_amount, sort_order, metadata)
         VALUES ($1, 'rent', 'Lease rent', 1, $2, $2, 0, $3::jsonb)`,
          [
            invoice.id,
            rentAmount,
            JSON.stringify({ lease_id: lease.id, billing_cycle: dto.billing_cycle }),
          ],
        );
        await this.insertHistory(client, dto.property_id, lease.id, 'created', user.id, today, {
          occupancy_id: occupancyId,
          billing_cycle: dto.billing_cycle,
        });
        await this.insertHistory(
          client,
          dto.property_id,
          lease.id,
          'invoice_generated',
          user.id,
          today,
          {
            invoice_id: invoice.id,
            amount: rentAmount,
          },
        );
        await this.writeAudit(
          client,
          user.id,
          dto.property_id,
          'lease.create',
          'lease',
          lease.id,
          undefined,
          {
            lease_code: lease.lease_code,
            room_id: room.id,
            resident_id: resident.id,
            occupancy_id: occupancyId,
            invoice_id: invoice.id,
            billing_cycle: dto.billing_cycle,
            rent_amount: rentAmount,
          },
          context,
        );
        await this.writeOutbox(client, {
          propertyId: dto.property_id,
          eventKey: `lease.created:${lease.id}`,
          eventType: 'lease.created',
          aggregateType: 'lease',
          aggregateId: lease.id,
          actorUserId: user.id,
          correlationId: context.correlationId,
          payload: { lease_id: lease.id, room_id: room.id, resident_id: resident.id },
        });
        await this.writeOutbox(client, {
          propertyId: dto.property_id,
          eventKey: `billing.invoice_issued:${invoice.id}`,
          eventType: 'billing.invoice_issued',
          aggregateType: 'invoice',
          aggregateId: invoice.id,
          actorUserId: user.id,
          correlationId: context.correlationId,
          payload: { invoice_id: invoice.id, lease_id: lease.id, amount: rentAmount },
        });

        return {
          resourceType: 'lease',
          resourceId: lease.id,
          data: {
            lease: this.publicLease(lease, resident.full_name, room.number, kostType.name),
            occupancy: { id: occupancyId, occupancy_status: 'active', start_date: today },
            first_invoice: {
              id: invoice.id,
              invoice_code: invoice.invoice_code,
              invoice_status: invoice.invoice_status,
              due_date: invoice.due_date,
              total_amount: Number(invoice.total_amount),
            },
            deposit_summary: this.depositSummary([], Number(kostType.deposit_amount)),
          },
        };
      },
    );
  }

  async update(
    user: UserAccessContext,
    leaseId: string,
    dto: UpdateLeaseDto,
    idempotencyKey: string | undefined,
    context: LeaseAuditContext,
  ): Promise<IdempotentResult<Record<string, unknown>>> {
    this.assertOnlyNotes(dto);
    const scope = await this.lookupLeaseScope(leaseId);
    this.assertPropertyScope(user, scope.property_id);
    return this.executeCommand(
      user,
      scope.property_id,
      `PATCH /leases/${leaseId}`,
      idempotencyKey,
      dto,
      context,
      200,
      async (client, today) => {
        await this.lockProperty(client, scope.property_id);
        const lease = await this.lockLease(client, leaseId);
        const updatedResult = await client.query<LeaseLockRow>(
          `UPDATE leases SET notes = $2, updated_by_user_id = $3, updated_at = now()
         WHERE id = $1 RETURNING ${this.leaseColumns()}`,
          [lease.id, dto.notes?.trim() ?? null, user.id],
        );
        const updated = updatedResult.rows[0];
        await this.insertHistory(client, scope.property_id, lease.id, 'updated', user.id, today, {
          fields: ['notes'],
        });
        await this.writeAudit(
          client,
          user.id,
          scope.property_id,
          'lease.update',
          'lease',
          lease.id,
          { notes_present: Boolean(lease.notes) },
          { notes_present: Boolean(updated.notes) },
          context,
        );
        await this.writeOutbox(client, {
          propertyId: scope.property_id,
          eventKey: `lease.updated:${lease.id}:${this.requestFingerprint(dto)}`,
          eventType: 'lease.updated',
          aggregateType: 'lease',
          aggregateId: lease.id,
          actorUserId: user.id,
          correlationId: context.correlationId,
          payload: { lease_id: lease.id, changed_fields: ['notes'] },
        });
        const detail = await this.getLeasePresentationRows(client, updated);
        return { resourceType: 'lease', resourceId: lease.id, data: { lease: detail } };
      },
    );
  }

  async collectDeposit(
    user: UserAccessContext,
    leaseId: string,
    dto: CollectDepositDto,
    idempotencyKey: string | undefined,
    context: LeaseAuditContext,
  ): Promise<IdempotentResult<Record<string, unknown>>> {
    this.assertFinancialActor(user);
    const scope = await this.lookupLeaseScope(leaseId);
    this.assertPropertyScope(user, scope.property_id);
    return this.executeCommand(
      user,
      scope.property_id,
      `POST /leases/${leaseId}/deposit/collect`,
      idempotencyKey,
      dto,
      context,
      201,
      async (client, today) => {
        await this.lockProperty(client, scope.property_id);
        const lease = await this.lockLease(client, leaseId);
        if (lease.lease_status !== 'active') {
          throw new ConflictException({
            code: 'LEASE_STATE_CONFLICT',
            message: 'Deposit can only be collected for an active lease',
          });
        }
        const ledger = await this.lockLedger(client, lease.id);
        const current = this.depositSummary(ledger, Number(lease.snapshot_deposit_amount));
        if (current.collected_amount + dto.amount > current.required_amount) {
          throw new UnprocessableEntityException({
            code: 'DEPOSIT_EXCEEDS_REQUIRED',
            message: 'Deposit collection exceeds the lease snapshot requirement',
          });
        }
        const payment = dto.payment
          ? await this.createVerifiedDepositPayment(
              client,
              scope.property_id,
              lease.resident_id,
              dto.amount,
              dto.payment,
              user.id,
            )
          : null;
        if (!payment && !dto.override_reason?.trim()) {
          throw new BadRequestException({
            code: 'DEPOSIT_PAYMENT_OR_OVERRIDE_REQUIRED',
            message: 'A verified payment or an override reason is required',
          });
        }
        if (
          dto.payment &&
          !dto.payment.payment_code?.trim() &&
          !dto.payment.reference_number?.trim()
        ) {
          throw new BadRequestException({
            code: 'DEPOSIT_PAYMENT_REFERENCE_REQUIRED',
            message: 'A verified deposit payment requires a code or reference',
          });
        }
        if (payment) {
          await client.query(
            `INSERT INTO payment_allocations (payment_id, target_type, target_id, allocated_amount)
           VALUES ($1, 'deposit', $2, $3)`,
            [payment.id, lease.id, dto.amount],
          );
        }
        const entry = await this.insertDepositEntry(client, {
          propertyId: scope.property_id,
          leaseId: lease.id,
          transactionType: dto.transaction_type,
          direction: 'credit',
          amount: dto.amount,
          paymentId: payment?.id ?? null,
          reasonType: payment ? 'verified_payment' : 'manual_override',
          reason: payment ? null : (dto.override_reason?.trim() ?? null),
          externalReference: payment ? null : null,
          settlementStatus: 'settled',
          metadata: payment ? { payment_code: payment.payment_code } : { override: true },
          actorUserId: user.id,
        });
        const refreshed = await this.refreshDepositCache(client, lease.id, user.id);
        await this.insertHistory(
          client,
          scope.property_id,
          lease.id,
          'deposit_collected',
          user.id,
          today,
          {
            amount: dto.amount,
            transaction_type: dto.transaction_type,
            payment_id: payment?.id ?? null,
          },
        );
        await this.writeAudit(
          client,
          user.id,
          scope.property_id,
          'lease.deposit_collect',
          'lease',
          lease.id,
          undefined,
          {
            transaction_id: entry.id,
            amount: dto.amount,
            transaction_type: dto.transaction_type,
            payment_id: payment?.id ?? null,
          },
          context,
        );
        await this.writeOutbox(client, {
          propertyId: scope.property_id,
          eventKey: `lease.deposit_collected:${entry.id}`,
          eventType: 'lease.deposit_collected',
          aggregateType: 'lease',
          aggregateId: lease.id,
          actorUserId: user.id,
          correlationId: context.correlationId,
          payload: { lease_id: lease.id, transaction_id: entry.id, amount: dto.amount },
        });
        return {
          resourceType: 'lease',
          resourceId: lease.id,
          data: {
            deposit_transaction: this.toLedger(entry),
            payment: payment
              ? { id: payment.id, payment_code: payment.payment_code, payment_status: 'verified' }
              : null,
            deposit_summary: refreshed,
          },
        };
      },
    );
  }

  async close(
    user: UserAccessContext,
    leaseId: string,
    dto: CloseLeaseDto,
    idempotencyKey: string | undefined,
    context: LeaseAuditContext,
  ): Promise<IdempotentResult<Record<string, unknown>>> {
    this.assertFinancialActor(user);
    const scope = await this.lookupLeaseScope(leaseId);
    this.assertPropertyScope(user, scope.property_id);
    return this.executeCommand(
      user,
      scope.property_id,
      `POST /leases/${leaseId}/close`,
      idempotencyKey,
      dto,
      context,
      200,
      async (client, today) => {
        if (dto.end_date !== today) {
          throw new UnprocessableEntityException({
            code: 'LEASE_END_DATE_MUST_BE_TODAY',
            message: 'V1 checkout must use today in Asia/Jakarta',
          });
        }
        await this.lockProperty(client, scope.property_id);
        const lease = await this.lockLease(client, leaseId);
        if (lease.lease_status !== 'active') {
          throw new ConflictException({
            code: 'LEASE_STATE_CONFLICT',
            message: 'Only an active lease can be closed',
          });
        }
        const room = await this.lockRoom(client, lease.room_id);
        const resident = await this.lockResident(client, lease.resident_id);
        await this.lockOccupancy(client, lease.occupancy_id);
        const invoices = await this.lockLeaseInvoices(client, lease.id);
        const ledger = await this.lockLedger(client, lease.id);
        const beforeSummary = this.depositSummary(ledger, Number(lease.snapshot_deposit_amount));
        const outstandingAmount = await this.outstandingForLockedInvoices(
          client,
          invoices.map((invoice) => invoice.id),
        );
        const outstandingDeduction = Math.min(beforeSummary.balance_amount, outstandingAmount);
        const damageDeductions = dto.damage_deductions ?? [];
        await this.assertDamageFiles(
          client,
          scope.property_id,
          damageDeductions.flatMap((deduction) => deduction.file_ids ?? []),
        );
        const damageAmount = damageDeductions.reduce(
          (total, deduction) => total + deduction.amount,
          0,
        );
        const remainingAfterOutstanding = beforeSummary.balance_amount - outstandingDeduction;
        if (damageAmount > remainingAfterOutstanding) {
          throw new UnprocessableEntityException({
            code: 'DEPOSIT_EXCEEDS_REQUIRED',
            message: 'Damage deductions exceed available deposit balance',
          });
        }
        const remainingAfterDeductions = remainingAfterOutstanding - damageAmount;
        const refundAmount = dto.refund?.amount ?? remainingAfterDeductions;
        if (refundAmount > remainingAfterDeductions) {
          throw new UnprocessableEntityException({
            code: 'DEPOSIT_EXCEEDS_REQUIRED',
            message: 'Refund exceeds remaining deposit balance',
          });
        }

        const createdEntries: DepositLedgerRow[] = [];
        if (outstandingDeduction > 0) {
          const entry = await this.insertDepositEntry(client, {
            propertyId: scope.property_id,
            leaseId: lease.id,
            transactionType: 'deduction',
            direction: 'debit',
            amount: outstandingDeduction,
            reasonType: 'outstanding_invoice',
            reason: 'Outstanding invoices at checkout',
            settlementStatus: 'settled',
            metadata: { invoice_count: invoices.length, outstanding_amount: outstandingAmount },
            actorUserId: user.id,
          });
          createdEntries.push(entry);
          await this.insertHistory(
            client,
            scope.property_id,
            lease.id,
            'deposit_deducted',
            user.id,
            today,
            {
              amount: outstandingDeduction,
              reason_type: 'outstanding_invoice',
              invoice_count: invoices.length,
            },
          );
        }
        for (const deduction of damageDeductions) {
          const entry = await this.insertDepositEntry(client, {
            propertyId: scope.property_id,
            leaseId: lease.id,
            transactionType: 'deduction',
            direction: 'debit',
            amount: deduction.amount,
            reasonType: 'damage',
            reason: deduction.reason.trim(),
            settlementStatus: 'settled',
            metadata: { file_count: deduction.file_ids?.length ?? 0 },
            actorUserId: user.id,
          });
          createdEntries.push(entry);
          await this.insertHistory(
            client,
            scope.property_id,
            lease.id,
            'deposit_deducted',
            user.id,
            today,
            {
              amount: deduction.amount,
              reason_type: 'damage',
              file_count: deduction.file_ids?.length ?? 0,
            },
          );
        }
        let refundEntry: DepositLedgerRow | null = null;
        if (refundAmount > 0) {
          refundEntry = await this.insertDepositEntry(client, {
            propertyId: scope.property_id,
            leaseId: lease.id,
            transactionType: 'refund',
            direction: 'debit',
            amount: refundAmount,
            reasonType: 'checkout_refund',
            reason: dto.refund?.reason?.trim() || 'Checkout refund',
            settlementStatus: 'pending',
            metadata: {},
            actorUserId: user.id,
          });
          createdEntries.push(refundEntry);
          await this.insertHistory(
            client,
            scope.property_id,
            lease.id,
            'deposit_refunded',
            user.id,
            today,
            {
              amount: refundAmount,
              settlement_status: 'pending',
            },
          );
        }
        const refreshed = await this.refreshDepositCache(client, lease.id, user.id);
        await client.query(
          `UPDATE occupancies
         SET occupancy_status = 'ended', end_date = $2::date, closed_by_user_id = $3, updated_at = now()
         WHERE id = $1`,
          [lease.occupancy_id, today, user.id],
        );
        await client.query(
          `INSERT INTO occupancy_history (
           occupancy_id, property_id, room_id, resident_id, event_type, from_status, to_status, event_date, actor_user_id, metadata
         ) VALUES ($1, $2, $3, $4, 'check_out', 'active', 'ended', $5::date, $6, $7::jsonb)`,
          [
            lease.occupancy_id,
            scope.property_id,
            room.id,
            resident.id,
            today,
            user.id,
            JSON.stringify({ source: 'lease' }),
          ],
        );
        const closedLeaseResult = await client.query<LeaseLockRow>(
          `UPDATE leases
         SET lease_status = 'ended', end_date = $2::date, closed_at = now(), closed_by_user_id = $3,
             close_reason = $4, updated_by_user_id = $3, updated_at = now()
         WHERE id = $1 RETURNING ${this.leaseColumns()}`,
          [lease.id, today, user.id, dto.reason.trim()],
        );
        const closedLease = closedLeaseResult.rows[0];
        await client.query(
          `UPDATE rooms SET room_status = $2, updated_by_user_id = $3, updated_at = now() WHERE id = $1`,
          [room.id, dto.room_status_after, user.id],
        );
        await this.insertHistory(client, scope.property_id, lease.id, 'closed', user.id, today, {
          room_status_after: dto.room_status_after,
          outstanding_deduction: outstandingDeduction,
          damage_deduction: damageAmount,
          refund_amount: refundAmount,
        });
        await this.writeAudit(
          client,
          user.id,
          scope.property_id,
          'lease.close',
          'lease',
          lease.id,
          { lease_status: 'active' },
          {
            lease_status: 'ended',
            room_status_after: dto.room_status_after,
            outstanding_deduction: outstandingDeduction,
            damage_deduction: damageAmount,
            refund_amount: refundAmount,
          },
          context,
        );
        await this.writeOutbox(client, {
          propertyId: scope.property_id,
          eventKey: `lease.closed:${lease.id}`,
          eventType: 'lease.closed',
          aggregateType: 'lease',
          aggregateId: lease.id,
          actorUserId: user.id,
          correlationId: context.correlationId,
          payload: {
            lease_id: lease.id,
            room_id: room.id,
            room_status_after: dto.room_status_after,
            refund_pending: refundEntry?.id ?? null,
          },
        });
        return {
          resourceType: 'lease',
          resourceId: lease.id,
          data: {
            lease: this.publicLease(
              closedLease,
              resident.full_name,
              room.number,
              lease.snapshot_kost_type_name,
            ),
            room: { id: room.id, room_status: dto.room_status_after },
            deposit_summary: refreshed,
            deductions: createdEntries
              .filter((entry) => entry.transaction_type === 'deduction')
              .map((entry) => this.toLedger(entry)),
            refund: refundEntry ? this.toLedger(refundEntry) : null,
            outstanding_amount_before_deduction: outstandingAmount,
          },
        };
      },
    );
  }

  async settleRefund(
    user: UserAccessContext,
    leaseId: string,
    refundId: string,
    dto: SettleRefundDto,
    idempotencyKey: string | undefined,
    context: LeaseAuditContext,
  ): Promise<IdempotentResult<Record<string, unknown>>> {
    this.assertFinancialActor(user);
    const scope = await this.lookupLeaseScope(leaseId);
    this.assertPropertyScope(user, scope.property_id);
    return this.executeRefundSettlement(
      user,
      scope.property_id,
      leaseId,
      refundId,
      'settled',
      dto,
      idempotencyKey,
      context,
    );
  }

  async waiveRefund(
    user: UserAccessContext,
    leaseId: string,
    refundId: string,
    dto: WaiveRefundDto,
    idempotencyKey: string | undefined,
    context: LeaseAuditContext,
  ): Promise<IdempotentResult<Record<string, unknown>>> {
    this.assertFinancialActor(user);
    const scope = await this.lookupLeaseScope(leaseId);
    this.assertPropertyScope(user, scope.property_id);
    return this.executeRefundSettlement(
      user,
      scope.property_id,
      leaseId,
      refundId,
      'waived',
      dto,
      idempotencyKey,
      context,
    );
  }

  private async executeRefundSettlement(
    user: UserAccessContext,
    propertyId: string,
    leaseId: string,
    refundId: string,
    status: 'settled' | 'waived',
    dto: SettleRefundDto | WaiveRefundDto,
    idempotencyKey: string | undefined,
    context: LeaseAuditContext,
  ): Promise<IdempotentResult<Record<string, unknown>>> {
    const route = `POST /leases/${leaseId}/refunds/${refundId}/${status === 'settled' ? 'settle' : 'waive'}`;
    return this.executeCommand(
      user,
      propertyId,
      route,
      idempotencyKey,
      dto,
      context,
      200,
      async (client, today) => {
        await this.lockProperty(client, propertyId);
        const lease = await this.lockLease(client, leaseId);
        if (lease.lease_status !== 'ended') {
          throw new ConflictException({
            code: 'LEASE_STATE_CONFLICT',
            message: 'Refund settlement requires a closed lease',
          });
        }
        const refund = await this.lockRefund(client, refundId, leaseId);
        if (refund.settlement_status !== 'pending') {
          throw new ConflictException({
            code: 'LEASE_STATE_CONFLICT',
            message: 'Refund is no longer pending',
          });
        }
        const settlement = status === 'settled' ? (dto as SettleRefundDto) : null;
        const waive = status === 'waived' ? (dto as WaiveRefundDto) : null;
        await client.query(
          `INSERT INTO lease_refund_settlements (
           property_id, deposit_transaction_id, settlement_status, payment_method, external_reference,
           reason, settled_by_user_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
          [
            propertyId,
            refund.id,
            status,
            settlement?.payment_method ?? null,
            settlement?.external_reference ?? null,
            waive?.reason.trim() ?? null,
            user.id,
            JSON.stringify(
              status === 'settled' ? { notes_present: Boolean(settlement?.notes) } : {},
            ),
          ],
        );
        const updatedResult = await client.query<DepositLedgerRow>(
          `UPDATE lease_deposit_transactions
         SET settlement_status = $2,
             external_reference = $3,
             settled_at = now(),
             settled_by_user_id = $4
         WHERE id = $1
         RETURNING id, transaction_type, direction, amount, reason_type, reason, settlement_status, created_at`,
          [refund.id, status, settlement?.external_reference ?? null, user.id],
        );
        const updated = updatedResult.rows[0];
        await this.insertHistory(client, propertyId, lease.id, 'deposit_refunded', user.id, today, {
          transaction_id: refund.id,
          amount: Number(refund.amount),
          settlement_status: status,
        });
        await this.writeAudit(
          client,
          user.id,
          propertyId,
          `lease.refund_${status}`,
          'lease_deposit_transaction',
          refund.id,
          { settlement_status: 'pending' },
          { settlement_status: status, amount: Number(refund.amount) },
          context,
        );
        await this.writeOutbox(client, {
          propertyId,
          eventKey: `lease.refund_${status}:${refund.id}`,
          eventType: `lease.refund_${status}`,
          aggregateType: 'lease',
          aggregateId: lease.id,
          actorUserId: user.id,
          correlationId: context.correlationId,
          payload: {
            lease_id: lease.id,
            refund_transaction_id: refund.id,
            amount: Number(refund.amount),
          },
        });
        return {
          resourceType: 'lease_deposit_transaction',
          resourceId: refund.id,
          data: { refund: this.toLedger(updated) },
        };
      },
    );
  }

  private async executeCommand<T>(
    user: UserAccessContext,
    propertyId: string,
    route: string,
    idempotencyKey: string | undefined,
    payload: unknown,
    context: LeaseAuditContext,
    status: number,
    operation: (client: PoolClient, today: string) => Promise<CommandOutput<T>>,
  ): Promise<IdempotentResult<T>> {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const fingerprint = this.requestFingerprint({
      route,
      actor_id: user.id,
      property_id: propertyId,
      payload,
    });
    try {
      return await this.leases.transaction(async (client) => {
        const command = await this.claimCommand(
          client,
          propertyId,
          user.id,
          route,
          key,
          fingerprint,
          context.correlationId,
        );
        if (command) {
          return { status: command.status, body: command.body as { data: T }, replayed: true };
        }
        const today = await this.jakartaToday(client);
        const result = await operation(client, today);
        const body = { data: result.data };
        await client.query(
          `UPDATE idempotency_commands
           SET command_status = 'succeeded', response_status = $2, response_body = $3::jsonb,
               resource_type = $4, resource_id = $5, completed_at = now()
           WHERE actor_user_id = $1 AND route = $6 AND idempotency_key = $7`,
          [
            user.id,
            status,
            JSON.stringify(body),
            result.resourceType,
            result.resourceId,
            route,
            key,
          ],
        );
        return { status, body, replayed: false };
      });
    } catch (error) {
      this.rethrowKnownDatabaseConflict(error);
    }
  }

  private async claimCommand(
    client: PoolClient,
    propertyId: string,
    actorUserId: string,
    route: string,
    key: string,
    fingerprint: string,
    correlationId?: string,
  ): Promise<{ status: number; body: { data: unknown } } | null> {
    const inserted = await client.query<IdempotencyRow>(
      `INSERT INTO idempotency_commands (
         property_id, actor_user_id, route, idempotency_key, request_fingerprint, correlation_id
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (actor_user_id, route, idempotency_key) DO NOTHING
       RETURNING id, request_fingerprint, command_status, response_status, response_body`,
      [propertyId, actorUserId, route, key, fingerprint, correlationId ?? null],
    );
    if (inserted.rows[0]) return null;
    const existing = await client.query<IdempotencyRow>(
      `SELECT id, request_fingerprint, command_status, response_status, response_body
       FROM idempotency_commands
       WHERE actor_user_id = $1 AND route = $2 AND idempotency_key = $3
       FOR UPDATE`,
      [actorUserId, route, key],
    );
    const row = existing.rows[0];
    if (!row)
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Command claim is unavailable; retry with the same key',
      });
    if (row.request_fingerprint !== fingerprint) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was already used with a different payload',
      });
    }
    if (row.command_status === 'pending') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Idempotency command is still in progress',
      });
    }
    if (!row.response_status || !row.response_body || typeof row.response_body !== 'object') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Idempotency command has no replayable result',
      });
    }
    return { status: row.response_status, body: row.response_body as { data: unknown } };
  }

  private async lookupLeaseScope(leaseId: string): Promise<{ property_id: string }> {
    const result = await this.leases.query<{ property_id: string }>(
      `SELECT property_id FROM leases WHERE id = $1`,
      [leaseId],
    );
    if (!result.rows[0])
      throw new NotFoundException({ code: 'LEASE_NOT_FOUND', message: 'Lease not found' });
    return result.rows[0];
  }

  private async getLeaseDetail(leaseId: string): Promise<LeaseDetailRow> {
    const result = await this.leases.query<LeaseDetailRow>(
      `SELECT ${this.leaseColumns('leases')}, residents.full_name AS resident_name,
              rooms.number AS room_number, kost_types.name AS kost_type_name
       FROM leases
       JOIN residents ON residents.id = leases.resident_id
       JOIN rooms ON rooms.id = leases.room_id
       JOIN kost_types ON kost_types.id = leases.kost_type_id
       WHERE leases.id = $1`,
      [leaseId],
    );
    if (!result.rows[0])
      throw new NotFoundException({ code: 'LEASE_NOT_FOUND', message: 'Lease not found' });
    return result.rows[0];
  }

  private async readInvoices(leaseId: string) {
    return this.leases.query<InvoiceReadRow>(
      `SELECT invoices.id, invoices.invoice_code, invoices.invoice_status,
              invoices.cycle_start_date::text, invoices.cycle_end_date::text,
              invoices.due_date::text, invoices.total_amount,
              GREATEST(invoices.total_amount - COALESCE(allocations.allocated_amount, 0), 0)::text AS outstanding_amount
       FROM invoices
       LEFT JOIN (
         SELECT invoice_id, sum(allocated_amount) AS allocated_amount
         FROM payment_allocations
         WHERE allocation_status = 'active'
         GROUP BY invoice_id
       ) allocations ON allocations.invoice_id = invoices.id
       WHERE invoices.lease_id = $1
       ORDER BY invoices.cycle_start_date DESC NULLS LAST, invoices.created_at DESC`,
      [leaseId],
    );
  }

  private async lockProperty(client: PoolClient, propertyId: string): Promise<PropertyLockRow> {
    const result = await client.query<PropertyLockRow>(
      `SELECT properties.id, COALESCE(property_settings.default_due_day, 25) AS default_due_day
       FROM properties
       LEFT JOIN property_settings ON property_settings.property_id = properties.id
       WHERE properties.id = $1 AND properties.status = 'active'
       FOR SHARE OF properties`,
      [propertyId],
    );
    if (!result.rows[0])
      throw new UnprocessableEntityException({
        code: 'PROPERTY_NOT_ACTIVE',
        message: 'Property is not active',
      });
    return result.rows[0];
  }

  private async lockRoom(client: PoolClient, roomId: string): Promise<RoomLockRow> {
    const result = await client.query<RoomLockRow>(
      `SELECT id, property_id, number, room_status, kost_type_id FROM rooms WHERE id = $1 FOR UPDATE`,
      [roomId],
    );
    if (!result.rows[0])
      throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found' });
    return result.rows[0];
  }

  private async lockKostType(
    client: PoolClient,
    kostTypeId: string,
    effectiveDate: string,
  ): Promise<KostTypeLockRow> {
    const result = await client.query<KostTypeLockRow>(
      `SELECT kost_type.id, kost_type.property_id, kost_type.name,
              commercial_version.monthly_price,
              commercial_version.annual_contract_value AS yearly_price,
              (commercial_version.monthly_price * commercial_version.security_deposit_months)::bigint
                AS deposit_amount,
              kost_type.status, kost_type.deleted_at
       FROM kost_types kost_type
       JOIN LATERAL (
         SELECT version.monthly_price, version.annual_contract_value,
                version.security_deposit_months
         FROM kost_type_commercial_versions version
         WHERE version.kost_type_id = kost_type.id
           AND version.effective_date <= $2::date
         ORDER BY version.effective_date DESC, version.id DESC
         LIMIT 1
       ) commercial_version ON true
       WHERE kost_type.id = $1
       FOR SHARE OF kost_type`,
      [kostTypeId, effectiveDate],
    );
    if (!result.rows[0])
      throw new NotFoundException({ code: 'KOST_TYPE_NOT_FOUND', message: 'Kost type not found' });
    return result.rows[0];
  }

  private async lockResident(client: PoolClient, residentId: string): Promise<ResidentLockRow> {
    const result = await client.query<ResidentLockRow>(
      `SELECT id, property_id, full_name, resident_status, ktp_file_id, profile_photo_file_id
       FROM residents WHERE id = $1 FOR UPDATE`,
      [residentId],
    );
    if (!result.rows[0])
      throw new NotFoundException({ code: 'RESIDENT_NOT_FOUND', message: 'Resident not found' });
    return result.rows[0];
  }

  private async createNestedResident(
    client: PoolClient,
    propertyId: string,
    resident: CreateLeaseResidentDto,
    actorUserId: string,
  ): Promise<ResidentLockRow> {
    await this.assertResidentFiles(
      client,
      propertyId,
      resident.ktp_file_id,
      resident.profile_photo_file_id,
    );
    const result = await client.query<ResidentLockRow>(
      `INSERT INTO residents (
         property_id, full_name, phone, email, ktp_number, date_of_birth, place_of_birth, address,
         emergency_phone, ktp_file_id, profile_photo_file_id, gender, created_by_user_id, updated_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12, $13, $13)
       RETURNING id, property_id, full_name, resident_status, ktp_file_id, profile_photo_file_id`,
      [
        propertyId,
        resident.full_name.trim(),
        resident.phone?.trim() ?? null,
        resident.email?.trim() ?? null,
        resident.ktp_number ?? null,
        resident.date_of_birth ?? null,
        resident.place_of_birth?.trim() ?? null,
        resident.address?.trim() ?? null,
        resident.emergency_phone?.trim() ?? null,
        resident.ktp_file_id ?? null,
        resident.profile_photo_file_id ?? null,
        resident.gender ?? null,
        actorUserId,
      ],
    );
    return result.rows[0];
  }

  private async lockLease(client: PoolClient, leaseId: string): Promise<LeaseLockRow> {
    const result = await client.query<LeaseLockRow>(
      `SELECT ${this.leaseColumns()} FROM leases WHERE id = $1 FOR UPDATE`,
      [leaseId],
    );
    if (!result.rows[0])
      throw new NotFoundException({ code: 'LEASE_NOT_FOUND', message: 'Lease not found' });
    return result.rows[0];
  }

  private async lockOccupancy(client: PoolClient, occupancyId: string): Promise<void> {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM occupancies WHERE id = $1 FOR UPDATE`,
      [occupancyId],
    );
    if (!result.rows[0])
      throw new ConflictException({
        code: 'LEASE_STATE_CONFLICT',
        message: 'Lease occupancy is missing',
      });
  }

  private async lockLeaseInvoices(client: PoolClient, leaseId: string): Promise<InvoiceLockRow[]> {
    const result = await client.query<InvoiceLockRow>(
      `SELECT id, invoice_code, invoice_status, total_amount, due_date::text
       FROM invoices WHERE lease_id = $1 ORDER BY id FOR UPDATE`,
      [leaseId],
    );
    return result.rows;
  }

  private async outstandingForLockedInvoices(
    client: PoolClient,
    invoiceIds: string[],
  ): Promise<number> {
    if (!invoiceIds.length) return 0;
    await client.query(
      `SELECT id FROM payment_allocations WHERE invoice_id = ANY($1::uuid[]) FOR UPDATE`,
      [invoiceIds],
    );
    const result = await client.query<{ outstanding_amount: string }>(
      `SELECT COALESCE(sum(GREATEST(invoices.total_amount - COALESCE(allocations.allocated_amount, 0), 0)), 0) AS outstanding_amount
       FROM invoices
       LEFT JOIN (
         SELECT invoice_id, sum(allocated_amount) AS allocated_amount
         FROM payment_allocations
         WHERE allocation_status = 'active' AND invoice_id = ANY($1::uuid[])
         GROUP BY invoice_id
       ) allocations ON allocations.invoice_id = invoices.id
       WHERE invoices.id = ANY($1::uuid[]) AND invoices.invoice_status <> 'void'`,
      [invoiceIds],
    );
    return Number(result.rows[0]?.outstanding_amount ?? 0);
  }

  private async lockLedger(client: PoolClient, leaseId: string): Promise<DepositLedgerRow[]> {
    const result = await client.query<DepositLedgerRow>(
      `SELECT id, transaction_type, direction, amount, reason_type, reason, settlement_status, created_at
       FROM lease_deposit_transactions WHERE lease_id = $1 ORDER BY created_at, id FOR UPDATE`,
      [leaseId],
    );
    return result.rows;
  }

  private async lockRefund(
    client: PoolClient,
    refundId: string,
    leaseId: string,
  ): Promise<DepositLedgerRow> {
    const result = await client.query<DepositLedgerRow>(
      `SELECT id, transaction_type, direction, amount, reason_type, reason, settlement_status, created_at
       FROM lease_deposit_transactions
       WHERE id = $1 AND lease_id = $2 AND transaction_type = 'refund' AND direction = 'debit'
       FOR UPDATE`,
      [refundId, leaseId],
    );
    if (!result.rows[0])
      throw new NotFoundException({
        code: 'REFUND_NOT_FOUND',
        message: 'Refund transaction not found',
      });
    return result.rows[0];
  }

  private async insertDepositEntry(
    client: PoolClient,
    input: {
      propertyId: string;
      leaseId: string;
      transactionType: DepositTransactionType;
      direction: DepositDirection;
      amount: number;
      paymentId?: string | null;
      transferRecordId?: string | null;
      reasonType?: string | null;
      reason?: string | null;
      externalReference?: string | null;
      settlementStatus: RefundSettlementStatus;
      metadata: Record<string, unknown>;
      actorUserId: string;
    },
  ): Promise<DepositLedgerRow> {
    const result = await client.query<DepositLedgerRow>(
      `INSERT INTO lease_deposit_transactions (
         property_id, lease_id, transaction_type, direction, amount, payment_id, transfer_record_id,
         reason_type, reason, external_reference, settlement_status, metadata, created_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
       RETURNING id, transaction_type, direction, amount, reason_type, reason, settlement_status, created_at`,
      [
        input.propertyId,
        input.leaseId,
        input.transactionType,
        input.direction,
        input.amount,
        input.paymentId ?? null,
        input.transferRecordId ?? null,
        input.reasonType ?? null,
        input.reason ?? null,
        input.externalReference ?? null,
        input.settlementStatus,
        JSON.stringify(input.metadata),
        input.actorUserId,
      ],
    );
    return result.rows[0];
  }

  private async refreshDepositCache(client: PoolClient, leaseId: string, actorUserId: string) {
    const result = await client.query<{
      deposit_collected_amount: string;
      deposit_deduction_amount: string;
      deposit_refunded_amount: string;
    }>(
      `WITH totals AS (
         SELECT
           COALESCE(sum(amount) FILTER (WHERE transaction_type IN ('collection', 'top_up') AND direction = 'credit'), 0) AS collected,
           COALESCE(sum(amount) FILTER (WHERE transaction_type = 'deduction' AND direction = 'debit'), 0) AS deducted,
           COALESCE(sum(amount) FILTER (WHERE transaction_type = 'refund' AND direction = 'debit'), 0) AS refunded
         FROM lease_deposit_transactions WHERE lease_id = $1
       )
       UPDATE leases
       SET deposit_collected_amount = totals.collected,
           deposit_deduction_amount = totals.deducted,
           deposit_refunded_amount = totals.refunded,
           updated_by_user_id = $2,
           updated_at = now()
       FROM totals
       WHERE leases.id = $1
       RETURNING leases.deposit_collected_amount, leases.deposit_deduction_amount, leases.deposit_refunded_amount`,
      [leaseId, actorUserId],
    );
    const ledger = await this.lockLedger(client, leaseId);
    const required = await client.query<{ snapshot_deposit_amount: string }>(
      `SELECT snapshot_deposit_amount FROM leases WHERE id = $1`,
      [leaseId],
    );
    return this.depositSummary(
      ledger,
      Number(required.rows[0]?.snapshot_deposit_amount ?? 0),
      result.rows[0],
    );
  }

  private async createVerifiedDepositPayment(
    client: PoolClient,
    propertyId: string,
    residentId: string,
    amount: number,
    payment: NonNullable<CollectDepositDto['payment']>,
    actorUserId: string,
  ): Promise<PaymentRow> {
    const paymentCode =
      payment.payment_code?.trim() ||
      `DPT-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    const result = await client.query<PaymentRow>(
      `INSERT INTO payments (
         property_id, resident_id, payment_code, payment_method, payment_status, amount,
         paid_at, verified_at, received_by_user_id, verified_by_user_id, reference_number, notes
       ) VALUES ($1, $2, $3, $4, 'verified', $5, COALESCE($6::timestamptz, now()), now(), $7, $7, $8, $9)
       RETURNING id, payment_code`,
      [
        propertyId,
        residentId,
        paymentCode,
        payment.payment_method,
        amount,
        payment.paid_at ?? null,
        actorUserId,
        payment.reference_number?.trim() ?? null,
        payment.notes?.trim() ?? null,
      ],
    );
    return result.rows[0];
  }

  private async assertResidentFiles(
    client: PoolClient,
    propertyId: string,
    ktpFileId?: string,
    profilePhotoFileId?: string,
  ): Promise<void> {
    if (ktpFileId) await this.assertFile(client, propertyId, ktpFileId, 'ktp');
    if (profilePhotoFileId)
      await this.assertFile(client, propertyId, profilePhotoFileId, 'profile_photo', true);
  }

  private async assertDamageFiles(
    client: PoolClient,
    propertyId: string,
    fileIds: string[],
  ): Promise<void> {
    for (const fileId of fileIds) await this.assertFile(client, propertyId, fileId);
  }

  private async assertFile(
    client: PoolClient,
    propertyId: string,
    fileId: string,
    expectedPurpose?: 'ktp' | 'profile_photo',
    imageOnly = false,
  ): Promise<void> {
    const result = await client.query<{
      property_id: string;
      file_purpose: string;
      mime_type: string;
      is_deleted: boolean;
    }>(
      `SELECT property_id, file_purpose, mime_type, is_deleted FROM files WHERE id = $1 FOR SHARE`,
      [fileId],
    );
    const file = result.rows[0];
    if (
      !file ||
      file.is_deleted ||
      file.property_id !== propertyId ||
      (expectedPurpose !== undefined && file.file_purpose !== expectedPurpose) ||
      (imageOnly && !['image/jpeg', 'image/png', 'image/webp'].includes(file.mime_type))
    ) {
      throw new UnprocessableEntityException({
        code: 'RESIDENT_FILE_INVALID',
        message: 'File is not active, scoped, or suitable for this lease command',
      });
    }
  }

  private async insertHistory(
    client: PoolClient,
    propertyId: string,
    leaseId: string,
    eventType: string,
    actorUserId: string,
    eventDate: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO lease_history (property_id, lease_id, event_type, actor_user_id, event_date, metadata)
       VALUES ($1, $2, $3, $4, $5::date, $6::jsonb)`,
      [propertyId, leaseId, eventType, actorUserId, eventDate, JSON.stringify(metadata)],
    );
  }

  private async writeAudit(
    client: PoolClient,
    actorUserId: string,
    propertyId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    beforeData: Record<string, unknown> | undefined,
    afterData: Record<string, unknown>,
    context: LeaseAuditContext,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_logs (
         actor_user_id, property_id, action, resource_type, resource_id,
         before_data, after_data, result_status, ip_address, user_agent, correlation_id
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 'success', $8::inet, $9, $10)`,
      [
        actorUserId,
        propertyId,
        action,
        resourceType,
        resourceId,
        beforeData ? JSON.stringify(beforeData) : null,
        JSON.stringify(afterData),
        context.ipAddress ?? null,
        context.userAgent ?? null,
        context.correlationId ?? null,
      ],
    );
  }

  private async writeOutbox(
    client: PoolClient,
    input: {
      propertyId: string;
      eventKey: string;
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
      actorUserId: string;
      correlationId?: string;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO business_events (
         property_id, event_key, event_type, aggregate_type, aggregate_id,
         payload, correlation_id, actor_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       ON CONFLICT (event_key) DO NOTHING`,
      [
        input.propertyId,
        input.eventKey,
        input.eventType,
        input.aggregateType,
        input.aggregateId,
        JSON.stringify(input.payload),
        input.correlationId ?? null,
        input.actorUserId,
      ],
    );
  }

  private async getLeasePresentationRows(client: PoolClient, lease: LeaseLockRow) {
    const result = await client.query<{ full_name: string; number: string; name: string }>(
      `SELECT residents.full_name, rooms.number, kost_types.name
       FROM residents
       JOIN rooms ON rooms.id = $2
       JOIN kost_types ON kost_types.id = $3
       WHERE residents.id = $1`,
      [lease.resident_id, lease.room_id, lease.kost_type_id],
    );
    const row = result.rows[0];
    return this.publicLease(lease, row.full_name, row.number, row.name);
  }

  private async jakartaToday(client: PoolClient): Promise<string> {
    const result = await client.query<{ today: string }>(
      `SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS today`,
    );
    return result.rows[0].today;
  }

  private publicLease(
    lease: LeaseLockRow,
    residentName: string,
    roomNumber: string,
    kostTypeName: string,
  ) {
    return {
      id: lease.id,
      property_id: lease.property_id,
      lease_code: lease.lease_code,
      lease_status: lease.lease_status,
      start_date: lease.start_date,
      end_date: lease.end_date,
      billing_cycle: lease.billing_cycle,
      billing_anchor_day: lease.billing_anchor_day,
      next_billing_date: lease.next_billing_date,
      notes: lease.notes,
      snapshot: {
        monthly_price: Number(lease.snapshot_monthly_price),
        yearly_price: Number(lease.snapshot_yearly_price),
        deposit_amount: Number(lease.snapshot_deposit_amount),
        room_number: lease.snapshot_room_number,
        kost_type_name: lease.snapshot_kost_type_name,
      },
      resident: {
        id: lease.resident_id,
        full_name_masked: this.maskName(residentName),
        has_ktp_document: false,
        has_profile_photo: false,
      },
      room: { id: lease.room_id, number: roomNumber },
      kost_type: { id: lease.kost_type_id, name: kostTypeName },
    };
  }

  private toDetail(lease: LeaseDetailRow) {
    return this.publicLease(lease, lease.resident_name, lease.room_number, lease.kost_type_name);
  }

  private toSummary(row: SummaryRow): LeaseSummary {
    return {
      id: row.id,
      property_id: row.property_id,
      lease_code: row.lease_code,
      lease_status: row.lease_status,
      start_date: row.start_date,
      end_date: row.end_date,
      billing_cycle: row.billing_cycle,
      billing_anchor_day: row.billing_anchor_day,
      next_billing_date: row.next_billing_date,
      resident: { id: row.resident_id, full_name_masked: this.maskName(row.resident_name) },
      room: { id: row.room_id, number: row.room_number },
      kost_type: { id: row.kost_type_id, name: row.kost_type_name },
      last_invoice: row.last_invoice_id
        ? {
            id: row.last_invoice_id,
            invoice_code: row.last_invoice_code as string,
            invoice_status: row.last_invoice_status as string,
            due_date: row.last_invoice_due_date as string,
            total_amount: Number(row.last_invoice_total_amount),
          }
        : null,
      outstanding_amount: Number(row.outstanding_amount),
    };
  }

  private toLedger(row: DepositLedgerRow): LeaseDepositEntry {
    return {
      id: row.id,
      transaction_type: row.transaction_type,
      direction: row.direction,
      amount: Number(row.amount),
      reason_type: row.reason_type,
      reason: row.reason,
      settlement_status: row.settlement_status,
      created_at: row.created_at,
    };
  }

  private toInvoiceRead(row: InvoiceReadRow) {
    return {
      id: row.id,
      invoice_code: row.invoice_code,
      invoice_status: row.invoice_status,
      cycle_start_date: row.cycle_start_date,
      cycle_end_date: row.cycle_end_date,
      due_date: row.due_date,
      total_amount: Number(row.total_amount),
      outstanding_amount: Number(row.outstanding_amount),
    };
  }

  private depositSummary(
    ledger: Array<DepositLedgerRow | LeaseDepositEntry>,
    requiredAmount: number,
    cache?: {
      deposit_collected_amount: string;
      deposit_deduction_amount: string;
      deposit_refunded_amount: string;
    },
  ) {
    const values = ledger.map((entry) => ({
      transaction_type: entry.transaction_type,
      direction: entry.direction,
      amount: Number(entry.amount),
    }));
    const balance = values.reduce(
      (total, entry) => total + (entry.direction === 'credit' ? entry.amount : -entry.amount),
      0,
    );
    return {
      required_amount: requiredAmount,
      collected_amount: cache
        ? Number(cache.deposit_collected_amount)
        : values
            .filter((entry) => ['collection', 'top_up'].includes(entry.transaction_type))
            .reduce((total, entry) => total + entry.amount, 0),
      deduction_amount: cache
        ? Number(cache.deposit_deduction_amount)
        : values
            .filter((entry) => entry.transaction_type === 'deduction')
            .reduce((total, entry) => total + entry.amount, 0),
      refunded_amount: cache
        ? Number(cache.deposit_refunded_amount)
        : values
            .filter((entry) => entry.transaction_type === 'refund')
            .reduce((total, entry) => total + entry.amount, 0),
      balance_amount: balance,
    };
  }

  private maskName(value: string): string {
    return value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => `${part[0] ?? ''}${'*'.repeat(Math.max(0, part.length - 1))}`)
      .join(' ');
  }

  private assertPropertyScope(user: UserAccessContext, propertyId: string): void {
    if (user.roles.includes('owner') || user.propertyIds.includes(propertyId)) return;
    throw new ForbiddenException({
      code: 'PROPERTY_SCOPE_DENIED',
      message: 'User is not allowed to access this property',
    });
  }

  private scopeIds(user: UserAccessContext): string[] | null {
    return user.roles.includes('owner') ? null : user.propertyIds;
  }

  private assertFinancialActor(user: UserAccessContext): void {
    if (
      !user.roles.some((role) => role === 'owner' || role === 'manager') ||
      !user.permissions.includes('billing.manage')
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only an owner or manager with billing.manage may perform financial lease actions',
      });
    }
  }

  private assertExactlyOneResident(dto: CreateLeaseDto): void {
    if (Boolean(dto.resident_id) === Boolean(dto.resident)) {
      throw new BadRequestException({
        code: 'LEASE_RESIDENT_INPUT_INVALID',
        message: 'Provide exactly one of resident_id or resident',
      });
    }
  }

  private assertOnlyNotes(dto: UpdateLeaseDto): void {
    const immutable = [
      'room_id',
      'resident_id',
      'start_date',
      'billing_cycle',
      'billing_anchor_day',
      'lease_status',
    ] as const;
    if (immutable.some((field) => dto[field] !== undefined)) {
      throw new BadRequestException({
        code: 'LEASE_COMMERCIAL_FIELD_IMMUTABLE',
        message: 'Commercial lease fields cannot be changed',
      });
    }
    if (dto.notes === undefined) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'notes is required for a lease update',
      });
    }
  }

  private requireIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key)
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    if (key.length < 16 || key.length > 128) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Idempotency-Key must be 16 to 128 characters',
      });
    }
    return key;
  }

  private requestFingerprint(value: unknown): string {
    return createHash('sha256').update(this.canonicalJson(value)).digest('hex');
  }

  private canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${this.canonicalJson(record[key])}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private newLeaseCode(today: string): string {
    return `LS-${today.replaceAll('-', '')}-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
  }

  private leaseColumns(prefix = ''): string {
    const p = prefix ? `${prefix}.` : '';
    return `${p}id, ${p}property_id, ${p}lease_code, ${p}resident_id, ${p}room_id, ${p}occupancy_id, ${p}kost_type_id,
            ${p}lease_status, ${p}start_date::text, ${p}end_date::text, ${p}billing_cycle, ${p}billing_anchor_day,
            ${p}next_billing_date::text, ${p}snapshot_monthly_price, ${p}snapshot_yearly_price, ${p}snapshot_deposit_amount,
            ${p}snapshot_room_number, ${p}snapshot_kost_type_name, ${p}notes,
            ${p}deposit_collected_amount, ${p}deposit_deduction_amount, ${p}deposit_refunded_amount`;
  }

  private rethrowKnownDatabaseConflict(error: unknown): never {
    if (error instanceof Error && 'code' in error) {
      const code = (error as Error & { code?: string; constraint?: string }).code;
      const constraint = (error as Error & { constraint?: string }).constraint;
      if (code === '23505') {
        if (
          constraint?.includes('resident') ||
          constraint?.includes('occupancies_one_active_resident')
        ) {
          throw new ConflictException({
            code: 'LEASE_RESIDENT_CONFLICT',
            message: 'Resident already has an active lease or occupancy',
          });
        }
        if (constraint?.includes('room') || constraint?.includes('occupancies_one_active_room')) {
          throw new ConflictException({
            code: 'LEASE_ROOM_CONFLICT',
            message: 'Room already has an active lease or occupancy',
          });
        }
      }
    }
    throw error;
  }
}
