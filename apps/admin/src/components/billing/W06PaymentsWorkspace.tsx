import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";
import {
  Banknote,
  Download,
  Eye,
  FileCheck2,
  ReceiptText,
  RotateCcw,
  Search,
  WalletCards,
} from "lucide-react";
import type { FileResponse } from "@granada-kost/domain";
import { FileUploadField } from "@/components/file/FileUploadField";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { ForbiddenState } from "@/components/state/ForbiddenState";
import { LoadingState } from "@/components/state/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
import { MonthYearPicker } from "@/components/ui/month-year-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterResultNotice } from "@/components/ui/filter-result-notice";
import { NoticeAlert } from "@/components/ui/notice-alert";
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
import { useFilePreview } from "@/hooks/useFileUpload";
import {
  canManageW06Billing,
  canVerifyW06Payment,
  downloadAdminInvoiceDocument,
  downloadAdminReceiptDocument,
  type BillingProof,
  type BillingWorkspacePayment,
  type ResidentBilling,
  type W06PaymentMethod,
  type W06PaymentPurpose,
} from "@/lib/admin-w06-billing";
import { useAuth } from "@/lib/auth";
import { formatIDR } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationSuccess } from "@/lib/mutation-feedback";
import { useProperty } from "@/lib/property/useProperty";

type WorkspaceTab = "unpaid" | "paid" | "pending" | "other";

export function W06PaymentsWorkspace() {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const [tab, setTab] = useState<WorkspaceTab>(() => {
    if (typeof window !== "undefined" && window.location.hash === "#pending") return "pending";
    return "unpaid";
  });
  const [month, setMonth] = useState(jakartaMonth());
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [invoiceStatus, setInvoiceStatus] = useState<"" | "issued" | "partially_paid" | "overdue">(
    "",
  );
  const [invoiceSort, setInvoiceSort] = useState<"due_date_asc" | "due_date_desc" | "resident_asc">(
    "due_date_asc",
  );
  const [dueWithinDaysInput, setDueWithinDaysInput] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const dueWithinDays = parseDueWithinDays(dueWithinDaysInput);
  const hasInvalidDueWithinDays = dueWithinDaysInput !== "" && dueWithinDays === undefined;
  const [offset, setOffset] = useState(0);
  const [paymentSearch, setPaymentSearch] = useState("");
  const deferredPaymentSearch = useDeferredValue(paymentSearch.trim());
  const [paymentMethod, setPaymentMethod] = useState<"" | W06PaymentMethod>("");
  const [paymentPurpose, setPaymentPurpose] = useState<"" | W06PaymentPurpose>("");
  const [paymentOffset, setPaymentOffset] = useState(0);
  const [selection, setSelection] = useState<{ propertyId: string; residentId: string } | null>(
    null,
  );
  const selectedResidentId =
    selection?.propertyId === currentPropertyId ? selection.residentId : null;
  const detailSectionRef = useRef<HTMLElement>(null);
  const canManage = canManageW06Billing({ roles: user?.roles, permissions: user?.permissions });
  const canVerify = canVerifyW06Payment({ roles: user?.roles, permissions: user?.permissions });
  const worklist = useBillingWorklist(currentPropertyId, {
    month,
    offset,
    search: deferredSearch,
    status: invoiceStatus || undefined,
    sort: invoiceSort,
    dueWithinDays,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const paymentFilters = {
    offset: paymentOffset,
    search: deferredPaymentSearch || undefined,
    method: paymentMethod || undefined,
    purpose: paymentPurpose || undefined,
    dueWithinDays,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };
  const paid = useBillingPayments(currentPropertyId, "verified", paymentFilters);
  const pendingPayments = useBillingPayments(
    currentPropertyId,
    "pending_confirmation",
    paymentFilters,
  );
  const proofs = useBillingProofs(currentPropertyId, "pending_review");
  const detail = useResidentBilling(currentPropertyId, selectedResidentId);
  const activeFilterCount =
    Number(Boolean(deferredSearch)) +
    Number(month !== jakartaMonth()) +
    Number(Boolean(invoiceStatus)) +
    Number(invoiceSort !== "due_date_asc") +
    Number(Boolean(dueWithinDaysInput)) +
    Number(Boolean(dateFrom)) +
    Number(Boolean(dateTo));
  const paymentActiveFilterCount =
    Number(Boolean(deferredPaymentSearch)) +
    Number(Boolean(paymentMethod)) +
    Number(Boolean(paymentPurpose)) +
    Number(Boolean(dueWithinDaysInput)) +
    Number(Boolean(dateFrom)) +
    Number(Boolean(dateTo));
  const filterSignature = `${month}:${deferredSearch}:${invoiceStatus}:${invoiceSort}:${dueWithinDaysInput}:${dateFrom}:${dateTo}`;
  const paymentFilterSignature = `${deferredPaymentSearch}:${paymentMethod}:${paymentPurpose}:${dueWithinDaysInput}:${dateFrom}:${dateTo}`;
  const invoiceFilterCriteria = [
    deferredSearch ? `pencarian "${deferredSearch}"` : "",
    month !== jakartaMonth() ? `periode: ${monthLabel(month)}` : "",
    invoiceStatus
      ? `status tagihan: ${
          {
            issued: "Belum dibayar",
            partially_paid: "Dibayar sebagian",
            overdue: "Terlambat",
          }[invoiceStatus]
        }`
      : "",
    invoiceSort !== "due_date_asc"
      ? `urutan: ${invoiceSort === "due_date_desc" ? "jatuh tempo terjauh" : "nama penghuni A-Z"}`
      : "",
    dueWithinDaysInput ? `tenggat jatuh tempo dalam ${dueWithinDaysInput} hari` : "",
    dateRangeFilterLabel(dateFrom, dateTo),
  ].filter(Boolean);
  const paymentFilterCriteria = [
    deferredPaymentSearch ? `pencarian "${deferredPaymentSearch}"` : "",
    paymentMethod ? `metode: ${methodLabel(paymentMethod)}` : "",
    paymentPurpose ? `jenis pembayaran: ${purposeLabel(paymentPurpose)}` : "",
    dueWithinDaysInput ? `tenggat jatuh tempo dalam ${dueWithinDaysInput} hari` : "",
    dateRangeFilterLabel(dateFrom, dateTo),
  ].filter(Boolean);

  useEffect(() => {
    setSelection(null);
    setOffset(0);
    setPaymentOffset(0);
  }, [currentPropertyId]);

  useEffect(() => {
    if (!selectedResidentId || !detail.data || !detailSectionRef.current) return;
    detailSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    detailSectionRef.current.focus({ preventScroll: true });
  }, [detail.data, selectedResidentId]);

  if (!user?.permissions?.includes("billing.read"))
    return (
      <AppShell title="Pembayaran">
        <ForbiddenState description="Akun ini tidak memiliki izin membaca billing properti." />
      </AppShell>
    );

  return (
    <AppShell
      title="Pembayaran"
      subtitle="Tagihan sewa, pembayaran, DP, dan deposit dalam satu ruang kerja"
    >
      <div key={currentPropertyId ?? "none"} className="space-y-5">
        <NoticeAlert
          tone="info"
          title="Perhatikan pencatatan pembayaran"
          description="Pembayaran tunai langsung terverifikasi. Transfer bank memerlukan bukti dan verifikasi sebelum mengurangi kewajiban sewa."
        />
        <Tabs value={tab} onValueChange={(value) => setTab(value as WorkspaceTab)}>
          <TabsList className="grid h-auto w-full grid-cols-1 gap-1 rounded-xl border border-primary/20 bg-primary/10 p-1 sm:grid-cols-2 xl:grid-cols-4">
            <TabsTrigger
              className="min-h-12 w-full whitespace-normal px-3 text-center font-semibold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              value="unpaid"
            >
              Tagihan Belum Dibayar
            </TabsTrigger>
            <TabsTrigger
              className="min-h-12 w-full whitespace-normal px-3 text-center font-semibold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              value="paid"
            >
              Tagihan Sudah Dibayar
            </TabsTrigger>
            <TabsTrigger
              className="min-h-12 w-full whitespace-normal px-3 text-center font-semibold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              value="pending"
            >
              Pembayaran Menunggu Konfirmasi
            </TabsTrigger>
            <TabsTrigger
              className="min-h-12 w-full whitespace-normal px-3 text-center font-semibold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              value="other"
            >
              Pembayaran Lainnya
            </TabsTrigger>
          </TabsList>

          <TabsContent value="unpaid" className="space-y-4">
            <div className="grid min-w-0 gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
              <MonthYearPicker
                value={month}
                onChange={(value) => {
                  setMonth(value);
                  setOffset(0);
                }}
                label="Pilih periode tagihan"
              />
              <div className="relative min-w-0 xl:col-span-2">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="min-h-11 pl-9"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setOffset(0);
                  }}
                  placeholder="Cari penghuni, kamar, bangunan, atau kode tagihan"
                  aria-label="Cari tagihan"
                />
              </div>
              <select
                className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
                value={invoiceStatus}
                onChange={(event) => {
                  setInvoiceStatus(event.target.value as typeof invoiceStatus);
                  setOffset(0);
                }}
                aria-label="Filter status tagihan"
              >
                <option value="">Semua status tagihan</option>
                <option value="issued">Belum dibayar</option>
                <option value="partially_paid">Dibayar sebagian</option>
                <option value="overdue">Terlambat</option>
              </select>
              <select
                className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
                value={invoiceSort}
                onChange={(event) => {
                  setInvoiceSort(event.target.value as typeof invoiceSort);
                  setOffset(0);
                }}
                aria-label="Urutkan tagihan"
              >
                <option value="due_date_asc">Jatuh tempo terdekat</option>
                <option value="due_date_desc">Jatuh tempo terjauh</option>
                <option value="resident_asc">Nama penghuni A–Z</option>
              </select>
              <DeadlineWindowFilter
                value={dueWithinDaysInput}
                invalid={hasInvalidDueWithinDays}
                onChange={(value) => {
                  setDueWithinDaysInput(value);
                  setOffset(0);
                }}
                onQuickThirtyDays={() => {
                  setDueWithinDaysInput("30");
                  setOffset(0);
                }}
                canReset={activeFilterCount > 0}
                onReset={() => {
                  setMonth(jakartaMonth());
                  setSearch("");
                  setInvoiceStatus("");
                  setInvoiceSort("due_date_asc");
                  setDueWithinDaysInput("");
                  setDateFrom("");
                  setDateTo("");
                  setOffset(0);
                }}
              />
              <DateRangeFilter
                from={dateFrom}
                to={dateTo}
                onFromChange={(value) => {
                  setDateFrom(value);
                  setOffset(0);
                }}
                onToChange={(value) => {
                  setDateTo(value);
                  setOffset(0);
                }}
              />
            </div>
            {!worklist.isFetching && !worklist.isError ? (
              <FilterResultNotice
                key={filterSignature}
                entityLabel="tagihan"
                resultCount={worklist.data?.meta.total ?? 0}
                activeFilterCount={activeFilterCount}
                searchTerm={deferredSearch}
                criteria={invoiceFilterCriteria}
              />
            ) : null}
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

          <TabsContent value="paid" className="space-y-4">
            <PaymentFilterBar
              search={paymentSearch}
              method={paymentMethod}
              purpose={paymentPurpose}
              dueWithinDays={dueWithinDaysInput}
              dateFrom={dateFrom}
              dateTo={dateTo}
              dueWithinDaysInvalid={hasInvalidDueWithinDays}
              onSearch={(value) => {
                setPaymentSearch(value);
                setPaymentOffset(0);
              }}
              onMethod={(value) => {
                setPaymentMethod(value);
                setPaymentOffset(0);
              }}
              onPurpose={(value) => {
                setPaymentPurpose(value);
                setPaymentOffset(0);
              }}
              onDueWithinDays={(value) => {
                setDueWithinDaysInput(value);
                setPaymentOffset(0);
              }}
              onQuickThirtyDays={() => {
                setDueWithinDaysInput("30");
                setPaymentOffset(0);
              }}
              onDateFromChange={(value) => {
                setDateFrom(value);
                setPaymentOffset(0);
              }}
              onDateToChange={(value) => {
                setDateTo(value);
                setPaymentOffset(0);
              }}
              onReset={() => {
                setPaymentSearch("");
                setPaymentMethod("");
                setPaymentPurpose("");
                setDueWithinDaysInput("");
                setDateFrom("");
                setDateTo("");
                setPaymentOffset(0);
              }}
            />
            {!paid.isFetching && !paid.isError ? (
              <FilterResultNotice
                key={`paid:${paymentFilterSignature}`}
                entityLabel="pembayaran terverifikasi"
                resultCount={paid.data?.meta.total ?? 0}
                activeFilterCount={paymentActiveFilterCount}
                searchTerm={deferredPaymentSearch}
                criteria={paymentFilterCriteria}
              />
            ) : null}
            <PaidPanel query={paid} propertyId={currentPropertyId} onOffset={setPaymentOffset} />
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            <PaymentFilterBar
              search={paymentSearch}
              method={paymentMethod}
              purpose={paymentPurpose}
              dueWithinDays={dueWithinDaysInput}
              dateFrom={dateFrom}
              dateTo={dateTo}
              dueWithinDaysInvalid={hasInvalidDueWithinDays}
              onSearch={(value) => {
                setPaymentSearch(value);
                setPaymentOffset(0);
              }}
              onMethod={(value) => {
                setPaymentMethod(value);
                setPaymentOffset(0);
              }}
              onPurpose={(value) => {
                setPaymentPurpose(value);
                setPaymentOffset(0);
              }}
              onDueWithinDays={(value) => {
                setDueWithinDaysInput(value);
                setPaymentOffset(0);
              }}
              onQuickThirtyDays={() => {
                setDueWithinDaysInput("30");
                setPaymentOffset(0);
              }}
              onDateFromChange={(value) => {
                setDateFrom(value);
                setPaymentOffset(0);
              }}
              onDateToChange={(value) => {
                setDateTo(value);
                setPaymentOffset(0);
              }}
              onReset={() => {
                setPaymentSearch("");
                setPaymentMethod("");
                setPaymentPurpose("");
                setDueWithinDaysInput("");
                setDateFrom("");
                setDateTo("");
                setPaymentOffset(0);
              }}
            />
            <PendingPaymentPanel
              query={pendingPayments}
              canVerify={canVerify}
              propertyId={currentPropertyId}
              onOffset={setPaymentOffset}
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

          <TabsContent value="other" className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <DeadlineWindowFilter
                value={dueWithinDaysInput}
                invalid={hasInvalidDueWithinDays}
                disabled
                onChange={() => undefined}
                onQuickThirtyDays={() => undefined}
              />
              <p className="mt-3 text-sm text-muted-foreground">
                Biaya lain tidak memakai tenggat pelunasan kontrak, sehingga filter hari tidak
                diterapkan pada tab ini.
              </p>
            </div>
            <OtherChargePanel
              detail={detail.data ?? null}
              propertyId={currentPropertyId}
              canManage={canManage}
            />
          </TabsContent>
        </Tabs>

        {selectedResidentId ? (
          <ResidentBillingPanel
            sectionRef={detailSectionRef}
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

function PaymentFilterBar({
  search,
  method,
  purpose,
  dueWithinDays,
  dateFrom,
  dateTo,
  dueWithinDaysInvalid,
  onSearch,
  onMethod,
  onPurpose,
  onDueWithinDays,
  onQuickThirtyDays,
  onDateFromChange,
  onDateToChange,
  onReset,
}: {
  search: string;
  method: "" | W06PaymentMethod;
  purpose: "" | W06PaymentPurpose;
  dueWithinDays: string;
  dateFrom: string;
  dateTo: string;
  dueWithinDaysInvalid: boolean;
  onSearch: (value: string) => void;
  onMethod: (value: "" | W06PaymentMethod) => void;
  onPurpose: (value: "" | W06PaymentPurpose) => void;
  onDueWithinDays: (value: string) => void;
  onQuickThirtyDays: () => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onReset: () => void;
}) {
  const hasFilters = Boolean(
    search.trim() || method || purpose || dueWithinDays || dateFrom || dateTo,
  );
  return (
    <div className="grid min-w-0 gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="relative min-w-0 xl:col-span-2">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="min-h-11 pl-9"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Cari penghuni, kamar, kode, atau referensi"
          aria-label="Cari pembayaran"
        />
      </div>
      <select
        className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
        value={method}
        onChange={(event) => onMethod(event.target.value as "" | W06PaymentMethod)}
        aria-label="Filter metode pembayaran"
      >
        <option value="">Semua metode</option>
        <option value="cash">Tunai</option>
        <option value="bank_transfer">Transfer bank</option>
      </select>
      <select
        className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
        value={purpose}
        onChange={(event) => onPurpose(event.target.value as "" | W06PaymentPurpose)}
        aria-label="Filter jenis pembayaran"
      >
        <option value="">Semua jenis</option>
        <option value="rent">Pembayaran sewa</option>
        <option value="dp">DP / uang muka sewa</option>
        <option value="security_deposit">Security deposit</option>
        <option value="other_charge">Tagihan lainnya</option>
      </select>
      <DeadlineWindowFilter
        value={dueWithinDays}
        invalid={dueWithinDaysInvalid}
        onChange={onDueWithinDays}
        onQuickThirtyDays={onQuickThirtyDays}
      />
      <DateRangeFilter
        from={dateFrom}
        to={dateTo}
        onFromChange={onDateFromChange}
        onToChange={onDateToChange}
      />
      <Button
        type="button"
        variant="destructive"
        className="min-h-11 w-full"
        disabled={!hasFilters}
        onClick={onReset}
      >
        <RotateCcw className="mr-2 h-4 w-4" /> Reset Filter
      </Button>
    </div>
  );
}

function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0 md:col-span-2 xl:col-span-2">
      <div className="grid grid-cols-[minmax(0,1fr)_1.25rem_minmax(0,1fr)] items-center gap-2">
        <HeroUiDatePicker
          ariaLabel="Tanggal awal rentang pembayaran"
          id="billing-date-from"
          maxDate={to || undefined}
          onChange={(value) => onFromChange(value ?? "")}
          placeholder="dd/mm/yyyy"
          value={from}
        />
        <span
          aria-hidden="true"
          className="text-center text-base font-semibold text-muted-foreground"
        >
          -
        </span>
        <HeroUiDatePicker
          ariaLabel="Tanggal akhir rentang pembayaran"
          id="billing-date-to"
          minDate={from || undefined}
          onChange={(value) => onToChange(value ?? "")}
          placeholder="dd/mm/yyyy"
          value={to}
        />
      </div>
    </div>
  );
}

function DeadlineWindowFilter({
  value,
  invalid,
  disabled = false,
  onChange,
  onQuickThirtyDays,
  canReset = false,
  onReset,
}: {
  value: string;
  invalid: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onQuickThirtyDays: () => void;
  canReset?: boolean;
  onReset?: () => void;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="space-y-2">
        <div className="relative min-w-0">
          <Input
            className="min-h-11 pr-12"
            type="number"
            inputMode="numeric"
            min={0}
            max={365}
            step={1}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Tenggat ≤ hari"
            aria-label="Jatuh tempo dalam berapa hari lagi"
            aria-invalid={invalid || undefined}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
            hari
          </span>
        </div>
        <div className={onReset ? "grid grid-cols-1 gap-2 sm:grid-cols-2" : undefined}>
          <Button
            type="button"
            variant={value === "30" ? "default" : "info"}
            className="min-h-11 w-full px-3 text-xs font-semibold"
            disabled={disabled}
            onClick={onQuickThirtyDays}
          >
            Cek 30 Hari Lagi
          </Button>
          {onReset ? (
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 w-full px-3 text-xs font-semibold"
              disabled={disabled || !canReset}
              onClick={onReset}
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Reset Filter
            </Button>
          ) : null}
        </div>
      </div>
      {invalid ? (
        <p className="text-xs text-destructive">Masukkan 0 sampai 365 hari.</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Jatuh tempo dalam rentang hari dari hari ini.
        </p>
      )}
    </div>
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
                      variant="default"
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
  sectionRef,
}: {
  query: ReturnType<typeof useResidentBilling>;
  propertyId: string | null;
  canManage: boolean;
  onClose: () => void;
  sectionRef: RefObject<HTMLElement | null>;
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
  const durationMonths = leaseDurationMonths(data.lease.start_date, data.lease.end_date);
  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label="Detail pembayaran penghuni"
      className="scroll-mt-24 space-y-4 border-t border-border pt-5 outline-none"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Detail pembayaran penghuni
          </p>
          <h2 className="mt-1 text-xl font-semibold">Kontrak, tagihan, dan riwayat pembayaran</h2>
          <div
            aria-label="Konteks kontrak penghuni"
            className="mt-3 grid overflow-hidden rounded-xl border border-primary/25 bg-primary/[0.04] shadow-sm sm:grid-cols-3"
          >
            <div className="min-w-0 border-b border-primary/15 px-4 py-3 sm:border-b-0 sm:border-r">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Penghuni
              </p>
              <p
                className="mt-1 truncate font-semibold text-foreground"
                title={data.lease.resident_name}
              >
                {data.lease.resident_name}
              </p>
            </div>
            <div className="min-w-0 border-b border-primary/15 px-4 py-3 sm:border-b-0 sm:border-r">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Kamar
              </p>
              <p className="mt-1 font-semibold text-foreground">{data.lease.room_number}</p>
            </div>
            <div className="min-w-0 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Durasi sewa
              </p>
              <p className="mt-1 font-semibold text-foreground">
                {durationMonths} bulan
                <span className="font-normal text-muted-foreground">
                  {` (${dateOnly(data.lease.start_date)}–${dateOnly(data.lease.end_date)})`}
                </span>
              </p>
            </div>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{data.lease.note}</p>
        </div>
        <Button variant="destructive" className="min-h-11" onClick={onClose}>
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
                variant="info"
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
                <StatusBadge status={payment.reversal_id ? "reversed" : payment.payment_status} />
              </div>
              <p className="mt-2 text-right font-semibold">{formatIDR(payment.amount)}</p>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {payment.allocations.map((allocation) => (
                  <p key={allocation.invoice_id}>
                    Pembayaran untuk tagihan: {formatIDR(allocation.amount)}
                  </p>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {payment.receipt_id ? (
                  <Button
                    className="min-h-11"
                    variant="success"
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
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  useEffect(() => {
    setIsDownloading(false);
    setDownloadError(false);
  }, [receiptId]);
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
        {downloadError ? (
          <p role="alert" className="text-sm text-destructive">
            PDF kuitansi belum dapat diunduh. Silakan coba lagi.
          </p>
        ) : null}
        <DialogFooter>
          {query.data && propertyId ? (
            <Button
              className="min-h-11"
              variant="info"
              disabled={isDownloading}
              onClick={() => {
                setIsDownloading(true);
                setDownloadError(false);
                void downloadAdminReceiptDocument(
                  propertyId,
                  query.data.id,
                  query.data.receipt_code,
                )
                  .then(() => setIsDownloading(false))
                  .catch(() => {
                    setIsDownloading(false);
                    setDownloadError(true);
                  });
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              {isDownloading ? "Menyiapkan PDF..." : "Unduh kuitansi"}
            </Button>
          ) : null}
          <Button className="min-h-11" variant="secondary" onClick={onClose}>
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

export function RecordPaymentDialog({
  data,
  propertyId,
  triggerLabel = "Catat pembayaran manual",
  triggerVariant,
  contractSettlementInvoiceId = null,
  contractSettlementMode,
  onRecorded,
}: {
  data: ResidentBilling;
  propertyId: string | null;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
  contractSettlementInvoiceId?: string | null;
  contractSettlementMode?: "choose" | "full";
  onRecorded?: (status: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<W06PaymentMethod>("bank_transfer");
  const [purpose, setPurpose] = useState<W06PaymentPurpose>("rent");
  const [settlementChoice, setSettlementChoice] = useState<"partial" | "full">("partial");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [depositAmount, setDepositAmount] = useState(0);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<FileResponse | null>(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const mutation = useRecordManualPayment(propertyId);
  const resetPaymentMutation = mutation.reset;
  const eligible = useMemo(
    () =>
      data.invoices.filter(
        (invoice) =>
          invoice.outstanding_amount > 0 &&
          ["issued", "partially_paid", "overdue"].includes(invoice.invoice_status) &&
          invoice.invoice_purpose === (purpose === "other_charge" ? "other_charge" : "rent") &&
          (!contractSettlementInvoiceId || invoice.id === contractSettlementInvoiceId),
      ),
    [contractSettlementInvoiceId, data.invoices, purpose],
  );
  const contractSettlementInvoice = contractSettlementInvoiceId
    ? (data.invoices.find((invoice) => invoice.id === contractSettlementInvoiceId) ?? null)
    : null;
  const isContractSettlement = Boolean(contractSettlementInvoice && contractSettlementMode);
  const isFullSettlement = contractSettlementMode === "full" || settlementChoice === "full";
  const allocations = Object.entries(selected)
    .filter(([, amount]) => amount > 0)
    .map(([invoice_id, amount]) => ({ invoice_id, amount }));
  const amount =
    purpose === "security_deposit"
      ? depositAmount
      : allocations.reduce((sum, item) => sum + item.amount, 0);
  const remainingAfterContractPayment =
    isContractSettlement && contractSettlementInvoice
      ? Math.max(0, contractSettlementInvoice.outstanding_amount - amount)
      : null;
  const contractSettlementDueLabel = data.contract_settlement?.effective_due_at
    ? timeOnly(data.contract_settlement.effective_due_at)
    : null;
  const fingerprint = JSON.stringify({
    propertyId,
    data: data.lease.id,
    method,
    purpose,
    depositAmount,
    allocations,
    reference,
    note,
    evidenceFileId: evidenceFile?.id ?? null,
    contractSettlementInvoiceId,
    contractSettlementMode,
    settlementChoice,
  });
  const key = useLogicalKey(fingerprint);
  const resetForm = useCallback(() => {
    setMethod("bank_transfer");
    setPurpose("rent");
    setSelected({});
    setDepositAmount(0);
    setReference("");
    setNote("");
    setEvidenceFile(null);
    setEvidenceBusy(false);
    setSettlementChoice("partial");
    resetPaymentMutation();
  }, [resetPaymentMutation]);
  useEffect(() => {
    if (!open) {
      resetForm();
    } else if (contractSettlementInvoice) {
      setPurpose("rent");
      setSelected({
        [contractSettlementInvoice.id]:
          contractSettlementMode === "full" ? contractSettlementInvoice.outstanding_amount : 0,
      });
      setSettlementChoice(contractSettlementMode === "full" ? "full" : "partial");
    }
  }, [contractSettlementInvoice, contractSettlementMode, open, resetForm]);
  function chooseSettlementPayment(next: "partial" | "full") {
    if (!contractSettlementInvoice) return;
    setSettlementChoice(next);
    setSelected({
      [contractSettlementInvoice.id]:
        next === "full" ? contractSettlementInvoice.outstanding_amount : 0,
    });
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
          evidence_file_ids: evidenceFile ? [evidenceFile.id] : undefined,
          allocations: purpose === "security_deposit" ? [] : allocations,
        },
        idempotencyKey: key.current.key,
      },
      {
        onSuccess: (result) => {
          toastMutationSuccess(
            result.payment_status === "verified"
              ? "Pembayaran berhasil dicatat dan terverifikasi."
              : "Pembayaran berhasil dicatat dan menunggu konfirmasi.",
          );
          onRecorded?.(result.payment_status);
          setOpen(false);
        },
      },
    );
  }
  return (
    <>
      <Button className="min-h-11" variant={triggerVariant} onClick={() => setOpen(true)}>
        <Banknote className="mr-2 h-4 w-4" />
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {isContractSettlement ? "Catat Pembayaran" : "Catat pembayaran manual"}
            </DialogTitle>
            <DialogDescription>
              {isContractSettlement
                ? "Catat pembayaran untuk pelunasan sewa kontrak. Tunai langsung terverifikasi; transfer bank wajib menyertakan bukti dan menunggu konfirmasi."
                : "Pilih tagihan dan nominal pembayaran. Transfer tetap menunggu verifikasi; kas dicatat dan diterbitkan kuitansinya secara atomik."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Metode">
              <select
                className="min-h-11 w-full rounded-md border border-input bg-background px-3"
                value={method}
                onChange={(event) => {
                  setMethod(event.target.value as W06PaymentMethod);
                }}
              >
                <option value="bank_transfer">Transfer bank</option>
                <option value="cash">Tunai</option>
              </select>
            </Field>
            {isContractSettlement ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Jenis pembayaran</p>
                {contractSettlementMode === "choose" ? (
                  <div
                    className="grid gap-2 sm:grid-cols-2"
                    role="group"
                    aria-label="Jenis pembayaran sewa"
                  >
                    <Button
                      type="button"
                      variant={settlementChoice === "partial" ? "default" : "outline"}
                      className="min-h-11"
                      onClick={() => chooseSettlementPayment("partial")}
                    >
                      Bayar Sebagian
                    </Button>
                    <Button
                      type="button"
                      variant={settlementChoice === "full" ? "default" : "outline"}
                      className="min-h-11"
                      onClick={() => chooseSettlementPayment("full")}
                    >
                      Lunasi Sekarang
                    </Button>
                  </div>
                ) : (
                  <p className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm font-medium text-primary">
                    Pelunasan penuh diperlukan untuk melanjutkan.
                  </p>
                )}
              </div>
            ) : (
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
            )}
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
            ) : isContractSettlement && contractSettlementInvoice ? (
              <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Nominal pembayaran sewa</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Sisa sewa yang perlu dibayar{" "}
                      {formatIDR(contractSettlementInvoice.outstanding_amount)}.
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    Pelunasan sewa kontrak
                  </span>
                </div>
                <div
                  className="flex min-h-11 overflow-hidden rounded-md border border-input bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
                  data-invalid={
                    amount <= 0 ||
                    amount > contractSettlementInvoice.outstanding_amount ||
                    undefined
                  }
                >
                  <span className="inline-flex items-center border-r border-input bg-muted px-3 text-sm font-medium text-muted-foreground">
                    Rp
                  </span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    className="h-auto border-0 bg-transparent shadow-none focus-visible:ring-0"
                    disabled={isFullSettlement}
                    value={amount ? new Intl.NumberFormat("id-ID").format(amount) : ""}
                    onChange={(event) => {
                      const numeric = event.target.value.replace(/\D/g, "");
                      setSelected({
                        [contractSettlementInvoice.id]: numeric ? Number(numeric) : 0,
                      });
                    }}
                    aria-label={
                      isFullSettlement ? "Jumlah pelunasan sewa" : "Nominal pembayaran sewa"
                    }
                    aria-invalid={
                      amount <= 0 ||
                      amount > contractSettlementInvoice.outstanding_amount ||
                      undefined
                    }
                  />
                </div>
                {amount > contractSettlementInvoice.outstanding_amount ? (
                  <p className="text-sm font-medium text-destructive">
                    Nominal pembayaran tidak boleh melebihi sisa sewa{" "}
                    {formatIDR(contractSettlementInvoice.outstanding_amount)}.
                  </p>
                ) : amount <= 0 ? (
                  <p className="text-sm font-medium text-destructive" role="alert">
                    Nominal belum diisi. Masukkan nominal lebih dari Rp0 untuk mencatat pembayaran.
                  </p>
                ) : null}
              </div>
            ) : (
              <div>
                <p className="mb-2 text-sm font-medium">Tagihan yang dibayar</p>
                <div className="space-y-2">
                  {eligible.map((invoice) => (
                    <label
                      key={invoice.id}
                      className="grid grid-cols-[auto_1fr_9rem] items-center gap-3 rounded-lg border border-border p-3"
                    >
                      {isContractSettlement ? (
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                      ) : (
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          checked={selected[invoice.id] !== undefined}
                          onChange={(event) =>
                            setSelected((current) => {
                              const next = { ...current };
                              if (event.target.checked)
                                next[invoice.id] = invoice.outstanding_amount;
                              else delete next[invoice.id];
                              return next;
                            })
                          }
                        />
                      )}
                      <span>
                        <span className="block text-sm font-medium">
                          {isContractSettlement ? "Pelunasan sewa kontrak" : invoice.invoice_code}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Sisa yang wajib dilunasi {formatIDR(invoice.outstanding_amount)}
                        </span>
                      </span>
                      <Input
                        type="number"
                        min={1}
                        max={invoice.outstanding_amount}
                        disabled={isFullSettlement || selected[invoice.id] === undefined}
                        value={selected[invoice.id] ?? ""}
                        onChange={(event) =>
                          setSelected((current) => ({
                            ...current,
                            [invoice.id]: Number(event.target.value),
                          }))
                        }
                        aria-label={`Nominal ${invoice.invoice_code}`}
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
              <span>Jumlah yang akan dicatat</span>
              <strong className="float-right">{formatIDR(amount)}</strong>
            </div>
            {isContractSettlement &&
            contractSettlementInvoice &&
            remainingAfterContractPayment !== null &&
            amount > 0 &&
            amount <= contractSettlementInvoice.outstanding_amount ? (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm">
                <p className="font-semibold text-foreground">Setelah pembayaran ini</p>
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">
                    Sisa pembayaran sewa setelah dicatat
                  </span>
                  <strong className="text-base text-primary">
                    {formatIDR(remainingAfterContractPayment)}
                  </strong>
                </div>
                {remainingAfterContractPayment > 0 ? (
                  <div className="mt-3 space-y-1.5 text-xs leading-5 text-muted-foreground">
                    <p>
                      <strong className="text-foreground">Status periode berikutnya:</strong> tidak
                      ada tagihan sewa bulanan baru. Sisa ini tetap merupakan pelunasan untuk
                      kontrak yang sama.
                    </p>
                    <p>
                      Pembayaran sebagian tidak mengubah tenggat pelunasan kontrak
                      {contractSettlementDueLabel ? `, yaitu ${contractSettlementDueLabel}` : ""}.
                    </p>
                    {method === "bank_transfer" ? (
                      <p>
                        Transfer akan mengurangi sisa setelah admin memverifikasi bukti pembayaran.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    Setelah pembayaran ini tercatat, pelunasan sewa kontrak selesai.
                    {method === "bank_transfer"
                      ? " Transfer tetap harus diverifikasi terlebih dahulu."
                      : ""}
                  </p>
                )}
              </div>
            ) : null}
            {propertyId ? (
              <FileUploadField
                propertyId={propertyId}
                filePurpose="payment_proof"
                label={
                  method === "bank_transfer"
                    ? "Bukti transfer (wajib)"
                    : "Bukti pembayaran (opsional)"
                }
                description={
                  method === "bank_transfer"
                    ? "Pilih bukti pembayaran transfer. File dapat dilihat, diganti, atau dihapus sebelum pembayaran disimpan."
                    : "Lampirkan bila tersedia sebagai bukti penerimaan pembayaran tunai."
                }
                value={evidenceFile}
                onChange={setEvidenceFile}
                onBusyChange={setEvidenceBusy}
                required={method === "bank_transfer"}
              />
            ) : null}
            <Field
              label={
                method === "bank_transfer"
                  ? "Nomor referensi transfer (opsional)"
                  : "Nomor bukti penerimaan (opsional)"
              }
            >
              <Input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={100}
                placeholder={
                  method === "bank_transfer"
                    ? "Contoh: nomor transaksi dari bank"
                    : "Contoh: nomor kuitansi atau buku kas"
                }
              />
              <p className="text-xs font-normal text-muted-foreground">
                {method === "bank_transfer"
                  ? "Isi bila bank memberi nomor transaksi. Kode pembayaran sistem dibuat otomatis setelah disimpan."
                  : "Isi bila ada nomor kuitansi atau buku kas internal. Kode pembayaran sistem tetap dibuat otomatis."}
              </p>
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
            <Button variant="secondary" className="min-h-11" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              className="min-h-11"
              disabled={
                mutation.isPending ||
                evidenceBusy ||
                amount <= 0 ||
                (isContractSettlement &&
                  contractSettlementInvoice !== null &&
                  amount > contractSettlementInvoice.outstanding_amount) ||
                (method === "bank_transfer" && !evidenceFile)
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
  propertyId,
  onOffset,
}: {
  query: ReturnType<typeof useBillingPayments>;
  propertyId: string | null;
  onOffset: (offset: number) => void;
}) {
  const [receiptId, setReceiptId] = useState<string | null>(null);
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
    <div className="space-y-3">
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Penghuni / Kamar</TableHead>
                <TableHead>Kode / Tanggal</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Metode</TableHead>
                <TableHead>Status pembayaran</TableHead>
                <TableHead className="text-right">Nominal</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.data.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    <p className="font-medium">{payment.resident_name}</p>
                    <p className="text-xs text-muted-foreground">Kamar {payment.room_number}</p>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{payment.payment_code}</p>
                    <p className="text-xs text-muted-foreground">
                      {payment.paid_at ? timeOnly(payment.paid_at) : "Waktu belum tersedia"}
                    </p>
                  </TableCell>
                  <TableCell>{purposeLabel(payment.payment_purpose)}</TableCell>
                  <TableCell>{methodLabel(payment.payment_method)}</TableCell>
                  <TableCell>
                    <div className="flex min-w-40 flex-col items-start gap-1.5">
                      {payment.settles_rent_contract ? (
                        <StatusBadge status="contract_settled" />
                      ) : payment.rent_allocation_amount > 0 ? (
                        <StatusBadge status="rent_partial" />
                      ) : (
                        <StatusBadge status={payment.payment_status} />
                      )}
                      {payment.rent_allocation_amount > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {formatIDR(payment.rent_allocation_amount)} untuk sewa
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatIDR(payment.amount)}
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-44 justify-end gap-2">
                      {payment.receipt_id ? (
                        <Button
                          className="min-h-11"
                          variant="info"
                          onClick={() => setReceiptId(payment.receipt_id)}
                        >
                          Rincian
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Belum diterbitkan</span>
                      )}
                    </div>
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
      <AdminReceiptDialog
        propertyId={propertyId}
        receiptId={receiptId}
        onClose={() => setReceiptId(null)}
      />
    </div>
  );
}

function PendingPaymentPanel({
  query,
  canVerify,
  propertyId,
  onOffset,
}: {
  query: ReturnType<typeof useBillingPayments>;
  canVerify: boolean;
  propertyId: string | null;
  onOffset: (offset: number) => void;
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
      <PageButtons
        offset={query.data.meta.offset}
        limit={query.data.meta.limit}
        total={query.data.meta.total}
        onOffset={onOffset}
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
                variant="default"
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
  const [evidenceFile, setEvidenceFile] = useState<FileResponse | null>(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const mutation = useCreateOtherCharge(propertyId);
  const key = useLogicalKey(
    JSON.stringify({
      propertyId,
      lease: detail?.lease.id,
      category,
      description,
      amount,
      dueDate,
      evidenceFileId: evidenceFile?.id ?? null,
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
            <HeroUiDatePicker
              id="other-charge-due-date"
              label="Jatuh tempo"
              value={dueDate}
              onChange={(value) => setDueDate(value ?? "")}
            />
            {category === "documented_damage" && propertyId ? (
              <FileUploadField
                propertyId={propertyId}
                filePurpose="complaint_attachment"
                label="Bukti kerusakan"
                description="Lampirkan foto atau dokumen kerusakan. Gambar besar akan dikompresi otomatis."
                value={evidenceFile}
                onChange={setEvidenceFile}
                onBusyChange={setEvidenceBusy}
                required
              />
            ) : null}
            {mutation.isError ? (
              <InlineMessage text="Tagihan tidak dapat dibuat. Periksa data dan bukti lalu coba lagi." />
            ) : null}
            <DialogFooter>
              <Button variant="secondary" className="min-h-11" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button
                className="min-h-11"
                disabled={
                  mutation.isPending ||
                  evidenceBusy ||
                  description.trim().length < 3 ||
                  amount <= 0 ||
                  !dueDate ||
                  (category === "documented_damage" && !evidenceFile)
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
                        evidence_file_ids:
                          category === "documented_damage" && evidenceFile
                            ? [evidenceFile.id]
                            : undefined,
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
  const previewLabel = `Lihat ${file.original_filename} di tab baru`;
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-muted/20 px-2 py-2">
      {preview.data ? (
        <a
          href={preview.data}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={previewLabel}
          className="group flex min-h-10 min-w-10 items-center justify-center rounded-md border border-border bg-background p-1 transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {file.mime_type.startsWith("image/") ? (
            <img
              src={preview.data}
              alt=""
              className="h-9 w-9 rounded object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <Eye className="size-4 text-primary" aria-hidden="true" />
          )}
        </a>
      ) : (
        <span
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground"
          aria-label="Menyiapkan pratinjau bukti"
        >
          <ReceiptText className="size-4" aria-hidden="true" />
        </span>
      )}
      <span className="max-w-48 truncate text-xs" title={file.original_filename}>
        {file.original_filename}
      </span>
      {preview.data ? (
        <a
          href={preview.data}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Eye className="size-3.5" aria-hidden="true" /> Lihat
        </a>
      ) : null}
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
          <Button variant="secondary" className="min-h-11" onClick={onClose}>
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
    contract_settled: "Sewa kontrak lunas",
    rent_partial: "Pembayaran sewa sebagian",
  };
  const tone =
    status === "paid" || status === "verified" || status === "contract_settled"
      ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
      : status === "partially_paid" ||
          status === "rent_partial" ||
          status === "pending_confirmation"
        ? "border-amber-500/35 bg-amber-500/12 text-amber-800 dark:text-amber-300"
        : status === "issued"
          ? "border-sky-500/35 bg-sky-500/12 text-sky-700 dark:text-sky-300"
          : status === "overdue" || status === "rejected" || status === "reversed"
            ? "border-rose-500/35 bg-rose-500/12 text-rose-700 dark:text-rose-300"
            : "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300";
  return (
    <Badge variant="outline" className={`rounded-full px-2.5 py-1 font-semibold ${tone}`}>
      {label[status] ?? "Tidak tersedia"}
    </Badge>
  );
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
function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return value;
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}
function dateRangeFilterLabel(from: string, to: string) {
  if (from && to) return `tanggal ${dateOnly(from)} sampai ${dateOnly(to)}`;
  if (from) return `tanggal mulai ${dateOnly(from)}`;
  return to ? `tanggal sampai ${dateOnly(to)}` : "";
}
function parseDueWithinDays(value: string) {
  if (!/^\d{1,3}$/.test(value)) return undefined;
  const days = Number(value);
  return days >= 0 && days <= 365 ? days : undefined;
}
function dateOnly(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function leaseDurationMonths(startDate: string, endDate: string) {
  const [startYear, startMonth] = startDate.split("-").map(Number);
  const [endYear, endMonth] = endDate.split("-").map(Number);
  return Math.max(1, (endYear - startYear) * 12 + endMonth - startMonth);
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
