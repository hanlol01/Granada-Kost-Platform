import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Receipt } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { ForbiddenState } from "@/components/state/ForbiddenState";
import { LoadingState } from "@/components/state/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminInvoices, useAdminPayments } from "@/hooks/useAdminBillingReadOnly";
import {
  usePaymentTransactionDetail,
  usePaymentTransactions,
} from "@/hooks/usePaymentTransactions";
import {
  ADMIN_PAYMENT_TRANSACTION_STATUSES,
  canReadAdminPaymentTransactions,
  type AdminPaymentTransaction,
  type AdminPaymentTransactionStatus,
} from "@/lib/admin-ux-payment-gateway";
import type {
  AdminBillingPage,
  AdminInvoiceRecord,
  AdminInvoiceStatus,
  AdminPaymentRecord,
  AdminPaymentStatus,
} from "@/lib/admin-ux-billing-read-only";
import { useAuth } from "@/lib/auth";
import { formatIDR } from "@/lib/format";
import { useProperty } from "@/lib/property/useProperty";

export const Route = createFileRoute("/payments")({ component: PaymentsPage });

const PAGE_LIMIT = 20;
type BillingTab = "invoices" | "payments" | "online";
type Pagination = { propertyId: string | null; offset: number };
type GatewayState = {
  propertyId: string | null;
  status: AdminPaymentTransactionStatus | "all";
  offset: number;
  transactionId: string | null;
};

const INVOICE_STATUS_LABEL: Record<AdminInvoiceStatus, string> = {
  draft: "Draft",
  issued: "Diterbitkan",
  unpaid: "Belum lunas",
  partially_paid: "Dibayar sebagian",
  paid: "Lunas",
  overdue: "Jatuh tempo",
  void: "Void",
};

const PAYMENT_STATUS_LABEL: Record<AdminPaymentStatus, string> = {
  pending: "Menunggu",
  verified: "Terverifikasi",
  void: "Void",
};

const GATEWAY_STATUS_LABEL: Record<AdminPaymentTransactionStatus, string> = {
  created: "Dibuat",
  pending: "Menunggu",
  paid: "Lunas",
  failed: "Gagal",
  expired: "Kedaluwarsa",
  cancelled: "Dibatalkan",
  denied: "Ditolak",
  challenge: "Ditinjau",
  requires_review: "Perlu ditinjau",
  unknown: "Tidak diketahui",
};

function PaymentsPage() {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const [tab, setTab] = useState<BillingTab>("invoices");
  const [invoiceStatus, setInvoiceStatus] = useState<AdminInvoiceStatus | "all">("all");
  const [paymentStatus, setPaymentStatus] = useState<AdminPaymentStatus | "all">("all");
  const [invoicePage, setInvoicePage] = useState<Pagination>({
    propertyId: currentPropertyId,
    offset: 0,
  });
  const [paymentPage, setPaymentPage] = useState<Pagination>({
    propertyId: currentPropertyId,
    offset: 0,
  });
  const [gatewayState, setGatewayState] = useState<GatewayState>({
    propertyId: currentPropertyId,
    status: "all",
    offset: 0,
    transactionId: null,
  });
  const invoiceOffset = invoicePage.propertyId === currentPropertyId ? invoicePage.offset : 0;
  const paymentOffset = paymentPage.propertyId === currentPropertyId ? paymentPage.offset : 0;
  const gatewayMatchesProperty = gatewayState.propertyId === currentPropertyId;
  const gatewayStatus = gatewayMatchesProperty ? gatewayState.status : "all";
  const gatewayOffset = gatewayMatchesProperty ? gatewayState.offset : 0;
  const selectedGatewayTransactionId = gatewayMatchesProperty ? gatewayState.transactionId : null;
  const canReadGatewayTransactions =
    Boolean(currentPropertyId) &&
    canReadAdminPaymentTransactions({
      roles: user?.roles ?? [],
      permissions: user?.permissions ?? [],
    });
  const activeTab = tab === "online" && !canReadGatewayTransactions ? "invoices" : tab;

  const invoices = useAdminInvoices(
    {
      status: invoiceStatus === "all" ? undefined : invoiceStatus,
      limit: PAGE_LIMIT,
      offset: invoiceOffset,
    },
    activeTab === "invoices",
  );
  const payments = useAdminPayments(
    {
      status: paymentStatus === "all" ? undefined : paymentStatus,
      limit: PAGE_LIMIT,
      offset: paymentOffset,
    },
    activeTab === "payments",
  );
  const gatewayTx = usePaymentTransactions(
    {
      status: gatewayStatus === "all" ? undefined : gatewayStatus,
      limit: PAGE_LIMIT,
      offset: gatewayOffset,
    },
    { enabled: activeTab === "online" && canReadGatewayTransactions },
  );
  const detail = usePaymentTransactionDetail(selectedGatewayTransactionId, {
    enabled: activeTab === "online" && canReadGatewayTransactions,
  });

  const setInvoiceOffset = (offset: number) =>
    setInvoicePage({ propertyId: currentPropertyId, offset: Math.max(0, offset) });
  const setPaymentOffset = (offset: number) =>
    setPaymentPage({ propertyId: currentPropertyId, offset: Math.max(0, offset) });
  const updateGatewayState = (next: Partial<Omit<GatewayState, "propertyId">>) =>
    setGatewayState({
      propertyId: currentPropertyId,
      status: gatewayStatus,
      offset: gatewayOffset,
      transactionId: selectedGatewayTransactionId,
      ...next,
    });
  const setGatewayOffset = (offset: number) =>
    updateGatewayState({ offset: Math.max(0, offset), transactionId: null });

  return (
    <AppShell title="Pembayaran" subtitle="Invoice dan pembayaran properti yang aman dan read-only">
      <Tabs value={activeTab} onValueChange={(value) => setTab(value as BillingTab)}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="invoices">Invoice</TabsTrigger>
            <TabsTrigger value="payments">Pembayaran</TabsTrigger>
            {canReadGatewayTransactions ? <TabsTrigger value="online">Online</TabsTrigger> : null}
          </TabsList>
          {activeTab === "invoices" ? (
            <InvoiceFilter
              value={invoiceStatus}
              onChange={(value) => {
                setInvoiceStatus(value);
                setInvoiceOffset(0);
              }}
            />
          ) : activeTab === "payments" ? (
            <PaymentFilter
              value={paymentStatus}
              onChange={(value) => {
                setPaymentStatus(value);
                setPaymentOffset(0);
              }}
            />
          ) : (
            <GatewayFilter
              value={gatewayStatus}
              onChange={(status) => updateGatewayState({ status, offset: 0, transactionId: null })}
            />
          )}
        </div>

        <TabsContent value="invoices">
          <InvoicePanel query={invoices} onOffsetChange={setInvoiceOffset} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentPanel query={payments} onOffsetChange={setPaymentOffset} />
        </TabsContent>
        {canReadGatewayTransactions ? (
          <TabsContent value="online">
            <OnlinePanel
              query={gatewayTx}
              detail={detail}
              selectedTransactionId={selectedGatewayTransactionId}
              onSelectTransaction={(transactionId) => updateGatewayState({ transactionId })}
              onCloseDetail={() => updateGatewayState({ transactionId: null })}
              onOffsetChange={setGatewayOffset}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </AppShell>
  );
}

function InvoiceFilter({
  value,
  onChange,
}: {
  value: AdminInvoiceStatus | "all";
  onChange: (value: AdminInvoiceStatus | "all") => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as typeof value)}>
      <SelectTrigger className="w-48" aria-label="Filter status invoice">
        <SelectValue placeholder="Semua status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Semua status</SelectItem>
        {Object.entries(INVOICE_STATUS_LABEL).map(([status, label]) => (
          <SelectItem key={status} value={status}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PaymentFilter({
  value,
  onChange,
}: {
  value: AdminPaymentStatus | "all";
  onChange: (value: AdminPaymentStatus | "all") => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as typeof value)}>
      <SelectTrigger className="w-48" aria-label="Filter status pembayaran">
        <SelectValue placeholder="Semua status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Semua status</SelectItem>
        {Object.entries(PAYMENT_STATUS_LABEL).map(([status, label]) => (
          <SelectItem key={status} value={status}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// --- Payment gateway Online read-only
function GatewayFilter({
  value,
  onChange,
}: {
  value: AdminPaymentTransactionStatus | "all";
  onChange: (value: AdminPaymentTransactionStatus | "all") => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as typeof value)}>
      <SelectTrigger className="w-48" aria-label="Filter status transaksi online">
        <SelectValue placeholder="Semua status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Semua status</SelectItem>
        {ADMIN_PAYMENT_TRANSACTION_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {GATEWAY_STATUS_LABEL[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type QueryState<T> = {
  data?: AdminBillingPage<T>;
  error: unknown;
  hasAccess: boolean;
  isError: boolean;
  isPending: boolean;
  refetch: () => Promise<unknown>;
};

function isForbidden(query: QueryState<unknown>): boolean {
  return !query.hasAccess || (query.error as { status?: unknown } | null)?.status === 403;
}

function InvoicePanel({
  query,
  onOffsetChange,
}: {
  query: QueryState<AdminInvoiceRecord>;
  onOffsetChange: (offset: number) => void;
}) {
  if (isForbidden(query)) {
    return (
      <ForbiddenState description="Akun Anda tidak memiliki izin membaca invoice properti ini." />
    );
  }
  if (query.isPending) return <LoadingState label="Memuat invoice..." />;
  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        title="Gagal memuat invoice"
      />
    );
  }
  const page = query.data!;
  if (page.data.length === 0) {
    return (
      <EmptyPage
        title="Belum ada invoice"
        description="Tidak ada invoice untuk filter dan properti ini."
        page={page}
        onOffsetChange={onOffsetChange}
        icon={<Receipt className="h-5 w-5" />}
      />
    );
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Siklus</TableHead>
                <TableHead>Jatuh tempo</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Denda</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Dibayar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.invoice_code}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{INVOICE_STATUS_LABEL[invoice.invoice_status]}</Badge>
                  </TableCell>
                  <TableCell>
                    {formatDateOnly(invoice.cycle_start_date)}–
                    {formatDateOnly(invoice.cycle_end_date)}
                  </TableCell>
                  <TableCell>{formatDateOnly(invoice.due_date)}</TableCell>
                  <TableCell className="text-right">{formatIDR(invoice.subtotal_amount)}</TableCell>
                  <TableCell className="text-right">{formatIDR(invoice.late_fee_amount)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatIDR(invoice.total_amount)}
                  </TableCell>
                  <TableCell>{formatTimestamp(invoice.paid_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <PaginationControls page={page} onOffsetChange={onOffsetChange} />
    </div>
  );
}

function PaymentPanel({
  query,
  onOffsetChange,
}: {
  query: QueryState<AdminPaymentRecord>;
  onOffsetChange: (offset: number) => void;
}) {
  if (isForbidden(query)) {
    return (
      <ForbiddenState description="Akun Anda tidak memiliki izin membaca pembayaran properti ini." />
    );
  }
  if (query.isPending) return <LoadingState label="Memuat pembayaran..." />;
  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        title="Gagal memuat pembayaran"
      />
    );
  }
  const page = query.data!;
  if (page.data.length === 0) {
    return (
      <EmptyPage
        title="Belum ada pembayaran"
        description="Tidak ada pembayaran untuk filter dan properti ini."
        page={page}
        onOffsetChange={onOffsetChange}
        icon={<CreditCard className="h-5 w-5" />}
      />
    );
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pembayaran</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Nominal</TableHead>
                <TableHead>Dibayar</TableHead>
                <TableHead>Diverifikasi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="font-medium">{payment.payment_code}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{PAYMENT_STATUS_LABEL[payment.payment_status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatIDR(payment.amount)}
                  </TableCell>
                  <TableCell>{formatTimestamp(payment.paid_at)}</TableCell>
                  <TableCell>{formatTimestamp(payment.verified_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <PaginationControls page={page} onOffsetChange={onOffsetChange} />
    </div>
  );
}

function isForbiddenError(error: unknown): boolean {
  return (error as { status?: unknown } | null)?.status === 403;
}

function isNotFoundError(error: unknown): boolean {
  return (error as { status?: unknown } | null)?.status === 404;
}

function OnlinePanel({
  query,
  detail,
  selectedTransactionId,
  onSelectTransaction,
  onCloseDetail,
  onOffsetChange,
}: {
  query: ReturnType<typeof usePaymentTransactions>;
  detail: ReturnType<typeof usePaymentTransactionDetail>;
  selectedTransactionId: string | null;
  onSelectTransaction: (transactionId: string) => void;
  onCloseDetail: () => void;
  onOffsetChange: (offset: number) => void;
}) {
  if (isForbiddenError(query.error)) {
    return (
      <ForbiddenState description="Akun Anda tidak memiliki izin membaca transaksi pembayaran online properti ini." />
    );
  }
  if (query.isPending) return <LoadingState label="Memuat transaksi pembayaran online..." />;
  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        title="Gagal memuat transaksi pembayaran online"
      />
    );
  }

  const page = query.data!;
  if (page.data.length === 0) {
    return (
      <EmptyPage
        title="Belum ada transaksi pembayaran online"
        description="Tidak ada transaksi online untuk filter dan properti ini."
        page={page}
        onOffsetChange={onOffsetChange}
        icon={<CreditCard className="h-5 w-5" />}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Metode</TableHead>
                <TableHead className="text-right">Nominal</TableHead>
                <TableHead>Dibuat</TableHead>
                <TableHead>Dibayar</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="font-medium">{transaction.providerOrderId}</TableCell>
                  <TableCell>{transaction.provider}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{GATEWAY_STATUS_LABEL[transaction.status]}</Badge>
                  </TableCell>
                  <TableCell>{transaction.paymentMethod ?? "-"}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatIDR(transaction.amount)}
                  </TableCell>
                  <TableCell>{formatTimestamp(transaction.createdAt)}</TableCell>
                  <TableCell>{formatTimestamp(transaction.paidAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onSelectTransaction(transaction.id)}
                    >
                      Lihat detail
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <PaginationControls page={page} onOffsetChange={onOffsetChange} />
      <OnlineDetailPanel
        query={detail}
        transactionId={selectedTransactionId}
        onClose={onCloseDetail}
      />
    </div>
  );
}

function OnlineDetailPanel({
  query,
  transactionId,
  onClose,
}: {
  query: ReturnType<typeof usePaymentTransactionDetail>;
  transactionId: string | null;
  onClose: () => void;
}) {
  if (!transactionId) return null;
  if (isForbiddenError(query.error)) {
    return (
      <ForbiddenState description="Akun Anda tidak memiliki izin membaca detail transaksi ini." />
    );
  }
  if (query.isPending) return <LoadingState label="Memuat detail transaksi online..." />;
  if (isNotFoundError(query.error) || (!query.isError && !query.data)) {
    return (
      <EmptyState
        icon={<CreditCard className="h-5 w-5" />}
        title="Detail transaksi tidak tersedia"
        description="Transaksi tidak ditemukan atau tidak lagi tersedia."
      />
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        title="Gagal memuat detail transaksi"
      />
    );
  }

  return <OnlineTransactionDetail transaction={query.data!} onClose={onClose} />;
}

function OnlineTransactionDetail({
  transaction,
  onClose,
}: {
  transaction: AdminPaymentTransaction;
  onClose: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Detail transaksi online</h3>
            <p className="text-sm text-muted-foreground">{transaction.id}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Tutup detail
          </Button>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem label="Invoice" value={transaction.invoiceId} />
          <DetailItem label="Properti" value={transaction.propertyId} />
          <DetailItem label="Provider" value={transaction.provider} />
          <DetailItem label="Order provider" value={transaction.providerOrderId} />
          <DetailItem label="Status" value={GATEWAY_STATUS_LABEL[transaction.status]} />
          <DetailItem label="Metode" value={transaction.paymentMethod ?? "-"} />
          <DetailItem
            label="Nominal"
            value={`${formatIDR(transaction.amount)} ${transaction.currency}`}
          />
          <DetailItem label="Dibuat" value={formatTimestamp(transaction.createdAt)} />
          <DetailItem label="Diperbarui" value={formatTimestamp(transaction.updatedAt)} />
          <DetailItem label="Dibayar" value={formatTimestamp(transaction.paidAt)} />
          <DetailItem label="Gagal" value={formatTimestamp(transaction.failedAt)} />
        </dl>
      </CardContent>
    </Card>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}

function EmptyPage<T>({
  title,
  description,
  page,
  onOffsetChange,
  icon,
}: {
  title: string;
  description: string;
  page: AdminBillingPage<T>;
  onOffsetChange: (offset: number) => void;
  icon: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <EmptyState icon={icon} title={title} description={description} />
      {page.meta.offset > 0 ? (
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => onOffsetChange(page.meta.offset - page.meta.limit)}
          >
            Sebelumnya
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PaginationControls<T>({
  page,
  onOffsetChange,
}: {
  page: AdminBillingPage<T>;
  onOffsetChange: (offset: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Menampilkan {page.meta.offset + 1}–
        {Math.min(page.meta.offset + page.data.length, page.meta.total)} dari {page.meta.total}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={page.meta.offset === 0}
          onClick={() => onOffsetChange(page.meta.offset - page.meta.limit)}
        >
          Sebelumnya
        </Button>
        <Button
          variant="outline"
          disabled={page.meta.offset + page.meta.limit >= page.meta.total}
          onClick={() => onOffsetChange(page.meta.offset + page.meta.limit)}
        >
          Berikutnya
        </Button>
      </div>
    </div>
  );
}

function formatDateOnly(value: string): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
