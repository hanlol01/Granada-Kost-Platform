export type LeaseActivationResponse = {
  leaseId: string;
  leaseStatus: "active";
  occupancyStatus: "active";
  roomNumber: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseLeaseActivation(value: unknown): LeaseActivationResponse {
  const envelope =
    value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!envelope || Object.keys(envelope).sort().join(",") !== "data") {
    throw new Error("Invalid lease activation response");
  }
  const data =
    envelope?.data !== null && typeof envelope?.data === "object"
      ? (envelope.data as Record<string, unknown>)
      : null;
  const keys = data ? Object.keys(data).sort().join(",") : "";
  if (
    !data ||
    keys !== "leaseId,leaseStatus,occupancyStatus,roomNumber" ||
    typeof data.leaseId !== "string" ||
    !UUID.test(data.leaseId) ||
    data.leaseStatus !== "active" ||
    data.occupancyStatus !== "active" ||
    typeof data.roomNumber !== "string" ||
    data.roomNumber.trim().length === 0
  ) {
    throw new Error("Invalid lease activation response");
  }
  return {
    leaseId: data.leaseId,
    leaseStatus: "active",
    occupancyStatus: "active",
    roomNumber: data.roomNumber,
  };
}

export function requestLeaseActivation(
  post: (path: string, body: object, options: { idempotencyKey: string }) => Promise<unknown>,
  leaseId: string,
  propertyId: string,
  idempotencyKey: string,
  activatedAt?: string,
): Promise<LeaseActivationResponse> {
  if (!UUID.test(leaseId) || !UUID.test(propertyId) || !idempotencyKey.trim())
    throw new Error("LEASE_ACTIVATION_REQUEST_INVALID");
  return post(
    `/leases/${encodeURIComponent(leaseId)}/activate`,
    activatedAt
      ? { property_id: propertyId, activated_at: activatedAt }
      : { property_id: propertyId },
    { idempotencyKey },
  ).then(parseLeaseActivation);
}
