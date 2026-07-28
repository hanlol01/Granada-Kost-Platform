import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, RotateCw, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ComplaintRecord } from "@/hooks/useComplaints";
import { useDispatchComplaint } from "@/hooks/useComplaintMutations";
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
  const resetMutation = mutation.reset;
  const [technicianUserId, setTechnicianUserId] = useState("");
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

  useEffect(() => {
    if (!open) {
      propertyAtOpen.current = null;
      complaintAtOpen.current = null;
      technicianAtSubmit.current = null;
      submissionKey.current = null;
      setTechnicianUserId("");
      resetMutation();
      return;
    }
    if (!accessAllowed) {
      submissionKey.current = null;
      setTechnicianUserId("");
      resetMutation();
      onOpenChange(false);
      return;
    }
    if (propertyAtOpen.current === null && complaintAtOpen.current === null) {
      propertyAtOpen.current = currentPropertyId;
      complaintAtOpen.current = complaint?.id ?? null;
      const currentTechnician = complaint?.assignedToUserId ?? "";
      setTechnicianUserId(
        technicians?.some((technician) => technician.userId === currentTechnician)
          ? currentTechnician
          : "",
      );
      resetMutation();
      return;
    }
    if (currentPropertyId !== propertyAtOpen.current || complaint?.id !== complaintAtOpen.current) {
      submissionKey.current = null;
      setTechnicianUserId("");
      resetMutation();
      onOpenChange(false);
    }
  }, [
    accessAllowed,
    complaint?.assignedToUserId,
    complaint?.id,
    currentPropertyId,
    onOpenChange,
    open,
    resetMutation,
    technicians,
  ]);

  useEffect(() => {
    if (!open || !accessAllowed || !technicians) return;
    setTechnicianUserId((current) => {
      if (current && technicians.some((technician) => technician.userId === current)) {
        return current;
      }
      const assignedTechnician = complaint?.assignedToUserId ?? "";
      const next = technicians.some((technician) => technician.userId === assignedTechnician)
        ? assignedTechnician
        : "";
      if (next !== current) {
        submissionKey.current = null;
        resetMutation();
      }
      return next;
    });
  }, [accessAllowed, complaint?.assignedToUserId, open, resetMutation, technicians]);

  if (!complaint) return null;

  const selectTechnician = (nextTechnicianId: string) => {
    if (!technicians?.some((technician) => technician.userId === nextTechnicianId)) return;
    if (nextTechnicianId !== technicianUserId) {
      submissionKey.current = null;
      resetMutation();
    }
    setTechnicianUserId(nextTechnicianId);
  };

  const close = () => {
    if (pending) return;
    submissionKey.current = null;
    setTechnicianUserId("");
    resetMutation();
    onOpenChange(false);
  };

  const submit = async () => {
    const propertyId = propertyAtOpen.current;
    const complaintId = complaintAtOpen.current;
    const technicianIsAuthoritative =
      technicians?.some((technician) => technician.userId === technicianUserId) === true;
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
      !technicianUserId ||
      !technicianIsAuthoritative ||
      techniciansLoading ||
      Boolean(techniciansError) ||
      submitting.current ||
      mutation.isPending
    ) {
      return;
    }

    submitting.current = true;
    technicianAtSubmit.current = technicianUserId;
    const idempotencyKey = submissionKey.current ?? newIdempotencyKey();
    submissionKey.current = idempotencyKey;
    try {
      const result = await mutation.mutateAsync({
        propertyId,
        complaintId,
        complaintCode: complaint.complaintCode,
        roomId: complaint.roomId,
        priority: complaint.priority,
        technicianUserId,
        idempotencyKey,
      });
      if (
        propertyAtOpen.current !== currentPropertyId ||
        complaintAtOpen.current !== complaint.id ||
        technicianAtSubmit.current !== technicianUserId
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
        technicianAtSubmit.current === technicianUserId
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
            {actionableWorkOrder ? "Ganti teknisi maintenance" : "Assign teknisi maintenance"}
          </DialogTitle>
          <DialogDescription>
            Dispatch membuat atau memperbarui work order untuk tiket ini. Tindakan ini tidak
            mengubah kamar, penyewaan, billing, atau pembayaran.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
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
          ) : technicians?.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada teknisi aktif untuk property ini.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="maintenance-technician">Teknisi</Label>
              <Select value={technicianUserId} onValueChange={selectTechnician} disabled={pending}>
                <SelectTrigger
                  id="maintenance-technician"
                  autoFocus
                  className="min-h-11 w-full"
                  aria-describedby={`${descriptionId}${errorMessage ? ` ${errorId}` : ""}`}
                >
                  <SelectValue placeholder="Pilih teknisi aktif" />
                </SelectTrigger>
                <SelectContent>
                  {technicians?.map((technician) => (
                    <SelectItem key={technician.userId} value={technician.userId}>
                      <span className="flex min-w-0 flex-col items-start">
                        <span className="break-words">{technician.displayName}</span>
                        {technician.skillTags ? (
                          <span className="break-words text-xs text-muted-foreground">
                            {technician.skillTags}
                          </span>
                        ) : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id={descriptionId} className="text-xs text-muted-foreground">
                Pilih teknisi aktif yang sesuai dengan kebutuhan tiket.
              </p>
            </div>
          )}

          {errorMessage ? (
            <p id={errorId} role="alert" className="break-words text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
          <Button variant="outline" className="min-h-11" onClick={close} disabled={pending}>
            Batal
          </Button>
          <Button
            className="min-h-11"
            onClick={() => void submit()}
            disabled={
              !technicianUserId ||
              !technicians?.some((technician) => technician.userId === technicianUserId) ||
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
            {actionableWorkOrder ? "Ganti Teknisi" : "Assign Teknisi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
