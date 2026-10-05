import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { LeaseRevisionDecision } from './lease-revision-policy.helper';

export type RoomRecordingCorrectionFacts = {
  leaseId: string;
  propertyId: string;
  residentId: string;
  sourceRoomId: string;
  targetRoomId?: string;
  occupancyId: string | null;
  leaseStatus: string;
  commercialMode: 'rent' | 'owner_sponsored';
  startDate: string;
  endDate: string;
  recordingErrorConfirmed?: boolean;
  physicalCheckInRecorded: boolean;
  evidenceFileIds: string[];
  relatedTransactionCount: number;
  ownerSponsorship: Record<string, unknown> | null;
  policy: LeaseRevisionDecision;
  lock: boolean;
};

type RoomIdentity = {
  id: string;
  property_id: string;
  number: string;
  manager_room_label: string | null;
  plot_number: string | null;
  room_status: string;
  category: string;
  gender_policy: string;
  building_gender_policy: string;
  building_property_id: string;
  building_category: string;
  kost_type_id: string;
  kost_type_name: string;
  kost_type_property_id: string;
  kost_type_category: string;
  kost_type_status: string;
  kost_type_deleted_at: Date | null;
};

export type RoomRecordingCorrectionPlan = {
  previous: RoomIdentity;
  corrected: RoomIdentity;
  targetStatus: 'reserved' | 'awaiting_check_in' | 'occupied';
  evidenceFileIds: string[];
  sourceBindings: { commitmentCount: number; holdCount: number };
  ownerAssignment: {
    id: string;
    owner_profile_id: string;
    ownership_kind: 'building' | 'room';
  } | null;
};

/** Corrects a falsely recorded room; never records a physical move or new check-in. */
@Injectable()
export class LeaseRoomRecordingCorrectionService {
  async preview(
    client: PoolClient,
    facts: RoomRecordingCorrectionFacts,
  ): Promise<RoomRecordingCorrectionPlan | null> {
    if (!facts.targetRoomId || facts.targetRoomId === facts.sourceRoomId) return null;
    if (!facts.policy.allowed)
      throw new ConflictException({ code: facts.policy.code, message: facts.policy.message });
    if (!Number.isSafeInteger(facts.relatedTransactionCount) || facts.relatedTransactionCount < 0)
      throw new ConflictException({
        code: 'LEASE_REVISION_FACTS_INVALID',
        message:
          'Hubungan transaksi belum dapat dipastikan. Perbarui data sebelum mengoreksi kamar.',
      });
    if (!facts.recordingErrorConfirmed)
      throw new ConflictException({
        code: 'LEASE_ROOM_CORRECTION_RECORDING_CONFIRMATION_REQUIRED',
        message:
          'Konfirmasikan bahwa kamar sebelumnya salah dicatat. Jika penghuni benar-benar berpindah kamar, gunakan Pindah Kamar agar jejak serah-terimanya tetap benar.',
      });
    const evidence = [...new Set(facts.evidenceFileIds)];
    if (evidence.length > 5)
      throw new UnprocessableEntityException({
        code: 'LEASE_ROOM_CORRECTION_EVIDENCE_LIMIT',
        message:
          'Bukti koreksi dibatasi lima berkas. Pilih bukti yang menjelaskan kesalahan kamar sebelumnya.',
      });
    if (facts.physicalCheckInRecorded && !evidence.length)
      throw new ConflictException({
        code: 'LEASE_ROOM_CORRECTION_EVIDENCE_REQUIRED',
        message:
          'Penghuni sudah tercatat check-in. Unggah bukti bahwa kamar awal salah dicatat; untuk perpindahan fisik gunakan Pindah Kamar.',
      });
    const rooms = await client.query<RoomIdentity>(
      `SELECT /* revision_rooms */ room.id,room.property_id,room.number,room.manager_room_label,room.plot_number,
              room.room_status,room.category,room.gender_policy,building.gender_policy AS building_gender_policy,
              building.property_id AS building_property_id,building.category AS building_category,
              type.id AS kost_type_id,type.name AS kost_type_name,type.property_id AS kost_type_property_id,
              type.category AS kost_type_category,type.status AS kost_type_status,type.deleted_at AS kost_type_deleted_at
         FROM rooms room JOIN room_buildings building ON building.id=room.building_id
         JOIN kost_types type ON type.id=room.kost_type_id
        WHERE room.id=ANY($1::uuid[]) AND room.property_id=$2
        ORDER BY room.id ${facts.lock ? 'FOR UPDATE OF room,building,type' : ''}`,
      [[facts.sourceRoomId, facts.targetRoomId].sort(), facts.propertyId],
    );
    const source = rooms.rows.find((room) => room.id === facts.sourceRoomId);
    const target = rooms.rows.find((room) => room.id === facts.targetRoomId);
    const resident = await client.query<{ gender: string }>(
      `SELECT gender FROM residents WHERE id=$1 AND property_id=$2 ${facts.lock ? 'FOR UPDATE' : ''}`,
      [facts.residentId, facts.propertyId],
    );
    const gender = resident.rows[0]?.gender;
    if (
      !source ||
      !target ||
      !gender ||
      target.property_id !== facts.propertyId ||
      target.building_property_id !== facts.propertyId ||
      target.kost_type_property_id !== facts.propertyId ||
      !['rukost', 'apartkost'].includes(target.category) ||
      target.category !== target.building_category ||
      target.category !== target.kost_type_category ||
      target.kost_type_status !== 'active' ||
      target.kost_type_deleted_at !== null ||
      target.building_gender_policy !== gender ||
      ![gender, 'mixed'].includes(target.gender_policy)
    )
      throw new ConflictException({
        code: 'LEASE_ROOM_CORRECTION_AUTHORITY_INVALID',
        message:
          'Kamar tujuan tidak sesuai properti, jenis kelamin penghuni, atau tipe kost aktif. Pilih kamar yang sesuai lalu tinjau ulang.',
      });
    if (target.room_status !== 'vacant')
      throw new ConflictException({
        code: 'LEASE_ROOM_CORRECTION_ROOM_UNAVAILABLE',
        message: `Kamar ${target.number} belum tersedia. Pilih kamar kosong; selesaikan pemeriksaan atau perawatan terlebih dahulu bila diperlukan.`,
      });
    const targetStatus = facts.occupancyId
      ? 'occupied'
      : facts.leaseStatus === 'active'
        ? 'awaiting_check_in'
        : 'reserved';
    if (
      (facts.physicalCheckInRecorded && !facts.occupancyId) ||
      source.room_status !== targetStatus
    )
      throw new ConflictException({
        code: 'LEASE_ROOM_CORRECTION_SOURCE_REVIEW_REQUIRED',
        message:
          'Status kamar asal tidak sesuai catatan penyewaan atau check-in. Tinjau riwayat kamar terlebih dahulu; koreksi tidak akan membuat check-in baru.',
      });
    const sourceBindings = await client.query<{
      binding_valid: boolean;
      source_conflict: boolean;
      commitment_count: string | number;
      hold_count: string | number;
    }>(
      `SELECT /* revision_room_source */
        EXISTS (SELECT 1 FROM leases recorded WHERE recorded.id=$3 AND recorded.property_id=$1
          AND recorded.room_id=$2 AND recorded.resident_id=$7 AND recorded.lease_status=$8
          AND recorded.occupancy_id IS NOT DISTINCT FROM $6::uuid
          AND (recorded.occupancy_id IS NULL OR EXISTS (
            SELECT 1 FROM occupancies occupancy WHERE occupancy.id=recorded.occupancy_id
              AND occupancy.property_id=$1 AND occupancy.room_id=$2 AND occupancy.resident_id=$7 AND occupancy.occupancy_status='active'))
          AND (recorded.onboarding_commitment_id IS NULL OR EXISTS (
            SELECT 1 FROM onboarding_commitments commitment WHERE commitment.id=recorded.onboarding_commitment_id
              AND commitment.property_id=$1 AND commitment.lease_id=$3 AND commitment.resident_id=$7
              AND commitment.room_id=$2 AND commitment.category=$9 AND commitment.status IN ('committed','completed'))))
        AND NOT EXISTS (SELECT 1 FROM onboarding_commitments commitment
          WHERE commitment.lease_id=$3 AND commitment.status IN ('committed','completed')
            AND (commitment.property_id<>$1 OR commitment.room_id IS DISTINCT FROM $2::uuid
              OR commitment.resident_id IS DISTINCT FROM $7::uuid OR commitment.category IS DISTINCT FROM $9::text))
        AND NOT EXISTS (SELECT 1 FROM onboarding_commitments commitment JOIN booking_lead_holds hold ON hold.id=commitment.hold_id
          WHERE commitment.lease_id=$3 AND commitment.status IN ('committed','completed') AND hold.hold_status IN ('active','committed')
            AND (hold.property_id<>$1 OR hold.room_id<>$2 OR hold.onboarding_commitment_id IS DISTINCT FROM commitment.id)) AS binding_valid,
        EXISTS (SELECT 1 FROM leases other WHERE other.property_id=$1 AND other.room_id=$2 AND other.id<>$3
          AND other.lease_status IN ('draft','awaiting_activation','active')
          AND (other.lease_status='active' OR daterange(other.start_date,other.end_date,'[)') && daterange($4::date,$5::date,'[)')))
        OR EXISTS (SELECT 1 FROM occupancies occupancy WHERE occupancy.property_id=$1 AND occupancy.room_id=$2
          AND occupancy.id IS DISTINCT FROM $6::uuid AND occupancy.occupancy_status<>'cancelled'
          AND (occupancy.occupancy_status='active' OR occupancy.start_date<$5::date AND COALESCE(occupancy.end_date,'infinity'::date)>$4::date))
        OR EXISTS (SELECT 1 FROM onboarding_commitments commitment WHERE commitment.property_id=$1 AND commitment.room_id=$2
          AND commitment.lease_id IS DISTINCT FROM $3::uuid AND commitment.status IN ('draft','awaiting_documents','awaiting_financials','ready_to_commit','committed'))
        OR EXISTS (SELECT 1 FROM booking_lead_holds hold WHERE hold.property_id=$1 AND hold.room_id=$2
          AND (hold.hold_status='committed' OR hold.hold_status='active' AND hold.expires_at>now())
          AND NOT EXISTS (SELECT 1 FROM onboarding_commitments commitment
            WHERE commitment.lease_id=$3 AND commitment.property_id=$1 AND commitment.hold_id=hold.id AND commitment.id=hold.onboarding_commitment_id))
        OR EXISTS (SELECT 1 FROM lease_transfer_commands command WHERE command.property_id=$1 AND command.to_room_id=$2 AND command.state='scheduled') AS source_conflict,
        (SELECT count(*) FROM onboarding_commitments commitment WHERE commitment.lease_id=$3 AND commitment.property_id=$1
          AND commitment.room_id=$2 AND commitment.status IN ('committed','completed')) AS commitment_count,
        (SELECT count(*) FROM onboarding_commitments commitment JOIN booking_lead_holds hold ON hold.id=commitment.hold_id
          WHERE commitment.lease_id=$3 AND commitment.property_id=$1 AND commitment.room_id=$2 AND commitment.status IN ('committed','completed')
            AND hold.property_id=$1 AND hold.room_id=$2 AND hold.hold_status IN ('active','committed')) AS hold_count`,
      [
        facts.propertyId,
        source.id,
        facts.leaseId,
        facts.startDate,
        facts.endDate,
        facts.occupancyId,
        facts.residentId,
        facts.leaseStatus,
        source.category,
      ],
    );
    const bindings = sourceBindings.rows[0];
    const validCount = (value: unknown) =>
      (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) &&
      [0, 1].includes(Number(value));
    if (
      !bindings ||
      bindings.binding_valid !== true ||
      !validCount(bindings.commitment_count) ||
      !validCount(bindings.hold_count) ||
      Number(bindings.hold_count) > Number(bindings.commitment_count)
    )
      throw new ConflictException({
        code: 'LEASE_ROOM_CORRECTION_SOURCE_BINDING_INVALID',
        message:
          'Catatan kamar, hunian, atau pemesanan penyewaan ini tidak cocok. Kamar asal tetap dipertahankan; tinjau riwayat penyewaan dan pemesanannya sebelum mencoba lagi.',
      });
    if (bindings.source_conflict !== false)
      throw new ConflictException({
        code: 'LEASE_ROOM_CORRECTION_SOURCE_CONFLICT',
        message: `Kamar ${source.number} masih terkait hunian, pemesanan, atau perpindahan lain. Kamar tidak dilepas; tinjau aktivitas kamar dan selesaikan catatan yang bertentangan terlebih dahulu.`,
      });
    const conflicts = await client.query<{ conflict: boolean; access_granted: boolean }>(
      `SELECT /* revision_room_conflicts */
        EXISTS (SELECT 1 FROM leases other WHERE other.property_id=$1 AND other.room_id=$2 AND other.id<>$3
          AND other.lease_status IN ('draft','awaiting_activation','active')
          AND (other.lease_status='active' OR daterange(other.start_date,other.end_date,'[)') && daterange($4::date,$5::date,'[)')))
        OR EXISTS (SELECT 1 FROM occupancies occupancy WHERE occupancy.property_id=$1 AND occupancy.room_id=$2
          AND occupancy.id IS DISTINCT FROM $6::uuid AND occupancy.occupancy_status<>'cancelled'
          AND (occupancy.occupancy_status='active' OR occupancy.start_date<$5::date AND COALESCE(occupancy.end_date,'infinity'::date)>$4::date))
        OR EXISTS (SELECT 1 FROM onboarding_commitments commitment WHERE commitment.property_id=$1 AND commitment.room_id=$2
          AND commitment.lease_id IS DISTINCT FROM $3::uuid AND commitment.status IN ('draft','awaiting_documents','awaiting_financials','ready_to_commit','committed'))
        OR EXISTS (SELECT 1 FROM booking_lead_holds hold WHERE hold.property_id=$1 AND hold.room_id=$2
          AND (hold.hold_status='committed' OR hold.hold_status='active' AND hold.expires_at>now()))
        OR EXISTS (SELECT 1 FROM lease_transfer_commands command WHERE command.property_id=$1 AND command.to_room_id=$2 AND command.state='scheduled') AS conflict,
        EXISTS (SELECT 1 FROM smart_lock_access_grants grant_record JOIN smart_lock_devices device ON device.id=grant_record.smart_lock_device_id
          WHERE grant_record.property_id=$1 AND device.property_id=$1 AND device.room_id=$7
            AND grant_record.resident_id=$8 AND grant_record.grant_type='resident' AND grant_record.grant_status='active') AS access_granted`,
      [
        facts.propertyId,
        target.id,
        facts.leaseId,
        facts.startDate,
        facts.endDate,
        facts.occupancyId,
        source.id,
        facts.residentId,
      ],
    );
    if (!conflicts.rows[0] || conflicts.rows[0].conflict !== false)
      throw new ConflictException({
        code: 'LEASE_ROOM_CORRECTION_ROOM_CONFLICT',
        message: `Kamar ${target.number} sudah digunakan atau dipesan pada periode ini. Pilih kamar lain atau tinjau tanggal, lalu periksa kembali.`,
      });
    if (conflicts.rows[0].access_granted !== false)
      throw new ConflictException({
        code: 'LEASE_ROOM_CORRECTION_ACCESS_REVIEW_REQUIRED',
        message:
          'Akses kunci kamar asal masih aktif. Cabut akses yang salah melalui pengelolaan kunci sebelum mengoreksi kamar; akses kamar tujuan diterbitkan melalui alur kunci yang biasa.',
      });
    let ownerAssignment: RoomRecordingCorrectionPlan['ownerAssignment'] = null;
    if (facts.commercialMode === 'owner_sponsored') {
      const owner = await client.query<NonNullable<RoomRecordingCorrectionPlan['ownerAssignment']>>(
        `SELECT /* revision_room_owner */ assignment.id,assignment.owner_profile_id,'${target.category === 'rukost' ? 'building' : 'room'}'::text AS ownership_kind
          FROM ${target.category === 'rukost' ? 'building_owner_assignments' : 'room_owner_assignments'} assignment
          JOIN rooms room ON ${target.category === 'rukost' ? 'room.building_id=assignment.building_id' : 'room.id=assignment.room_id'}
          JOIN property_owner_profiles profile ON profile.id=assignment.owner_profile_id AND profile.property_id=assignment.property_id
          WHERE room.id=$1 AND assignment.property_id=$2 AND assignment.assignment_status='active'
          ${facts.lock ? 'FOR SHARE OF assignment,profile' : ''}`,
        [target.id, facts.propertyId],
      );
      ownerAssignment = owner.rows.length === 1 ? owner.rows[0] : null;
      if (
        !ownerAssignment ||
        ownerAssignment.owner_profile_id !== facts.ownerSponsorship?.owner_profile_id
      )
        throw new ConflictException({
          code: 'LEASE_ROOM_CORRECTION_SPONSOR_MISMATCH',
          message:
            'Kamar tujuan bukan aset Owner penanggung hunian ini. Pilih aset Owner yang sama atau tinjau koreksi pihak penanggung sebelum melanjutkan.',
        });
      if (
        facts.relatedTransactionCount > 0 &&
        ownerAssignment.id !== facts.ownerSponsorship?.ownership_assignment_id
      )
        throw new ConflictException({
          code: 'LEASE_ROOM_CORRECTION_SPONSOR_POLICY_REVIEW_REQUIRED',
          message:
            'Koreksi kamar mengubah hubungan kepemilikan yang sudah terkait pembayaran. Tinjau penyelesaian biaya pengelolaan terlebih dahulu; pihak penanggung lama tetap tersimpan.',
        });
    }
    if (evidence.length) {
      const files = await client.query<{ id: string; file_purpose: string }>(
        `SELECT /* revision_room_evidence */ file.id,file.file_purpose FROM files file
          WHERE file.id=ANY($1::uuid[]) AND file.property_id=$2 AND NOT file.is_deleted
            AND file.file_purpose='lease_revision_evidence' AND file.file_size_bytes BETWEEN 1 AND 5242880
            AND file.mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')
            AND NOT EXISTS (SELECT 1 FROM lease_data_correction_evidence evidence WHERE evidence.file_id=file.id AND evidence.lease_id<>$3)
          ORDER BY file.id ${facts.lock ? 'FOR SHARE OF file' : ''}`,
        [evidence, facts.propertyId, facts.leaseId],
      );
      if (
        files.rows.length !== evidence.length ||
        files.rows.some((file) => file.file_purpose !== 'lease_revision_evidence')
      )
        throw new ConflictException({
          code: 'LEASE_ROOM_CORRECTION_EVIDENCE_UNAVAILABLE',
          message:
            'Bukti koreksi tidak tersedia, sudah dihapus, atau tidak sesuai penyewaan ini. Unggah kembali bukti koreksi melalui form ini lalu tinjau ulang.',
        });
    }
    return {
      previous: source,
      corrected: target,
      targetStatus,
      evidenceFileIds: evidence,
      sourceBindings: {
        commitmentCount: Number(bindings.commitment_count),
        holdCount: Number(bindings.hold_count),
      },
      ownerAssignment,
    };
  }

  async apply(
    client: PoolClient,
    facts: RoomRecordingCorrectionFacts,
    plan: RoomRecordingCorrectionPlan,
    correctionId: string,
    actorId: string,
  ) {
    if (!facts.lock) throw new Error('Room correction requires commit-time locked validation');
    const updated = await client.query(
      `UPDATE leases SET room_id=$3,snapshot_room_number=$4,snapshot_kost_type_name=$5,updated_by_user_id=$6,updated_at=now()
        WHERE id=$1 AND property_id=$2 AND room_id=$7 AND occupancy_id IS NOT DISTINCT FROM $8::uuid`,
      [
        facts.leaseId,
        facts.propertyId,
        plan.corrected.id,
        plan.corrected.number,
        plan.corrected.kost_type_name,
        actorId,
        plan.previous.id,
        facts.occupancyId,
      ],
    );
    if (updated.rowCount !== 1)
      throw new ConflictException({
        code: 'LEASE_ROOM_CORRECTION_STALE',
        message:
          'Kamar penyewaan sudah berubah. Perbarui data dan tinjau koreksi lagi sebelum menyimpan.',
      });
    if (facts.occupancyId) {
      const occupancy = await client.query(
        `UPDATE occupancies SET room_id=$3,updated_at=now() WHERE id=$1 AND property_id=$2 AND resident_id=$4 AND room_id=$5 AND occupancy_status='active'`,
        [
          facts.occupancyId,
          facts.propertyId,
          plan.corrected.id,
          facts.residentId,
          plan.previous.id,
        ],
      );
      if (occupancy.rowCount !== 1)
        throw new ConflictException({
          code: 'LEASE_ROOM_CORRECTION_OCCUPANCY_STALE',
          message:
            'Catatan hunian telah berubah. Perbarui riwayat check-in lalu tinjau kembali koreksi kamar.',
        });
      for (const identity of [plan.previous, plan.corrected])
        await client.query(
          `INSERT INTO occupancy_history(occupancy_id,property_id,room_id,resident_id,event_type,from_status,to_status,event_date,actor_user_id,metadata)
            VALUES($1,$2,$3,$4,'status_sync','active','active',(now() AT TIME ZONE 'Asia/Jakarta')::date,$5,$6::jsonb)`,
          [
            facts.occupancyId,
            facts.propertyId,
            identity.id,
            facts.residentId,
            actorId,
            JSON.stringify({
              source: 'lease_room_recording_correction',
              correction_id: correctionId,
              previous_room_id: plan.previous.id,
              previous_room_number: plan.previous.number,
              corrected_room_id: plan.corrected.id,
              corrected_room_number: plan.corrected.number,
            }),
          ],
        );
    }
    // These are current operational bindings. Original dates/prices and source
    // booking facts remain unchanged; the append-only amendment owns before/after.
    const commitments = await client.query(
      `UPDATE onboarding_commitments SET room_id=$3,category=$4,updated_at=now()
        WHERE lease_id=$1 AND property_id=$2 AND room_id=$5 AND status IN ('committed','completed')`,
      [
        facts.leaseId,
        facts.propertyId,
        plan.corrected.id,
        plan.corrected.category,
        plan.previous.id,
      ],
    );
    const holds = await client.query(
      `UPDATE booking_lead_holds hold SET room_id=$3,updated_at=now()
        FROM onboarding_commitments commitment WHERE commitment.lease_id=$1 AND commitment.property_id=$2
           AND commitment.status IN ('committed','completed')
           AND hold.id=commitment.hold_id AND hold.property_id=$2 AND hold.room_id=$4 AND hold.hold_status IN ('active','committed')`,
      [facts.leaseId, facts.propertyId, plan.corrected.id, plan.previous.id],
    );
    if (
      commitments.rowCount !== plan.sourceBindings.commitmentCount ||
      holds.rowCount !== plan.sourceBindings.holdCount
    )
      throw new ConflictException({
        code: 'LEASE_ROOM_CORRECTION_SOURCE_BINDING_STALE',
        message:
          'Catatan pemesanan berubah saat koreksi disimpan. Perubahan dibatalkan seluruhnya; perbarui data penyewaan lalu tinjau kembali.',
      });
    if (plan.ownerAssignment)
      await client.query(
        `UPDATE owner_sponsored_lease_terms SET room_id=$3,ownership_kind=$4,ownership_assignment_id=$5,updated_at=now()
          WHERE lease_id=$1 AND property_id=$2 AND room_id=$6 AND owner_profile_id=$7 AND term_status='active'`,
        [
          facts.leaseId,
          facts.propertyId,
          plan.corrected.id,
          plan.ownerAssignment.ownership_kind,
          plan.ownerAssignment.id,
          plan.previous.id,
          plan.ownerAssignment.owner_profile_id,
        ],
      );
    const rooms = await client.query(
      `UPDATE rooms SET room_status=CASE WHEN id=$3 THEN $4 ELSE 'vacant' END,updated_by_user_id=$5,updated_at=now()
        WHERE property_id=$1 AND ((id=$2 AND room_status=$4) OR (id=$3 AND room_status='vacant'))`,
      [facts.propertyId, plan.previous.id, plan.corrected.id, plan.targetStatus, actorId],
    );
    if (rooms.rowCount !== 2)
      throw new ConflictException({
        code: 'LEASE_ROOM_CORRECTION_ROOM_STALE',
        message:
          'Status kamar berubah saat koreksi disimpan. Tidak ada perubahan parsial yang diterapkan; perbarui data dan tinjau ulang.',
      });
    for (const fileId of plan.evidenceFileIds)
      await client.query(
        `INSERT INTO lease_data_correction_evidence(property_id,lease_id,correction_id,file_id,created_by_user_id) VALUES($1,$2,$3,$4,$5)`,
        [facts.propertyId, facts.leaseId, correctionId, fileId, actorId],
      );
  }
}
