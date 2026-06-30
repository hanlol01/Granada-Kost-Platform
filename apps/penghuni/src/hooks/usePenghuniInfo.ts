// Penghuni info domain hook.
//
// Phase 1 has NO public endpoint that a `resident` token can read for
// announcements, kost rules, or FAQ. API_PLANNING lists those surfaces but
// the backend implementation currently exposes only admin-side POST endpoints.
// To avoid creating a fake workflow, this hook always returns empty data with
// a `reason` string the UI uses to render an EmptyState. When the backend
// adds a resident-scoped endpoint, only this file changes.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { qk } from "@/lib/query-client";

export type InfoAnnouncement = {
  id: string;
  title: string;
  body: string;
  publishedAt: string | null;
  priority: "low" | "medium" | "high" | null;
};

export type InfoSection<T> = {
  available: boolean;
  reason: string;
  items: T[];
};

export function useAnnouncements(): UseQueryResult<InfoSection<InfoAnnouncement>> {
  return useQuery<InfoSection<InfoAnnouncement>>({
    queryKey: qk.info.announcements(),
    queryFn: async () => ({
      available: false,
      reason: "Endpoint pengumuman untuk Penghuni belum tersedia di Phase 1.",
      items: [],
    }),
    staleTime: Infinity,
  });
}

export function useKostRules(): UseQueryResult<InfoSection<string>> {
  return useQuery<InfoSection<string>>({
    queryKey: qk.info.rules(),
    queryFn: async () => ({
      available: false,
      reason: "Peraturan kos akan disinkronkan dengan property settings di milestone berikutnya.",
      items: [],
    }),
    staleTime: Infinity,
  });
}

export function useFaqs(): UseQueryResult<InfoSection<{ q: string; a: string }>> {
  return useQuery<InfoSection<{ q: string; a: string }>>({
    queryKey: qk.info.faqs(),
    queryFn: async () => ({
      available: false,
      reason: "FAQ untuk Penghuni belum tersedia di Phase 1.",
      items: [],
    }),
    staleTime: Infinity,
  });
}
