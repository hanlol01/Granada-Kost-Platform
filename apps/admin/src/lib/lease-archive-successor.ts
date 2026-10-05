import { z } from "zod";
import { LeaseRevisionContractError } from "./lease-revision-contract.ts";
import { isValidIndonesianPhone } from "./lease-onboarding-form.ts";

export type ArchiveSuccessorSource = {
  archiveId: string; propertyId: string; residentId: string; leaseCode: string;
  residentName: string; phone: string; gender: "male" | "female";
  financialResolutionState: "not_required" | "pending_review" | "resolved";
};

export function archiveSuccessorIdentity(
  resident: { id: string; propertyId: string; fullName: string; phone: string | null; gender: string | null },
  residentId: string,
  propertyId: string,
) {
  if (resident.id !== residentId || resident.propertyId !== propertyId)
    throw new LeaseRevisionContractError("LEASE_REVISION_SCOPE_CHANGED", "");
  const phone = resident.phone?.trim().replace(/[\s().+-]/g, "") ?? "";
  if (!resident.fullName.trim() || !isValidIndonesianPhone(phone) || !["male", "female"].includes(resident.gender ?? ""))
    throw new LeaseRevisionContractError("LEASE_ARCHIVE_SUCCESSOR_IDENTITY_REQUIRED", "");
  return { fullName: resident.fullName, phone, gender: resident.gender as "male" | "female" };
}

/** Only link authority is copied. New room, tariff, policy and payments are chosen afresh. */
export function archiveSuccessorLink(source: ArchiveSuccessorSource, propertyId: string, reason: string) {
  if (source.propertyId !== propertyId) throw new LeaseRevisionContractError("LEASE_REVISION_SCOPE_CHANGED", "");
  const parsed = z.object({ source_archive_id: z.string().uuid(), resident_id: z.string().uuid(),
    archive_replacement_reason: z.string().trim().min(3).max(1000) }).safeParse({
      source_archive_id: source.archiveId, resident_id: source.residentId, archive_replacement_reason: reason,
    });
  if (!parsed.success) throw new LeaseRevisionContractError("LEASE_ARCHIVE_SUCCESSOR_INPUT_REQUIRED", "");
  return parsed.data;
}
