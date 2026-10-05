export type ArchiveFileReference = {
  relationship: string;
  recordCode: string | null;
  propertyId: string | null;
  leaseIds: string[];
  protected: boolean;
  availableEvidenceCount: number;
};

export type ArchiveFileFacts = {
  propertyId: string;
  leaseId: string;
  archiveStatus: string;
  coverageVerified: boolean;
  file: {
    propertyId: string;
    purpose: string;
    sizeBytes: number;
    isDeleted: boolean;
    claimId: string | null;
    duplicatePath: boolean;
  };
  references: ArchiveFileReference[];
};

/** Ownership is a relationship decision, never the uploader, filename or purpose alone. */
export function evaluateArchiveFile(facts: ArchiveFileFacts) {
  const onlyDigitalEvidence = facts.file.isDeleted === false && facts.references.some(
    (reference) => reference.availableEvidenceCount === 1,
  );
  const reject = (code: string, message: string) => ({
    selectable: false, code, message, onlyDigitalEvidence, estimatedBytes: 0,
  });
  if (!['archived', 'superseded'].includes(facts.archiveStatus))
    return reject('LEASE_FILE_PURGE_ARCHIVE_ACTIVE',
      'Penyewaan sudah dipulihkan. Berkas tidak dapat dihapus melalui arsip ini; tinjau penyewaan yang sedang berlaku.');
  if (!facts.coverageVerified)
    return reject('LEASE_FILE_PURGE_COVERAGE_UNVERIFIED',
      'Hubungan berkas belum dapat diperiksa lengkap. Tidak ada berkas yang dapat dihapus; minta Pihak Pengelola memeriksa pembaruan sistem.');
  if (!Number.isSafeInteger(facts.file.sizeBytes) || facts.file.sizeBytes <= 0 || typeof facts.file.isDeleted !== 'boolean')
    return reject('LEASE_FILE_PURGE_FACTS_INVALID',
      'Ukuran berkas belum dapat dipastikan. Berkas tidak dipilih untuk dihapus; perbarui inventaris dan coba kembali.');
  // Legacy metadata removal does not prove that stored bytes were deleted.
  // Only an exclusive, reviewed claim may check and purge those remaining bytes.
  if (facts.file.claimId)
    return reject('LEASE_FILE_PURGE_ALREADY_CLAIMED',
      'Berkas sudah tercatat dalam pengajuan penghapusan. Periksa hasil pengajuan tersebut dan coba ulang berkas yang belum selesai.');
  if (facts.file.propertyId !== facts.propertyId || facts.file.duplicatePath
    || !['payment_proof', 'lease_revision_evidence'].includes(facts.file.purpose))
    return reject('LEASE_FILE_PURGE_PROTECTED',
      'Berkas identitas, foto, tanda tangan, bukti Owner, atau berkas penyimpanan bersama tetap dilindungi dan tidak dihapus dari arsip penyewaan.');
  const protectedReference = facts.references.find(
    (reference) => reference.protected || reference.propertyId !== facts.propertyId,
  );
  if (protectedReference)
    return reject('LEASE_FILE_PURGE_PROTECTED',
      `Berkas dilindungi karena digunakan pada ${protectedReference.relationship}. Tinjau hubungan yang ditampilkan; berkas tidak dihapus.`);
  if (!facts.references.length || facts.references.some((reference) => !reference.leaseIds.length))
    return reject('LEASE_FILE_PURGE_OWNERSHIP_UNVERIFIED',
      'Pemilik hubungan berkas belum dapat dipastikan sebagai penyewaan ini saja. Berkas tidak dihapus; tinjau catatan terkait.');
  if (facts.references.some((reference) => reference.leaseIds.some((id) => id !== facts.leaseId)))
    return reject('LEASE_FILE_PURGE_SHARED',
      'Berkas juga digunakan oleh penyewaan atau transaksi lain. Berkas tidak dihapus; tinjau semua hubungan yang ditampilkan.');
  return { selectable: true, code: null, message: null, onlyDigitalEvidence,
    estimatedBytes: facts.file.sizeBytes };
}
