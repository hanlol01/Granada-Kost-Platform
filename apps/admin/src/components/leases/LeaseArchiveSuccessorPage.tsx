import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@granada-kost/api-client";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingState } from "@/components/state";
import { Button } from "@/components/ui/button";
import { NoticeAlert } from "@/components/ui/notice-alert";
import { useResidentDetail } from "@/hooks/useResidents";
import { useAuth } from "@/lib/auth";
import { useProperty } from "@/lib/property";
import { adminErrorNotice } from "@/lib/error-normalizer";
import { leaseArchiveApi } from "@/lib/lease-archive-api";
import {
  archiveSuccessorIdentity,
  type ArchiveSuccessorSource,
} from "@/lib/lease-archive-successor";
import { LeaseCreatePage } from "./LeaseCreatePage";

export function LeaseArchiveSuccessorPage({
  archiveId,
  onCreated,
}: {
  archiveId: string;
  onCreated: (leaseId: string) => void | Promise<void>;
}) {
  const { currentPropertyId } = useProperty();
  const { hasRole, hasPermission } = useAuth();
  const allowed = hasRole("admin") && hasPermission("lease.manage");
  const review = useQuery({
    queryKey: ["lease-archive-restoration-preview", currentPropertyId, archiveId],
    queryFn: ({ signal }) =>
      leaseArchiveApi.restorationPreview(archiveId, currentPropertyId!, signal),
    enabled: Boolean(currentPropertyId && allowed),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const directRestoreAvailable =
    review.data?.decision.allowed === true &&
    review.data.decision.recommendedAction === "direct_restore";
  const profile = useResidentDetail(
    allowed && review.data?.decision.recommendedAction === "linked_successor"
      ? review.data.originalContext.lease.residentId
      : null,
  );
  let source: ArchiveSuccessorSource | undefined;
  let issue: unknown = review.error ?? profile.error;
  if (
    review.data &&
    !directRestoreAvailable &&
    review.data.decision.recommendedAction !== "linked_successor"
  ) {
    issue = new ApiError({
      status: 409,
      code: review.data.decision.code ?? "LEASE_ARCHIVE_RESTORE_STATUS_INVALID",
      message: "",
    });
  }
  if (review.data && profile.data && currentPropertyId) {
    try {
      if (review.data.decision.recommendedAction !== "linked_successor") {
        issue = new ApiError({
          status: 409,
          code: review.data.decision.code ?? "LEASE_ARCHIVE_RESTORE_STATUS_INVALID",
          message: "",
        });
      } else {
        const identity = archiveSuccessorIdentity(
          profile.data,
          review.data.originalContext.lease.residentId,
          currentPropertyId,
        );
        source = {
          archiveId,
          propertyId: currentPropertyId,
          residentId: profile.data.id,
          leaseCode: review.data.originalContext.lease.leaseCode,
          residentName: identity.fullName,
          phone: identity.phone,
          gender: identity.gender,
          financialResolutionState: review.data.financialResolutionState,
        };
      }
    } catch (error) {
      issue = error;
    }
  }
  const notice = issue
    ? adminErrorNotice(issue, "Penyewaan pengganti belum dapat disiapkan")
    : null;
  useEffect(() => {
    if (review.error || profile.error) {
      const value = adminErrorNotice(review.error ?? profile.error);
      toast.error(value.title, { description: value.description });
    }
  }, [review.error, profile.error]);
  if (source && !issue)
    return (
      <LeaseCreatePage
        key={`${currentPropertyId}:${archiveId}`}
        archiveSuccessor={source}
        onCreated={onCreated}
      />
    );
  return (
    <AppShell
      title="Penyewaan Pengganti dari Arsip"
      subtitle="Catatan lama dipertahankan; penyewaan baru ditinjau kembali."
    >
      {!allowed ? (
        <NoticeAlert
          tone="warning"
          title="Akses pengelolaan diperlukan"
          description="Gunakan akun Admin yang memiliki izin mengelola penyewaan pada properti ini."
        />
      ) : !currentPropertyId ? (
        <NoticeAlert
          tone="warning"
          title="Pilih properti terlebih dahulu"
          description="Pilih properti penyewaan pada menu properti, lalu buka kembali arsip yang sesuai."
        />
      ) : directRestoreAvailable ? (
        <NoticeAlert
          tone="info"
          title="Penyewaan ini dapat dipulihkan langsung"
          description="Tidak perlu membuat penyewaan pengganti. Kembali ke arsip, tinjau pemulihan, lalu lakukan koreksi bila ada pencatatan yang perlu diperbaiki. Catatan lama tetap dipertahankan."
        />
      ) : notice ? (
        <NoticeAlert
          tone="destructive"
          title={notice.title}
          description={notice.description}
          action={
            <Button
              variant="info"
              onClick={() => {
                void review.refetch();
                void profile.refetch();
              }}
            >
              Perbarui tinjauan
            </Button>
          }
        />
      ) : (
        <LoadingState />
      )}
      <Button className="mt-5" variant="outline" asChild>
        <Link to="/tenants/archives/$archiveId" params={{ archiveId }}>
          Kembali ke arsip
        </Link>
      </Button>
      {allowed && notice && review.data ? (
        <Button className="ml-0 mt-3 sm:ml-3 sm:mt-5" variant="info" asChild>
          <Link
            to="/tenants/$residentId"
            params={{ residentId: review.data.originalContext.lease.residentId }}
          >
            Periksa profil penghuni
          </Link>
        </Button>
      ) : null}
    </AppShell>
  );
}
