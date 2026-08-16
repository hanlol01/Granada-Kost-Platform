import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Banknote,
  CalendarCheck2,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  History,
  Loader2,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
import { AppShell } from "@/components/layout/app-shell";
import {
  ActionDeniedPanel,
  FeatureOffPanel,
  Field,
  KeyValue,
  TransferPanel,
} from "@/components/leases/TransferPanel";
import { RenewalPanel } from "@/components/leases/RenewalPanel";
import { CheckoutPanel } from "@/components/leases/CheckoutPanel";
import { PAYMENT_METHOD_LABEL } from "@/components/leases/transfer-shared";
import { EmptyState, ErrorState, LoadingState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useM6Lease, useM6LeaseBillingSummary, useM6LeaseMutation } from "@/hooks/useAdminUxLeases";
import {
  adminUxLeaseApi,
  type DepositCollectInput,
  type RefundSettlementInput,
} from "@/lib/admin-ux-lease-api";
import {
  BILLING_CYCLE_LABEL,
  canRunAdminTransfer,
  canRunTransferTopUp,
  canSettleLeaseRefund,
  hasRequiredLeasePaymentReference,
  isFinancialLeaseActor,
  leaseHistoryLabel,
  type LeaseDetailRouteSearch,
} from "@/lib/admin-ux-lease-helpers";
import type { DepositLedgerEntry, PaymentMethod } from "@/lib/admin-ux-lease-types";
import { useAuth } from "@/lib/auth";
import { isAdminUxLeaseTransferEnabled } from "@/lib/features";
import { formatIDR } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";
import { cn } from "@/lib/utils";

type Props = {
  leaseId: string;
  search: LeaseDetailRouteSearch;
  onSearchChange: (next: Partial<LeaseDetailRouteSearch>) => void;
  onOpenLease: (leaseId: string) => void;
};

export function LeaseDetailPage({ leaseId, search, onSearchChange, onOpenLease }: Props) {
  const detail = useM6Lease(leaseId);
  const billing = useM6LeaseBillingSummary(leaseId);
  const { user, hasPermission } = useAuth();
  const roles = user?.roles ?? [];
  const permissions = user?.permissions ?? [];
  const isAdmin = roles.includes("admin");
  const canManage = hasPermission("lease.manage");
  const canFinancial = isFinancialLeaseActor({ roles, permissions });
  const canSettleRefund = canSettleLeaseRefund({ roles, permissions });
  const transferFlagEnabled = isAdminUxLeaseTransferEnabled();
  // W07C remains server-gated by the property feature row. This UI switch is
  // default-off so an older Admin bundle never exposes an unfinished surface.
  const renewalFlagEnabled =
    import.meta.env.VITE_FEATURE_ADMIN_UX_LEASE_ENABLED === "true" &&
    import.meta.env.VITE_FEATURE_ADMIN_UX_LEASE_RENEWAL_ENABLED === "true";

  if (detail.isLoading || billing.isLoading) {
    return (
      <AppShell title="Detail Penyewaan" subtitle="Menyiapkan detail lease">
        <LoadingState label="Memuat detail penyewaan..." />
      </AppShell>
    );
  }

  if (detail.error || billing.error || !detail.data) {
    return (
      <AppShell title="Detail Penyewaan" subtitle="Lease dan ringkasan komersial">
        <ErrorState
          error={detail.error ?? billing.error}
          title="Gagal memuat detail penyewaan"
          onRetry={() => {
            void detail.refetch();
            void billing.refetch();
          }}
        />
      </AppShell>
    );
  }

  const data = detail.data;
  const active = data.lease.leaseStatus === "active";
  // W07B: every transfer mutation is admin-only with lease.manage.
  const canTransfer = canRunAdminTransfer({
    roles,
    permissions,
    leaseStatus: data.lease.leaseStatus,
    transferFlagEnabled,
  });

  return (
    <AppShell
      title="Detail Penyewaan"
      subtitle={
        data.lease.leaseCode +
        " · " +
        data.lease.room.number +
        " · " +
        data.lease.resident.fullNameMasked
      }
      actions={
        active ? (
          <div className="flex flex-wrap gap-2">
            {canTransfer ? (
              <Button variant="info" onClick={() => onSearchChange({ panel: "transfer" })}>
                <ArrowLeftRight className="mr-2 h-4 w-4" /> Transfer
              </Button>
            ) : null}
            {isAdmin && canManage && renewalFlagEnabled ? (
              <Button variant="secondary" onClick={() => onSearchChange({ panel: "renewal" })}>
                <CalendarCheck2 className="mr-2 h-4 w-4" /> Perpanjang
              </Button>
            ) : null}
            {isAdmin && canManage ? (
              <Button onClick={() => onSearchChange({ panel: "checkout" })}>
                <CalendarCheck2 className="mr-2 h-4 w-4" /> Checkout
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      <div className="space-y-5 pb-24 lg:pb-8">
        <LeaseOverview lease={data.lease} outstanding={billing.data?.outstandingAmount ?? 0} />
        {search.panel === "transfer" ? (
          <TransferPanel
            leaseId={leaseId}
            leaseStatus={data.lease.leaseStatus}
            canManage={isAdmin && canManage}
            canFinancial={canRunTransferTopUp({ roles, permissions })}
            transferFlagEnabled={transferFlagEnabled}
            onClose={() => onSearchChange({ panel: "detail" })}
            onOpenLease={onOpenLease}
          />
        ) : search.panel === "renewal" ? (
          <RenewalPanel
            leaseId={leaseId}
            endDate={data.lease.endDate}
            canManage={isAdmin && canManage}
            canFinancial={isAdmin && canManage && permissions.includes("billing.manage")}
            renewalFlagEnabled={renewalFlagEnabled}
            onClose={() => onSearchChange({ panel: "detail" })}
            onOpenLease={onOpenLease}
          />
        ) : search.panel === "checkout" ? (
          isAdmin && canManage ? (
            <CheckoutPanel leaseId={leaseId} onClose={() => onSearchChange({ panel: "detail" })} />
          ) : (
            <ActionDeniedPanel
              title="Checkout memerlukan Admin"
              description="Checkout W07D hanya tersedia untuk Admin dalam properti dengan lease.manage."
            />
          )
        ) : (
          <LeaseTabs
            data={data}
            outstanding={billing.data?.outstandingAmount ?? 0}
            tab={search.tab}
            onTabChange={(tab) => onSearchChange({ tab })}
            canFinancial={canFinancial}
            canSettleRefund={canSettleRefund}
            leaseId={leaseId}
          />
        )}
      </div>
    </AppShell>
  );
}

function LeaseOverview({
  lease,
  outstanding,
}: {
  lease: {
    leaseStatus: string;
    room: { number: string };
    kostType: { name: string };
    startDate: string;
    nextBillingDate: string;
    billingCycle: "monthly" | "yearly";
    snapshot: { monthlyPrice: number; yearlyPrice: number; depositAmount: number };
  };
  outstanding: number;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <OverviewCard
        label="Status"
        value={
          lease.leaseStatus === "active"
            ? "Aktif"
            : lease.leaseStatus === "transferred"
              ? "Dipindahkan"
              : "Selesai"
        }
        icon={CheckCircle2}
      />
      <OverviewCard
        label="Kamar"
        value={lease.room.number + " · " + lease.kostType.name}
        icon={CalendarCheck2}
      />
      <OverviewCard
        label="Tagihan berikutnya"
        value={lease.nextBillingDate}
        note={BILLING_CYCLE_LABEL[lease.billingCycle]}
        icon={ReceiptText}
      />
      <OverviewCard
        label="Tunggakan"
        value={formatIDR(outstanding)}
        note={"Deposit snapshot " + formatIDR(lease.snapshot.depositAmount)}
        icon={CircleDollarSign}
      />
    </div>
  );
}

function OverviewCard({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string;
  note?: string;
  icon: typeof CircleDollarSign;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900/80">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-100">{value}</p>
            {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
          </div>
          <Icon className="h-5 w-5 shrink-0 text-blue-300" />
        </div>
      </CardContent>
    </Card>
  );
}

function LeaseTabs({
  data,
  outstanding,
  tab,
  onTabChange,
  canSettleRefund,
  canFinancial,
  leaseId,
}: {
  data: NonNullable<ReturnType<typeof useM6Lease>["data"]>;
  outstanding: number;
  tab: LeaseDetailRouteSearch["tab"];
  onTabChange: (tab: LeaseDetailRouteSearch["tab"]) => void;
  canSettleRefund: boolean;
  canFinancial: boolean;
  leaseId: string;
}) {
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onTabChange(value as LeaseDetailRouteSearch["tab"])}
    >
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-slate-900 p-1">
        <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
        <TabsTrigger value="invoice">Invoice</TabsTrigger>
        <TabsTrigger value="deposit">Deposit</TabsTrigger>
        <TabsTrigger value="riwayat">Riwayat</TabsTrigger>
      </TabsList>
      <TabsContent value="ringkasan">
        <SummaryTab data={data} outstanding={outstanding} />
      </TabsContent>
      <TabsContent value="invoice">
        <InvoiceTab invoices={data.invoices} />
      </TabsContent>
      <TabsContent value="deposit">
        <DepositTab
          leaseId={leaseId}
          data={data}
          canFinancial={canFinancial}
          canSettleRefund={canSettleRefund}
        />
      </TabsContent>
      <TabsContent value="riwayat">
        <HistoryTab history={data.history} />
      </TabsContent>
    </Tabs>
  );
}

function SummaryTab({
  data,
  outstanding,
}: {
  data: NonNullable<ReturnType<typeof useM6Lease>["data"]>;
  outstanding: number;
}) {
  const lease = data.lease;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-slate-800 bg-slate-900/80">
        <CardHeader>
          <CardTitle className="text-base text-slate-100">Snapshot komersial</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <KeyValue label="Harga bulanan" value={formatIDR(lease.snapshot.monthlyPrice)} />
          <KeyValue label="Harga tahunan" value={formatIDR(lease.snapshot.yearlyPrice)} />
          <KeyValue label="Deposit wajib" value={formatIDR(lease.snapshot.depositAmount)} />
          <KeyValue label="Tunggakan invoice" value={formatIDR(outstanding)} />
        </CardContent>
      </Card>
      <Card className="border-slate-800 bg-slate-900/80">
        <CardHeader>
          <CardTitle className="text-base text-slate-100">Kamar dan fasilitas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <KeyValue label="Kamar" value={lease.room.number} />
          <KeyValue label="Tipe kost" value={lease.kostType.name} />
          <KeyValue label="Mulai" value={lease.startDate} />
          <KeyValue label="Tagihan berikutnya" value={lease.nextBillingDate} />
          <div>
            <p className="mb-2 text-xs text-slate-500">Fasilitas tipe kost</p>
            <div className="flex flex-wrap gap-2">
              {data.kostTypeFacilities.length ? (
                data.kostTypeFacilities.map((item) => (
                  <Badge
                    key={item.id}
                    variant="outline"
                    className="border-slate-700 bg-slate-800 text-slate-200"
                  >
                    {item.name}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-slate-500">Belum ada fasilitas.</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InvoiceTab({
  invoices,
}: {
  invoices: {
    id: string;
    invoiceCode: string;
    invoiceStatus: string;
    cycleStartDate: string;
    cycleEndDate: string;
    dueDate: string;
    totalAmount: number;
    outstandingAmount: number;
  }[];
}) {
  if (!invoices.length)
    return (
      <Card className="border-slate-800 bg-slate-900/80">
        <CardContent className="p-6">
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="Belum ada invoice"
            description="Invoice lifecycle akan muncul dari respons server."
          />
        </CardContent>
      </Card>
    );
  return (
    <Card className="overflow-hidden border-slate-800 bg-slate-900/80">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Periode</th>
              <th className="px-4 py-3">Jatuh tempo</th>
              <th className="px-4 py-3 text-right">Nilai</th>
              <th className="px-4 py-3 text-right">Sisa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-100">{invoice.invoiceCode}</p>
                  <p className="text-xs text-slate-500">{invoice.invoiceStatus}</p>
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {invoice.cycleStartDate} – {invoice.cycleEndDate}
                </td>
                <td className="px-4 py-3 text-slate-300">{invoice.dueDate}</td>
                <td className="px-4 py-3 text-right text-slate-100">
                  {formatIDR(invoice.totalAmount)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-100">
                  {formatIDR(invoice.outstandingAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DepositTab({
  canSettleRefund,
  leaseId,
  data,
  canFinancial,
}: {
  canSettleRefund: boolean;
  leaseId: string;
  data: NonNullable<ReturnType<typeof useM6Lease>["data"]>;
  canFinancial: boolean;
}) {
  const [collectOpen, setCollectOpen] = useState(false);
  const [refundAction, setRefundAction] = useState<{
    entry: DepositLedgerEntry;
    type: "settle" | "waive";
  } | null>(null);
  const summary = data.depositSummary;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <OverviewCard label="Wajib" value={formatIDR(summary.requiredAmount)} icon={WalletCards} />
        <OverviewCard
          label="Terkumpul"
          value={formatIDR(summary.collectedAmount)}
          icon={Banknote}
        />
        <OverviewCard
          label="Potongan"
          value={formatIDR(summary.deductionAmount)}
          icon={CircleDollarSign}
        />
        <OverviewCard
          label="Refund"
          value={formatIDR(summary.refundedAmount)}
          icon={CircleDollarSign}
        />
        <OverviewCard label="Saldo" value={formatIDR(summary.balanceAmount)} icon={WalletCards} />
      </div>
      <div className="flex flex-wrap justify-between gap-3">
        <p className="text-sm text-slate-400">
          Ledger deposit bersifat append-only. Saldo dihitung server, bukan di browser.
        </p>
        {canFinancial && data.lease.leaseStatus === "active" ? (
          <Button onClick={() => setCollectOpen(true)}>
            <Banknote className="mr-2 h-4 w-4" /> Catat Deposit
          </Button>
        ) : null}
      </div>
      {data.depositLedger.length ? (
        <Card className="overflow-hidden border-slate-800 bg-slate-900/80">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Jenis</th>
                  <th className="px-4 py-3">Arah</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3 text-right">Nominal</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {data.depositLedger.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 text-slate-100">
                      {depositTypeLabel(entry.transactionType)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {entry.direction === "credit" ? "Kredit" : "Debit"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={
                          entry.settlementStatus === "pending"
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                            : "border-slate-700 bg-slate-800 text-slate-300"
                        }
                      >
                        {settlementLabel(entry.settlementStatus)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {new Date(entry.createdAt).toLocaleDateString("id-ID")}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-100">
                      {formatIDR(entry.amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canSettleRefund &&
                      entry.transactionType === "refund" &&
                      entry.settlementStatus === "pending" ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="success"
                            onClick={() => setRefundAction({ entry, type: "settle" })}
                          >
                            Settle
                          </Button>
                          <Button
                            size="sm"
                            variant="warning"
                            onClick={() => setRefundAction({ entry, type: "waive" })}
                          >
                            Waive
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="border-slate-800 bg-slate-900/80">
          <CardContent className="p-6">
            <EmptyState
              icon={<WalletCards className="h-5 w-5" />}
              title="Belum ada transaksi deposit"
              description="Ringkasan akan diperbarui setelah collection, deduction, refund, atau transfer server."
            />
          </CardContent>
        </Card>
      )}
      {canFinancial ? (
        <DepositCollectDialog leaseId={leaseId} open={collectOpen} onOpenChange={setCollectOpen} />
      ) : null}
      {canSettleRefund && refundAction ? (
        <RefundActionDialog
          leaseId={leaseId}
          entry={refundAction.entry}
          type={refundAction.type}
          open
          onOpenChange={(open) => !open && setRefundAction(null)}
        />
      ) : null}
    </div>
  );
}

function HistoryTab({
  history,
}: {
  history: { id: string; eventType: string; eventDate: string; createdAt: string }[];
}) {
  if (!history.length)
    return (
      <Card className="border-slate-800 bg-slate-900/80">
        <CardContent className="p-6">
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title="Belum ada riwayat"
            description="Riwayat lifecycle aman akan muncul setelah ada aktivitas server."
          />
        </CardContent>
      </Card>
    );
  return (
    <Card className="border-slate-800 bg-slate-900/80">
      <CardContent className="divide-y divide-slate-800 p-0">
        {history.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium text-slate-100">{leaseHistoryLabel(entry.eventType)}</p>
              <p className="mt-1 text-xs text-slate-500">
                Metadata detail tidak ditampilkan untuk menjaga privasi.
              </p>
            </div>
            <time className="shrink-0 text-sm text-slate-400">{entry.eventDate}</time>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DepositCollectDialog({
  leaseId,
  open,
  onOpenChange,
}: {
  leaseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [transactionType, setTransactionType] = useState<"collection" | "top_up">("collection");
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const intentKey = useRef<string | null>(null);
  const collect = useM6LeaseMutation(
    "lease-deposit",
    "Deposit berhasil dicatat",
    (_propertyId, input: DepositCollectInput & { idempotencyKey: string }) =>
      adminUxLeaseApi.leases.collectDeposit(leaseId, input, input.idempotencyKey),
  );
  useEffect(() => {
    if (open) {
      setTransactionType("collection");
      setAmount(0);
      setPaymentMethod("cash");
      setReferenceNumber("");
      intentKey.current = null;
    }
  }, [open]);

  const paymentValid = hasRequiredLeasePaymentReference(amount, referenceNumber);

  const submit = async () => {
    if (!paymentValid) return;
    const idempotencyKey = intentKey.current ?? newIdempotencyKey();
    intentKey.current = idempotencyKey;
    try {
      await collect.mutateAsync({
        transactionType,
        amount,
        payment: { paymentMethod, referenceNumber: referenceNumber.trim() },
        idempotencyKey,
      });
      intentKey.current = null;
      onOpenChange(false);
    } catch {
      /* safe toast */
    }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !collect.isPending && onOpenChange(next)}>
      <DialogContent className="border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle>Catat deposit</DialogTitle>
          <DialogDescription>
            Hanya pembayaran yang telah diverifikasi boleh dicatat. Server memvalidasi saldo akhir.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Jenis">
            <Select
              value={transactionType}
              onValueChange={(value) => {
                setTransactionType(value as "collection" | "top_up");
                intentKey.current = null;
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="collection">Collection deposit</SelectItem>
                <SelectItem value="top_up">Top-up deposit</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Nominal" required>
            <CurrencyInput
              value={amount}
              onValueChange={(value) => {
                setAmount(value);
                intentKey.current = null;
              }}
              error={amount <= 0}
            />
          </Field>
          <Field label="Metode pembayaran" required>
            <Select
              value={paymentMethod}
              onValueChange={(value) => {
                setPaymentMethod(value as PaymentMethod);
                intentKey.current = null;
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Referensi pembayaran" required>
            <Input
              value={referenceNumber}
              maxLength={256}
              aria-invalid={!paymentValid}
              onChange={(event) => {
                setReferenceNumber(event.target.value);
                intentKey.current = null;
              }}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={collect.isPending}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button
            type="button"
            disabled={!paymentValid || collect.isPending}
            onClick={() => void submit()}
          >
            {collect.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Catat
            Deposit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundActionDialog({
  leaseId,
  entry,
  type,
  open,
  onOpenChange,
}: {
  leaseId: string;
  entry: DepositLedgerEntry;
  type: "settle" | "waive";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const intentKey = useRef<string | null>(null);
  const settle = useM6LeaseMutation(
    "lease-deposit",
    "Refund berhasil diselesaikan",
    (_propertyId, input: RefundSettlementInput & { idempotencyKey: string }) =>
      adminUxLeaseApi.leases.settleRefund(leaseId, entry.id, input, input.idempotencyKey),
  );
  const waive = useM6LeaseMutation(
    "lease-deposit",
    "Refund berhasil di-waive",
    (_propertyId, input: { reason: string; idempotencyKey: string }) =>
      adminUxLeaseApi.leases.waiveRefund(leaseId, entry.id, input.reason, input.idempotencyKey),
  );
  useEffect(() => {
    if (open) {
      setPaymentMethod("bank_transfer");
      setReference("");
      setReason("");
      intentKey.current = null;
    }
  }, [open]);
  const pending = settle.isPending || waive.isPending;
  const valid = type === "settle" ? Boolean(reference.trim()) : Boolean(reason.trim());
  const submit = async () => {
    if (!valid) return;
    const idempotencyKey = intentKey.current ?? newIdempotencyKey();
    intentKey.current = idempotencyKey;
    try {
      if (type === "settle")
        await settle.mutateAsync({
          paymentMethod,
          externalReference: reference.trim(),
          idempotencyKey,
        });
      else await waive.mutateAsync({ reason: reason.trim(), idempotencyKey });
      intentKey.current = null;
      onOpenChange(false);
    } catch {
      /* safe toast */
    }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle>{type === "settle" ? "Selesaikan refund" : "Waive refund"}</DialogTitle>
          <DialogDescription>
            Nominal refund {formatIDR(entry.amount)} tidak akan diubah.
          </DialogDescription>
        </DialogHeader>
        {type === "settle" ? (
          <div className="space-y-4">
            <Field label="Metode pembayaran" required>
              <Select
                value={paymentMethod}
                onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Referensi pencairan" required>
              <Input
                value={reference}
                maxLength={256}
                onChange={(event) => {
                  setReference(event.target.value);
                  intentKey.current = null;
                }}
              />
            </Field>
          </div>
        ) : (
          <Field label="Alasan waive" required>
            <Textarea
              value={reason}
              maxLength={2000}
              rows={3}
              onChange={(event) => {
                setReason(event.target.value);
                intentKey.current = null;
              }}
            />
          </Field>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button type="button" disabled={!valid || pending} onClick={() => void submit()}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {type === "settle" ? "Selesaikan Refund" : "Waive Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function depositTypeLabel(value: DepositLedgerEntry["transactionType"]): string {
  return {
    collection: "Collection",
    carry_forward: "Carry-forward",
    top_up: "Top-up",
    deduction: "Potongan",
    refund: "Refund",
  }[value];
}

function settlementLabel(value: DepositLedgerEntry["settlementStatus"]): string {
  return { pending: "Pending", settled: "Selesai", waived: "Waived" }[value];
}
