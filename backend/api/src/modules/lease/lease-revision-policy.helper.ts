/** Shared eligibility for Handoff 08 previews. Commands must re-read locked facts. */
export type LeaseRevisionFacts = {
  leaseStatus: string;
  physicalCheckInRecorded: boolean;
  checkoutState: string | null;
  scheduledTransfer: boolean;
  pendingRenewal: boolean;
  relatedTransactionCount: number;
  recognizedIncomeAmount: number;
  ownerRealizationLinked: boolean;
};

export type LeaseRevisionDecision = {
  allowed: boolean;
  code: string | null;
  message: string | null;
};

function allow(): LeaseRevisionDecision {
  return { allowed: true, code: null, message: null };
}

function deny(code: string, message: string): LeaseRevisionDecision {
  return { allowed: false, code, message };
}

export function evaluateLeaseRevisionPolicies(facts: LeaseRevisionFacts) {
  let common: LeaseRevisionDecision = allow();
  if (
    !Number.isSafeInteger(facts.relatedTransactionCount) ||
    facts.relatedTransactionCount < 0 ||
    !Number.isSafeInteger(facts.recognizedIncomeAmount) ||
    facts.recognizedIncomeAmount < 0 ||
    typeof facts.physicalCheckInRecorded !== 'boolean' ||
    typeof facts.ownerRealizationLinked !== 'boolean' ||
    typeof facts.scheduledTransfer !== 'boolean' ||
    typeof facts.pendingRenewal !== 'boolean'
  ) {
    common = deny(
      'LEASE_REVISION_FACTS_INVALID',
      'Hubungan data penyewaan belum dapat dipastikan. Perbarui data dan coba kembali; jangan membatalkan atau mengubah jenis hunian sebelum pemeriksaan selesai.',
    );
  } else if (!['awaiting_activation', 'active'].includes(facts.leaseStatus)) {
    common = deny(
      'LEASE_REVISION_STATUS_INVALID',
      'Penyewaan ini tidak lagi berada dalam proses aktif. Tinjau riwayat atau arsip; penyewaan yang sudah selesai tidak boleh diubah menjadi penyewaan baru.',
    );
  } else if (facts.checkoutState && facts.checkoutState !== 'cancelled') {
    common = deny(
      'LEASE_REVISION_CHECKOUT_BLOCKED',
      facts.checkoutState === 'completed'
        ? 'Penyelesaian check-out sudah selesai. Riwayat tetap tersimpan; tinjau penyelesaian keuangan atau buat penyewaan baru bila penghuni kembali.'
        : 'Proses check-out masih berjalan. Selesaikan atau batalkan proses check-out melalui alurnya sebelum mengoreksi atau membatalkan penyewaan.',
    );
  } else if (facts.scheduledTransfer || facts.pendingRenewal) {
    common = deny(
      'LEASE_REVISION_SUCCESSOR_PENDING',
      'Ada rencana pindah kamar atau perpanjangan yang masih berjalan. Tinjau dan batalkan rencana yang keliru sebelum mengubah penyewaan asal.',
    );
  } else if (facts.ownerRealizationLinked) {
    common = deny(
      'LEASE_REVISION_OWNER_REALIZATION_BLOCKED',
      'Penyewaan terkait realisasi Owner yang sudah disiapkan atau diterbitkan. Batalkan realisasi yang belum ditransfer atau tinjau koreksi realisasi; dokumen dan transaksi terbit tetap dipertahankan.',
    );
  }

  const hasFinance = facts.relatedTransactionCount > 0 || facts.recognizedIncomeAmount > 0;
  const financialBlock = deny(
    'LEASE_REVISION_FINANCIAL_REVIEW_REQUIRED',
    'Jenis hunian, sponsor, atau ketentuan biaya belum dapat diubah karena ada riwayat pembayaran atau keuangan. Tinjau pembalikan dan penyelesaian pembayaran terlebih dahulu; transaksi lama tidak akan dihapus oleh koreksi.',
  );
  const incomeBlock = deny(
    'LEASE_REVISION_RECOGNIZED_INCOME_REVIEW_REQUIRED',
    'Ada pendapatan yang sudah tercatat untuk penyewaan ini. Tinjau koreksi pendapatan atau realisasi sebelum mengubah kamar atau membatalkan penyewaan; riwayat keuangan tidak boleh dialihkan diam-diam.',
  );

  return {
    correction: common,
    room_correction: {
      ...(!common.allowed ? common : facts.recognizedIncomeAmount > 0 ? incomeBlock : allow()),
      requires_evidence: facts.physicalCheckInRecorded === true,
      // This corrects the originally recorded room, never a physical transfer.
      recording_error_only: true,
    },
    commercial_mode_change: !common.allowed ? common : hasFinance ? financialBlock : allow(),
    sponsorship_policy_change: !common.allowed ? common : hasFinance ? financialBlock : allow(),
    cancellation: {
      ...(!common.allowed
        ? common
        : facts.physicalCheckInRecorded
          ? deny(
              'LEASE_CANCELLATION_REAL_OCCUPANCY',
              'Kamar sudah pernah dihuni. Gunakan Koreksi Data Penyewaan untuk pencatatan yang salah, atau Check-out bila hunian berakhir. Pembatalan tidak dapat menghapus kejadian hunian nyata.',
            )
          : facts.recognizedIncomeAmount > 0
            ? incomeBlock
            : allow()),
      requires_mistaken_activation_confirmation:
        facts.leaseStatus === 'active' && facts.physicalCheckInRecorded === false,
      financial_resolution_required: hasFinance,
    },
  };
}
