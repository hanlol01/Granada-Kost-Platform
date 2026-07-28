import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminUxV2Requester } from "@/lib/admin-ux-api";
import { useAuth } from "@/lib/auth";
import {
  bookingHoldPostExpiryInvalidationKeys,
  bookingLeadHoldCoverageKey,
  canReadBookingLeadHolds,
  createBookingHoldCoverageExpirySync,
  requestBookingLeadHoldCoverage,
  type BookingLeadHoldCoverage,
} from "@/lib/admin-booking-lead-hold";
import { useProperty } from "@/lib/property";

const HOLD_PAGE_LIMIT = 100;

function retry(failureCount: number, error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return status !== 403 && failureCount < 1;
}

export function useBookingLeadHolds() {
  const { user } = useAuth();
  const { currentPropertyId } = useProperty();
  const queryClient = useQueryClient();
  const expiryRefreshes = useRef(new Set<string>());
  const activeProperty = useRef(currentPropertyId);
  activeProperty.current = currentPropertyId;
  const propertyId = currentPropertyId ?? "";
  const enabled = canReadBookingLeadHolds({
    roles: user?.roles ?? [],
    permissions: user?.permissions ?? [],
    propertyId: currentPropertyId,
  });
  const query = useQuery<BookingLeadHoldCoverage>({
    queryKey: bookingLeadHoldCoverageKey(propertyId, HOLD_PAGE_LIMIT, 0),
    queryFn: () =>
      requestBookingLeadHoldCoverage(
        (path, options) => adminUxV2Requester.get<unknown>(path, options),
        propertyId,
        HOLD_PAGE_LIMIT,
      ),
    enabled,
    retry,
    refetchOnWindowFocus: true,
  });
  const data =
    enabled && query.data?.propertyId === currentPropertyId && query.data.complete === true
      ? query.data
      : undefined;
  const refetch = query.refetch;

  const refreshAfterExpiry = useCallback(
    async (propertyId: string) => {
      if (activeProperty.current !== propertyId) return;
      await refetch();
      await Promise.all(
        bookingHoldPostExpiryInvalidationKeys(propertyId).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
    [queryClient, refetch],
  );

  useEffect(() => {
    expiryRefreshes.current.clear();
  }, [currentPropertyId]);

  useEffect(() => {
    if (!data) return;
    return createBookingHoldCoverageExpirySync({
      coverage: data,
      fired: expiryRefreshes.current,
      onExpire: (expiredPropertyId) => {
        void refreshAfterExpiry(expiredPropertyId);
      },
    });
  }, [data, refreshAfterExpiry]);

  return { ...query, data, accessEnabled: enabled, refreshAfterExpiry };
}
