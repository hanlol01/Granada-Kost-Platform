import { adminUxV2Requester } from "./admin-ux-api";
import { createLeaseArchiveClient } from "./lease-archive-contract";

export const leaseArchiveApi = createLeaseArchiveClient(adminUxV2Requester);
