import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { QueryResult } from 'pg';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
import type { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { ReportExportQueryDto, ReportQueryDto } from './dto/report-query.dto';
import { reportToPdf, reportToXlsx } from './report-export.util';
import { REPORT_TYPES, type ReportResult, type ReportRow, type ReportType } from './report.types';

type NormalizedQuery = ReportQueryDto & {
  date_from: string;
  date_to: string;
  limit: number;
  offset: number;
};

type QueryParts = { where: string[]; params: unknown[] };

const titles: Record<ReportType, string> = {
  leases: 'Laporan Penyewaan',
  payments: 'Laporan Pembayaran',
  expenses: 'Laporan Pengeluaran',
  finance: 'Laporan Arus Kas Operasional',
  'property-owners': 'Laporan Hak dan Setoran Owner',
};

const methodologies: Record<ReportType, string> = {
  leases:
    'Nilai kontrak memakai snapshot komersial saat penyewaan dibuat. Status check-out dan penyelesaian akhir berasal dari satu perintah check-out terbaru yang tercatat.',
  payments:
    'Penerimaan hanya dihitung sebagai kas ketika pembayaran berstatus terverifikasi dan tidak dibalik.',
  expenses:
    'Kas keluar hanya dihitung dari pengeluaran berstatus dibayar; pembatalan dan pembalikan tidak menambah beban.',
  finance:
    'Arus kas operasional memisahkan penerimaan sewa, deposit sebagai kewajiban, pengeluaran, dan hak Owner yang tercatat.',
  'property-owners':
    'Laporan hanya memuat periode Owner yang telah disetujui dan diterbitkan. Deposit keamanan tidak dihitung sebagai pendapatan.',
};

@Injectable()
export class ReportService {
  constructor(
    private readonly database: DatabaseService,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
  ) {}

  async preview(actor: UserAccessContext, typeValue: string, input: ReportQueryDto) {
    const type = this.reportType(typeValue);
    const query = this.normalize(input);
    const property = await this.properties.get(actor, query.property_id);
    return this.build(type, query, property.name);
  }

  async export(actor: UserAccessContext, typeValue: string, input: ReportExportQueryDto) {
    const type = this.reportType(typeValue);
    const query = this.normalize({ ...input, limit: 100, offset: 0 });
    const property = await this.properties.get(actor, query.property_id);

    const first = await this.build(type, query, property.name);
    if (first.meta.total > 10_000) {
      throw new BadRequestException({
        code: 'REPORT_EXPORT_TOO_LARGE',
        message: 'Hasil ekspor melebihi 10.000 baris. Persempit periode atau filter laporan.',
      });
    }
    const rows = [...first.rows];
    for (let offset = first.rows.length; offset < first.meta.total; offset += 100) {
      const page = await this.build(type, { ...query, offset });
      rows.push(...page.rows);
    }
    const report = { ...first, rows, meta: { limit: rows.length, offset: 0, total: rows.length } };
    const content = input.format === 'pdf' ? await reportToPdf(report) : reportToXlsx(report);
    const filename = `${type}-${query.date_from}-${query.date_to}.${input.format}`;

    await this.audit.write({
      actorUserId: actor.id,
      propertyId: query.property_id,
      action: 'report.export',
      resourceType: 'report',
      afterData: {
        report_type: type,
        format: input.format,
        date_from: query.date_from,
        date_to: query.date_to,
        row_count: rows.length,
        filter_checksum: report.filter_checksum,
      },
      resultStatus: 'success',
    });

    return {
      filename,
      content,
      filter_checksum: report.filter_checksum,
      content_type:
        input.format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  private async build(
    type: ReportType,
    query: NormalizedQuery,
    propertyName = '',
  ): Promise<ReportResult> {
    const data =
      type === 'leases'
        ? await this.leases(query)
        : type === 'payments'
          ? await this.payments(query)
          : type === 'expenses'
            ? await this.expenses(query)
            : type === 'finance'
              ? await this.finance(query)
              : await this.propertyOwners(query);
    return {
      report_type: type,
      title: titles[type],
      property_name: propertyName,
      period: { date_from: query.date_from, date_to: query.date_to },
      generated_at: new Date().toISOString(),
      filter_checksum: this.checksum(type, query),
      methodology: methodologies[type],
      summary: data.summary,
      rows: data.rows,
      meta: { limit: query.limit, offset: query.offset, total: data.total },
    };
  }

  private async leases(query: NormalizedQuery) {
    const parts: QueryParts = {
      params: [query.property_id, query.date_from, query.date_to],
      where: [],
    };
    const dateBasis = query.date_basis ?? 'active';
    parts.where.push(
      dateBasis === 'started'
        ? `l.start_date BETWEEN $2::date AND $3::date`
        : dateBasis === 'ended'
          ? `l.end_date BETWEEN $2::date AND $3::date`
          : `l.start_date <= $3::date AND COALESCE(l.end_date, 'infinity'::date) >= $2::date`,
    );
    this.commonFilters(parts, query, {
      status: 'l.lease_status',
      category: 'rm.category',
      building: 'rm.building_id',
      gender: 'resident.gender',
      search: `concat_ws(' ', resident.full_name, l.lease_code, rm.room_code, building.building_name, building.building_code)`,
    });
    if (query.payment_plan) this.add(parts, `l.payment_plan_type =`, query.payment_plan);
    if (query.exit_type) this.add(parts, `checkout.exit_type =`, query.exit_type);
    if (query.checkout_status) this.add(parts, `checkout.checkout_status =`, query.checkout_status);
    if (query.financial_status)
      this.add(parts, `checkout.financial_status =`, query.financial_status);
    if (query.same_day)
      parts.where.push(
        query.same_day === 'yes'
          ? `checkout.exit_type='resident_early_termination' AND checkout.notice_days=0`
          : `(checkout.id IS NULL OR checkout.exit_type<>'resident_early_termination' OR checkout.notice_days<>0)`,
      );
    if (query.has_refund)
      parts.where.push(
        query.has_refund === 'yes'
          ? `COALESCE(checkout.final_refund_amount,0)>0`
          : `COALESCE(checkout.final_refund_amount,0)=0`,
      );
    if (query.has_amount_due)
      parts.where.push(
        query.has_amount_due === 'yes'
          ? `COALESCE(checkout.amount_due,0)>0`
          : `COALESCE(checkout.amount_due,0)=0`,
      );
    if (query.has_damage)
      parts.where.push(
        query.has_damage === 'yes'
          ? `COALESCE(checkout.documented_damage_amount,0)>0`
          : `COALESCE(checkout.documented_damage_amount,0)=0`,
      );
    const from = `FROM leases l
      JOIN residents resident ON resident.id = l.resident_id
      JOIN rooms rm ON rm.id = l.room_id
      JOIN room_buildings building ON building.id = rm.building_id
      LEFT JOIN LATERAL (
        SELECT command.id,command.exit_type,command.state AS checkout_status,
               command.notice_days,command.actual_checkout_date::text,
               command.inspection_room_status AS room_result,
               settlement.decision_status AS financial_status,
               COALESCE(settlement.final_refund_amount,0)::bigint AS final_refund_amount,
               COALESCE(settlement.amount_due,0)::bigint AS amount_due,
               COALESCE(settlement.documented_damage_amount,0)::bigint AS documented_damage_amount
        FROM lease_checkout_commands command
        LEFT JOIN lease_exit_final_settlements settlement
          ON settlement.checkout_command_id=command.id
        WHERE command.lease_id=l.id AND command.exit_type IS NOT NULL
        ORDER BY command.created_at DESC,command.id DESC
        LIMIT 1
      ) checkout ON true
      WHERE l.property_id = $1 AND ${parts.where.join(' AND ')}`;
    const page = await this.database.client.query(
      `SELECT l.id, l.lease_code, resident.full_name AS resident_name, resident.gender,
              rm.room_code, building.building_name, rm.category, l.lease_status,
              l.start_date::text, l.end_date::text, COALESCE(l.term_months, 0)::int AS term_months,
              COALESCE(l.payment_plan_type, '-') AS payment_plan,
               COALESCE(l.snapshot_pricing_tier, '-') AS pricing_tier,
               COALESCE(l.pricing_source, 'standard') AS pricing_source,
               COALESCE(l.snapshot_reference_monthly_price, l.snapshot_monthly_price, 0)::int AS reference_monthly_price,
               COALESCE(l.snapshot_monthly_price, 0)::int AS agreed_monthly_price,
               COALESCE(l.snapshot_monthly_price, 0)::int AS monthly_price,
               COALESCE(l.snapshot_monthly_price, 0)::int
                 - COALESCE(l.snapshot_reference_monthly_price, l.snapshot_monthly_price, 0)::int
                 AS monthly_price_variance,
               CASE
                 WHEN COALESCE(l.snapshot_reference_monthly_price, 0) > 0
                   THEN round(
                     (l.snapshot_monthly_price - l.snapshot_reference_monthly_price)::numeric
                     * 100 / l.snapshot_reference_monthly_price,
                     2
                   )
                 ELSE 0
               END AS monthly_price_variance_percent,
               l.pricing_agreement_reason,
               COALESCE(l.contract_rent_amount, l.snapshot_yearly_price, 0)::int AS contract_value,
              checkout.exit_type,checkout.checkout_status,checkout.actual_checkout_date,
              checkout.room_result,checkout.financial_status,
              COALESCE(checkout.final_refund_amount,0)::int AS final_refund_amount,
              COALESCE(checkout.amount_due,0)::int AS final_amount_due,
              COALESCE(checkout.documented_damage_amount,0)::int AS documented_damage_amount,
              COALESCE(checkout.notice_days=0 AND checkout.exit_type='resident_early_termination',false) AS same_day_departure,
              count(*) OVER()::int AS total_count
       ${from}
       ORDER BY l.start_date DESC, l.lease_code DESC
       LIMIT $${parts.params.push(query.limit)} OFFSET $${parts.params.push(query.offset)}`,
      parts.params,
    );
    const summary = await this.database.client.query(
      `SELECT count(*)::int AS total_contracts,
              count(*) FILTER (WHERE l.lease_status = 'active')::int AS active_contracts,
              count(*) FILTER (WHERE l.start_date BETWEEN $2::date AND $3::date)::int AS started_contracts,
              count(*) FILTER (WHERE l.end_date BETWEEN $2::date AND $3::date)::int AS ended_contracts,
              count(*) FILTER (WHERE l.end_date BETWEEN $3::date AND ($3::date + 30))::int AS ending_soon,
              count(*) FILTER (WHERE checkout.id IS NOT NULL)::int AS checkout_total,
              count(*) FILTER (WHERE checkout.checkout_status NOT IN ('completed','cancelled'))::int AS checkout_in_progress,
              count(*) FILTER (WHERE checkout.notice_days=0 AND checkout.exit_type='resident_early_termination')::int AS same_day_departures,
              COALESCE(sum(checkout.final_refund_amount),0)::bigint AS checkout_refund,
              COALESCE(sum(checkout.amount_due),0)::bigint AS checkout_amount_due,
              COALESCE(sum(checkout.documented_damage_amount),0)::bigint AS checkout_damage,
              COALESCE(sum(COALESCE(l.contract_rent_amount, l.snapshot_yearly_price, 0)), 0)::bigint AS contract_value
       ${from}`,
      parts.params.slice(0, -2),
    );
    return this.data(page, summary);
  }

  private async payments(query: NormalizedQuery) {
    const parts: QueryParts = {
      params: [query.property_id, query.date_from, query.date_to],
      where: [],
    };
    const actualDate = `COALESCE(p.paid_at, p.verified_at, p.created_at)`;
    parts.where.push(
      `(${actualDate} AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date`,
    );
    this.commonFilters(parts, query, {
      status: 'p.payment_status',
      category: 'rm.category',
      building: 'rm.building_id',
      search: `concat_ws(' ', resident.full_name, p.payment_code, rm.room_code, building.building_name, building.building_code, p.reference_number)`,
    });
    if (query.method) this.add(parts, `p.payment_method =`, query.method);
    if (query.purpose) this.add(parts, `COALESCE(p.payment_purpose, 'rent') =`, query.purpose);
    if (query.has_evidence)
      parts.where.push(`p.proof_id IS ${query.has_evidence === 'yes' ? 'NOT ' : ''}NULL`);
    const from = `FROM payments p
      LEFT JOIN residents resident ON resident.id = p.resident_id
      LEFT JOIN leases l ON l.id = p.lease_id
      LEFT JOIN rooms rm ON rm.id = l.room_id
      LEFT JOIN room_buildings building ON building.id = rm.building_id
      WHERE p.property_id = $1 AND ${parts.where.join(' AND ')}`;
    const page = await this.database.client.query(
      `SELECT p.id, p.payment_code, COALESCE(resident.full_name, '-') AS resident_name,
              COALESCE(rm.room_code, '-') AS room_code, COALESCE(building.building_name, '-') AS building_name,
              COALESCE(p.payment_purpose, 'rent') AS purpose, p.payment_method AS method,
              p.payment_status AS status, p.amount::int, p.proof_id IS NOT NULL AS has_evidence,
              (${actualDate} AT TIME ZONE 'Asia/Jakarta')::date::text AS payment_date,
              COALESCE(p.reference_number, '-') AS reference_number,
              count(*) OVER()::int AS total_count
       ${from}
       ORDER BY ${actualDate} DESC, p.payment_code DESC
       LIMIT $${parts.params.push(query.limit)} OFFSET $${parts.params.push(query.offset)}`,
      parts.params,
    );
    const summary = await this.database.client.query(
      `SELECT count(*)::int AS total_payments,
              COALESCE(sum(p.amount) FILTER (WHERE p.payment_status = 'verified' AND COALESCE(p.payment_purpose, 'rent') IN ('rent','dp')), 0)::bigint AS verified_rent,
              COALESCE(sum(p.amount) FILTER (WHERE p.payment_status = 'verified' AND p.payment_purpose = 'security_deposit'), 0)::bigint AS deposit_collected,
              COALESCE(sum(p.amount) FILTER (WHERE p.payment_status = 'verified' AND p.payment_purpose = 'other_charge'), 0)::bigint AS other_income,
              COALESCE(sum(p.amount) FILTER (WHERE p.payment_status = 'pending_confirmation'), 0)::bigint AS pending_amount,
              COALESCE(sum(p.amount) FILTER (WHERE p.payment_status = 'reversed'), 0)::bigint AS reversed_amount
       ${from}`,
      parts.params.slice(0, -2),
    );
    return this.data(page, summary);
  }

  private async expenses(query: NormalizedQuery) {
    const parts: QueryParts = {
      params: [query.property_id, query.date_from, query.date_to],
      where: [],
    };
    parts.where.push(`expense.expense_date BETWEEN $2::date AND $3::date`);
    this.commonFilters(parts, query, {
      status: 'expense.expense_status',
      category: 'expense.category',
      building: 'expense.building_id',
      search: `concat_ws(' ', expense.category, expense.vendor_name, expense.notes, building.building_name, building.building_code)`,
    });
    if (query.method) this.add(parts, `expense.payment_method =`, query.method);
    if (query.has_evidence)
      parts.where.push(
        `expense.proof_file_id IS ${query.has_evidence === 'yes' ? 'NOT ' : ''}NULL`,
      );
    const from = `FROM expenses expense
      LEFT JOIN room_buildings building ON building.id = expense.building_id
      WHERE expense.property_id = $1 AND ${parts.where.join(' AND ')}`;
    const page = await this.database.client.query(
      `SELECT expense.id, expense.expense_date::text, expense.category,
              COALESCE(building.building_name, 'Seluruh properti') AS building_name,
              COALESCE(expense.vendor_name, '-') AS vendor_name, expense.payment_method AS method,
              expense.expense_status AS status, expense.amount::int,
              expense.proof_file_id IS NOT NULL AS has_evidence,
              COALESCE(expense.notes, '-') AS notes, count(*) OVER()::int AS total_count
       ${from}
       ORDER BY expense.expense_date DESC, expense.created_at DESC
       LIMIT $${parts.params.push(query.limit)} OFFSET $${parts.params.push(query.offset)}`,
      parts.params,
    );
    const summary = await this.database.client.query(
      `SELECT count(*)::int AS total_expenses,
              COALESCE(sum(expense.amount) FILTER (WHERE expense.expense_status = 'paid'), 0)::bigint AS paid_amount,
              COALESCE(sum(expense.amount) FILTER (WHERE expense.expense_status IN ('draft','pending_approval','approved')), 0)::bigint AS pending_expense_amount,
              COALESCE(sum(expense.amount) FILTER (WHERE expense.expense_status = 'approved'), 0)::bigint AS approved_amount,
              COALESCE(sum(expense.amount) FILTER (WHERE expense.expense_status IN ('cancelled','reversed')), 0)::bigint AS cancelled_or_reversed
       ${from}`,
      parts.params.slice(0, -2),
    );
    return this.data(page, summary);
  }

  private async finance(query: NormalizedQuery) {
    const params: unknown[] = [query.property_id, query.date_from, query.date_to];
    const search = query.q?.trim()
      ? `AND lower(concat_ws(' ', ledger.reference, ledger.description, ledger.room_code, ledger.building_name)) LIKE $${params.push(`%${query.q.trim().toLowerCase()}%`)}`
      : '';
    const category = query.category ? `AND ledger.category = $${params.push(query.category)}` : '';
    const building = query.building_id
      ? `AND ledger.building_id = $${params.push(query.building_id)}`
      : '';
    const ledger = `WITH ledger AS (
      SELECT p.id, (${this.paymentDate('p')} AT TIME ZONE 'Asia/Jakarta')::date AS event_date,
             p.payment_code AS reference,
             CASE COALESCE(p.payment_purpose, 'rent')
               WHEN 'security_deposit' THEN 'Deposit diterima'
               WHEN 'other_charge' THEN 'Penerimaan lainnya'
               ELSE 'Pembayaran sewa' END AS description,
             CASE WHEN p.payment_purpose = 'security_deposit' THEN 'deposit' ELSE 'cash_in' END AS movement,
             p.amount::bigint AS amount, rm.room_code, building.building_name, building.id AS building_id,
             rm.category
      FROM payments p
      LEFT JOIN leases l ON l.id = p.lease_id
      LEFT JOIN rooms rm ON rm.id = l.room_id
      LEFT JOIN room_buildings building ON building.id = rm.building_id
      WHERE p.property_id = $1 AND p.payment_status = 'verified'
        AND (${this.paymentDate('p')} AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date
      UNION ALL
      SELECT expense.id, expense.expense_date, concat('EXP-', left(expense.id::text, 8)), expense.category,
             'cash_out', expense.amount::bigint, NULL, building.building_name, building.id, building.category
      FROM expenses expense
      LEFT JOIN room_buildings building ON building.id = expense.building_id
      WHERE expense.property_id = $1 AND expense.expense_status = 'paid'
        AND expense.expense_date BETWEEN $2::date AND $3::date
      UNION ALL
      SELECT deposit.id, (COALESCE(deposit.settled_at, deposit.created_at) AT TIME ZONE 'Asia/Jakarta')::date,
             concat('DEP-', left(deposit.id::text, 8)), 'Pengembalian deposit', 'deposit_refund',
             deposit.amount::bigint, rm.room_code, building.building_name, building.id, rm.category
      FROM lease_deposit_transactions deposit
      JOIN leases l ON l.id = deposit.lease_id
      JOIN rooms rm ON rm.id = l.room_id
      JOIN room_buildings building ON building.id = rm.building_id
      WHERE deposit.property_id = $1 AND deposit.transaction_type = 'refund'
        AND deposit.direction = 'debit' AND deposit.settlement_status = 'settled'
        AND (COALESCE(deposit.settled_at, deposit.created_at) AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date
    )`;
    const pageParams = [...params];
    const page = await this.database.client.query(
      `${ledger}
       SELECT id, event_date::text, reference, description, movement, amount::int,
              COALESCE(room_code, '-') AS room_code, COALESCE(building_name, 'Seluruh properti') AS building_name,
              count(*) OVER()::int AS total_count
       FROM ledger WHERE true ${search} ${category} ${building}
       ORDER BY event_date DESC, reference DESC
       LIMIT $${pageParams.push(query.limit)} OFFSET $${pageParams.push(query.offset)}`,
      pageParams,
    );
    const count = await this.database.client.query(
      `${ledger}
       SELECT count(*)::int AS total_count
       FROM ledger WHERE true ${search} ${category} ${building}`,
      params,
    );
    const summary = await this.database.client.query(
      `SELECT
        COALESCE((SELECT sum(amount) FROM payments p WHERE p.property_id=$1 AND p.payment_status='verified'
          AND COALESCE(p.payment_purpose,'rent') IN ('rent','dp') AND (${this.paymentDate('p')} AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date),0)::bigint AS rent_cash_in,
        COALESCE((SELECT sum(amount) FROM payments p WHERE p.property_id=$1 AND p.payment_status='verified'
          AND p.payment_purpose='other_charge' AND (${this.paymentDate('p')} AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date),0)::bigint AS other_cash_in,
        COALESCE((SELECT sum(amount) FROM payments p WHERE p.property_id=$1 AND p.payment_status='verified'
          AND p.payment_purpose='security_deposit' AND (${this.paymentDate('p')} AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date),0)::bigint AS deposit_collected,
        COALESCE((SELECT sum(amount) FROM lease_deposit_transactions d WHERE d.property_id=$1 AND d.transaction_type='refund'
          AND d.direction='debit' AND d.settlement_status='settled' AND (COALESCE(d.settled_at,d.created_at) AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date),0)::bigint AS deposit_refunded,
        COALESCE((SELECT sum(amount) FROM expenses e WHERE e.property_id=$1 AND e.expense_status='paid'
          AND e.expense_date BETWEEN $2::date AND $3::date),0)::bigint AS expenses_paid,
        COALESCE((SELECT sum(GREATEST(i.total_amount - COALESCE(a.allocated,0),0)) FROM invoices i
          LEFT JOIN (SELECT invoice_id,sum(allocated_amount) FILTER(WHERE allocation_status='active') AS allocated FROM payment_allocations GROUP BY invoice_id) a ON a.invoice_id=i.id
          WHERE i.property_id=$1 AND i.invoice_status IN ('issued','unpaid','partially_paid','overdue') AND i.due_date <= $3::date),0)::bigint AS receivables,
        COALESCE((SELECT sum(operator_fee_amount) FILTER(WHERE earning_status='recognized') FROM property_owner_earnings e
          WHERE e.property_id=$1 AND e.earning_month BETWEEN date_trunc('month',$2::date)::date AND date_trunc('month',$3::date)::date),0)::bigint AS management_fee,
        COALESCE((SELECT sum(owner_earned_amount) FILTER(WHERE earning_status='recognized') FROM property_owner_earnings e
          WHERE e.property_id=$1 AND e.earning_month BETWEEN date_trunc('month',$2::date)::date AND date_trunc('month',$3::date)::date),0)::bigint AS owner_entitlement_recorded,
        COALESCE((SELECT sum(payout_amount) FILTER(WHERE payout_kind='payout') - COALESCE(sum(payout_amount) FILTER(WHERE payout_kind='reversal'),0)
          FROM property_owner_payouts p WHERE p.property_id=$1 AND (p.recorded_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date),0)::bigint AS owner_paid`,
      [query.property_id, query.date_from, query.date_to],
    );
    const values = this.summary(summary);
    values.net_operational_cash =
      (values.rent_cash_in ?? 0) + (values.other_cash_in ?? 0) - (values.expenses_paid ?? 0);
    values.owner_unpaid = Math.max(
      (values.owner_entitlement_recorded ?? 0) - (values.owner_paid ?? 0),
      0,
    );
    return {
      rows: this.rows(page),
      summary: values,
      total: Number(count.rows[0]?.total_count ?? 0),
    };
  }

  private async propertyOwners(query: NormalizedQuery) {
    const params: unknown[] = [query.property_id, query.date_from, query.date_to];
    const conditions = [
      `settlements.property_id=$1`,
      `settlements.period_start >= date_trunc('month',$2::date)::date`,
      `settlements.period_end <= (date_trunc('month',$3::date) + interval '1 month - 1 day')::date`,
      `settlements.settlement_status IN ('approved','paid')`,
      `publications.publication_status='published'`,
    ];
    if (query.q?.trim()) {
      params.push(`%${query.q.trim().toLowerCase()}%`);
      conditions.push(
        `lower(concat_ws(' ', profiles.full_name, publications.document_number, settlements.reference)) LIKE $${params.length}`,
      );
    }
    if (query.status) {
      params.push(query.status);
      conditions.push(`settlements.settlement_status=$${params.length}`);
    }
    const from = `FROM property_owner_settlements settlements
      JOIN property_owner_profiles profiles ON profiles.id=settlements.owner_profile_id
      JOIN property_owner_settlement_publications publications
        ON publications.settlement_id=settlements.id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(CASE WHEN payout_kind='payout' THEN payout_amount ELSE -payout_amount END),0)::bigint AS paid_amount
        FROM property_owner_payouts payouts WHERE payouts.settlement_id=settlements.id
      ) payout ON true
      WHERE ${conditions.join(' AND ')}`;
    const pageParams = [...params, query.limit, query.offset];
    const page = await this.database.client.query(
      `SELECT profiles.full_name AS owner_name, settlements.period_start::text,
              settlements.period_end::text, publications.document_number,
              settlements.gross_amount::int AS gross_amount,
              settlements.operator_fee_amount::int AS management_fee,
              settlements.owner_amount::int AS owner_entitlement,
              payout.paid_amount::int AS paid_to_owner,
              GREATEST(settlements.owner_amount-payout.paid_amount,0)::int AS outstanding_to_owner,
              settlements.settlement_status AS status,
              publications.published_at::text, COUNT(*) OVER()::int AS total_count
       ${from}
       ORDER BY settlements.period_start DESC, profiles.full_name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      pageParams,
    );
    const summary = await this.database.client.query(
      `SELECT COUNT(*)::int AS total_owner_reports,
              COALESCE(SUM(settlements.gross_amount),0)::bigint AS gross_amount,
              COALESCE(SUM(settlements.operator_fee_amount),0)::bigint AS management_fee,
              COALESCE(SUM(settlements.owner_amount),0)::bigint AS owner_entitlement,
              COALESCE(SUM(payout.paid_amount),0)::bigint AS paid_to_owner,
              COALESCE(SUM(GREATEST(settlements.owner_amount-payout.paid_amount,0)),0)::bigint AS outstanding_to_owner
       ${from}`,
      params,
    );
    return this.data(page, summary);
  }

  private commonFilters(
    parts: QueryParts,
    query: NormalizedQuery,
    columns: {
      status?: string;
      category?: string;
      building?: string;
      gender?: string;
      search: string;
    },
  ) {
    if (query.status && columns.status) this.add(parts, `${columns.status} =`, query.status);
    if (query.category && columns.category)
      this.add(parts, `${columns.category} =`, query.category);
    if (query.building_id && columns.building)
      this.add(parts, `${columns.building} =`, query.building_id);
    if (query.gender && columns.gender) this.add(parts, `${columns.gender} =`, query.gender);
    if (query.q?.trim())
      this.add(parts, `lower(${columns.search}) LIKE`, `%${query.q.trim().toLowerCase()}%`);
  }

  private add(parts: QueryParts, expression: string, value: unknown) {
    parts.params.push(value);
    parts.where.push(`${expression} $${parts.params.length}`);
  }

  private data(page: QueryResult, summary: QueryResult) {
    const values = this.summary(summary);
    return {
      rows: this.rows(page),
      summary: values,
      total: Number(
        page.rows[0]?.total_count ??
          values.total_contracts ??
          values.total_payments ??
          values.total_expenses ??
          0,
      ),
    };
  }

  private rows(result: QueryResult): ReportRow[] {
    return result.rows.map((source) => {
      const row: ReportRow = {};
      for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
        if (key === 'total_count' || key === 'id') continue;
        row[key] = typeof value === 'bigint' ? Number(value) : (value as ReportRow[string]);
      }
      return row;
    });
  }

  private summary(result: QueryResult): Record<string, number> {
    const row = (result.rows[0] ?? {}) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value ?? 0)]));
  }

  private normalize(input: ReportQueryDto): NormalizedQuery {
    const today = this.jakartaDate();
    const dateFrom = input.date_from ?? `${today.slice(0, 7)}-01`;
    const dateTo = input.date_to ?? today;
    const start = Date.parse(`${dateFrom}T00:00:00Z`);
    const end = Date.parse(`${dateTo}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      throw new BadRequestException({
        code: 'REPORT_PERIOD_INVALID',
        message: 'Periode laporan tidak valid.',
      });
    }
    if ((end - start) / 86_400_000 > 366) {
      throw new BadRequestException({
        code: 'REPORT_PERIOD_TOO_LONG',
        message: 'Periode laporan interaktif maksimal 366 hari.',
      });
    }
    return {
      ...input,
      date_from: dateFrom,
      date_to: dateTo,
      limit: input.limit ?? 20,
      offset: input.offset ?? 0,
    };
  }

  private jakartaDate(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }

  private paymentDate(alias: string) {
    return `COALESCE(${alias}.paid_at, ${alias}.verified_at, ${alias}.created_at)`;
  }

  private reportType(value: string): ReportType {
    if (!REPORT_TYPES.includes(value as ReportType)) {
      throw new BadRequestException({
        code: 'REPORT_TYPE_INVALID',
        message: 'Jenis laporan tidak valid.',
      });
    }
    return value as ReportType;
  }

  private checksum(type: ReportType, query: NormalizedQuery) {
    const filter = {
      type,
      property_id: query.property_id,
      date_from: query.date_from,
      date_to: query.date_to,
      q: query.q ?? null,
      status: query.status ?? null,
      category: query.category ?? null,
      building_id: query.building_id ?? null,
      gender: query.gender ?? null,
      method: query.method ?? null,
      purpose: query.purpose ?? null,
      payment_plan: query.payment_plan ?? null,
      date_basis: query.date_basis ?? null,
      has_evidence: query.has_evidence ?? null,
      exit_type: query.exit_type ?? null,
      checkout_status: query.checkout_status ?? null,
      financial_status: query.financial_status ?? null,
      same_day: query.same_day ?? null,
      has_refund: query.has_refund ?? null,
      has_amount_due: query.has_amount_due ?? null,
      has_damage: query.has_damage ?? null,
    };
    return createHash('sha256').update(JSON.stringify(filter)).digest('hex');
  }
}
