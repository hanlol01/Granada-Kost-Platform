import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilePreviewModal, type FilePreviewReference } from "@/components/file/FilePreviewModal";
import type { CheckoutCommand } from "@/lib/admin-ux-lease-types";
import { CHECKOUT_EVIDENCE_LABELS, checkoutEvidenceGroups } from "@/lib/checkout-history";
import { formatIDR } from "@/lib/format";

const labels: Record<string, string> = {
  confirmed: "Konfirmasi",
  notes: "Catatan",
  reason: "Alasan",
  missingNoticeDays: "Kekurangan hari pemberitahuan",
  recommendedAmount: "Kompensasi yang disarankan",
  approvedAmount: "Kompensasi disetujui",
  roomStatusAfter: "Hasil inspeksi",
  amount: "Nominal",
  invoiceCreditAmount: "Kredit invoice",
  finalSettlementOffsetAmount: "Deposit dialokasikan",
  documentedDamageAmount: "Kerusakan terdokumentasi",
  depositDeductionAmount: "Kerusakan dipotong dari deposit",
  damageAmountDue: "Kerusakan di luar deposit",
  responsibleParty: "Pihak yang bertanggung jawab",
  fundingParty: "Sumber pembayaran",
  recommendedRefundAmount: "Rekomendasi pengembalian dana",
  finalRefundAmount: "Pengembalian dana final",
  finalRentRefundAmount: "Pengembalian dana sewa",
  finalDepositRefundAmount: "Pengembalian deposit",
  refundAdjustmentAmount: "Penyesuaian pengembalian",
  grossRefundAmount: "Total hak pengembalian",
  grossAmountDue: "Total kewajiban",
  amountDue: "Kewajiban saat ditetapkan",
  paymentMethod: "Metode pembayaran",
  externalReference: "Referensi pembayaran",
  name: "Nama",
  expectedQuantity: "Jumlah awal",
  returnedQuantity: "Jumlah dikembalikan",
  status: "Status",
  condition: "Kondisi",
  utilityType: "Jenis utilitas",
  meterNumber: "Nomor meter",
  checkoutReading: "Angka meter saat keluar",
  unit: "Satuan",
  outstandingUsageNotes: "Catatan pemakaian",
};
const translations: Record<string, string> = {
  returned: "Dikembalikan",
  complete: "Lengkap",
  partial: "Sebagian",
  damaged: "Rusak",
  missing: "Hilang",
  not_applicable: "Tidak berlaku",
  inspection_required: "Menunggu pemeriksaan lanjutan",
  maintenance: "Perlu perbaikan",
  resident: "Penghuni",
  deposit: "Deposit",
  mixed: "Deposit dan pembayaran langsung",
  direct: "Pembayaran langsung",
  bank_transfer: "Transfer bank",
  cash: "Tunai",
  qris: "QRIS",
  ewallet: "Dompet digital",
  other: "Lainnya",
  electricity: "Listrik",
  water: "Air",
  internet: "Internet",
};
const monetary = new Set([
  "amount",
  "recommendedAmount",
  "approvedAmount",
  "invoiceCreditAmount",
  "finalSettlementOffsetAmount",
  "documentedDamageAmount",
  "depositDeductionAmount",
  "damageAmountDue",
  "recommendedRefundAmount",
  "finalRefundAmount",
  "finalRentRefundAmount",
  "finalDepositRefundAmount",
  "refundAdjustmentAmount",
  "grossRefundAmount",
  "grossAmountDue",
  "amountDue",
]);

function date(value: string | null | undefined, time = false) {
  if (!value) return "—";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(parsed);
}

function metadataValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sudah dikonfirmasi" : "Belum dikonfirmasi";
  if (monetary.has(key)) return Number.isFinite(Number(value)) ? formatIDR(Number(value)) : "—";
  if (typeof value === "string") return translations[value] ?? value;
  return typeof value === "number" ? String(value) : "—";
}

function Fields({ fields }: { fields: Array<[string, string | number | null | undefined]> }) {
  return (
    <dl className="grid min-w-0 gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words font-medium text-foreground">
            {value === "" || value === null || value === undefined ? "—" : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function EvidenceMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  const fields = Object.entries(metadata).filter(([key]) => Boolean(labels[key]));
  const items = Array.isArray(metadata.items)
    ? metadata.items
    : Array.isArray(metadata.readings)
      ? metadata.readings
      : [];
  return (
    <div className="space-y-3">
      {fields.length ? (
        <Fields fields={fields.map(([key, value]) => [labels[key], metadataValue(key, value)])} />
      ) : null}
      {items.map((item, index) => {
        if (!item || typeof item !== "object") return null;
        return (
          <div key={index} className="rounded-md border border-border bg-background p-3">
            <p className="mb-2 text-xs font-semibold">Rincian {index + 1}</p>
            <Fields
              fields={Object.entries(item)
                .filter(([key]) => Boolean(labels[key]))
                .map(([key, value]) => [labels[key], metadataValue(key, value)])}
            />
          </div>
        );
      })}
      {metadata.notesPresent === true && !metadata.notes ? (
        <p className="text-xs text-muted-foreground">
          Catatan inspeksi pada data lama belum tersimpan lengkap.
        </p>
      ) : null}
    </div>
  );
}

export function CheckoutRecordedStage({
  command,
  stage,
}: {
  command: CheckoutCommand;
  stage: number;
}) {
  const [preview, setPreview] = useState<FilePreviewReference | null>(null);
  const evidence = checkoutEvidenceGroups(command.history?.evidence ?? [], stage);
  const record = command.history?.stages.find((item) => item.stage === stage);
  const financial = command.history?.financialSummary;
  const finalPayments = stage === 5 ? (command.history?.finalPayments ?? []) : [];
  const fields: Array<[string, string | number | null | undefined]> =
    stage === 1
      ? [
          [
            "Jenis check-out",
            command.exitType === "normal_expiry"
              ? "Akhir masa sewa"
              : "Keluar sebelum masa sewa berakhir",
          ],
          ["Tanggal rencana serah-terima", date(command.effectiveDate)],
          ["Tanggal pemberitahuan", date(command.noticeRecordedDate)],
          [
            "Sumber permintaan",
            (
              {
                resident: "Penghuni",
                parent: "Orang tua",
                admin: "Pengelola",
                other: "Lainnya",
                admin_recorded_resident_request: "Permintaan penghuni dicatat pengelola",
              } as Record<string, string>
            )[command.requestSource ?? ""] ?? "—",
          ],
          ["Alasan check-out", command.noticeReason],
          ["Alasan pengecualian", command.noticeExceptionReason],
          ["Catatan internal", command.internalNote],
        ]
      : stage === 2
        ? command.chargePolicy === "late_checkout_penalty_v1"
          ? [
              ["Hari terakhir masa sewa", date(command.contractLastOccupancyDate)],
              ["Batas keluar tanpa denda", date(command.penaltyFreeUntilDate)],
              ["Masa toleransi", `${command.lateCheckoutGraceDays ?? 0} hari`],
              [
                "Tarif denda per hari",
                formatIDR(Number(command.lateCheckoutDailyPenaltyAmount ?? 0)),
              ],
              ["Batas hari dikenai denda", `${command.lateCheckoutPenaltyDayCap ?? 0} hari`],
            ]
          : [
              [
                "Kompensasi disarankan",
                formatIDR(Number(command.recommendedShortNoticeCharge ?? 0)),
              ],
              ["Kompensasi disetujui", formatIDR(Number(command.approvedShortNoticeCharge ?? 0))],
              ["Alasan penyesuaian", command.shortNoticeWaiverReason],
            ]
        : stage === 3
          ? [
              ["Tanggal serah-terima fisik", date(command.actualCheckoutDate)],
              ["Waktu konfirmasi", date(command.physicalCheckoutConfirmedAt, true)],
            ]
          : stage === 4
            ? [["Hasil inspeksi", translations[command.inspectionRoomStatus ?? ""] ?? "—"]]
            : financial
              ? [
                  ["Pembayaran sewa terverifikasi", formatIDR(financial.verifiedRentPaymentAmount)],
                  ["Kredit invoice sebelumnya", formatIDR(financial.existingInvoiceCreditAmount)],
                  ["Sewa terpakai", formatIDR(financial.earnedRentAmount)],
                  ["Saldo deposit saat penyelesaian", formatIDR(financial.depositLiabilityAmount)],
                  ["Kerusakan dipotong dari deposit", formatIDR(financial.depositDeductionAmount)],
                  ["Deposit untuk tunggakan sewa", formatIDR(financial.depositRentOffsetAmount)],
                  ["Deposit yang dapat dikembalikan", formatIDR(financial.refundableDepositAmount)],
                  ["Alasan penyesuaian pengembalian", financial.refundAdjustmentReason],
                ]
              : [];
  return (
    <section
      className="mt-4 min-w-0 space-y-4 border-t border-border pt-4"
      aria-label={`Riwayat tersimpan tahap ${stage}`}
    >
      {record ? (
        <p className="text-xs text-muted-foreground">
          Dicatat {date(record.recordedAt, true)} · {record.recordedBy || "Pengelola"}
        </p>
      ) : null}
      {fields.length ? <Fields fields={fields} /> : null}
      {evidence.map((group) => (
        <article
          key={group.entry.id}
          className="space-y-3 rounded-lg border border-border bg-muted/15 p-3 sm:p-4"
        >
          <div>
            <h4 className="text-sm font-semibold">
              {CHECKOUT_EVIDENCE_LABELS[group.entry.category].label}
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              {date(group.entry.recordedAt, true)} · {group.entry.recordedBy || "Pengelola"}
            </p>
          </div>
          <EvidenceMetadata metadata={group.entry.metadata} />
          {group.files.length ? (
            <div className="flex flex-wrap gap-2">
              {group.files.map((file) => (
                <Button
                  key={file.id}
                  type="button"
                  variant="success"
                  className="max-w-full min-h-11"
                  title={file.originalFilename}
                  onClick={() =>
                    setPreview({
                      id: file.id,
                      original_filename: file.originalFilename,
                      sanitized_filename: file.sanitizedFilename,
                      mime_type: file.mimeType,
                      file_size_bytes: file.fileSizeBytes,
                    })
                  }
                >
                  <Eye className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">Lihat {file.originalFilename}</span>
                </Button>
              ))}
            </div>
          ) : null}
          {group.unavailable ? (
            <p className="text-xs text-muted-foreground">
              Sebagian bukti tidak lagi tersedia; data pencatatan tetap ditampilkan.
            </p>
          ) : null}
        </article>
      ))}
      {finalPayments.length ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Pembayaran kewajiban akhir</h4>
          {finalPayments.map((payment) => (
            <article
              key={payment.id}
              className="space-y-3 rounded-lg border border-border bg-muted/15 p-3 sm:p-4"
            >
              <Fields
                fields={[
                  ["Kode pembayaran", payment.paymentCode],
                  [
                    "Status",
                    {
                      pending_confirmation: "Menunggu verifikasi",
                      verified: "Terverifikasi",
                      reversed: "Dibatalkan",
                    }[payment.paymentStatus],
                  ],
                  ["Dialokasikan ke tagihan akhir", formatIDR(Number(payment.allocatedAmount))],
                  ["Metode pembayaran", translations[payment.paymentMethod] ?? "Lainnya"],
                  ["Tanggal pembayaran", date(payment.paidAt, true)],
                  ["Tanggal verifikasi", date(payment.verifiedAt, true)],
                ]}
              />
              {payment.evidence.length ? (
                <div className="flex flex-wrap gap-2">
                  {payment.evidence.map((file) => (
                    <Button
                      key={file.id}
                      type="button"
                      variant="success"
                      className="max-w-full min-h-11"
                      title={file.originalFilename}
                      onClick={() =>
                        setPreview({
                          id: file.id,
                          original_filename: file.originalFilename,
                          sanitized_filename: file.sanitizedFilename,
                          mime_type: file.mimeType,
                          file_size_bytes: file.fileSizeBytes,
                        })
                      }
                    >
                      <Eye className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">Lihat {file.originalFilename}</span>
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Tidak ada bukti digital yang tersedia untuk pembayaran ini.
                </p>
              )}
            </article>
          ))}
        </div>
      ) : null}
      {!command.history ? (
        <p className="text-xs text-muted-foreground">
          Rincian riwayat belum dimuat. Muat ulang setelah layanan diperbarui.
        </p>
      ) : null}
      <FilePreviewModal file={preview} onClose={() => setPreview(null)} />
    </section>
  );
}
