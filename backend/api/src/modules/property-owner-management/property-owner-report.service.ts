import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { UserAccessContext } from '../iam/types/iam.types';
import { RequestAuditContext } from '../property/types/property.types';
import {
  CreateOwnerSettlementAdjustmentDto,
  OwnerSettlementPeriodDto,
  OwnerSettlementReportQueryDto,
  RecordOwnerPayoutDto,
} from './dto/property-owner-management.dto';

type SettlementRow = {
  id: string;
  owner_profile_id: string;
  full_name: string;
  period_start: string;
  period_end: string;
  settlement_status: 'draft' | 'ready_for_review' | 'approved' | 'paid' | 'void';
  gross_amount: string;
  owner_amount: string;
  operator_fee_amount: string;
  source_checksum: string | null;
  review_source_checksum: string | null;
};

type IdempotencyRow = {
  request_fingerprint: string;
  command_status: 'pending' | 'succeeded' | 'failed';
  response_body: unknown;
};

@Injectable()
export class PropertyOwnerReportService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditRepository,
  ) {}

  async list(actor: UserAccessContext, query: OwnerSettlementReportQueryDto) {
    this.assertPropertyScope(actor, query.property_id);
    const period = this.period(query.period);
    const search = query.q?.trim() ? `%${query.q.trim()}%` : null;
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const actionable = query.actionable_only === 'true';
    const result = await this.database.client.query(
      `WITH owner_assets AS (
         SELECT profiles.id AS owner_profile_id,
                COUNT(DISTINCT owned.room_id)::int AS room_count,
                COUNT(DISTINCT owned.room_id) FILTER (WHERE rooms.room_status = 'occupied')::int AS occupied_room_count,
                string_agg(DISTINCT rooms.category, ',' ORDER BY rooms.category) AS categories
         FROM property_owner_profiles profiles
         LEFT JOIN LATERAL (
           SELECT rooms.id AS room_id
           FROM building_owner_assignments assignments
           JOIN rooms ON rooms.building_id = assignments.building_id
             AND rooms.property_id = assignments.property_id
           WHERE assignments.owner_profile_id = profiles.id
             AND assignments.property_id = profiles.property_id
             AND assignments.effective_from < $3::date
             AND (assignments.effective_until IS NULL OR assignments.effective_until >= $2::date)
           UNION
           SELECT assignments.room_id
           FROM room_owner_assignments assignments
           WHERE assignments.owner_profile_id = profiles.id
             AND assignments.property_id = profiles.property_id
             AND assignments.effective_from < $3::date
             AND (assignments.effective_until IS NULL OR assignments.effective_until >= $2::date)
         ) owned ON true
         LEFT JOIN rooms ON rooms.id = owned.room_id
         WHERE profiles.property_id = $1
         GROUP BY profiles.id
       ), live_amounts AS (
         SELECT earnings.owner_profile_id,
                COALESCE(SUM(earnings.gross_collected_amount), 0)::bigint AS gross_amount,
                COALESCE(SUM(earnings.owner_earned_amount), 0)::bigint AS owner_amount,
                COALESCE(SUM(earnings.operator_fee_amount), 0)::bigint AS operator_fee_amount,
                COUNT(*)::int AS earning_count
         FROM property_owner_earnings earnings
         WHERE earnings.property_id = $1 AND earnings.earning_status = 'recognized'
           AND earnings.earning_month = $2::date
         GROUP BY earnings.owner_profile_id
       ), payout_totals AS (
         SELECT payouts.settlement_id,
                COALESCE(SUM(CASE WHEN payouts.payout_kind='payout' THEN payouts.payout_amount ELSE -payouts.payout_amount END), 0)::bigint AS paid_amount
         FROM property_owner_payouts payouts GROUP BY payouts.settlement_id
       ), report_rows AS (
         SELECT profiles.id AS owner_id, profiles.full_name, profiles.phone, profiles.email,
                COALESCE(owner_assets.room_count, 0) AS room_count,
                COALESCE(owner_assets.occupied_room_count, 0) AS occupied_room_count,
                COALESCE(live_amounts.gross_amount, 0)::bigint AS live_gross_amount,
                COALESCE(live_amounts.owner_amount, 0)::bigint AS live_owner_amount,
                COALESCE(live_amounts.operator_fee_amount, 0)::bigint AS live_operator_fee_amount,
                COALESCE(live_amounts.earning_count, 0)::int AS earning_count,
                settlements.id AS settlement_id, settlements.settlement_status,
                settlements.gross_amount::bigint AS settled_gross_amount,
                settlements.owner_amount::bigint AS settled_owner_amount,
                settlements.operator_fee_amount::bigint AS settled_operator_fee_amount,
                settlements.source_checksum,
                publications.id AS publication_id, publications.document_number,
                publications.published_at,
                COALESCE(payout_totals.paid_amount, 0)::bigint AS payout_recorded,
                CASE
                  WHEN settlements.id IS NULL THEN 'not_prepared'
                  ELSE settlements.settlement_status
                END AS review_status,
                CASE WHEN publications.id IS NULL THEN 'not_published' ELSE 'published' END AS publication_status,
                CASE
                  WHEN COALESCE(payout_totals.paid_amount, 0) = 0 THEN 'not_paid'
                  WHEN COALESCE(payout_totals.paid_amount, 0) >= COALESCE(settlements.owner_amount, 0) THEN 'paid'
                  ELSE 'partially_paid'
                END AS payout_status,
                owner_assets.categories
         FROM property_owner_profiles profiles
         LEFT JOIN owner_assets ON owner_assets.owner_profile_id = profiles.id
         LEFT JOIN live_amounts ON live_amounts.owner_profile_id = profiles.id
         LEFT JOIN property_owner_settlements settlements ON settlements.owner_profile_id = profiles.id
           AND settlements.property_id = $1 AND settlements.period_start = $2::date
           AND settlements.period_end = ($3::date - 1)
         LEFT JOIN property_owner_settlement_publications publications ON publications.settlement_id = settlements.id
           AND publications.publication_status = 'published'
         LEFT JOIN payout_totals ON payout_totals.settlement_id = settlements.id
         WHERE profiles.property_id = $1 AND profiles.profile_status = 'active'
       )
       SELECT report_rows.*,
              CASE WHEN settlement_id IS NULL THEN live_gross_amount ELSE settled_gross_amount END::text AS gross_amount,
              CASE WHEN settlement_id IS NULL THEN live_owner_amount ELSE settled_owner_amount END::text AS owner_amount,
              CASE WHEN settlement_id IS NULL THEN live_operator_fee_amount ELSE settled_operator_fee_amount END::text AS operator_fee_amount,
              GREATEST((CASE WHEN settlement_id IS NULL THEN live_owner_amount ELSE settled_owner_amount END) - payout_recorded, 0)::text AS payout_outstanding,
              COUNT(*) OVER()::int AS total_count,
              SUM(CASE WHEN settlement_id IS NULL THEN live_owner_amount ELSE settled_owner_amount END) OVER()::text AS total_owner_amount,
              SUM(CASE WHEN publication_status='published' THEN
                CASE WHEN settlement_id IS NULL THEN live_owner_amount ELSE settled_owner_amount END ELSE 0 END) OVER()::text AS total_published_amount,
              SUM(payout_recorded) OVER()::text AS total_payout_recorded,
              SUM(GREATEST((CASE WHEN settlement_id IS NULL THEN live_owner_amount ELSE settled_owner_amount END) - payout_recorded, 0)) OVER()::text AS total_payout_outstanding
       FROM report_rows
       WHERE ($4::text IS NULL OR full_name ILIKE $4 OR phone ILIKE $4 OR email ILIKE $4)
         AND ($5::text IS NULL OR categories LIKE '%' || $5 || '%')
         AND ($6::text IS NULL OR review_status = $6)
         AND ($7::text IS NULL OR publication_status = $7)
         AND ($8::text IS NULL OR payout_status = $8)
         AND ($9::boolean = false OR review_status <> 'paid')
       ORDER BY CASE review_status
         WHEN 'ready_for_review' THEN 1 WHEN 'approved' THEN 2 WHEN 'draft' THEN 3
         WHEN 'not_prepared' THEN 4 ELSE 5 END, full_name
       LIMIT $10 OFFSET $11`,
      [
        query.property_id,
        period.start,
        period.until,
        search,
        query.category ?? null,
        query.review_status ?? null,
        query.publication_status ?? null,
        query.payout_status ?? null,
        actionable,
        limit,
        offset,
      ],
    );
    const aggregate = result.rows[0] ?? {};
    const rows = result.rows.map((row: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('total_'))),
    );
    const summary = {
      owners: Number(aggregate.total_count ?? 0),
      owner_amount: Number(aggregate.total_owner_amount ?? 0),
      published_amount: Number(aggregate.total_published_amount ?? 0),
      payout_recorded: Number(aggregate.total_payout_recorded ?? 0),
      payout_outstanding: Number(aggregate.total_payout_outstanding ?? 0),
    };
    return {
      period: query.period,
      generated_at: new Date().toISOString(),
      summary,
      data: rows,
      meta: { limit, offset, total: Number(result.rows[0]?.total_count ?? 0) },
    };
  }

  async detail(actor: UserAccessContext, ownerId: string, propertyId: string, periodValue: string) {
    this.assertPropertyScope(actor, propertyId);
    const period = this.period(periodValue);
    const owner = await this.database.client.query(
      `SELECT id, full_name, phone, email FROM property_owner_profiles
       WHERE id=$1 AND property_id=$2`,
      [ownerId, propertyId],
    );
    if (owner.rows.length !== 1) this.ownerNotFound();
    const [settlement, lines, payouts, adjustments] = await Promise.all([
      this.database.client.query(
        `SELECT settlements.*, publications.id AS publication_id,
                publications.document_number, publications.published_at,
                COALESCE((SELECT SUM(CASE WHEN payout_kind='payout' THEN payout_amount ELSE -payout_amount END)
                          FROM property_owner_payouts WHERE settlement_id=settlements.id),0)::text AS payout_recorded
         FROM property_owner_settlements settlements
         LEFT JOIN property_owner_settlement_publications publications
           ON publications.settlement_id=settlements.id AND publications.publication_status='published'
         WHERE settlements.owner_profile_id=$1 AND settlements.property_id=$2
           AND settlements.period_start=$3::date AND settlements.period_end=($4::date - 1)`,
        [ownerId, propertyId, period.start, period.until],
      ),
      this.database.client.query(
        `SELECT earnings.id AS earning_id, rooms.room_code, rooms.category,
                buildings.building_name, residents.full_name AS resident_name,
                leases.lease_code, leases.term_months, leases.start_date::text, leases.end_date::text,
                leases.contract_rent_amount::text AS contract_value,
                COALESCE((SELECT SUM(payments.amount) FROM payments
                          WHERE payments.lease_id=leases.id AND payments.payment_status='verified'
                            AND payments.payment_purpose IN ('rent','dp')),0)::text AS verified_collection,
                earnings.service_from::text, earnings.service_until::text,
                earnings.gross_collected_amount::text AS gross_amount,
                earnings.operator_fee_amount::text AS operator_fee_amount,
                earnings.owner_earned_amount::text AS owner_amount
         FROM property_owner_earnings earnings
         JOIN rooms ON rooms.id=earnings.room_id
         LEFT JOIN room_buildings buildings ON buildings.id=rooms.building_id
         LEFT JOIN leases ON leases.id=earnings.lease_id
         LEFT JOIN payments ON payments.id=earnings.payment_id
         LEFT JOIN residents ON residents.id=payments.resident_id
         WHERE earnings.owner_profile_id=$1 AND earnings.property_id=$2
           AND earnings.earning_status='recognized' AND earnings.earning_month=$3::date
         ORDER BY rooms.room_code, earnings.service_from, earnings.id`,
        [ownerId, propertyId, period.start],
      ),
      this.database.client.query(
        `SELECT payouts.id, payouts.payout_kind, payouts.payout_amount::text,
                payouts.payout_method, payouts.payout_reference,
                destinations.destination_mask,
                COALESCE(payouts.transferred_at, payouts.recorded_at) AS transferred_at,
                payouts.recorded_at
         FROM property_owner_payouts payouts
         JOIN property_owner_settlements settlements ON settlements.id=payouts.settlement_id
         JOIN property_owner_payout_destination_snapshots destinations
           ON destinations.id=payouts.payout_destination_snapshot_id
         WHERE settlements.owner_profile_id=$1 AND settlements.property_id=$2
           AND settlements.period_start=$3::date AND settlements.period_end=($4::date - 1)
         ORDER BY payouts.recorded_at DESC`,
        [ownerId, propertyId, period.start, period.until],
      ),
      this.database.client.query(
        `SELECT adjustments.id, adjustments.adjustment_kind,
                adjustments.gross_amount_delta::text,
                adjustments.owner_amount_delta::text,
                adjustments.operator_fee_amount_delta::text,
                adjustments.reason, adjustments.created_at::text
         FROM property_owner_earning_adjustments adjustments
         WHERE adjustments.owner_profile_id=$1 AND adjustments.property_id=$2
           AND adjustments.effective_month=$3::date
           AND adjustments.adjustment_status='approved'
         ORDER BY adjustments.created_at DESC`,
        [ownerId, propertyId, period.start],
      ),
    ]);
    return {
      owner: owner.rows[0],
      period: periodValue,
      settlement: settlement.rows[0] ?? null,
      lines: lines.rows,
      payouts: payouts.rows,
      adjustments: adjustments.rows,
    };
  }

  prepare(
    actor: UserAccessContext,
    ownerId: string,
    dto: OwnerSettlementPeriodDto,
    idempotencyKey: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.command(
      actor,
      ownerId,
      dto,
      idempotencyKey,
      context,
      'prepare',
      async (client, period) => {
        await client.query('SELECT recognize_property_owner_earnings($1, $2::date)', [
          dto.property_id,
          period.end,
        ]);
        const existing = await this.lockSettlement(client, ownerId, dto.property_id, period);
        if (existing) {
          throw new ConflictException({
            code: 'PROPERTY_OWNER_SETTLEMENT_ALREADY_PREPARED',
            message: 'Laporan periode ini sudah disiapkan.',
          });
        }
        const earnings = await client.query<{
          id: string;
          gross_collected_amount: string;
          owner_earned_amount: string;
          operator_fee_amount: string;
        }>(
          `SELECT id, gross_collected_amount::text, owner_earned_amount::text,
                operator_fee_amount::text
         FROM property_owner_earnings
         WHERE property_id=$1 AND owner_profile_id=$2 AND earning_status='recognized'
           AND earning_month=$3::date
           AND NOT EXISTS (SELECT 1 FROM property_owner_settlement_lines WHERE earning_id=property_owner_earnings.id)
         ORDER BY id FOR SHARE`,
          [dto.property_id, ownerId, period.start],
        );
        const totals = this.totals(earnings.rows);
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO property_owner_settlements (
           property_id, owner_profile_id, period_start, period_end,
           gross_amount, owner_amount, operator_fee_amount, settlement_status,
           reference, notes, created_by_user_id, source_checksum
         ) VALUES ($1,$2,$3::date,$4::date,$5,$6,$7,'draft',$8,$9,$10,$11)
         RETURNING id`,
          [
            dto.property_id,
            ownerId,
            period.start,
            period.end,
            totals.gross.toString(),
            totals.owner.toString(),
            totals.fee.toString(),
            `OWNER-${dto.period.replace('-', '')}`,
            dto.notes?.trim() || null,
            actor.id,
            null,
          ],
        );
        if (earnings.rows.length) {
          await client.query(
            `INSERT INTO property_owner_settlement_lines (settlement_id, earning_id)
           SELECT $1, unnest($2::uuid[])`,
            [inserted.rows[0].id, earnings.rows.map((row) => row.id)],
          );
        }
        const checksum = await this.currentChecksum(client, inserted.rows[0].id);
        await client.query(
          `UPDATE property_owner_settlements SET source_checksum=$2, updated_at=now() WHERE id=$1`,
          [inserted.rows[0].id, checksum],
        );
        return {
          settlement_id: inserted.rows[0].id,
          status: 'draft',
          ...this.responseTotals(totals),
        };
      },
    );
  }

  submitReview(
    actor: UserAccessContext,
    ownerId: string,
    dto: OwnerSettlementPeriodDto,
    idempotencyKey: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.transition(
      actor,
      ownerId,
      dto,
      idempotencyKey,
      context,
      'submit-review',
      'draft',
      async (client, settlement) => {
        const checksum = await this.currentChecksum(client, settlement.id);
        await client.query(
          `UPDATE property_owner_settlements SET settlement_status='ready_for_review',
           submitted_for_review_at=now(), submitted_for_review_by_user_id=$2,
           review_source_checksum=$3, updated_at=now() WHERE id=$1`,
          [settlement.id, actor.id, checksum],
        );
        return { settlement_id: settlement.id, status: 'ready_for_review' };
      },
    );
  }

  approve(
    actor: UserAccessContext,
    ownerId: string,
    dto: OwnerSettlementPeriodDto,
    idempotencyKey: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.transition(
      actor,
      ownerId,
      dto,
      idempotencyKey,
      context,
      'approve',
      'ready_for_review',
      async (client, settlement) => {
        const checksum = await this.currentChecksum(client, settlement.id);
        if (!settlement.review_source_checksum || checksum !== settlement.review_source_checksum) {
          throw new ConflictException({
            code: 'PROPERTY_OWNER_SETTLEMENT_CHANGED_AFTER_REVIEW',
            message: 'Data berubah setelah diajukan. Siapkan pemeriksaan ulang sebelum menyetujui.',
          });
        }
        await client.query(
          `UPDATE property_owner_settlements SET settlement_status='approved',
           approved_by_user_id=$2, reviewed_at=now(), updated_at=now() WHERE id=$1`,
          [settlement.id, actor.id],
        );
        return { settlement_id: settlement.id, status: 'approved' };
      },
    );
  }

  publish(
    actor: UserAccessContext,
    ownerId: string,
    dto: OwnerSettlementPeriodDto,
    idempotencyKey: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.transition(
      actor,
      ownerId,
      dto,
      idempotencyKey,
      context,
      'publish',
      'approved',
      async (client, settlement) => {
        const existing = await client.query<{ id: string; document_number: string }>(
          `SELECT id, document_number FROM property_owner_settlement_publications
         WHERE settlement_id=$1 AND publication_status='published'`,
          [settlement.id],
        );
        if (existing.rows[0]) return { ...existing.rows[0], status: 'published' };
        const detail = await this.publicationSnapshot(client, settlement);
        const checksum = createHash('sha256').update(JSON.stringify(detail)).digest('hex');
        const documentNumber = `OWN/${dto.period.replace('-', '')}/${ownerId.slice(0, 8).toUpperCase()}`;
        const publication = await client.query<{
          id: string;
          document_number: string;
          published_at: string;
        }>(
          `INSERT INTO property_owner_settlement_publications (
           property_id, owner_profile_id, settlement_id, document_number,
           snapshot, source_checksum, published_by_user_id
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
         RETURNING id, document_number, published_at`,
          [
            dto.property_id,
            ownerId,
            settlement.id,
            documentNumber,
            JSON.stringify(detail),
            checksum,
            actor.id,
          ],
        );
        return { ...publication.rows[0], status: 'published' };
      },
    );
  }

  recordPayout(
    actor: UserAccessContext,
    ownerId: string,
    dto: RecordOwnerPayoutDto,
    idempotencyKey: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.command(
      actor,
      ownerId,
      dto,
      idempotencyKey,
      context,
      'payouts',
      async (client, period) => {
        const settlement = await this.requireSettlement(client, ownerId, dto.property_id, period);
        if (settlement.settlement_status !== 'approved') {
          throw new ConflictException({
            code: 'PROPERTY_OWNER_PAYOUT_SETTLEMENT_UNAVAILABLE',
            message: 'Setoran hanya dapat dicatat setelah laporan disetujui dan diterbitkan.',
          });
        }
        const publication = await client.query(
          `SELECT id FROM property_owner_settlement_publications
         WHERE settlement_id=$1 AND publication_status='published'`,
          [settlement.id],
        );
        if (!publication.rows[0]) {
          throw new ConflictException({
            code: 'PROPERTY_OWNER_SETTLEMENT_NOT_PUBLISHED',
            message: 'Terbitkan laporan Owner sebelum mencatat setoran.',
          });
        }
        const paid = await client.query<{ total: string }>(
          `SELECT COALESCE(SUM(CASE WHEN payout_kind='payout' THEN payout_amount ELSE -payout_amount END),0)::text AS total
         FROM property_owner_payouts WHERE settlement_id=$1`,
          [settlement.id],
        );
        const outstanding = Number(settlement.owner_amount) - Number(paid.rows[0].total);
        if (dto.amount > outstanding) {
          throw new ConflictException({
            code: 'PROPERTY_OWNER_PAYOUT_REMAINDER_EXCEEDED',
            message: 'Nominal setoran melebihi sisa hak Owner.',
            details: { outstanding },
          });
        }
        const opaqueDestination = createHash('sha256')
          .update(`${ownerId}:${dto.destination_mask}:${randomUUID()}`)
          .digest();
        const destination = await client.query<{ id: string }>(
          `INSERT INTO property_owner_payout_destination_snapshots (
           property_id, owner_profile_id, destination_kind, destination_ciphertext,
           destination_mask, created_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [
            dto.property_id,
            ownerId,
            dto.method === 'bank_transfer' ? 'bank_account' : dto.method,
            opaqueDestination,
            dto.destination_mask,
            actor.id,
          ],
        );
        const payout = await client.query<{
          id: string;
          payout_amount: string;
          payout_reference: string;
          transferred_at: string;
        }>(
          `INSERT INTO property_owner_payouts (
           property_id, owner_profile_id, settlement_id, payout_amount, payout_method,
           payout_reference, payout_destination_snapshot_id, evidence_file_ids,
           recorded_by_user_id, transferred_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::uuid[],$9,$10::timestamptz)
         RETURNING id, payout_amount::text, payout_reference, transferred_at`,
          [
            dto.property_id,
            ownerId,
            settlement.id,
            dto.amount,
            dto.method,
            dto.reference.trim(),
            destination.rows[0].id,
            dto.evidence_file_ids ?? [],
            actor.id,
            dto.transferred_at,
          ],
        );
        const fullyPaid = dto.amount === outstanding;
        if (fullyPaid) {
          await client.query(
            `UPDATE property_owner_settlements SET settlement_status='paid', paid_at=$2::timestamptz,
             updated_at=now() WHERE id=$1`,
            [settlement.id, dto.transferred_at],
          );
        }
        return {
          ...payout.rows[0],
          settlement_id: settlement.id,
          status: fullyPaid ? 'paid' : 'partially_paid',
        };
      },
    );
  }

  addAdjustment(
    actor: UserAccessContext,
    ownerId: string,
    dto: CreateOwnerSettlementAdjustmentDto,
    idempotencyKey: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.command(
      actor,
      ownerId,
      dto,
      idempotencyKey,
      context,
      'adjustments',
      async (client, period) => {
        const settlement = await this.requireSettlement(client, ownerId, dto.property_id, period);
        if (settlement.settlement_status !== 'draft') {
          throw new ConflictException({
            code: 'PROPERTY_OWNER_ADJUSTMENT_DRAFT_REQUIRED',
            message: 'Penyesuaian hanya dapat ditambahkan ketika laporan masih draft.',
          });
        }
        if (
          dto.owner_amount_delta + dto.operator_fee_amount_delta !== dto.gross_amount_delta ||
          dto.gross_amount_delta === 0
        ) {
          throw new ConflictException({
            code: 'PROPERTY_OWNER_ADJUSTMENT_UNBALANCED',
            message: 'Komponen penyesuaian harus seimbang dan tidak boleh nol.',
          });
        }
        const nextGross = Number(settlement.gross_amount) + dto.gross_amount_delta;
        const nextOwner = Number(settlement.owner_amount) + dto.owner_amount_delta;
        const nextFee = Number(settlement.operator_fee_amount) + dto.operator_fee_amount_delta;
        if (nextGross < 0 || nextOwner < 0 || nextFee < 0) {
          throw new ConflictException({
            code: 'PROPERTY_OWNER_ADJUSTMENT_NEGATIVE_TOTAL',
            message: 'Penyesuaian tidak boleh membuat total laporan menjadi negatif.',
          });
        }
        const adjustment = await client.query<{
          id: string;
          adjustment_kind: string;
          gross_amount_delta: string;
          owner_amount_delta: string;
          operator_fee_amount_delta: string;
          reason: string;
          created_at: string;
        }>(
          `INSERT INTO property_owner_earning_adjustments (
             property_id, owner_profile_id, settlement_id, earning_id, effective_month,
             adjustment_kind, gross_amount_delta, owner_amount_delta,
             operator_fee_amount_delta, reason, evidence_file_ids, created_by_user_id
           ) VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,$11::uuid[],$12)
           RETURNING id, adjustment_kind, gross_amount_delta::text,
             owner_amount_delta::text, operator_fee_amount_delta::text, reason, created_at`,
          [
            dto.property_id,
            ownerId,
            settlement.id,
            dto.earning_id,
            period.start,
            dto.adjustment_kind,
            dto.gross_amount_delta,
            dto.owner_amount_delta,
            dto.operator_fee_amount_delta,
            dto.reason.trim(),
            dto.evidence_file_ids ?? [],
            actor.id,
          ],
        );
        await client.query(
          `UPDATE property_owner_settlements SET gross_amount=$2, owner_amount=$3,
             operator_fee_amount=$4, source_checksum=NULL, updated_at=now() WHERE id=$1`,
          [settlement.id, nextGross, nextOwner, nextFee],
        );
        return { ...adjustment.rows[0], settlement_id: settlement.id, status: 'draft' };
      },
    );
  }

  private async transition(
    actor: UserAccessContext,
    ownerId: string,
    dto: OwnerSettlementPeriodDto,
    idempotencyKey: string | undefined,
    context: RequestAuditContext,
    action: string,
    expected: SettlementRow['settlement_status'],
    operation: (client: PoolClient, settlement: SettlementRow) => Promise<unknown>,
  ) {
    return this.command(
      actor,
      ownerId,
      dto,
      idempotencyKey,
      context,
      action,
      async (client, period) => {
        const settlement = await this.requireSettlement(client, ownerId, dto.property_id, period);
        if (settlement.settlement_status !== expected) {
          throw new ConflictException({
            code: 'PROPERTY_OWNER_SETTLEMENT_STATE_CONFLICT',
            message: `Tahap ini memerlukan status ${expected}.`,
          });
        }
        return operation(client, settlement);
      },
    );
  }

  private async command(
    actor: UserAccessContext,
    ownerId: string,
    dto: OwnerSettlementPeriodDto,
    idempotencyKey: string | undefined,
    context: RequestAuditContext,
    action: string,
    operation: (
      client: PoolClient,
      period: ReturnType<PropertyOwnerReportService['period']>,
    ) => Promise<unknown>,
  ) {
    this.assertPropertyScope(actor, dto.property_id);
    const period = this.period(dto.period);
    await this.assertCompleted(period.until);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const route = `/admin/property-owner-reports/:ownerId/${action}`;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ ownerId, ...dto }))
      .digest('hex');
    return this.database.transaction(async (client) => {
      const replay = await this.claimCommand(
        client,
        actor,
        dto.property_id,
        route,
        key,
        fingerprint,
        context,
      );
      if (replay) return replay;
      await this.lockOwner(client, ownerId, dto.property_id);
      const response = await operation(client, period);
      await this.audit.write(
        {
          actorUserId: actor.id,
          propertyId: dto.property_id,
          action: `property_owner.settlement.${action}`,
          resourceType: 'property_owner_settlement',
          resourceId: ownerId,
          afterData: response,
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.completeCommand(client, actor.id, route, key, response, ownerId);
      return response;
    });
  }

  private period(value: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new ConflictException('Periode tidak valid.');
    const [year, month] = value.split('-').map(Number);
    const until = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    return {
      start: `${value}-01`,
      end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
      until,
    };
  }

  private async assertCompleted(periodUntil: string) {
    const result = await this.database.client.query<{ business_date: string }>(
      `SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date::text AS business_date`,
    );
    if (periodUntil > result.rows[0].business_date) {
      throw new ConflictException({
        code: 'PROPERTY_OWNER_REPORT_PERIOD_STILL_OPEN',
        message: 'Hanya bulan yang sudah selesai yang dapat diproses sebagai laporan final.',
      });
    }
  }

  private totals(
    rows: Array<{
      gross_collected_amount: string;
      owner_earned_amount: string;
      operator_fee_amount: string;
    }>,
  ) {
    return rows.reduce(
      (total, row) => ({
        gross: total.gross + BigInt(row.gross_collected_amount),
        owner: total.owner + BigInt(row.owner_earned_amount),
        fee: total.fee + BigInt(row.operator_fee_amount),
      }),
      { gross: 0n, owner: 0n, fee: 0n },
    );
  }

  private responseTotals(total: { gross: bigint; owner: bigint; fee: bigint }) {
    return {
      gross_amount: total.gross.toString(),
      owner_amount: total.owner.toString(),
      operator_fee_amount: total.fee.toString(),
    };
  }

  private checksum(rows: unknown) {
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  }

  private async currentChecksum(client: PoolClient, settlementId: string) {
    const result = await client.query(
      `SELECT source_kind, id, gross_amount, owner_amount, fee_amount FROM (
         SELECT 'earning' AS source_kind, earnings.id,
                earnings.gross_collected_amount::text AS gross_amount,
                earnings.owner_earned_amount::text AS owner_amount,
                earnings.operator_fee_amount::text AS fee_amount
         FROM property_owner_settlement_lines lines
         JOIN property_owner_earnings earnings ON earnings.id=lines.earning_id
         WHERE lines.settlement_id=$1
         UNION ALL
         SELECT 'adjustment', adjustments.id, adjustments.gross_amount_delta::text,
                adjustments.owner_amount_delta::text, adjustments.operator_fee_amount_delta::text
         FROM property_owner_earning_adjustments adjustments
         WHERE adjustments.settlement_id=$1 AND adjustments.adjustment_status='approved'
       ) sources ORDER BY source_kind, id`,
      [settlementId],
    );
    return this.checksum(result.rows);
  }

  private async publicationSnapshot(client: PoolClient, settlement: SettlementRow) {
    const [lines, adjustments] = await Promise.all([
      client.query(
        `SELECT rooms.room_code, rooms.category, buildings.building_name,
                earnings.service_from::text, earnings.service_until::text,
                earnings.gross_collected_amount::text AS gross_amount,
                earnings.operator_fee_amount::text AS operator_fee_amount,
                earnings.owner_earned_amount::text AS owner_amount
         FROM property_owner_settlement_lines settlement_lines
         JOIN property_owner_earnings earnings ON earnings.id=settlement_lines.earning_id
         JOIN rooms ON rooms.id=earnings.room_id
         LEFT JOIN room_buildings buildings ON buildings.id=rooms.building_id
         WHERE settlement_lines.settlement_id=$1
         ORDER BY rooms.room_code, earnings.service_from, earnings.id`,
        [settlement.id],
      ),
      client.query(
        `SELECT adjustment_kind, effective_month::text,
                gross_amount_delta::text, operator_fee_amount_delta::text,
                owner_amount_delta::text, reason
         FROM property_owner_earning_adjustments
         WHERE settlement_id=$1 AND adjustment_status='approved'
         ORDER BY effective_month, created_at, id`,
        [settlement.id],
      ),
    ]);
    return {
      settlement_id: settlement.id,
      owner: { id: settlement.owner_profile_id, full_name: settlement.full_name },
      period: { start: settlement.period_start, end: settlement.period_end },
      totals: {
        gross_amount: settlement.gross_amount,
        operator_fee_amount: settlement.operator_fee_amount,
        owner_amount: settlement.owner_amount,
      },
      lines: lines.rows,
      adjustments: adjustments.rows,
    };
  }

  private async lockSettlement(
    client: PoolClient,
    ownerId: string,
    propertyId: string,
    period: ReturnType<PropertyOwnerReportService['period']>,
  ) {
    const result = await client.query<SettlementRow>(
      `SELECT settlements.*, profiles.full_name
       FROM property_owner_settlements settlements
       JOIN property_owner_profiles profiles ON profiles.id=settlements.owner_profile_id
       WHERE settlements.owner_profile_id=$1 AND settlements.property_id=$2
         AND settlements.period_start=$3::date AND settlements.period_end=$4::date
       FOR UPDATE OF settlements`,
      [ownerId, propertyId, period.start, period.end],
    );
    return result.rows[0] ?? null;
  }

  private async requireSettlement(
    client: PoolClient,
    ownerId: string,
    propertyId: string,
    period: ReturnType<PropertyOwnerReportService['period']>,
  ) {
    const settlement = await this.lockSettlement(client, ownerId, propertyId, period);
    if (!settlement) {
      throw new NotFoundException({
        code: 'PROPERTY_OWNER_SETTLEMENT_NOT_FOUND',
        message: 'Laporan periode Owner belum disiapkan.',
      });
    }
    return settlement;
  }

  private async lockOwner(client: PoolClient, ownerId: string, propertyId: string) {
    const owner = await client.query(
      `SELECT id FROM property_owner_profiles WHERE id=$1 AND property_id=$2
       AND profile_status='active' FOR UPDATE`,
      [ownerId, propertyId],
    );
    if (owner.rows.length !== 1) this.ownerNotFound();
  }

  private ownerNotFound(): never {
    throw new NotFoundException({
      code: 'PROPERTY_OWNER_NOT_FOUND',
      message: 'Owner Property tidak ditemukan.',
    });
  }

  private assertPropertyScope(actor: UserAccessContext, propertyId: string) {
    if (!actor.propertyIds.includes(propertyId)) {
      throw new ForbiddenException({
        code: 'PROPERTY_SCOPE_DENIED',
        message: 'Akses properti ditolak.',
      });
    }
  }

  private requireIdempotencyKey(value: string | undefined) {
    const key = value?.trim();
    if (!key || key.length < 16 || key.length > 128) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key wajib diisi.',
      });
    }
    return key;
  }

  private async claimCommand(
    client: PoolClient,
    actor: UserAccessContext,
    propertyId: string,
    route: string,
    key: string,
    fingerprint: string,
    context: RequestAuditContext,
  ) {
    const inserted = await client.query(
      `INSERT INTO idempotency_commands (
         property_id, actor_user_id, route, idempotency_key, request_fingerprint,
         command_status, correlation_id
       ) VALUES ($1,$2,$3,$4,$5,'pending',$6)
       ON CONFLICT (actor_user_id, route, idempotency_key) DO NOTHING RETURNING id`,
      [propertyId, actor.id, route, key, fingerprint, context.correlationId ?? null],
    );
    if (inserted.rowCount === 1) return null;
    const existing = await client.query<IdempotencyRow>(
      `SELECT request_fingerprint, command_status, response_body FROM idempotency_commands
       WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3 FOR UPDATE`,
      [actor.id, route, key],
    );
    if (existing.rows[0]?.request_fingerprint !== fingerprint) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Kunci permintaan telah digunakan.',
      });
    }
    if (existing.rows[0]?.command_status !== 'succeeded') {
      throw new ConflictException({
        code: 'COMMAND_IN_PROGRESS',
        message: 'Permintaan masih diproses.',
      });
    }
    return existing.rows[0].response_body;
  }

  private async completeCommand(
    client: PoolClient,
    actorId: string,
    route: string,
    key: string,
    response: unknown,
    resourceId: string,
  ) {
    await client.query(
      `UPDATE idempotency_commands SET command_status='succeeded', response_status=200,
         response_body=$4::jsonb, resource_type='property_owner_settlement', resource_id=$5,
         completed_at=now() WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3`,
      [actorId, route, key, JSON.stringify(response), resourceId],
    );
  }
}
