import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Banknote,
  Download,
  FileCheck2,
  ReceiptText,
  RotateCcw,
  Search,
  WalletCards,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { ForbiddenState } from "@/components/state/ForbiddenState";
import { LoadingState } from "@/components/state/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useBillingPayments,
  useBillingProofs,
  useBillingReceipt,
  useBillingWorklist,
  useCreateOtherCharge,
  useRecordManualPayment,
  useRejectPayment,
  useRejectProof,
  useResidentBilling,
  useReversePayment,
  useVerifyPayment,
  useVerifyProof,
} from "@/hooks/useAdminW06Billing";
import { useFilePreview, useFileUpload } from "@/hooks/useFileUpload";
import {
  canManageW06Billing,
  canVerifyW06Payment,
  downloadAdminInvoiceDocument,
  type BillingProof,
  type BillingWorkspacePayment,
  type ResidentBilling,
  type W06PaymentMethod,
  type W06PaymentPurpose,
} from "@/lib/admin-w06-billing";
import { useAuth } from "@/lib/auth";
import { formatIDR } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";
import { useProperty } from "@/lib/property/useProperty";

type WorkspaceTab = "unpaid" | "paid" | "pending" | "other";

export function W06PaymentsWorkspace() {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const [tab, setTab] = useState<WorkspaceTab>("unpaid");
  const [month, setMonth] = useState(jakartaMonth());
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selection, setSelection] = useState<{ propertyId: string; residentId: string } | null>(
    null,
  );
  const selectedResidentId =
    selection?.propertyId === currentPropertyId ? selection.residentId : null;
  const canManage = canManageW06Billing({ roles: user?.roles, permissions: user?.permissions });
  const canVerify = canVerifyW06Payment({ roles: user?.roles, permissions: user?.permissions });
  const worklist = useBillingWorklist(currentPropertyId, { month, offset, search });
  const paid = useBillingPayments(currentPropertyId, "verified");
  const pendingPayments = useBillingPayments(currentPropertyId, "pending_confirmation");
  const proofs = useBillingProofs(currentPropertyId, "pending_review");
  const detail = useResidentBilling(currentPropertyId, selectedResidentId);

  useEffect(() => {
    setSelection(null);
    setOffset(0);
  }, [currentPropertyId]);

  if (!user?.permissions?.includes("billing.read"))
    return (
      <AppShell title="Pembayaran">
        <ForbiddenState description="Akun ini tidak memiliki izin membaca billing properti." />
      </AppShell>
    );

  return (
    <AppShell
      title="Pembayaran"
      subtitle="Tagihan kontrak, transfer manual, kas, DP, dan deposit dalam satu ledger"
    >
      <div key={currentPropertyId ?? "none"} className="space-y-5">
        <Tabs value={tab} onValueChange={(value) => setTab(value as WorkspaceTab)}>
          <TabsList className="h-auto min-h-11 flex-wrap justify-start">
            <TabsTrigger className="min-h-11" value="unpaid">
              Tagihan Belum Dibayar
            </TabsTrigger>
            <TabsTrigger className="min-h-11" value="paid">
              Tagihan Sudah Dibayar
            </TabsTrigger>
            <TabsTrigger className="min-h-11" value="pending">
              Pembayaran Menunggu Konfirmasi
            </TabsTrigger>
            <TabsTrigger className="min-h-11" value="other">
              Pembayaran Lainnya
            </TabsTrigger>
          </TabsList>

          <TabsContent value="unpaid" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                className="min-h-11 sm:max-w-44"
                type="month"
                value={month}
                onChange={(event) => {
                  setMonth(event.target.value);
                  setOffset(0);
                }}
                aria-label="Bulan tagihan"
              />
              <div className="relative flex-1 sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="min-h-11 pl-9"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setOffset(0);
                  }}
                  placeholder="Cari nama atau kamar"
                  aria-label="Cari tagihan"
                />
              </div>
            </div>
            <WorklistPanel
              query={worklist}
              onSelect={(residentId) =>
                setSelection(
                  currentPropertyId ? { propertyId: currentPropertyId, residentId } : null,
                )
              }
              onOffset={setOffset}
            />
          </TabsContent>

          <TabsContent value="paid">
            <PaidPanel
              query={paid}
              detail={detail.data ?? null}
              canManage={canManage}
              propertyId={currentPropertyId}
            />
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            <PendingPaymentPanel
              query={pendingPayments}
              canVerify={canVerify}
              propertyId={currentPropertyId}
            />
            <ProofPanel
              query={proofs}
              canVerify={canVerify}
              propertyId={currentPropertyId}
              onSelectResident={(residentId) =>
                setSelection(
                  currentPropertyId ? { propertyId: currentPropertyId, residentId } : null,
                )
              }
            />
          </TabsContent>

          <TabsContent value="other">
            <OtherChargePanel
              detail={detail.data ?? null}
              propertyId={currentPropertyId}
              canManage={canManage}
            />
          </TabsContent>
        </Tabs>

        {selectedResidentId ? (
          <ResidentBillingPanel
            query={detail}
            propertyId={currentPropertyId}
            canManage={canManage}
            onClose={() => setSelection(null)}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

function WorklistPanel({
  query,
  onSelect,
  onOffset,
}: {
  query: ReturnType<typeof useBillingWorklist>;
  onSelect: (residentId: string) => void;
  onOffset: (offset: number) => void;
}) {
  if (isForbidden(query.error))
    return <ForbiddenState description="Properti ini tidak dapat diakses." />;
  if (query.isPending) return <LoadingState label="Memuat tagihan bulan ini..." />;
  if (query.isError)
    return (
      <ErrorState
        title="Tagihan tidak dapat dimuat"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  if (!query.data?.data.length)
    return (
      <EmptyState
        icon={<ReceiptText className="h-5 w-5" />}
        title="Tidak ada tagihan aktif"
        description="Tidak ada invoice jatuh tempo bulan ini atau tunggakan sebelumnya."
      />
    );
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Penghuni / Kamar</TableHead>
                <TableHead>Cakupan</TableHead>
                <TableHead>Jatuh tempo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Sisa</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <p className="font-medium">{item.resident_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Kamar {item.room_number} · {item.invoice_code}
                    </p>
                  </TableCell>
                  <TableCell>
                    {dateOnly(item.coverage_start)}–{dateOnly(item.coverage_end)}
                  </TableCell>
                  <TableCell>{dateOnly(item.due_date)}</TableCell>
                  <TableCell>
                    <StatusBadge status={item.invoice_status} />
                  </TableCell>
                  <TableCell className="text-right">{formatIDR(item.total_amount)}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatIDR(item.outstanding_amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      className="min-h-11"
                      variant="outline"
                      onClick={() => onSelect(item.resident_id)}
                    >
                      Buka billing
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <PageButtons
        offset={query.data.meta.offset}
        limit={query.data.meta.limit}
        total={query.data.meta.total}
        onOffset={onOffset}
      />
    </div>
  );
}

function ResidentBillingPanel({
  query,
  propertyId,
  canManage,
  onClose,
}: {
  query: ReturnType<typeof useResidentBilling>;
  propertyId: string | null;
  canManage: boolean;
  onClose: () => void;
}) {
  if (query.isPending) return <LoadingState label="Memuat detail billing penghuni..." />;
  if (query.isError)
    return (
      <ErrorState
        title="Detail billing tidak tersedia"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  const data = query.data;
  if (!data) return null;
  return (
    <section aria-label="Detail billing penghuni" className="space-y-4 border-t border-border pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Detail billing kanonis
          </p>
          <h2 className="mt-1 text-xl font-semibold">Kontrak dan histori keuangan</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{data.lease.note}</p>
        </div>
        <Button variant="outline" className="min-h-11" onClick={onClose}>
          Tutup detail
        </Button>
      </div>
      <SummaryGrid data={data} />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <InvoiceHistory data={data} propertyId={propertyId} />
        <PaymentHistory data={data} propertyId={propertyId} canManage={canManage} />
      </div>
      {canManage ? <RecordPaymentDialog data={data} propertyId={propertyId} /> : null}
    </section>
  );
}

function SummaryGrid({ data }: { data: ResidentBilling }) {
  const items = [
    ["Nilai kontrak", formatIDR(data.lease.contract_rent)],
    ["Sewa ditagihkan", formatIDR(data.summary.rent_invoiced)],
    ["Sewa dibayar", formatIDR(data.summary.rent_paid)],
    ["Sewa belum dibayar", formatIDR(data.summary.rent_outstanding)],
    ["Deposit wajib", formatIDR(data.summary.security_deposit_required)],
    ["Deposit terkumpul", formatIDR(data.summary.deposit_collected)],
    ["Deposit dipotong", formatIDR(data.summary.deposit_deducted)],
    ["Deposit dikembalikan", formatIDR(data.summary.deposit_refunded)],
    ["Saldo deposit", formatIDR(data.summary.deposit_balance)],
    ["Periode", `${dateOnly(data.lease.start_date)}–${dateOnly(data.lease.end_date)}`],
    ["Sisa kontrak", `${data.lease.remaining_days} hari`],
    ["Paket", data.lease.payment_plan === "annual_full" ? "Tahunan penuh" : "Angsuran dua bulanan"],
    ["Progress", `${data.summary.installment_paid}/${data.summary.installment_total} angsuran`],
    [
      "Jatuh tempo berikut",
      data.summary.next_due_date ? dateOnly(data.summary.next_due_date) : "Tidak ada",
    ],
    ["Terlambat", `${data.summary.overdue_count} invoice`],
  ];
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
      {items.map(([label, value]) => (
        <div key={label} className="bg-card p-3">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-sm font-semibold">{value}</p>
        </div>
      ))}
    </div>
  );
}

function InvoiceHistory({
  data,
  propertyId,
}: {
  data: ResidentBilling;
  propertyId: string | null;
}) {
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invoice dan alokasi</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.invoices.map((invoice) => (
          <div key={invoice.id} className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{invoice.invoice_code}</p>
                <p className="text-xs text-muted-foreground">
                  {dateOnly(invoice.coverage_start)}–{dateOnly(invoice.coverage_end)} ·{" "}
                  {dateOnly(invoice.due_date)}
                </p>
              </div>
              <StatusBadge status={invoice.invoice_status} />
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span>{invoice.invoice_purpose === "rent" ? "Sewa" : "Tagihan lainnya"}</span>
              <span className="font-semibold">{formatIDR(invoice.outstanding_amount)} tersisa</span>
            </div>
            {invoice.invoice_status !== "draft" ? (
              <Button
                variant="outline"
                className="mt-3 min-h-11"
                disabled={!propertyId || documentId === invoice.id}
                onClick={() => {
                  if (!propertyId) return;
                  setDocumentId(invoice.id);
                  setDocumentError(null);
                  void downloadAdminInvoiceDocument(propertyId, invoice.id, invoice.invoice_code)
                    .then(() => setDocumentId(null))
                    .catch(() => {
                      setDocumentId(null);
                      setDocumentError(invoice.id);
                    });
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                {documentId === invoice.id ? "Menyiapkan PDF..." : "Unduh invoice"}
              </Button>
            ) : null}
            {documentError === invoice.id ? (
              <p role="alert" className="mt-2 text-xs text-destructive">
                PDF invoice belum dapat diunduh. Silakan coba lagi.
              </p>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PaymentHistory({
  data,
  propertyId,
  canManage,
}: {
  data: ResidentBilling;
  propertyId: string | null;
  canManage: boolean;
}) {
  const reverse = useReversePayment(propertyId);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const key = useLogicalKey(`${propertyId}:${candidate}:${reason}`);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pembayaran dan kuitansi</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada pembayaran.</p>
        ) : (
          data.payments.map((payment) => (
            <div key={payment.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{payment.payment_code}</p>
                  <p className="text-xs text-muted-foreground">
                    {methodLabel(payment.payment_method)} ·{" "}
                    {payment.paid_at ? timeOnly(payment.paid_at) : "Waktu belum tersedia"}
                  </p>
                </div>
                <Badge variant="outline">
                  {payment.reversal_id
                    ? "Dibalik"
                    : payment.payment_status === "verified"
                      ? "Terverifikasi"
                      : payment.payment_status === "pending_confirmation"
                        ? "Menunggu konfirmasi"
                        : payment.payment_status === "rejected"
                          ? "Ditolak"
                          : "Dibalik"}
                </Badge>
              </div>
              <p className="mt-2 text-right font-semibold">{formatIDR(payment.amount)}</p>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {payment.allocations.map((allocation) => (
                  <p key={allocation.invoice_id}>Alokasi invoice: {formatIDR(allocation.amount)}</p>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {payment.receipt_id ? (
                  <Button
                    className="min-h-11"
                    variant="outline"
                    onClick={() => setReceiptId(payment.receipt_id)}
                  >
                    <ReceiptText className="mr-2 h-4 w-4" /> Lihat kuitansi
                  </Button>
                ) : null}
                {canManage && payment.payment_status === "verified" && !payment.reversal_id ? (
                  <Button
                    className="min-h-11"
                    variant="destructive"
                    onClick={() => {
                      setCandidate(payment.id);
                      setReason("");
                    }}
                  >
                    Balik pembayaran
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}
        <ActionDialog
          open={Boolean(candidate)}
          title="Balik pembayaran terverifikasi?"
          description="Tindakan ini membuat catatan kompensasi, membuka kembali saldo invoice, dan tidak menghapus pembayaran asli."
          confirmLabel="Buat reversal"
          reason={reason}
          onReason={setReason}
          busy={reverse.isPending}
          onClose={() => setCandidate(null)}
          onConfirm={() =>
            candidate &&
            reverse.mutate(
              { paymentId: candidate, reason, idempotencyKey: key.current.key },
              { onSuccess: () => setCandidate(null) },
            )
          }
        />
        <AdminReceiptDialog
          propertyId={propertyId}
          receiptId={receiptId}
          onClose={() => setReceiptId(null)}
        />
      </CardContent>
    </Card>
  );
}

function AdminReceiptDialog({
  propertyId,
  receiptId,
  onClose,
}: {
  propertyId: string | null;
  receiptId: string | null;
  onClose: () => void;
}) {
  const query = useBillingReceipt(propertyId, receiptId);
  return (
    <Dialog open={Boolean(receiptId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kuitansi pembayaran</DialogTitle>
          <DialogDescription>
            Snapshot kuitansi bersifat tetap setelah diterbitkan.
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <LoadingState label="Memuat kuitansi..." />
        ) : query.isError ? (
          <ErrorState
            title="Kuitansi tidak dapat dimuat"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : query.data ? (
          <div className="space-y-2 rounded-xl border border-border p-4 text-sm">
            <DetailRow label="Nomor" value={query.data.receipt_code} />
            <DetailRow label="Diterbitkan" value={timeOnly(query.data.issued_at)} />
            <DetailRow label="Pembayaran" value={query.data.snapshot.payment_code} />
            <DetailRow label="Metode" value={methodLabel(query.data.snapshot.payment_method)} />
            <DetailRow label="Tujuan" value={purposeLabel(query.data.snapshot.payment_purpose)} />
            <DetailRow label="Nominal" value={formatIDR(query.data.amount)} />
          </div>
        ) : null}
        <DialogFooter>
          <Button className="min-h-11" onClick={onClose}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

function RecordPaymentDialog({
  data,
  propertyId,
}: {
  data: ResidentBilling;
  propertyId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<W06PaymentMethod>("bank_transfer");
  const [purpose, setPurpose] = useState<W06PaymentPurpose>("rent");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [depositAmount, setDepositAmount] = useState(0);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [fileId, setFileId] = useState<string | null>(null);
  const upload = useFileUpload();
  const mutation = useRecordManualPayment(propertyId);
  const eligible = useMemo(
    () =>
      data.invoices.filter(
        (invoice) =>
          invoice.outstanding_amount > 0 &&
          ["issued", "partially_paid", "overdue"].includes(invoice.invoice_status) &&
          invoice.invoice_purpose === (purpose === "other_charge" ? "other_charge" : "rent"),
      ),
    [data.invoices, purpose],
  );
  const allocations = Object.entries(selected)
    .filter(([, amount]) => amount > 0)
    .map(([invoice_id, amount]) => ({ invoice_id, amount }));
  const amount =
    purpose === "security_deposit"
      ? depositAmount
      : allocations.reduce((sum, item) => sum + item.amount, 0);
  const fingerprint = JSON.stringify({
    propertyId,
    data: data.lease.id,
    method,
    purpose,
    depositAmount,
    allocations,
    reference,
    note,
    fileId,
  });
  const key = useLogicalKey(fingerprint);
  useEffect(() => {
    if (!open) {
      setSelected({});
      setDepositAmount(0);
      setFileId(null);
      mutation.reset();
    }
  }, [open]);
  async function fileSelected(file: File) {
    if (!propertyId) return;
    const record = await upload.uploadAsync({ file, propertyId, filePurpose: "payment_proof" });
    setFileId(record.id);
  }
  function submit() {
    if (!propertyId || mutation.isPending) return;
    mutation.mutate(
      {
        input: {
          property_id: propertyId,
          resident_id: data.lease.resident_id,
          lease_id: data.lease.id,
          method,
          payment_purpose: purpose,
          amount,
          reference_number: reference || undefined,
          note: note || undefined,
          evidence_file_ids: fileId ? [fileId] : undefined,
          allocations: purpose === "security_deposit" ? [] : allocations,
        },
        idempotencyKey: key.current.key,
      },
      { onSuccess: () => setOpen(false) },
    );
  }
  return (
    <>
      <Button className="min-h-11" onClick={() => setOpen(true)}>
        <Banknote className="mr-2 h-4 w-4" />
        Catat pembayaran manual
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Catat pembayaran manual</DialogTitle>
            <DialogDescription>
              Pilih invoice dan alokasi eksplisit. Transfer tetap menunggu verifikasi; kas dicatat
              dan diterbitkan kuitansinya secara atomik.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Metode">
              <select
                className="min-h-11 w-full rounded-md border border-input bg-background px-3"
                value={method}
                onChange={(event) => {
                  setMethod(event.target.value as W06PaymentMethod);
                  setFileId(null);
                }}
              >
                <option value="bank_transfer">Transfer bank</option>
                <option value="cash">Kas diterima</option>
              </select>
            </Field>
            <Field label="Tujuan">
              <select
                className="min-h-11 w-full rounded-md border border-input bg-background px-3"
                value={purpose}
                onChange={(event) => {
                  setPurpose(event.target.value as W06PaymentPurpose);
                  setSelected({});
                  setDepositAmount(0);
                }}
              >
                <option value="rent">Sewa</option>
                <option value="dp">DP sewa</option>
                <option value="security_deposit">Deposit keamanan</option>
                <option value="other_charge">Tagihan lainnya</option>
              </select>
            </Field>
            {purpose === "security_deposit" ? (
              <Field label="Nominal deposit keamanan">
                <Input
                  type="number"
                  min={1}
                  value={depositAmount || ""}
                  onChange={(event) => setDepositAmount(Number(event.target.value))}
                />
                <p className="text-xs font-normal text-muted-foreground">
                  Deposit masuk ke ledger kewajiban terpisah dan tidak dialokasikan ke invoice sewa.
                </p>
              </Field>
            ) : (
              <div>
                <p className="mb-2 text-sm font-medium">Alokasi invoice</p>
                <div className="space-y-2">
                  {eligible.map((invoice) => (
                    <label
                      key={invoice.id}
                      className="grid grid-cols-[auto_1fr_9rem] items-center gap-3 rounded-lg border border-border p-3"
                    >
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={selected[invoice.id] !== undefined}
                        onChange={(event) =>
                          setSelected((current) => {
                            const next = { ...current };
                            if (event.target.checked) next[invoice.id] = invoice.outstanding_amount;
                            else delete next[invoice.id];
                            return next;
                          })
                        }
                      />
                      <span>
                        <span className="block text-sm font-medium">{invoice.invoice_code}</span>
                        <span className="text-xs text-muted-foreground">
                          Sisa {formatIDR(invoice.outstanding_amount)}
                        </span>
                      </span>
                      <Input
                        type="number"
                        min={1}
                        max={invoice.outstanding_amount}
                        disabled={selected[invoice.id] === undefined}
                        value={selected[invoice.id] ?? ""}
                        onChange={(event) =>
                          setSelected((current) => ({
                            ...current,
                            [invoice.id]: Number(event.target.value),
                          }))
                        }
                        aria-label={`Alokasi ${invoice.invoice_code}`}
                      />
                    </label>
                  ))}
                  {!eligible.length ? (
                    <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                      Tidak ada invoice yang dapat dialokasikan untuk tujuan ini.
                    </p>
                  ) : null}
                </div>
              </div>
            )}
            <div className="rounded-lg bg-muted p-3 text-sm">
              <span>Total alokasi</span>
              <strong className="float-right">{formatIDR(amount)}</strong>
            </div>
            <Field
              label={method === "bank_transfer" ? "Bukti transfer (wajib)" : "Bukti kas (opsional)"}
            >
              <Input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void fileSelected(file);
                }}
                disabled={upload.isUploading}
              />
              {fileId ? (
                <p className="mt-1 text-xs text-success">File tervalidasi dan siap ditautkan.</p>
              ) : null}
            </Field>
            <Field label="Nomor referensi">
              <Input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={100}
              />
            </Field>
            <Field label="Catatan">
              <textarea
                className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
              />
            </Field>
            {mutation.isError ? (
              <InlineMessage text="Pembayaran tidak dapat disimpan. Periksa saldo invoice dan coba lagi dengan data yang sama." />
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              className="min-h-11"
              disabled={
                mutation.isPending || amount <= 0 || (method === "bank_transfer" && !fileId)
              }
              onClick={submit}
            >
              {mutation.isPending ? "Menyimpan..." : "Simpan pembayaran"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PaidPanel({
  query,
  detail,
  canManage,
  propertyId,
}: {
  query: ReturnType<typeof useBillingPayments>;
  detail: ResidentBilling | null;
  canManage: boolean;
  propertyId: string | null;
}) {
  void detail;
  void canManage;
  void propertyId;
  if (query.isPending) return <LoadingState label="Memuat pembayaran terverifikasi..." />;
  if (query.isError)
    return (
      <ErrorState
        title="Pembayaran tidak dapat dimuat"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  if (!query.data?.data.length)
    return (
      <EmptyState
        icon={<WalletCards className="h-5 w-5" />}
        title="Belum ada pembayaran"
        description="Pembayaran terverifikasi akan muncul di sini."
      />
    );
  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kode</TableHead>
              <TableHead>Metode</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Tujuan</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Referensi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.data.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell className="font-medium">{payment.payment_code}</TableCell>
                <TableCell>{methodLabel(payment.payment_method)}</TableCell>
                <TableCell>{payment.paid_at ? timeOnly(payment.paid_at) : "-"}</TableCell>
                <TableCell>{purposeLabel(payment.payment_purpose)}</TableCell>
                <TableCell className="text-right font-semibold">
                  {formatIDR(payment.amount)}
                </TableCell>
                <TableCell>{payment.receipt_id ? "Kuitansi tersedia" : "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PendingPaymentPanel({
  query,
  canVerify,
  propertyId,
}: {
  query: ReturnType<typeof useBillingPayments>;
  canVerify: boolean;
  propertyId: string | null;
}) {
  const verify = useVerifyPayment(propertyId);
  const reject = useRejectPayment(propertyId);
  const [action, setAction] = useState<{
    kind: "verify" | "reject";
    payment: BillingWorkspacePayment;
  } | null>(null);
  const [reason, setReason] = useState("");
  const key = useLogicalKey([propertyId, action?.kind, action?.payment.id, reason].join(":"));
  if (query.isPending) return <LoadingState label="Memuat transfer menunggu konfirmasi..." />;
  if (query.isError)
    return (
      <ErrorState
        title="Transfer tidak dapat dimuat"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  if (!query.data?.data.length)
    return (
      <EmptyState
        icon={<Banknote className="h-5 w-5" />}
        title="Tidak ada transfer manual menunggu"
        description="Transfer manual yang dicatat Admin akan muncul di antrean ini."
      />
    );
  return (
    <div className="space-y-3">
      {query.data.data.map((payment) => (
        <Card key={payment.id}>
          <CardContent className="grid gap-4 p-4 md:grid-cols-[1fr_auto]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">
                  {payment.resident_name} · Kamar {payment.room_number}
                </p>
                <StatusBadge status={payment.payment_status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {payment.payment_code} · {formatIDR(payment.amount)} ·{" "}
                {purposeLabel(payment.payment_purpose)}
              </p>
              {payment.reference_number ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Referensi: {payment.reference_number}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {payment.evidence.map((file) => (
                  <EvidencePreview key={file.id} file={file} />
                ))}
              </div>
            </div>
            {canVerify ? (
              <div className="flex flex-wrap items-start gap-2">
                <Button className="min-h-11" onClick={() => setAction({ kind: "verify", payment })}>
                  Verifikasi
                </Button>
                <Button
                  className="min-h-11"
                  variant="destructive"
                  onClick={() => {
                    setReason("");
                    setAction({ kind: "reject", payment });
                  }}
                >
                  Tolak
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
      <ActionDialog
        open={Boolean(action)}
        title={action?.kind === "verify" ? "Verifikasi transfer?" : "Tolak transfer?"}
        description={
          action?.kind === "verify"
            ? "Alokasi, invoice, kuitansi, audit, dan outbox diselesaikan dalam satu transaksi."
            : "Penolakan tidak mengalokasikan dana atau menerbitkan kuitansi."
        }
        confirmLabel={action?.kind === "verify" ? "Verifikasi" : "Tolak transfer"}
        reason={reason}
        onReason={setReason}
        reasonOptional={action?.kind === "verify"}
        busy={verify.isPending || reject.isPending}
        onClose={() => setAction(null)}
        onConfirm={() => {
          if (!action) return;
          if (action.kind === "verify")
            verify.mutate(
              { paymentId: action.payment.id, idempotencyKey: key.current.key },
              { onSuccess: () => setAction(null) },
            );
          else
            reject.mutate(
              {
                paymentId: action.payment.id,
                reason,
                idempotencyKey: key.current.key,
              },
              { onSuccess: () => setAction(null) },
            );
        }}
      />
    </div>
  );
}

function ProofPanel({
  query,
  canVerify,
  propertyId,
  onSelectResident,
}: {
  query: ReturnType<typeof useBillingProofs>;
  canVerify: boolean;
  propertyId: string | null;
  onSelectResident: (residentId: string) => void;
}) {
  const verify = useVerifyProof(propertyId);
  const reject = useRejectProof(propertyId);
  const [action, setAction] = useState<{ kind: "verify" | "reject"; proof: BillingProof } | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const key = useLogicalKey(`${propertyId}:${action?.kind}:${action?.proof.id}:${reason}`);
  if (query.isPending) return <LoadingState label="Memuat bukti transfer..." />;
  if (query.isError)
    return (
      <ErrorState
        title="Bukti transfer tidak dapat dimuat"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  if (!query.data?.data.length)
    return (
      <EmptyState
        icon={<FileCheck2 className="h-5 w-5" />}
        title="Tidak ada bukti menunggu"
        description="Bukti baru dari Penghuni akan muncul di antrean ini."
      />
    );
  return (
    <div className="space-y-3">
      {query.data.data.map((proof) => (
        <Card key={proof.id}>
          <CardContent className="grid gap-4 p-4 md:grid-cols-[1fr_auto]">
            <div>
              <p className="font-semibold">
                {proof.resident_name} · Kamar {proof.room_number}
              </p>
              <p className="text-sm text-muted-foreground">
                {proof.invoice_code} · {formatIDR(proof.claimed_amount)} ·{" "}
                {purposeLabel(proof.payment_purpose)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {proof.evidence.map((file) => (
                  <EvidencePreview key={file.id} file={file} />
                ))}
              </div>
              {proof.notes ? <p className="mt-3 text-sm">Catatan: {proof.notes}</p> : null}
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <Button
                className="min-h-11"
                variant="outline"
                onClick={() => onSelectResident(proof.resident_id)}
              >
                Buka billing
              </Button>
              {canVerify ? (
                <>
                  <Button className="min-h-11" onClick={() => setAction({ kind: "verify", proof })}>
                    Verifikasi
                  </Button>
                  <Button
                    className="min-h-11"
                    variant="destructive"
                    onClick={() => {
                      setReason("");
                      setAction({ kind: "reject", proof });
                    }}
                  >
                    Tolak
                  </Button>
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ))}
      <ActionDialog
        open={Boolean(action)}
        title={action?.kind === "verify" ? "Verifikasi transfer?" : "Tolak bukti transfer?"}
        description={
          action?.kind === "verify"
            ? "Saldo invoice, alokasi, kuitansi, audit, dan outbox dibuat dalam satu transaksi."
            : "Berikan alasan aman yang dapat dipahami Penghuni."
        }
        confirmLabel={action?.kind === "verify" ? "Verifikasi" : "Tolak bukti"}
        reason={reason}
        onReason={setReason}
        reasonOptional={action?.kind === "verify"}
        busy={verify.isPending || reject.isPending}
        onClose={() => setAction(null)}
        onConfirm={() => {
          if (!action) return;
          if (action.kind === "verify")
            verify.mutate(
              { proofId: action.proof.id, idempotencyKey: key.current.key },
              { onSuccess: () => setAction(null) },
            );
          else
            reject.mutate(
              { proofId: action.proof.id, reason, idempotencyKey: key.current.key },
              { onSuccess: () => setAction(null) },
            );
        }}
      />
    </div>
  );
}

function OtherChargePanel({
  detail,
  propertyId,
  canManage,
}: {
  detail: ResidentBilling | null;
  propertyId: string | null;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<
    | "documented_damage"
    | "utilities"
    | "parking"
    | "lost_key_or_access_card"
    | "approved_administration"
    | "other"
  >("utilities");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [evidenceFileId, setEvidenceFileId] = useState<string | null>(null);
  const upload = useFileUpload();
  const mutation = useCreateOtherCharge(propertyId);
  const key = useLogicalKey(
    JSON.stringify({
      propertyId,
      lease: detail?.lease.id,
      category,
      description,
      amount,
      dueDate,
      evidenceFileId,
    }),
  );
  if (!detail)
    return (
      <EmptyState
        icon={<ReceiptText className="h-5 w-5" />}
        title="Pilih penghuni terlebih dahulu"
        description="Buka detail billing dari Tagihan Belum Dibayar atau antrean bukti untuk membuat tagihan lainnya."
      />
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tagihan lainnya berbasis invoice</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Kerusakan terdokumentasi, utilitas, parkir, kehilangan kunci/kartu, administrasi
          disetujui, atau kategori lain dengan deskripsi wajib.
        </p>
        {canManage ? (
          <Button className="mt-4 min-h-11" onClick={() => setOpen(true)}>
            Buat invoice lainnya
          </Button>
        ) : null}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Buat tagihan lainnya</DialogTitle>
              <DialogDescription>
                Tagihan mengikuti alokasi, kuitansi, reversal, audit, dan pelaporan yang sama dengan
                invoice sewa.
              </DialogDescription>
            </DialogHeader>
            <Field label="Kategori">
              <select
                className="min-h-11 w-full rounded-md border border-input bg-background px-3"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value as typeof category);
                  setEvidenceFileId(null);
                }}
              >
                <option value="documented_damage">Kerusakan terdokumentasi</option>
                <option value="utilities">Utilitas</option>
                <option value="parking">Parkir</option>
                <option value="lost_key_or_access_card">Kunci/kartu akses hilang</option>
                <option value="approved_administration">Administrasi disetujui</option>
                <option value="other">Lainnya</option>
              </select>
            </Field>
            <Field label="Deskripsi">
              <textarea
                className="min-h-24 w-full rounded-md border border-input bg-background p-3"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
              />
            </Field>
            <Field label="Nominal">
              <Input
                type="number"
                min={1}
                value={amount || ""}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
            </Field>
            <Field label="Jatuh tempo">
              <Input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </Field>
            {category === "documented_damage" ? (
              <Field label="Bukti kerusakan (wajib)">
                <Input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  disabled={upload.isUploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file || !propertyId) return;
                    void upload
                      .uploadAsync({ file, propertyId, filePurpose: "complaint_attachment" })
                      .then((record) => setEvidenceFileId(record.id));
                  }}
                />
                {evidenceFileId ? (
                  <p className="text-xs font-normal text-success">
                    Bukti tervalidasi dan siap ditautkan.
                  </p>
                ) : null}
              </Field>
            ) : null}
            {mutation.isError || upload.uploadError ? (
              <InlineMessage text="Tagihan tidak dapat dibuat. Periksa data dan bukti lalu coba lagi." />
            ) : null}
            <DialogFooter>
              <Button variant="outline" className="min-h-11" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button
                className="min-h-11"
                disabled={
                  mutation.isPending ||
                  upload.isUploading ||
                  description.trim().length < 3 ||
                  amount <= 0 ||
                  !dueDate ||
                  (category === "documented_damage" && !evidenceFileId)
                }
                onClick={() => {
                  if (!propertyId) return;
                  mutation.mutate(
                    {
                      input: {
                        property_id: propertyId,
                        resident_id: detail.lease.resident_id,
                        lease_id: detail.lease.id,
                        category,
                        description,
                        amount,
                        due_date: dueDate,
                        evidence_file_ids: evidenceFileId ? [evidenceFileId] : undefined,
                      },
                      idempotencyKey: key.current.key,
                    },
                    { onSuccess: () => setOpen(false) },
                  );
                }}
              >
                Buat invoice
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function EvidencePreview({ file }: { file: BillingProof["evidence"][number] }) {
  const preview = useFilePreview(file.id);
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2">
      {file.mime_type.startsWith("image/") && preview.data ? (
        <img
          src={preview.data}
          alt={file.original_filename}
          className="h-9 w-9 rounded object-cover"
        />
      ) : (
        <ReceiptText className="h-4 w-4" />
      )}
      <span className="max-w-48 truncate text-xs">{file.original_filename}</span>
    </div>
  );
}
function ActionDialog({
  open,
  title,
  description,
  confirmLabel,
  reason,
  onReason,
  reasonOptional = false,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  reason: string;
  onReason: (value: string) => void;
  reasonOptional?: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {!reasonOptional ? (
          <Field label="Alasan">
            <textarea
              className="min-h-24 w-full rounded-md border border-input bg-background p-3"
              value={reason}
              onChange={(event) => onReason(event.target.value)}
              maxLength={500}
            />
          </Field>
        ) : null}
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant={reasonOptional ? "default" : "destructive"}
            className="min-h-11"
            disabled={busy || (!reasonOptional && reason.trim().length < 10)}
            onClick={onConfirm}
          >
            {busy ? "Memproses..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}
function StatusBadge({ status }: { status: string }) {
  const label: Record<string, string> = {
    draft: "Draft",
    issued: "Diterbitkan",
    partially_paid: "Dibayar sebagian",
    paid: "Lunas",
    overdue: "Terlambat",
    void: "Void",
    pending_confirmation: "Menunggu konfirmasi",
    verified: "Terverifikasi",
    rejected: "Ditolak",
    reversed: "Dibalik",
  };
  return <Badge variant="outline">{label[status] ?? "Tidak tersedia"}</Badge>;
}
function PageButtons({
  offset,
  limit,
  total,
  onOffset,
}: {
  offset: number;
  limit: number;
  total: number;
  onOffset: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        className="min-h-11"
        variant="outline"
        disabled={offset === 0}
        onClick={() => onOffset(Math.max(0, offset - limit))}
      >
        Sebelumnya
      </Button>
      <Button
        className="min-h-11"
        variant="outline"
        disabled={offset + limit >= total}
        onClick={() => onOffset(offset + limit)}
      >
        Berikutnya
      </Button>
    </div>
  );
}
function InlineMessage({ text }: { text: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
    >
      {text}
    </p>
  );
}
function useLogicalKey(fingerprint: string) {
  const ref = useRef({ fingerprint, key: newIdempotencyKey() });
  if (ref.current.fingerprint !== fingerprint)
    ref.current = { fingerprint, key: newIdempotencyKey() };
  return ref;
}
function jakartaMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}
function dateOnly(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value}T00:00:00+07:00`));
}
function timeOnly(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}
function methodLabel(value: string) {
  return value === "cash" ? "Kas" : "Transfer bank";
}
function purposeLabel(value: string | null) {
  return (
    (
      {
        rent: "Sewa",
        dp: "DP sewa",
        security_deposit: "Deposit keamanan",
        other_charge: "Tagihan lainnya",
      } as Record<string, string>
    )[value ?? ""] ?? "Legacy"
  );
}
function isForbidden(error: unknown) {
  return (error as { status?: unknown } | null)?.status === 403;
}
