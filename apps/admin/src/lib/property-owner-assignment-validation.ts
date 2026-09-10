export type OwnerAssignmentFieldError = "asset";

export type OwnerAssignmentValidationInput = {
  kind: "building" | "room";
  reason?: string;
  buildingId: string;
  roomIds: readonly string[];
};

export function validateOwnerAssignment(
  input: OwnerAssignmentValidationInput,
): Partial<Record<OwnerAssignmentFieldError, string>> {
  const errors: Partial<Record<OwnerAssignmentFieldError, string>> = {};

  if (input.kind === "building" && !input.buildingId) {
    errors.asset = "Pilih satu bangunan Rumah Kost.";
  }
  if (input.kind === "room" && input.roomIds.length === 0) {
    errors.asset = "Pilih minimal satu kamar Apart Kost.";
  }

  return errors;
}
