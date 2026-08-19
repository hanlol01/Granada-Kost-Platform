import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Plus,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { FileUploadField, type FileUploadReference } from "@/components/file/FileUploadField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/state";
import { NoticeAlert } from "@/components/ui/notice-alert";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
import { useM4AllRoomBuildings } from "@/hooks/useAdminUxMaster";
import { useWorkOrders } from "@/hooks/useWorkOrders";
import { useAuth } from "@/lib/auth";
import { useProperty } from "@/lib/property";
import {
  createExpense,
  EXPENSE_METHOD_LABEL,
  EXPENSE_STATUS_LABEL,
  listExpenses,
  transitionExpense,
  type ExpensePaymentMethod,
  type ExpenseRecord,
  type ExpenseStatus,
} from "@/lib/admin-expenses";
import { toast } from "sonner";

export const Route = createFileRoute("/expenses")({ component: ExpensesPage });

const STATUS_TONE: Record<ExpenseStatus, string> = {
  draft: "border-border bg-muted text-muted-foreground",
  pending_approval: "border-warning/30 bg-warning/15 text-warning-foreground",
  approved: "border-primary/30 bg-primary-soft text-primary",
  paid: "border-success/30 bg-success/15 text-success",
  rejected: "border-destructive/30 bg-destructive/15 text-destructive",
  cancelled: "border-border bg-muted text-muted-foreground",
  reversed: "border-destructive/30 bg-destructive/15 text-destructive",
  archived: "border-border bg-muted text-muted-foreground",
};

const METHODS: ExpensePaymentMethod[] = ["cash", "bank_transfer", "qris", "ewallet", "other"];

function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}

function ExpensesPage() {
  const { currentPropertyId } = useProperty();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const buildingsQuery = useM4AllRoomBuildings();
  const workOrdersQuery = useWorkOrders({}, true);
  const [status, setStatus] = useState<ExpenseStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({
    category: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    amount: "",
    paymentMethod: "cash" as ExpensePaymentMethod,
    vendorName: "",
    notes: "",
    buildingId: "",
    workOrderId: "",
    proofFile: null as FileUploadReference | null,
  });

  const query = useQuery({
    queryKey: ["expenses", currentPropertyId, status],
    queryFn: () => listExpenses(currentPropertyId!, status === "all" ? undefined : status),
    enabled: Boolean(currentPropertyId),
  });
  const filtered = useMemo(() => {
    const records = query.data?.records ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((item) =>
      `${item.category} ${item.vendorName ?? ""} ${item.notes ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [query.data?.records, search]);

  if (!currentPropertyId)
    return (
      <AppShell title="Pengeluaran" subtitle="Catat biaya operasional properti">
        <LoadingState label="Menyiapkan properti..." />
      </AppShell>
    );
  if (query.isLoading)
    return (
      <AppShell title="Pengeluaran" subtitle="Catat biaya operasional properti">
        <LoadingState label="Memuat pengeluaran..." />
      </AppShell>
    );
  if (query.error)
    return (
      <AppShell title="Pengeluaran" subtitle="Catat biaya operasional properti">
        <ErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          title="Gagal memuat pengeluaran"
        />
      </AppShell>
    );

  const create = async () => {
    const amount = Number(form.amount);
    if (!form.category.trim() || !form.expenseDate || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Lengkapi kategori, tanggal, dan nominal pengeluaran.");
      return;
    }
    try {
      await createExpense(currentPropertyId, {
        category: form.category.trim(),
        expense_date: form.expenseDate,
        amount,
        payment_method: form.paymentMethod,
        building_id: form.buildingId || undefined,
        work_order_id: form.workOrderId || undefined,
        proof_file_id: form.proofFile?.id || undefined,
        vendor_name: form.vendorName.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      toast.success("Pengeluaran dibuat sebagai draft.");
      setForm({
        category: "",
        expenseDate: new Date().toISOString().slice(0, 10),
        amount: "",
        paymentMethod: "cash",
        vendorName: "",
        notes: "",
        buildingId: "",
        workOrderId: "",
        proofFile: null,
      });
      setShowCreate(false);
      await queryClient.invalidateQueries({ queryKey: ["expenses", currentPropertyId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pengeluaran gagal dibuat.");
    }
  };

  const act = async (
    item: ExpenseRecord,
    action: "submit" | "approve" | "reject" | "pay" | "cancel" | "reverse" | "archive",
  ) => {
    setBusyId(item.id);
    try {
      const body =
        action === "pay"
          ? { payment_method: item.paymentMethod }
          : action === "cancel" || action === "reverse" || action === "reject"
            ? { reason: "Koreksi operasional Admin" }
            : undefined;
      await transitionExpense(item.id, action, body);
      toast.success(`Pengeluaran ${EXPENSE_STATUS_LABEL[item.status].toLowerCase()} diperbarui.`);
      await queryClient.invalidateQueries({ queryKey: ["expenses", currentPropertyId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Perubahan pengeluaran ditolak.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell
      title="Pengeluaran"
      subtitle="Catat biaya operasional dengan bukti dan jejak persetujuan"
      actions={
        hasPermission("billing.manage") ? (
          <Button onClick={() => setShowCreate((value) => !value)}>
            <Plus className="mr-2 h-4 w-4" />
            {showCreate ? "Tutup formulir" : "Tambah pengeluaran"}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <NoticeAlert
          tone="info"
          title="Pengeluaran tetap terpisah dari keuangan owner"
          description="Setiap biaya terikat ke properti. Nominal Rp500.000 atau lebih tetap menunggu approver yang lebih tinggi sampai kebijakan ditetapkan."
        />

        {showCreate ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pengeluaran baru</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Kategori *</span>
                <Input
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  placeholder="Contoh: Perbaikan pompa"
                />
              </label>
              <HeroUiDatePicker
                id="expense-date"
                label="Tanggal pengeluaran *"
                value={form.expenseDate}
                onChange={(value) => setForm({ ...form, expenseDate: value ?? "" })}
              />
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Nominal (Rp) *</span>
                <Input
                  type="number"
                  min="1"
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  placeholder="0"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Metode pembayaran *</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.paymentMethod}
                  onChange={(event) =>
                    setForm({ ...form, paymentMethod: event.target.value as ExpensePaymentMethod })
                  }
                >
                  {METHODS.map((method) => (
                    <option key={method} value={method}>
                      {EXPENSE_METHOD_LABEL[method]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Vendor (opsional)</span>
                <Input
                  value={form.vendorName}
                  onChange={(event) => setForm({ ...form, vendorName: event.target.value })}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Bangunan (opsional)</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.buildingId}
                  onChange={(event) => setForm({ ...form, buildingId: event.target.value })}
                >
                  <option value="">Semua/di luar bangunan tertentu</option>
                  {(buildingsQuery.data ?? []).map((building) => (
                    <option key={building.id} value={building.id}>
                      {building.buildingCode} · {building.buildingName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Work order (opsional)</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.workOrderId}
                  onChange={(event) => setForm({ ...form, workOrderId: event.target.value })}
                >
                  <option value="">Tidak ditautkan</option>
                  {(workOrdersQuery.data?.data ?? []).map((workOrder) => (
                    <option key={workOrder.id} value={workOrder.id}>
                      {workOrder.workOrderCode} · {workOrder.status}
                    </option>
                  ))}
                </select>
              </label>
              <div className="md:col-span-2">
                <FileUploadField
                  propertyId={currentPropertyId}
                  filePurpose="expense_proof"
                  label="Bukti pengeluaran (opsional)"
                  description="Bukti dipratinjau sebelum disimpan dan tetap privat untuk properti ini."
                  value={form.proofFile}
                  onChange={(file) => setForm({ ...form, proofFile: file })}
                />
              </div>
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="text-muted-foreground">Catatan</span>
                <textarea
                  className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </label>
              <div className="flex justify-end gap-2 md:col-span-2">
                <Button variant="outline" onClick={() => setShowCreate(false)}>
                  Batal
                </Button>
                <Button onClick={() => void create()}>Simpan draft</Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-base">
              Daftar pengeluaran{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({query.data?.total ?? 0})
              </span>
            </CardTitle>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 md:w-64"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari kategori atau vendor..."
                />
              </div>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={status}
                onChange={(event) => setStatus(event.target.value as ExpenseStatus | "all")}
              >
                <option value="all">Semua status</option>
                {Object.keys(EXPENSE_STATUS_LABEL).map((key) => (
                  <option key={key} value={key}>
                    {EXPENSE_STATUS_LABEL[key as ExpenseStatus]}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-5 w-5" />}
                title="Belum ada pengeluaran"
                description={
                  search
                    ? "Coba ubah kata kunci pencarian."
                    : "Pengeluaran properti akan tampil setelah dibuat."
                }
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {filtered.map((item) => (
                  <ExpenseCard
                    key={item.id}
                    item={item}
                    busy={busyId === item.id}
                    onAction={(action) => void act(item, action)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function ExpenseCard({
  item,
  busy,
  onAction,
}: {
  item: ExpenseRecord;
  busy: boolean;
  onAction: (
    action: "submit" | "approve" | "reject" | "pay" | "cancel" | "reverse" | "archive",
  ) => void;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{item.category}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(item.expenseDate)} · {EXPENSE_METHOD_LABEL[item.paymentMethod]}
          </p>
        </div>
        <Badge variant="outline" className={STATUS_TONE[item.status]}>
          {item.status === "paid" ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : null}
          {EXPENSE_STATUS_LABEL[item.status]}
        </Badge>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Nominal</p>
          <p className="text-lg font-semibold">{formatRupiah(item.amount)}</p>
          {item.vendorName ? (
            <p className="mt-1 text-xs text-muted-foreground">Vendor: {item.vendorName}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {item.status === "draft" ? (
            <Button size="sm" onClick={() => onAction("submit")} disabled={busy}>
              <FileText className="mr-1 h-3.5 w-3.5" />
              Ajukan
            </Button>
          ) : null}
          {item.status === "pending_approval" ? (
            <>
              <Button size="sm" onClick={() => onAction("approve")} disabled={busy}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                Setujui
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onAction("reject")}
                disabled={busy}
              >
                <XCircle className="mr-1 h-3.5 w-3.5" />
                Tolak
              </Button>
            </>
          ) : null}
          {item.status === "approved" ? (
            <Button size="sm" onClick={() => onAction("pay")} disabled={busy}>
              <CircleDollarSign className="mr-1 h-3.5 w-3.5" />
              Tandai dibayar
            </Button>
          ) : null}
          {item.status === "paid" ? (
            <Button size="sm" variant="outline" onClick={() => onAction("reverse")} disabled={busy}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Koreksi
            </Button>
          ) : null}
          {item.status === "rejected" || item.status === "reversed" ? (
            <Button size="sm" variant="outline" onClick={() => onAction("archive")} disabled={busy}>
              Arsipkan
            </Button>
          ) : null}
          {["draft", "pending_approval", "approved"].includes(item.status) ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onAction("cancel")}
              disabled={busy}
            >
              <XCircle className="mr-1 h-3.5 w-3.5" />
              Batalkan
            </Button>
          ) : null}
        </div>
      </div>
      {item.amount >= 500000 && item.status === "pending_approval" ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Nominal ini menunggu approver yang lebih tinggi dan belum dapat dibayar.
        </div>
      ) : null}
    </article>
  );
}
