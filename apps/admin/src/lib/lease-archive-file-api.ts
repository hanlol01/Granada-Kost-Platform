import { adminUxV2Requester } from "./admin-ux-api";
import { createLeaseArchiveFileClient } from "./lease-archive-file-contract";

export const leaseArchiveFileApi = createLeaseArchiveFileClient(adminUxV2Requester);
