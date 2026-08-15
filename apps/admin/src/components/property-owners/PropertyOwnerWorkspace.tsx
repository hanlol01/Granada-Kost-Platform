import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  Eye,
  KeyRound,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { HeroUiDatePicker } from "@/components/ui/heroui-date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useOwnerAssetOptions,
  usePropertyOwnerDetail,
  usePropertyOwnerMutations,
  usePropertyOwners,
} from "@/hooks/usePropertyOwners";
import type { AssignmentStatus, OwnerAssetOption, PropertyOwner } from "@/lib/admin-property-owner";
import { validateOwnerAssignment } from "@/lib/property-owner-assignment-validation";
import { displayOwnerDate } from "@/lib/property-owner-date";
import { cn } from "@/lib/utils";

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const accountLabel = (status: string) =>
  status === "active"
    ? "Akun aktif"
    : status === "suspended"
      ? "Akun ditangguhkan"
      : "Akun tidak aktif";
const ownerStatusLabel = (status: string) => (status === "active" ? "Aktif" : "Diarsipkan");
const assignmentStatusLabel = (status: AssignmentStatus) =>
  status === "active"
    ? "Aktif"
    : status === "scheduled"
      ? "Terjadwal"
      : status === "ended"
        ? "Berakhir"
        : "Dilepas";
function roomGenderLabel(genderPolicy: string | null): string | null {
  if (genderPolicy === "male") return "Putra";
  if (genderPolicy === "female") return "Putri";
  if (genderPolicy === "mixed") return "Campuran";
  return null;
}
const PAGE_SIZE = 20;

type Modal = "create" | "edit" | "assign" | "reset" | "release" | "release-batch" | null;
type ReleaseTarget = {
  id: string;
  kind: "building" | "room";
  label: string;
};
type BatchReleaseItem = ReleaseTarget & {
  description: string;
  effectiveFrom: string;
};
type BatchReleaseTarget = {
  kind: "building" | "room";
  items: BatchReleaseItem[];
};
type OwnerDraft = {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  initialPassword: string;
};
const emptyDraft = (): OwnerDraft => ({
  fullName: "",
  phone: "",
  email: "",
  address: "",
  initialPassword: "",
});

function StatusBadge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "green" | "blue" | "amber" | "slate" | "red";
}) {
  const styles = {
    green: "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    blue: "border-sky-500/35 bg-sky-500/12 text-sky-700 dark:text-sky-300",
    amber: "border-amber-500/35 bg-amber-500/12 text-amber-700 dark:text-amber-300",
    red: "border-destructive/35 bg-destructive/10 text-destructive",
    slate: "border-border bg-muted/50 text-foreground",
  };
  return (
    <Badge variant="outline" className={cn("rounded-full font-medium", styles[tone])}>
      {children}
    </Badge>
  );
}

function AssetSelection({
  label,
  option,
  checked,
  onChange,
}: {
  label: string;
  option: OwnerAssetOption;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const unavailable = option.availability !== "available";
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
        checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
        unavailable && "cursor-not-allowed opacity-55",
      )}
    >
      <input
        aria-label={label}
        type="checkbox"
        checked={checked}
        disabled={unavailable}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-primary"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <strong>{label}</strong>
          <StatusBadge tone={unavailable ? "amber" : "green"}>
            {unavailable ? `Milik ${option.currentOwner?.fullName ?? "owner lain"}` : "Tersedia"}
          </StatusBadge>
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {option.name ?? ""}
          {option.genderPolicy ? ` · ${option.genderPolicy}` : ""}
          {option.roomCount !== undefined ? ` · mencakup ${option.roomCount} kamar` : ""}
        </span>
      </span>
    </label>
  );
}

export function PropertyOwnerWorkspace({ ownerId }: { ownerId?: string }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "active" | "archived">("");
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(ownerId ?? null);
  const [modal, setModal] = useState<Modal>(null);
  const [draft, setDraft] = useState<OwnerDraft>(emptyDraft);
  const [passwordReceipt, setPasswordReceipt] = useState<{
    kind: "created" | "reset";
    name: string;
    login: string;
    password: string;
  } | null>(null);
  const [assignmentKind, setAssignmentKind] = useState<"building" | "room">("building");
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [assignmentReason, setAssignmentReason] = useState("");
  const [assignmentSubmitAttempted, setAssignmentSubmitAttempted] = useState(false);
  const [buildingId, setBuildingId] = useState("");
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [releaseTarget, setReleaseTarget] = useState<ReleaseTarget | null>(null);
  const [batchReleaseTarget, setBatchReleaseTarget] = useState<BatchReleaseTarget | null>(null);
  const [assetSelection, setAssetSelection] = useState<{
    kind: "building" | "room";
    ids: string[];
  } | null>(null);
  const [batchReleaseSubmitAttempted, setBatchReleaseSubmitAttempted] = useState(false);
  const owners = usePropertyOwners({
    q: search.trim() || undefined,
    status: status || undefined,
    offset,
    limit: PAGE_SIZE,
  });
  const detail = usePropertyOwnerDetail(selectedId);
  const assets = useOwnerAssetOptions(effectiveFrom || undefined);
  const mutations = usePropertyOwnerMutations();
  const selectedOwner =
    detail.data ?? owners.data?.data.find((owner) => owner.id === selectedId) ?? null;
  const loading = owners.isLoading;
  const error = owners.isError;
  const hasLoginIdentifier = Boolean(draft.email.trim() || draft.phone.trim());
  const assignmentErrors = useMemo(
    () =>
      validateOwnerAssignment({
        kind: assignmentKind,
        effectiveFrom,
        effectiveUntil,
        reason: assignmentReason,
        buildingId,
        roomIds,
      }),
    [assignmentKind, assignmentReason, buildingId, effectiveFrom, effectiveUntil, roomIds],
  );
  const batchReleaseErrors = useMemo(() => {
    const errors: { effectiveUntil?: string; reason?: string } = {};
    if (!effectiveUntil) errors.effectiveUntil = "Tanggal berakhir wajib diisi.";
    else if (
      batchReleaseTarget?.items.some((item) => effectiveUntil <= item.effectiveFrom.slice(0, 10))
    )
      errors.effectiveUntil =
        "Tanggal berakhir harus setelah tanggal mulai berlaku dari seluruh aset yang dipilih.";
    if (!assignmentReason.trim()) errors.reason = "Alasan pelepasan wajib diisi.";
    return errors;
  }, [assignmentReason, batchReleaseTarget, effectiveUntil]);
  useEffect(() => setOffset(0), [search, status]);
  useEffect(() => {
    setSelectedId(ownerId ?? null);
    setModal(null);
  }, [ownerId]);
  useEffect(() => {
    setBuildingId("");
    setRoomIds([]);
  }, [assignmentKind, effectiveFrom]);
  const clearModal = () => {
    setModal(null);
    setDraft(emptyDraft());
    setAssignmentReason("");
    setAssignmentSubmitAttempted(false);
    setEffectiveUntil("");
    setRoomIds([]);
    setBuildingId("");
    setReleaseTarget(null);
    setBatchReleaseTarget(null);
    setAssetSelection(null);
    setBatchReleaseSubmitAttempted(false);
  };
  const openCreate = () => {
    setDraft(emptyDraft());
    setModal("create");
  };
  const openDetail = (id: string) => {
    void navigate({ to: "/property-owners/$ownerId", params: { ownerId: id } });
  };
  const openEdit = (owner: PropertyOwner) => {
    setSelectedId(owner.id);
    setDraft({
      fullName: owner.fullName,
      phone: owner.phone ?? "",
      email: owner.email ?? "",
      address: owner.address ?? "",
      initialPassword: "",
    });
    setModal("edit");
  };
  const submitOwner = async () => {
    if (
      !draft.fullName.trim() ||
      !hasLoginIdentifier ||
      (modal === "create" && draft.initialPassword.length < 10)
    )
      return;
    if (modal === "create") {
      const receipt = await mutations.create.mutateAsync(draft);
      clearModal();
      if (receipt.temporaryPassword)
        setPasswordReceipt({
          kind: "created",
          name: receipt.owner.fullName,
          login: receipt.owner.email ?? receipt.owner.phone ?? "Tidak tersedia",
          password: receipt.temporaryPassword,
        });
      return;
    }
    if (selectedId) {
      await mutations.update.mutateAsync({ ownerId: selectedId, ...draft });
      clearModal();
    }
  };
  const submitAssignment = async () => {
    setAssignmentSubmitAttempted(true);
    if (!selectedId || Object.keys(assignmentErrors).length > 0) return;
    if (assignmentKind === "building")
      await mutations.assignBuildings.mutateAsync({
        ownerId: selectedId,
        buildingId,
        effectiveFrom,
        effectiveUntil: effectiveUntil || undefined,
        reason: assignmentReason,
      });
    else
      await mutations.assignRooms.mutateAsync({
        ownerId: selectedId,
        roomIds,
        effectiveFrom,
        effectiveUntil: effectiveUntil || undefined,
        reason: assignmentReason,
      });
    clearModal();
  };
  const submitRelease = async () => {
    if (!selectedId || !releaseTarget || !assignmentReason.trim() || !effectiveUntil) return;
    await mutations.release.mutateAsync({
      ownerId: selectedId,
      assignmentId: releaseTarget.id,
      kind: releaseTarget.kind,
      effectiveUntil,
      reason: assignmentReason,
    });
    clearModal();
  };
  const submitBatchRelease = async () => {
    setBatchReleaseSubmitAttempted(true);
    if (!selectedId || !batchReleaseTarget || Object.keys(batchReleaseErrors).length > 0) return;
    await mutations.releaseBatch.mutateAsync({
      ownerId: selectedId,
      assignmentIds: batchReleaseTarget.items.map((item) => item.id),
      kind: batchReleaseTarget.kind,
      effectiveUntil,
      reason: assignmentReason,
    });
    clearModal();
  };
  const resultCopy = useMemo(
    () =>
      `${owners.data?.meta.total ?? 0} Owner Property${search || status ? " sesuai filter" : " terdaftar"}`,
    [owners.data?.meta.total, search, status],
  );
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6">
      <div className={cn("flex justify-end", ownerId && "hidden")}>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="size-4" />
          Tambah Owner
        </Button>
      </div>
      <section
        className={cn(
          "grid gap-3 rounded-2xl border border-sky-500/35 bg-sky-500/5 p-4 md:grid-cols-[auto_1fr]",
          ownerId && "hidden",
        )}
      >
        <div className="flex size-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-300">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold">Ownership terpisah dari operasional</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Rumah Kost diassign per bangunan dan mencakup seluruh kamarnya. Apart Kost diassign per
            kamar. Periode tidak dapat tumpang tindih.
          </p>
        </div>
      </section>
      <section className={cn("rounded-2xl border bg-card p-4 shadow-sm", ownerId && "hidden")}>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama, email, atau nomor telepon owner..."
              className="pl-9"
            />
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as "" | "active" | "archived")}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Semua status</option>
            <option value="active">Aktif</option>
            <option value="archived">Diarsipkan</option>
          </select>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Menampilkan <span className="font-semibold text-foreground">{resultCopy}</span>.
        </p>
      </section>
      {loading ? (
        <div className={cn("grid gap-3", ownerId && "hidden")}>
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : error ? (
        <section
          className={cn(
            "rounded-2xl border border-destructive/45 bg-destructive/5 p-8 text-center",
            ownerId && "hidden",
          )}
        >
          <h2 className="font-semibold">Owner Property belum dapat dimuat</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Periksa koneksi server lalu coba lagi.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => void owners.refetch()}>
            Coba lagi
          </Button>
        </section>
      ) : (
        <section
          className={cn(
            "overflow-hidden rounded-2xl border bg-card shadow-sm",
            ownerId && "hidden",
          )}
        >
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/55 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Owner</th>
                  <th className="px-4 py-3">Kontak</th>
                  <th className="px-4 py-3">Akun</th>
                  <th className="px-4 py-3">Rumah Kost</th>
                  <th className="px-4 py-3">Apart Kost</th>
                  <th className="px-4 py-3">Terjadwal</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {owners.data?.data.map((owner) => (
                  <tr key={owner.id} className="border-t">
                    <td className="px-5 py-4">
                      <div className="font-semibold">{owner.fullName}</div>
                      <div className="mt-1">
                        <StatusBadge tone={owner.profileStatus === "active" ? "green" : "slate"}>
                          {ownerStatusLabel(owner.profileStatus)}
                        </StatusBadge>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      <div>{owner.phone ?? "—"}</div>
                      <div className="mt-1">{owner.email ?? "—"}</div>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge tone={owner.accountStatus === "active" ? "green" : "amber"}>
                        {accountLabel(owner.accountStatus)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-4 font-semibold">
                      {owner.activeRumahKostBuildings} bangunan
                    </td>
                    <td className="px-4 py-4 font-semibold">{owner.activeApartKostRooms} kamar</td>
                    <td className="px-4 py-4">
                      {owner.scheduledAssignments ? (
                        <StatusBadge tone="blue">
                          {owner.scheduledAssignments} assignment
                        </StatusBadge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="info"
                          className="gap-1.5"
                          onClick={() => openDetail(owner.id)}
                        >
                          <Eye className="size-3.5" />
                          Detail
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 p-3 lg:hidden">
            {owners.data?.data.map((owner) => (
              <article key={owner.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{owner.fullName}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {owner.phone ?? owner.email ?? "Kontak belum diisi"}
                    </p>
                  </div>
                  <StatusBadge tone={owner.profileStatus === "active" ? "green" : "slate"}>
                    {ownerStatusLabel(owner.profileStatus)}
                  </StatusBadge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-muted/60 p-2">
                    <strong className="block text-base">{owner.activeRumahKostBuildings}</strong>
                    Rumah Kost
                  </div>
                  <div className="rounded-lg bg-muted/60 p-2">
                    <strong className="block text-base">{owner.activeApartKostRooms}</strong>Apart
                    Kost
                  </div>
                  <div className="rounded-lg bg-muted/60 p-2">
                    <strong className="block text-base">{owner.scheduledAssignments}</strong>
                    Terjadwal
                  </div>
                </div>
                <Button
                  className="mt-4 w-full gap-2"
                  variant="info"
                  onClick={() => openDetail(owner.id)}
                >
                  <Eye className="size-4" />
                  Lihat detail
                </Button>
              </article>
            ))}
          </div>
          {owners.data?.data.length === 0 && (
            <div className="p-10 text-center">
              <Landmark className="mx-auto size-8 text-muted-foreground" />
              <h2 className="mt-3 font-semibold">Belum ada Owner Property</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Tambahkan pemilik aset untuk mulai mengelola assignment.
              </p>
              <Button className="mt-4" onClick={openCreate}>
                <Plus className="mr-2 size-4" />
                Tambah Owner
              </Button>
            </div>
          )}
          {(owners.data?.meta.total ?? 0) > 0 && (
            <footer className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground">
                Menampilkan {offset + 1}–
                {Math.min(offset + PAGE_SIZE, owners.data?.meta.total ?? 0)}
                {" dari "}
                {owners.data?.meta.total ?? 0} owner.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={offset === 0}
                  onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
                >
                  Sebelumnya
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={offset + PAGE_SIZE >= (owners.data?.meta.total ?? 0)}
                  onClick={() => setOffset((current) => current + PAGE_SIZE)}
                >
                  Berikutnya
                </Button>
              </div>
            </footer>
          )}
        </section>
      )}
      {ownerId ? (
        <OwnerDetailPageContent
          owner={selectedOwner}
          isLoading={detail.isLoading}
          onBack={() => void navigate({ to: "/property-owners" })}
          onEdit={() => selectedOwner && openEdit(selectedOwner)}
          onAssign={() => {
            setAssignmentKind("building");
            setEffectiveFrom(today());
            setAssignmentSubmitAttempted(false);
            setModal("assign");
          }}
          onReset={() => setModal("reset")}
          onArchive={() =>
            selectedOwner &&
            void mutations.archive
              .mutateAsync(selectedOwner.id)
              .then(() => void navigate({ to: "/property-owners" }))
              .catch(() => undefined)
          }
          onRelease={(target) => {
            setReleaseTarget(target);
            setAssignmentReason("");
            setEffectiveUntil(today());
            setModal("release");
          }}
          onBulkRelease={(target) => {
            setBatchReleaseTarget(target);
            setAssetSelection(null);
            setAssignmentReason("");
            setEffectiveUntil(today());
            setBatchReleaseSubmitAttempted(false);
            setModal("release-batch");
          }}
          assetSelection={assetSelection}
          onAssetSelectionChange={setAssetSelection}
        />
      ) : null}
      <Dialog
        open={modal === "create" || modal === "edit"}
        onOpenChange={(open) => !open && clearModal()}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {modal === "create" ? "Tambah Owner Property" : "Edit Owner Property"}
            </DialogTitle>
            <DialogDescription>
              Satu owner memiliki satu akun login. Password awal hanya ditampilkan sekali setelah
              akun dibuat.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama lengkap" required>
              <Input
                value={draft.fullName}
                onChange={(event) => setDraft({ ...draft, fullName: event.target.value })}
              />
            </Field>
            <Field label="Nomor telepon untuk login" hint="Isi email atau nomor telepon.">
              <Input
                inputMode="tel"
                value={draft.phone}
                onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
              />
            </Field>
            <Field label="Email untuk login" hint="Isi email atau nomor telepon.">
              <Input
                type="email"
                value={draft.email}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              />
            </Field>
            {modal === "create" && (
              <Field
                label="Password awal"
                required
                hint="Minimal 10 karakter. Hanya akan tampil satu kali."
              >
                <Input
                  type="password"
                  value={draft.initialPassword}
                  onChange={(event) => setDraft({ ...draft, initialPassword: event.target.value })}
                />
              </Field>
            )}
            <Field label="Alamat" className="sm:col-span-2">
              <Textarea
                value={draft.address}
                onChange={(event) => setDraft({ ...draft, address: event.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={clearModal}>
              Batal
            </Button>
            <Button
              disabled={
                !draft.fullName.trim() ||
                !hasLoginIdentifier ||
                (modal === "create" && draft.initialPassword.length < 10) ||
                mutations.create.isPending ||
                mutations.update.isPending
              }
              onClick={() => void submitOwner().catch(() => undefined)}
            >
              {(mutations.create.isPending || mutations.update.isPending) && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {modal === "create" ? "Buat owner" : "Simpan perubahan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={modal === "assign"} onOpenChange={(open) => !open && clearModal()}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Kelola kepemilikan aset</DialogTitle>
            <DialogDescription>
              Assignment saat ini tidak menimpa riwayat. Pilih aset yang belum dialokasikan pada
              tanggal efektif.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 rounded-xl bg-muted p-1">
            <Button
              type="button"
              variant={assignmentKind === "building" ? "default" : "ghost"}
              onClick={() => setAssignmentKind("building")}
              className="gap-2"
            >
              <Building2 className="size-4" />
              Rumah Kost
            </Button>
            <Button
              type="button"
              variant={assignmentKind === "room" ? "default" : "ghost"}
              onClick={() => setAssignmentKind("room")}
              className="gap-2"
            >
              <Landmark className="size-4" />
              Apart Kost
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <HeroUiDatePicker
              id="owner-assignment-effective-from"
              label="Mulai berlaku"
              ariaLabel="Tanggal mulai berlaku"
              required
              value={effectiveFrom || undefined}
              error={assignmentSubmitAttempted ? assignmentErrors.effectiveFrom : undefined}
              onChange={(value) => {
                setEffectiveFrom(value ?? "");
                if (value && effectiveUntil && effectiveUntil < value) setEffectiveUntil("");
              }}
            />
            <HeroUiDatePicker
              id="owner-assignment-effective-until"
              label="Berakhir pada (opsional)"
              ariaLabel="Tanggal berakhir ownership"
              value={effectiveUntil || undefined}
              minDate={effectiveFrom || undefined}
              error={assignmentSubmitAttempted ? assignmentErrors.effectiveUntil : undefined}
              onChange={(value) => setEffectiveUntil(value ?? "")}
            />
            <Field
              label="Alasan assignment"
              required
              className="sm:col-span-2"
              error={assignmentSubmitAttempted ? assignmentErrors.reason : undefined}
            >
              <Textarea
                value={assignmentReason}
                onChange={(event) => setAssignmentReason(event.target.value)}
                placeholder="Contoh: pembelian aset investor tahap 1"
              />
            </Field>
          </div>
          {assets.isLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {assignmentKind === "building"
                ? assets.data?.rumahKostBuildings.map((asset) => (
                    <AssetSelection
                      key={asset.id}
                      label={asset.code}
                      option={asset}
                      checked={buildingId === asset.id}
                      onChange={(checked) => setBuildingId(checked ? asset.id : "")}
                    />
                  ))
                : assets.data?.apartKostRooms.map((asset) => (
                    <AssetSelection
                      key={asset.id}
                      label={asset.code}
                      option={asset}
                      checked={roomIds.includes(asset.id)}
                      onChange={(checked) =>
                        setRoomIds((current) =>
                          checked
                            ? [...current, asset.id]
                            : current.filter((id) => id !== asset.id),
                        )
                      }
                    />
                  ))}
            </div>
          )}
          {assignmentSubmitAttempted && assignmentErrors.asset ? (
            <p className="text-sm text-destructive" role="alert">
              {assignmentErrors.asset}
            </p>
          ) : null}
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
            {assignmentKind === "building"
              ? "Bangunan Rumah Kost yang dipilih otomatis mencakup seluruh kamar di dalamnya."
              : "Pilih satu atau lebih kamar Apart Kost. Kamar yang telah ditugaskan pada periode ini tidak dapat dipilih."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={clearModal}>
              Batal
            </Button>
            <Button
              onClick={() => void submitAssignment().catch(() => undefined)}
              disabled={mutations.assignBuildings.isPending || mutations.assignRooms.isPending}
            >
              Simpan assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={modal === "reset"} onOpenChange={(open) => !open && clearModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password Owner</DialogTitle>
            <DialogDescription>
              Password baru akan tampil sekali sebagai receipt. Sampaikan langsung kepada owner.
            </DialogDescription>
          </DialogHeader>
          <Field label="Password baru" required>
            <Input
              type="password"
              value={draft.initialPassword}
              onChange={(event) => setDraft({ ...draft, initialPassword: event.target.value })}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={clearModal}>
              Batal
            </Button>
            <Button
              disabled={
                !selectedId ||
                draft.initialPassword.length < 10 ||
                mutations.resetPassword.isPending
              }
              onClick={() => {
                if (!selectedId) return;
                void mutations.resetPassword
                  .mutateAsync({ ownerId: selectedId, newPassword: draft.initialPassword })
                  .then((receipt) => {
                    clearModal();
                    if (!receipt.temporaryPassword) return;
                    setPasswordReceipt({
                      kind: "reset",
                      name: selectedOwner?.fullName ?? "Owner",
                      login:
                        detail.data?.credentials.loginEmail ??
                        detail.data?.credentials.loginPhone ??
                        selectedOwner?.email ??
                        selectedOwner?.phone ??
                        "Tidak tersedia",
                      password: receipt.temporaryPassword,
                    });
                  })
                  .catch(() => undefined);
              }}
            >
              Reset password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={modal === "release"} onOpenChange={(open) => !open && clearModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Akhiri periode kepemilikan</DialogTitle>
            <DialogDescription>
              {releaseTarget?.label}. Riwayat kepemilikan tetap tersimpan dan aset dapat dialihkan
              setelah tanggal ini.
            </DialogDescription>
          </DialogHeader>
          <HeroUiDatePicker
            id="owner-release-effective-until"
            label="Tanggal berakhir"
            ariaLabel="Tanggal berakhir ownership"
            required
            value={effectiveUntil || undefined}
            onChange={(value) => setEffectiveUntil(value ?? "")}
          />
          <Field label="Alasan pelepasan" required>
            <Textarea
              value={assignmentReason}
              onChange={(event) => setAssignmentReason(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={clearModal}>
              Batal
            </Button>
            <Button
              variant="warning"
              disabled={!effectiveUntil || !assignmentReason.trim() || mutations.release.isPending}
              onClick={() => void submitRelease().catch(() => undefined)}
            >
              Akhiri ownership
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={modal === "release-batch"} onOpenChange={(open) => !open && clearModal()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Akhiri periode kepemilikan terpilih</DialogTitle>
            <DialogDescription>
              {batchReleaseTarget?.items.length ?? 0} aset akan diakhiri pada tanggal yang sama.
              Riwayat kepemilikan tetap tersimpan dan aset dapat dialihkan setelah tanggal ini.
            </DialogDescription>
          </DialogHeader>
          <section className="rounded-xl border border-slate-300 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-muted/20">
            <p className="text-sm font-medium">Aset yang dipilih</p>
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
              {batchReleaseTarget?.items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-slate-200 bg-background px-3 py-2 text-sm dark:border-slate-800"
                >
                  <p className="font-medium">{item.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                </li>
              ))}
            </ul>
          </section>
          <HeroUiDatePicker
            id="owner-batch-release-effective-until"
            label="Tanggal berakhir"
            ariaLabel="Tanggal berakhir ownership terpilih"
            required
            value={effectiveUntil || undefined}
            onChange={(value) => setEffectiveUntil(value ?? "")}
          />
          {batchReleaseSubmitAttempted && batchReleaseErrors.effectiveUntil ? (
            <p className="text-sm text-destructive" role="alert">
              {batchReleaseErrors.effectiveUntil}
            </p>
          ) : null}
          <Field label="Alasan pelepasan" required>
            <Textarea
              value={assignmentReason}
              aria-invalid={Boolean(batchReleaseSubmitAttempted && batchReleaseErrors.reason)}
              onChange={(event) => setAssignmentReason(event.target.value)}
            />
          </Field>
          {batchReleaseSubmitAttempted && batchReleaseErrors.reason ? (
            <p className="-mt-3 text-sm text-destructive" role="alert">
              {batchReleaseErrors.reason}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={clearModal}>
              Batal
            </Button>
            <Button
              variant="warning"
              disabled={mutations.releaseBatch.isPending}
              onClick={() => void submitBatchRelease().catch(() => undefined)}
            >
              Akhiri {batchReleaseTarget?.items.length ?? 0} periode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(passwordReceipt)}
        onOpenChange={(open) => !open && setPasswordReceipt(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {passwordReceipt?.kind === "reset"
                ? "Password Owner berhasil direset"
                : "Akun Owner berhasil dibuat"}
            </DialogTitle>
            <DialogDescription>
              Simpan password ini sekarang. Demi keamanan, password tidak dapat dilihat kembali
              setelah dialog ditutup.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4">
            <p className="font-semibold">{passwordReceipt?.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">Login: {passwordReceipt?.login}</p>
            <p className="mt-3 rounded-md bg-background px-3 py-2 font-mono text-sm break-all">
              {passwordReceipt?.password}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setPasswordReceipt(null)}>
              <CheckCircle2 className="mr-2 size-4" />
              Saya sudah menyimpan password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Label>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function OwnerDetailPageContent({
  owner,
  isLoading,
  onBack,
  onEdit,
  onAssign,
  onReset,
  onArchive,
  onRelease,
  onBulkRelease,
  assetSelection,
  onAssetSelectionChange,
}: {
  owner: import("@/lib/admin-property-owner").PropertyOwnerDetail | PropertyOwner | null;
  isLoading: boolean;
  onBack: () => void;
  onEdit: () => void;
  onAssign: () => void;
  onReset: () => void;
  onArchive: () => void;
  onRelease: (target: ReleaseTarget) => void;
  onBulkRelease: (target: BatchReleaseTarget) => void;
  assetSelection: { kind: "building" | "room"; ids: string[] } | null;
  onAssetSelectionChange: (selection: { kind: "building" | "room"; ids: string[] } | null) => void;
}) {
  const detail = owner && "assets" in owner ? owner : null;
  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 pb-8">
      <div className="flex items-center">
        <Button onClick={onBack}>
          <ArrowLeft className="mr-2 size-4" />
          Kembali ke Owner Property
        </Button>
      </div>
      <div className="space-y-6">
        <header className="rounded-2xl border border-slate-300/90 bg-card p-5 shadow-sm dark:border-slate-700">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserRound className="size-4" />
              </span>
              <span className="truncate">{owner?.fullName ?? "Detail owner"}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Profil, kredensial aman, dan riwayat kepemilikan aset.
            </p>
          </div>
        </header>
        {isLoading ? (
          <div className="grid gap-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-40" />
          </div>
        ) : detail ? (
          <div className="space-y-5">
            <section className="grid gap-3 rounded-2xl border border-slate-300/90 bg-slate-50/80 p-4 shadow-sm dark:border-slate-700 dark:bg-muted/25 sm:grid-cols-2">
              <Info label="Nomor telepon profil" value={detail.phone ?? "Belum diisi"} />
              <Info
                label="Email untuk login"
                value={detail.credentials.loginEmail ?? "Belum diisi"}
              />
              <Info
                label="Nomor telepon untuk login"
                value={detail.credentials.loginPhone ?? "Belum diisi"}
              />
              <Info label="Status akun" value={accountLabel(detail.accountStatus)} />
              <Info
                label="Alamat"
                value={detail.address ?? "Belum diisi"}
                className="sm:col-span-2"
              />
            </section>
            <div className="flex flex-wrap gap-2">
              <Button variant="info" onClick={onEdit}>
                <Pencil className="mr-2 size-4" />
                Edit profil
              </Button>
              <Button variant="default" onClick={onAssign}>
                <Plus className="mr-2 size-4" />
                Kelola kepemilikan
              </Button>
              {detail.credentials.resetAvailable && (
                <Button variant="outline" onClick={onReset}>
                  <KeyRound className="mr-2 size-4" />
                  Reset password
                </Button>
              )}
              {detail.profileStatus === "active" && (
                <Button variant="destructive" onClick={onArchive}>
                  <Trash2 className="mr-2 size-4" />
                  Arsipkan
                </Button>
              )}
            </div>
            <AssetBlock
              title="Rumah Kost aktif / terjadwal"
              icon={<Building2 className="size-4" />}
              empty="Belum ada bangunan Rumah Kost yang ditugaskan."
              items={detail.assets.rumahKostBuildings.map((asset) => ({
                id: asset.id,
                title: asset.buildingCode,
                description: `${asset.buildingName ?? "Bangunan"} · mencakup ${asset.coveredRoomCount} kamar`,
                period: `${displayOwnerDate(asset.effectiveFrom)} — ${displayOwnerDate(asset.effectiveUntil)}`,
                effectiveFrom: asset.effectiveFrom,
                status: asset.assignmentStatus,
                kind: "building" as const,
              }))}
              onRelease={onRelease}
              onBulkRelease={onBulkRelease}
              selection={assetSelection}
              onSelectionChange={onAssetSelectionChange}
              kind="building"
            />
            <AssetBlock
              title="Kamar Apart Kost aktif / terjadwal"
              icon={<Landmark className="size-4" />}
              empty="Belum ada kamar Apart Kost yang ditugaskan."
              items={detail.assets.apartKostRooms.map((asset) => ({
                id: asset.id,
                title: asset.roomCode,
                description: [asset.buildingCode ?? "Bangunan", roomGenderLabel(asset.genderPolicy)]
                  .filter(Boolean)
                  .join(" · "),
                period: `${displayOwnerDate(asset.effectiveFrom)} — ${displayOwnerDate(asset.effectiveUntil)}`,
                effectiveFrom: asset.effectiveFrom,
                status: asset.assignmentStatus,
                kind: "room" as const,
              }))}
              onRelease={onRelease}
              onBulkRelease={onBulkRelease}
              selection={assetSelection}
              onSelectionChange={onAssetSelectionChange}
              kind="room"
            />
            <section>
              <h3 className="mb-3 flex items-center gap-2 font-semibold">
                <CalendarClock className="size-4 text-primary" />
                Riwayat ownership
              </h3>
              <div className="overflow-x-auto rounded-xl border border-slate-300 bg-card shadow-sm dark:border-slate-700">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="bg-slate-100/80 text-left text-xs text-muted-foreground dark:bg-muted/50">
                    <tr>
                      <th className="p-3">Aset</th>
                      <th className="p-3">Jenis</th>
                      <th className="p-3">Periode</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Alasan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.ownershipHistory.map((entry) => (
                      <tr
                        key={`${entry.ownershipKind}-${entry.id}`}
                        className="border-t border-slate-200 dark:border-slate-800"
                      >
                        <td className="p-3 font-semibold">{entry.assetCode}</td>
                        <td className="p-3">
                          {entry.ownershipKind === "building" ? "Rumah Kost" : "Apart Kost"}
                        </td>
                        <td className="p-3">
                          {displayOwnerDate(entry.effectiveFrom)} —{" "}
                          {displayOwnerDate(entry.effectiveUntil)}
                        </td>
                        <td className="p-3">
                          <StatusBadge
                            tone={
                              entry.assignmentStatus === "active"
                                ? "green"
                                : entry.assignmentStatus === "scheduled"
                                  ? "blue"
                                  : "slate"
                            }
                          >
                            {assignmentStatusLabel(entry.assignmentStatus)}
                          </StatusBadge>
                        </td>
                        <td className="p-3 text-muted-foreground">{entry.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : (
          <section className="rounded-2xl border border-destructive/45 bg-destructive/5 p-8 text-center">
            <h2 className="font-semibold">Owner Property tidak ditemukan</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Data ini tidak tersedia pada properti aktif saat ini.
            </p>
          </section>
        )}
      </div>
    </section>
  );
}
function Info({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-background p-3 shadow-sm dark:border-slate-800",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-medium">{value}</p>
    </div>
  );
}
function AssetBlock({
  title,
  icon,
  empty,
  items,
  kind,
  onRelease,
  onBulkRelease,
  selection,
  onSelectionChange,
}: {
  title: string;
  icon: React.ReactNode;
  empty: string;
  items: {
    id: string;
    title: string;
    description: string;
    period: string;
    effectiveFrom: string;
    status: AssignmentStatus;
    kind: "building" | "room";
  }[];
  kind: "building" | "room";
  onRelease: (target: ReleaseTarget) => void;
  onBulkRelease: (target: BatchReleaseTarget) => void;
  selection: { kind: "building" | "room"; ids: string[] } | null;
  onSelectionChange: (selection: { kind: "building" | "room"; ids: string[] } | null) => void;
}) {
  const selectableItems = items.filter((item) => ["active", "scheduled"].includes(item.status));
  const isSelecting = selection?.kind === kind;
  const selectedItems = isSelecting
    ? selectableItems.filter((item) => selection.ids.includes(item.id))
    : [];
  const toggleSelection = (id: string, checked: boolean) => {
    const ids = checked
      ? [...(selection?.ids ?? []), id]
      : (selection?.ids ?? []).filter((selectedId) => selectedId !== id);
    onSelectionChange({ kind, ids });
  };
  return (
    <section className="rounded-2xl border border-slate-300/90 bg-slate-50/55 p-4 shadow-sm dark:border-slate-700 dark:bg-muted/15">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold">
          {icon}
          {title}
        </h3>
        {selectableItems.length > 0 ? (
          isSelecting ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{selectedItems.length} dipilih</span>
              <Button size="sm" variant="destructive" onClick={() => onSelectionChange(null)}>
                Batal
              </Button>
              <Button
                size="sm"
                variant="warning"
                disabled={selectedItems.length === 0}
                onClick={() =>
                  onBulkRelease({
                    kind,
                    items: selectedItems.map((item) => ({
                      id: item.id,
                      kind: item.kind,
                      label: item.title,
                      description: item.description,
                      effectiveFrom: item.effectiveFrom,
                    })),
                  })
                }
              >
                Akhiri {selectedItems.length} periode
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="default"
              onClick={() => onSelectionChange({ kind, ids: [] })}
            >
              Pilih beberapa
            </Button>
          )
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-background/80 p-4 text-sm text-muted-foreground dark:border-slate-700 dark:bg-background/35">
          {empty}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const canSelect = isSelecting && ["active", "scheduled"].includes(item.status);
            const Card = canSelect ? "label" : "article";
            return (
              <Card
                key={item.id}
                className={cn(
                  "block rounded-xl border border-slate-300 bg-card p-4 shadow-sm dark:border-slate-700",
                  canSelect &&
                    "cursor-pointer transition-colors hover:border-primary/65 hover:bg-primary/5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25",
                  isSelecting && selection?.ids.includes(item.id) && "border-primary bg-primary/5",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {canSelect ? (
                        <input
                          aria-label={`Pilih ${item.title}`}
                          type="checkbox"
                          checked={selection?.ids.includes(item.id) ?? false}
                          onChange={(event) => toggleSelection(item.id, event.target.checked)}
                          className="size-4 accent-primary"
                        />
                      ) : null}
                      <h4 className="font-semibold">{item.title}</h4>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <StatusBadge
                    tone={
                      item.status === "active"
                        ? "green"
                        : item.status === "scheduled"
                          ? "blue"
                          : "slate"
                    }
                  >
                    {assignmentStatusLabel(item.status)}
                  </StatusBadge>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{item.period}</p>
                {!isSelecting && ["active", "scheduled"].includes(item.status) && (
                  <Button
                    className="mt-4"
                    size="sm"
                    variant="warning"
                    onClick={() => onRelease({ id: item.id, kind: item.kind, label: item.title })}
                  >
                    Akhiri periode
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
