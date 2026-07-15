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
import type {
  AdminBillingPage,
  AdminInvoiceRecord,
  AdminInvoiceStatus,
  AdminPaymentRecord,
  AdminPaymentStatus,
} from "@/lib/admin-ux-billing-read-only";
import { formatIDR } from "@/lib/format";
import { useProperty } from "@/lib/property/useProperty";

export const Route = createFileRoute("/payments")({ component: PaymentsPage });

const PAGE_LIMIT = 20;
type BillingTab = "invoices" | "payments";
type Pagination = { propertyId: string | null; offset: number };

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

function PaymentsPage() {
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
  const invoiceOffset = invoicePage.propertyId === currentPropertyId ? invoicePage.offset : 0;
  const paymentOffset = paymentPage.propertyId === currentPropertyId ? paymentPage.offset : 0;

  const invoices = useAdminInvoices(
    {
      status: invoiceStatus === "all" ? undefined : invoiceStatus,
      limit: PAGE_LIMIT,
      offset: invoiceOffset,
    },
    tab === "invoices",
  );
  const payments = useAdminPayments(
    {
      status: paymentStatus === "all" ? undefined : paymentStatus,
      limit: PAGE_LIMIT,
      offset: paymentOffset,
    },
    tab === "payments",
  );

  const setInvoiceOffset = (offset: number) =>
    setInvoicePage({ propertyId: currentPropertyId, offset: Math.max(0, offset) });
  const setPaymentOffset = (offset: number) =>
    setPaymentPage({ propertyId: currentPropertyId, offset: Math.max(0, offset) });

  return (
    <AppShell title="Pembayaran" subtitle="Invoice dan pembayaran properti yang aman dan read-only">
      <Tabs value={tab} onValueChange={(value) => setTab(value as BillingTab)}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="invoices">Invoice</TabsTrigger>
            <TabsTrigger value="payments">Pembayaran</TabsTrigger>
          </TabsList>
          {tab === "invoices" ? (
            <InvoiceFilter
              value={invoiceStatus}
              onChange={(value) => {
                setInvoiceStatus(value);
                setInvoiceOffset(0);
              }}
            />
          ) : (
            <PaymentFilter
              value={paymentStatus}
              onChange={(value) => {
                setPaymentStatus(value);
                setPaymentOffset(0);
              }}
            />
          )}
        </div>

        <TabsContent value="invoices">
          <InvoicePanel query={invoices} onOffsetChange={setInvoiceOffset} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentPanel query={payments} onOffsetChange={setPaymentOffset} />
        </TabsContent>
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
