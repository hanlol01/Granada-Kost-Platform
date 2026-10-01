import type { CheckoutRecordedEvidence } from "./admin-ux-lease-types";

export const CHECKOUT_EVIDENCE_LABELS: Record<string, { stage: number; label: string }> = {
  notice_exception: { stage: 1, label: "Pemberitahuan kurang dari ketentuan" },
  short_notice_waiver: { stage: 2, label: "Penyesuaian kompensasi" },
  keys_access: { stage: 3, label: "Kunci dan akses" },
  inventory: { stage: 3, label: "Inventaris kamar" },
  parking: { stage: 3, label: "Parkir dan kendaraan" },
  utilities: { stage: 3, label: "Pencatatan utilitas" },
  inspection: { stage: 4, label: "Inspeksi kamar" },
  damage: { stage: 5, label: "Kerusakan terdokumentasi" },
  deposit_offset: { stage: 5, label: "Deposit untuk tunggakan sewa" },
  settlement: { stage: 5, label: "Penyelesaian akhir" },
  refund: { stage: 5, label: "Pengembalian dana" },
};

export function checkoutEvidenceGroups(
  evidence: readonly CheckoutRecordedEvidence[],
  stage: number,
) {
  const groups = new Map<
    string,
    {
      entry: CheckoutRecordedEvidence;
      files: NonNullable<CheckoutRecordedEvidence["file"]>[];
      unavailable: boolean;
    }
  >();
  for (const entry of evidence) {
    if (CHECKOUT_EVIDENCE_LABELS[entry.category]?.stage !== stage) continue;
    const key = `${entry.category}|${entry.recordedAt}|${entry.recordedBy}|${JSON.stringify(entry.metadata)}`;
    const group = groups.get(key) ?? { entry, files: [], unavailable: false };
    if (entry.file && !group.files.some((file) => file.id === entry.file!.id))
      group.files.push(entry.file);
    group.unavailable ||= entry.fileUnavailable;
    groups.set(key, group);
  }
  return [...groups.values()];
}
