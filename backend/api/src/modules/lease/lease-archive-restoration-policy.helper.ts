/** Direct restore never revives real occupancy, money or a claim reused elsewhere. */
export type LeaseArchiveRestorationFacts = {
  archiveStatus: string;
  leaseStatus: string;
  physicalCheckInRecorded: boolean;
  relatedTransactionCount: number;
  paymentProofCount: number;
  recognizedIncomeAmount: number;
  ownerRealizationLinked: boolean;
  roomAvailable: boolean;
  residentAvailable: boolean;
  periodValid: boolean;
  bindingsRestorable: boolean;
  commercialTermsValid: boolean;
  sponsorshipValid: boolean;
  filePurgeUnresolved: boolean;
};
export function evaluateLeaseArchiveRestoration(facts: LeaseArchiveRestorationFacts) {
  const decision = (code: string, message: string) => ({
    allowed: false, code, message, recommendedAction: 'linked_successor' as const,
  });
  if (![facts.relatedTransactionCount, facts.paymentProofCount, facts.recognizedIncomeAmount]
      .every((value) => Number.isSafeInteger(value) && value >= 0) ||
      [facts.physicalCheckInRecorded, facts.ownerRealizationLinked, facts.roomAvailable,
        facts.residentAvailable, facts.periodValid, facts.bindingsRestorable,
        facts.commercialTermsValid, facts.sponsorshipValid, facts.filePurgeUnresolved].some((value) => typeof value !== 'boolean'))
    return { ...decision('LEASE_ARCHIVE_RESTORE_FACTS_INVALID',
      'Hubungan arsip belum dapat dipastikan. Perbarui data dan tinjau riwayat; jangan pulihkan atau membuat pengganti sebelum pemeriksaan selesai.'), recommendedAction: 'review_records' as const };
  if (facts.archiveStatus !== 'archived' || facts.leaseStatus !== 'cancelled')
    return { ...decision('LEASE_ARCHIVE_RESTORE_STATUS_INVALID',
      'Arsip sudah dipulihkan atau telah memiliki penyewaan pengganti. Buka riwayat penyewaan yang masih berlaku; arsip ini tidak dipulihkan lagi.'), recommendedAction: 'review_records' as const };
  if (facts.filePurgeUnresolved)
    return { ...decision('LEASE_ARCHIVE_RESTORE_FILE_PURGE_UNRESOLVED',
      'Penghapusan berkas arsip masih belum selesai atau belum dapat dipastikan. Coba ulang pemeriksaan berkas yang tertunda melalui arsip sebelum memulihkan penyewaan; berkas yang sudah dihapus tidak dapat dikembalikan.'), recommendedAction: 'review_records' as const };
  if (facts.physicalCheckInRecorded || facts.ownerRealizationLinked || facts.recognizedIncomeAmount > 0)
    return { ...decision('LEASE_ARCHIVE_RESTORE_HISTORY_PROTECTED',
      'Arsip terkait hunian nyata, pendapatan atau realisasi Owner. Riwayat tidak dapat dihidupkan ulang. Tinjau koreksi atau penyelesaian terkait sebelum membuat penyewaan pengganti.'), recommendedAction: 'review_records' as const };
  if (facts.relatedTransactionCount > 0 || facts.paymentProofCount > 0)
    return decision('LEASE_ARCHIVE_RESTORE_FINANCIAL_HISTORY',
      'Arsip memiliki riwayat pembayaran atau bukti tagihan. Transaksi lama tidak dihidupkan ulang. Buat penyewaan pengganti yang terhubung ke arsip dan tinjau keuangan lama secara terpisah.');
  if (!facts.roomAvailable)
    return decision('LEASE_ARCHIVE_RESTORE_ROOM_CONFLICT',
      'Kamar asal sudah digunakan, dipesan atau belum siap. Arsip tetap aman; pilih kamar yang tersedia melalui penyewaan pengganti.');
  if (!facts.residentAvailable)
    return decision('LEASE_ARCHIVE_RESTORE_RESIDENT_CONFLICT',
      'Penghuni memiliki penyewaan atau proses hunian lain. Buka penyewaan yang masih berlaku; jangan membuat dua penyewaan aktif untuk penghuni yang sama.');
  if (!facts.periodValid)
    return decision('LEASE_ARCHIVE_RESTORE_PERIOD_INVALID',
      'Periode lama sudah berakhir atau tidak sesuai catatan check-in. Siapkan periode yang benar melalui penyewaan pengganti; tanggal check-in lama tidak dibuat ulang.');
  if (!facts.bindingsRestorable)
    return decision('LEASE_ARCHIVE_RESTORE_BINDINGS_CHANGED',
      'Hubungan komitmen, pemesanan atau aktivasi lama tidak dapat dipulihkan secara aman. Buat penyewaan pengganti yang terhubung ke arsip; pemesanan lama tetap menjadi riwayat.');
  if (!facts.commercialTermsValid || !facts.sponsorshipValid)
    return decision('LEASE_ARCHIVE_RESTORE_COMMERCIAL_REVIEW_REQUIRED',
      'Tarif, jenis hunian atau kepemilikan Owner berubah dari catatan arsip. Tinjau ulang ketentuan pada penyewaan pengganti; ketentuan lama tidak dipaksakan ke kamar saat ini.');
  return { allowed: true, code: null, message: null, recommendedAction: 'direct_restore' as const };
}
