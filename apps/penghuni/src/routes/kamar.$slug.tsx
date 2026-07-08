// Public hunian catalog detail page (M18D).
//
// Unauthenticated route: /kamar/$slug renders outside the AuthGuard (public
// `/kamar/` prefix check in __root.tsx GuardedOutlet). Consumes the M18B
// detail API GET /public/hunian-catalog/:slug anonymously (no Authorization
// header, no refresh-token flow) and renders ONLY public-safe hunian/unit/
// group data: no room IDs, no room_code, no exact room numbers, no tenant/
// resident/occupancy PII, no invoice/payment/bank data, no Smart Lock data.
//
// Booking posture unchanged (M16A/M17A/M18A frozen): a booking lead is NOT a
// confirmed booking and never reserves a room; admin/WhatsApp confirmation
// remains authoritative; no online payment booking, no exact room selection,
// no auto reservation, no checkout.
//
// Unknown/malformed slugs render a safe not-found state with a link back to
// /kamar — no internal errors, no ID-probing feedback (M18A rule).

import { useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bath,
  BedDouble,
  Building2,
  Check,
  DoorOpen,
  HelpCircle,
  Image as ImageIcon,
  MessageCircle,
  RefreshCw,
  ScrollText,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIDR } from "@/lib/format";
import {
  isPublicHunianCatalogNotFound,
  toPublicRoomGroup,
  usePublicHunianCatalogDetail,
  type PublicHunianCatalogDetail,
} from "@/hooks/usePublicHunianCatalog";
import {
  buildRoomInquiryMessage,
  buildWhatsAppUrl,
  getPublicWhatsAppNumber,
} from "@/lib/whatsapp-cta";
import { PublicBookingLeadDialog } from "@/components/booking-lead/PublicBookingLeadDialog";

const GALLERY_PLACEHOLDER_COPY =
  "Galeri hunian sedang disiapkan. Hubungi admin untuk foto terbaru atau jadwal survei.";

// Frozen M18A detail-page disclaimer copy.
const FROZEN_DISCLAIMER =
  "Ketersediaan dan nomor kamar dikonfirmasi oleh admin. Pengajuan minat booking belum menjadi booking resmi.";

// Gentle generic note when the backend marks content as needsConfirmation.
const NEEDS_CONFIRMATION_COPY =
  "Beberapa informasi dapat berubah dan akan dikonfirmasi kembali oleh admin.";

// Facility sections in the frozen M18A order. Empty sections are skipped.
const FACILITY_SECTIONS = [
  { key: "facilitiesRoom", title: "Fasilitas Kamar", icon: BedDouble },
  { key: "facilitiesBathroom", title: "Fasilitas Kamar Mandi", icon: Bath },
  { key: "facilitiesShared", title: "Fasilitas Bersama", icon: Users },
  { key: "facilitiesSecurity", title: "Keamanan & Kenyamanan", icon: ShieldCheck },
  { key: "facilitiesService", title: "Layanan", icon: Sparkles },
] as const;

export const Route = createFileRoute("/kamar/$slug")({
  head: () => ({
    meta: [
      { title: "Detail Hunian Kost — Kostation" },
      {
        name: "description",
        content:
          "Lihat detail hunian kost: fasilitas, aturan, FAQ, dan harga. Ajukan minat booking dan admin akan mengonfirmasi ketersediaan via WhatsApp.",
      },
    ],
  }),
  component: KamarDetailPage,
});

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3">
          <p className="text-sm font-bold tracking-tight">Kostation</p>
          <Link to="/login" className="text-xs font-medium text-primary hover:underline">
            Masuk Penghuni
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4">{children}</main>
      <footer className="border-t">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 text-center text-xs text-muted-foreground">
          Booking dikonfirmasi oleh admin melalui WhatsApp. Belum ada pembayaran online untuk
          booking kamar. Pengajuan minat booking belum menjadi booking resmi.
        </div>
      </footer>
    </div>
  );
}

function BackToCatalogLink() {
  return (
    <Link
      to="/kamar"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Kembali ke Katalog Hunian
    </Link>
  );
}

function KamarDetailPage() {
  const { slug } = Route.useParams();
  const detailQuery = usePublicHunianCatalogDetail(slug);
  const whatsAppNumber = getPublicWhatsAppNumber();

  return (
    <PageShell>
      {detailQuery.isPending ? (
        <DetailSkeleton />
      ) : detailQuery.isError ? (
        isPublicHunianCatalogNotFound(detailQuery.error) ? (
          <NotFoundState whatsAppNumber={whatsAppNumber} />
        ) : (
          <ErrorState onRetry={() => void detailQuery.refetch()} />
        )
      ) : (
        <DetailContent detail={detailQuery.data} whatsAppNumber={whatsAppNumber} />
      )}
    </PageShell>
  );
}

function DetailSkeleton() {
  return (
    <div className="pb-10 pt-5">
      <Skeleton className="h-4 w-44" />
      <Skeleton className="mt-4 aspect-[16/9] w-full rounded-xl" />
      <div className="mt-5 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

// Safe not-found state for unknown or malformed slugs (M18B returns 404/400).
// Friendly copy only — no internal errors, no ID-probing feedback.
function NotFoundState({ whatsAppNumber }: { whatsAppNumber: string | null }) {
  const href = whatsAppNumber
    ? buildWhatsAppUrl(
        whatsAppNumber,
        "Halo Admin Kostation, saya mencari informasi hunian di website tetapi halamannya tidak ditemukan. Mohon bantuannya.",
      )
    : null;
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 py-10 text-center">
      <Building2 className="h-8 w-8 text-muted-foreground/60" />
      <p className="text-base font-semibold">Hunian tidak ditemukan</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Hunian yang Anda cari tidak tersedia atau tautannya sudah berubah. Silakan kembali ke
        katalog untuk melihat pilihan hunian lainnya.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link to="/kamar">
            <ArrowLeft className="h-4 w-4" />
            Lihat Katalog Hunian
          </Link>
        </Button>
        {href ? (
          <Button asChild variant="outline">
            <a href={href} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-4 w-4" />
              Hubungi Admin via WhatsApp
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// Generic safe error state — static copy only, never raw backend errors.
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 py-10 text-center">
      <p className="text-sm font-semibold">Detail hunian belum dapat dimuat.</p>
      <p className="text-xs text-muted-foreground">Silakan coba lagi atau hubungi admin.</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Coba lagi
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link to="/kamar">Kembali ke Katalog</Link>
        </Button>
      </div>
    </div>
  );
}

function DetailContent({
  detail,
  whatsAppNumber,
}: {
  detail: PublicHunianCatalogDetail;
  whatsAppNumber: string | null;
}) {
  const [leadFormOpen, setLeadFormOpen] = useState(false);

  // Adapter to the frozen M16E group shape so the M17D lead dialog and the
  // frozen WhatsApp templates are reused unchanged. Lead context fields come
  // from the M18B bookingLeadDefaults (1:1 with the M17B payload). Never
  // includes roomId/room_code/exact room numbers.
  const leadGroup = toPublicRoomGroup(detail);
  const href = whatsAppNumber
    ? buildWhatsAppUrl(whatsAppNumber, buildRoomInquiryMessage(leadGroup))
    : null;

  const gallery = detail.gallery ?? [];
  const facilitySections = FACILITY_SECTIONS.map((section) => ({
    ...section,
    items: detail[section.key] ?? [],
  })).filter((section) => section.items.length > 0);
  const rules = detail.rules ?? [];
  const policies = detail.policies ?? [];
  const faq = detail.faq ?? [];
  const disclaimers = detail.disclaimers ?? [];
  // Rendered only as a gentle generic note; raw backend notes are not shown.
  const showNeedsConfirmation = Array.isArray(detail.needsConfirmation)
    ? detail.needsConfirmation.length > 0
    : Boolean(detail.needsConfirmation);

  return (
    <div className="pb-28 pt-5 sm:pb-10">
      <BackToCatalogLink />

      {/* Gallery / media area — public-safe references from the allowlisted
          API only; graceful placeholder when empty (no dummy photos). */}
      <div className="mt-4 overflow-hidden rounded-xl border bg-muted">
        {gallery.length > 0 ? (
          <div>
            <div className="aspect-[16/9] w-full overflow-hidden">
              <img
                src={gallery[0]}
                alt={detail.title}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
            {gallery.length > 1 ? (
              <div className="grid grid-cols-4 gap-1 p-1">
                {gallery.slice(1, 5).map((src, index) => (
                  <div key={src} className="aspect-[4/3] overflow-hidden rounded-md">
                    <img
                      src={src}
                      alt={`${detail.title} — foto ${index + 2}`}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted to-muted/50 px-6 text-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
            <p className="max-w-sm text-xs leading-snug text-muted-foreground">
              {GALLERY_PLACEHOLDER_COPY}
            </p>
          </div>
        )}
      </div>

      {/* Detail header + price/CTA card */}
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={detail.gender === "male" ? "default" : "secondary"}>
              {detail.genderLabel}
            </Badge>
            <Badge variant="outline">{detail.categoryLabel}</Badge>
          </div>
          <h1 className="mt-2 text-xl font-bold leading-snug tracking-tight sm:text-2xl">
            {detail.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.buildingName || detail.buildingCode || detail.categoryLabel}
            {detail.floorLabel ? ` • ${detail.floorLabel}` : ""}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <DoorOpen className="h-4 w-4" />
            {detail.availabilityCount} kamar tersedia
          </p>
          {detail.shortDescription ? (
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {detail.shortDescription}
            </p>
          ) : null}
        </div>

        <div className="w-full shrink-0 rounded-xl border bg-muted/40 p-4 sm:w-72">
          {detail.priceFromMonthly !== null ? (
            <div>
              <p className="text-[11px] text-muted-foreground">Mulai dari</p>
              <p className="text-xl font-bold leading-tight">
                {formatIDR(detail.priceFromMonthly)}
                <span className="text-xs font-medium text-muted-foreground"> /bulan</span>
              </p>
              {detail.priceFromYearly !== null ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  atau {formatIDR(detail.priceFromYearly)}/tahun
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-base font-semibold text-muted-foreground">
              Harga dikonfirmasi admin
            </p>
          )}

          {/* Desktop CTAs; mobile uses the sticky bottom bar. */}
          <div className="mt-3 hidden flex-col gap-1.5 sm:flex">
            <Button className="w-full" onClick={() => setLeadFormOpen(true)}>
              <Send className="h-4 w-4" />
              {detail.ctaLabel || "Ajukan Minat Booking"}
            </Button>
            {href ? (
              <Button asChild variant="outline" className="w-full">
                <a href={href} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp Admin
                </a>
              </Button>
            ) : (
              <>
                <Button variant="outline" className="w-full" disabled>
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp Admin
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  Nomor WhatsApp admin belum dikonfigurasi.
                </p>
              </>
            )}
          </div>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Nomor kamar akan dikonfirmasi oleh admin.
          </p>
        </div>
      </div>

      <Separator className="my-6" />

      {/* Long description */}
      {detail.longDescription ? (
        <section>
          <h2 className="text-base font-semibold">Tentang Hunian</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {detail.longDescription}
          </p>
        </section>
      ) : null}

      {/* Facilities */}
      {facilitySections.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-base font-semibold">Fasilitas</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {facilitySections.map((section) => (
              <Card key={section.key} className="shadow-sm">
                <CardContent className="p-4">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold">
                    <section.icon className="h-4 w-4 text-primary" />
                    {section.title}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {section.items.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* Rules & policies */}
      {rules.length > 0 || policies.length > 0 ? (
        <section className="mt-6">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold">
            <ScrollText className="h-4 w-4 text-primary" />
            Aturan & Kebijakan Hunian
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rules.length > 0 ? (
              <Card className="shadow-sm">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold">Aturan Hunian</p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-4">
                    {rules.map((rule) => (
                      <li key={rule} className="text-sm text-muted-foreground">
                        {rule}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
            {policies.length > 0 ? (
              <Card className="shadow-sm">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold">Kebijakan Umum</p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-4">
                    {policies.map((policy) => (
                      <li key={policy} className="text-sm text-muted-foreground">
                        {policy}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* FAQ */}
      {faq.length > 0 ? (
        <section className="mt-6">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold">
            <HelpCircle className="h-4 w-4 text-primary" />
            Pertanyaan Umum
          </h2>
          <Accordion type="single" collapsible className="mt-2">
            {faq.map((entry, index) => (
              <AccordionItem key={entry.question} value={`faq-${index}`}>
                <AccordionTrigger className="text-left text-sm">
                  {entry.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {entry.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      ) : null}

      {/* Disclaimers + frozen safe copy */}
      <section className="mt-6 space-y-2">
        {disclaimers.map((disclaimer) => (
          <p key={disclaimer} className="text-[11px] text-muted-foreground">
            {disclaimer}
          </p>
        ))}
        {showNeedsConfirmation ? (
          <p className="text-[11px] text-muted-foreground">{NEEDS_CONFIRMATION_COPY}</p>
        ) : null}
        <p className="rounded-lg border border-dashed px-3 py-2 text-center text-[11px] text-muted-foreground">
          {FROZEN_DISCLAIMER}
        </p>
      </section>

      {/* Sticky mobile CTA bar (simple, safe: same actions as the price card). */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur sm:hidden">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-2">
          <Button className="flex-1" onClick={() => setLeadFormOpen(true)}>
            <Send className="h-4 w-4" />
            {detail.ctaLabel || "Ajukan Minat Booking"}
          </Button>
          {href ? (
            <Button asChild variant="outline">
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp Admin"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      <PublicBookingLeadDialog
        group={leadGroup}
        whatsAppNumber={whatsAppNumber}
        open={leadFormOpen}
        onOpenChange={setLeadFormOpen}
      />
    </div>
  );
}
