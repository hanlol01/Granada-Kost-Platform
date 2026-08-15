export type OwnerAssignmentFieldError = "effectiveFrom" | "effectiveUntil" | "reason" | "asset";

export type OwnerAssignmentValidationInput = {
  kind: "building" | "room";
  effectiveFrom: string;
  effectiveUntil: string;
  reason: string;
  buildingId: string;
  roomIds: readonly string[];
};

export function validateOwnerAssignment(
  input: OwnerAssignmentValidationInput,
): Partial<Record<OwnerAssignmentFieldError, string>> {
  const errors: Partial<Record<OwnerAssignmentFieldError, string>> = {};

  if (!input.effectiveFrom) errors.effectiveFrom = "Tanggal mulai berlaku wajib diisi.";
  if (input.effectiveUntil && input.effectiveFrom && input.effectiveUntil <= input.effectiveFrom) {
    errors.effectiveUntil = "Tanggal berakhir harus setelah tanggal mulai.";
  }
  if (!input.reason.trim()) errors.reason = "Alasan assignment wajib diisi.";
  if (input.kind === "building" && !input.buildingId) {
    errors.asset = "Pilih satu bangunan Rumah Kost.";
  }
  if (input.kind === "room" && input.roomIds.length === 0) {
    errors.asset = "Pilih minimal satu kamar Apart Kost.";
  }

  return errors;
}
