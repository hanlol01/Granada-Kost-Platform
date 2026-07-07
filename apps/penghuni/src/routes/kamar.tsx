// Public room listing + WhatsApp CTA (M16E).
//
// Unauthenticated route: listed in PUBLIC_ROUTES in __root.tsx so it renders
// outside the AuthGuard. Shows ONLY public-safe aggregated availability from
// the M16D API: no room IDs, no room_code, no exact room numbers, no tenant/
// resident/occupancy data. Booking is confirmed by the admin via WhatsApp;
// there is no online booking or payment on this page.

import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, DoorOpen, MessageCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/state";
import { formatIDR } from "@/lib/format";
import {
  usePublicRoomAvailability,
  usePublicRoomSummary,
  type PublicCategory,
  type PublicGender,
  type PublicRoomGroup,
} from "@/hooks/usePublicRooms";
import {
  buildRoomInquiryMessage,
  buildWhatsAppUrl,
  getPublicWhatsAppNumber,
} from "@/lib/whatsapp-cta";

type KamarSearch = {
  gender?: PublicGender;
  category?: PublicCategory;
};

const GENDER_OPTIONS: { value: PublicGender; label: string }[] = [
  { value: "putra", label: "Putra" },
  { value: "putri", label: "Putri" },
];

const CATEGORY_OPTIONS: { value: PublicCategory | undefined; label: string }[] = [
  { value: undefined, label: "Semua" },
  { value: "rukost", label: "Rumah Kost" },
  { value: "apartkost", label: "Apart Kost" },
];

export const Route = createFileRoute("/kamar")({
  validateSearch: (raw: Record<string, unknown>): KamarSearch => ({
    gender: raw.gender === "putra" || raw.gender === "putri" ? raw.gender : undefined,
    category: raw.category === "rukost" || raw.category === "apartkost" ? raw.category : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Cari Kamar Kost — Kostation" },
      {
        name: "description",
        content:
          "Temukan kamar kost Putra atau Putri yang tersedia, lalu hubungi admin via WhatsApp untuk konfirmasi ketersediaan dan booking.",
      },
    ],
  }),
  component: KamarPage,
});

function KamarPage() {
  const { gender, category } = Route.useSearch();
  const navigate = Route.useNavigate();

  const summaryQuery = usePublicRoomSummary();
  const availability = usePublicRoomAvailability({ gender, category });
  const whatsAppNumber = getPublicWhatsAppNumber();

  const setGender = (value: PublicGender | undefined) =>
    void navigate({ search: (prev) => ({ ...prev, gender: value }), replace: true });
  const setCategory = (value: PublicCategory | undefined) =>
    void navigate({ search: (prev) => ({ ...prev, category: value }), replace: true });

  const groups = availability.data ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <p className="text-sm font-bold tracking-tight">Kostation</p>
          <Link to="/login" className="text-xs font-medium text-primary hover:underline">
            Masuk Penghuni
          </Link>
        </div>
      </header>

      <section className="border-b bg-gradient-to-b from-primary/10 to-background">
        <div className="mx-auto w-full max-w-5xl px-4 py-10 text-center sm:py-14">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Temukan Kamar Kost yang Sesuai
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Pilih kamar Putra atau Putri, lalu hubungi admin untuk konfirmasi ketersediaan.
          </p>
          {summaryQuery.data ? (
            <p className="mt-4 text-xs font-medium text-muted-foreground">
              {summaryQuery.data.totalAvailable} kamar tersedia
              {summaryQuery.data.genders
                .map((g) => ` • ${g.genderLabel} ${g.availableCount}`)
                .join("")}
            </p>
          ) : null}
        </div>
      </section>

      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2.5 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Cari kamar untuk siapa?
            </span>
            {GENDER_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={gender === opt.value ? "default" : "outline"}
                aria-pressed={gender === opt.value}
                onClick={() => setGender(gender === opt.value ? undefined : opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Kategori</span>
            {CATEGORY_OPTIONS.map((opt) => (
              <Button
                key={opt.label}
                size="sm"
                variant={category === opt.value ? "default" : "outline"}
                aria-pressed={category === opt.value}
                onClick={() => setCategory(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {whatsAppNumber ? null : (
          <p className="mb-4 rounded-lg border border-dashed px-3 py-2 text-center text-xs text-muted-foreground">
            Nomor WhatsApp admin belum dikonfigurasi. Silakan hubungi admin secara langsung.
          </p>
        )}

        {availability.isPending ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="space-y-3 p-4">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-9 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : availability.isError ? (
          <div className="flex min-h-[40vh] w-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-semibold">Data kamar belum dapat dimuat.</p>
            <p className="text-xs text-muted-foreground">Silakan coba lagi atau hubungi admin.</p>
            <Button size="sm" variant="outline" onClick={() => void availability.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Coba lagi
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            title="Belum ada kamar tersedia"
            description="Belum ada kamar tersedia untuk filter ini."
            icon={<Building2 className="h-5 w-5" />}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <RoomGroupCard key={group.groupKey} group={group} whatsAppNumber={whatsAppNumber} />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 text-center text-xs text-muted-foreground">
          Booking dikonfirmasi oleh admin melalui WhatsApp. Belum ada pembayaran online untuk
          booking kamar.
        </div>
      </footer>
    </div>
  );
}

function RoomGroupCard({
  group,
  whatsAppNumber,
}: {
  group: PublicRoomGroup;
  whatsAppNumber: string | null;
}) {
  const href = whatsAppNumber
    ? buildWhatsAppUrl(whatsAppNumber, buildRoomInquiryMessage(group))
    : null;

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold leading-snug">{group.publicTitle}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {group.buildingName || group.buildingCode}
              {group.floorLabel ? ` • ${group.floorLabel}` : ""}
            </p>
          </div>
          <Badge variant={group.gender === "male" ? "default" : "secondary"}>
            {group.genderLabel}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{group.categoryLabel}</Badge>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
            <DoorOpen className="h-3.5 w-3.5" />
            {group.availableCount} kamar tersedia
          </span>
        </div>

        <div>
          <p className="text-sm font-semibold">Mulai {formatIDR(group.priceFromMonthly)}/bulan</p>
          {group.priceFromYearly ? (
            <p className="text-xs text-muted-foreground">
              atau {formatIDR(group.priceFromYearly)}/tahun
            </p>
          ) : null}
        </div>

        <div className="mt-auto space-y-1.5">
          {href ? (
            <Button asChild className="w-full">
              <a href={href} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" />
                Tanya Ketersediaan via WhatsApp
              </a>
            </Button>
          ) : (
            <>
              <Button className="w-full" disabled>
                <MessageCircle className="h-4 w-4" />
                Tanya Ketersediaan via WhatsApp
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Nomor WhatsApp admin belum dikonfigurasi.
              </p>
            </>
          )}
          <p className="text-center text-[11px] text-muted-foreground">
            Nomor kamar akan dikonfirmasi oleh admin.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
