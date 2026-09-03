import { useEffect, useRef, useState } from "react";
import type { FileResponse } from "@granada-kost/domain";
import {
  AlertCircle,
  CalendarCheck2,
  CheckCircle2,
  Download,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { EvidenceFileUploadField } from "@/components/file/EvidenceFileUploadField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { adminUxLeaseApi, downloadLeaseExitDocument } from "@/lib/admin-ux-lease-api";
import type { CheckoutCommand, CheckoutSettlementQuote } from "@/lib/admin-ux-lease-types";
import { jakartaToday } from "@/lib/admin-ux-lease-helpers";
import { newIdempotencyKey } from "@/lib/idempotency";

type Props = { leaseId: string; onClose: () => void };
type HandoverConfirmation = { keyAccess: boolean; inventory: boolean; parking: boolean };
type InventoryDraft = {
  key: number;
  name: string;
  expectedQuantity: string;
  returnedQuantity: string;
  condition: "complete" | "partial" | "damaged" | "missing" | "not_applicable";
  notes: string;
};
type AccessDraft = {
  key: number;
  name: string;
  expectedQuantity: string;
  returnedQuantity: string;
  status: "returned" | "partial" | "damaged" | "missing" | "not_applicable";
  notes: string;
};
type UtilityDraft = {
  key: number;
  utilityType: string;
  meterNumber: string;
  checkoutReading: string;
  unit: string;
  outstandingUsageNotes: string;
};
type DamageDraft = {
  key: number;
  amount: string;
  reason: string;
  evidence: FileResponse[];
  busy: boolean;
};

const openCheckout = (commands: CheckoutCommand[]) =>
  commands.find((item) => item.state !== "cancelled") ?? null;

const inventoryDraft = (key: number): InventoryDraft => ({
  key,
  name: "",
  expectedQuantity: "1",
  returnedQuantity: "1",
  condition: "complete",
  notes: "",
});

const accessDraft = (key: number): AccessDraft => ({
  key,
  name: "",
  expectedQuantity: "1",
  returnedQuantity: "1",
  status: "returned",
  notes: "",
});

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Checkout tidak dapat diproses. Coba lagi.";
}

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

/** W07D command UI. It never invokes compatibility close/refund endpoints. */
export function CheckoutPanel({ leaseId, onClose }: Props) {
  const [command, setCommand] = useState<CheckoutCommand | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(jakartaToday());
  const [exitType, setExitType] = useState<"resident_early_termination" | "normal_expiry">(
    "resident_early_termination",
  );
  const [reason, setReason] = useState("");
  const [approvedShortNoticeCharge, setApprovedShortNoticeCharge] = useState("0");
  const [waiverReason, setWaiverReason] = useState("");
  const [roomResult, setRoomResult] = useState<"inspection_required" | "maintenance">(
    "inspection_required",
  );
  const [handover, setHandover] = useState<HandoverConfirmation>({
    keyAccess: false,
    inventory: false,
    parking: false,
  });
  const [inventoryItems, setInventoryItems] = useState<InventoryDraft[]>([inventoryDraft(1)]);
  const [accessItems, setAccessItems] = useState<AccessDraft[]>([accessDraft(2)]);
  const [utilityReadings, setUtilityReadings] = useState<UtilityDraft[]>([]);
  const [nextHandoverKey, setNextHandoverKey] = useState(3);
  const [notes, setNotes] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [damages, setDamages] = useState<DamageDraft[]>([]);
  const [nextDamageKey, setNextDamageKey] = useState(1);
  const [depositOffsetAmount, setDepositOffsetAmount] = useState("0");
  const [depositOffsetReason, setDepositOffsetReason] = useState("");
  const [depositOffsetEvidence, setDepositOffsetEvidence] = useState<FileResponse[]>([]);
  const [depositOffsetEvidenceBusy, setDepositOffsetEvidenceBusy] = useState(false);
  const [settlementQuote, setSettlementQuote] = useState<CheckoutSettlementQuote | null>(null);
  const [finalRefundAmount, setFinalRefundAmount] = useState("0");
  const [refundAdjustmentReason, setRefundAdjustmentReason] = useState("");
  const [refundAdjustmentEvidence, setRefundAdjustmentEvidence] = useState<FileResponse[]>([]);
  const [refundAdjustmentEvidenceBusy, setRefundAdjustmentEvidenceBusy] = useState(false);
  const [refundMethod, setRefundMethod] = useState<
    "cash" | "bank_transfer" | "qris" | "ewallet" | "other"
  >("bank_transfer");
  const [refundReference, setRefundReference] = useState("");
  const [refundEvidence, setRefundEvidence] = useState<FileResponse[]>([]);
  const [refundEvidenceBusy, setRefundEvidenceBusy] = useState(false);
  const [refundNotes, setRefundNotes] = useState("");
  const [refundWaiverReason, setRefundWaiverReason] = useState("");
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intentKey = useRef<string | null>(null);
  const key = () => (intentKey.current ??= newIdempotencyKey());

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    void adminUxLeaseApi.checkout
      .list(leaseId)
      .then(({ commands }) => {
        if (current) {
          const open = openCheckout(commands);
          setCommand(open);
          setApprovedShortNoticeCharge(String(open?.recommendedShortNoticeCharge ?? 0));
          if (open?.inspectionRoomStatus) setRoomResult(open.inspectionRoomStatus);
        }
      })
      .catch((loadError: unknown) => {
        if (current) setError(messageFrom(loadError));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [leaseId]);

  const perform = async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
      intentKey.current = null;
    } catch (actionError) {
      setError(messageFrom(actionError));
    } finally {
      setPending(false);
    }
  };

  const submitNotice = () =>
    perform(async () => {
      const result = await adminUxLeaseApi.checkout.notice(
        leaseId,
        { exitType, effectiveDate, reason },
        key(),
      );
      setCommand(result.checkout);
      setApprovedShortNoticeCharge(String(result.checkout.recommendedShortNoticeCharge ?? 0));
    });

  const damageInput = () =>
    damages.map((item) => ({
      amount: Number(item.amount),
      reason: item.reason.trim(),
      evidenceFileIds: item.evidence.map((file) => file.id),
    }));

  const settlementInput = (includeFinalDecision: boolean) => ({
    roomStatusAfter: roomResult,
    damageDeductions: damageInput(),
    depositRentOffsetAmount: Number(depositOffsetAmount || 0),
    depositRentOffsetReason: depositOffsetReason.trim() || undefined,
    depositRentOffsetEvidenceFileIds: depositOffsetEvidence.map((file) => file.id),
    finalRefundAmount: includeFinalDecision ? Number(finalRefundAmount || 0) : undefined,
    refundAdjustmentReason: includeFinalDecision
      ? refundAdjustmentReason.trim() || undefined
      : undefined,
    refundAdjustmentEvidenceFileIds: includeFinalDecision
      ? refundAdjustmentEvidence.map((file) => file.id)
      : undefined,
  });

  const previewSettlement = () => {
    if (!command) return;
    return perform(async () => {
      const result = await adminUxLeaseApi.checkout.previewSettlement(
        leaseId,
        command.id,
        settlementInput(false),
      );
      setSettlementQuote(result.quote);
      setFinalRefundAmount(String(result.quote.recommendedRefundAmount));
      setRefundAdjustmentReason("");
      setRefundAdjustmentEvidence([]);
    });
  };

  const completeSettlement = () => {
    if (!command) return;
    return perform(async () => {
      await adminUxLeaseApi.checkout.complete(leaseId, command.id, settlementInput(true), key());
      const refreshed = await adminUxLeaseApi.checkout.list(leaseId);
      setCommand(openCheckout(refreshed.commands));
    });
  };

  const settleExitRefund = () => {
    if (!command?.exitRefundId || refundEvidence.length === 0) return;
    return perform(async () => {
      await adminUxLeaseApi.checkout.settleRefund(
        leaseId,
        command.id,
        command.exitRefundId!,
        {
          paymentMethod: refundMethod,
          externalReference: refundReference,
          evidenceFileIds: refundEvidence.map((file) => file.id),
          notes: refundNotes || undefined,
        },
        key(),
      );
      const refreshed = await adminUxLeaseApi.checkout.list(leaseId);
      setCommand(openCheckout(refreshed.commands));
    });
  };

  const waiveExitRefund = () => {
    if (!command?.exitRefundId) return;
    return perform(async () => {
      await adminUxLeaseApi.checkout.waiveRefund(
        leaseId,
        command.id,
        command.exitRefundId!,
        refundWaiverReason,
        key(),
      );
      const refreshed = await adminUxLeaseApi.checkout.list(leaseId);
      setCommand(openCheckout(refreshed.commands));
    });
  };

  const downloadDocument = async (document: NonNullable<CheckoutCommand["documents"]>[number]) => {
    if (!command) return;
    setDownloadingDocumentId(document.id);
    setError(null);
    try {
      await downloadLeaseExitDocument(leaseId, command.id, document.id, document.documentCode);
    } catch (downloadError) {
      setError(messageFrom(downloadError));
    } finally {
      setDownloadingDocumentId(null);
    }
  };

  const advance = () => {
    if (!command) return;
    return perform(async () => {
      if (command.state === "notice_received") {
        setCommand(
          (
            await adminUxLeaseApi.checkout.schedule(
              leaseId,
              command.id,
              {
                approvedShortNoticeCharge: Number(approvedShortNoticeCharge),
                shortNoticeWaiverReason: waiverReason || undefined,
              },
              key(),
            )
          ).checkout,
        );
      } else if (command.state === "scheduled") {
        setCommand(
          (
            await adminUxLeaseApi.checkout.handover(
              leaseId,
              command.id,
              {
                keyAccessConfirmed: handover.keyAccess,
                inventoryConfirmed: handover.inventory,
                parkingConfirmed: handover.parking,
                inventoryItems: inventoryItems.map((item) => ({
                  name: item.name,
                  expectedQuantity: Number(item.expectedQuantity),
                  returnedQuantity: Number(item.returnedQuantity),
                  condition: item.condition,
                  notes: item.notes || undefined,
                })),
                keyAccessItems: accessItems.map((item) => ({
                  name: item.name,
                  expectedQuantity: Number(item.expectedQuantity),
                  returnedQuantity: Number(item.returnedQuantity),
                  status: item.status,
                  notes: item.notes || undefined,
                })),
                utilityReadings: utilityReadings.map((reading) => ({
                  utilityType: reading.utilityType,
                  meterNumber: reading.meterNumber || undefined,
                  checkoutReading: reading.checkoutReading,
                  unit: reading.unit,
                  outstandingUsageNotes: reading.outstandingUsageNotes || undefined,
                })),
                notes: notes || undefined,
              },
              key(),
            )
          ).checkout,
        );
      } else if (command.state === "inspection_required") {
        setCommand(
          (
            await adminUxLeaseApi.checkout.inspection(
              leaseId,
              command.id,
              { roomStatusAfter: roomResult, notes: notes || undefined },
              key(),
            )
          ).checkout,
        );
      }
    });
  };

  const cancel = () => {
    if (!command) return;
    return perform(async () => {
      await adminUxLeaseApi.checkout.cancel(leaseId, command.id, cancellationReason, key());
      setCommand(null);
    });
  };

  const invalidQuantity = (expected: string, returned: string) => {
    const expectedNumber = Number(expected);
    const returnedNumber = Number(returned);
    return (
      !Number.isSafeInteger(expectedNumber) ||
      !Number.isSafeInteger(returnedNumber) ||
      expectedNumber < 0 ||
      returnedNumber < 0 ||
      returnedNumber > expectedNumber
    );
  };
  const handoverDetailInvalid =
    inventoryItems.length === 0 ||
    accessItems.length === 0 ||
    inventoryItems.some(
      (item) => !item.name.trim() || invalidQuantity(item.expectedQuantity, item.returnedQuantity),
    ) ||
    accessItems.some(
      (item) => !item.name.trim() || invalidQuantity(item.expectedQuantity, item.returnedQuantity),
    ) ||
    utilityReadings.some(
      (reading) =>
        !reading.utilityType.trim() || !reading.checkoutReading.trim() || !reading.unit.trim(),
    );
  const canRecordHandover =
    handover.keyAccess && handover.inventory && handover.parking && !handoverDetailInvalid;
  const recommendedCharge = Number(command?.recommendedShortNoticeCharge ?? 0);
  const approvedCharge = Number(approvedShortNoticeCharge);
  const approvalInvalid =
    !Number.isSafeInteger(approvedCharge) ||
    approvedCharge < 0 ||
    approvedCharge > recommendedCharge ||
    (approvedCharge < recommendedCharge && waiverReason.trim().length < 3);
  const damageInvalid = damages.some((item) => {
    const amount = Number(item.amount);
    return (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      !item.reason.trim() ||
      item.evidence.length === 0
    );
  });
  const damageUploadBusy = damages.some((item) => item.busy);
  const offsetAmount = Number(depositOffsetAmount || 0);
  const offsetInvalid =
    !Number.isSafeInteger(offsetAmount) ||
    offsetAmount < 0 ||
    (offsetAmount > 0 &&
      (depositOffsetReason.trim().length < 3 || depositOffsetEvidence.length === 0));
  const finalRefund = Number(finalRefundAmount || 0);
  const finalRefundInvalid =
    !settlementQuote ||
    !Number.isSafeInteger(finalRefund) ||
    finalRefund < 0 ||
    finalRefund > settlementQuote.recommendedRefundAmount ||
    (finalRefund !== settlementQuote.recommendedRefundAmount &&
      (refundAdjustmentReason.trim().length < 3 ||
        refundAdjustmentEvidence.length === 0 ||
        refundAdjustmentEvidenceBusy));
  const settlementDraftInvalid =
    damageInvalid || damageUploadBusy || offsetInvalid || depositOffsetEvidenceBusy;
  const refundSettlementInvalid =
    !refundReference.trim() || refundEvidence.length === 0 || refundEvidenceBusy;
  const next =
    command?.state === "notice_received"
      ? "Setujui & jadwalkan checkout"
      : command?.state === "scheduled"
        ? "Catat serah-terima"
        : command?.state === "inspection_required"
          ? "Catat inspeksi"
          : null;

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="space-y-2 border-b border-border pb-5">
        <CardTitle className="flex items-center gap-2 text-foreground">
          <CalendarCheck2 className="h-5 w-5 text-primary" />
          Checkout
        </CardTitle>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Penutupan sewa melalui pemberitahuan, serah-terima, inspeksi, dan rekonsiliasi deposit.
          Kamar tidak pernah menjadi kosong secara langsung.
        </p>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        {error ? (
          <div
            role="alert"
            className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Memuat status checkout…
          </div>
        ) : !command ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Jenis keluar
              <Select
                value={exitType}
                onValueChange={(value) => setExitType(value as typeof exitType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resident_early_termination">
                    Penghentian dini penghuni
                  </SelectItem>
                  <SelectItem value="normal_expiry">Checkout masa sewa berakhir</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Tanggal efektif
              <Input
                type="date"
                value={effectiveDate}
                onChange={(event) => setEffectiveDate(event.target.value)}
              />
            </label>
            <p className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-5 text-muted-foreground">
              Penghentian dini memiliki notice 14 hari. Sistem menghitung rekomendasi biaya untuk
              notice yang kurang; Admin memutuskan pada tahap persetujuan.
            </p>
            <label className="grid gap-2 text-sm font-medium text-foreground md:col-span-2">
              Alasan pemberitahuan
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <div className="md:col-span-2">
              <Button disabled={!reason.trim() || pending} onClick={submitNotice}>
                {pending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CalendarCheck2 className="mr-2 h-4 w-4" />
                )}
                Catat pemberitahuan
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Status checkout
              </p>
              <p className="mt-1 text-base font-semibold capitalize text-foreground">
                {command.state.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Efektif {command.effectiveDate} · Pemberitahuan {command.noticeRecordedDate}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {command.exitType === "normal_expiry"
                  ? "Checkout normal saat masa sewa berakhir"
                  : "Permintaan penghentian dini penghuni"}
              </p>
            </div>
            {command.state === "notice_received" ? (
              <fieldset className="grid gap-4 rounded-md border border-border p-4 md:grid-cols-2">
                <legend className="px-1 text-sm font-semibold text-foreground">
                  Persetujuan notice dan biaya
                </legend>
                <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                  <p>Notice tercatat: {command.noticeDays ?? 0} hari</p>
                  <p>Kekurangan notice: {command.missingNoticeDays ?? 0} hari</p>
                  <p className="font-medium text-foreground">
                    Rekomendasi: {rupiah.format(recommendedCharge)}
                  </p>
                </div>
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Biaya short-notice yang disetujui
                  <Input
                    inputMode="numeric"
                    value={approvedShortNoticeCharge}
                    onChange={(event) =>
                      setApprovedShortNoticeCharge(event.target.value.replace(/\D/g, ""))
                    }
                  />
                </label>
                {approvedCharge < recommendedCharge ? (
                  <label className="grid gap-2 text-sm font-medium text-foreground md:col-span-2">
                    Alasan waiver/pengurangan
                    <Textarea
                      value={waiverReason}
                      onChange={(event) => setWaiverReason(event.target.value)}
                    />
                  </label>
                ) : null}
              </fieldset>
            ) : null}
            {command.state === "scheduled" ? (
              <fieldset className="space-y-3 rounded-md border border-border p-4">
                <legend className="px-1 text-sm font-semibold text-foreground">
                  Konfirmasi serah-terima
                </legend>
                <p className="text-sm text-muted-foreground">
                  Seluruh konfirmasi wajib sebelum bukti serah-terima disimpan.
                </p>
                {(
                  [
                    ["keyAccess", "Kunci dan akses telah dikembalikan atau didokumentasikan."],
                    ["inventory", "Inventaris kamar telah diperiksa dan dicatat."],
                    [
                      "parking",
                      "Parkir sudah direkonsiliasi, termasuk bila penghuni tidak memiliki kendaraan.",
                    ],
                  ] as const
                ).map(([field, label]) => (
                  <label
                    key={field}
                    className="flex cursor-pointer items-start gap-3 rounded-md p-2 text-sm text-foreground hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={handover[field]}
                      onCheckedChange={(checked) =>
                        setHandover((current) => ({ ...current, [field]: checked === true }))
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}

                <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Rincian inventaris</p>
                      <p className="text-xs text-muted-foreground">
                        Catat jumlah yang seharusnya tersedia dan yang diterima kembali.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setInventoryItems((current) => [
                          ...current,
                          inventoryDraft(nextHandoverKey),
                        ]);
                        setNextHandoverKey((value) => value + 1);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Tambah inventaris
                    </Button>
                  </div>
                  {inventoryItems.map((item, index) => (
                    <div
                      key={item.key}
                      className="grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-12"
                    >
                      <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-4">
                        Nama item
                        <Input
                          value={item.name}
                          placeholder="Contoh: Lemari"
                          onChange={(event) =>
                            setInventoryItems((current) =>
                              current.map((draft) =>
                                draft.key === item.key
                                  ? { ...draft, name: event.target.value }
                                  : draft,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-2">
                        Seharusnya
                        <Input
                          inputMode="numeric"
                          value={item.expectedQuantity}
                          onChange={(event) =>
                            setInventoryItems((current) =>
                              current.map((draft) =>
                                draft.key === item.key
                                  ? {
                                      ...draft,
                                      expectedQuantity: event.target.value.replace(/\D/g, ""),
                                    }
                                  : draft,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-2">
                        Dikembalikan
                        <Input
                          inputMode="numeric"
                          value={item.returnedQuantity}
                          onChange={(event) =>
                            setInventoryItems((current) =>
                              current.map((draft) =>
                                draft.key === item.key
                                  ? {
                                      ...draft,
                                      returnedQuantity: event.target.value.replace(/\D/g, ""),
                                    }
                                  : draft,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-3">
                        Kondisi
                        <Select
                          value={item.condition}
                          onValueChange={(value) =>
                            setInventoryItems((current) =>
                              current.map((draft) =>
                                draft.key === item.key
                                  ? { ...draft, condition: value as InventoryDraft["condition"] }
                                  : draft,
                              ),
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="complete">Lengkap</SelectItem>
                            <SelectItem value="partial">Sebagian</SelectItem>
                            <SelectItem value="damaged">Rusak</SelectItem>
                            <SelectItem value="missing">Hilang</SelectItem>
                            <SelectItem value="not_applicable">Tidak berlaku</SelectItem>
                          </SelectContent>
                        </Select>
                      </label>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="self-end text-destructive md:col-span-1"
                        aria-label={`Hapus inventaris ${index + 1}`}
                        onClick={() =>
                          setInventoryItems((current) =>
                            current.filter((draft) => draft.key !== item.key),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-12">
                        Catatan item (opsional)
                        <Input
                          value={item.notes}
                          onChange={(event) =>
                            setInventoryItems((current) =>
                              current.map((draft) =>
                                draft.key === item.key
                                  ? { ...draft, notes: event.target.value }
                                  : draft,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Kunci dan akses</p>
                      <p className="text-xs text-muted-foreground">
                        Termasuk kunci fisik, kartu akses, remote, atau smart-lock.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAccessItems((current) => [...current, accessDraft(nextHandoverKey)]);
                        setNextHandoverKey((value) => value + 1);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Tambah akses
                    </Button>
                  </div>
                  {accessItems.map((item, index) => (
                    <div
                      key={item.key}
                      className="grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-12"
                    >
                      <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-4">
                        Jenis akses
                        <Input
                          value={item.name}
                          placeholder="Contoh: Kunci kamar"
                          onChange={(event) =>
                            setAccessItems((current) =>
                              current.map((draft) =>
                                draft.key === item.key
                                  ? { ...draft, name: event.target.value }
                                  : draft,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-2">
                        Seharusnya
                        <Input
                          inputMode="numeric"
                          value={item.expectedQuantity}
                          onChange={(event) =>
                            setAccessItems((current) =>
                              current.map((draft) =>
                                draft.key === item.key
                                  ? {
                                      ...draft,
                                      expectedQuantity: event.target.value.replace(/\D/g, ""),
                                    }
                                  : draft,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-2">
                        Dikembalikan
                        <Input
                          inputMode="numeric"
                          value={item.returnedQuantity}
                          onChange={(event) =>
                            setAccessItems((current) =>
                              current.map((draft) =>
                                draft.key === item.key
                                  ? {
                                      ...draft,
                                      returnedQuantity: event.target.value.replace(/\D/g, ""),
                                    }
                                  : draft,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-3">
                        Status
                        <Select
                          value={item.status}
                          onValueChange={(value) =>
                            setAccessItems((current) =>
                              current.map((draft) =>
                                draft.key === item.key
                                  ? { ...draft, status: value as AccessDraft["status"] }
                                  : draft,
                              ),
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="returned">Dikembalikan</SelectItem>
                            <SelectItem value="partial">Sebagian</SelectItem>
                            <SelectItem value="damaged">Rusak</SelectItem>
                            <SelectItem value="missing">Hilang</SelectItem>
                            <SelectItem value="not_applicable">Tidak berlaku</SelectItem>
                          </SelectContent>
                        </Select>
                      </label>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="self-end text-destructive md:col-span-1"
                        aria-label={`Hapus akses ${index + 1}`}
                        onClick={() =>
                          setAccessItems((current) =>
                            current.filter((draft) => draft.key !== item.key),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-12">
                        Catatan akses (opsional)
                        <Input
                          value={item.notes}
                          onChange={(event) =>
                            setAccessItems((current) =>
                              current.map((draft) =>
                                draft.key === item.key
                                  ? { ...draft, notes: event.target.value }
                                  : draft,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Pembacaan utilitas (opsional)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Catat meter listrik, air, atau utilitas lain bila tersedia.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setUtilityReadings((current) => [
                          ...current,
                          {
                            key: nextHandoverKey,
                            utilityType: "",
                            meterNumber: "",
                            checkoutReading: "",
                            unit: "",
                            outstandingUsageNotes: "",
                          },
                        ]);
                        setNextHandoverKey((value) => value + 1);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Tambah meter
                    </Button>
                  </div>
                  {utilityReadings.map((reading, index) => (
                    <div
                      key={reading.key}
                      className="grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-12"
                    >
                      {(
                        [
                          ["utilityType", "Jenis utilitas", "Contoh: Listrik"],
                          ["meterNumber", "Nomor meter (opsional)", "Nomor meter"],
                          ["checkoutReading", "Angka akhir", "Contoh: 1234.5"],
                          ["unit", "Satuan", "kWh / m³"],
                        ] as const
                      ).map(([field, label, placeholder]) => (
                        <label
                          key={field}
                          className="grid gap-1 text-xs font-medium text-foreground md:col-span-3"
                        >
                          {label}
                          <Input
                            value={reading[field]}
                            placeholder={placeholder}
                            onChange={(event) =>
                              setUtilityReadings((current) =>
                                current.map((draft) =>
                                  draft.key === reading.key
                                    ? { ...draft, [field]: event.target.value }
                                    : draft,
                                ),
                              )
                            }
                          />
                        </label>
                      ))}
                      <label className="grid gap-1 text-xs font-medium text-foreground md:col-span-11">
                        Catatan pemakaian/tagihan tersisa (opsional)
                        <Input
                          value={reading.outstandingUsageNotes}
                          onChange={(event) =>
                            setUtilityReadings((current) =>
                              current.map((draft) =>
                                draft.key === reading.key
                                  ? { ...draft, outstandingUsageNotes: event.target.value }
                                  : draft,
                              ),
                            )
                          }
                        />
                      </label>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="self-end text-destructive md:col-span-1"
                        aria-label={`Hapus meter ${index + 1}`}
                        onClick={() =>
                          setUtilityReadings((current) =>
                            current.filter((draft) => draft.key !== reading.key),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Textarea
                  placeholder="Catatan serah-terima (opsional)"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </fieldset>
            ) : null}
            {["inspection_required", "settlement_pending"].includes(command.state) ? (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-foreground">
                  Hasil kondisi kamar
                  <Select
                    value={roomResult}
                    disabled={command.state === "settlement_pending"}
                    onValueChange={(value) => setRoomResult(value as typeof roomResult)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inspection_required">Perlu inspeksi lanjutan</SelectItem>
                      <SelectItem value="maintenance">Masuk maintenance</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                {command.state === "inspection_required" ? (
                  <Textarea
                    placeholder="Catatan inspeksi (opsional)"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                ) : null}
              </div>
            ) : null}
            {command.state === "settlement_pending" ? (
              <div className="space-y-5 rounded-lg border border-border p-4">
                <div>
                  <p className="font-semibold text-foreground">Rekonsiliasi final</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Sistem menghitung sewa terpakai, pembayaran terverifikasi, biaya notice,
                    deposit, dan potongan secara terpisah. Hitung ulang rekomendasi setiap kali
                    rincian diubah.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Potongan inspeksi</p>
                      <p className="text-xs text-muted-foreground">
                        Setiap potongan wajib memiliki alasan dan bukti.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setDamages((current) => [
                          ...current,
                          {
                            key: nextDamageKey,
                            amount: "",
                            reason: "",
                            evidence: [],
                            busy: false,
                          },
                        ]);
                        setNextDamageKey((value) => value + 1);
                        setSettlementQuote(null);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Tambah potongan
                    </Button>
                  </div>
                  {damages.map((item, index) => (
                    <div
                      key={item.key}
                      className="grid gap-4 rounded-md border border-border bg-muted/20 p-4 md:grid-cols-2"
                    >
                      <label className="grid gap-2 text-sm font-medium text-foreground">
                        Nominal potongan
                        <Input
                          inputMode="numeric"
                          value={item.amount}
                          onChange={(event) => {
                            const amount = event.target.value.replace(/\D/g, "");
                            setDamages((current) =>
                              current.map((draft) =>
                                draft.key === item.key ? { ...draft, amount } : draft,
                              ),
                            );
                            setSettlementQuote(null);
                          }}
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-foreground">
                        Alasan potongan
                        <Input
                          value={item.reason}
                          onChange={(event) => {
                            const reason = event.target.value;
                            setDamages((current) =>
                              current.map((draft) =>
                                draft.key === item.key ? { ...draft, reason } : draft,
                              ),
                            );
                            setSettlementQuote(null);
                          }}
                        />
                      </label>
                      <EvidenceFileUploadField
                        className="md:col-span-2"
                        propertyId={command.propertyId}
                        label={`Bukti potongan ${index + 1}`}
                        description="Foto atau dokumen hasil inspeksi kamar."
                        values={item.evidence}
                        onChange={(evidence) => {
                          setDamages((current) =>
                            current.map((draft) =>
                              draft.key === item.key ? { ...draft, evidence } : draft,
                            ),
                          );
                          setSettlementQuote(null);
                        }}
                        onBusyChange={(busy) =>
                          setDamages((current) =>
                            current.map((draft) =>
                              draft.key === item.key ? { ...draft, busy } : draft,
                            ),
                          )
                        }
                        required
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        className="md:col-span-2 md:justify-self-start"
                        onClick={() => {
                          setDamages((current) =>
                            current.filter((draft) => draft.key !== item.key),
                          );
                          setSettlementQuote(null);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Hapus potongan
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 rounded-md border border-border p-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-foreground">
                    Offset deposit ke tunggakan sewa
                    <Input
                      inputMode="numeric"
                      value={depositOffsetAmount}
                      onChange={(event) => {
                        setDepositOffsetAmount(event.target.value.replace(/\D/g, ""));
                        setSettlementQuote(null);
                      }}
                    />
                  </label>
                  {offsetAmount > 0 ? (
                    <>
                      <label className="grid gap-2 text-sm font-medium text-foreground">
                        Alasan penggunaan deposit
                        <Input
                          value={depositOffsetReason}
                          onChange={(event) => {
                            setDepositOffsetReason(event.target.value);
                            setSettlementQuote(null);
                          }}
                        />
                      </label>
                      <EvidenceFileUploadField
                        className="md:col-span-2"
                        propertyId={command.propertyId}
                        label="Bukti persetujuan offset deposit"
                        description="Wajib. Deposit tidak pernah otomatis digunakan untuk menutup sewa."
                        values={depositOffsetEvidence}
                        onChange={(files) => {
                          setDepositOffsetEvidence(files);
                          setSettlementQuote(null);
                        }}
                        onBusyChange={setDepositOffsetEvidenceBusy}
                        required
                      />
                    </>
                  ) : null}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  disabled={pending || settlementDraftInvalid}
                  onClick={previewSettlement}
                >
                  {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Hitung rekomendasi final
                </Button>

                {settlementQuote ? (
                  <div className="space-y-4 rounded-md border border-primary/30 bg-primary/5 p-4">
                    <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      <p>
                        Pembayaran sewa terverifikasi
                        <strong className="block text-foreground">
                          {rupiah.format(settlementQuote.verifiedRentPaymentAmount)}
                        </strong>
                      </p>
                      <p>
                        Kredit invoice sebelumnya
                        <strong className="block text-foreground">
                          {rupiah.format(settlementQuote.existingInvoiceCreditAmount)}
                        </strong>
                      </p>
                      <p>
                        Sewa terpakai
                        <strong className="block text-foreground">
                          {rupiah.format(settlementQuote.earnedRentAmount)}
                        </strong>
                      </p>
                      <p>
                        Biaya short-notice
                        <strong className="block text-foreground">
                          {rupiah.format(settlementQuote.approvedShortNoticeCharge)}
                        </strong>
                      </p>
                      <p>
                        Saldo deposit
                        <strong className="block text-foreground">
                          {rupiah.format(settlementQuote.depositLiabilityAmount)}
                        </strong>
                      </p>
                      <p>
                        Total potongan
                        <strong className="block text-foreground">
                          {rupiah.format(settlementQuote.depositDeductionAmount)}
                        </strong>
                      </p>
                      <p>
                        Sisa kewajiban penghuni
                        <strong className="block text-foreground">
                          {rupiah.format(settlementQuote.amountDue)}
                        </strong>
                      </p>
                    </div>
                    <p className="border-t border-primary/20 pt-3 text-sm font-semibold text-primary">
                      Rekomendasi refund: {rupiah.format(settlementQuote.recommendedRefundAmount)}
                    </p>
                    <label className="grid gap-2 text-sm font-medium text-foreground">
                      Refund final yang diputuskan Admin
                      <Input
                        inputMode="numeric"
                        value={finalRefundAmount}
                        onChange={(event) =>
                          setFinalRefundAmount(event.target.value.replace(/\D/g, ""))
                        }
                      />
                    </label>
                    {finalRefund !== settlementQuote.recommendedRefundAmount ? (
                      <div className="space-y-4">
                        <label className="grid gap-2 text-sm font-medium text-foreground">
                          Alasan penyesuaian refund
                          <Textarea
                            value={refundAdjustmentReason}
                            onChange={(event) => setRefundAdjustmentReason(event.target.value)}
                          />
                        </label>
                        <EvidenceFileUploadField
                          propertyId={command.propertyId}
                          label="Bukti penyesuaian refund"
                          description="Wajib saat keputusan Admin lebih rendah dari rekomendasi sistem."
                          values={refundAdjustmentEvidence}
                          onChange={setRefundAdjustmentEvidence}
                          onBusyChange={setRefundAdjustmentEvidenceBusy}
                          required
                        />
                      </div>
                    ) : null}
                    <Button
                      disabled={pending || settlementDraftInvalid || finalRefundInvalid}
                      onClick={completeSettlement}
                    >
                      {pending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      Tetapkan final settlement
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {command.state === "completed" ? (
              <div className="space-y-5 rounded-lg border border-border p-4">
                <div>
                  <p className="font-semibold text-foreground">Checkout selesai</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Keputusan final tersimpan dan tidak dihitung ulang dari data UI.
                  </p>
                </div>
                {command.finalSettlementId ? (
                  <div className="grid gap-3 rounded-md bg-muted/30 p-4 text-sm sm:grid-cols-3">
                    <p>
                      Rekomendasi refund
                      <strong className="block text-foreground">
                        {rupiah.format(command.recommendedRefundAmount ?? 0)}
                      </strong>
                    </p>
                    <p>
                      Refund final
                      <strong className="block text-foreground">
                        {rupiah.format(command.finalRefundAmount ?? 0)}
                      </strong>
                    </p>
                    <p>
                      Komponen refund sewa
                      <strong className="block text-foreground">
                        {rupiah.format(command.finalRentRefundAmount ?? 0)}
                      </strong>
                    </p>
                    <p>
                      Komponen refund deposit
                      <strong className="block text-foreground">
                        {rupiah.format(command.finalDepositRefundAmount ?? 0)}
                      </strong>
                    </p>
                    <p>
                      Penyesuaian Admin
                      <strong className="block text-foreground">
                        {rupiah.format(command.refundAdjustmentAmount ?? 0)}
                      </strong>
                    </p>
                    <p>
                      Sisa kewajiban
                      <strong className="block text-foreground">
                        {rupiah.format(command.amountDue ?? 0)}
                      </strong>
                    </p>
                  </div>
                ) : null}
                {(command.documents ?? []).length ? (
                  <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-4">
                    <div>
                      <p className="font-semibold text-foreground">Dokumen resmi checkout</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        PDF yang sudah diterbitkan bersifat tetap dan memakai template kuitansi
                        resmi.
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(command.documents ?? []).map((document) => (
                        <Button
                          key={document.id}
                          variant="outline"
                          disabled={downloadingDocumentId === document.id}
                          onClick={() => void downloadDocument(document)}
                        >
                          {downloadingDocumentId === document.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="mr-2 h-4 w-4" />
                          )}
                          {document.documentKind === "checkout_handover"
                            ? "Berita acara checkout"
                            : document.documentKind === "final_settlement"
                              ? "Final settlement"
                              : "Kuitansi refund"}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {command.exitRefundId && command.exitRefundStatus === "pending" ? (
                  <div className="space-y-4 rounded-md border border-success/30 bg-success/5 p-4">
                    <p className="font-semibold text-success">
                      Refund menunggu pembayaran: {rupiah.format(command.exitRefundAmount ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Target pembayaran paling lambat {command.exitRefundDueDate ?? "-"}.
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-foreground">
                        Metode refund
                        <Select
                          value={refundMethod}
                          onValueChange={(value) => setRefundMethod(value as typeof refundMethod)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bank_transfer">Transfer bank</SelectItem>
                            <SelectItem value="cash">Tunai</SelectItem>
                            <SelectItem value="qris">QRIS</SelectItem>
                            <SelectItem value="ewallet">E-wallet</SelectItem>
                            <SelectItem value="other">Lainnya</SelectItem>
                          </SelectContent>
                        </Select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-foreground">
                        Referensi pembayaran
                        <Input
                          value={refundReference}
                          onChange={(event) => setRefundReference(event.target.value)}
                        />
                      </label>
                    </div>
                    <EvidenceFileUploadField
                      propertyId={command.propertyId}
                      label="Bukti pembayaran refund"
                      description="Wajib sebelum refund dinyatakan selesai."
                      values={refundEvidence}
                      onChange={setRefundEvidence}
                      onBusyChange={setRefundEvidenceBusy}
                      required
                    />
                    <label className="grid gap-2 text-sm font-medium text-foreground">
                      Catatan pembayaran (opsional)
                      <Textarea
                        value={refundNotes}
                        onChange={(event) => setRefundNotes(event.target.value)}
                      />
                    </label>
                    <Button
                      disabled={pending || refundSettlementInvalid}
                      onClick={settleExitRefund}
                    >
                      Catat refund telah dibayar
                    </Button>
                    <div className="border-t border-success/20 pt-4">
                      <label className="grid gap-2 text-sm font-medium text-foreground">
                        Alasan penghuni melepaskan hak refund
                        <Textarea
                          value={refundWaiverReason}
                          onChange={(event) => setRefundWaiverReason(event.target.value)}
                        />
                      </label>
                      <Button
                        className="mt-3"
                        variant="destructive"
                        disabled={pending || refundWaiverReason.trim().length < 3}
                        onClick={waiveExitRefund}
                      >
                        Catat refund dilepaskan
                      </Button>
                    </div>
                  </div>
                ) : command.exitRefundId ? (
                  <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Status refund: {command.exitRefundStatus?.replaceAll("_", " ") ?? "-"}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3">
              {next ? (
                <Button
                  disabled={
                    pending ||
                    (command.state === "notice_received" && approvalInvalid) ||
                    (command.state === "scheduled" && !canRecordHandover)
                  }
                  onClick={advance}
                >
                  {pending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  {next}
                </Button>
              ) : null}
              {["notice_received", "scheduled"].includes(command.state) ? (
                <div className="flex min-w-72 flex-1 gap-2">
                  <Input
                    aria-label="Alasan pembatalan checkout"
                    placeholder="Alasan pembatalan"
                    value={cancellationReason}
                    onChange={(event) => setCancellationReason(event.target.value)}
                  />
                  <Button
                    variant="destructive"
                    disabled={pending || !cancellationReason.trim()}
                    onClick={cancel}
                  >
                    Batalkan
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        )}
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          Tutup
        </Button>
      </CardContent>
    </Card>
  );
}
