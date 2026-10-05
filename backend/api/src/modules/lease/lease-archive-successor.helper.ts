import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { UserAccessContext } from '../iam/types/iam.types';

type SuccessorInput = { property_id: string; resident_id?: string; booking_lead_id?: string;
  source_archive_id?: string; archive_replacement_reason?: string };
type Source = { id: string; lease_id: string; property_id: string; resident_id: string;
  lease_code: string; archive_status: string; lease_status: string; resident_status: string;
  financial_resolution_state: string; protected_history: boolean; resident_conflict: boolean };

/** Called inside canonical onboarding, after its aggregate lock and idempotency claim. */
export async function prepareArchiveSuccessor(client: PoolClient, user: UserAccessContext, input: SuccessorInput) {
  if (!input.source_archive_id && input.archive_replacement_reason == null) return null;
  if (!user.roles.includes('admin') || !user.permissions.includes('lease.manage') ||
    !user.roles.includes('owner') && !user.propertyIds.includes(input.property_id))
    throw new ForbiddenException({ code: 'LEASE_ARCHIVE_FORBIDDEN', message: 'Penyewaan pengganti dari arsip hanya tersedia bagi Admin properti dengan izin pengelolaan penyewaan.' });
  const reason = input.archive_replacement_reason?.trim() ?? '';
  if (!input.source_archive_id || !input.resident_id || input.booking_lead_id || reason.length < 3 || reason.length > 1000)
    throw new UnprocessableEntityException({ code: 'LEASE_ARCHIVE_SUCCESSOR_INPUT_REQUIRED', message: 'Pilih arsip dan penghuni asal, lalu isi alasan penyewaan pengganti 3–1.000 karakter. Jangan gunakan pemesanan lama sebagai sumber baru.' });
  const scope = await client.query<{ lease_id: string }>('SELECT lease_id FROM lease_archives WHERE id=$1 AND property_id=$2', [input.source_archive_id, input.property_id]);
  if (!scope.rows[0]) throw new ConflictException({ code: 'LEASE_ARCHIVE_NOT_FOUND', message: 'Arsip asal tidak ditemukan di properti ini. Buka ulang arsip sebelum membuat pengganti.' });
  await client.query('SELECT id FROM leases WHERE id=$1 AND property_id=$2 FOR UPDATE', [scope.rows[0].lease_id, input.property_id]);
  const result = await client.query<Source>(`SELECT /* archive_successor_source */ archive.id,archive.lease_id,archive.property_id,
    archive.archive_status,archive.financial_resolution_state,lease.lease_status,lease.lease_code,
    lease.resident_id,resident.resident_status,
    (lease.occupancy_id IS NOT NULL OR EXISTS(SELECT 1 FROM lease_activation_lifecycles lifecycle WHERE lifecycle.lease_id=lease.id AND lifecycle.checked_in_at IS NOT NULL)
      OR EXISTS(SELECT 1 FROM room_transfer_records transfer WHERE transfer.from_lease_id=lease.id OR transfer.to_lease_id=lease.id)
      OR EXISTS(SELECT 1 FROM lease_checkout_commands checkout WHERE checkout.lease_id=lease.id AND checkout.state<>'cancelled')
      OR EXISTS(SELECT 1 FROM property_owner_realization_lease_locks realization_lock JOIN property_owner_realizations realization ON realization.id=realization_lock.realization_id
        WHERE realization_lock.lease_id=lease.id AND (realization_lock.lock_status='locked' OR realization.realization_status<>'void'))
      OR EXISTS(SELECT 1 FROM property_owner_earnings earning WHERE earning.lease_id=lease.id AND earning.earning_status='recognized')) AS protected_history,
    (EXISTS(SELECT 1 FROM leases other WHERE other.property_id=$2 AND other.resident_id=resident.id AND other.id<>lease.id AND other.lease_status IN ('draft','awaiting_activation','active'))
      OR EXISTS(SELECT 1 FROM occupancies occupancy WHERE occupancy.property_id=$2 AND occupancy.resident_id=resident.id AND occupancy.occupancy_status='active')
      OR EXISTS(SELECT 1 FROM onboarding_commitments commitment WHERE commitment.property_id=$2 AND commitment.resident_id=resident.id AND commitment.lease_id IS DISTINCT FROM lease.id AND commitment.status IN ('draft','awaiting_documents','awaiting_financials','ready_to_commit','committed'))
      OR resident.resident_status='archived' AND resident.archive_source IS DISTINCT FROM 'mistaken_lease_cancellation') AS resident_conflict
    FROM lease_archives archive JOIN leases lease ON lease.id=archive.lease_id AND lease.property_id=archive.property_id
    JOIN residents resident ON resident.id=lease.resident_id AND resident.property_id=lease.property_id
    WHERE archive.id=$1 AND archive.property_id=$2 FOR UPDATE OF archive,resident`, [input.source_archive_id, input.property_id]);
  const source = result.rows[0];
  if (!source || source.resident_id !== input.resident_id || source.archive_status !== 'archived' || source.lease_status !== 'cancelled')
    throw new ConflictException({ code: 'LEASE_ARCHIVE_SUCCESSOR_SOURCE_STALE', message: 'Arsip sudah dipulihkan, diganti, atau tidak cocok dengan penghuni ini. Buka riwayat terbaru; jangan membuat pengganti kedua.' });
  if (source.protected_history !== false)
    throw new ConflictException({ code: 'LEASE_ARCHIVE_RESTORE_HISTORY_PROTECTED', message: 'Arsip terkait hunian nyata atau realisasi Owner. Tinjau riwayat dan penyelesaian terkait sebelum membuat pengganti.' });
  if (source.resident_conflict !== false)
    throw new ConflictException({ code: 'LEASE_ARCHIVE_RESTORE_RESIDENT_CONFLICT', message: 'Penghuni memiliki penyewaan atau proses hunian lain. Buka penyewaan yang berlaku; jangan membuat dua penyewaan aktif.' });
  return { ...source, replacementReason: reason };
}

export async function completeArchiveSuccessor(client: PoolClient, user: UserAccessContext,
  source: NonNullable<Awaited<ReturnType<typeof prepareArchiveSuccessor>>>, successorLeaseId: string) {
  const commandId = randomUUID();
  await client.query(`INSERT INTO lease_archive_successor_commands
    (id,archive_id,property_id,lease_id,successor_lease_id,created_by_user_id,reason,source_room_id,successor_room_id)
    SELECT $1,$2,$3,$4,$5,$6,$7,source.room_id,successor.room_id FROM leases source JOIN leases successor ON successor.id=$5 AND successor.property_id=$3
      WHERE source.id=$4 AND source.property_id=$3`, [commandId, source.id, source.property_id, source.lease_id,
    successorLeaseId, user.id, source.replacementReason]);
  const linked = await client.query(`UPDATE lease_archives SET archive_status='superseded',successor_lease_id=$3,successor_command_id=$4
    WHERE id=$1 AND property_id=$2 AND archive_status='archived'`, [source.id, source.property_id, successorLeaseId, commandId]);
  if (linked.rowCount !== 1) throw new ConflictException({ code: 'LEASE_ARCHIVE_SUCCESSOR_SOURCE_STALE', message: 'Arsip berubah saat pengganti disimpan. Seluruh pengajuan dibatalkan; buka kembali arsip dan tinjau penyewaan baru.' });
  if (source.resident_status === 'archived') {
    const resident = await client.query(`UPDATE residents SET resident_status='pending_activation',archive_reason=NULL,archive_source=NULL,
      archived_at=NULL,archived_by_user_id=NULL,updated_at=now()
      WHERE id=$1 AND property_id=$2 AND resident_status='archived' AND archive_source='mistaken_lease_cancellation'`, [source.resident_id, source.property_id]);
    if (resident.rowCount !== 1) throw new ConflictException({ code: 'LEASE_ARCHIVE_SUCCESSOR_SOURCE_STALE', message: 'Status penghuni berubah. Pengganti belum disimpan; tinjau data penghuni terbaru.' });
  }
  for (const [leaseId, action, relatedLeaseId, eventType] of [[source.lease_id,'lease_archive_replaced',successorLeaseId,'archive_replaced'], [successorLeaseId,'lease_replaces_archive',source.lease_id,'archive_successor_created']]) {
    await client.query(`INSERT INTO lease_history(property_id,lease_id,event_type,actor_user_id,event_date,metadata)
      VALUES($1,$2,$5,$3,(now() AT TIME ZONE 'Asia/Jakarta')::date,$4::jsonb)`,
    [source.property_id, leaseId, user.id, JSON.stringify({ action, archive_id: source.id,
      related_lease_id: relatedLeaseId, source_lease_code: source.lease_code, reason: source.replacementReason,
      financial_resolution_state: source.financial_resolution_state }), eventType]);
  }
}
