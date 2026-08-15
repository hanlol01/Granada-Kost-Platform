import { useMemo, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, CircleDollarSign, ShieldAlert, XCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useM6LeaseMutation,
  useM6RenewalCommands,
  useM6RenewalEligibility,
} from "@/hooks/useAdminUxLeases";
import {
  adminUxLeaseApi,
  type RenewalApprovalInput,
  type RenewalIntentInput,
} from "@/lib/admin-ux-lease-api";
import type { RenewalCommand, RenewalEligibility } from "@/lib/admin-ux-lease-types";
import { formatIDR } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";
import { ActionDeniedPanel, Field, FeatureOffPanel, KeyValue } from "./TransferPanel";

const STATE_LABEL: Record<RenewalCommand["state"], string> = {
  draft: "Menunggu persetujuan",
  approved: "Disetujui",
  activated: "Aktif",
  cancelled: "Dibatalkan",
  failed: "Perlu review",
};

function nextDate(value: string): string {
  const date = new Date(value + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function RenewalPanel({
  leaseId,
  endDate,
  canManage,
  canFinancial,
  renewalFlagEnabled,
  onClose,
  onOpenLease,
}: {
  leaseId: string;
  endDate: string | null;
  canManage: boolean;
  canFinancial: boolean;
  renewalFlagEnabled: boolean;
  onClose: () => void;
  onOpenLease: (leaseId: string) => void;
}) {
  const commands = useM6RenewalCommands(leaseId, renewalFlagEnabled && canManage);
  const eligibility = useM6RenewalEligibility(leaseId, renewalFlagEnabled && canManage);
  const [note, setNote] = useState("");
  const intentKey = useRef<string | null>(null);
  const intent = useM6LeaseMutation(
    "lease-renewal",
    "Intent perpanjangan berhasil dicatat",
    (_propertyId, input: RenewalIntentInput & { idempotencyKey: string }) =>
      adminUxLeaseApi.renewal.intent(leaseId, input, input.idempotencyKey),
  );
  const effectiveDate = useMemo(() => (endDate ? nextDate(endDate) : ""), [endDate]);

  if (!renewalFlagEnabled)
    return (
      <FeatureOffPanel
        title="Perpanjangan belum diaktifkan"
        description="Fitur perpanjangan harus diaktifkan untuk properti ini oleh operator berwenang."
        onClose={onClose}
      />
    );
  if (!canManage)
    return (
      <ActionDeniedPanel
        title="Perpanjangan memerlukan akses Admin"
        description="Hanya Admin dengan lease.manage yang dapat mencatat, menyetujui, atau membatalkan perpanjangan."
      />
    );
  if (!endDate)
    return (
      <ActionDeniedPanel
        title="Tanggal akhir lease diperlukan"
        description="Lease tanpa batas akhir tidak dapat diproses sebagai perpanjangan W07C."
      />
    );
  if (commands.isLoading) return <LoadingState label="Memuat riwayat perpanjangan..." />;
  if (commands.error)
    return (
      <ErrorState
        error={commands.error}
        title="Gagal memuat perpanjangan"
        onRetry={() => void commands.refetch()}
      />
    );

  const open = commands.data?.items.find(
    (item) => item.state === "draft" || item.state === "approved",
  );
  const createIntent = async () => {
    const idempotencyKey = intentKey.current ?? newIdempotencyKey();
    intentKey.current = idempotencyKey;
    try {
      await intent.mutateAsync({ effectiveDate, note: note.trim() || undefined, idempotencyKey });
      intentKey.current = null;
      setNote("");
    } catch {
      // Toast is centralized; keep idempotency key for an intentional retry.
    }
  };

  return (
    <div className="space-y-4">
      {eligibility.data ? (
        <RenewalEligibilityBanner eligibility={eligibility.data.eligibility} />
      ) : null}
      <Card className="border-slate-800 bg-slate-900/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <CalendarClock className="h-5 w-5 text-blue-300" /> Perpanjangan lease
          </CardTitle>
          <p className="text-sm text-slate-400">
            Perpanjangan selalu membuat term penerus yang terhubung. Tidak ada perpanjangan
            diam-diam, checkout, refund deposit, atau perubahan riwayat pembayaran pada panel ini.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <KeyValue label="Batas term lama" value={endDate} />
            <KeyValue label="Mulai term penerus" value={effectiveDate} />
          </div>
          {!open ? (
            <>
              <Field label="Catatan intent (opsional)">
                <Textarea
                  value={note}
                  maxLength={2000}
                  rows={3}
                  onChange={(event) => {
                    setNote(event.target.value);
                    intentKey.current = null;
                  }}
                  placeholder="Catatan H-60 untuk Admin"
                />
              </Field>
              <Button disabled={intent.isPending} onClick={() => void createIntent()}>
                <CalendarClock className="mr-2 h-4 w-4" /> Catat intent perpanjangan
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>
      {commands.data?.items.length ? (
        commands.data.items.map((command) => (
          <RenewalCommandCard
            key={command.id}
            leaseId={leaseId}
            command={command}
            canFinancial={canFinancial}
            onOpenLease={onOpenLease}
          />
        ))
      ) : (
        <Card className="border-slate-800 bg-slate-900/80">
          <CardContent className="p-6">
            <EmptyState
              icon={<CalendarClock className="h-5 w-5" />}
              title="Belum ada intent perpanjangan"
              description="Mulai pada H-60 atau sesuai kebijakan operasional yang tercatat."
            />
          </CardContent>
        </Card>
      )}
      <Button variant="secondary" onClick={onClose}>
        Kembali ke detail
      </Button>
    </div>
  );
}

function RenewalCommandCard({
  leaseId,
  command,
  canFinancial,
  onOpenLease,
}: {
  leaseId: string;
  command: RenewalCommand;
  canFinancial: boolean;
  onOpenLease: (leaseId: string) => void;
}) {
  const [termMonths, setTermMonths] = useState(command.termMonths ?? 12);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    command.billingCycle ?? "monthly",
  );
  const [paymentPlan, setPaymentPlan] = useState<RenewalApprovalInput["paymentPlanType"]>(
    command.paymentPlanType ?? "annual_full",
  );
  const [cancelOpen, setCancelOpen] = useState(false);
  const approveKey = useRef<string | null>(null);
  const financialKey = useRef<string | null>(null);
  const authorizeKey = useRef<string | null>(null);
  const cancelKey = useRef<string | null>(null);
  const approve = useM6LeaseMutation(
    "lease-renewal",
    "Term perpanjangan disetujui",
    (_propertyId, input: RenewalApprovalInput & { idempotencyKey: string }) =>
      adminUxLeaseApi.renewal.approve(leaseId, command.id, input, input.idempotencyKey),
  );
  const prepare = useM6LeaseMutation(
    "lease-renewal",
    "Jadwal dan invoice awal perpanjangan disiapkan",
    (_propertyId, input: { idempotencyKey: string }) =>
      adminUxLeaseApi.renewal.prepareFinancials(leaseId, command.id, input.idempotencyKey),
  );
  const authorize = useM6LeaseMutation(
    "lease-renewal",
    "Aktivasi perpanjangan telah diotorisasi",
    (_propertyId, input: { idempotencyKey: string }) =>
      adminUxLeaseApi.renewal.authorizeActivation(leaseId, command.id, input.idempotencyKey),
  );
  const cancel = useM6LeaseMutation(
    "lease-renewal",
    "Perpanjangan dibatalkan",
    (_propertyId, input: { reason: string; idempotencyKey: string }) =>
      adminUxLeaseApi.renewal.cancel(leaseId, command.id, input.reason, input.idempotencyKey),
  );
  const inProgress = command.state === "draft" || command.state === "approved";
  const approveCommand = async () => {
    const idempotencyKey = approveKey.current ?? newIdempotencyKey();
    approveKey.current = idempotencyKey;
    try {
      await approve.mutateAsync({
        termMonths,
        billingCycle,
        paymentPlanType: paymentPlan,
        idempotencyKey,
      });
      approveKey.current = null;
    } catch {
      // Retain the intent key.
    }
  };
  const prepareFinancials = async () => {
    const idempotencyKey = financialKey.current ?? newIdempotencyKey();
    financialKey.current = idempotencyKey;
    try {
      await prepare.mutateAsync({ idempotencyKey });
      financialKey.current = null;
    } catch {
      // Retain the intent key.
    }
  };
  const authorizeActivation = async () => {
    const idempotencyKey = authorizeKey.current ?? newIdempotencyKey();
    authorizeKey.current = idempotencyKey;
    try {
      await authorize.mutateAsync({ idempotencyKey });
      authorizeKey.current = null;
    } catch {
      // Retain the intent key.
    }
  };
  const cancelCommand = async (reason?: string) => {
    if (!reason?.trim()) return;
    const idempotencyKey = cancelKey.current ?? newIdempotencyKey();
    cancelKey.current = idempotencyKey;
    try {
      await cancel.mutateAsync({ reason: reason.trim(), idempotencyKey });
      cancelKey.current = null;
      setCancelOpen(false);
    } catch {
      // Retain the intent key.
    }
  };

  return (
    <Card className="border-slate-800 bg-slate-900/80">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base text-slate-100">
              Term mulai {command.effectiveDate}
            </CardTitle>
            <p className="mt-1 text-sm text-slate-400">Command {command.id.slice(0, 8)}</p>
          </div>
          <Badge variant="outline" className="border-slate-700 bg-slate-800 text-slate-200">
            {STATE_LABEL[command.state]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {command.failureCode ? (
          <div className="flex gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> Kode kegagalan:{" "}
            {command.failureCode}
          </div>
        ) : null}
        {command.state === "draft" ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Durasi term (bulan)" required>
              <Input
                type="number"
                min={3}
                max={120}
                value={termMonths}
                onChange={(event) => {
                  setTermMonths(Number(event.target.value));
                  approveKey.current = null;
                }}
              />
            </Field>
            <Field label="Siklus tagihan" required>
              <Select
                value={billingCycle}
                onValueChange={(value) => setBillingCycle(value as "monthly" | "yearly")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Bulanan</SelectItem>
                  <SelectItem value="yearly">Tahunan</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Rencana pembayaran" required>
              <Select
                value={paymentPlan}
                onValueChange={(value) =>
                  setPaymentPlan(value as RenewalApprovalInput["paymentPlanType"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual_full">Lunas kontrak</SelectItem>
                  <SelectItem value="monthly_installments">Cicilan bulanan</SelectItem>
                  <SelectItem value="two_month_installments">Cicilan dua bulanan</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <KeyValue
              label="Durasi"
              value={command.termMonths ? `${command.termMonths} bulan` : "—"}
            />
            <KeyValue
              label="Nilai kontrak"
              value={
                command.contractRentAmount === null ? "—" : formatIDR(command.contractRentAmount)
              }
            />
            <KeyValue
              label="Invoice awal"
              value={command.firstInvoiceId ? "Sudah dibuat" : "Belum dibuat"}
            />
            <KeyValue
              label="Otorisasi aktivasi"
              value={command.activationAuthorizedAt ? "Sudah" : "Belum"}
            />
          </div>
        )}
        {command.dpRecommendedAmount !== null ? (
          <p className="flex gap-2 text-xs text-slate-400">
            <CircleDollarSign className="h-4 w-4 shrink-0" /> Rekomendasi DP{" "}
            {formatIDR(command.dpRecommendedAmount)} hanya prefill. Aktivasi memerlukan kredit sewa
            W06 terverifikasi yang dialokasikan ke invoice awal, tanpa minimum 25%.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {command.state === "draft" ? (
            <Button disabled={approve.isPending} onClick={() => void approveCommand()}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Setujui term
            </Button>
          ) : null}
          {command.state === "approved" && canFinancial && !command.financialPreparedAt ? (
            <Button disabled={prepare.isPending} onClick={() => void prepareFinancials()}>
              <CircleDollarSign className="mr-2 h-4 w-4" /> Siapkan tagihan H-30
            </Button>
          ) : null}
          {command.state === "approved" &&
          canFinancial &&
          command.financialPreparedAt &&
          !command.activationAuthorizedAt ? (
            <Button disabled={authorize.isPending} onClick={() => void authorizeActivation()}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Otorisasi aktivasi
            </Button>
          ) : null}
          {command.successorLeaseId && command.state === "activated" ? (
            <Button variant="secondary" onClick={() => onOpenLease(command.successorLeaseId!)}>
              Buka term penerus
            </Button>
          ) : null}
          {inProgress ? (
            <Button
              variant="destructive"
              disabled={Boolean(command.financialPreparedAt || command.activationAuthorizedAt)}
              onClick={() => setCancelOpen(true)}
            >
              <XCircle className="mr-2 h-4 w-4" /> Batalkan
            </Button>
          ) : null}
        </div>
        {command.state === "approved" && !canFinancial ? (
          <p className="text-sm text-amber-200">
            Persiapan tagihan dan otorisasi aktivasi memerlukan Admin dengan billing.manage.
          </p>
        ) : null}
      </CardContent>
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Batalkan perpanjangan?"
        description="Pembatalan hanya diizinkan sebelum jadwal/invoice disiapkan dan sebelum aktivasi diotorisasi."
        confirmLabel="Batalkan perpanjangan"
        destructive
        pending={cancel.isPending}
        reason={{ label: "Alasan pembatalan", minLength: 1 }}
        onConfirm={(reason) => void cancelCommand(reason)}
      />
    </Card>
  );
}

const UNRESOLVED_WORK_LABEL: Record<string, string> = {
  financial_preparation: "menyiapkan jadwal & tagihan penerus",
  activation_authorization: "mengotorisasi aktivasi",
  activation_execution: "menunggu eksekusi aktivasi terjadwal",
};

/**
 * W07C read-only lease-ending reminder facts (H-60/H-30/H-14). This surfaces
 * the query-derived eligibility from the server; it never records or delivers
 * a reminder. A recorded payment alone never clears the H-30 boundary work.
 */
function RenewalEligibilityBanner({ eligibility }: { eligibility: RenewalEligibility }) {
  const { reminders, daysUntilEnding } = eligibility;
  const rows: { stage: string; text: string; tone: "action" | "clear" | "idle" }[] = [];
  if (reminders.h60.windowOpen)
    rows.push({
      stage: "H-60",
      tone: reminders.h60.cleared ? "clear" : reminders.h60.actionRequired ? "action" : "idle",
      text: reminders.h60.cleared
        ? "Intent perpanjangan sudah dicatat."
        : "Catat intent perpanjangan (H-60).",
    });
  if (reminders.h30.windowOpen)
    rows.push({
      stage: "H-30",
      tone: reminders.h30.cleared ? "clear" : reminders.h30.actionRequired ? "action" : "idle",
      text: reminders.h30.cleared
        ? "Perpanjangan sudah efektif."
        : reminders.h30.unresolvedWork
          ? "Perlu " +
            (UNRESOLVED_WORK_LABEL[reminders.h30.unresolvedWork] ?? reminders.h30.unresolvedWork) +
            (reminders.h30.paymentRecorded
              ? " (pembayaran tercatat, namun belum menutup H-30)."
              : ".")
          : "Tidak ada perpanjangan disetujui pada batas H-30.",
    });
  if (reminders.h14.windowOpen)
    rows.push({
      stage: "H-14",
      tone: reminders.h14.cleared ? "clear" : reminders.h14.actionRequired ? "action" : "idle",
      text: reminders.h14.cleared
        ? "Perpanjangan efektif; term penerus aktif."
        : "Perpanjangan belum efektif menjelang H-14.",
    });
  if (!rows.length) return null;
  return (
    <Card className="border-slate-800 bg-slate-900/80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm text-slate-100">
          <ShieldAlert className="h-4 w-4 text-amber-300" /> Pengingat perpanjangan
          {typeof daysUntilEnding === "number" ? (
            <Badge variant="outline">{daysUntilEnding} hari menuju akhir term</Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <div key={row.stage} className="flex items-center gap-2 text-sm">
            <Badge
              variant={row.tone === "action" ? "destructive" : "outline"}
              className={row.tone === "clear" ? "border-emerald-600 text-emerald-300" : undefined}
            >
              {row.stage}
            </Badge>
            <span className={row.tone === "action" ? "text-amber-200" : "text-slate-300"}>
              {row.text}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
