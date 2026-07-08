// Public hunian catalog listing + WhatsApp CTA (M18C).
//
// Unauthenticated route: listed in PUBLIC_ROUTES in __root.tsx so it renders
// outside the AuthGuard. M18C refreshes the M16E /kamar page into a modern
// hotel/apartment-style catalog backed by the M18B public hunian catalog API
// (GET /public/hunian-catalog with gender/category filters). The page renders
// ONLY public-safe hunian/unit/group offerings: no room IDs, no room_code, no
// exact room numbers, no tenant/resident/occupancy data, no payment/invoice
// data, no Smart Lock data.
//
// Booking posture unchanged (M16A/M17A/M18A frozen): a booking lead is NOT a
// confirmed booking and never reserves a room; admin/WhatsApp confirmation
// remains authoritative; no online payment booking, no exact room selection,
// no auto reservation.
//
// "Lihat Detail" is a disabled placeholder on purpose: the /kamar/$slug detail
// page ships in M18D and no placeholder route is added in M18C.

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bath,
  BedDouble,
  Building2,
  DoorOpen,
  Image as ImageIcon,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Snowflake,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/state";
import { formatIDR } from "@/lib/format";
import {
  usePublicRoomSummary,
  type PublicCategory,
  type PublicGender,
} from "@/hooks/usePublicRooms";
import {
  toPublicRoomGroup,
  usePublicHunianCatalog,
  type PublicHunianCatalogItem,
} from "@/hooks/usePublicHunianCatalog";
import {
  buildRoomInquiryMessage,
  buildWhatsAppUrl,
  getPublicWhatsAppNumber,
} from "@/lib/whatsapp-cta";
import { PublicBookingLeadDialog } from "@/components/booking-lead/PublicBookingLeadDialog";

type KamarSearch = {
  gender?: PublicGender;
  category?: PublicCategory;
};

const GENDER_OPTIONS: { value: PublicGender | undefined; label: string }[] = [
  { value: undefined, label: "Semua" },
  { value: "putra", label: "Putra" },
  { value: "putri", label: "Putri" },
];

const CATEGORY_OPTIONS: { value: PublicCategory | undefined; label: string }[] = [
  { value: undefined, label: "Semua" },
  { value: "rukost", label: "Rumah Kost" },
  { value: "apartkost", label: "Apart Kost" },
];

// Hero highlights sourced ONLY from the M18A-1 normalized public-safe master
// data (public tagline / long description). Claims still marked
// needsConfirmation there (e.g. "dekat ITB & UNPAD", "keamanan 24 jam") are
// intentionally NOT rendered to avoid overclaiming.
const HERO_HIGHLIGHTS = [
  { icon: BedDouble, label: "Fully furnished" },
  { icon: Snowflake, label: "AC per kamar" },
  { icon: Bath, label: "Kamar mandi dalam + air panas" },
  { icon: Wifi, label: "WiFi" },
  { icon: ShieldCheck, label: "Keamanan terjaga" },
] as const;

const GALLERY_PLACEHOLDER_COPY =
  "Galeri hunian sedang disiapkan. Hubungi admin untuk foto terbaru atau jadwal survei.";

export const Route = createFileRoute("/kamar")({
  validateSearch: (raw: Record<string, unknown>): KamarSearch => ({
    gender: raw.gender === "putra" || raw.gender === "putri" ? raw.gender : undefined,
    category: raw.category === "rukost" || raw.category === "apartkost" ? raw.category : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Katalog Hunian Kost — Kostation" },
      {
        name: "description",
        content:
          "Jelajahi katalog hunian kost Putra dan Putri: Rumah Kost dan Apart Kost fully furnished. Ajukan minat booking, lalu admin mengonfirmasi ketersediaan via WhatsApp.",
      },
    ],
  }),
  component: KamarPage,
});

function KamarPage() {
  const { gender, category } = Route.useSearch();
  const navigate = Route.useNavigate();

  const summaryQuery = usePublicRoomSummary();
  const catalog = usePublicHunianCatalog({ gender, category });
  const whatsAppNumber = getPublicWhatsAppNumber();

  const setGender = (value: PublicGender | undefined) =>
    void navigate({ search: (prev) => ({ ...prev, gender: value }), replace: true });
  const setCategory = (value: PublicCategory | undefined) =>
    void navigate({ search: (prev) => ({ ...prev, category: value }), replace: true });

  const items = catalog.data ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
          <p className="text-sm font-bold tracking-tight">Kostation</p>
          <Link to="/login" className="text-xs font-medium text-primary hover:underline">
            Masuk Penghuni
          </Link>
        </div>
      </header>

      <section className="border-b bg-gradient-to-b from-primary/10 via-primary/5 to-background">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 text-center sm:py-16">
          <h1 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            Temukan Hunian Kost yang Tepat untuk Anda
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            Katalog hunian Granada Student House Jatinangor di Kostation. Pilih tipe hunian Putra
            atau Putri, ajukan minat booking, dan admin akan menghubungi Anda.
          </p>

          <div className="mx-auto mt-5 flex max-w-2xl flex-wrap items-center justify-center gap-2">
            {HERO_HIGHLIGHTS.map((h) => (
              <span
                key={h.label}
                className="inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-foreground/80 shadow-sm"
              >
                <h.icon className="h-3.5 w-3.5 text-primary" />
                {h.label}
              </span>
            ))}
          </div>

          {summaryQuery.data ? (
            <p className="mt-5 text-xs font-medium text-muted-foreground">
              {summaryQuery.data.totalAvailable} kamar tersedia
              {summaryQuery.data.genders
                .map((g) => ` • ${g.genderLabel} ${g.availableCount}`)
                .join("")}
            </p>
          ) : null}

          <p className="mx-auto mt-4 max-w-md rounded-full border border-dashed px-4 py-1.5 text-[11px] text-muted-foreground">
            Pengajuan minat belum menjadi booking resmi. Ketersediaan dan nomor kamar dikonfirmasi
            oleh admin.
          </p>
        </div>
      </section>

      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2.5 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Untuk siapa?</span>
            {GENDER_OPTIONS.map((opt) => (
              <Button
                key={opt.label}
                size="sm"
                variant={gender === opt.value ? "default" : "outline"}
                className="rounded-full"
                aria-pressed={gender === opt.value}
                onClick={() => setGender(opt.value)}
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
                className="rounded-full"
                aria-pressed={category === opt.value}
                onClick={() => setCategory(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {whatsAppNumber ? null : (
          <p className="mb-4 rounded-lg border border-dashed px-3 py-2 text-center text-xs text-muted-foreground">
            Nomor WhatsApp admin belum dikonfigurasi. Silakan hubungi admin secara langsung.
          </p>
        )}

        {catalog.isPending ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="aspect-[16/10] w-full rounded-none" />
                <CardContent className="space-y-3 p-4">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-9 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : catalog.isError ? (
          <div className="flex min-h-[40vh] w-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-semibold">Katalog hunian belum dapat dimuat.</p>
            <p className="text-xs text-muted-foreground">Silakan coba lagi atau hubungi admin.</p>
            <Button size="sm" variant="outline" onClick={() => void catalog.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Coba lagi
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="Belum ada hunian tersedia"
            description="Belum ada hunian tersedia untuk filter ini. Coba ubah filter atau hubungi admin."
            icon={<Building2 className="h-5 w-5" />}
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <HunianCatalogCard key={item.slug} item={item} whatsAppNumber={whatsAppNumber} />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-center text-xs text-muted-foreground">
          Booking dikonfirmasi oleh admin melalui WhatsApp. Belum ada pembayaran online untuk
          booking kamar. Pengajuan minat booking belum menjadi booking resmi.
        </div>
      </footer>
    </div>
  );
}

function HunianCatalogCard({
  item,
  whatsAppNumber,
}: {
  item: PublicHunianCatalogItem;
  whatsAppNumber: string | null;
}) {
  const [leadFormOpen, setLeadFormOpen] = useState(false);

  // Adapter to the frozen M16E group shape so the M17D lead dialog and the
  // frozen WhatsApp templates are reused unchanged. Lead context fields come
  // from the M18B bookingLeadDefaults (1:1 with the M17B payload). Never
  // includes roomId/room_code/exact room numbers.
  const leadGroup = toPublicRoomGroup(item);

  const href = whatsAppNumber
    ? buildWhatsAppUrl(whatsAppNumber, buildRoomInquiryMessage(leadGroup))
    : null;

  const hasGallery = Boolean(item.galleryPreview && item.galleryPreview.length > 0);
  const facilities = (item.facilitiesPreview ?? []).slice(0, 5);

  return (
    <Card className="group flex flex-col overflow-hidden border shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
        {hasGallery ? (
          // Public-safe media reference from the M18B allowlisted API only.
          <img
            src={item.galleryPreview![0]}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted to-muted/50 px-6 text-center">
            <ImageIcon className="h-7 w-7 text-muted-foreground/50" />
            <p className="text-[11px] leading-snug text-muted-foreground">
              {GALLERY_PLACEHOLDER_COPY}
            </p>
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Badge variant={item.gender === "male" ? "default" : "secondary"}>
            {item.genderLabel}
          </Badge>
          <Badge variant="outline" className="bg-background/90">
            {item.categoryLabel}
          </Badge>
        </div>
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-sm font-semibold leading-snug">{item.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.buildingName || item.buildingCode || item.categoryLabel}
            {item.floorLabel ? ` • ${item.floorLabel}` : ""}
          </p>
        </div>

        {item.shortDescription ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {item.shortDescription}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          {facilities.map((f) => (
            <Badge key={f} variant="outline" className="font-normal text-muted-foreground">
              {f}
            </Badge>
          ))}
        </div>

        <div className="flex items-end justify-between gap-2">
          {item.priceFromMonthly !== null ? (
            <div>
              <p className="text-[11px] text-muted-foreground">Mulai dari</p>
              <p className="text-base font-bold leading-tight">
                {formatIDR(item.priceFromMonthly)}
                <span className="text-xs font-medium text-muted-foreground"> /bulan</span>
              </p>
              {item.priceFromYearly !== null ? (
                <p className="text-[11px] text-muted-foreground">
                  atau {formatIDR(item.priceFromYearly)}/tahun
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm font-semibold text-muted-foreground">Harga dikonfirmasi admin</p>
          )}
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600">
            <DoorOpen className="h-3.5 w-3.5" />
            {item.availabilityCount} kamar tersedia
          </span>
        </div>

        {item.disclaimers && item.disclaimers.length > 0 ? (
          <p className="text-[11px] text-muted-foreground">{item.disclaimers[0]}</p>
        ) : null}

        <div className="mt-auto space-y-1.5 pt-1">
          <Button className="w-full" onClick={() => setLeadFormOpen(true)}>
            <Send className="h-4 w-4" />
            {item.ctaLabel || "Ajukan Minat Booking"}
          </Button>
          <div className="grid grid-cols-2 gap-1.5">
            {/* M18D: links to the public detail page /kamar/$slug (safe slug
                identifier only — never roomId/room_code). */}
            <Button asChild variant="outline">
              <Link to="/kamar/$slug" params={{ slug: item.slug }}>
                Lihat Detail
              </Link>
            </Button>
            {href ? (
              <Button asChild variant="outline">
                <a href={href} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Button>
            )}
          </div>
          {href ? null : (
            <p className="text-center text-[11px] text-muted-foreground">
              Nomor WhatsApp admin belum dikonfigurasi.
            </p>
          )}
          <p className="text-center text-[11px] text-muted-foreground">
            Nomor kamar akan dikonfirmasi oleh admin.
          </p>
        </div>
      </CardContent>
      <PublicBookingLeadDialog
        group={leadGroup}
        whatsAppNumber={whatsAppNumber}
        open={leadFormOpen}
        onOpenChange={setLeadFormOpen}
      />
    </Card>
  );
}
