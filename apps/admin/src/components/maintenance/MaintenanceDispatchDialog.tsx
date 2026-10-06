import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronsUpDown,
  Loader2,
  Plus,
  RotateCw,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import type { ComplaintRecord } from "@/hooks/useComplaints";
import { useDispatchComplaint } from "@/hooks/useComplaintMutations";
import {
  useCreateMaintenanceTechnician,
  useSetMaintenanceTechnicianActive,
} from "@/hooks/useWorkOrders";
import {
  canDispatchComplaint,
  type AdminWorkOrder,
  type MaintenanceDispatchResult,
  type TechnicianReference,
} from "@/lib/admin-maintenance";
import { useAuth } from "@/lib/auth";
import { newIdempotencyKey } from "@/lib/idempotency";
import { toastMutationError, toastMutationSuccess } from "@/lib/mutation-feedback";
import { useProperty } from "@/lib/property";

type MaintenanceDispatchDialogProps = {
  open: boolean;
  complaint: ComplaintRecord | null;
  actionableWorkOrder: AdminWorkOrder | null;
  authorityAnomaly: boolean;
  coverageComplete: boolean;
  technicians: TechnicianReference[] | undefined;
  techniciansLoading: boolean;
  techniciansError: unknown;
  onRetryTechnicians: () => void;
  onOpenChange: (open: boolean) => void;
  onSuccess: (result: MaintenanceDispatchResult) => void;
};

function safeErrorMessage(error: unknown): string | null {
  return error ? "Permintaan belum berhasil. Silakan coba lagi." : null;
}

export function MaintenanceDispatchDialog({
  open,
  complaint,
  actionableWorkOrder,
  authorityAnomaly,
  coverageComplete,
  technicians,
  techniciansLoading,
  techniciansError,
  onRetryTechnicians,
  onOpenChange,
  onSuccess,
}: MaintenanceDispatchDialogProps) {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const mutation = useDispatchComplaint();
  const createTechnicianMutation = useCreateMaintenanceTechnician();
  const setTechnicianActiveMutation = useSetMaintenanceTechnicianActive();
  const resetMutation = mutation.reset;
  const [technicianProfileId, setTechnicianProfileId] = useState("");
  const [technicianPickerOpen, setTechnicianPickerOpen] = useState(false);
  const [manageTechniciansOpen, setManageTechniciansOpen] = useState(false);
  const [newTechnicianName, setNewTechnicianName] = useState("");
  const [newTechnicianSkills, setNewTechnicianSkills] = useState("");
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);
  const propertyAtOpen = useRef<string | null>(null);
  const complaintAtOpen = useRef<string | null>(null);
  const technicianAtSubmit = useRef<string | null>(null);
  const submissionKey = useRef<string | null>(null);
  const submitting = useRef(false);

  const accessAllowed = Boolean(
    complaint &&
    canDispatchComplaint({
      roles: user?.roles ?? [],
      permissions: user?.permissions ?? [],
      propertyId: currentPropertyId,
      complaint,
      actionableWorkOrder,
      authorityAnomaly,
      coverageComplete,
    }),
  );
  const pending = mutation.isPending || submitting.current;
  const directoryPending =
    createTechnicianMutation.isPending || setTechnicianActiveMutation.isPending;
  const activeTechnicians = technicians?.filter((technician) => technician.isActive) ?? [];
  const selectedTechnician = technicians?.find(
    (technician) => technician.id === technicianProfileId,
  );

  const assignedTechnicianProfile = () => {
    const profileId =
      actionableWorkOrder?.assignedTechnicianProfileId ??
      complaint?.assignedTechnicianProfileId ??
      "";
    if (activeTechnicians.some((technician) => technician.id === profileId)) return profileId;
    const legacyUserId = actionableWorkOrder?.assignedToUserId ?? complaint?.assignedToUserId ?? "";
    return activeTechnicians.find((technician) => technician.userId === legacyUserId)?.id ?? "";
  };

  useEffect(() => {
    if (!open) {
      propertyAtOpen.current = null;
      complaintAtOpen.current = null;
      technicianAtSubmit.current = null;
      submissionKey.current = null;
      setTechnicianProfileId("");
      setTechnicianPickerOpen(false);
      setManageTechniciansOpen(false);
      setNewTechnicianName("");
      setNewTechnicianSkills("");
      setConfirmDeactivateId(null);
      resetMutation();
      return;
    }
    if (!accessAllowed) {
      submissionKey.current = null;
      setTechnicianProfileId("");
      resetMutation();
      onOpenChange(false);
      return;
    }
    if (propertyAtOpen.current === null && complaintAtOpen.current === null) {
      propertyAtOpen.current = currentPropertyId;
      complaintAtOpen.current = complaint?.id ?? null;
      setTechnicianProfileId(assignedTechnicianProfile());
      resetMutation();
      return;
    }
    if (currentPropertyId !== propertyAtOpen.current || complaint?.id !== complaintAtOpen.current) {
      submissionKey.current = null;
      setTechnicianProfileId("");
      resetMutation();
      onOpenChange(false);
    }
  }, [
    accessAllowed,
    complaint?.assignedToUserId,
    complaint?.assignedTechnicianProfileId,
    complaint?.id,
    currentPropertyId,
    actionableWorkOrder?.assignedToUserId,
    actionableWorkOrder?.assignedTechnicianProfileId,
    onOpenChange,
    open,
    resetMutation,
    technicians,
  ]);

  useEffect(() => {
    if (!open || !accessAllowed || !technicians) return;
    setTechnicianProfileId((current) => {
      if (current && activeTechnicians.some((technician) => technician.id === current)) {
        return current;
      }
      const next = assignedTechnicianProfile();
      if (next !== current) {
        submissionKey.current = null;
        resetMutation();
      }
      return next;
    });
  }, [
    accessAllowed,
    complaint?.assignedToUserId,
    complaint?.assignedTechnicianProfileId,
    open,
    resetMutation,
    technicians,
    actionableWorkOrder?.assignedToUserId,
    actionableWorkOrder?.assignedTechnicianProfileId,
  ]);

  if (!complaint) return null;

  const selectTechnician = (nextTechnicianId: string) => {
    if (!activeTechnicians.some((technician) => technician.id === nextTechnicianId)) return;
    if (nextTechnicianId !== technicianProfileId) {
      submissionKey.current = null;
      resetMutation();
    }
    setTechnicianProfileId(nextTechnicianId);
    setTechnicianPickerOpen(false);
  };

  const close = () => {
    if (pending) return;
    submissionKey.current = null;
    setTechnicianProfileId("");
    resetMutation();
    onOpenChange(false);
  };

  const createTechnician = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentPropertyId || directoryPending || pending) return;
    try {
      const technician = await createTechnicianMutation.mutateAsync({
        propertyId: currentPropertyId,
        displayName: newTechnicianName,
        skillTags: newTechnicianSkills,
      });
      submissionKey.current = null;
      resetMutation();
      setTechnicianProfileId(technician.id);
      setNewTechnicianName("");
      setNewTechnicianSkills("");
      toastMutationSuccess("Teknisi ditambahkan ke daftar");
    } catch (error) {
      toastMutationError(error, "Gagal menambahkan teknisi");
    }
  };

  const setTechnicianActive = async (technicianId: string, isActive: boolean) => {
    if (!currentPropertyId || directoryPending || pending) return;
    try {
      await setTechnicianActiveMutation.mutateAsync({
        propertyId: currentPropertyId,
        technicianId,
        isActive,
      });
      if (!isActive) {
        setTechnicianProfileId((current) => (current === technicianId ? "" : current));
        setConfirmDeactivateId(null);
      }
      toastMutationSuccess(isActive ? "Teknisi diaktifkan kembali" : "Teknisi dinonaktifkan");
    } catch (error) {
      toastMutationError(error, "Gagal memperbarui status teknisi");
    }
  };

  const submit = async () => {
    const propertyId = propertyAtOpen.current;
    const complaintId = complaintAtOpen.current;
    const technicianIsAuthoritative = activeTechnicians.some(
      (technician) => technician.id === technicianProfileId,
    );
    const accessIsCurrent = canDispatchComplaint({
      roles: user?.roles ?? [],
      permissions: user?.permissions ?? [],
      propertyId: currentPropertyId,
      complaint,
      actionableWorkOrder,
      authorityAnomaly,
      coverageComplete,
    });
    if (
      !accessAllowed ||
      !accessIsCurrent ||
      !propertyId ||
      !complaintId ||
      propertyId !== currentPropertyId ||
      complaint.id !== complaintId ||
      !technicianProfileId ||
      !technicianIsAuthoritative ||
      techniciansLoading ||
      Boolean(techniciansError) ||
      submitting.current ||
      mutation.isPending
    ) {
      return;
    }

    submitting.current = true;
    technicianAtSubmit.current = technicianProfileId;
    const idempotencyKey = submissionKey.current ?? newIdempotencyKey();
    submissionKey.current = idempotencyKey;
    try {
      const result = await mutation.mutateAsync({
        propertyId,
        complaintId,
        complaintCode: complaint.complaintCode,
        roomId: complaint.roomId,
        priority: complaint.priority,
        technicianProfileId,
        idempotencyKey,
      });
      if (
        propertyAtOpen.current !== currentPropertyId ||
        complaintAtOpen.current !== complaint.id ||
        technicianAtSubmit.current !== technicianProfileId
      ) {
        return;
      }
      submissionKey.current = null;
      toastMutationSuccess(actionableWorkOrder ? "Teknisi diganti" : "Teknisi ditugaskan");
      onSuccess(result);
      onOpenChange(false);
    } catch (error) {
      if (
        propertyAtOpen.current === currentPropertyId &&
        complaintAtOpen.current === complaint.id &&
        technicianAtSubmit.current === technicianProfileId
      ) {
        toastMutationError(error, "Gagal menugaskan teknisi");
      }
    } finally {
      submitting.current = false;
    }
  };

  const errorMessage = safeErrorMessage(mutation.error);
  const descriptionId = "maintenance-technician-description";
  const errorId = "maintenance-dispatch-error";

  return (
    <Dialog open={open && accessAllowed} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {manageTechniciansOpen
              ? "Kelola Teknisi"
              : actionableWorkOrder
                ? "Ganti teknisi maintenance"
                : "Tugaskan teknisi maintenance"}
          </DialogTitle>
          <DialogDescription>
            {manageTechniciansOpen
              ? "Tambahkan teknisi properti atau ubah status aktifnya untuk penugasan maintenance."
              : "Penugasan ini membuat atau memperbarui tugas maintenance untuk tiket ini. Data kamar, penyewaan, tagihan, dan pembayaran tidak berubah."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          {!manageTechniciansOpen ? (
            <>
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <p className="text-xs text-muted-foreground">Tiket</p>
                <p className="break-words font-medium">{complaint.complaintCode}</p>
              </div>

              {techniciansLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Memuat teknisi…
                </div>
              ) : techniciansError ? (
                <div className="space-y-2" role="alert">
                  <p className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                    Gagal memuat daftar teknisi.
                  </p>
                  <Button variant="outline" size="sm" onClick={onRetryTechnicians}>
                    <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
                    Coba lagi
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label id="maintenance-technician-label">Teknisi</Label>
                    <Popover open={technicianPickerOpen} onOpenChange={setTechnicianPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={technicianPickerOpen}
                          aria-labelledby="maintenance-technician-label"
                          aria-describedby={`${descriptionId}${errorMessage ? ` ${errorId}` : ""}`}
                          disabled={pending || directoryPending}
                          className="min-h-11 w-full justify-between font-normal"
                        >
                          <span className="truncate text-left">
                            {selectedTechnician?.displayName ?? "Pilih teknisi aktif"}
                          </span>
                          <ChevronsUpDown
                            className="ml-2 h-4 w-4 shrink-0 opacity-50"
                            aria-hidden="true"
                          />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-[var(--radix-popover-trigger-width)] p-0"
                      >
                        <Command>
                          <CommandInput placeholder="Cari nama atau keahlian…" autoFocus />
                          <CommandList>
                            <CommandEmpty>Tidak ada teknisi aktif yang cocok.</CommandEmpty>
                            <CommandGroup>
                              {activeTechnicians.map((technician) => (
                                <CommandItem
                                  key={technician.id}
                                  value={`${technician.displayName} ${technician.skillTags ?? ""} ${technician.id}`}
                                  onSelect={() => selectTechnician(technician.id)}
                                  className="items-start"
                                >
                                  <Check
                                    className={`mt-0.5 mr-2 h-4 w-4 shrink-0 ${
                                      technician.id === technicianProfileId
                                        ? "opacity-100"
                                        : "opacity-0"
                                    }`}
                                    aria-hidden="true"
                                  />
                                  <span className="flex min-w-0 flex-col">
                                    <span className="break-words">{technician.displayName}</span>
                                    {technician.skillTags ? (
                                      <span className="break-words text-xs text-muted-foreground">
                                        {technician.skillTags}
                                      </span>
                                    ) : null}
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <p id={descriptionId} className="text-xs text-muted-foreground">
                      Pilihan hanya berlaku untuk penugasan baru. Data teknisi tidak memerlukan akun
                      login.
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    disabled={pending || directoryPending}
                    onClick={() => setManageTechniciansOpen(true)}
                  >
                    Kelola teknisi
                  </Button>
                  {errorMessage ? (
                    <p id={errorId} role="alert" className="break-words text-sm text-destructive">
                      {errorMessage}
                    </p>
                  ) : null}
                </div>
              )}
            </>
          ) : (
            <section className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div>
                  <h3 className="text-sm font-semibold">Daftar teknisi properti</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Teknisi yang dinonaktifkan akan hilang dari daftar dan pilihan penugasan baru.
                    Riwayat tugas yang sudah ada tetap tersimpan.
                  </p>
                </div>

                {techniciansLoading ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Memuat teknisi…
                  </div>
                ) : techniciansError ? (
                  <div className="mt-4 space-y-2" role="alert">
                    <p className="flex items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4" aria-hidden="true" />
                      Gagal memuat daftar teknisi.
                    </p>
                    <Button variant="outline" size="sm" onClick={onRetryTechnicians}>
                      <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
                      Coba lagi
                    </Button>
                  </div>
                ) : (
                  <>
                    <form
                      onSubmit={(event) => void createTechnician(event)}
                      className="mt-4 space-y-3"
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor="new-maintenance-technician-name">Nama teknisi</Label>
                        <Input
                          id="new-maintenance-technician-name"
                          value={newTechnicianName}
                          onChange={(event) => setNewTechnicianName(event.target.value)}
                          maxLength={120}
                          autoComplete="off"
                          placeholder="Contoh: Budi Santoso"
                          disabled={directoryPending || pending}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="new-maintenance-technician-skills">
                          Tugas atau keahlian
                        </Label>
                        <Textarea
                          id="new-maintenance-technician-skills"
                          value={newTechnicianSkills}
                          onChange={(event) => setNewTechnicianSkills(event.target.value)}
                          maxLength={300}
                          rows={2}
                          placeholder="Contoh: listrik, AC, dan plumbing"
                          disabled={directoryPending || pending}
                        />
                      </div>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={
                          directoryPending ||
                          pending ||
                          !newTechnicianName.trim() ||
                          !newTechnicianSkills.trim()
                        }
                      >
                        {createTechnicianMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                        )}
                        Tambahkan teknisi
                      </Button>
                    </form>

                    <div className="mt-4 max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border bg-background">
                      {activeTechnicians.length ? (
                        activeTechnicians.map((technician) => (
                          <div key={technician.id} className="space-y-2 p-3">
                            <div className="flex min-w-0 items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="break-words text-sm font-medium">
                                  {technician.displayName}
                                </p>
                                {technician.skillTags ? (
                                  <p className="mt-0.5 break-words text-xs text-muted-foreground">
                                    {technician.skillTags}
                                  </p>
                                ) : null}
                                <p className="mt-1 text-xs text-muted-foreground">Aktif</p>
                              </div>
                              {confirmDeactivateId === technician.id ? null : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  disabled={directoryPending || pending}
                                  onClick={() => setConfirmDeactivateId(technician.id)}
                                >
                                  Nonaktifkan
                                </Button>
                              )}
                            </div>
                            {confirmDeactivateId === technician.id ? (
                              <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-2">
                                <p className="text-xs text-foreground">
                                  Teknisi ini tidak dapat dipilih untuk tugas baru. Tugas yang sudah
                                  berjalan tidak berubah.
                                </p>
                                <div className="flex flex-wrap justify-end gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={directoryPending || pending}
                                    onClick={() => setConfirmDeactivateId(null)}
                                  >
                                    Kembali
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    disabled={directoryPending || pending}
                                    onClick={() => void setTechnicianActive(technician.id, false)}
                                  >
                                    {setTechnicianActiveMutation.isPending ? (
                                      <Loader2
                                        className="mr-2 h-4 w-4 animate-spin"
                                        aria-hidden="true"
                                      />
                                    ) : null}
                                    Nonaktifkan teknisi
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <p className="p-3 text-sm text-muted-foreground">
                          Belum ada teknisi aktif.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>
          )}
        </div>

        {manageTechniciansOpen ? (
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
            <Button
              variant="success"
              className="min-h-11 bg-success text-success-foreground hover:bg-success/90"
              onClick={() => setManageTechniciansOpen(false)}
              disabled={directoryPending}
            >
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Kembali ke penugasan
            </Button>
            <Button variant="default" className="min-h-11" onClick={close} disabled={pending}>
              Tutup
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
            <Button variant="outline" className="min-h-11" onClick={close} disabled={pending}>
              Batal
            </Button>
            <Button
              variant={actionableWorkOrder ? "default" : "success"}
              className={`min-h-11 ${
                actionableWorkOrder ? "" : "bg-success text-success-foreground hover:bg-success/90"
              }`}
              onClick={() => void submit()}
              disabled={
                !technicianProfileId ||
                !technicians?.some(
                  (technician) => technician.id === technicianProfileId && technician.isActive,
                ) ||
                pending ||
                techniciansLoading ||
                Boolean(techniciansError)
              }
            >
              {pending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <UserCog className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {actionableWorkOrder ? "Ganti Teknisi" : "Tugaskan Teknisi"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
