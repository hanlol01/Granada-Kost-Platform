import {
  CalendarRange,
  CheckCircle2,
  History,
  PencilLine,
  RotateCcw,
  Save,
  Search,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
import { Input } from "@/components/ui/input";
import { NoticeAlert } from "@/components/ui/notice-alert";
import { Textarea } from "@/components/ui/textarea";
import type { ResidentTenancy } from "@/lib/admin-resident";
import { adminUxLeaseApi, type LeaseDataCorrectionInput } from "@/lib/admin-ux-lease-api";
import type {
  LeaseDataCorrectionPreview,
  LeaseDataCorrectionRecord,
  LeaseDataCorrectionSnapshot,
} from "@/lib/admin-ux-lease-types";
import { newIdempotencyKey } from "@/lib/idempotency";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenancy: ResidentTenancy;
  onCompleted: () => Promise<unknown> | unknown;
};

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

function todayInJakarta() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dateLabel(value: string | null) {
  if (!value) return "Belum tercatat";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Koreksi belum dapat diproses. Periksa data lalu coba kembali.";
}

function SnapshotColumn({
  title,
  snapshot,
  tone,
}: {
  title: string;
  snapshot: LeaseDataCorrectionSnapshot;
  tone: "previous" | "corrected";
}) {
  const rows = [
    ["Tanggal mulai", dateLabel(snapshot.startDate)],
    ["Tanggal check-in", dateLabel(snapshot.checkedInDate)],
    ["Tanggal berakhir", dateLabel(snapshot.endDate)],
    ["Durasi", `${snapshot.termMonths} bulan`],
    ["Tarif bulanan", rupiah(snapshot.agreedMonthlyPrice)],
    ["Nilai kontrak", rupiah(snapshot.contractRentAmount)],
    [
      "Sumber tarif",
      snapshot.pricingSource === "owner_sponsored"
        ? "Hunian Tanggungan Owner"
        : snapshot.pricingSource === "negotiated"
          ? "Kesepakatan khusus"
          : "Tarif standar",
    ],
  ];
  return (
    <section
      className={cn(
        "rounded-xl border p-4",
        tone === "corrected" ? "border-success/35 bg-success/8" : "border-border bg-muted/35",
      )}
      aria-label={title}
    >
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {tone === "corrected" ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <History className="h-4 w-4 text-muted-foreground" />
        )}
        {title}
      </h3>
      <dl className="space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-start justify-between gap-4 border-b border-border/55 pb-2 last:border-0 last:pb-0"
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function LeaseDataCorrectionDialog({ open, onOpenChange, tenancy, onCompleted }: Props) {
  const isOwnerSponsored = tenancy.commercialMode === "owner_sponsored";
  const [startDate, setStartDate] = useState(tenancy.startDate);
  const [termMonths, setTermMonths] = useState(tenancy.termMonths);
  const [checkedInDate, setCheckedInDate] = useState(
    tenancy.checkedInAt ? tenancy.checkedInAt.slice(0, 10) : "",
  );
  const [pricingSource, setPricingSource] = useState<"standard" | "negotiated">(
    tenancy.pricingSource === "owner_sponsored" ? "standard" : tenancy.pricingSource,
  );
  const [agreedMonthlyPrice, setAgreedMonthlyPrice] = useState(tenancy.agreedMonthlyPrice);
  const [pricingReason, setPricingReason] = useState("");
  const [pricingVarianceAcknowledged, setPricingVarianceAcknowledged] = useState(false);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<LeaseDataCorrectionPreview | null>(null);
  const [history, setHistory] = useState<LeaseDataCorrectionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const periodChanged = startDate !== tenancy.startDate || termMonths !== tenancy.termMonths;

  useEffect(() => {
    if (!open) return;
    setStartDate(tenancy.startDate);
    setTermMonths(tenancy.termMonths);
    setCheckedInDate(tenancy.checkedInAt ? tenancy.checkedInAt.slice(0, 10) : "");
    setPricingSource(
      tenancy.pricingSource === "owner_sponsored" ? "standard" : tenancy.pricingSource,
    );
    setAgreedMonthlyPrice(tenancy.agreedMonthlyPrice);
    setPricingReason("");
    setPricingVarianceAcknowledged(false);
    setReason("");
    setPreview(null);
    setError(null);
    setConfirming(false);
    void adminUxLeaseApi.leases
      .listDataCorrections(tenancy.leaseId)
      .then(({ corrections }) => setHistory(corrections))
      .catch(() => setHistory([]));
  }, [open, tenancy]);

  useEffect(() => {
    if (!error) return;
    const frame = window.requestAnimationFrame(() => {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      errorRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [error]);

  const input = (): LeaseDataCorrectionInput & { reason: string } => ({
    startDate,
    termMonths,
    checkedInDate: tenancy.checkedInAt ? checkedInDate : undefined,
    pricingSource: periodChanged && !isOwnerSponsored ? pricingSource : undefined,
    agreedMonthlyPrice:
      periodChanged && !isOwnerSponsored && pricingSource === "negotiated"
        ? agreedMonthlyPrice
        : undefined,
    pricingAgreementReason:
      periodChanged && !isOwnerSponsored && pricingSource === "negotiated"
        ? pricingReason
        : undefined,
    pricingVarianceAcknowledged:
      periodChanged && !isOwnerSponsored && pricingSource === "negotiated"
        ? pricingVarianceAcknowledged
        : undefined,
    reason,
  });

  const validate = () => {
    if (!startDate) return "Tanggal mulai kontrak wajib diisi.";
    if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 120)
      return "Durasi sewa harus antara 1 sampai 120 bulan.";
    if (tenancy.checkedInAt && !checkedInDate) return "Tanggal check-in wajib diisi.";
    if (
      !isOwnerSponsored &&
      periodChanged &&
      pricingSource === "negotiated" &&
      agreedMonthlyPrice < 1
    )
      return "Tarif bulanan kesepakatan wajib diisi.";
    if (
      !isOwnerSponsored &&
      periodChanged &&
      pricingSource === "negotiated" &&
      pricingReason.trim().length < 3
    )
      return "Catatan kesepakatan tarif wajib diisi minimal 3 karakter.";
    if (
      !isOwnerSponsored &&
      periodChanged &&
      pricingSource === "negotiated" &&
      !pricingVarianceAcknowledged
    )
      return "Konfirmasi pemeriksaan selisih tarif wajib dipilih.";
    if (reason.trim().length < 3) return "Alasan koreksi wajib diisi minimal 3 karakter.";
    return null;
  };

  const handlePreview = async () => {
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    setPending(true);
    setError(null);
    setConfirming(false);
    try {
      setPreview(await adminUxLeaseApi.leases.previewDataCorrection(tenancy.leaseId, input()));
    } catch (cause) {
      setPreview(null);
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };

  const handleCommit = async () => {
    if (!preview) return;
    setPending(true);
    setError(null);
    try {
      await adminUxLeaseApi.leases.commitDataCorrection(
        tenancy.leaseId,
        input(),
        newIdempotencyKey(),
      );
      await onCompleted();
      onOpenChange(false);
    } catch (cause) {
      setConfirming(false);
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };

  const invalidatePreview = () => {
    setPreview(null);
    setConfirming(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-5xl overflow-y-auto p-0 [&>button]:text-destructive [&>button]:hover:bg-destructive/10">
        <DialogHeader className="border-b bg-muted/25 px-6 py-5 pr-12">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <CalendarRange className="h-5 w-5 text-primary" /> Koreksi data penyewaan
          </DialogTitle>
          <DialogDescription className="max-w-3xl leading-6">
            Perbaiki kesalahan pencatatan tanpa menghapus riwayat kontrak, pembayaran, atau dokumen
            yang sudah terbit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 pb-2">
          {error ? (
            <div ref={errorRef} tabIndex={-1} className="outline-none">
              <NoticeAlert
                tone="destructive"
                attention="subtle"
                title="Koreksi belum dapat diproses"
                description={error}
              />
            </div>
          ) : null}

          <NoticeAlert
            tone="warning"
            title="Perubahan ini dicatat sebagai koreksi resmi"
            description="Nilai lama tetap berada di riwayat. Sistem akan menghitung ulang tanggal akhir, nilai kontrak, sisa kewajiban, atau kredit kontrak sebelum Admin menyimpan perubahan."
          />

          <section className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="mb-4">
              <h3 className="font-semibold">Data yang perlu diperbaiki</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Ubah hanya data yang salah, lalu periksa hasil perhitungannya.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <HeroUiDatePicker
                id="lease-correction-start-date"
                label="Tanggal mulai kontrak"
                value={startDate}
                onChange={(value) => {
                  setStartDate(value ?? "");
                  invalidatePreview();
                }}
                required
              />
              <div className="space-y-2">
                <label htmlFor="lease-correction-term" className="text-sm font-medium">
                  Durasi sewa (bulan) <span className="text-destructive">*</span>
                </label>
                <Input
                  id="lease-correction-term"
                  type="number"
                  min={1}
                  max={120}
                  value={termMonths}
                  onChange={(event) => {
                    setTermMonths(Number(event.target.value));
                    invalidatePreview();
                  }}
                  className="min-h-11"
                />
              </div>
              {tenancy.checkedInAt ? (
                <HeroUiDatePicker
                  id="lease-correction-check-in-date"
                  label="Tanggal check-in aktual"
                  value={checkedInDate}
                  maxDate={todayInJakarta()}
                  onChange={(value) => {
                    setCheckedInDate(value ?? "");
                    invalidatePreview();
                  }}
                  description={
                    tenancy.checkedInSource === "history" || tenancy.checkedInSource === "occupancy"
                      ? "Saat ini dibaca dari catatan historis."
                      : undefined
                  }
                  required
                />
              ) : (
                <div className="rounded-lg border border-info/35 bg-info/8 p-3 text-sm">
                  <p className="font-medium text-info">Belum check-in</p>
                  <p className="mt-1 text-muted-foreground">
                    Tanggal check-in dicatat melalui alur aktivasi atau konfirmasi check-in.
                  </p>
                </div>
              )}
            </div>
          </section>

          {periodChanged && !isOwnerSponsored ? (
            <section className="rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
              <h3 className="font-semibold">Tarif setelah koreksi periode</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Pilih sumber tarif secara jelas agar harga tidak berubah tanpa keputusan Admin.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="info"
                  className={cn(
                    "min-h-11 border-primary",
                    pricingSource === "standard" &&
                      "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                  onClick={() => {
                    setPricingSource("standard");
                    setPricingVarianceAcknowledged(false);
                    invalidatePreview();
                  }}
                >
                  Tarif standar
                </Button>
                <Button
                  type="button"
                  variant="warning"
                  className={cn(
                    "min-h-11 border-warning",
                    pricingSource === "negotiated" &&
                      "bg-warning text-warning-foreground hover:bg-warning/90",
                  )}
                  onClick={() => {
                    setPricingSource("negotiated");
                    invalidatePreview();
                  }}
                >
                  Tarif kesepakatan khusus
                </Button>
              </div>
              {pricingSource === "negotiated" ? (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-[minmax(16rem,22rem)_1fr]">
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="lease-correction-rate">
                        Tarif bulanan yang disepakati <span className="text-destructive">*</span>
                      </label>
                      <CurrencyInput
                        id="lease-correction-rate"
                        value={agreedMonthlyPrice}
                        onValueChange={(value) => {
                          setAgreedMonthlyPrice(value);
                          invalidatePreview();
                        }}
                        formatOnChange
                        onClear={() => invalidatePreview()}
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="lease-correction-pricing-reason"
                      >
                        Catatan kesepakatan <span className="text-destructive">*</span>
                      </label>
                      <Textarea
                        id="lease-correction-pricing-reason"
                        value={pricingReason}
                        onChange={(event) => {
                          setPricingReason(event.target.value);
                          invalidatePreview();
                        }}
                        className="min-h-24 resize-y"
                        placeholder="Contoh: Tarif disepakati ulang karena durasi berubah menjadi 11 bulan."
                      />
                    </div>
                  </div>
                  <label
                    htmlFor="lease-correction-pricing-acknowledgement"
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-warning/35 bg-warning/8 p-3 text-sm"
                  >
                    <Checkbox
                      id="lease-correction-pricing-acknowledgement"
                      checked={pricingVarianceAcknowledged}
                      onCheckedChange={(checked) => {
                        setPricingVarianceAcknowledged(checked === true);
                        invalidatePreview();
                      }}
                      className="mt-0.5"
                    />
                    <span className="leading-5 text-foreground">
                      Saya sudah memeriksa selisih tarif dan memastikan nominal kesepakatan ini
                      benar. <span className="text-destructive">*</span>
                    </span>
                  </label>
                </div>
              ) : null}
            </section>
          ) : null}
          {periodChanged && isOwnerSponsored ? (
            <section className="rounded-xl border border-success/35 bg-success/8 p-4 text-sm">
              <h3 className="font-semibold text-success">Hunian Tanggungan Owner</h3>
              <p className="mt-1 leading-6 text-muted-foreground">
                Durasi akan diperbarui tanpa membentuk tagihan sewa. Proyeksi biaya pengelolaan
                dihitung kembali sesuai periode yang dikoreksi.
              </p>
            </section>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="lease-correction-reason">
              Alasan koreksi <span className="text-destructive">*</span>
            </label>
            <Textarea
              id="lease-correction-reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                invalidatePreview();
              }}
              className="min-h-24 resize-y"
              placeholder="Contoh: Tanggal mulai kontrak salah dicatat saat migrasi data lama."
            />
            <p className="text-xs text-muted-foreground">
              Alasan dan identitas Admin disimpan dalam riwayat audit.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="info"
              className="min-h-11"
              disabled={pending}
              onClick={() => void handlePreview()}
            >
              <Search className="h-4 w-4" />{" "}
              {pending && !preview ? "Menghitung..." : "Tinjau dampak koreksi"}
            </Button>
            {preview ? (
              <Button
                type="button"
                variant="warning"
                className="min-h-11"
                disabled={pending}
                onClick={() => {
                  setPreview(null);
                  setConfirming(false);
                }}
              >
                <RotateCcw className="h-4 w-4" /> Ubah data koreksi
              </Button>
            ) : null}
          </div>

          {preview ? (
            <section
              className="space-y-4 border-t pt-5"
              aria-labelledby="lease-correction-preview-title"
            >
              <div>
                <h3 id="lease-correction-preview-title" className="text-base font-semibold">
                  Perbandingan sebelum dan sesudah
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pastikan seluruh tanggal dan angka berikut sesuai sebelum disimpan.
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <SnapshotColumn
                  title="Data sebelumnya"
                  snapshot={preview.previous}
                  tone="previous"
                />
                <SnapshotColumn
                  title="Hasil koreksi"
                  snapshot={preview.corrected}
                  tone="corrected"
                />
              </div>
              <div className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Pembayaran sewa terverifikasi</p>
                  <p className="mt-1 font-semibold">
                    {rupiah(preview.impact.verifiedRentPaymentAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sisa kewajiban setelah koreksi</p>
                  <p className="mt-1 font-semibold text-warning">
                    {rupiah(preview.impact.outstandingAmountAfter)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Kredit setelah koreksi</p>
                  <p className="mt-1 font-semibold text-success">
                    {rupiah(preview.impact.overpaymentAmountAfter)}
                  </p>
                </div>
              </div>
              {preview.impact.contractAmountDelta !== 0 ? (
                <NoticeAlert
                  tone={preview.impact.contractAmountDelta > 0 ? "warning" : "info"}
                  title={
                    preview.impact.contractAmountDelta > 0
                      ? "Nilai kontrak bertambah"
                      : "Nilai kontrak berkurang"
                  }
                  description={
                    preview.impact.contractAmountDelta > 0
                      ? `Tambahan kewajiban sebesar ${rupiah(preview.impact.additionalChargeAmount)} akan dicatat tanpa menghapus pembayaran lama.`
                      : `Kredit kontrak sebesar ${rupiah(preview.impact.contractCreditAmount)} akan dicatat sebagai dasar saldo kredit atau pengembalian dana.`
                  }
                />
              ) : null}
              {!confirming ? (
                <Button
                  type="button"
                  variant="success"
                  className="min-h-11"
                  onClick={() => setConfirming(true)}
                  disabled={pending}
                >
                  <PencilLine className="h-4 w-4" /> Lanjutkan penyimpanan koreksi
                </Button>
              ) : (
                <NoticeAlert
                  tone="warning"
                  title="Simpan koreksi resmi?"
                  description="Data efektif penyewaan, perhitungan tagihan, dan riwayat audit akan diperbarui. Data lama tetap tersimpan sebagai versi sebelumnya."
                  action={
                    <>
                      <Button
                        type="button"
                        variant="success"
                        className="min-h-11"
                        disabled={pending}
                        onClick={() => void handleCommit()}
                      >
                        <Save className="h-4 w-4" />{" "}
                        {pending ? "Menyimpan..." : "Ya, simpan koreksi"}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        className="min-h-11"
                        disabled={pending}
                        onClick={() => setConfirming(false)}
                      >
                        <XCircle className="h-4 w-4" /> Batal menyimpan
                      </Button>
                    </>
                  }
                />
              )}
            </section>
          ) : null}

          {history.length ? (
            <details className="rounded-xl border bg-muted/20 p-4">
              <summary className="cursor-pointer font-medium text-primary">
                Riwayat koreksi ({history.length})
              </summary>
              <div className="mt-3 space-y-3">
                {history.map((item) => (
                  <div key={item.id} className="rounded-lg border bg-card p-3 text-sm">
                    <p className="font-medium">
                      Koreksi #{item.sequenceNumber} · {dateLabel(item.corrected.startDate)}
                    </p>
                    <p className="mt-1 text-muted-foreground">{item.reason}</p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>

        <DialogFooter className="sticky bottom-0 border-t bg-background/95 px-6 py-4 backdrop-blur">
          <Button
            type="button"
            variant="destructive"
            className="min-h-11"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            <XCircle className="h-4 w-4" /> Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
