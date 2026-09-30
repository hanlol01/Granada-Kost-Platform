import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { FileRepository } from '../file/file.repository';
import { FileService } from '../file/file.service';
import {
  formatOwnerMonthYear,
  formatDocumentPropertyName,
  ownerFinanceRequestToPdf,
  ownerFinanceRequestToXlsx,
  ownerRealizationReceiptToPdf,
  reportToPdf,
  reportToXlsx,
} from '../report/report-export.util';
import type { OwnerFinanceRequestDocument } from '../report/report-export.util';
import type { ReportResult } from '../report/report.types';
import { UserAccessContext } from '../iam/types/iam.types';
import { RequestAuditContext } from '../property/types/property.types';
import { resolveHistoricalRealizationTransfers } from './owner-realization-historical-transfer.helper';
import { transferEvidenceIsValid } from './owner-realization-evidence-policy';
import {
  ChangeOwnerRealizationStatusDto,
  CancelOwnerRealizationDto,
  CreateHistoricalOwnerRealizationDto,
  CreateOwnerRealizationCorrectionDto,
  OwnerRealizationQueryDto,
  PrepareOwnerRealizationDto,
  RecordOwnerRealizationTransferDto,
  RecordOwnerRealizationRecoveryEventDto,
  VoidOwnerRealizationDraftDto,
} from './dto/property-owner-management.dto';

type RealizationStatus =
  | 'draft'
  | 'awaiting_review'
  | 'approved'
  | 'submitted_to_finance'
  | 'awaiting_transfer'
  | 'partially_realized'
  | 'realized'
  | 'published_to_owner'
  | 'void';

type Candidate = {
  plot_number: string | null;
  lease_id: string;
  room_id: string;
  resident_id: string;
  owner_profile_id: string;
  asset_id: string;
  building_code: string | null;
  room_code: string;
  building_name: string | null;
  resident_name: string;
  owner_name: string;
  term_months: number;
  pricing_source: string | null;
  pricing_tier: string | null;
  monthly_price: string | null;
  reference_monthly_price: string | null;
  monthly_management_fee: string | null;
  payment_completed_at: string;
  check_in_at: string | null;
  check_out_at: string | null;
  money_received_amount: string;
  contract_total_amount: string;
  outstanding_amount: string;
  management_fee_amount: string;
  net_realization_amount: string;
  fee_effective_date: string | null;
  ownership_kind: 'room' | 'building';
};

type HistoricalLeaseMatch = {
  id: string;
  resident_id: string;
  room_id: string;
  asset_id: string;
  building_code: string | null;
  building_name: string | null;
  room_code: string;
  term_months: number | null;
  activated_at: string | null;
  end_date: string | null;
};

type Realization = {
  id: string;
  property_id: string;
  owner_profile_id: string;
  realization_period: string;
  realization_reference: string;
  realization_status: RealizationStatus;
  entry_kind: 'system' | 'historical_manual' | 'historical_import';
  historical_source: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  payout_bank_name: string | null;
  payout_account_number: string | null;
  payout_account_holder: string | null;
  owner_snapshot: Record<string, unknown>;
  scope_snapshot: Record<string, unknown>;
  tariff_snapshot: Record<string, unknown>;
  room_count: number;
  eligible_contract_total: string;
  management_fee_total: string;
  correction_total: string;
  realization_total: string;
  transferred_total: string;
  notes: string | null;
  prepared_at: string;
  submitted_for_review_at: string | null;
  approved_at: string | null;
  submitted_to_finance_at: string | null;
  awaiting_transfer_at: string | null;
  realized_at: string | null;
  published_at: string | null;
};

type IdempotencyRow = {
  request_fingerprint: string;
  command_status: 'pending' | 'succeeded' | 'failed';
  response_body: unknown;
};

type SqlClient = Pick<PoolClient, 'query'>;

type OwnerProfile = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  profile_status: 'active' | 'archived';
  created_at: string;
  payout_bank_name: string | null;
  payout_account_number: string | null;
  payout_account_holder: string | null;
};

type FinanceRequestLine = {
  realization_id: string;
  owner_profile_id: string;
  realization_reference: string;
  realization_total: string;
  owner_name: string;
  room_code: string;
  resident_name: string | null;
  plot_number: string | null;
  duration_months: number;
  contract_total: string;
  net_realization: string;
  account_number: string | null;
  bank_name: string | null;
  account_holder: string | null;
};

type OwnerAssetScope = {
  owner_profile_id: string;
  asset_id: string;
  building_code: string | null;
  building_name: string | null;
  plot_number: string | null;
};

type OwnerRealizationSnapshotLine = {
  id: string;
  realization_id: string;
  lease_id: string | null;
  room_id: string | null;
  room_code_snapshot: string;
  building_name_snapshot: string | null;
  resident_name_snapshot: string | null;
  plot_number_snapshot: string | null;
  contract_total_amount: string;
  management_fee_amount: string;
  net_realization_amount: string;
  snapshot: Record<string, unknown> | null;
};

type OwnerRealizationQueueRoom = {
  id: string;
  room_code: string;
  plot_number: string | null;
  resident_name: string | null;
  contract_total: string;
  management_fee: string;
  realization_total: string;
};

type OwnerRealizationQueueAsset = {
  id: string;
  building_code: string | null;
  building_name: string | null;
  plot_number: string | null;
  snapshot_incomplete?: boolean;
  rooms: OwnerRealizationQueueRoom[];
};

function plotNumbersFromRooms(rooms: OwnerRealizationQueueRoom[]): string | null {
  const plotNumbers = rooms
    .map((room) => room.plot_number?.trim())
    .filter((plotNumber): plotNumber is string => Boolean(plotNumber));
  return [...new Set(plotNumbers)]
    .sort((left, right) => left.localeCompare(right, 'id', { numeric: true }))
    .join(', ') || null;
}

type NotEligibleRow = {
  plot_number: string | null;
  lease_id: string;
  room_code: string;
  resident_name: string;
  owner_name: string;
  owner_profile_status: 'active' | 'archived' | null;
  contract_rent_amount: string;
  reason_code: string;
};

function textValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean')
    return String(value);
  return fallback;
}

function numberValue(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function rupiahValue(value: unknown): string {
  return `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(numberValue(value))}`;
}

function tanggalIndonesia(value: unknown): string {
  const raw = textValue(value, '');
  if (!raw) return '—';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? raw
    : new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'long',
        timeZone: 'Asia/Jakarta',
      }).format(parsed);
}

function notEligibleReasonLabel(code: string): string {
  return (
    {
      OWNER_ASSIGNMENT_UNAVAILABLE: 'Owner belum terhubung ke kamar',
      OWNER_SPONSORED_EXCLUDED: 'Hunian tanggungan Owner',
      OUTSTANDING_CONTRACT_RENT: 'Kontrak belum lunas',
      ALREADY_ALLOCATED_TO_REALIZATION: 'Sudah masuk realisasi lain',
      PAYMENT_COMPLETED_AFTER_RELEASE_PERIOD: 'Pelunasan di luar periode',
    }[code] ?? 'Belum memenuhi syarat realisasi'
  );
}

function ownerAssetsForExport(
  assets: OwnerRealizationQueueAsset[] | undefined,
  hasRealization: boolean,
): string {
  if (!assets?.length) return '—';
  return assets
    .map((asset) => {
      const identity =
        [asset.building_code, asset.building_name].filter(Boolean).join(' · ') ||
        'Aset historis belum tercatat';
      const countLabel = hasRealization
        ? 'kamar dalam realisasi ini'
        : 'kontrak lunas pada periode ini';
      return [
        identity,
        `No. Kavling ${asset.plot_number ?? '—'}`,
        asset.rooms.length
          ? `Kamar: ${asset.rooms
              .map((room) => room.room_code)
              .filter(Boolean)
              .join(', ')}`
          : 'Kamar: —',
        `${asset.rooms.length} ${countLabel}`,
        ...(asset.snapshot_incomplete
          ? ['Identitas bangunan tidak tersedia pada snapshot lama.']
          : []),
      ].join('\n');
    })
    .join('\n\n');
}

function periodEndDate(value: string): string {
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

const historyStatuses: RealizationStatus[] = ['realized', 'published_to_owner', 'void'];

@Injectable()
export class PropertyOwnerRealizationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditRepository,
    private readonly files: FileRepository,
    private readonly fileService: FileService,
  ) {}

  async list(actor: UserAccessContext, query: OwnerRealizationQueryDto) {
    this.assertPropertyScope(actor, query.property_id);
    const period = query.period ? this.period(query.period) : null;
    const ownerProfileStatus = query.owner_profile_status ?? 'active';
    const [owners, assetScopes, candidates, realizations, latestRealizations] = await Promise.all([
      this.database.client.query<OwnerProfile>(
        `SELECT id,full_name,phone,email,profile_status,created_at,
                payout_bank_name,payout_account_number,payout_account_holder
           FROM property_owner_profiles
          WHERE property_id=$1
            AND ($2::text='all' OR profile_status=$2)
          ORDER BY created_at,id`,
        [query.property_id, ownerProfileStatus],
      ),
      this.database.client.query<OwnerAssetScope>(
        `WITH ownership_scope AS (
           SELECT assignments.owner_profile_id,buildings.id AS asset_id,
                   buildings.building_code,buildings.building_name,
                   (SELECT string_agg(DISTINCT room.plot_number, ', ' ORDER BY room.plot_number)
                      FROM rooms room WHERE room.building_id=buildings.id AND room.property_id=$1) AS plot_number
             FROM building_owner_assignments assignments
             JOIN room_buildings buildings ON buildings.id=assignments.building_id
            WHERE assignments.property_id=$1 AND assignments.assignment_status='active'
           UNION
           SELECT assignments.owner_profile_id,COALESCE(buildings.id,rooms.id) AS asset_id,
                  COALESCE(buildings.building_code,rooms.room_code) AS building_code,
                   COALESCE(buildings.building_name,rooms.room_code) AS building_name,rooms.plot_number
             FROM room_owner_assignments assignments
             JOIN rooms ON rooms.id=assignments.room_id
             LEFT JOIN room_buildings buildings ON buildings.id=rooms.building_id
            WHERE assignments.property_id=$1 AND assignments.assignment_status='active'
         )
          SELECT owner_profile_id,asset_id::text,building_code,building_name,
                 string_agg(DISTINCT plot_number, ', ' ORDER BY plot_number) AS plot_number
             FROM ownership_scope
            GROUP BY owner_profile_id,asset_id,building_code,building_name
           ORDER BY owner_profile_id,building_code NULLS LAST,building_name,asset_id`,
        [query.property_id],
      ),
      this.eligibleCandidates(this.database.client, query.property_id, period?.until ?? null),
      this.database.client.query<Realization>(
        `SELECT realization.*,realization.realization_period::text AS realization_period,
                profile.full_name,profile.phone,profile.email,
                profile.payout_bank_name,profile.payout_account_number,profile.payout_account_holder
           FROM property_owner_realizations realization
           JOIN property_owner_profiles profile ON profile.id=realization.owner_profile_id
          WHERE realization.property_id=$1
            AND ($2::date IS NULL OR realization.realization_period=$2::date)
             AND ($3::text IS NULL OR realization.realization_status=$3)
             AND (realization.realization_status<>'void' OR $4::text='history' OR $3::text='void')
             AND ($5::text='all' OR profile.profile_status=$5)
          ORDER BY realization.realization_period DESC,
                   COALESCE(realization.realized_at,realization.published_at,realization.updated_at,realization.created_at) DESC,
                   realization.id DESC`,
        [
          query.property_id,
          period?.start ?? null,
          query.status === 'not_prepared' ? null : (query.status ?? null),
          query.workspace ?? null,
          ownerProfileStatus,
        ],
      ),
      this.database.client.query<
        Pick<
          Realization,
          | 'owner_profile_id'
          | 'realization_period'
          | 'realization_status'
          | 'realization_reference'
          | 'transferred_total'
          | 'realized_at'
        >
      >(
        `SELECT DISTINCT ON (realization.owner_profile_id)
                realization.owner_profile_id,realization.realization_period::text,
                realization.realization_status,realization.realization_reference,
                realization.transferred_total::text,realization.realized_at::text
           FROM property_owner_realizations realization
          WHERE realization.property_id=$1
          ORDER BY realization.owner_profile_id,realization.realization_period DESC,
                   realization.updated_at DESC,realization.id DESC`,
        [query.property_id],
      ),
    ]);
    const candidateByOwner = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      const current = candidateByOwner.get(candidate.owner_profile_id) ?? [];
      current.push(candidate);
      candidateByOwner.set(candidate.owner_profile_id, current);
    }
    const realizationsByOwner = new Map<string, Realization[]>();
    for (const realization of realizations.rows) {
      const current = realizationsByOwner.get(realization.owner_profile_id) ?? [];
      current.push(realization);
      realizationsByOwner.set(realization.owner_profile_id, current);
    }
    const latestByOwner = new Map(
      latestRealizations.rows.map((realization) => [realization.owner_profile_id, realization]),
    );
    const assetsByOwner = new Map<string, Map<string, OwnerRealizationQueueAsset>>();
    for (const scope of assetScopes.rows) {
      const ownerAssets =
        assetsByOwner.get(scope.owner_profile_id) ?? new Map<string, OwnerRealizationQueueAsset>();
      ownerAssets.set(scope.asset_id, {
        id: scope.asset_id,
        building_code: scope.building_code,
        building_name: scope.building_name,
        plot_number: scope.plot_number,
        rooms: [],
      });
      assetsByOwner.set(scope.owner_profile_id, ownerAssets);
    }
    for (const candidate of candidates) {
      const ownerAssets =
        assetsByOwner.get(candidate.owner_profile_id) ??
        new Map<string, OwnerRealizationQueueAsset>();
      const asset = ownerAssets.get(candidate.asset_id) ?? {
        id: candidate.asset_id,
        building_code: candidate.building_code,
        building_name: candidate.building_name,
        plot_number: null,
        rooms: [],
      };
      asset.rooms.push({
        id: candidate.lease_id,
        room_code: candidate.room_code,
        plot_number: candidate.plot_number,
        resident_name: candidate.resident_name,
        contract_total: candidate.contract_total_amount,
        management_fee: candidate.management_fee_amount,
        realization_total: candidate.net_realization_amount,
      });
      ownerAssets.set(candidate.asset_id, asset);
      assetsByOwner.set(candidate.owner_profile_id, ownerAssets);
    }
    for (const ownerAssets of assetsByOwner.values()) {
      for (const asset of ownerAssets.values()) {
        if (asset.rooms.length > 0) {
          asset.plot_number = plotNumbersFromRooms(asset.rooms);
        }
        asset.rooms.sort((left, right) =>
          `${left.room_code} ${left.resident_name ?? ''}`.localeCompare(
            `${right.room_code} ${right.resident_name ?? ''}`,
            'id',
          ),
        );
      }
    }

    const search = query.q?.toLowerCase();
    const ownerRow = (owner: OwnerProfile, realization: Realization | null = null) => {
      const ownerCandidates = candidateByOwner.get(owner.id) ?? [];
      const ownerAssets = [...(assetsByOwner.get(owner.id)?.values() ?? [])];
      const ownerAssetSummary =
        ownerAssets
          .map((asset) => [asset.building_code, asset.building_name].filter(Boolean).join(' · '))
          .filter(Boolean)
          .join(', ') || '—';
      const values = ownerCandidates.reduce(
        (total, candidate) => ({
          contract: total.contract + Number(candidate.contract_total_amount),
          fee: total.fee + Number(candidate.management_fee_amount),
          net: total.net + Number(candidate.net_realization_amount),
        }),
        { contract: 0, fee: 0, net: 0 },
      );
      const latest = latestByOwner.get(owner.id);
      return {
        owner_id: owner.id,
        owner_name: owner.full_name,
        owner_phone: owner.phone,
        owner_profile_status: owner.profile_status,
        owner_asset_summary: ownerAssetSummary,
        plot_number: null,
        assets: ownerAssets,
        room_count: realization?.room_count ?? ownerCandidates.length,
        eligible_contract_count: realization?.room_count ?? ownerCandidates.length,
        eligible_contract_total: realization?.eligible_contract_total ?? String(values.contract),
        management_fee_total: realization?.management_fee_total ?? String(values.fee),
        realization_total: realization?.realization_total ?? String(values.net),
        transferred_total: realization?.transferred_total ?? '0',
        realization: realization ? this.summary(realization) : null,
        latest_realization: latest
          ? {
              period: latest.realization_period,
              status: latest.realization_status,
              reference: latest.realization_reference,
              transferred_total: latest.transferred_total,
              realized_at: latest.realized_at,
            }
          : null,
        action: realization ? 'view_detail' : ownerCandidates.length > 0 ? 'prepare' : 'none',
        eligible_lease_ids: ownerCandidates.map((candidate) => candidate.lease_id),
        eligible_leases: ownerCandidates.map((candidate) => ({
          id: candidate.lease_id,
          room_code: candidate.room_code,
          resident_name: candidate.resident_name,
          contract_total: candidate.contract_total_amount,
          management_fee: candidate.management_fee_amount,
          realization_total: candidate.net_realization_amount,
        })),
      };
    };
    const ownerById = new Map(owners.rows.map((owner) => [owner.id, owner]));
    const historyRows =
      query.workspace === 'history'
        ? realizations.rows
            .filter((realization) => historyStatuses.includes(this.summary(realization).status))
            .map((realization) =>
              ownerRow(ownerById.get(realization.owner_profile_id)!, realization),
            )
        : [];
    const rows = (
      query.workspace === 'history'
        ? historyRows
        : owners.rows.map((owner) => {
            const ownerRealizations = realizationsByOwner.get(owner.id) ?? [];
            const currentRealization = ownerRealizations.find(
              (realization) => !historyStatuses.includes(this.summary(realization).status),
            );
            // A realized batch does not hide newly eligible leases. Those leases
            // appear as a fresh unprepared row and can be put into a new batch.
            return ownerRow(owner, currentRealization ?? null);
          })
    )
      .filter((row) => {
        if (!search) return true;
        return `${row.owner_name} ${row.owner_phone ?? ''}`.toLowerCase().includes(search);
      })
      .filter((row) => {
        if (query.status === 'not_prepared' && row.realization) return false;
        if (
          query.status &&
          query.status !== 'not_prepared' &&
          row.realization?.status !== query.status
        )
          return false;
        if (query.workspace === 'history') return Boolean(row.realization);
        if (query.workspace === 'active' || !query.workspace)
          return !row.realization || !historyStatuses.includes(row.realization.status);
        return true;
      });
    const orderedRows =
      query.workspace === 'active' || !query.workspace
        ? rows
            .map((row, index) => ({
              row,
              index,
              // Keep the original Owner order within each priority group. The
              // priority only ensures actionable balances appear before rows
              // that are already completed or have nothing to realize.
              needsAction:
                Boolean(row.realization && !historyStatuses.includes(row.realization.status)) ||
                Number(row.realization_total) > Number(row.transferred_total),
            }))
            .sort((left, right) => {
              const priority = Number(right.needsAction) - Number(left.needsAction);
              return priority || left.index - right.index;
            })
            .map(({ row }) => row)
        : rows;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    const page = orderedRows.slice(offset, offset + limit);
    const realizationIds = page
      .map((row) => row.realization?.id)
      .filter((id): id is string => Boolean(id));
    const snapshotAssetsByRealization = new Map<string, Map<string, OwnerRealizationQueueAsset>>();
    if (realizationIds.length > 0) {
      const lineRows = await this.database.client.query<OwnerRealizationSnapshotLine>(
        `SELECT id,realization_id,lease_id,room_id,room_code_snapshot,building_name_snapshot,
                resident_name_snapshot,plot_number_snapshot,contract_total_amount::text,
                management_fee_amount::text,net_realization_amount::text,snapshot
           FROM property_owner_realization_lines
          WHERE property_id=$2 AND realization_id=ANY($1::uuid[])
          ORDER BY realization_id,room_code_snapshot,resident_name_snapshot`,
        [realizationIds, query.property_id],
      );
      for (const line of await this.withRoomIdentifiers(lineRows.rows, query.property_id)) {
        const snapshot = line.snapshot ?? {};
        const snapshotAssetId = textValue(snapshot.asset_id);
        const buildingCode = textValue(snapshot.building_code) || null;
        const buildingName =
          textValue(snapshot.building_name) || line.building_name_snapshot || null;
        const snapshotIncomplete = !snapshotAssetId && !buildingCode && !buildingName;
        const assetKey =
          snapshotAssetId ||
          (snapshotIncomplete
            ? 'unrecorded-asset'
            : `${buildingCode ?? ''}\u0000${buildingName ?? ''}`);
        const ownerAssets =
          snapshotAssetsByRealization.get(line.realization_id) ??
          new Map<string, OwnerRealizationQueueAsset>();
        const asset = ownerAssets.get(assetKey) ?? {
          id: snapshotAssetId || `snapshot:${line.realization_id}:${assetKey}`,
          building_code: buildingCode,
          building_name: buildingName,
          plot_number: line.plot_number_snapshot,
          ...(snapshotIncomplete ? { snapshot_incomplete: true } : {}),
          rooms: [],
        };
        asset.rooms.push({
          id: line.lease_id ?? line.id,
          room_code: line.room_code_snapshot,
          plot_number: line.plot_number_snapshot,
          resident_name: line.resident_name_snapshot,
          contract_total: line.contract_total_amount,
          management_fee: line.management_fee_amount,
          realization_total: line.net_realization_amount,
        });
        ownerAssets.set(assetKey, asset);
        snapshotAssetsByRealization.set(line.realization_id, ownerAssets);
      }
      for (const ownerAssets of snapshotAssetsByRealization.values()) {
        for (const asset of ownerAssets.values()) {
          asset.plot_number = plotNumbersFromRooms(asset.rooms);
        }
      }
    }
    const pageWithAssets = page.map((row) => {
      if (!row.realization) return row;
      const assets = [...(snapshotAssetsByRealization.get(row.realization.id)?.values() ?? [])];
      assets.sort((left, right) => {
        if (left.snapshot_incomplete !== right.snapshot_incomplete)
          return left.snapshot_incomplete ? 1 : -1;
        return `${left.building_code ?? ''} ${left.building_name ?? ''}`.localeCompare(
          `${right.building_code ?? ''} ${right.building_name ?? ''}`,
          'id',
        );
      });
      return { ...row, assets };
    });
    const ownerStatusById = new Map<string, RealizationStatus | null>();
    if (query.workspace === 'history') {
      for (const row of orderedRows) {
        if (!ownerStatusById.has(row.owner_id)) {
          ownerStatusById.set(row.owner_id, row.realization?.status ?? null);
        }
      }
    } else {
      for (const row of orderedRows) {
        const completed = (realizationsByOwner.get(row.owner_id) ?? []).find((realization) =>
          historyStatuses.includes(realization.realization_status),
        );
        ownerStatusById.set(row.owner_id, completed?.realization_status ?? null);
      }
    }
    const ownerStatusValues = [...ownerStatusById.values()];
    const voidedOwnerCount = ownerStatusValues.filter((status) => status === 'void').length;
    const ownerCounts = {
      total: ownerStatusValues.length - voidedOwnerCount,
      published: ownerStatusValues.filter((status) => status === 'published_to_owner').length,
      waiting_publication: ownerStatusValues.filter((status) => status === 'realized').length,
      voided: voidedOwnerCount,
    };
    return {
      period: period?.value ?? null,
      rows: pageWithAssets,
      meta: { offset, limit, total: orderedRows.length },
      summary: {
        ...orderedRows.reduce(
          (total, row) => ({
            eligible_contract_total:
              total.eligible_contract_total + Number(row.eligible_contract_total),
            management_fee_total: total.management_fee_total + Number(row.management_fee_total),
            realization_total: total.realization_total + Number(row.realization_total),
            transferred_total: total.transferred_total + Number(row.transferred_total),
          }),
          {
            eligible_contract_total: 0,
            management_fee_total: 0,
            realization_total: 0,
            transferred_total: 0,
          },
        ),
        owner_counts: ownerCounts,
      },
    };
  }

  async listNotEligible(actor: UserAccessContext, query: OwnerRealizationQueryDto) {
    this.assertPropertyScope(actor, query.property_id);
    const period = this.period(query.period ?? this.currentJakartaPeriod());
    const rows = (await this.notEligibleRows(query.property_id, period.start)).map((row) => ({
      ...row,
      reason_label: this.notEligibleReasonLabel(row.reason_code),
    }));
    const ownerProfileStatus = query.owner_profile_status ?? 'active';
    const visibleByProfile = rows.filter((row) => {
      if (ownerProfileStatus === 'all') return true;
      // An unassigned room is a diagnostic issue, not an archived Owner record.
      if (!row.owner_profile_status) return ownerProfileStatus === 'active';
      return row.owner_profile_status === ownerProfileStatus;
    });
    const search = query.q?.trim().toLowerCase();
    const filtered = search
      ? visibleByProfile.filter((row) =>
          `${row.owner_name} ${row.room_code} ${row.resident_name}`.toLowerCase().includes(search),
        )
      : visibleByProfile;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    return {
      period: period.value,
      rows: filtered.slice(offset, offset + limit),
      meta: { offset, limit, total: filtered.length },
    };
  }

  async historicalSources(actor: UserAccessContext, propertyId: string) {
    this.assertPropertyScope(actor, propertyId);
    const sources = await this.database.client.query<{ source: string }>(
      `SELECT source
         FROM (
           SELECT MIN(BTRIM(historical_source)) AS source,
                  LOWER(BTRIM(historical_source)) AS normalized_source
             FROM property_owner_realizations
            WHERE property_id=$1
              AND historical_source IS NOT NULL
              AND BTRIM(historical_source) <> ''
            GROUP BY LOWER(BTRIM(historical_source))
         ) recorded_sources
        ORDER BY normalized_source
        LIMIT 100`,
      [propertyId],
    );
    return { items: sources.rows.map((row) => row.source) };
  }

  async financeConfirmers(actor: UserAccessContext, propertyId: string) {
    this.assertPropertyScope(actor, propertyId);
    const confirmers = await this.database.client.query<{ name: string }>(
      `SELECT DISTINCT BTRIM(finance_confirmed_by) AS name
         FROM property_owner_realization_transfers
        WHERE property_id=$1
          AND finance_confirmed_by IS NOT NULL
          AND BTRIM(finance_confirmed_by) <> ''
        ORDER BY name
        LIMIT 100`,
      [propertyId],
    );
    return { items: confirmers.rows.map((row) => row.name) };
  }

  async detail(actor: UserAccessContext, realizationId: string, propertyId: string) {
    this.assertPropertyScope(actor, propertyId);
    const realization = await this.realization(this.database.client, realizationId, propertyId);
    const [
      lines,
      corrections,
      transfers,
      documents,
      ineligible,
      evidence,
      recoveryEvents,
      financeConfirmers,
    ] = await Promise.all([
      this.database.client.query(
        `SELECT id,lease_id,room_id,resident_id,line_kind,line_status,room_code_snapshot,building_name_snapshot,
                resident_name_snapshot,owner_name_snapshot,plot_number_snapshot,duration_months,
                pricing_source_snapshot,pricing_tier_snapshot,payment_completed_at::text,check_in_at::text,
                check_out_at::text,money_received_amount::text,contract_total_amount::text,outstanding_amount::text,
                management_fee_amount::text,correction_amount::text,net_realization_amount::text,legacy_reference,snapshot
           FROM property_owner_realization_lines WHERE realization_id=$1 ORDER BY room_code_snapshot,resident_name_snapshot`,
        [realizationId],
      ),
      this.database.client.query<Record<string, unknown> & { id: string }>(
        `SELECT id,correction_kind,amount::text,reason,evidence_reference,source_reference,correction_status,
                recovery_disposition,recovery_status,recovery_resolved_at::text,recovery_reference,
                created_at::text,approved_at::text FROM property_owner_realization_corrections
          WHERE realization_id=$1 ORDER BY created_at,id`,
        [realizationId],
      ),
      this.database.client.query<Record<string, unknown> & { id: string }>(
        `SELECT id,transfer_amount::text,transfer_method,transfer_reference,transfer_evidence_reference,
                destination_snapshot,transfer_status,transferred_at::text,receipt_number,receipt_issued_at::text,
                finance_confirmed_by,finance_confirmation_channel,finance_confirmed_at::text,legacy_evidence_reason
           FROM property_owner_realization_transfers WHERE realization_id=$1 ORDER BY transferred_at,id`,
        [realizationId],
      ),
      this.database.client.query(
        `SELECT id,transfer_id,document_kind,document_number,issued_at::text FROM property_owner_realization_documents
          WHERE realization_id=$1 ORDER BY issued_at,id`,
        [realizationId],
      ),
      this.notEligibleRows(
        propertyId,
        realization.realization_period,
        realization.owner_profile_id,
      ),
      this.database.client.query<{
        entity_kind: string;
        entity_id: string;
        file: Record<string, unknown>;
      }>(
        `SELECT evidence.entity_kind,evidence.entity_id,
          json_build_object('id',file.id,'original_filename',file.original_filename,
            'sanitized_filename',file.sanitized_filename,'mime_type',file.mime_type,
            'file_size_bytes',file.file_size_bytes) AS file
         FROM property_owner_realization_evidence_files evidence
         JOIN files file ON file.id=evidence.file_id AND file.is_deleted=false
         WHERE evidence.realization_id=$1 AND evidence.property_id=$2 ORDER BY evidence.created_at,evidence.id`,
        [realizationId, propertyId],
      ),
      this.database.client.query<Record<string, unknown> & { id: string }>(
        `SELECT id,correction_id,amount::text,occurred_at::text,finance_reference,note,created_at::text
         FROM property_owner_realization_recovery_events WHERE realization_id=$1 AND property_id=$2
         ORDER BY occurred_at,id`,
        [realizationId, propertyId],
      ),
      this.database.client.query<{ name: string }>(
        `SELECT DISTINCT BTRIM(finance_confirmed_by) AS name
             FROM property_owner_realization_transfers
            WHERE property_id=$1 AND finance_confirmed_by IS NOT NULL
              AND BTRIM(finance_confirmed_by) <> ''
            ORDER BY name LIMIT 100`,
        [propertyId],
      ),
    ]);
    const attached = (kind: string, id: unknown) =>
      evidence.rows
        .filter((row) => row.entity_kind === kind && row.entity_id === id)
        .map((row) => row.file);
    return {
      realization: this.detailSummary(realization),
      lines: await this.withRoomIdentifiers(lines.rows, propertyId),
      corrections: corrections.rows.map((row) => ({
        ...row,
        evidence_files: attached('correction', row.id),
      })),
      transfers: transfers.rows.map((row) => ({
        ...row,
        evidence_files: attached('transfer', row.id),
      })),
      documents: documents.rows,
      recovery_events: recoveryEvents.rows.map((row) => ({
        ...row,
        evidence_files: attached('recovery_event', row.id),
      })),
      finance_confirmers: financeConfirmers.rows.map((row) => row.name),
      not_eligible: ineligible,
    };
  }

  /**
   * Builds Finance's external verification form from completed realization
   * history. The document is a Finance verification recap, so it belongs to
   * batches that have actually reached realization history—not the active
   * queue, whose candidates can already be locked into a batch.
   */
  async exportFinanceRequest(
    actor: UserAccessContext,
    query: OwnerRealizationQueryDto,
    format: string,
  ) {
    this.assertPropertyScope(actor, query.property_id);
    const period = this.period(query.period ?? this.currentJakartaPeriod());
    const financeLines = await this.database.client.query<FinanceRequestLine>(
      `SELECT realization.id AS realization_id,
              realization.owner_profile_id,
              realization.realization_reference,
              realization.realization_total::text AS realization_total,
              COALESCE(profile.full_name,realization.owner_snapshot->>'full_name','-') AS owner_name,
              COALESCE(NULLIF(room.plot_number,''),line.room_code_snapshot) AS room_code,
              line.resident_name_snapshot AS resident_name,
              COALESCE(room.plot_number,line.plot_number_snapshot) AS plot_number,
              COALESCE(line.duration_months,0)::int AS duration_months,
              line.contract_total_amount::text AS contract_total,
              line.net_realization_amount::text AS net_realization,
              COALESCE(
                NULLIF(BTRIM(profile.payout_account_number),''),
                NULLIF(BTRIM(realization.owner_snapshot->>'payout_account_number'),''),
                '-'
              ) AS account_number,
              COALESCE(
                NULLIF(BTRIM(profile.payout_bank_name),''),
                NULLIF(BTRIM(realization.owner_snapshot->>'payout_bank_name'),''),
                '-'
              ) AS bank_name,
              COALESCE(
                NULLIF(BTRIM(profile.payout_account_holder),''),
                NULLIF(BTRIM(realization.owner_snapshot->>'payout_account_holder'),''),
                '-'
              ) AS account_holder
         FROM property_owner_realizations realization
         JOIN property_owner_profiles profile ON profile.id=realization.owner_profile_id
          JOIN property_owner_realization_lines line ON line.realization_id=realization.id
          LEFT JOIN rooms room ON room.id=line.room_id AND room.property_id=realization.property_id
        WHERE realization.property_id=$1
          AND realization.realization_period=$2::date
          AND realization.realization_status=ANY($3::text[])
        ORDER BY profile.full_name,realization.realization_reference,line.room_code_snapshot,line.resident_name_snapshot`,
      [query.property_id, period.start, ['realized', 'published_to_owner']],
    );
    const search = query.q?.trim().toLowerCase();
    const filteredLines = search
      ? financeLines.rows.filter((line) =>
          `${line.owner_name} ${line.resident_name ?? ''} ${line.room_code}`
            .toLowerCase()
            .includes(search),
        )
      : financeLines.rows;
    if (filteredLines.length === 0) {
      throw new ConflictException({
        code: 'OWNER_REALIZATION_FINANCE_REQUEST_EMPTY',
        message: `Belum ada realisasi yang tercatat pada Riwayat Realisasi untuk Form Finance ${formatOwnerMonthYear(period.start)}.`,
      });
    }
    const property = await this.database.client.query<{ name: string }>(
      `SELECT name FROM properties WHERE id=$1`,
      [query.property_id],
    );
    const organization = await this.database.client.query<{
      company_name: string;
      company_address: string | null;
    }>(`SELECT company_name,company_address FROM organization_settings WHERE singleton=true`);
    const signatoryRows = await this.database.client.query<{
      role_code: 'manager' | 'dbo' | 'director';
      full_name: string;
      job_title: string;
      signature_file_id: string | null;
    }>(
      `SELECT role_code,full_name,job_title,signature_file_id
         FROM property_document_signatories
        WHERE property_id=$1`,
      [query.property_id],
    );
    const defaults = {
      manager: { label: 'Dibuat oleh' as const, title: 'Pengelola' },
      dbo: { label: 'Mengetahui' as const, title: 'DBO' },
      director: { label: 'Menyetujui' as const, title: 'Direktur' },
    };
    const signatories: OwnerFinanceRequestDocument['signatories'] = [];
    for (const role of ['manager', 'dbo', 'director'] as const) {
      const row = signatoryRows.rows.find((item) => item.role_code === role);
      let signature: Buffer | undefined;
      if (row?.signature_file_id) {
        const record = await this.files.findById(row.signature_file_id);
        if (record && !record.isDeleted) {
          signature = (await this.fileService.readStoredContent(record)).buffer;
        }
      }
      signatories.push({
        role,
        label: defaults[role].label,
        name: row?.full_name?.trim() || (role === 'manager' ? actor.displayName : '—'),
        title: row?.job_title?.trim() || defaults[role].title,
        ...(signature ? { signature } : {}),
      });
    }
    const rows: OwnerFinanceRequestDocument['rows'] = [];
    const realizationTotals = new Map<string, number>();
    filteredLines.forEach((line) => {
      realizationTotals.set(line.realization_id, numberValue(line.realization_total));
    });
    const seenRealizations = new Set<string>();
    for (const line of filteredLines) {
      const firstForRealization = !seenRealizations.has(line.realization_id);
      seenRealizations.add(line.realization_id);
      rows.push({
        tenantName: line.resident_name ?? '-',
        roomCode: line.room_code,
        ownerName: line.owner_name,
        plotNumber: line.plot_number ?? '-',
        durationMonths: line.duration_months,
        totalRent: numberValue(line.contract_total),
        realizationAmount: numberValue(line.net_realization),
        accountNumber: line.account_number ?? '-',
        bankName: line.bank_name ?? '-',
        accountHolder: line.account_holder ?? '-',
        ownerTotalRealization: firstForRealization
          ? (realizationTotals.get(line.realization_id) ?? 0)
          : 0,
      });
    }
    const propertyName = formatDocumentPropertyName(property.rows[0]?.name ?? 'KOSTATION');
    const companyName = organization.rows[0]?.company_name?.trim() || 'Kostation';
    const document: OwnerFinanceRequestDocument = {
      period: formatOwnerMonthYear(period.start),
      propertyName,
      departmentUnit: `${companyName} ${propertyName}`.trim(),
      requestedAt: tanggalIndonesia(new Date().toISOString()),
      address:
        organization.rows[0]?.company_address?.trim() || 'Kabupaten Sumedang, Jawa Barat 45363',
      rows,
      signatories,
    };
    const file =
      format === 'xlsx'
        ? {
            content: ownerFinanceRequestToXlsx(document),
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename: `form-pengajuan-realisasi-passive-income-${period.value}.xlsx`,
          }
        : format === 'pdf'
          ? {
              content: await ownerFinanceRequestToPdf(document),
              contentType: 'application/pdf',
              filename: `form-pengajuan-realisasi-passive-income-${period.value}.pdf`,
            }
          : null;
    if (!file)
      throw new BadRequestException({
        code: 'OWNER_REALIZATION_EXPORT_FORMAT_INVALID',
        message: 'Format ekspor harus pdf atau xlsx.',
      });
    await this.audit.write({
      actorUserId: actor.id,
      propertyId: query.property_id,
      action: 'property_owner.realization.finance_request_exported',
      resourceType: 'property_owner_finance_request',
      afterData: { period: period.value, format, total: rows.length },
      resultStatus: 'success',
    });
    return file;
  }

  /** Exports the exact filtered queue shown to Admin, including all pages. */
  async exportQueue(actor: UserAccessContext, query: OwnerRealizationQueryDto, format: string) {
    this.assertPropertyScope(actor, query.property_id);
    const first = await this.list(actor, { ...query, offset: 0, limit: 100 });
    const rows = [...first.rows];
    for (let offset = 100; offset < first.meta.total; offset += 100) {
      const next = await this.list(actor, { ...query, offset, limit: 100 });
      rows.push(...next.rows);
    }
    const property = await this.database.client.query<{ name: string }>(
      `SELECT name FROM properties WHERE id=$1`,
      [query.property_id],
    );
    const report: ReportResult = {
      report_type: 'property-owners',
      title: query.workspace === 'history' ? 'Riwayat Realisasi Owner' : 'Realisasi Aktif Owner',
      property_name: property.rows[0]?.name ?? 'KOSTATION',
      period: {
        date_from: first.period ? `${first.period}-01` : '',
        date_to: first.period ? periodEndDate(first.period) : '',
      },
      generated_at: new Date().toISOString(),
      generated_by: actor.displayName,
      filter_checksum: createHash('sha256').update(JSON.stringify(query)).digest('hex'),
      methodology:
        'Queue contains only full-contract realization status. Security deposits and owner-sponsored occupancy are excluded from Owner entitlement.',
      filter_summary: [
        ['Ruang kerja', query.workspace === 'history' ? 'Riwayat realisasi' : 'Realisasi aktif'],
        ['Status', query.status ?? 'Semua status'],
        [
          'Status profil Owner',
          query.owner_profile_status === 'all' ? 'Owner aktif dan arsip' : 'Owner aktif',
        ],
        ...(query.q ? [['Pencarian', query.q] as [string, string]] : []),
      ],
      summary: {
        eligible_contract_total: first.summary.eligible_contract_total,
        management_fee_total: first.summary.management_fee_total,
        realization_total: first.summary.realization_total,
        transferred_total: first.summary.transferred_total,
      },
      rows: rows.map((row) => ({
        owner: row.owner_name,
        owner_assets: ownerAssetsForExport(row.assets, Boolean(row.realization)),
        plot_number: row.plot_number ?? '—',
        eligible_contract_count: row.eligible_contract_count,
        total_contract_rent: Number(row.eligible_contract_total),
        management_fee: Number(row.management_fee_total),
        owner_realization: Number(row.realization_total),
        transferred: Number(row.transferred_total),
        status: row.realization?.status ?? 'not_prepared',
        entry_kind: row.realization?.entry_kind ?? 'system',
      })),
      meta: { offset: 0, limit: rows.length, total: rows.length },
    };
    const exportSlug =
      query.workspace === 'history' ? 'riwayat-realisasi-owner' : 'realisasi-aktif-owner';
    const file =
      format === 'xlsx'
        ? {
            content: reportToXlsx(report),
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename: `${exportSlug}-${first.period ?? 'semua'}.xlsx`,
          }
        : format === 'pdf'
          ? {
              content: await reportToPdf(report),
              contentType: 'application/pdf',
              filename: `${exportSlug}-${first.period ?? 'semua'}.pdf`,
            }
          : null;
    if (!file)
      throw new BadRequestException({
        code: 'OWNER_REALIZATION_EXPORT_FORMAT_INVALID',
        message: 'Format ekspor harus pdf atau xlsx.',
      });
    await this.audit.write({
      actorUserId: actor.id,
      propertyId: query.property_id,
      action: 'property_owner.realization.queue_exported',
      resourceType: 'property_owner_realization_queue',
      afterData: {
        period: first.period,
        workspace: query.workspace ?? 'active',
        format,
        total: rows.length,
      },
      resultStatus: 'success',
    });
    return file;
  }

  async exportNotEligible(
    actor: UserAccessContext,
    query: OwnerRealizationQueryDto,
    format: string,
  ) {
    const result = await this.listNotEligible(actor, { ...query, offset: 0, limit: 100 });
    const pages = [...result.rows];
    for (let offset = 100; offset < result.meta.total; offset += 100) {
      const next = await this.listNotEligible(actor, { ...query, offset, limit: 100 });
      pages.push(...next.rows);
    }
    const property = await this.database.client.query<{ name: string }>(
      `SELECT name FROM properties WHERE id=$1`,
      [query.property_id],
    );
    const report: ReportResult = {
      report_type: 'property-owners',
      title: 'Data Tidak Layak Realisasi Owner',
      property_name: property.rows[0]?.name ?? 'KOSTATION',
      period: { date_from: `${result.period}-01`, date_to: periodEndDate(result.period) },
      generated_at: new Date().toISOString(),
      generated_by: actor.displayName,
      filter_checksum: createHash('sha256').update(JSON.stringify(query)).digest('hex'),
      methodology:
        'Admin-only diagnostic list. These rows cannot be paid to Owner until their stated reason is resolved.',
      filter_summary: [
        ['Ruang kerja', 'Tidak layak'],
        [
          'Status profil Owner',
          query.owner_profile_status === 'all' ? 'Owner aktif dan arsip' : 'Owner aktif',
        ],
        ...(query.q ? [['Pencarian', query.q] as [string, string]] : []),
      ],
      summary: {
        total_not_eligible: pages.length,
        outstanding_contract_rent: pages.filter(
          (row: Record<string, unknown>) => row.reason_code === 'OUTSTANDING_CONTRACT_RENT',
        ).length,
        owner_sponsored_excluded: pages.filter(
          (row: Record<string, unknown>) => row.reason_code === 'OWNER_SPONSORED_EXCLUDED',
        ).length,
      },
      rows: pages.map((row) => ({
        owner: row.owner_name,
        room: row.room_code,
        plot_number: row.plot_number ?? '-',
        resident: row.resident_name,
        total_contract: numberValue(row.contract_rent_amount),
        reason: this.notEligibleReasonLabel(row.reason_code),
      })),
      meta: { offset: 0, limit: pages.length, total: pages.length },
    };
    const file =
      format === 'xlsx'
        ? {
            content: reportToXlsx(report),
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename: `tidak-layak-realisasi-owner-${result.period}.xlsx`,
          }
        : format === 'pdf'
          ? {
              content: await reportToPdf(report),
              contentType: 'application/pdf',
              filename: `tidak-layak-realisasi-owner-${result.period}.pdf`,
            }
          : null;
    if (!file)
      throw new BadRequestException({
        code: 'OWNER_REALIZATION_EXPORT_FORMAT_INVALID',
        message: 'Format ekspor harus pdf atau xlsx.',
      });
    await this.audit.write({
      actorUserId: actor.id,
      propertyId: query.property_id,
      action: 'property_owner.realization.not_eligible_exported',
      resourceType: 'property_owner_realization_not_eligible',
      afterData: { period: result.period, format, total: pages.length },
      resultStatus: 'success',
    });
    return file;
  }

  async prepare(
    actor: UserAccessContext,
    ownerId: string,
    dto: PrepareOwnerRealizationDto,
    idempotencyKey: string | undefined,
    context: RequestAuditContext,
  ) {
    const period = this.period(dto.period);
    return this.command(
      actor,
      dto.property_id,
      '/admin/property-owner-realizations/:ownerId/prepare',
      idempotencyKey,
      { ownerId, ...dto },
      context,
      async (client) => {
        await this.lockOwner(client, ownerId, dto.property_id);
        const availableCandidates = (
          await this.eligibleCandidates(client, dto.property_id, period.until, ownerId)
        ).filter((candidate) => candidate.payment_completed_at.slice(0, 10) < period.until);
        const selectedLeaseIds = dto.selected_lease_ids ? new Set(dto.selected_lease_ids) : null;
        const candidates = selectedLeaseIds
          ? availableCandidates.filter((candidate) => selectedLeaseIds.has(candidate.lease_id))
          : availableCandidates;
        if (selectedLeaseIds && candidates.length !== selectedLeaseIds.size) {
          throw new ConflictException({
            code: 'OWNER_REALIZATION_SELECTION_STALE',
            message: 'Pilihan kontrak berubah. Muat ulang daftar kontrak yang layak.',
          });
        }
        if (candidates.length === 0) {
          throw new ConflictException({
            code: 'OWNER_REALIZATION_NO_ELIGIBLE_CONTRACT',
            message:
              'Belum ada kontrak sewa berbayar yang lunas dan dapat direalisasikan untuk Owner ini.',
          });
        }
        await client.query(`SELECT id FROM leases WHERE id=ANY($1::uuid[]) FOR UPDATE`, [
          candidates.map((candidate) => candidate.lease_id),
        ]);
        const totals = this.candidateTotals(candidates);
        const owner = await client.query(
          `SELECT full_name,payout_bank_name,payout_account_number,payout_account_holder
           FROM property_owner_profiles WHERE id=$1`,
          [ownerId],
        );
        const property = await client.query<{ name: string }>(
          `SELECT name FROM properties WHERE id=$1`,
          [dto.property_id],
        );
        const ownerSnapshot = {
          full_name: owner.rows[0].full_name,
          payout_bank_name: owner.rows[0].payout_bank_name,
          payout_account_number: owner.rows[0].payout_account_number,
          payout_account_holder: owner.rows[0].payout_account_holder,
        };
        const scopeSnapshot = {
          ...this.scopeSnapshot(candidates),
          property_name: property.rows[0]?.name ?? 'KOSTATION',
        };
        const tariffSnapshot = this.tariffSnapshot(candidates);
        const realizationReference = `RLS-${period.value.replace('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO property_owner_realizations(
            property_id,owner_profile_id,realization_period,realization_reference,owner_snapshot,scope_snapshot,
            tariff_snapshot,room_count,eligible_contract_total,management_fee_total,realization_total,notes,
            prepared_by_user_id,prepared_at
         ) VALUES($1,$2,$3::date,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12,$13,now()) RETURNING id`,
          [
            dto.property_id,
            ownerId,
            period.start,
            realizationReference,
            JSON.stringify(ownerSnapshot),
            JSON.stringify(scopeSnapshot),
            JSON.stringify(tariffSnapshot),
            candidates.length,
            totals.contract,
            totals.fee,
            totals.net,
            dto.notes ?? null,
            actor.id,
          ],
        );
        const realizationId = inserted.rows[0].id;
        for (const candidate of candidates) {
          const line = await client.query<{ id: string }>(
            `INSERT INTO property_owner_realization_lines(
             realization_id,property_id,lease_id,room_id,resident_id,room_code_snapshot,building_name_snapshot,
             resident_name_snapshot,owner_name_snapshot,duration_months,pricing_source_snapshot,pricing_tier_snapshot,
             payment_completed_at,check_in_at,check_out_at,money_received_amount,contract_total_amount,outstanding_amount,
              management_fee_amount,net_realization_amount,snapshot,plot_number_snapshot
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz,$14::timestamptz,$15::timestamptz,
              $16,$17,$18,$19,$20,$21::jsonb,(SELECT plot_number FROM rooms WHERE id=$4 AND property_id=$2)) RETURNING id`,
            [
              realizationId,
              dto.property_id,
              candidate.lease_id,
              candidate.room_id,
              candidate.resident_id,
              candidate.room_code,
              candidate.building_name,
              candidate.resident_name,
              candidate.owner_name,
              candidate.term_months,
              candidate.pricing_source,
              candidate.pricing_tier,
              candidate.payment_completed_at,
              candidate.check_in_at,
              candidate.check_out_at,
              Number(candidate.money_received_amount),
              Number(candidate.contract_total_amount),
              Number(candidate.outstanding_amount),
              Number(candidate.management_fee_amount),
              Number(candidate.net_realization_amount),
              JSON.stringify({
                asset_id: candidate.asset_id,
                building_code: candidate.building_code,
                building_name: candidate.building_name,
                ownership_kind: candidate.ownership_kind,
                fee_effective_date: candidate.fee_effective_date,
              }),
            ],
          );
          try {
            await client.query(
              `INSERT INTO property_owner_realization_lease_locks(property_id,lease_id,realization_id,realization_line_id)
             VALUES($1,$2,$3,$4)`,
              [dto.property_id, candidate.lease_id, realizationId, line.rows[0].id],
            );
          } catch (error: unknown) {
            if (this.isUniqueViolation(error)) {
              throw new ConflictException({
                code: 'OWNER_REALIZATION_LEASE_ALREADY_LOCKED',
                message:
                  'Salah satu kontrak sudah masuk ke Realisasi Owner lain. Muat ulang data lalu coba lagi.',
              });
            }
            throw error;
          }
        }
        const response = {
          realization_id: realizationId,
          reference: realizationReference,
          status: 'draft',
          totals,
        };
        await this.audit.write(
          {
            actorUserId: actor.id,
            propertyId: dto.property_id,
            action: 'property_owner.realization.prepared',
            resourceType: 'property_owner_realization',
            resourceId: realizationId,
            afterData: response,
            resultStatus: 'success',
            ...context,
          },
          client,
        );
        return response;
      },
    );
  }

  async submitForReview(
    actor: UserAccessContext,
    realizationId: string,
    dto: ChangeOwnerRealizationStatusDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.transition(
      actor,
      realizationId,
      dto,
      key,
      context,
      'draft',
      'awaiting_review',
      'submitted_for_review',
    );
  }

  async voidDraft(
    actor: UserAccessContext,
    realizationId: string,
    dto: VoidOwnerRealizationDraftDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.voidRealization(actor, realizationId, dto, key, context);
  }

  async voidRealization(
    actor: UserAccessContext,
    realizationId: string,
    dto: CancelOwnerRealizationDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    const reason = dto.reason.trim();
    return this.command(
      actor,
      dto.property_id,
      '/admin/property-owner-realizations/:id/void',
      key,
      { realizationId, property_id: dto.property_id, reason },
      context,
      async (client) => {
        const realization = await this.lockRealization(client, realizationId, dto.property_id);
        const cancellableStatuses: RealizationStatus[] = [
          'draft',
          'awaiting_review',
          'approved',
          'submitted_to_finance',
          'awaiting_transfer',
        ];
        if (!cancellableStatuses.includes(realization.realization_status)) {
          throw new ConflictException({
            code: 'OWNER_REALIZATION_CANCELLATION_LOCKED',
            message:
              'Realisasi yang sudah memiliki transfer berhasil atau sudah diterbitkan tidak dapat dibatalkan. Gunakan koreksi atau pemulihan terhubung.',
          });
        }
        const transfers = await client.query<{ transfer_count: string }>(
          `SELECT count(*)::text AS transfer_count
             FROM property_owner_realization_transfers
            WHERE realization_id=$1 AND transfer_status='succeeded'`,
          [realizationId],
        );
        if (
          Number(transfers.rows[0]?.transfer_count ?? 0) > 0 ||
          Number(realization.transferred_total) > 0
        ) {
          throw new ConflictException({
            code: 'OWNER_REALIZATION_HAS_SUCCESSFUL_TRANSFER',
            message: 'Realisasi yang sudah memiliki transfer berhasil tidak dapat dibatalkan.',
          });
        }
        const released = await client.query(
          `UPDATE property_owner_realization_lease_locks
              SET lock_status='released',released_at=now(),released_by_user_id=$2,release_reason=$3
            WHERE realization_id=$1 AND lock_status='locked'`,
          [realizationId, actor.id, reason],
        );
        await client.query(
          `UPDATE property_owner_realizations
              SET realization_status='void',voided_at=now(),voided_by_user_id=$2,
                  void_reason=$3,updated_at=now()
            WHERE id=$1`,
          [realizationId, actor.id, reason],
        );
        const response = {
          realization_id: realizationId,
          status: 'void',
          released_lease_count: released.rowCount ?? 0,
          reason,
        };
        await this.audit.write(
          {
            actorUserId: actor.id,
            propertyId: dto.property_id,
            action: 'property_owner.realization.cancelled',
            resourceType: 'property_owner_realization',
            resourceId: realizationId,
            beforeData: {
              status: realization.realization_status,
              realization_total: realization.realization_total,
              transferred_total: realization.transferred_total,
            },
            afterData: response,
            resultStatus: 'success',
            ...context,
          },
          client,
        );
        return response;
      },
    );
  }

  async approve(
    actor: UserAccessContext,
    realizationId: string,
    dto: ChangeOwnerRealizationStatusDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.transition(
      actor,
      realizationId,
      dto,
      key,
      context,
      'awaiting_review',
      'approved',
      'approved',
    );
  }

  async returnToDraft(
    actor: UserAccessContext,
    realizationId: string,
    dto: ChangeOwnerRealizationStatusDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.transition(
      actor,
      realizationId,
      dto,
      key,
      context,
      'awaiting_review',
      'draft',
      'returned_to_draft',
    );
  }

  async submitToFinance(
    actor: UserAccessContext,
    realizationId: string,
    dto: ChangeOwnerRealizationStatusDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.transition(
      actor,
      realizationId,
      dto,
      key,
      context,
      'approved',
      'submitted_to_finance',
      'submitted_to_finance',
    );
  }

  async markAwaitingTransfer(
    actor: UserAccessContext,
    realizationId: string,
    dto: ChangeOwnerRealizationStatusDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.transition(
      actor,
      realizationId,
      dto,
      key,
      context,
      'submitted_to_finance',
      'awaiting_transfer',
      'awaiting_transfer',
    );
  }

  async publish(
    actor: UserAccessContext,
    realizationId: string,
    dto: ChangeOwnerRealizationStatusDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.command(
      actor,
      dto.property_id,
      '/admin/property-owner-realizations/:id/publish',
      key,
      dto,
      context,
      async (client) => {
        const realization = await this.lockRealization(client, realizationId, dto.property_id);
        if (realization.realization_status !== 'realized')
          this.invalidTransition(realization.realization_status, 'published_to_owner');
        await client.query(
          `UPDATE property_owner_realizations
            SET realization_status='published_to_owner',published_at=now(),published_by_user_id=$2,updated_at=now()
          WHERE id=$1`,
          [realizationId, actor.id],
        );
        const response = {
          realization_id: realizationId,
          status: 'published_to_owner',
          note: dto.note,
        };
        await this.audit.write(
          {
            actorUserId: actor.id,
            propertyId: dto.property_id,
            action: 'property_owner.realization.published',
            resourceType: 'property_owner_realization',
            resourceId: realizationId,
            afterData: response,
            resultStatus: 'success',
            ...context,
          },
          client,
        );
        return response;
      },
    );
  }

  async addCorrection(
    actor: UserAccessContext,
    realizationId: string,
    dto: CreateOwnerRealizationCorrectionDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.command(
      actor,
      dto.property_id,
      '/admin/property-owner-realizations/:id/corrections',
      key,
      dto,
      context,
      async (client) => {
        const realization = await this.lockRealization(client, realizationId, dto.property_id);
        const isDraft = realization.realization_status === 'draft';
        const isPostTransfer = ['partially_realized', 'realized', 'published_to_owner'].includes(
          realization.realization_status,
        );
        if (!isDraft && !isPostTransfer) {
          throw new ConflictException({
            code: 'OWNER_REALIZATION_CORRECTION_LOCKED',
            message:
              'Penyesuaian hanya dapat ditambahkan pada draft atau sebagai pemulihan setelah transfer.',
          });
        }
        if (isDraft && dto.correction_kind === 'transfer_recovery') {
          throw new ConflictException({
            code: 'OWNER_REALIZATION_RECOVERY_REQUIRES_TRANSFER',
            message: 'Pemulihan transfer hanya tersedia setelah transfer Realisasi tercatat.',
          });
        }
        if (isDraft && (!dto.source_reference?.trim() || !dto.evidence_file_ids?.length)) {
          throw new BadRequestException({
            code: 'OWNER_REALIZATION_CORRECTION_EVIDENCE_REQUIRED',
            message: 'Koreksi draft wajib memiliki sumber dan unggahan bukti pendukung.',
          });
        }
        if (isPostTransfer && dto.correction_kind !== 'transfer_recovery') {
          throw new ConflictException({
            code: 'OWNER_REALIZATION_POST_TRANSFER_RECOVERY_ONLY',
            message: 'Setelah transfer, hanya pemulihan atau reversal yang dapat dicatat.',
          });
        }
        if (isPostTransfer && dto.amount >= 0) {
          throw new BadRequestException({
            code: 'OWNER_REALIZATION_RECOVERY_MUST_REDUCE',
            message:
              'Nominal pengembalian dana berlebih setelah transfer harus bernilai pengurang.',
          });
        }
        if (isPostTransfer && !dto.recovery_disposition) {
          throw new BadRequestException({
            code: 'OWNER_REALIZATION_RECOVERY_DISPOSITION_REQUIRED',
            message: 'Pengembalian dana berlebih wajib memiliki cara penyelesaian.',
          });
        }
        if (Number(realization.realization_total) + dto.amount < 0) {
          throw new BadRequestException({
            code: 'OWNER_REALIZATION_CORRECTION_NEGATIVE_TOTAL',
            message: 'Penyesuaian tidak boleh membuat Hak Owner menjadi negatif.',
          });
        }
        const priorRecovery = isPostTransfer
          ? await client.query<{ total: string }>(
              `SELECT COALESCE(sum(-amount),0)::text AS total FROM property_owner_realization_corrections
            WHERE realization_id=$1 AND correction_kind='transfer_recovery' AND correction_status='approved'`,
              [realizationId],
            )
          : null;
        const transferredTotal = Number(realization.transferred_total ?? 0);
        const ownerEntitlement = Number(realization.realization_total ?? 0);
        const overpaymentTotal = Math.max(transferredTotal - ownerEntitlement, 0);
        const priorRecoveryTotal = Number(priorRecovery?.rows[0]?.total ?? 0);
        const requestedRecovery = Math.abs(Number(dto.amount));
        if (
          isPostTransfer &&
          (overpaymentTotal <= 0 || priorRecoveryTotal + requestedRecovery > overpaymentTotal)
        ) {
          throw new ConflictException({
            code: 'OWNER_REALIZATION_RECOVERY_EXCEEDS_TRANSFER',
            message:
              'Nominal pengembalian dana berlebih tidak boleh melebihi kelebihan transfer yang tercatat.',
          });
        }
        const correction = await client.query<{ id: string }>(
          `INSERT INTO property_owner_realization_corrections(
           realization_id,property_id,correction_kind,amount,reason,evidence_reference,source_reference,
           recovery_disposition,recovery_status,recovery_reference,
           created_by_user_id,approved_by_user_id,approved_at
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,now()) RETURNING id`,
          [
            realizationId,
            dto.property_id,
            dto.correction_kind,
            dto.amount,
            dto.reason.trim(),
            dto.evidence_reference ?? null,
            dto.source_reference ?? null,
            isPostTransfer ? dto.recovery_disposition : null,
            isPostTransfer ? 'open' : null,
            isPostTransfer ? dto.source_reference?.trim() || 'Catatan pembukaan pemulihan' : null,
            actor.id,
          ],
        );
        await this.attachEvidence(
          client,
          dto.property_id,
          realizationId,
          'correction',
          correction.rows[0].id,
          dto.evidence_file_ids,
        );
        const totals = await this.recalculate(client, realizationId, !isPostTransfer);
        const response = {
          realization_id: realizationId,
          correction_id: correction.rows[0].id,
          totals,
        };
        await this.audit.write(
          {
            actorUserId: actor.id,
            propertyId: dto.property_id,
            action: 'property_owner.realization.correction_added',
            resourceType: 'property_owner_realization',
            resourceId: realizationId,
            afterData: response,
            resultStatus: 'success',
            ...context,
          },
          client,
        );
        return response;
      },
    );
  }

  async recordTransfer(
    actor: UserAccessContext,
    realizationId: string,
    dto: RecordOwnerRealizationTransferDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.command(
      actor,
      dto.property_id,
      '/admin/property-owner-realizations/:id/transfers',
      key,
      dto,
      context,
      async (client) => {
        const realization = await this.lockRealization(client, realizationId, dto.property_id);
        if (!['awaiting_transfer', 'partially_realized'].includes(realization.realization_status)) {
          this.invalidTransition(realization.realization_status, 'record_transfer');
        }
        this.assertTransferEvidence(
          dto.transferred_at,
          dto.evidence_file_ids,
          dto.legacy_evidence_reason,
          dto.legacy_evidence_source,
          dto.reference,
        );
        if (
          !dto.finance_confirmed_by ||
          !dto.finance_confirmation_channel ||
          !dto.finance_confirmed_at
        )
          throw new BadRequestException({
            code: 'OWNER_REALIZATION_FINANCE_CONFIRMATION_REQUIRED',
            message: 'Nama, jalur, dan waktu konfirmasi Keuangan wajib dicatat.',
          });
        const remaining =
          Number(realization.realization_total) - Number(realization.transferred_total);
        if (dto.amount > remaining) {
          throw new ConflictException({
            code: 'OWNER_REALIZATION_TRANSFER_EXCEEDS_REMAINING',
            message: 'Nominal transfer melebihi sisa Realisasi Owner.',
          });
        }
        // The realization row lock serializes transfers for this realization.
        // This additional transaction lock covers the same bank reference being
        // submitted concurrently against two different Owner realizations.
        await client.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2, 0))`,
          [dto.property_id, dto.reference.trim()],
        );
        const duplicateReference = await client.query<{ id: string }>(
          `SELECT id
             FROM property_owner_realization_transfers
            WHERE property_id=$1
              AND transfer_status='succeeded'
              AND transfer_reference=$2
            LIMIT 1
            FOR UPDATE`,
          [dto.property_id, dto.reference.trim()],
        );
        if (duplicateReference.rows[0]) {
          throw new ConflictException({
            code: 'OWNER_REALIZATION_TRANSFER_REFERENCE_DUPLICATE',
            message: 'Referensi transfer tersebut sudah pernah dicatat untuk Realisasi Owner.',
          });
        }
        const issued = await client.query<{ receipt_number: string }>(
          `SELECT next_owner_realization_receipt_number($1,now()) AS receipt_number`,
          [dto.property_id],
        );
        const destination = this.destinationSnapshot(realization);
        const transfer = await client.query<{ id: string }>(
          `INSERT INTO property_owner_realization_transfers(
           realization_id,property_id,transfer_amount,transfer_method,transfer_reference,transfer_evidence_reference,
           destination_snapshot,transferred_at,recorded_by_user_id,receipt_number,receipt_issued_at,
           finance_confirmed_by,finance_confirmation_channel,finance_confirmed_at,legacy_evidence_reason
         ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::timestamptz,$9,$10,now(),$11,$12,$13::timestamptz,$14) RETURNING id`,
          [
            realizationId,
            dto.property_id,
            dto.amount,
            dto.method,
            dto.reference.trim(),
            dto.evidence_reference ?? null,
            JSON.stringify(destination),
            dto.transferred_at,
            actor.id,
            issued.rows[0].receipt_number,
            dto.finance_confirmed_by.trim(),
            dto.finance_confirmation_channel,
            dto.finance_confirmed_at,
            dto.legacy_evidence_reason?.trim() || null,
          ],
        );
        await this.attachEvidence(
          client,
          dto.property_id,
          realizationId,
          'transfer',
          transfer.rows[0].id,
          dto.evidence_file_ids,
        );
        const totalTransferred = Number(realization.transferred_total) + dto.amount;
        const nextStatus: RealizationStatus =
          totalTransferred === Number(realization.realization_total)
            ? 'realized'
            : 'partially_realized';
        await client.query(
          `UPDATE property_owner_realizations SET transferred_total=$2,realization_status=$3,
             realized_at=CASE WHEN $3='realized' THEN now() ELSE realized_at END,updated_at=now() WHERE id=$1`,
          [realizationId, totalTransferred, nextStatus],
        );
        const snapshot = await this.receiptSnapshot(
          client,
          realizationId,
          transfer.rows[0].id,
          issued.rows[0].receipt_number,
        );
        await client.query(
          `INSERT INTO property_owner_realization_documents(
           realization_id,transfer_id,property_id,document_kind,document_number,document_snapshot,issued_by_user_id
         ) VALUES($1,$2,$3,'payout_receipt',$4,$5::jsonb,$6)`,
          [
            realizationId,
            transfer.rows[0].id,
            dto.property_id,
            issued.rows[0].receipt_number,
            JSON.stringify(snapshot),
            actor.id,
          ],
        );
        const response = {
          realization_id: realizationId,
          transfer_id: transfer.rows[0].id,
          receipt_number: issued.rows[0].receipt_number,
          status: nextStatus,
          transferred_total: totalTransferred,
          remaining: Math.max(Number(realization.realization_total) - totalTransferred, 0),
        };
        await this.audit.write(
          {
            actorUserId: actor.id,
            propertyId: dto.property_id,
            action: 'property_owner.realization.transfer_recorded',
            resourceType: 'property_owner_realization',
            resourceId: realizationId,
            afterData: response,
            resultStatus: 'success',
            ...context,
          },
          client,
        );
        return response;
      },
    );
  }

  async recordRecoveryEvent(
    actor: UserAccessContext,
    realizationId: string,
    correctionId: string,
    dto: RecordOwnerRealizationRecoveryEventDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.command(
      actor,
      dto.property_id,
      '/admin/property-owner-realizations/:id/corrections/:correctionId/recovery-events',
      key,
      { correctionId, ...dto },
      context,
      async (client) => {
        await this.lockRealization(client, realizationId, dto.property_id);
        const correction = await client.query<{ amount: string; recovery_status: string }>(
          `SELECT amount::text,recovery_status FROM property_owner_realization_corrections
            WHERE id=$1 AND realization_id=$2 AND property_id=$3 AND correction_kind='transfer_recovery'
            FOR UPDATE`,
          [correctionId, realizationId, dto.property_id],
        );
        if (!correction.rows[0] || correction.rows[0].recovery_status !== 'open')
          throw new ConflictException({
            code: 'OWNER_REALIZATION_RECOVERY_NOT_OPEN',
            message: 'Pemulihan ini tidak terbuka.',
          });
        if (!dto.finance_reference?.trim() && !dto.evidence_file_ids?.length)
          throw new BadRequestException({
            code: 'OWNER_REALIZATION_RECOVERY_PROOF_REQUIRED',
            message: 'Setiap penyelesaian pemulihan wajib memiliki bukti atau referensi keuangan.',
          });
        const prior = await client.query<{ total: string }>(
          `SELECT COALESCE(sum(amount),0)::text AS total FROM property_owner_realization_recovery_events WHERE correction_id=$1`,
          [correctionId],
        );
        const next = Number(prior.rows[0].total) + dto.amount;
        if (next > -Number(correction.rows[0].amount))
          throw new ConflictException({
            code: 'OWNER_REALIZATION_RECOVERY_EXCEEDS_BALANCE',
            message: 'Nominal pengembalian dana berlebih melebihi sisa yang belum diselesaikan.',
          });
        const event = await client.query<{ id: string }>(
          `INSERT INTO property_owner_realization_recovery_events
           (property_id,realization_id,correction_id,amount,occurred_at,finance_reference,note,created_by_user_id)
           VALUES($1,$2,$3,$4,$5::timestamptz,$6,$7,$8) RETURNING id`,
          [
            dto.property_id,
            realizationId,
            correctionId,
            dto.amount,
            dto.occurred_at,
            dto.finance_reference?.trim() || null,
            dto.note.trim(),
            actor.id,
          ],
        );
        await this.attachEvidence(
          client,
          dto.property_id,
          realizationId,
          'recovery_event',
          event.rows[0].id,
          dto.evidence_file_ids,
        );
        if (next === -Number(correction.rows[0].amount))
          await client.query(
            `UPDATE property_owner_realization_corrections SET recovery_status='resolved',recovery_resolved_at=now() WHERE id=$1`,
            [correctionId],
          );
        const response = {
          recovery_event_id: event.rows[0].id,
          recovered_total: next,
          remaining: -Number(correction.rows[0].amount) - next,
        };
        await this.audit.write(
          {
            actorUserId: actor.id,
            propertyId: dto.property_id,
            action: 'property_owner.realization.recovery_recorded',
            resourceType: 'property_owner_realization',
            resourceId: realizationId,
            afterData: response,
            resultStatus: 'success',
            ...context,
          },
          client,
        );
        return response;
      },
    );
  }

  async createHistorical(
    actor: UserAccessContext,
    ownerId: string,
    dto: CreateHistoricalOwnerRealizationDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    const period = this.period(dto.period);
    return this.command(
      actor,
      dto.property_id,
      '/admin/property-owner-realizations/:ownerId/historical',
      key,
      { ownerId, ...dto },
      context,
      async (client) => {
        await this.lockOwner(client, ownerId, dto.property_id, { allowArchived: true });
        const legacyTransferValues = [
          dto.transfer_amount,
          dto.transfer_method,
          dto.transfer_reference,
          dto.transfer_evidence_reference,
          dto.transferred_at,
        ];
        const hasLegacyTransfer = legacyTransferValues.some(
          (value) => value !== undefined && value !== null && value !== '',
        );
        if (hasLegacyTransfer && dto.transfers?.length) {
          throw new BadRequestException({
            code: 'OWNER_REALIZATION_HISTORICAL_TRANSFER_FORMAT_AMBIGUOUS',
            message: 'Gunakan satu format pencatatan transfer historis saja.',
          });
        }
        if (
          hasLegacyTransfer &&
          !(
            dto.transfer_amount &&
            dto.transfer_method &&
            dto.transfer_reference &&
            dto.transferred_at
          )
        ) {
          throw new BadRequestException({
            code: 'OWNER_REALIZATION_HISTORICAL_TRANSFER_INCOMPLETE',
            message: 'Data transfer historis harus diisi lengkap atau dikosongkan seluruhnya.',
          });
        }
        const historicalTransfers =
          dto.transfers ??
          (hasLegacyTransfer
            ? [
                {
                  amount: dto.transfer_amount!,
                  method: dto.transfer_method!,
                  reference: dto.transfer_reference!.trim(),
                  evidence_reference: dto.transfer_evidence_reference?.trim() || undefined,
                  transferred_at: dto.transferred_at!,
                },
              ]
            : []);
        const owner = await client.query(
          `SELECT full_name,payout_bank_name,payout_account_number,payout_account_holder FROM property_owner_profiles WHERE id=$1`,
          [ownerId],
        );
        const property = await client.query<{ name: string }>(
          `SELECT name FROM properties WHERE id=$1`,
          [dto.property_id],
        );
        const totals = dto.lines.reduce(
          (total, line) => ({
            contract: total.contract + line.contract_total,
            fee: total.fee + line.management_fee,
            correction: total.correction + (line.correction_amount ?? 0),
          }),
          { contract: 0, fee: 0, correction: 0 },
        );
        const realizationTotal = totals.contract - totals.fee + totals.correction;
        if (realizationTotal < 0)
          throw new BadRequestException({
            code: 'OWNER_REALIZATION_HISTORICAL_NEGATIVE_TOTAL',
            message: 'Total Realisasi historis tidak boleh negatif.',
          });
        const transferResolution = resolveHistoricalRealizationTransfers(
          realizationTotal,
          historicalTransfers.map((transfer) => transfer.amount),
        );
        if (!transferResolution.ok) {
          const errorByReason = {
            invalid_owner_total: {
              code: 'OWNER_REALIZATION_HISTORICAL_TOTAL_UNSAFE',
              message: 'Total Hak Owner historis tidak dapat diproses sebagai nominal Rupiah aman.',
            },
            invalid_transfer_amount: {
              code: 'OWNER_REALIZATION_HISTORICAL_TRANSFER_INVALID',
              message: 'Setiap nominal transfer historis harus berupa Rupiah positif.',
            },
            unsafe_transfer_total: {
              code: 'OWNER_REALIZATION_HISTORICAL_TRANSFER_TOTAL_UNSAFE',
              message: 'Jumlah transfer historis melebihi batas nominal yang dapat diproses.',
            },
            exceeds_owner_total: {
              code: 'OWNER_REALIZATION_HISTORICAL_TRANSFER_EXCEEDS_TOTAL',
              message: 'Total transfer historis tidak boleh melebihi hak Owner pada laporan ini.',
            },
          } as const;
          throw new BadRequestException(errorByReason[transferResolution.reason]);
        }
        const { transferredTotal, status } = transferResolution;
        const reference = `RLS-HIS-${period.value.replace('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO property_owner_realizations(
           property_id,owner_profile_id,realization_period,realization_reference,realization_status,entry_kind,historical_source,
           owner_snapshot,scope_snapshot,tariff_snapshot,room_count,eligible_contract_total,management_fee_total,correction_total,
           realization_total,transferred_total,notes,prepared_by_user_id,prepared_at,realized_at
         ) VALUES($1,$2,$3::date,$4,$5,$6,$7,$8::jsonb,$9::jsonb,'{}'::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,now(),
           CASE WHEN $5='realized' THEN now() ELSE NULL END) RETURNING id`,
          [
            dto.property_id,
            ownerId,
            period.start,
            reference,
            status,
            dto.entry_kind,
            dto.historical_source.trim(),
            JSON.stringify(owner.rows[0]),
            JSON.stringify({
              property_name: property.rows[0]?.name ?? 'KOSTATION',
              room_count: dto.lines.length,
            }),
            dto.lines.length,
            totals.contract,
            totals.fee,
            totals.correction,
            realizationTotal,
            transferredTotal,
            dto.notes ?? null,
            actor.id,
          ],
        );
        const realizationId = inserted.rows[0].id;
        let importReference: string | null = null;
        if (dto.entry_kind === 'historical_import') {
          importReference = `RLS-IMP-${period.value.replace('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
          await client.query(
            `INSERT INTO property_owner_realization_imports(
             realization_id,property_id,import_reference,source_filename,imported_row_count,accepted_row_count,rejected_row_count,created_by_user_id
           ) VALUES($1,$2,$3,$4,$5,$5,0,$6)`,
            [
              realizationId,
              dto.property_id,
              importReference,
              dto.historical_source.trim(),
              dto.lines.length,
              actor.id,
            ],
          );
        }
        for (const line of dto.lines) {
          const matches = line.lease_id
            ? await client.query<HistoricalLeaseMatch>(
                `SELECT lease.id,lease.resident_id,lease.room_id,
                       COALESCE(room.building_id,room.id)::text AS asset_id,
                       COALESCE(building.building_code,room.room_code) AS building_code,
                       COALESCE(building.building_name,room.room_code) AS building_name,
                       room.room_code,lease.term_months,
                      lease.activated_at::text,lease.end_date::text
                 FROM leases lease
                 JOIN rooms room ON room.id=lease.room_id AND room.property_id=lease.property_id
                  LEFT JOIN room_buildings building ON building.id=room.building_id
                WHERE lease.id=$1 AND lease.property_id=$2`,
                [line.lease_id, dto.property_id],
              )
            : await client.query<HistoricalLeaseMatch>(
                `SELECT lease.id,lease.resident_id,lease.room_id,
                       COALESCE(room.building_id,room.id)::text AS asset_id,
                       COALESCE(building.building_code,room.room_code) AS building_code,
                       COALESCE(building.building_name,room.room_code) AS building_name,
                       room.room_code,lease.term_months,
                      lease.activated_at::text,lease.end_date::text
                 FROM leases lease
                 JOIN rooms room ON room.id=lease.room_id AND room.property_id=lease.property_id
                  LEFT JOIN room_buildings building ON building.id=room.building_id
                 JOIN residents resident ON resident.id=lease.resident_id
                WHERE lease.property_id=$1
                  AND lower(trim(room.room_code))=lower(trim($2))
                  AND lower(trim(resident.full_name))=lower(trim($3))
                ORDER BY lease.start_date DESC,lease.id DESC
                LIMIT 2`,
                [dto.property_id, line.room_code, line.resident_name],
              );
          if (line.lease_id && !matches.rows[0]) {
            throw new NotFoundException({
              code: 'OWNER_REALIZATION_HISTORICAL_LEASE_NOT_FOUND',
              message: 'Kontrak historis yang dipilih tidak ditemukan.',
            });
          }
          // An automatic relation is safe only when the room and resident resolve
          // to exactly one lease. Ambiguous legacy rows stay explicitly unlinked.
          let linked = line.lease_id
            ? matches.rows[0]
            : matches.rows.length === 1
              ? matches.rows[0]
              : null;
          let linkResolution:
            | 'explicit'
            | 'automatic_exact_match'
            | 'ambiguous'
            | 'unmatched'
            | 'already_allocated' = line.lease_id
            ? 'explicit'
            : linked
              ? 'automatic_exact_match'
              : matches.rows.length > 1
                ? 'ambiguous'
                : 'unmatched';
          let assetSnapshot: Pick<
            HistoricalLeaseMatch,
            'asset_id' | 'building_code' | 'building_name'
          > | null = linked ?? null;
          if (linked && linked.room_code.toLowerCase() !== line.room_code.trim().toLowerCase()) {
            throw new BadRequestException({
              code: 'OWNER_REALIZATION_HISTORICAL_ROOM_MISMATCH',
              message: 'Kode kamar tidak sesuai dengan kontrak historis yang dipilih.',
            });
          }
          if (linked) {
            // One advisory lock also covers two simultaneous imports that attempt
            // to attach the same historical contract before the unique lock row
            // is committed.
            await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`, [
              linked.id,
            ]);
            const existingLeaseLock = await client.query<{ id: string }>(
              `SELECT id
                 FROM property_owner_realization_lease_locks
                WHERE lease_id=$1 AND lock_status='locked'
                LIMIT 1
                FOR UPDATE`,
              [linked.id],
            );
            if (existingLeaseLock.rows[0]) {
              if (line.lease_id) {
                throw new ConflictException({
                  code: 'OWNER_REALIZATION_HISTORICAL_LEASE_ALREADY_ALLOCATED',
                  message: 'Kontrak historis tersebut sudah masuk ke Realisasi Owner lain.',
                });
              }
              linked = null;
              linkResolution = 'already_allocated';
            }
          }
          if (line.room_id && !linked) {
            const room = await client.query<
              Pick<HistoricalLeaseMatch, 'asset_id' | 'building_code' | 'building_name'> & {
                id: string;
                room_code: string;
              }
            >(
              `SELECT room.id,room.room_code,COALESCE(room.building_id,room.id)::text AS asset_id,
                      COALESCE(building.building_code,room.room_code) AS building_code,
                      COALESCE(building.building_name,room.room_code) AS building_name
                 FROM rooms room
                 LEFT JOIN room_buildings building ON building.id=room.building_id
                WHERE room.id=$1 AND room.property_id=$2`,
              [line.room_id, dto.property_id],
            );
            if (!room.rows[0]) {
              throw new NotFoundException({
                code: 'OWNER_REALIZATION_HISTORICAL_ROOM_NOT_FOUND',
                message: 'Kamar historis yang dipilih tidak ditemukan.',
              });
            }
            if (room.rows[0].room_code.toLowerCase() !== line.room_code.trim().toLowerCase()) {
              throw new BadRequestException({
                code: 'OWNER_REALIZATION_HISTORICAL_ROOM_MISMATCH',
                message: 'Kode kamar tidak sesuai dengan kamar historis yang dipilih.',
              });
            }
            assetSnapshot = room.rows[0];
          }
          if (line.room_id && linked && line.room_id !== linked.room_id) {
            throw new BadRequestException({
              code: 'OWNER_REALIZATION_HISTORICAL_ROOM_MISMATCH',
              message: 'Kamar tidak sesuai dengan kontrak historis yang dipilih.',
            });
          }
          const net = line.contract_total - line.management_fee + (line.correction_amount ?? 0);
          const createdLine = await client.query<{ id: string }>(
            `INSERT INTO property_owner_realization_lines(
             realization_id,property_id,lease_id,room_id,resident_id,line_kind,line_status,room_code_snapshot,
             building_name_snapshot,resident_name_snapshot,owner_name_snapshot,duration_months,
             payment_completed_at,check_in_at,check_out_at,
             contract_total_amount,money_received_amount,management_fee_amount,correction_amount,net_realization_amount,
              legacy_reference,snapshot,plot_number_snapshot
           ) VALUES($1,$2,$3,$4,$5,'historical',$6,$7,$8,$9,$10,$11,$12::timestamptz,$13::timestamptz,
              $14::timestamptz,$15,$15,$16,$17,$18,$19,$20::jsonb,(SELECT plot_number FROM rooms WHERE id=$4 AND property_id=$2)) RETURNING id`,
            [
              realizationId,
              dto.property_id,
              linked?.id ?? null,
              linked?.room_id ?? line.room_id ?? null,
              linked?.resident_id ?? null,
              linked ? 'historical_linked' : 'historical_unlinked',
              line.room_code,
              assetSnapshot?.building_name ?? null,
              line.resident_name,
              owner.rows[0].full_name,
              line.duration_months ?? linked?.term_months ?? null,
              line.payment_completed_at ?? null,
              line.check_in_at ?? linked?.activated_at ?? null,
              line.check_out_at ?? linked?.end_date ?? null,
              line.contract_total,
              line.management_fee,
              line.correction_amount ?? 0,
              net,
              line.legacy_reference ?? null,
              JSON.stringify({
                historical_source: dto.historical_source.trim(),
                link_resolution: linkResolution,
                asset_id: assetSnapshot?.asset_id ?? null,
                building_code: assetSnapshot?.building_code ?? null,
                building_name: assetSnapshot?.building_name ?? null,
              }),
            ],
          );
          if (linked) {
            await client.query(
              `INSERT INTO property_owner_realization_lease_locks(
                 property_id,lease_id,realization_id,realization_line_id
               ) VALUES($1,$2,$3,$4)`,
              [dto.property_id, linked.id, realizationId, createdLine.rows[0].id],
            );
          }
        }
        const transferReferences = historicalTransfers.map((transfer) => transfer.reference.trim());
        if (new Set(transferReferences).size !== transferReferences.length) {
          throw new ConflictException({
            code: 'OWNER_REALIZATION_TRANSFER_REFERENCE_DUPLICATE',
            message: 'Referensi transfer harus berbeda untuk setiap transaksi.',
          });
        }
        for (const transferReference of [...transferReferences].sort((left, right) =>
          left.localeCompare(right),
        )) {
          await client.query(
            `SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2, 0))`,
            [dto.property_id, transferReference],
          );
        }
        if (transferReferences.length) {
          const duplicateReference = await client.query<{ id: string }>(
            `SELECT id
               FROM property_owner_realization_transfers
              WHERE property_id=$1
                AND transfer_status='succeeded'
                AND transfer_reference=ANY($2::text[])
              LIMIT 1
              FOR UPDATE`,
            [dto.property_id, transferReferences],
          );
          if (duplicateReference.rows[0]) {
            throw new ConflictException({
              code: 'OWNER_REALIZATION_TRANSFER_REFERENCE_DUPLICATE',
              message: 'Referensi transfer tersebut sudah pernah dicatat untuk Realisasi Owner.',
            });
          }
        }
        for (const historicalTransfer of historicalTransfers) {
          const transferReference = historicalTransfer.reference.trim();
          this.assertTransferEvidence(
            historicalTransfer.transferred_at,
            'evidence_file_ids' in historicalTransfer
              ? historicalTransfer.evidence_file_ids
              : undefined,
            'legacy_evidence_reason' in historicalTransfer
              ? historicalTransfer.legacy_evidence_reason
              : undefined,
            dto.historical_source,
            transferReference,
          );
          const receipt = await client.query<{ receipt_number: string }>(
            `SELECT next_owner_realization_receipt_number($1,now()) AS receipt_number`,
            [dto.property_id],
          );
          const transfer = await client.query<{ id: string }>(
            `INSERT INTO property_owner_realization_transfers(
             realization_id,property_id,transfer_amount,transfer_method,transfer_reference,transfer_evidence_reference,destination_snapshot,transferred_at,
             recorded_by_user_id,receipt_number,receipt_issued_at,
             finance_confirmed_by,finance_confirmation_channel,finance_confirmed_at,legacy_evidence_reason
           ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::timestamptz,$9,$10,now(),$11,$12,$13::timestamptz,$14) RETURNING id`,
            [
              realizationId,
              dto.property_id,
              historicalTransfer.amount,
              historicalTransfer.method,
              transferReference,
              historicalTransfer.evidence_reference ?? null,
              JSON.stringify({
                bank_name: owner.rows[0]?.payout_bank_name ?? null,
                account_number: owner.rows[0]?.payout_account_number ?? null,
                account_holder: owner.rows[0]?.payout_account_holder ?? null,
                owner_name: owner.rows[0]?.full_name ?? null,
              }),
              historicalTransfer.transferred_at,
              actor.id,
              receipt.rows[0].receipt_number,
              'finance_confirmed_by' in historicalTransfer
                ? (historicalTransfer.finance_confirmed_by ?? null)
                : null,
              'finance_confirmation_channel' in historicalTransfer
                ? (historicalTransfer.finance_confirmation_channel ?? null)
                : null,
              'finance_confirmed_at' in historicalTransfer
                ? (historicalTransfer.finance_confirmed_at ?? null)
                : null,
              'legacy_evidence_reason' in historicalTransfer
                ? (historicalTransfer.legacy_evidence_reason ?? null)
                : null,
            ],
          );
          await this.attachEvidence(
            client,
            dto.property_id,
            realizationId,
            'transfer',
            transfer.rows[0].id,
            'evidence_file_ids' in historicalTransfer
              ? historicalTransfer.evidence_file_ids
              : undefined,
          );
          const snapshot = await this.receiptSnapshot(
            client,
            realizationId,
            transfer.rows[0].id,
            receipt.rows[0].receipt_number,
          );
          await client.query(
            `INSERT INTO property_owner_realization_documents(realization_id,transfer_id,property_id,document_kind,document_number,document_snapshot,issued_by_user_id) VALUES($1,$2,$3,'payout_receipt',$4,$5::jsonb,$6)`,
            [
              realizationId,
              transfer.rows[0].id,
              dto.property_id,
              receipt.rows[0].receipt_number,
              JSON.stringify(snapshot),
              actor.id,
            ],
          );
        }
        const response = {
          realization_id: realizationId,
          reference,
          status,
          transferred_total: transferredTotal,
          transfer_count: historicalTransfers.length,
          historical: true,
          import_reference: importReference,
        };
        await this.audit.write(
          {
            actorUserId: actor.id,
            propertyId: dto.property_id,
            action: 'property_owner.realization.historical_created',
            resourceType: 'property_owner_realization',
            resourceId: realizationId,
            afterData: response,
            resultStatus: 'success',
            ...context,
          },
          client,
        );
        return response;
      },
    );
  }

  async export(
    actor: UserAccessContext,
    realizationId: string,
    propertyId: string,
    format: string,
  ) {
    const detail = await this.detail(actor, realizationId, propertyId);
    const file = await this.exportFromDetail(
      detail,
      format,
      `realisasi-owner-${detail.realization.reference}`,
    );
    await this.audit.write({
      actorUserId: actor.id,
      propertyId,
      action: 'property_owner.realization.exported',
      resourceType: 'property_owner_realization',
      resourceId: realizationId,
      afterData: { format },
      resultStatus: 'success',
    });
    return file;
  }

  async transferReceipt(
    actor: UserAccessContext,
    realizationId: string,
    transferId: string,
    propertyId: string,
  ) {
    this.assertPropertyScope(actor, propertyId);
    const document = await this.receiptDocument(
      this.database.client,
      realizationId,
      transferId,
      propertyId,
    );
    const file = await this.pdfReceipt(document);
    await this.audit.write({
      actorUserId: actor.id,
      propertyId,
      action: 'property_owner.realization.receipt_downloaded',
      resourceType: 'property_owner_realization_transfer',
      resourceId: transferId,
      afterData: { realization_id: realizationId },
      resultStatus: 'success',
    });
    return file;
  }

  async listPublishedForOwner(actor: UserAccessContext) {
    const result = await this.database.client.query(
      `SELECT realization.id,realization.realization_reference,realization.realization_period::text,
              realization.realization_total::text,realization.transferred_total::text,realization.published_at::text,
              transfer.id AS transfer_id,transfer.transfer_amount::text,transfer.transferred_at::text,transfer.receipt_number
         FROM property_owner_profiles owner
         JOIN property_owner_realizations realization ON realization.owner_profile_id=owner.id
         LEFT JOIN property_owner_realization_transfers transfer ON transfer.realization_id=realization.id AND transfer.transfer_status='succeeded'
        WHERE owner.user_id=$1 AND realization.realization_status='published_to_owner'
        ORDER BY realization.realization_period DESC,transfer.transferred_at DESC`,
      [actor.id],
    );
    return { rows: result.rows };
  }

  /** Read-only Owner Portal projection for live progress or a published snapshot. */
  async portalProgress(actor: UserAccessContext, periodInput: string) {
    const period = this.period(periodInput);
    const ownerResult = await this.database.client.query<Realization>(
      `SELECT profile.id AS owner_profile_id,profile.property_id,profile.full_name,
              profile.payout_bank_name,profile.payout_account_number,profile.payout_account_holder
         FROM property_owner_profiles profile
        WHERE profile.user_id=$1 AND profile.profile_status='active'
        ORDER BY profile.created_at,profile.id LIMIT 1`,
      [actor.id],
    );
    const owner = ownerResult.rows[0];
    if (!owner) {
      return {
        period: period.value,
        state: 'empty',
        realization: null,
        payout_destination: null,
        summary: {
          room_count: '0',
          eligible_contract_total: '0',
          management_fee_total: '0',
          realization_total: '0',
          transferred_total: '0',
        },
        lines: [],
        transfers: [],
      };
    }
    const realizationResult = await this.database.client.query<Realization>(
      `SELECT realization.*,realization.realization_period::text AS realization_period,
              profile.full_name,profile.phone,profile.email,
              profile.payout_bank_name,profile.payout_account_number,profile.payout_account_holder
         FROM property_owner_realizations realization
         JOIN property_owner_profiles profile ON profile.id=realization.owner_profile_id
        WHERE realization.owner_profile_id=$1 AND realization.property_id=$2
          AND realization.realization_period=$3::date
          AND realization.realization_status<>'void'
        ORDER BY realization.updated_at DESC,realization.id DESC LIMIT 1`,
      [owner.owner_profile_id, owner.property_id, period.start],
    );
    const realization = realizationResult.rows[0] ?? null;
    const destination = {
      bank_name: realization?.payout_bank_name ?? owner.payout_bank_name ?? null,
      account_holder: realization?.payout_account_holder ?? owner.payout_account_holder ?? null,
      account_number_masked: this.maskAccountNumber(
        realization?.payout_account_number ?? owner.payout_account_number,
      ),
    };
    let lines: Array<Record<string, unknown>>;
    if (realization) {
      const lineResult = await this.database.client.query(
        `SELECT id,room_code_snapshot,building_name_snapshot,resident_name_snapshot,
                plot_number_snapshot,duration_months,payment_completed_at::text,
                contract_total_amount::text,management_fee_amount::text,
                net_realization_amount::text
           FROM property_owner_realization_lines
          WHERE realization_id=$1 AND property_id=$2
          ORDER BY room_code_snapshot,resident_name_snapshot,id`,
        [realization.id, owner.property_id],
      );
      lines = await this.withRoomIdentifiers(lineResult.rows, owner.property_id);
    } else {
      const candidates = await this.eligibleCandidates(
        this.database.client,
        owner.property_id,
        period.until,
        owner.owner_profile_id,
      );
      lines = await this.withRoomIdentifiers(
        candidates.map((candidate) => ({
          id: null,
          room_code_snapshot: candidate.room_code,
          building_name_snapshot: candidate.building_name,
          resident_name_snapshot: candidate.resident_name,
          plot_number_snapshot: candidate.plot_number,
          duration_months: candidate.term_months,
          payment_completed_at: candidate.payment_completed_at,
          contract_total_amount: candidate.contract_total_amount,
          management_fee_amount: candidate.management_fee_amount,
          net_realization_amount: candidate.net_realization_amount,
        })),
        owner.property_id,
      );
    }
    const transferResult =
      realization && realization.realization_status === 'published_to_owner'
        ? await this.database.client.query(
            `SELECT id,transfer_amount::text,transfer_method,transfer_reference,
                  transferred_at::text,receipt_number,transfer_evidence_reference
             FROM property_owner_realization_transfers
            WHERE realization_id=$1 AND transfer_status='succeeded'
            ORDER BY transferred_at,id`,
            [realization.id],
          )
        : { rows: [] as Array<Record<string, unknown>> };
    const evidenceResult = transferResult.rows.length
      ? await this.database.client.query<{
          transfer_id: string;
          id: string;
          original_filename: string;
          mime_type: string;
        }>(
          `SELECT evidence.entity_id AS transfer_id,file.id,file.original_filename,file.mime_type
             FROM property_owner_realization_evidence_files evidence
             JOIN files file ON file.id=evidence.file_id
              AND file.is_deleted=false
              AND file.file_purpose='owner_realization_evidence'
            WHERE evidence.realization_id=$1
              AND evidence.property_id=$2
              AND evidence.entity_kind='transfer'
              AND evidence.entity_id=ANY($3::uuid[])
            ORDER BY evidence.created_at,evidence.id`,
          [realization.id, owner.property_id, transferResult.rows.map((row) => row.id)],
        )
      : {
          rows: [] as Array<{
            transfer_id: string;
            id: string;
            original_filename: string;
            mime_type: string;
          }>,
        };
    const evidenceByTransfer = new Map<
      string,
      Array<{
        id: string;
        original_filename: string;
        mime_type: string;
      }>
    >();
    for (const evidence of evidenceResult.rows) {
      const files = evidenceByTransfer.get(evidence.transfer_id) ?? [];
      files.push({
        id: evidence.id,
        original_filename: evidence.original_filename,
        mime_type: evidence.mime_type,
      });
      evidenceByTransfer.set(evidence.transfer_id, files);
    }
    const transferredTotal =
      realization?.realization_status === 'published_to_owner'
        ? transferResult.rows.reduce((sum, row) => sum + Number(row.transfer_amount ?? 0), 0)
        : 0;
    const totals = lines.reduce<{
      room_count: number;
      eligible_contract_total: number;
      management_fee_total: number;
      realization_total: number;
    }>(
      (sum, line) => ({
        room_count: sum.room_count + 1,
        eligible_contract_total:
          sum.eligible_contract_total + Number(line.contract_total_amount ?? 0),
        management_fee_total: sum.management_fee_total + Number(line.management_fee_amount ?? 0),
        realization_total: sum.realization_total + Number(line.net_realization_amount ?? 0),
      }),
      { room_count: 0, eligible_contract_total: 0, management_fee_total: 0, realization_total: 0 },
    );
    return {
      period: period.value,
      state: realization?.realization_status === 'published_to_owner' ? 'published' : 'progress',
      owner_name: owner.full_name,
      realization: realization
        ? {
            id: realization.id,
            reference: realization.realization_reference,
            status: realization.realization_status,
            published_at: realization.published_at,
            prepared_at: realization.prepared_at,
          }
        : null,
      payout_destination: destination,
      summary: {
        room_count: String(totals.room_count),
        eligible_contract_total: String(totals.eligible_contract_total),
        management_fee_total: String(totals.management_fee_total),
        realization_total: String(totals.realization_total),
        transferred_total: String(transferredTotal),
      },
      lines,
      transfers: transferResult.rows.map((row) => ({
        id: row.id,
        amount: row.transfer_amount,
        method: row.transfer_method,
        reference: row.transfer_reference,
        transferred_at: row.transferred_at,
        receipt_number: row.receipt_number,
        has_evidence:
          Boolean(row.transfer_evidence_reference) ||
          (evidenceByTransfer.get(String(row.id))?.length ?? 0) > 0,
        evidence_files: evidenceByTransfer.get(String(row.id)) ?? [],
      })),
    };
  }

  async portalProgressExport(actor: UserAccessContext, periodInput: string, format: string) {
    if (!['pdf', 'xlsx'].includes(format)) {
      throw new BadRequestException({
        code: 'OWNER_REALIZATION_EXPORT_FORMAT_INVALID',
        message: 'Format dokumen Realisasi Owner tidak didukung.',
      });
    }
    const period = this.period(periodInput);
    const ownerResult = await this.database.client.query<{
      property_id: string;
      property_name: string;
    }>(
      `SELECT profile.property_id,properties.name AS property_name
         FROM property_owner_profiles profile
         JOIN properties ON properties.id=profile.property_id
        WHERE profile.user_id=$1 AND profile.profile_status='active'
        ORDER BY profile.created_at,profile.id LIMIT 1`,
      [actor.id],
    );
    if (!ownerResult.rows[0]) {
      throw new ForbiddenException({
        code: 'OWNER_REALIZATION_DOCUMENT_SCOPE_DENIED',
        message: 'Dokumen Realisasi belum tersedia untuk akun Owner Anda.',
      });
    }
    const progress = await this.portalProgress(actor, period.value);
    if (progress.realization?.id) {
      return this.ownerExport(actor, progress.realization.id, format);
    }
    const rows = progress.lines.map((line) => ({
      room: textValue(line.plot_number_snapshot || line.room_code_snapshot),
      resident: textValue(line.resident_name_snapshot, '—'),
      owner: textValue(progress.owner_name, '—'),
      plot_number: textValue(line.plot_number_snapshot, '—'),
      duration_months: numberValue(line.duration_months),
      rate_type: '—',
      money_received: numberValue(line.contract_total_amount),
      contract_total: numberValue(line.contract_total_amount),
      outstanding: 0,
      management_fee: numberValue(line.management_fee_amount),
      net_realization: numberValue(line.net_realization_amount),
      paid_in_full_at: textValue(line.payment_completed_at),
      realization_status: 'Progres sementara',
      line_status: 'eligible',
      check_in: '',
      check_out: '',
    }));
    const report: ReportResult = {
      report_type: 'property-owners',
      title: `Realisasi Owner ${textValue(progress.owner_name, 'Owner')}`,
      property_name: ownerResult.rows[0].property_name,
      period: { date_from: period.start, date_to: periodEndDate(period.value) },
      generated_at: new Date().toISOString(),
      filter_checksum: createHash('sha256')
        .update(JSON.stringify({ owner: progress.owner_name, period: period.value, rows }))
        .digest('hex'),
      methodology:
        'Progres sementara dihitung dari kontrak yang sudah lunas pada periode ini. Nominal transfer tetap Rp 0 sampai Admin menerbitkan dan mencatat transfer berhasil.',
      filter_summary: [
        ['Status dokumen', 'Progres sementara'],
        ['Periode', formatOwnerMonthYear(period.start)],
      ],
      summary: {
        total_contract_rent: Number(progress.summary.eligible_contract_total),
        management_fee: Number(progress.summary.management_fee_total),
        corrections: 0,
        net_realization: Number(progress.summary.realization_total),
        transferred: 0,
      },
      meta: { limit: rows.length, offset: 0, total: rows.length },
      rows: [
        ...rows,
        {
          room: 'TOTAL',
          resident: '',
          owner: '',
          plot_number: '',
          duration_months: '',
          rate_type: '',
          money_received: Number(progress.summary.eligible_contract_total),
          contract_total: Number(progress.summary.eligible_contract_total),
          outstanding: 0,
          management_fee: Number(progress.summary.management_fee_total),
          net_realization: Number(progress.summary.realization_total),
          paid_in_full_at: '',
          realization_status: '',
          line_status: 'total',
          check_in: '',
          check_out: '',
        },
      ],
      additional_sheets: [
        {
          name: 'Transfer',
          rows: [['Tanggal', 'Nominal', 'Metode', 'Referensi', 'Status']],
        },
      ],
    };
    const content = format === 'pdf' ? await reportToPdf(report) : await reportToXlsx(report);
    return {
      content,
      contentType:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `realisasi-owner-progres-${period.value}.${format}`,
    };
  }

  currentPeriod() {
    return this.currentJakartaPeriod();
  }

  async ownerReceipt(actor: UserAccessContext, realizationId: string, transferId: string) {
    const permitted = await this.database.client.query<{ property_id: string }>(
      `SELECT realization.property_id FROM property_owner_profiles owner
        JOIN property_owner_realizations realization ON realization.owner_profile_id=owner.id
        JOIN property_owner_realization_transfers transfer ON transfer.id=$3 AND transfer.realization_id=realization.id
       WHERE owner.user_id=$1 AND realization.id=$2 AND realization.realization_status='published_to_owner'`,
      [actor.id, realizationId, transferId],
    );
    if (!permitted.rows[0])
      throw new ForbiddenException({
        code: 'OWNER_REALIZATION_DOCUMENT_SCOPE_DENIED',
        message: 'Dokumen Realisasi ini tidak tersedia untuk akun Owner Anda.',
      });
    const document = await this.receiptDocument(
      this.database.client,
      realizationId,
      transferId,
      permitted.rows[0].property_id,
    );
    const file = await this.pdfReceipt(document);
    await this.audit.write({
      actorUserId: actor.id,
      propertyId: permitted.rows[0].property_id,
      action: 'property_owner.realization.owner_receipt_downloaded',
      resourceType: 'property_owner_realization_transfer',
      resourceId: transferId,
      afterData: { realization_id: realizationId },
      resultStatus: 'success',
    });
    return file;
  }

  async ownerExport(actor: UserAccessContext, realizationId: string, format: string) {
    const permitted = await this.database.client.query<{ property_id: string }>(
      `SELECT realization.property_id
         FROM property_owner_profiles owner
         JOIN property_owner_realizations realization ON realization.owner_profile_id=owner.id
        WHERE owner.user_id=$1
          AND realization.id=$2
          AND realization.realization_status<>'void'`,
      [actor.id, realizationId],
    );
    if (!permitted.rows[0]) {
      throw new ForbiddenException({
        code: 'OWNER_REALIZATION_DOCUMENT_SCOPE_DENIED',
        message: 'Dokumen Realisasi ini tidak tersedia untuk akun Owner Anda.',
      });
    }
    return this.export(actor, realizationId, permitted.rows[0].property_id, format);
  }

  async ownerEvidence(
    actor: UserAccessContext,
    realizationId: string,
    transferId: string,
    fileId: string,
  ) {
    const permitted = await this.database.client.query<{ property_id: string }>(
      `SELECT realization.property_id
         FROM property_owner_profiles owner
         JOIN property_owner_realizations realization
           ON realization.owner_profile_id=owner.id
         JOIN property_owner_realization_transfers transfer
           ON transfer.id=$3 AND transfer.realization_id=realization.id
          AND transfer.transfer_status='succeeded'
         JOIN property_owner_realization_evidence_files evidence
           ON evidence.realization_id=realization.id
          AND evidence.property_id=realization.property_id
          AND evidence.entity_kind='transfer'
          AND evidence.entity_id=transfer.id
          AND evidence.file_id=$4
         JOIN files file
           ON file.id=evidence.file_id
          AND file.file_purpose='owner_realization_evidence'
          AND file.is_deleted=false
        WHERE owner.user_id=$1
          AND realization.id=$2
          AND realization.realization_status='published_to_owner'`,
      [actor.id, realizationId, transferId, fileId],
    );
    if (!permitted.rows[0]) {
      throw new ForbiddenException({
        code: 'OWNER_REALIZATION_EVIDENCE_SCOPE_DENIED',
        message: 'Bukti transfer ini tidak tersedia untuk akun Owner Anda.',
      });
    }
    const record = await this.files.findById(fileId);
    if (!record || record.isDeleted || record.filePurpose !== 'owner_realization_evidence') {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: 'Bukti transfer tidak ditemukan.',
      });
    }
    const { buffer } = await this.fileService.readStoredContent(record);
    await this.audit.write({
      actorUserId: actor.id,
      propertyId: permitted.rows[0].property_id,
      action: 'property_owner.realization.evidence_viewed',
      resourceType: 'property_owner_realization_transfer_evidence',
      resourceId: fileId,
      afterData: { realization_id: realizationId, transfer_id: transferId },
      resultStatus: 'success',
    });
    return {
      content: buffer,
      contentType: record.mimeType,
      filename: record.sanitizedFilename.replace(/["\\\r\n]/g, '_'),
    };
  }

  private async transition(
    actor: UserAccessContext,
    realizationId: string,
    dto: ChangeOwnerRealizationStatusDto,
    key: string | undefined,
    context: RequestAuditContext,
    expected: RealizationStatus,
    next: RealizationStatus,
    action: string,
  ) {
    return this.command(
      actor,
      dto.property_id,
      `/admin/property-owner-realizations/:id/${action}`,
      key,
      dto,
      context,
      async (client) => {
        const realization = await this.lockRealization(client, realizationId, dto.property_id);
        if (realization.realization_status !== expected)
          this.invalidTransition(realization.realization_status, next);
        const timestampColumn: Record<RealizationStatus, string | undefined> = {
          draft: undefined,
          awaiting_review: 'submitted_for_review_at',
          approved: 'approved_at',
          submitted_to_finance: 'submitted_to_finance_at',
          awaiting_transfer: 'awaiting_transfer_at',
          partially_realized: undefined,
          realized: 'realized_at',
          published_to_owner: 'published_at',
          void: 'voided_at',
        };
        const column = timestampColumn[next];
        await client.query(
          `UPDATE property_owner_realizations
            SET realization_status=$2,
                ${column ? `${column}=now(),` : ''}
                approved_by_user_id=CASE WHEN $2='approved' THEN $3 ELSE approved_by_user_id END,
                updated_at=now()
          WHERE id=$1`,
          [realizationId, next, actor.id],
        );
        const response = { realization_id: realizationId, status: next, note: dto.note };
        await this.audit.write(
          {
            actorUserId: actor.id,
            propertyId: dto.property_id,
            action: `property_owner.realization.${action}`,
            resourceType: 'property_owner_realization',
            resourceId: realizationId,
            afterData: response,
            resultStatus: 'success',
            ...context,
          },
          client,
        );
        return response;
      },
    );
  }

  private async eligibleCandidates(
    client: SqlClient,
    propertyId: string,
    until: string | null,
    ownerId?: string,
  ) {
    const result = await client.query<Candidate>(
      `WITH rent_ledger AS (
         SELECT invoice.lease_id,
                COALESCE(sum(invoice.credit_amount + allocation.net_amount),0)::bigint AS verified_rent_credit,
                max(payment_dates.latest_paid_at) AS paid_in_full_at
           FROM invoices invoice
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(allocation.allocated_amount - COALESCE(reversal.reversed_amount,0)),0)::bigint AS net_amount
               FROM payment_allocations allocation
               JOIN payments allocation_payment ON allocation_payment.id=allocation.payment_id AND allocation_payment.payment_status='verified'
               LEFT JOIN LATERAL (
                 SELECT COALESCE(sum(reverse_allocation.reversed_amount),0)::bigint AS reversed_amount
                   FROM payment_reversal_allocations reverse_allocation
                  WHERE reverse_allocation.original_allocation_id=allocation.id
               ) reversal ON true
              WHERE allocation.invoice_id=invoice.id AND allocation.allocation_status='active'
           ) allocation ON true
           LEFT JOIN LATERAL (
             SELECT max(COALESCE(payment.paid_at,payment.verified_at)) AS latest_paid_at
               FROM payment_allocations payment_allocation
               JOIN payments payment ON payment.id=payment_allocation.payment_id
                 AND payment.payment_status='verified'
              WHERE payment_allocation.invoice_id=invoice.id
                AND payment_allocation.allocation_status='active'
           ) payment_dates ON true
          WHERE invoice.property_id=$1 AND invoice.invoice_purpose='rent'
            AND invoice.authority_source='contract_schedule' AND invoice.invoice_status<>'void'
          GROUP BY invoice.lease_id
       ), scoped AS (
         SELECT lease.id AS lease_id,lease.room_id,lease.resident_id,lease.term_months,lease.pricing_source,
                lease.snapshot_pricing_tier,lease.snapshot_monthly_price,lease.snapshot_reference_monthly_price,
                lease.contract_rent_amount,lease.start_date,lease.end_date,lease.activated_at,
                 COALESCE(room.building_id,room.id)::text AS asset_id,
                 COALESCE(building.building_code,room.room_code) AS building_code,
                 room.room_code,room.plot_number,COALESCE(building.building_name,room.room_code) AS building_name,
                 resident.full_name AS resident_name,
                ledger.verified_rent_credit,ledger.paid_in_full_at,
                assignment.owner_profile_id,assignment.ownership_kind,
                owner.full_name AS owner_name,
                COALESCE(fee.monthly_fee_amount,0)::bigint AS monthly_management_fee,
                COALESCE(fee.monthly_fee_amount,0)::bigint * COALESCE(lease.term_months,0) AS management_fee_amount,
                fee.effective_date AS fee_effective_date
           FROM leases lease
           JOIN rooms room ON room.id=lease.room_id AND room.property_id=lease.property_id
           LEFT JOIN room_buildings building ON building.id=room.building_id
           JOIN residents resident ON resident.id=lease.resident_id
           JOIN rent_ledger ledger ON ledger.lease_id=lease.id
           JOIN LATERAL (
             SELECT choice.owner_profile_id,choice.ownership_kind
               FROM (
                 SELECT room_assignment.owner_profile_id,'room'::text AS ownership_kind,0 AS priority
                   FROM room_owner_assignments room_assignment
                  WHERE room_assignment.room_id=lease.room_id AND room_assignment.property_id=lease.property_id
                    AND room_assignment.assignment_status='active'
                 UNION ALL
                 SELECT building_assignment.owner_profile_id,'building'::text,1
                   FROM building_owner_assignments building_assignment
                  WHERE building_assignment.building_id=room.building_id AND building_assignment.property_id=lease.property_id
                    AND building_assignment.assignment_status='active'
               ) choice ORDER BY choice.priority LIMIT 1
           ) assignment ON true
           JOIN property_owner_profiles owner ON owner.id=assignment.owner_profile_id AND owner.profile_status='active'
           LEFT JOIN LATERAL (
             SELECT version.monthly_fee_amount,version.effective_date
               FROM property_management_fee_versions version
              WHERE version.property_id=lease.property_id AND version.effective_date<=lease.start_date
              ORDER BY version.effective_date DESC LIMIT 1
           ) fee ON true
          WHERE lease.property_id=$1 AND lease.commercial_mode='rent'
            AND lease.contract_rent_amount>0 AND ledger.verified_rent_credit>=lease.contract_rent_amount
            AND ledger.paid_in_full_at IS NOT NULL
            AND ($2::date IS NULL OR ledger.paid_in_full_at::date < $2::date)
       )
        SELECT scoped.lease_id,scoped.room_id,scoped.resident_id,scoped.owner_profile_id,
                scoped.asset_id,scoped.building_code,scoped.room_code,scoped.plot_number,
              scoped.building_name,scoped.resident_name,scoped.owner_name,COALESCE(scoped.term_months,0)::int AS term_months,
              scoped.pricing_source,scoped.snapshot_pricing_tier AS pricing_tier,
              scoped.snapshot_monthly_price::text AS monthly_price,
              scoped.snapshot_reference_monthly_price::text AS reference_monthly_price,
              scoped.monthly_management_fee::text AS monthly_management_fee,
              scoped.paid_in_full_at::text AS payment_completed_at,
              scoped.activated_at::text AS check_in_at,scoped.end_date::text AS check_out_at,
              scoped.verified_rent_credit::text AS money_received_amount,scoped.contract_rent_amount::text AS contract_total_amount,
              GREATEST(scoped.contract_rent_amount-scoped.verified_rent_credit,0)::text AS outstanding_amount,
              scoped.management_fee_amount::text, (scoped.contract_rent_amount-scoped.management_fee_amount)::text AS net_realization_amount,
              scoped.fee_effective_date::text,scoped.ownership_kind
         FROM scoped
         LEFT JOIN property_owner_realization_lease_locks lock ON lock.lease_id=scoped.lease_id AND lock.lock_status='locked'
        WHERE lock.id IS NULL AND ($3::uuid IS NULL OR scoped.owner_profile_id=$3)
        ORDER BY scoped.paid_in_full_at,scoped.room_code`,
      [propertyId, until, ownerId ?? null],
    );
    return result.rows;
  }

  private async notEligibleRows(propertyId: string, periodStart: string, ownerId?: string) {
    const period = this.period(periodStart.slice(0, 7));
    const rows = await this.database.client.query<NotEligibleRow>(
      `SELECT lease.id AS lease_id,room.room_code,room.plot_number,resident.full_name AS resident_name,lease.contract_rent_amount::text,
              COALESCE(owner.full_name,'—') AS owner_name,
              owner.profile_status AS owner_profile_status,
              CASE
                WHEN assignment.owner_profile_id IS NULL THEN 'OWNER_ASSIGNMENT_UNAVAILABLE'
                WHEN lease.commercial_mode='owner_sponsored' THEN 'OWNER_SPONSORED_EXCLUDED'
                WHEN COALESCE(ledger.verified_rent_credit,0)<COALESCE(lease.contract_rent_amount,0) THEN 'OUTSTANDING_CONTRACT_RENT'
                WHEN lock.id IS NOT NULL THEN 'ALREADY_ALLOCATED_TO_REALIZATION'
                ELSE 'PAYMENT_COMPLETED_AFTER_RELEASE_PERIOD'
              END AS reason_code
         FROM leases lease
         JOIN rooms room ON room.id=lease.room_id
         JOIN residents resident ON resident.id=lease.resident_id
         LEFT JOIN LATERAL (
           SELECT COALESCE(sum(invoice.credit_amount + allocation.net_amount),0)::bigint AS verified_rent_credit,
                  max(payment_dates.latest_paid_at) AS paid_in_full_at
             FROM invoices invoice
             LEFT JOIN LATERAL (
               SELECT COALESCE(sum(a.allocated_amount),0)::bigint AS net_amount
                 FROM payment_allocations a JOIN payments p ON p.id=a.payment_id AND p.payment_status='verified'
                WHERE a.invoice_id=invoice.id AND a.allocation_status='active'
             ) allocation ON true
             LEFT JOIN LATERAL (
               SELECT max(COALESCE(payment.paid_at,payment.verified_at)) AS latest_paid_at
                 FROM payment_allocations payment_allocation
                 JOIN payments payment ON payment.id=payment_allocation.payment_id
                   AND payment.payment_status='verified'
                WHERE payment_allocation.invoice_id=invoice.id
                  AND payment_allocation.allocation_status='active'
             ) payment_dates ON true
             WHERE invoice.lease_id=lease.id AND invoice.invoice_purpose='rent'
               AND invoice.authority_source='contract_schedule' AND invoice.invoice_status<>'void'
          ) ledger ON true
          LEFT JOIN LATERAL (
            SELECT choice.owner_profile_id
              FROM (
                SELECT room_assignment.owner_profile_id,0 AS priority,room_assignment.effective_from
                  FROM room_owner_assignments room_assignment
                 WHERE room_assignment.room_id=lease.room_id AND room_assignment.property_id=lease.property_id
                   AND room_assignment.assignment_status='active'
                UNION ALL
                SELECT building_assignment.owner_profile_id,1 AS priority,building_assignment.effective_from
                  FROM building_owner_assignments building_assignment
                 WHERE building_assignment.building_id=room.building_id AND building_assignment.property_id=lease.property_id
                   AND building_assignment.assignment_status='active'
              ) choice
             ORDER BY choice.priority,choice.effective_from DESC LIMIT 1
          ) assignment ON true
          LEFT JOIN property_owner_profiles owner ON owner.id=assignment.owner_profile_id
          LEFT JOIN property_owner_realization_lease_locks lock ON lock.lease_id=lease.id AND lock.lock_status='locked'
          WHERE lease.property_id=$1 AND lease.contract_rent_amount IS NOT NULL
           AND ($3::uuid IS NULL OR assignment.owner_profile_id=$3::uuid)
           AND (assignment.owner_profile_id IS NULL OR lease.commercial_mode='owner_sponsored' OR COALESCE(ledger.verified_rent_credit,0)<lease.contract_rent_amount
             OR lock.id IS NOT NULL
             OR (ledger.paid_in_full_at IS NOT NULL AND ledger.paid_in_full_at::date >= $2::date))
        ORDER BY room.room_code,resident.full_name`,
      [propertyId, period.until, ownerId ?? null],
    );
    return rows.rows;
  }

  private async realization(client: SqlClient, realizationId: string, propertyId: string) {
    const result = await client.query<Realization>(
      `SELECT realization.*,realization.realization_period::text AS realization_period,
              profile.full_name,profile.phone,profile.email,profile.payout_bank_name,
              profile.payout_account_number,profile.payout_account_holder
         FROM property_owner_realizations realization
         JOIN property_owner_profiles profile ON profile.id=realization.owner_profile_id
        WHERE realization.id=$1 AND realization.property_id=$2`,
      [realizationId, propertyId],
    );
    if (!result.rows[0])
      throw new NotFoundException({
        code: 'OWNER_REALIZATION_NOT_FOUND',
        message: 'Realisasi Owner tidak ditemukan.',
      });
    return result.rows[0];
  }

  private async lockRealization(client: PoolClient, realizationId: string, propertyId: string) {
    const result = await client.query<Realization>(
      `SELECT realization.*,realization.realization_period::text AS realization_period,
              profile.full_name,profile.phone,profile.email,profile.payout_bank_name,
              profile.payout_account_number,profile.payout_account_holder
         FROM property_owner_realizations realization
         JOIN property_owner_profiles profile ON profile.id=realization.owner_profile_id
        WHERE realization.id=$1 AND realization.property_id=$2 FOR UPDATE OF realization`,
      [realizationId, propertyId],
    );
    if (!result.rows[0])
      throw new NotFoundException({
        code: 'OWNER_REALIZATION_NOT_FOUND',
        message: 'Realisasi Owner tidak ditemukan.',
      });
    return result.rows[0];
  }

  private async lockOwner(
    client: PoolClient,
    ownerId: string,
    propertyId: string,
    options: { allowArchived?: boolean } = {},
  ) {
    const owner = await client.query(
      `SELECT id FROM property_owner_profiles
        WHERE id=$1 AND property_id=$2
          AND ($3::boolean OR profile_status='active')
        FOR UPDATE`,
      [ownerId, propertyId, options.allowArchived ?? false],
    );
    if (!owner.rows[0])
      throw new NotFoundException({
        code: 'PROPERTY_OWNER_NOT_FOUND',
        message: 'Owner Property tidak ditemukan.',
      });
  }

  private async recalculate(client: PoolClient, realizationId: string, persist = true) {
    const result = await client.query<{
      correction_total: string;
      contract_total: string;
      fee_total: string;
    }>(
      `SELECT COALESCE(sum(correction.amount),0)::text AS correction_total,
              realization.eligible_contract_total::text AS contract_total,realization.management_fee_total::text AS fee_total
         FROM property_owner_realizations realization
         LEFT JOIN property_owner_realization_corrections correction
           ON correction.realization_id=realization.id AND correction.correction_status='approved'
          AND correction.correction_kind<>'transfer_recovery'
        WHERE realization.id=$1 GROUP BY realization.id`,
      [realizationId],
    );
    const totals = result.rows[0];
    const realizationTotal =
      Number(totals.contract_total) - Number(totals.fee_total) + Number(totals.correction_total);
    if (realizationTotal < 0)
      throw new ConflictException({
        code: 'OWNER_REALIZATION_NEGATIVE_TOTAL',
        message: 'Penyesuaian menghasilkan Realisasi Owner negatif.',
      });
    if (persist) {
      await client.query(
        `UPDATE property_owner_realizations SET correction_total=$2,realization_total=$3,updated_at=now() WHERE id=$1`,
        [realizationId, Number(totals.correction_total), realizationTotal],
      );
    }
    return {
      eligible_contract_total: Number(totals.contract_total),
      management_fee_total: Number(totals.fee_total),
      correction_total: Number(totals.correction_total),
      realization_total: realizationTotal,
    };
  }

  private async receiptSnapshot(
    client: SqlClient,
    realizationId: string,
    transferId: string,
    receiptNumber: string,
  ) {
    const realization = await this.realizationById(client, realizationId);
    const transfer = await client.query(
      `SELECT transfer_amount::text,transfer_method,transfer_reference,transfer_evidence_reference,destination_snapshot,
              transferred_at::text FROM property_owner_realization_transfers WHERE id=$1 AND realization_id=$2`,
      [transferId, realizationId],
    );
    const lines = await client.query(
      `SELECT room_code_snapshot,resident_name_snapshot,plot_number_snapshot,contract_total_amount::text,management_fee_amount::text,
              net_realization_amount::text FROM property_owner_realization_lines WHERE realization_id=$1 ORDER BY room_code_snapshot`,
      [realizationId],
    );
    const issuer = await client.query<{ display_name: string | null }>(
      `SELECT display_name FROM users WHERE id=(SELECT recorded_by_user_id FROM property_owner_realization_transfers WHERE id=$1)`,
      [transferId],
    );
    return {
      receipt_number: receiptNumber,
      realization: this.detailSummary(realization),
      transfer: transfer.rows[0],
      lines: lines.rows,
      issuer_name: issuer.rows[0]?.display_name ?? null,
      issued_at: new Date().toISOString(),
    };
  }

  private async attachEvidence(
    client: SqlClient,
    propertyId: string,
    realizationId: string,
    kind: 'transfer' | 'correction' | 'recovery_event',
    entityId: string,
    fileIds: string[] = [],
  ) {
    if (!fileIds.length) return;
    if (fileIds.length > 3 || new Set(fileIds).size !== fileIds.length)
      throw new BadRequestException({
        code: 'OWNER_REALIZATION_EVIDENCE_LIMIT',
        message: 'Maksimal tiga berkas bukti berbeda per tindakan.',
      });
    const files = await client.query<{ id: string }>(
      `SELECT id FROM files WHERE id=ANY($1::uuid[]) AND property_id=$2
         AND file_purpose='owner_realization_evidence' AND is_deleted=false FOR UPDATE`,
      [fileIds, propertyId],
    );
    if (files.rows.length !== fileIds.length)
      throw new BadRequestException({
        code: 'OWNER_REALIZATION_EVIDENCE_INVALID',
        message: 'Berkas bukti tidak ditemukan atau bukan milik properti ini.',
      });
    const linked = await client.query<{ file_id: string }>(
      `SELECT file_id FROM property_owner_realization_evidence_files WHERE file_id=ANY($1::uuid[]) LIMIT 1`,
      [fileIds],
    );
    if (linked.rows[0])
      throw new ConflictException({
        code: 'OWNER_REALIZATION_EVIDENCE_ALREADY_USED',
        message: 'Salah satu berkas bukti sudah terhubung ke tindakan Realisasi lain.',
      });
    for (const fileId of fileIds) {
      await client.query(
        `INSERT INTO property_owner_realization_evidence_files(property_id,realization_id,entity_kind,entity_id,file_id)
         VALUES($1,$2,$3,$4,$5)`,
        [propertyId, realizationId, kind, entityId, fileId],
      );
    }
  }

  private assertTransferEvidence(
    transferredAt: string,
    fileIds: string[] | undefined,
    legacyReason: string | undefined,
    legacySource: string | undefined,
    reference: string,
  ) {
    if (
      !transferEvidenceIsValid({
        transferredAt,
        fileIds,
        legacyReason,
        legacySource,
        reference,
        rolloutAt: process.env.OWNER_REALIZATION_EVIDENCE_ROLLOUT_AT,
      })
    ) {
      throw new BadRequestException({
        code: 'OWNER_REALIZATION_TRANSFER_PROOF_REQUIRED',
        message:
          'Unggah bukti transfer. Untuk transaksi sebelum penerapan fitur bukti, isi alasan dan sumber data historis yang dapat ditelusuri.',
      });
    }
  }

  private async receiptDocument(
    client: SqlClient,
    realizationId: string,
    transferId: string,
    propertyId: string,
  ) {
    const document = await client.query<{
      document_snapshot: Record<string, unknown>;
      issuer_name: string | null;
    }>(
      `SELECT document.document_snapshot,legacy_issuer.issuer_name
         FROM property_owner_realization_documents document
         LEFT JOIN property_owner_realization_legacy_issuer_labels legacy_issuer ON legacy_issuer.document_id=document.id
        WHERE document.realization_id=$1 AND document.transfer_id=$2 AND document.property_id=$3 AND document.document_kind='payout_receipt'`,
      [realizationId, transferId, propertyId],
    );
    if (!document.rows[0])
      throw new NotFoundException({
        code: 'OWNER_REALIZATION_RECEIPT_NOT_FOUND',
        message: 'Kuitansi Realisasi belum tersedia.',
      });
    const snapshot = document.rows[0].document_snapshot;
    // A receipt's period is the realization period, never the date the bank
    // processed the transfer. Older snapshots may have been issued with a
    // transfer-month label; normalize only the rendered copy so the immutable
    // document remains auditable while new downloads are unambiguous.
    const canonical = await client.query<{ period: string }>(
      `SELECT realization_period::text AS period
         FROM property_owner_realizations
        WHERE id=$1 AND property_id=$2`,
      [realizationId, propertyId],
    );
    const canonicalPeriod = canonical.rows[0]?.period;
    const normalizedSnapshot =
      canonicalPeriod && snapshot.realization && typeof snapshot.realization === 'object'
        ? {
            ...snapshot,
            realization: {
              ...(snapshot.realization as Record<string, unknown>),
              period: canonicalPeriod,
            },
          }
        : snapshot;
    // The one-time legacy label is immutable; neither it nor the issued receipt
    // snapshot changes if the Admin later edits their profile name.
    return normalizedSnapshot.issuer_name
      ? { ...normalizedSnapshot, property_id: propertyId }
      : {
          ...normalizedSnapshot,
          property_id: propertyId,
          issuer_name: document.rows[0].issuer_name ?? null,
        };
  }

  private async realizationById(client: SqlClient, realizationId: string) {
    const result = await client.query<Realization>(
      `SELECT realization.*,profile.full_name,profile.phone,profile.email,profile.payout_bank_name,
              profile.payout_account_number,profile.payout_account_holder
         FROM property_owner_realizations realization
         JOIN property_owner_profiles profile ON profile.id=realization.owner_profile_id WHERE realization.id=$1`,
      [realizationId],
    );
    if (!result.rows[0])
      throw new NotFoundException({
        code: 'OWNER_REALIZATION_NOT_FOUND',
        message: 'Realisasi Owner tidak ditemukan.',
      });
    return result.rows[0];
  }

  private async exportFromDetail(
    detail: Awaited<ReturnType<PropertyOwnerRealizationService['detail']>>,
    format: string,
    filenameBase: string,
  ) {
    const report: ReportResult = {
      report_type: 'property-owners',
      title: `Realisasi Owner ${detail.realization.owner_name}`,
      property_name: textValue(detail.realization.scope_snapshot.property_name, 'KOSTATION'),
      period: {
        date_from: detail.realization.period,
        date_to: periodEndDate(detail.realization.period),
      },
      generated_at: new Date().toISOString(),
      filter_checksum: createHash('sha256')
        .update(JSON.stringify(detail.realization))
        .digest('hex'),
      methodology:
        'Only verified, fully paid rent contracts; security deposits and owner-sponsored occupancy are excluded.',
      filter_summary: [
        ['Referensi realisasi', detail.realization.reference],
        ['Status', detail.realization.status],
        [
          'Sumber data',
          detail.realization.entry_kind === 'system' ? 'Data sistem' : 'Input historis manual',
        ],
      ],
      summary: {
        total_contract_rent: Number(detail.realization.eligible_contract_total),
        management_fee: Number(detail.realization.management_fee_total),
        corrections: Number(detail.realization.correction_total),
        net_realization: Number(detail.realization.realization_total),
        transferred: Number(detail.realization.transferred_total),
      },
      rows: [
        ...detail.lines.map((line: Record<string, unknown>) => ({
          room: textValue(line.plot_number_snapshot || line.room_code_snapshot),
          resident: textValue(line.resident_name_snapshot),
          owner: textValue(line.owner_name_snapshot),
          plot_number: textValue(line.plot_number_snapshot),
          duration_months: numberValue(line.duration_months),
          rate_type: textValue(line.pricing_source_snapshot),
          money_received: numberValue(line.money_received_amount),
          contract_total: numberValue(line.contract_total_amount),
          outstanding: numberValue(line.outstanding_amount),
          management_fee: numberValue(line.management_fee_amount),
          net_realization: numberValue(line.net_realization_amount),
          paid_in_full_at: textValue(line.payment_completed_at),
          realization_status: detail.realization.status,
          line_status: textValue(line.line_status),
          check_in: textValue(line.check_in_at),
          check_out: textValue(line.check_out_at),
        })),
        {
          room: 'TOTAL',
          resident: '',
          owner: '',
          plot_number: '',
          duration_months: '',
          rate_type: '',
          money_received: Number(detail.realization.eligible_contract_total),
          contract_total: Number(detail.realization.eligible_contract_total),
          outstanding: 0,
          management_fee: Number(detail.realization.management_fee_total),
          net_realization: Number(detail.realization.realization_total),
          paid_in_full_at: '',
          realization_status: '',
          line_status: 'total',
          check_in: '',
          check_out: '',
        },
      ],
      additional_sheets: [
        {
          name: 'Transfer',
          rows: [
            ['Tanggal', 'Nominal', 'Metode', 'Referensi', 'Kuitansi', 'Status'],
            ...detail.transfers.map((transfer: Record<string, unknown>) => [
              tanggalIndonesia(transfer.transferred_at),
              rupiahValue(transfer.transfer_amount),
              transfer.transfer_method === 'bank_transfer'
                ? 'Transfer bank'
                : transfer.transfer_method === 'cash'
                  ? 'Tunai'
                  : 'Lainnya',
              textValue(transfer.transfer_reference),
              textValue(transfer.receipt_number),
              transfer.transfer_status === 'succeeded'
                ? 'Berhasil'
                : transfer.transfer_status === 'failed'
                  ? 'Gagal'
                  : 'Menunggu',
            ]),
          ],
        },
        {
          name: 'Penyesuaian',
          rows: [
            [
              'Tanggal',
              'Jenis',
              'Nominal',
              'Alasan',
              'Bukti',
              'Sumber',
              'Cara pengembalian dana berlebih',
              'Status pengembalian dana berlebih',
              'Referensi pengembalian dana berlebih',
            ],
            ...detail.corrections.map((correction: Record<string, unknown>) => [
              textValue(correction.created_at).slice(0, 10),
              correction.correction_kind === 'transfer_recovery'
                ? 'Pengembalian kelebihan transfer'
                : 'Penyesuaian kontrak',
              `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(numberValue(correction.amount))}`,
              textValue(correction.reason),
              textValue(correction.evidence_reference),
              textValue(correction.source_reference),
              correction.recovery_disposition === 'recover_from_owner'
                ? 'Penagihan ke Owner'
                : correction.recovery_disposition === 'net_against_future_realization'
                  ? 'Potong realisasi berikutnya'
                  : correction.recovery_disposition
                    ? 'Penyelesaian di luar sistem'
                    : '—',
              correction.recovery_status === 'open'
                ? 'Terbuka'
                : correction.recovery_status === 'resolved'
                  ? 'Selesai'
                  : '—',
              textValue(correction.recovery_reference),
            ]),
          ],
        },
        {
          name: 'Tidak Layak',
          rows: [
            ['Kamar', 'No. Kavling', 'Penghuni', 'Total kontrak', 'Alasan'],
            ...detail.not_eligible.map((row: Record<string, unknown>) => [
              textValue(row.room_code),
              textValue(row.plot_number, '-'),
              textValue(row.resident_name),
              rupiahValue(row.contract_rent_amount),
              notEligibleReasonLabel(textValue(row.reason_code)),
            ]),
          ],
        },
        {
          name: 'Referensi Tarif',
          rows: [
            [
              'Kamar',
              'No. Kavling',
              'Tier durasi',
              'Sumber tarif',
              'Tarif kontrak per bulan',
              'Tarif acuan per bulan',
              'Management fee per bulan',
              'Tanggal fee',
            ],
            ...(
              (detail.realization.tariff_snapshot.pricing_references as
                | Array<Record<string, unknown>>
                | undefined) ?? []
            ).map((reference) => [
              textValue(reference.room_code),
              textValue(
                detail.lines.find(
                  (line: Record<string, unknown>) =>
                    line.room_code_snapshot === reference.room_code,
                )?.plot_number_snapshot,
                '-',
              ),
              textValue(reference.pricing_tier),
              textValue(reference.pricing_source),
              rupiahValue(reference.monthly_price),
              rupiahValue(reference.reference_monthly_price),
              rupiahValue(reference.monthly_management_fee),
              tanggalIndonesia(reference.fee_effective_date),
            ]),
          ],
        },
      ],
      meta: { limit: detail.lines.length, offset: 0, total: detail.lines.length },
    };
    if (format === 'xlsx')
      return {
        content: reportToXlsx(report),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `${filenameBase}.xlsx`,
      };
    if (format === 'pdf')
      return {
        content: await reportToPdf(report),
        contentType: 'application/pdf',
        filename: `${filenameBase}.pdf`,
      };
    throw new BadRequestException({
      code: 'OWNER_REALIZATION_EXPORT_FORMAT_INVALID',
      message: 'Format ekspor harus pdf atau xlsx.',
    });
  }

  private async withRoomIdentifiers<T extends Record<string, unknown>>(
    lines: T[],
    propertyId: string,
  ): Promise<T[]> {
    if (!lines.length || !propertyId) return lines;
    const rooms = await this.database.client.query<{
      id: string;
      room_code: string;
      number: string;
      plot_number: string | null;
      manager_room_label: string | null;
    }>(
      `SELECT id,room_code,number,plot_number,manager_room_label
         FROM rooms WHERE property_id=$1 AND (
           id::text=ANY($2::text[]) OR room_code=ANY($3::text[]) OR number=ANY($3::text[])
         )`,
      [
        propertyId,
        lines.map((line) => textValue(line.room_id)).filter(Boolean),
        lines.map((line) => textValue(line.room_code_snapshot)).filter(Boolean),
      ],
    );
    return lines.map((line) => {
      const room = rooms.rows.find((item) =>
        line.room_id
          ? item.id === line.room_id
          : item.room_code === line.room_code_snapshot || item.number === line.room_code_snapshot,
      );
      return room
        ? {
            ...line,
            plot_number_snapshot: room.plot_number ?? line.plot_number_snapshot ?? null,
            manager_room_label: room.manager_room_label,
          }
        : line;
    });
  }

  private async pdfReceipt(document: Record<string, unknown>) {
    const realization = document.realization as Record<string, unknown>;
    const transfer = document.transfer as Record<string, unknown>;
    const lines = await this.withRoomIdentifiers(
      (document.lines as Array<Record<string, unknown>>) ?? [],
      textValue(document.property_id),
    );
    const amount = Number(transfer.transfer_amount ?? 0);
    const destination = (transfer.destination_snapshot ?? {}) as Record<string, unknown>;
    const propertyId = textValue(document.property_id);
    let issuerSignature: Buffer | undefined;
    if (propertyId) {
      const signature = await this.database.client.query<{ signature_file_id: string | null }>(
        `SELECT signature_file_id
           FROM property_document_signatories
          WHERE property_id=$1 AND role_code='manager'`,
        [propertyId],
      );
      const signatureFileId = signature.rows[0]?.signature_file_id;
      if (signatureFileId) {
        const record = await this.files.findById(signatureFileId);
        if (record && !record.isDeleted) {
          issuerSignature = (await this.fileService.readStoredContent(record)).buffer;
        }
      }
    }
    const total = Number(realization.realization_total ?? 0);
    const cumulative = Number(realization.transferred_total ?? 0);
    const transferDate = new Date(textValue(transfer.transferred_at));
    const spokenAmount = this.indonesianAmount(amount).replace(/\b\p{L}/gu, (letter) =>
      letter.toLocaleUpperCase('id-ID'),
    );
    return {
      content: await ownerRealizationReceiptToPdf({
        receiptNumber: textValue(document.receipt_number),
        realizationReference: textValue(realization.reference),
        propertyName: textValue(
          (realization.scope_snapshot as Record<string, unknown> | undefined)?.property_name,
          'KOSTATION',
        ),
        ownerName: textValue(realization.owner_name),
        issuerName: textValue(document.issuer_name, '—'),
        period: formatOwnerMonthYear(textValue(realization.period)),
        transferDate: Number.isNaN(transferDate.getTime())
          ? '—'
          : `${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(transferDate)} WIB`,
        transferMethod:
          textValue(transfer.transfer_method) === 'bank_transfer'
            ? 'Transfer Bank'
            : textValue(transfer.transfer_method) === 'cash'
              ? 'Tunai'
              : 'Lainnya',
        transferReference: textValue(transfer.transfer_reference),
        evidenceReference: transfer.transfer_evidence_reference
          ? textValue(transfer.transfer_evidence_reference)
          : undefined,
        destinationBank: textValue(destination.bank_name ?? destination.payout_bank_name, '—'),
        destinationAccount: this.maskAccount(
          textValue(destination.account_number ?? destination.payout_account_number),
        ),
        destinationHolder: textValue(
          destination.account_holder ?? destination.payout_account_holder,
          '—',
        ),
        transferAmount: amount,
        totalContractRent: Number(realization.eligible_contract_total ?? 0),
        managementFee: Number(realization.management_fee_total ?? 0),
        correction: Number(realization.correction_total ?? 0),
        cumulativeTransfer: cumulative,
        remainingTransfer: Math.max(total - cumulative, 0),
        amountInWords: spokenAmount,
        ...(issuerSignature ? { issuerSignature } : {}),
        lines: lines.map((line) => ({
          room: textValue(line.plot_number_snapshot || line.room_code_snapshot),
          resident: textValue(line.resident_name_snapshot),
          plotNumber: textValue(line.plot_number_snapshot, '—'),
          contractTotal: numberValue(line.contract_total_amount),
          managementFee: numberValue(line.management_fee_amount),
          ownerEntitlement: numberValue(line.net_realization_amount),
        })),
      }),
      contentType: 'application/pdf',
      filename: `kuitansi-realisasi-${textValue(document.receipt_number, 'owner')}.pdf`,
    };
  }

  private maskAccount(value: string) {
    const digits = value.replace(/\s/g, '');
    return digits.length > 4 ? `•••• ${digits.slice(-4)}` : digits || '—';
  }

  private indonesianAmount(value: number) {
    const words = [
      'nol',
      'satu',
      'dua',
      'tiga',
      'empat',
      'lima',
      'enam',
      'tujuh',
      'delapan',
      'sembilan',
      'sepuluh',
      'sebelas',
    ];
    const spell = (number: number): string => {
      if (number < 12) return words[number];
      if (number < 20) return `${spell(number - 10)} belas`;
      if (number < 100)
        return `${spell(Math.floor(number / 10))} puluh${number % 10 ? ` ${spell(number % 10)}` : ''}`;
      if (number < 200) return `seratus${number - 100 ? ` ${spell(number - 100)}` : ''}`;
      if (number < 1000)
        return `${spell(Math.floor(number / 100))} ratus${number % 100 ? ` ${spell(number % 100)}` : ''}`;
      if (number < 2000) return `seribu${number - 1000 ? ` ${spell(number - 1000)}` : ''}`;
      if (number < 1_000_000)
        return `${spell(Math.floor(number / 1000))} ribu${number % 1000 ? ` ${spell(number % 1000)}` : ''}`;
      if (number < 1_000_000_000)
        return `${spell(Math.floor(number / 1_000_000))} juta${number % 1_000_000 ? ` ${spell(number % 1_000_000)}` : ''}`;
      return `${spell(Math.floor(number / 1_000_000_000))} miliar${number % 1_000_000_000 ? ` ${spell(number % 1_000_000_000)}` : ''}`;
    };
    return `${spell(Math.max(0, Math.floor(value)))
      .replace(/\s+/g, ' ')
      .trim()} rupiah`;
  }

  private candidateTotals(candidates: Candidate[]) {
    return candidates.reduce(
      (total, candidate) => ({
        contract: total.contract + Number(candidate.contract_total_amount),
        fee: total.fee + Number(candidate.management_fee_amount),
        net: total.net + Number(candidate.net_realization_amount),
      }),
      { contract: 0, fee: 0, net: 0 },
    );
  }

  private notEligibleReasonLabel(reason: string) {
    const labels: Record<string, string> = {
      OWNER_ASSIGNMENT_UNAVAILABLE: 'Owner aset belum ditetapkan',
      OWNER_SPONSORED_EXCLUDED: 'Hunian tanggungan Owner',
      OUTSTANDING_CONTRACT_RENT: 'Outstanding kontrak',
      ALREADY_ALLOCATED_TO_REALIZATION: 'Sudah dialokasikan ke Realisasi lain',
      PAYMENT_COMPLETED_AFTER_RELEASE_PERIOD: 'Lunas setelah periode rilis',
    };
    return labels[reason] ?? reason;
  }

  private scopeSnapshot(candidates: Candidate[]) {
    return {
      buildings: [
        ...new Set(candidates.map((candidate) => candidate.building_name).filter(Boolean)),
      ],
      rooms: candidates.map((candidate) => candidate.room_code),
      room_count: candidates.length,
    };
  }

  private tariffSnapshot(candidates: Candidate[]) {
    return {
      pricing_references: candidates.map((candidate) => ({
        room_code: candidate.room_code,
        pricing_tier: candidate.pricing_tier,
        pricing_source: candidate.pricing_source,
        monthly_price: candidate.monthly_price,
        reference_monthly_price: candidate.reference_monthly_price,
        monthly_management_fee: candidate.monthly_management_fee,
        fee_effective_date: candidate.fee_effective_date,
      })),
    };
  }

  private destinationSnapshot(realization: Realization) {
    const snapshot = realization.owner_snapshot ?? {};
    return {
      bank_name: snapshot.payout_bank_name ?? realization.payout_bank_name ?? null,
      account_number: snapshot.payout_account_number ?? realization.payout_account_number ?? null,
      account_holder: snapshot.payout_account_holder ?? realization.payout_account_holder ?? null,
      owner_name: snapshot.full_name ?? realization.full_name,
    };
  }

  private summary(realization: Realization) {
    return {
      id: realization.id,
      reference: realization.realization_reference,
      status: realization.realization_status,
      period: realization.realization_period,
      entry_kind: realization.entry_kind,
      realization_total: realization.realization_total,
      transferred_total: realization.transferred_total,
      published_at: realization.published_at,
    };
  }

  private detailSummary(realization: Realization) {
    return {
      ...this.summary(realization),
      owner_id: realization.owner_profile_id,
      owner_name: realization.full_name,
      owner_snapshot: realization.owner_snapshot,
      scope_snapshot: realization.scope_snapshot,
      tariff_snapshot: realization.tariff_snapshot,
      room_count: realization.room_count,
      eligible_contract_total: realization.eligible_contract_total,
      management_fee_total: realization.management_fee_total,
      correction_total: realization.correction_total,
      notes: realization.notes,
      historical_source: realization.historical_source,
      prepared_at: realization.prepared_at,
      submitted_for_review_at: realization.submitted_for_review_at,
      approved_at: realization.approved_at,
      submitted_to_finance_at: realization.submitted_to_finance_at,
      awaiting_transfer_at: realization.awaiting_transfer_at,
      realized_at: realization.realized_at,
    };
  }

  private period(value: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
      throw new BadRequestException({
        code: 'OWNER_REALIZATION_PERIOD_INVALID',
        message: 'Periode harus menggunakan format YYYY-MM.',
      });
    const [year, month] = value.split('-').map(Number);
    return {
      value,
      start: `${value}-01`,
      until: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
    };
  }

  private currentJakartaPeriod() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    return `${year}-${month}`;
  }

  private maskAccountNumber(value: string | null | undefined): string | null {
    const normalized = value?.replace(/\s+/g, '').trim();
    if (!normalized) return null;
    if (normalized.length <= 4) return `•••• ${normalized}`;
    return `•••• ${normalized.slice(-4)}`;
  }

  private assertPropertyScope(actor: UserAccessContext, propertyId: string) {
    if (!actor.propertyIds.includes(propertyId))
      throw new ForbiddenException({
        code: 'PROPERTY_SCOPE_DENIED',
        message: 'Akses properti ditolak.',
      });
  }

  private invalidTransition(current: string, next: string): never {
    throw new ConflictException({
      code: 'OWNER_REALIZATION_STATUS_TRANSITION_INVALID',
      message: `Status Realisasi ${current} belum dapat diubah ke ${next}.`,
    });
  }

  private isUniqueViolation(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }

  private requireIdempotencyKey(value: string | undefined) {
    const key = value?.trim();
    if (!key || key.length < 16 || key.length > 128)
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key wajib diisi.',
      });
    return key;
  }

  private async command<T>(
    actor: UserAccessContext,
    propertyId: string,
    route: string,
    idempotencyKey: string | undefined,
    payload: unknown,
    context: RequestAuditContext,
    action: (client: PoolClient) => Promise<T>,
  ) {
    this.assertPropertyScope(actor, propertyId);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return this.database.transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO idempotency_commands(property_id,actor_user_id,route,idempotency_key,request_fingerprint,command_status,correlation_id)
         VALUES($1,$2,$3,$4,$5,'pending',$6) ON CONFLICT(actor_user_id,route,idempotency_key) DO NOTHING RETURNING id`,
        [propertyId, actor.id, route, key, fingerprint, context.correlationId ?? null],
      );
      if (inserted.rowCount === 0) {
        const existing = await client.query<IdempotencyRow>(
          `SELECT request_fingerprint,command_status,response_body FROM idempotency_commands WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3 FOR UPDATE`,
          [actor.id, route, key],
        );
        if (existing.rows[0]?.request_fingerprint !== fingerprint)
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency-Key sudah digunakan untuk permintaan lain.',
          });
        if (existing.rows[0]?.command_status === 'succeeded')
          return existing.rows[0].response_body as T;
        throw new ConflictException({
          code: 'IDEMPOTENCY_COMMAND_IN_PROGRESS',
          message: 'Perintah sebelumnya masih diproses.',
        });
      }
      const response = await action(client);
      await client.query(
        `UPDATE idempotency_commands SET command_status='succeeded',response_status=200,response_body=$4::jsonb,completed_at=now() WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3`,
        [actor.id, route, key, JSON.stringify(response)],
      );
      return response;
    });
  }
}
