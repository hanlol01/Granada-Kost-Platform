// THESIS: /kamar is a guided housing journey, not a generic hotel-search grid.
// OWN-WORLD: calm operational blue, cool-white planes, room photography, restrained borders.
// STORY: understand two Kostation categories, compare published facts, then submit a safe lead.
// FIRST VIEWPORT: image-led promise, concise trust copy, and a direct catalog path.
// FORM: continuous guided route, assigned structure 5, staged as a fold-by-fold journey (c171d1f1).
//
// Public authority stays category-level. Visitors compare published categories; exact room
// placement remains an Admin decision. A lead is not a booking, hold, lease, occupancy, invoice,
// or payment.

import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  DoorOpen,
  Image as ImageIcon,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIDR } from "@/lib/format";
import { type PublicCategory, type PublicGender } from "@/hooks/usePublicRooms";
import {
  normalizePublicPlannedStart,
  resolveGalleryImageUrl,
  toPublicRoomGroup,
  usePublicHunianCatalog,
  type PublicHunianCatalogItem,
} from "@/hooks/usePublicHunianCatalog";
import { GALLERY_PLACEHOLDER_COPY } from "@/components/public-gallery/PublicHunianGallery";
import {
  buildRoomInquiryMessage,
  buildWhatsAppUrl,
  getPublicWhatsAppNumber,
} from "@/lib/whatsapp-cta";
import { PublicBookingLeadDialog } from "@/components/booking-lead/PublicBookingLeadDialog";

type KamarSearch = {
  gender?: PublicGender;
  category?: PublicCategory;
  plannedStart?: string;
  paymentSchedule?: "annual" | "two_month_installments";
};

export const Route = createFileRoute("/kamar")({
  validateSearch: (raw: Record<string, unknown>): KamarSearch => ({
    gender: raw.gender === "putra" || raw.gender === "putri" ? raw.gender : undefined,
    category: raw.category === "rukost" || raw.category === "apartkost" ? raw.category : undefined,
    plannedStart: normalizePublicPlannedStart(raw.plannedStart),
    paymentSchedule:
      raw.paymentSchedule === "annual" || raw.paymentSchedule === "two_month_installments"
        ? raw.paymentSchedule
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Hunian Mahasiswa di Jatinangor — Kostation" },
      {
        name: "description",
        content:
          "Bandingkan Rumah Kost dan Apart Kost Putra atau Putri di Granada Student House Jatinangor, lalu ajukan minat booking secara langsung.",
      },
    ],
  }),
  component: KamarPage,
});

function canonicalKamarSearch(search: KamarSearch): KamarSearch {
  return {
    gender: search.gender,
    category: search.category,
    plannedStart: search.plannedStart,
    paymentSchedule: search.paymentSchedule,
  };
}

function canonicalSearchString(search: KamarSearch): string {
  const params = new URLSearchParams();
  if (search.gender) params.set("gender", search.gender);
  if (search.category) params.set("category", search.category);
  if (search.plannedStart) params.set("plannedStart", search.plannedStart);
  if (search.paymentSchedule) params.set("paymentSchedule", search.paymentSchedule);
  return params.toString();
}

function KamarPage() {
  const { gender, category, plannedStart, paymentSchedule } = Route.useSearch();
  const navigate = Route.useNavigate();
  const canonicalSearch = canonicalKamarSearch({ gender, category, plannedStart, paymentSchedule });
  const needsCanonicalSearch =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).toString() !==
      canonicalSearchString(canonicalSearch);

  useEffect(() => {
    if (!needsCanonicalSearch) return;
    void navigate({ search: canonicalSearch, replace: true });
  }, [canonicalSearch, navigate, needsCanonicalSearch]);

  const catalog = usePublicHunianCatalog({ gender, category, plannedStart, paymentSchedule });
  const whatsAppNumber = getPublicWhatsAppNumber();
  const items = useMemo(() => catalog.data ?? [], [catalog.data]);
  const totalAvailability = items.reduce((sum, item) => sum + item.availabilityCount, 0);
  const publishedFacilities = useMemo(
    () => [...new Set(items.flatMap((item) => item.facilitiesPreview))].slice(0, 8),
    [items],
  );
  const gallery = useMemo(
    () =>
      items
        .flatMap((item) =>
          (item.galleryPreview ?? []).map((image) => ({
            ...image,
            categoryLabel: item.categoryLabel,
          })),
        )
        .slice(0, 4),
    [items],
  );
  const publishedTerms = useMemo(
    () => [...new Set(items.flatMap((item) => item.disclaimers ?? []))].slice(0, 4),
    [items],
  );
  const heroCover = gallery[0] ?? null;
  const heroCoverUrl = heroCover ? resolveGalleryImageUrl(heroCover.contentUrl) : null;
  const [heroFailed, setHeroFailed] = useState(false);

  useEffect(() => setHeroFailed(false), [heroCoverUrl]);

  const scrollToCatalog = () =>
    document
      .getElementById("pilihan-hunian")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="relative z-30 border-b bg-background/95">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/kamar" search={{}} className="group inline-flex min-h-11 items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-bold tracking-tight">Kostation</span>
              <span className="block text-[10px] text-muted-foreground">Granada Student House</span>
            </span>
          </Link>
          <nav
            className="hidden items-center gap-7 text-xs font-medium text-muted-foreground md:flex"
            aria-label="Navigasi katalog"
          >
            <a
              href="#pilihan-hunian"
              className="min-h-11 content-center transition-colors hover:text-foreground"
            >
              Pilihan Hunian
            </a>
            <a
              href="#fasilitas"
              className="min-h-11 content-center transition-colors hover:text-foreground"
            >
              Fasilitas
            </a>
            <a
              href="#cara-booking"
              className="min-h-11 content-center transition-colors hover:text-foreground"
            >
              Cara Booking
            </a>
          </nav>
          <Button asChild variant="ghost" className="min-h-11 px-3 text-xs text-primary">
            <Link to="/login">
              Masuk Penghuni <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      <main>
        <section className="relative isolate min-h-[38rem] overflow-visible bg-[oklch(0.22_0.055_250)] text-white sm:min-h-[42rem]">
          {heroCoverUrl && !heroFailed ? (
            <img
              src={heroCoverUrl}
              alt=""
              aria-hidden="true"
              decoding="async"
              fetchPriority="high"
              onError={() => setHeroFailed(true)}
              className="absolute inset-0 h-full w-full object-cover opacity-55"
            />
          ) : (
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,oklch(0.68_0.13_248/0.42),transparent_30%),linear-gradient(125deg,oklch(0.19_0.05_250),oklch(0.36_0.11_252))]"
            />
          )}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-[oklch(0.15_0.045_250/0.96)] via-[oklch(0.18_0.05_250/0.76)] to-[oklch(0.18_0.04_250/0.22)]"
          />

          <div className="relative mx-auto flex w-full max-w-7xl flex-col px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-24 lg:px-8 lg:pt-28">
            <div className="max-w-2xl">
              <Badge className="mb-5 border-white/20 bg-white/10 text-white hover:bg-white/10">
                Hunian mahasiswa di Jatinangor
              </Badge>
              <h1 className="max-w-xl text-balance text-4xl font-bold leading-[1.08] tracking-[-0.03em] sm:text-5xl lg:text-6xl">
                Ruang nyaman untuk hidup, belajar, dan bertumbuh.
              </h1>
              <p className="mt-5 max-w-xl text-pretty text-sm leading-7 text-white/80 sm:text-base">
                Pilih Rumah Kost atau Apart Kost sesuai kebutuhan Anda. Lihat tarif, fasilitas,
                galeri, dan ketentuan sebelum mengajukan minat booking kepada Admin.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-white/80">
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[oklch(0.83_0.12_235)]" />
                  Putra dan Putri terpisah
                </span>
                <span className="inline-flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-[oklch(0.83_0.12_235)]" />
                  Tarif kategori transparan
                </span>
                <span className="inline-flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-[oklch(0.83_0.12_235)]" />
                  Konfirmasi oleh Admin
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          id="pilihan-hunian"
          className="scroll-mt-6 px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-20 lg:px-8"
        >
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-primary">Satu properti, dua pilihan</p>
              <h2 className="mt-2 text-3xl font-bold tracking-[-0.025em] sm:text-4xl">
                Pilih hunian yang paling sesuai.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                Ketersediaan ditampilkan per kategori. Nomor kamar dan penempatan akhir dikonfirmasi
                oleh Admin setelah pengajuan.
              </p>
            </div>

            {catalog.isSuccess ? (
              <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl bg-secondary/65 px-4 py-3 text-xs text-secondary-foreground">
                <DoorOpen className="h-4 w-4 text-primary" />
                <strong>{totalAvailability} kamar tersedia</strong>
                <span className="text-muted-foreground">dari katalog yang diterbitkan Admin</span>
              </div>
            ) : null}

            <div className="mt-8">
              {catalog.isPending ? <CatalogSkeleton /> : null}
              {catalog.isError ? (
                <CatalogMessage
                  icon={<RefreshCw className="h-6 w-6" />}
                  title="Pilihan hunian belum dapat dimuat"
                  description="Koneksi ke katalog mengalami gangguan. Muat ulang tanpa kehilangan pilihan Anda."
                  action={
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() => void catalog.refetch()}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Coba lagi
                    </Button>
                  }
                />
              ) : null}
              {catalog.isSuccess && items.length === 0 ? (
                <CatalogMessage
                  icon={<Building2 className="h-6 w-6" />}
                  title="Belum ada hunian untuk pilihan ini"
                  description="Belum ada kategori hunian yang tersedia untuk ditampilkan. Admin dapat membantu mengecek pilihan lain."
                  action={
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() => void navigate({ search: {}, replace: true })}
                    >
                      Atur ulang pilihan
                    </Button>
                  }
                />
              ) : null}
              {catalog.isSuccess && items.length > 0 ? (
                <div className="grid gap-6 lg:grid-cols-2">
                  {items.map((item) => (
                    <HunianOffer
                      key={item.slug}
                      item={item}
                      preferredGender={
                        gender === "putra" ? "male" : gender === "putri" ? "female" : undefined
                      }
                      whatsAppNumber={whatsAppNumber}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section
          id="fasilitas"
          className="scroll-mt-6 border-y bg-secondary/40 px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
        >
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
              <div className="max-w-xl">
                <p className="text-sm font-semibold text-primary">Fasilitas dan lingkungan</p>
                <h2 className="mt-2 text-3xl font-bold tracking-[-0.025em]">
                  Yang Anda perlukan, dijelaskan sejak awal.
                </h2>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  Daftar berikut berasal dari publikasi Admin untuk kategori yang sedang
                  ditampilkan. Detail lengkap tersedia pada halaman masing-masing hunian.
                </p>
                {publishedFacilities.length > 0 ? (
                  <ul className="mt-7 grid gap-3 sm:grid-cols-2">
                    {publishedFacilities.map((facility) => (
                      <li
                        key={facility}
                        className="flex min-h-11 items-center gap-3 rounded-xl bg-card px-4 py-3 text-sm shadow-sm"
                      >
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                        {facility}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-7 rounded-xl border border-dashed bg-card px-4 py-4 text-sm text-muted-foreground">
                    Fasilitas publik belum diterbitkan untuk pilihan ini.
                  </p>
                )}
              </div>
              <GalleryMosaic images={gallery} />
            </div>
          </div>
        </section>

        <section id="cara-booking" className="scroll-mt-6 px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold text-primary">Proses yang jelas</p>
              <h2 className="mt-2 text-3xl font-bold tracking-[-0.025em] sm:text-4xl">
                Dari memilih sampai dihubungi Admin.
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Pengajuan publik mencatat minat Anda, belum menahan atau menetapkan kamar.
              </p>
            </div>
            <ol className="relative mx-auto mt-12 grid max-w-5xl gap-8 md:grid-cols-3 md:gap-10">
              <ProcessStep
                icon={<Building2 className="h-5 w-5" />}
                title="Bandingkan tipe hunian"
                description="Bandingkan kategori, fasilitas, tarif, dan ketentuan yang telah diterbitkan."
              />
              <ProcessStep
                icon={<Send className="h-5 w-5" />}
                title="Kirim minat booking"
                description="Isi kontak singkat agar pengajuan tercatat dan dapat ditindaklanjuti secara aman."
              />
              <ProcessStep
                icon={<MessageCircle className="h-5 w-5" />}
                title="Admin mengonfirmasi"
                description="Admin menghubungi Anda untuk ketersediaan, penempatan kamar, dan tahap berikutnya."
              />
            </ol>
          </div>
        </section>

        <section className="border-y bg-[oklch(0.22_0.055_250)] px-4 py-16 text-white sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
            <div>
              <div className="flex items-center gap-3 text-sm font-semibold text-[oklch(0.82_0.12_235)]">
                <BookOpen className="h-5 w-5" />
                Ketentuan sebelum mengajukan
              </div>
              <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-[-0.025em]">
                Tidak ada kejutan setelah Anda memilih.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-white/72">
                Tarif, DP, security deposit, ketentuan tinggal, dan pembayaran ditampilkan dari
                kebijakan kategori yang telah dipublikasikan.
              </p>
            </div>
            <div className="space-y-3">
              {(publishedTerms.length > 0
                ? publishedTerms
                : [
                    "Pengajuan minat belum menjadi booking resmi.",
                    "Ketersediaan dan nomor kamar dikonfirmasi oleh Admin.",
                    "Belum ada pembayaran online untuk booking kamar.",
                  ]
              ).map((term) => (
                <div
                  key={term}
                  className="flex gap-3 rounded-xl bg-white/8 px-4 py-3 text-sm text-white/85"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.82_0.12_235)]" />
                  <span>{term}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-7 rounded-2xl bg-primary px-6 py-10 text-center text-primary-foreground shadow-[0_20px_60px_-28px_oklch(0.4_0.16_255/0.8)] sm:px-10 lg:flex-row lg:text-left">
            <div>
              <p className="text-sm font-semibold text-primary-foreground/75">
                Siap melihat pilihan Anda?
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
                Mulai dari kategori yang paling sesuai.
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-primary-foreground/75">
                Bandingkan detailnya, lalu kirim minat booking. Admin akan membantu memastikan kamar
                yang tersedia.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="min-h-12 shrink-0 px-6"
              onClick={scrollToCatalog}
            >
              Lihat Pilihan Hunian <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t bg-card px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© Kostation — Granada Student House Jatinangor</p>
          <p>Minat booking bukan reservasi. Konfirmasi kamar dilakukan oleh Admin.</p>
        </div>
      </footer>
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {[0, 1].map((item) => (
        <div key={item} className="overflow-hidden rounded-2xl bg-card shadow-sm">
          <Skeleton className="aspect-[16/9] rounded-none" />
          <div className="space-y-3 p-6">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CatalogMessage({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed bg-card px-6 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">
        {icon}
      </span>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mt-5">{action}</div>
    </div>
  );
}

function HunianOffer({
  item,
  preferredGender,
  whatsAppNumber,
}: {
  item: PublicHunianCatalogItem;
  preferredGender?: "male" | "female";
  whatsAppNumber: string | null;
}) {
  const [leadFormOpen, setLeadFormOpen] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const directGender =
    item.genderAvailability.find((entry) => entry.gender === preferredGender)?.gender ??
    item.genderAvailability[0]?.gender;
  const leadGroup = directGender ? toPublicRoomGroup(item, directGender) : null;
  const whatsAppHref =
    whatsAppNumber && leadGroup
      ? buildWhatsAppUrl(whatsAppNumber, buildRoomInquiryMessage(leadGroup))
      : null;
  const cover = (item.galleryPreview ?? [])[0] ?? null;
  const coverUrl = cover ? resolveGalleryImageUrl(cover.contentUrl) : null;

  return (
    <article className="group overflow-hidden rounded-2xl bg-card shadow-[0_16px_45px_-28px_oklch(0.25_0.07_250/0.55)]">
      <div className="relative aspect-[16/9] overflow-hidden bg-muted">
        {coverUrl && !coverFailed ? (
          <img
            src={coverUrl}
            alt={cover?.altText || item.title}
            loading="lazy"
            decoding="async"
            onError={() => setCoverFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground/45" />
            <p className="max-w-sm text-xs text-muted-foreground">{GALLERY_PLACEHOLDER_COPY}</p>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex flex-wrap gap-2 bg-gradient-to-b from-black/55 to-transparent p-4 pb-10">
          <Badge className="border-white/20 bg-white/90 text-foreground hover:bg-white/90">
            {item.categoryLabel}
          </Badge>
          {item.genderAvailability.map((entry) => (
            <Badge
              key={entry.gender}
              className="border-white/20 bg-black/45 text-white hover:bg-black/45"
            >
              {entry.genderLabel} · {entry.availabilityCount}
            </Badge>
          ))}
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-xl font-bold tracking-[-0.02em]">{item.title}</h3>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {item.shortDescription || "Informasi hunian mengikuti publikasi kategori dari Admin."}
            </p>
          </div>
          {item.priceFromMonthly !== null ? (
            <div className="shrink-0 sm:text-right">
              <p className="text-xs text-muted-foreground">Tarif bulanan</p>
              <p className="text-xl font-bold text-primary">{formatIDR(item.priceFromMonthly)}</p>
              {item.priceFromYearly !== null ? (
                <p className="text-xs text-muted-foreground">
                  {formatIDR(item.priceFromYearly)}/tahun
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {item.facilitiesPreview.slice(0, 5).map((facility) => (
            <span
              key={facility}
              className="inline-flex min-h-8 items-center rounded-full bg-secondary px-3 text-xs text-secondary-foreground"
            >
              {facility}
            </span>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button className="min-h-11 flex-1" onClick={() => setLeadFormOpen(true)}>
            <Send className="h-4 w-4" />
            {item.ctaLabel || "Ajukan Minat Booking"}
          </Button>
          <Button asChild variant="outline" className="min-h-11 flex-1">
            <Link to="/kamar/$slug" params={{ slug: item.slug }}>
              Lihat Detail <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          {whatsAppHref ? (
            <Button asChild variant="outline" size="icon" className="min-h-11 min-w-11">
              <a
                href={whatsAppHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Tanyakan ${item.title} melalui WhatsApp`}
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            </Button>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          <DoorOpen className="mr-1.5 inline h-3.5 w-3.5 text-primary" />
          {item.availabilityCount} kamar tersedia · nomor kamar dikonfirmasi Admin
        </p>
      </div>
      <PublicBookingLeadDialog
        item={item}
        initialGender={preferredGender}
        whatsAppNumber={whatsAppNumber}
        open={leadFormOpen}
        onOpenChange={setLeadFormOpen}
      />
    </article>
  );
}

function GalleryMosaic({
  images,
}: {
  images: Array<{
    contentUrl: string;
    thumbnailUrl: string | null;
    altText: string;
    caption: string | null;
    categoryLabel: string;
  }>;
}) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const usable = images.filter((image) => !failed.has(image.contentUrl));
  if (usable.length === 0)
    return (
      <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed bg-card px-8 text-center">
        <div>
          <ImageIcon className="mx-auto h-9 w-9 text-muted-foreground/45" />
          <p className="mt-3 text-sm text-muted-foreground">
            Galeri publik belum diterbitkan untuk pilihan ini.
          </p>
        </div>
      </div>
    );
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-rows-2">
      {usable.map((image, index) => (
        <figure
          key={image.contentUrl}
          className={
            index === 0
              ? "relative col-span-2 min-h-56 overflow-hidden rounded-2xl bg-muted sm:col-span-1 sm:row-span-2"
              : "relative min-h-40 overflow-hidden rounded-2xl bg-muted"
          }
        >
          <img
            src={resolveGalleryImageUrl(image.thumbnailUrl ?? image.contentUrl) ?? undefined}
            alt={image.altText}
            loading="lazy"
            decoding="async"
            onError={() => setFailed((current) => new Set(current).add(image.contentUrl))}
            className="h-full w-full object-cover"
          />
          <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-4 pb-3 pt-10 text-xs font-medium text-white">
            {image.caption || image.categoryLabel}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function ProcessStep({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <li className="relative text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
        {icon}
      </span>
      <h3 className="mt-5 text-base font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{description}</p>
    </li>
  );
}
