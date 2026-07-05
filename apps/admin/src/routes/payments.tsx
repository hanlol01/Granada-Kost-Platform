import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm/ConfirmDialog";
import { AttachedFilesPreview } from "@/components/file/AttachedFilesPreview";
import {
  useInvoices,
  usePaymentProofs,
  usePaymentProofFiles,
  type InvoiceRecord,
  type InvoiceStatus,
  type PaymentProofRecord,
  type PaymentProofStatus,
} from "@/hooks/useBilling";
import {
  useCancelInvoice,
  useIssueInvoice,
  useRejectPayment,
  useVerifyPayment,
} from "@/hooks/useBillingMutations";
import {
  usePaymentTransactions,
  usePaymentTransactionDetail,
  type PaymentTransactionRecord,
} from "@/hooks/usePaymentTransactions";
import { ForbiddenState } from "@/components/state/ForbiddenState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@granada-kost/api-client";
import { useAuth } from "@/lib/auth";
import { formatIDR, formatDate } from "@/lib/format";
import {
  CheckCircle2,
  CreditCard,
  Clock,
  AlertTriangle,
  Receipt,
  MoreHorizontal,
  Send,
  Ban,
  ThumbsUp,
  ThumbsDown,
  Eye,
  FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/payments")({ component: PaymentsPage });

type InvoiceTab = "all" | "unpaid" | "paid" | "payments" | "online";

function isInvoiceTab(value: string): value is InvoiceTab {
  return (
    value === "all" ||
    value === "unpaid" ||
    value === "paid" ||
    value === "payments" ||
    value === "online"
  );
}

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-muted text-muted-foreground" },
  issued: { label: "Terkirim", cls: "bg-primary-soft text-primary" },
  unpaid: { label: "Belum Lunas", cls: "bg-warning/20 text-warning-foreground" },
  partially_paid: { label: "Bayar Sebagian", cls: "bg-chart-4/15 text-chart-4" },
  paid: { label: "Lunas", cls: "bg-success/15 text-success" },
  overdue: { label: "Jatuh Tempo", cls: "bg-destructive/15 text-destructive" },
  void: { label: "Void", cls: "bg-muted text-muted-foreground line-through" },
};

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const item = INVOICE_STATUS_LABEL[status] ?? {
    label: status,
    cls: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium",
        item.cls,
      )}
    >
      {item.label}
    </span>
  );
}

function PaymentsPage() {
  const [tab, setTab] = useState<InvoiceTab>("all");
  const { hasPermission } = useAuth();
  const canManageInvoice = hasPermission("billing.manage");
  const canVerifyPayment = hasPermission("payment.verify");

  const statusParam: InvoiceStatus | undefined =
    tab === "unpaid" ? "unpaid" : tab === "paid" ? "paid" : undefined;

  const invoices = useInvoices({ status: statusParam, limit: 100 });
  const proofs = usePaymentProofs({ status: "pending_review" as PaymentProofStatus, limit: 100 });
  // Gateway (online) transactions — fetched only when the tab is active.
  const gatewayTx = usePaymentTransactions({ limit: 100 }, { enabled: tab === "online" });

  const items = invoices.data ?? [];

  const stats = useMemo(() => {
    const total = items.reduce((s, p) => s + p.totalAmount, 0);
    const paid = items
      .filter((p) => p.invoiceStatus === "paid")
      .reduce((s, p) => s + p.totalAmount, 0);
    const unpaid = items
      .filter((p) => ["unpaid", "overdue", "partially_paid", "issued"].includes(p.invoiceStatus))
      .reduce((s, p) => s + p.totalAmount, 0);
    const overdue = items.filter((p) => p.invoiceStatus === "overdue").length;
    return { total, paid, unpaid, overdue };
  }, [items]);

  const issueMut = useIssueInvoice();
  const cancelMut = useCancelInvoice();
  const verifyMut = useVerifyPayment();
  const rejectMut = useRejectPayment();

  const [issueTarget, setIssueTarget] = useState<InvoiceRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<InvoiceRecord | null>(null);
  const [reviewTarget, setReviewTarget] = useState<PaymentProofRecord | null>(null);
  const [verifyTarget, setVerifyTarget] = useState<PaymentProofRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PaymentProofRecord | null>(null);
  const [txDetailId, setTxDetailId] = useState<string | null>(null);

  return (
    <AppShell title="Pembayaran" subtitle="Kelola tagihan dan transaksi sewa">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {invoices.isLoading ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          <>
            <Stat
              icon={CreditCard}
              label="Total Tagihan"
              value={formatIDR(stats.total)}
              accent="bg-primary-soft text-primary"
            />
            <Stat
              icon={CheckCircle2}
              label="Sudah Lunas"
              value={formatIDR(stats.paid)}
              accent="bg-success/15 text-success"
            />
            <Stat
              icon={Clock}
              label="Belum Dibayar"
              value={formatIDR(stats.unpaid)}
              accent="bg-warning/20 text-warning-foreground"
            />
            <Stat
              icon={AlertTriangle}
              label="Jatuh Tempo"
              value={`${stats.overdue} tagihan`}
              accent="bg-destructive/15 text-destructive"
            />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Tagihan & Pembayaran</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(isInvoiceTab(v) ? v : "all")}>
            <TabsList>
              <TabsTrigger value="all">Semua</TabsTrigger>
              <TabsTrigger value="unpaid">Belum Lunas</TabsTrigger>
              <TabsTrigger value="paid">Riwayat</TabsTrigger>
              <TabsTrigger value="online">Online</TabsTrigger>
              {canVerifyPayment ? <TabsTrigger value="payments">Verifikasi</TabsTrigger> : null}
            </TabsList>
            <TabsContent value={tab} className="mt-4">
              {tab === "online" ? (
                gatewayTx.error ? (
                  isForbiddenError(gatewayTx.error) ? (
                    <ForbiddenState />
                  ) : (
                    <ErrorState
                      error={gatewayTx.error}
                      onRetry={() => gatewayTx.refetch()}
                      title="Gagal memuat transaksi pembayaran online"
                    />
                  )
                ) : gatewayTx.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (gatewayTx.data ?? []).length === 0 ? (
                  <EmptyState
                    icon={<CreditCard className="h-5 w-5" />}
                    title="Belum ada transaksi pembayaran online"
                    description="Transaksi gateway (Pembayaran Online) akan tampil di sini setelah penghuni memulai pembayaran."
                  />
                ) : (
                  <GatewayTransactionTable
                    items={gatewayTx.data ?? []}
                    onDetail={(t) => setTxDetailId(t.id)}
                  />
                )
              ) : tab === "payments" ? (
                proofs.error ? (
                  <ErrorState
                    error={proofs.error}
                    onRetry={() => proofs.refetch()}
                    title="Gagal memuat bukti pembayaran"
                  />
                ) : proofs.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (proofs.data ?? []).length === 0 ? (
                  <EmptyState
                    icon={<Receipt className="h-5 w-5" />}
                    title="Tidak ada bukti pembayaran pending"
                    description="Bukti pembayaran manual menunggu verifikasi akan tampil di sini."
                  />
                ) : (
                  <PendingProofList
                    items={proofs.data ?? []}
                    onReview={setReviewTarget}
                    onVerify={setVerifyTarget}
                    onReject={setRejectTarget}
                  />
                )
              ) : invoices.error ? (
                <ErrorState
                  error={invoices.error}
                  onRetry={() => invoices.refetch()}
                  title="Gagal memuat tagihan"
                />
              ) : invoices.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <EmptyState
                  icon={<Receipt className="h-5 w-5" />}
                  title="Tidak ada tagihan"
                  description={
                    tab === "unpaid"
                      ? "Tidak ada tagihan menunggu pembayaran saat ini."
                      : tab === "paid"
                        ? "Belum ada riwayat pembayaran."
                        : "Tagihan akan tampil saat invoice diterbitkan."
                  }
                />
              ) : (
                <InvoiceList
                  items={items}
                  isFetching={invoices.isFetching}
                  canManage={canManageInvoice}
                  onIssue={setIssueTarget}
                  onCancel={setCancelTarget}
                />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={issueTarget !== null}
        onOpenChange={(o) => !o && setIssueTarget(null)}
        title="Terbitkan invoice"
        description={
          issueTarget
            ? `Invoice ${issueTarget.invoiceCode} untuk ${issueTarget.snapshotResidentName} akan diterbitkan dan dikirim ke penghuni.`
            : null
        }
        confirmLabel="Terbitkan"
        pending={issueMut.isPending}
        onConfirm={async () => {
          if (!issueTarget) return;
          try {
            await issueMut.mutateAsync({ invoiceId: issueTarget.id });
            setIssueTarget(null);
          } catch {
            // Already toasted by hook.
          }
        }}
      />

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        title="Batalkan invoice"
        description={
          cancelTarget
            ? `Invoice ${cancelTarget.invoiceCode} akan dibatalkan. Tindakan ini dicatat audit log.`
            : null
        }
        confirmLabel="Batalkan Invoice"
        destructive
        reason={{
          label: "Alasan pembatalan",
          placeholder: "Mis. duplikat, salah input",
          minLength: 3,
        }}
        pending={cancelMut.isPending}
        onConfirm={async (reason) => {
          if (!cancelTarget || !reason) return;
          try {
            await cancelMut.mutateAsync({ invoiceId: cancelTarget.id, reason });
            setCancelTarget(null);
          } catch {
            // Already toasted.
          }
        }}
      />

      {/* Payment proof review dialog with file preview */}
      <PaymentProofReviewDialog
        proof={reviewTarget}
        onClose={() => setReviewTarget(null)}
        onVerify={setVerifyTarget}
        onReject={setRejectTarget}
      />

      <ConfirmDialog
        open={verifyTarget !== null}
        onOpenChange={(o) => !o && setVerifyTarget(null)}
        title="Verifikasi bukti pembayaran"
        description={
          verifyTarget
            ? `Bukti pembayaran senilai ${formatIDR(verifyTarget.claimedAmount)} (${verifyTarget.paymentMethod.toUpperCase()}) akan diverifikasi dan dicatat sebagai pembayaran lunas.`
            : null
        }
        confirmLabel="Verifikasi"
        pending={verifyMut.isPending}
        onConfirm={async () => {
          if (!verifyTarget) return;
          try {
            await verifyMut.mutateAsync({ paymentId: verifyTarget.id });
            setVerifyTarget(null);
            setReviewTarget(null);
          } catch {
            // Already toasted.
          }
        }}
      />

      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(o) => !o && setRejectTarget(null)}
        title="Tolak bukti pembayaran"
        description={
          rejectTarget
            ? `Bukti pembayaran senilai ${formatIDR(rejectTarget.claimedAmount)} akan ditolak dan dicatat audit log.`
            : null
        }
        confirmLabel="Tolak Bukti"
        destructive
        reason={{ label: "Alasan penolakan", placeholder: "Mis. bukti tidak valid", minLength: 3 }}
        pending={rejectMut.isPending}
        onConfirm={async (reason) => {
          if (!rejectTarget || !reason) return;
          try {
            await rejectMut.mutateAsync({ paymentId: rejectTarget.id, reason });
            setRejectTarget(null);
            setReviewTarget(null);
          } catch {
            // Already toasted.
          }
        }}
      />

      {/* Gateway (online) transaction detail — safe normalized fields only. */}
      <PaymentTransactionDetailDialog
        transactionId={txDetailId}
        onClose={() => setTxDetailId(null)}
      />
    </AppShell>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {label}
            </p>
            <p className="text-lg lg:text-xl font-semibold mt-2 tracking-tight">{value}</p>
          </div>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${accent}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatSkeleton() {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-32" />
      </CardContent>
    </Card>
  );
}

function InvoiceList({
  items,
  isFetching,
  canManage,
  onIssue,
  onCancel,
}: {
  items: InvoiceRecord[];
  isFetching: boolean;
  canManage: boolean;
  onIssue: (inv: InvoiceRecord) => void;
  onCancel: (inv: InvoiceRecord) => void;
}) {
  return (
    <div className={cn("space-y-2", isFetching && "opacity-90 transition-opacity")}>
      {items.map((p) => {
        const canIssue = canManage && p.invoiceStatus === "draft";
        const canCancel = canManage && p.invoiceStatus !== "paid" && p.invoiceStatus !== "void";
        return (
          <div
            key={p.id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-border hover:bg-muted/30 transition-colors"
          >
            <div className="h-10 w-10 rounded-full bg-primary-soft text-primary flex items-center justify-center font-semibold shrink-0">
              {p.snapshotResidentName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{p.snapshotResidentName}</p>
              <p className="text-xs text-muted-foreground">
                Kamar #{p.snapshotRoomNumber} · {p.invoiceCode} · Jatuh tempo{" "}
                {formatDate(p.dueDate)}
              </p>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
              <p className="font-semibold">{formatIDR(p.totalAmount)}</p>
              <InvoiceStatusBadge status={p.invoiceStatus} />
              {canManage ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" aria-label="Aksi invoice">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canIssue ? (
                      <DropdownMenuItem onClick={() => onIssue(p)}>
                        <Send className="h-3.5 w-3.5 mr-2" /> Terbitkan
                      </DropdownMenuItem>
                    ) : null}
                    {canCancel ? (
                      <>
                        {canIssue ? <DropdownMenuSeparator /> : null}
                        <DropdownMenuItem className="text-destructive" onClick={() => onCancel(p)}>
                          <Ban className="h-3.5 w-3.5 mr-2" /> Batalkan
                        </DropdownMenuItem>
                      </>
                    ) : null}
                    {!canIssue && !canCancel ? (
                      <DropdownMenuItem disabled>Tidak ada aksi tersedia</DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const PROOF_STATUS_LABEL: Record<PaymentProofStatus, { label: string; cls: string }> = {
  pending_review: { label: "Menunggu Review", cls: "bg-warning/20 text-warning-foreground" },
  verified: { label: "Diverifikasi", cls: "bg-success/15 text-success" },
  rejected: { label: "Ditolak", cls: "bg-destructive/15 text-destructive" },
  expired: { label: "Kadaluarsa", cls: "bg-muted text-muted-foreground" },
};

function PendingProofList({
  items,
  onReview,
  onVerify,
  onReject,
}: {
  items: PaymentProofRecord[];
  onReview: (p: PaymentProofRecord) => void;
  onVerify: (p: PaymentProofRecord) => void;
  onReject: (p: PaymentProofRecord) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((p) => {
        const statusMeta = PROOF_STATUS_LABEL[p.proofStatus] ?? {
          label: p.proofStatus,
          cls: "bg-muted text-muted-foreground",
        };
        return (
          <div
            key={p.id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-border hover:bg-muted/30 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{p.paymentMethod.toUpperCase()}</p>
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium",
                    statusMeta.cls,
                  )}
                >
                  {statusMeta.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatIDR(p.claimedAmount)}
                {p.notes ? ` · ${p.notes}` : ""}
                {" · "}
                {formatDate(p.uploadedAt.slice(0, 10))}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => onReview(p)}>
                <Eye className="h-3.5 w-3.5 mr-1" /> Lihat Bukti
              </Button>
              <Button variant="outline" size="sm" onClick={() => onVerify(p)}>
                <ThumbsUp className="h-3.5 w-3.5 mr-1" /> Verifikasi
              </Button>
              <Button variant="outline" size="sm" onClick={() => onReject(p)}>
                <ThumbsDown className="h-3.5 w-3.5 mr-1 text-destructive" /> Tolak
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Dialog showing payment proof details and attached file previews. */
function PaymentProofReviewDialog({
  proof,
  onClose,
  onVerify,
  onReject,
}: {
  proof: PaymentProofRecord | null;
  onClose: () => void;
  onVerify: (p: PaymentProofRecord) => void;
  onReject: (p: PaymentProofRecord) => void;
}) {
  const isOpen = proof !== null;
  const filesQuery = usePaymentProofFiles(proof?.id ?? null);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {proof && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" />
                Review Bukti Pembayaran Manual
              </DialogTitle>
              <DialogDescription className="text-xs">
                Periksa bukti sebelum memverifikasi atau menolak.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Metode</p>
                  <p className="font-medium">{proof.paymentMethod.toUpperCase()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Jumlah Klaim</p>
                  <p className="font-medium">{formatIDR(proof.claimedAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tanggal Upload</p>
                  <p className="font-medium">{formatDate(proof.uploadedAt.slice(0, 10))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-medium">
                    {PROOF_STATUS_LABEL[proof.proofStatus]?.label ?? proof.proofStatus}
                  </p>
                </div>
              </div>
              {proof.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Catatan Penghuni</p>
                  <p className="text-sm">{proof.notes}</p>
                </div>
              )}

              {/* Attached proof files */}
              <AttachedFilesPreview
                files={filesQuery.data}
                isLoading={filesQuery.isLoading}
                label="Bukti Pembayaran"
                size={80}
              />

              {proof.proofStatus === "pending_review" && (
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button size="sm" onClick={() => onVerify(proof)}>
                    <ThumbsUp className="h-3.5 w-3.5 mr-1" /> Verifikasi
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onReject(proof)}>
                    <ThumbsDown className="h-3.5 w-3.5 mr-1 text-destructive" /> Tolak
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- Payment gateway (online) transactions — M15C-E2A ---

const GATEWAY_TX_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  created: { label: "Dibuat", cls: "bg-muted text-muted-foreground" },
  pending: { label: "Menunggu", cls: "bg-warning/20 text-warning-foreground" },
  paid: { label: "Lunas", cls: "bg-success/15 text-success" },
  failed: { label: "Gagal", cls: "bg-destructive/15 text-destructive" },
  expired: { label: "Kadaluarsa", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Dibatalkan", cls: "bg-muted text-muted-foreground" },
  denied: { label: "Ditolak", cls: "bg-destructive/15 text-destructive" },
  challenge: { label: "Perlu Tinjauan", cls: "bg-warning/20 text-warning-foreground" },
  requires_review: { label: "Perlu Tinjauan", cls: "bg-warning/20 text-warning-foreground" },
  unknown: { label: "Perlu Tinjauan", cls: "bg-warning/20 text-warning-foreground" },
};

function isForbiddenError(error: unknown): boolean {
  return ApiError.isApiError(error) && error.status === 403;
}

function GatewayTxStatusBadge({ status }: { status: string }) {
  const meta = GATEWAY_TX_STATUS_LABEL[status] ?? {
    label: "Perlu Tinjauan",
    cls: "bg-warning/20 text-warning-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium",
        meta.cls,
      )}
    >
      {meta.label}
    </span>
  );
}

function GatewaySourceBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary-soft text-primary">
      Gateway
    </span>
  );
}

function AutoConfirmedChip() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/15 text-success">
      Terkonfirmasi Otomatis
    </span>
  );
}

function gatewayMethodLabel(method?: string | null): string {
  switch (method) {
    case "bank_transfer":
      return "Transfer Bank";
    case "qris":
      return "QRIS";
    case "ewallet":
      return "E-Wallet";
    case "card":
    case "credit_card":
      return "Kartu";
    case null:
    case undefined:
    case "":
      return "-";
    default:
      return "Lainnya";
  }
}

function fmtDateSafe(value?: string | null): string {
  return value ? formatDate(value.slice(0, 10)) : "-";
}

function GatewayTransactionTable({
  items,
  onDetail,
}: {
  items: PaymentTransactionRecord[];
  onDetail: (t: PaymentTransactionRecord) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Penghuni</TableHead>
            <TableHead>Jumlah</TableHead>
            <TableHead>Sumber</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Metode</TableHead>
            <TableHead>Dibuat</TableHead>
            <TableHead>Lunas</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">{t.invoiceCode ?? t.invoiceId ?? "-"}</TableCell>
              <TableCell>{t.residentName ?? "-"}</TableCell>
              <TableCell>{typeof t.amount === "number" ? formatIDR(t.amount) : "-"}</TableCell>
              <TableCell>
                <GatewaySourceBadge />
              </TableCell>
              <TableCell className="text-muted-foreground">{t.provider ?? "-"}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <GatewayTxStatusBadge status={String(t.status)} />
                  {String(t.status) === "paid" ? <AutoConfirmedChip /> : null}
                </div>
              </TableCell>
              <TableCell>{gatewayMethodLabel(t.paymentMethod)}</TableCell>
              <TableCell>{fmtDateSafe(t.createdAt)}</TableCell>
              <TableCell>{fmtDateSafe(t.paidAt)}</TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" onClick={() => onDetail(t)}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> Detail
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Pembayaran gateway yang lunas terkonfirmasi otomatis oleh sistem (webhook) dan tidak perlu
        verifikasi manual. Bukti pembayaran manual tetap diverifikasi pada tab Verifikasi.
      </p>
    </div>
  );
}

/** Detail dialog for a gateway transaction — normalized, sanitized fields only. */
function PaymentTransactionDetailDialog({
  transactionId,
  onClose,
}: {
  transactionId: string | null;
  onClose: () => void;
}) {
  const isOpen = transactionId !== null;
  const detail = usePaymentTransactionDetail(transactionId);
  const t = detail.data ?? null;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <CreditCard className="h-4 w-4" />
            Detail Transaksi Pembayaran Online
          </DialogTitle>
          <DialogDescription className="text-xs">
            Data ternormalisasi dan aman — tanpa payload mentah provider, signature, atau
            kredensial.
          </DialogDescription>
        </DialogHeader>
        {detail.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : detail.error ? (
          <ErrorState
            error={detail.error}
            onRetry={() => detail.refetch()}
            title="Gagal memuat detail transaksi"
          />
        ) : t ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <TxDetailField label="Sumber" value="Gateway" />
              <TxDetailField label="Provider" value={t.provider ?? "-"} />
              <TxDetailField label="Order ID" value={t.providerOrderId ?? "-"} mono />
              <TxDetailField label="Transaction ID" value={t.providerTransactionId ?? "-"} mono />
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <GatewayTxStatusBadge status={String(t.status)} />
                  {String(t.status) === "paid" ? <AutoConfirmedChip /> : null}
                </div>
              </div>
              <TxDetailField label="Metode" value={gatewayMethodLabel(t.paymentMethod)} />
              <TxDetailField
                label="Jumlah"
                value={typeof t.amount === "number" ? formatIDR(t.amount) : "-"}
              />
              <TxDetailField label="Mata Uang" value={t.currency ?? "IDR"} />
              <TxDetailField label="Dibuat" value={fmtDateSafe(t.createdAt)} />
              <TxDetailField label="Kedaluwarsa" value={fmtDateSafe(t.expiresAt)} />
              <TxDetailField label="Lunas" value={fmtDateSafe(t.paidAt)} />
              <TxDetailField label="Invoice" value={t.invoiceCode ?? t.invoiceId ?? "-"} />
            </div>
            {["requires_review", "challenge", "unknown"].includes(String(t.status)) ? (
              <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs">
                <span className="font-medium">Perlu Tinjauan:</span> transaksi ini membutuhkan
                tindak lanjut manual admin. Tidak ada aksi settlement otomatis dari halaman ini.
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TxDetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("font-medium break-all", mono && "font-mono text-xs")}>{value}</p>
    </div>
  );
}
