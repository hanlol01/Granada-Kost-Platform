import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Instagram,
  MapPin,
  Menu,
  MessageCircle,
  Navigation,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import type {
  PublicHunianCatalogDetail,
  PublicHunianCatalogItem,
  PublicHunianGender,
} from "@/hooks/usePublicHunianCatalog";
import { resolveGalleryImageUrl } from "@/hooks/usePublicHunianCatalog";
import { PublicBookingLeadDialog } from "@/components/booking-lead/PublicBookingLeadDialog";
import { PublicCatalogGallery } from "./PublicCatalogGallery";
import {
  bookingSteps,
  commonAmenities,
  faqItems,
  houseRuleGroups,
  nearbyPlaces,
  specialRules,
  transportPartners,
} from "./publicCatalogContent";

type CatalogCategory = "rukost" | "apartkost";

type Props = {
  item: PublicHunianCatalogItem;
  detail: PublicHunianCatalogDetail | undefined;
  selectedCategory: CatalogCategory;
  onCategoryChange: (category: CatalogCategory) => void;
};

const FALLBACK_IMAGES: Record<CatalogCategory, string> = {
  rukost: "/images/auth/kostation-login-hero.jpg",
  apartkost: "/images/auth/kostation-login-hero.jpg",
};

const navItems = [
  ["Hunian", "#hunian"],
  ["Fasilitas", "#fasilitas"],
  ["Lokasi", "#lokasi"],
  ["Tata tertib", "#tata-tertib"],
  ["FAQ", "#faq"],
] as const;

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function PublicCatalogPage({ item, detail, selectedCategory, onCategoryChange }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedGender, setSelectedGender] = useState<PublicHunianGender>(
    item.genderAvailability[0]?.gender ?? "male",
  );
  const [annualPrice, setAnnualPrice] = useState(false);

  useEffect(() => {
    const available = item.genderAvailability.find((entry) => entry.gender === selectedGender);
    if (!available) setSelectedGender(item.genderAvailability[0]?.gender ?? "male");
  }, [item.genderAvailability, selectedGender]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setInterval(() => setAnnualPrice((value) => !value), 4200);
    return () => window.clearInterval(timer);
  }, []);

  const gallery = detail?.gallery ?? item.galleryPreview;
  const facilities = detail?.facilities.length ? detail.facilities : item.facilitiesPreview;
  const genderAvailability = useMemo(
    () => item.genderAvailability.filter((entry) => entry.availabilityCount > 0),
    [item.genderAvailability],
  );
  const activeAvailability =
    item.genderAvailability.find((entry) => entry.gender === selectedGender) ??
    item.genderAvailability[0];
  const price = annualPrice ? item.priceFromYearly : item.priceFromMonthly;
  const heroImage =
    resolveGalleryImageUrl(
      gallery?.find((image) => image.isCover)?.contentUrl ?? gallery?.[0]?.contentUrl,
    ) ?? FALLBACK_IMAGES[selectedCategory];

  const openBooking = () => setBookingOpen(true);

  return (
    <div className="public-catalog min-h-screen overflow-x-clip bg-[#FDF9F3] text-[#1F1B18]">
      <DesktopHeader onBooking={openBooking} />
      <MobileHeader drawerOpen={drawerOpen} setDrawerOpen={setDrawerOpen} onBooking={openBooking} />

      <main>
        <section className="relative overflow-hidden border-b border-[#DBCBB9]">
          <div className="public-grain absolute inset-0" aria-hidden="true" />

          <div className="relative hidden min-h-[790px] grid-cols-[1.05fr_.95fr] items-center gap-12 px-10 pb-20 pt-28 md:grid xl:px-[7vw]">
            <div className="max-w-3xl">
              <p className="public-kicker">Hunian mahasiswa di Jatinangor</p>
              <h1 className="font-public-display mt-5 text-[clamp(4.5rem,7vw,8.5rem)] leading-[.88] tracking-[-.055em]">
                Hunian nyaman,
                <span className="block italic text-[#5C1D24]">hidup lebih terarah.</span>
              </h1>
              <p className="mt-8 max-w-xl text-lg leading-8 text-[#635C54]">
                KOSTATION menghadirkan ruang tinggal yang tertib, aman, dan dekat dengan ritme
                kampus—untuk belajar, beristirahat, dan bertumbuh.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <PrimaryButton onClick={openBooking}>Ajukan minat booking</PrimaryButton>
                <a className="public-secondary-button" href="#hunian">
                  Lihat pilihan hunian <ArrowRight />
                </a>
              </div>
              <div className="mt-14 flex items-center gap-7 border-t border-[#DBCBB9] pt-7 font-mono text-[11px] uppercase tracking-[.16em] text-[#635C54]">
                <span>{item.availabilityCount} kamar tersedia</span>
                <span>Putra & putri terpisah</span>
                <span>Konfirmasi Admin</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[520px]">
              <div className="public-hero-arch aspect-[9/13] overflow-hidden border border-[#DBCBB9] bg-[#5C1D24] p-3 shadow-[0_36px_80px_rgba(64,7,16,.18)]">
                <img
                  src={heroImage}
                  alt="Kawasan hunian KOSTATION"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="absolute -bottom-8 -left-16 max-w-[270px] border border-[#DBCBB9] bg-[#FFF8F7]/95 p-6 shadow-xl backdrop-blur">
                <Sparkles className="h-5 w-5 text-[#5C1D24]" />
                <p className="font-public-display mt-3 text-2xl leading-tight">
                  Level up your living.
                </p>
                <p className="mt-2 text-sm leading-6 text-[#635C54]">
                  Bukan sekadar tempat tinggal—ini ruang untuk melangkah lebih jauh.
                </p>
              </div>
            </div>
          </div>

          <div className="relative px-5 pb-12 pt-7 text-center md:hidden">
            <p className="font-mono text-[9px] uppercase tracking-[.24em] text-[#5C1D24]">
              Jatinangor · student living
            </p>
            <h1 className="font-public-display mx-auto mt-3 max-w-[350px] text-[2.45rem] leading-[1.02] tracking-[-.04em] text-[#1F1B18]">
              Hunian Nyaman bersama KOSTATION
            </h1>
            <p className="mx-auto mt-3 max-w-[290px] text-[12px] leading-6 text-[#635C54]">
              Tinggal nyaman, dekat kampus, fasilitas lengkap—semua ada di satu tempat.
            </p>

            <div className="relative mx-auto mt-7 h-[520px] w-full max-w-[340px] overflow-hidden rounded-b-[24px] rounded-t-[170px] border-[6px] border-[#FFF8F7] bg-[#5C1D24] shadow-[0_18px_45px_rgba(93,30,36,.18)]">
              <img
                src={heroImage}
                alt="Kawasan hunian KOSTATION"
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#400710]/60 to-transparent" />
              <div className="absolute inset-x-5 bottom-5 border border-white/30 bg-[#400710]/70 px-4 py-3 text-left text-[#FFF8F7] backdrop-blur-md">
                <p className="font-public-display text-xl leading-tight">Level up your living.</p>
                <p className="mt-1 text-[10px] leading-4 text-white/75">
                  Ruang tinggal untuk belajar, beristirahat, dan bertumbuh.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={openBooking}
              className="mx-auto mt-7 flex h-14 w-full max-w-[340px] items-center justify-center gap-3 bg-[#5C1D24] px-6 font-semibold text-[#FFF8F7] shadow-[0_12px_28px_rgba(64,7,16,.16)]"
            >
              Ajukan minat booking <ArrowRight className="h-4 w-4" />
            </button>
            <div className="mx-auto mt-6 grid max-w-[340px] grid-cols-3 gap-2 border-t border-[#DBCBB9] pt-5 text-center font-mono text-[8px] uppercase tracking-[.08em] text-[#635C54]">
              <span>
                {item.availabilityCount}
                <small className="mt-1 block normal-case tracking-normal">kamar tersedia</small>
              </span>
              <span>
                2 tipe
                <small className="mt-1 block normal-case tracking-normal">pilihan hunian</small>
              </span>
              <span>
                Admin
                <small className="mt-1 block normal-case tracking-normal">mengonfirmasi</small>
              </span>
            </div>
          </div>
        </section>

        <section id="hunian" className="scroll-mt-20 px-5 py-20 md:px-10 md:py-28 xl:px-[7vw]">
          <SectionHeading
            eyebrow="Pilihan hunian"
            title="Temukan ruang yang paling sesuai."
            copy="Pilih kategori, lihat fasilitas dan stok kamar terkini, lalu ajukan minat agar Admin dapat membantu langkah berikutnya."
          />

          <div className="mt-10 grid grid-cols-2 rounded-full border border-[#DBCBB9] bg-[#EADECF]/45 p-1 md:ml-auto md:mt-[-60px] md:w-[420px]">
            <CategoryTab
              active={selectedCategory === "rukost"}
              onClick={() => onCategoryChange("rukost")}
            >
              Rumah Kost
            </CategoryTab>
            <CategoryTab
              active={selectedCategory === "apartkost"}
              onClick={() => onCategoryChange("apartkost")}
            >
              Apart Kost
            </CategoryTab>
          </div>

          <article className="mt-10 overflow-hidden border border-[#400710] bg-[#5C1D24] text-[#FFF8F7] shadow-[0_28px_70px_rgba(64,7,16,.15)] md:grid md:grid-cols-[1.08fr_.92fr]">
            <PublicCatalogGallery
              images={gallery}
              title={item.title}
              fallbackImage={FALLBACK_IMAGES[selectedCategory]}
            />
            <div className="flex flex-col p-6 md:p-10 lg:p-12">
              <div className="flex flex-wrap items-center gap-2">
                <span className="public-pill bg-[#FFF8F7] text-[#400710]">
                  {item.categoryLabel}
                </span>
                {item.genderAvailability.map((entry) => (
                  <span
                    key={entry.gender}
                    className="public-pill border border-white/25 bg-white/10"
                  >
                    {entry.genderLabel} · {entry.availabilityCount}
                  </span>
                ))}
              </div>
              <h2 className="font-public-display mt-8 text-5xl leading-none md:text-6xl">
                {item.title}
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#FFF8F7]/72">
                {detail?.longDescription || item.shortDescription}
              </p>

              <div className="mt-9 flex items-end justify-between border-y border-white/16 py-6">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#EADECF]/75">
                    Tarif mulai
                  </p>
                  <p
                    key={`${annualPrice}-${price}`}
                    className="public-price-reveal mt-2 text-3xl font-semibold"
                  >
                    {price == null ? "Hubungi Admin" : rupiah.format(price)}
                  </p>
                  <p className="mt-1 text-sm text-white/60">
                    {annualPrice ? "per tahun" : "per bulan"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAnnualPrice((value) => !value)}
                  className="rounded-full border border-white/25 px-4 py-2 font-mono text-[10px] uppercase tracking-[.12em] transition hover:bg-white hover:text-[#400710]"
                >
                  Lihat /{annualPrice ? "bulan" : "tahun"}
                </button>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-3">
                {(facilities.length
                  ? facilities
                  : ["Tempat tidur dan lemari", "Area belajar", "Kamar mandi dalam", "Wi-Fi"]
                )
                  .slice(0, 6)
                  .map((facility) => (
                    <div
                      key={facility}
                      className="flex min-h-14 items-center gap-3 border border-white/13 bg-[#400710]/28 px-3 py-3 text-sm"
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#FFF8F7]/10">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span className="whitespace-nowrap text-[12px] md:text-sm">{facility}</span>
                    </div>
                  ))}
              </div>

              <div className="mt-auto pt-9">
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[.16em] text-[#EADECF]/70">
                  Pilih hunian untuk
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {genderAvailability.map((entry) => (
                    <button
                      key={entry.gender}
                      type="button"
                      onClick={() => setSelectedGender(entry.gender)}
                      className={`h-12 border text-sm font-semibold transition ${selectedGender === entry.gender ? "border-[#FFF8F7] bg-[#FFF8F7] text-[#400710]" : "border-white/20 text-white hover:bg-white/10"}`}
                    >
                      {entry.genderLabel} · {entry.availabilityCount} tersedia
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={openBooking}
                  disabled={!activeAvailability || activeAvailability.availabilityCount === 0}
                  className="mt-3 flex h-14 w-full items-center justify-center gap-3 bg-[#EADECF] px-5 font-semibold text-[#400710] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-4 w-4" /> Ajukan Minat Booking
                </button>
                <p className="mt-4 text-center text-xs text-white/55">
                  Nomor kamar dan ketersediaan akhir dikonfirmasi oleh Admin.
                </p>
              </div>
            </div>
          </article>
        </section>

        <section
          id="fasilitas"
          className="scroll-mt-20 border-y border-[#DBCBB9] bg-[#FFF8F7] px-5 py-20 md:px-10 md:py-28 xl:px-[7vw]"
        >
          <SectionHeading
            eyebrow="Fasilitas umum"
            title="Semua yang Anda butuhkan, dalam satu kawasan."
            copy="Fasilitas dirancang untuk mendukung rutinitas belajar, bekerja, beristirahat, dan berinteraksi dengan nyaman."
            centered
          />
          <div className="mt-12 grid grid-cols-2 gap-px overflow-hidden border border-[#DBCBB9] bg-[#DBCBB9] md:grid-cols-4">
            {commonAmenities.map(({ icon: Icon, label, description }) => (
              <article
                key={label}
                className="group min-h-48 bg-[#FDF9F3] p-5 transition hover:bg-[#5C1D24] hover:text-[#FFF8F7] md:min-h-56 md:p-7"
              >
                <span className="grid h-11 w-11 place-items-center rounded-full border border-[#DBCBB9] text-[#5C1D24] transition group-hover:border-white/25 group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="font-public-display mt-8 text-xl md:text-2xl">{label}</h3>
                <p className="mt-2 text-xs leading-5 text-[#635C54] transition group-hover:text-white/65 md:text-sm">
                  {description}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-20 grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-start">
            <div>
              <p className="public-kicker">Peraturan khusus</p>
              <h2 className="font-public-display mt-4 text-4xl leading-tight md:text-6xl">
                Tertib bersama,
                <br />
                <em className="text-[#5C1D24]">nyaman bersama.</em>
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {specialRules.map(({ icon: Icon, title, copy }, index) => (
                <article key={title} className="border border-[#DBCBB9] bg-[#FDF9F3] p-6">
                  <div className="flex items-start justify-between">
                    <Icon className="h-5 w-5 text-[#5C1D24]" />
                    <span className="font-mono text-[10px] text-[#9A8D7F]">0{index + 1}</span>
                  </div>
                  <h3 className="font-public-display mt-8 text-2xl">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#635C54]">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="lokasi" className="scroll-mt-20 px-5 py-20 md:px-10 md:py-28 xl:px-[7vw]">
          <div className="overflow-hidden bg-[#400710] text-[#FFF8F7] lg:grid lg:grid-cols-[1fr_.9fr]">
            <div className="relative min-h-[430px] overflow-hidden bg-[#EADECF] p-6 text-[#400710] md:min-h-[560px] md:p-12">
              <div className="public-map-grid absolute inset-0 opacity-60" />
              <div className="relative h-full">
                <span className="public-pill bg-[#5C1D24] text-white">Jatinangor</span>
                <div className="absolute left-[18%] top-[35%] h-px w-[65%] rotate-[-13deg] bg-[#5C1D24]/35" />
                <div className="absolute left-[34%] top-[19%] h-[66%] w-px rotate-[24deg] bg-[#5C1D24]/35" />
                <MapPin className="absolute left-[51%] top-[45%] h-12 w-12 fill-[#5C1D24] text-[#5C1D24] drop-shadow" />
                <div className="absolute bottom-0 left-0 max-w-xs border border-[#DBCBB9] bg-[#FFF8F7]/90 p-5 backdrop-blur">
                  <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#5C1D24]">
                    Titik hunian
                  </p>
                  <p className="font-public-display mt-2 text-2xl">
                    Granada Student House, Jatinangor
                  </p>
                </div>
              </div>
            </div>
            <div className="p-7 md:p-12 lg:p-16">
              <p className="font-mono text-[10px] uppercase tracking-[.22em] text-[#EADECF]">
                Lokasi strategis
              </p>
              <h2 className="font-public-display mt-5 text-4xl leading-tight md:text-6xl">
                Dekat kampus,
                <br />
                dekat ke mana saja.
              </h2>
              <div className="mt-10 space-y-5">
                {[
                  "Berada di kawasan pendidikan Jatinangor",
                  "Akses transportasi dan kebutuhan harian mudah",
                  "Lingkungan hunian tertib dengan akses terkontrol",
                ].map((text) => (
                  <div key={text} className="flex gap-4 border-b border-white/15 pb-5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <p className="text-sm leading-6 text-white/75">{text}</p>
                  </div>
                ))}
              </div>
              <div className="mt-10 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={openBooking}
                  className="h-14 bg-[#FFF8F7] px-5 font-semibold text-[#400710]"
                >
                  Ajukan minat
                </button>
                <a
                  href="https://maps.google.com/?q=Jatinangor"
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-14 items-center justify-center gap-2 border border-white/30 px-5 font-semibold"
                >
                  <Navigation className="h-4 w-4" /> Petunjuk arah
                </a>
              </div>
            </div>
          </div>

          <div className="mt-20">
            <SectionHeading
              eyebrow="Di sekitar Anda"
              title="Tempat terdekat."
              copy="Estimasi jarak membantu Anda memahami ritme kawasan sebelum memilih hunian."
            />
          </div>
          <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {nearbyPlaces.map(([name, distance, time], index) => (
              <article key={name} className="border border-[#DBCBB9] bg-[#FFF8F7] p-5">
                <div className="flex items-center justify-between">
                  <MapPin className="h-4 w-4 text-[#5C1D24]" />
                  <span className="rounded-full bg-[#EADECF] px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider">
                    {time}
                  </span>
                </div>
                <h3 className="font-public-display mt-7 text-lg leading-tight md:text-xl">
                  {name}
                </h3>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-[#635C54]">
                  {distance} · 0{index + 1}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-14 border-y border-[#DBCBB9] py-8">
            <p className="text-center font-mono text-[10px] uppercase tracking-[.2em] text-[#635C54]">
              Mitra transportasi di kawasan
            </p>
            <div className="mt-7 grid grid-cols-3 gap-5 text-center md:grid-cols-6">
              {transportPartners.map((partner) => (
                <span
                  key={partner}
                  className="font-public-display text-xl text-[#400710] md:text-2xl"
                >
                  {partner}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#EADECF]/55 px-5 py-20 md:px-10 md:py-28 xl:px-[7vw]">
          <SectionHeading
            eyebrow="Cara mengajukan"
            title="Tiga langkah, tanpa proses yang membingungkan."
            centered
          />
          <div className="relative mx-auto mt-14 max-w-5xl md:grid md:grid-cols-3 md:gap-8">
            <div className="absolute left-5 top-5 h-[calc(100%-2.5rem)] w-px bg-[#DBCBB9] md:left-[16.66%] md:top-5 md:h-px md:w-[66.66%]" />
            {bookingSteps.map(({ icon: Icon, title, copy }, index) => (
              <article
                key={title}
                className="relative flex gap-5 pb-10 md:block md:pb-0 md:text-center"
              >
                <span
                  className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border ${index === 0 ? "border-[#5C1D24] bg-[#5C1D24] text-white" : "border-[#DBCBB9] bg-[#FDF9F3] text-[#5C1D24]"}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="md:mt-7">
                  <p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#5C1D24]">
                    Langkah {index + 1}
                  </p>
                  <h3 className="font-public-display mt-2 text-2xl">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#635C54]">{copy}</p>
                </div>
              </article>
            ))}
          </div>
          <button
            type="button"
            onClick={openBooking}
            className="mx-auto mt-10 flex h-14 items-center justify-center gap-3 bg-[#5C1D24] px-8 font-semibold text-white"
          >
            Mulai pengajuan <ArrowRight className="h-4 w-4" />
          </button>
        </section>

        <section
          id="tata-tertib"
          className="scroll-mt-20 bg-[#5C1D24] px-5 py-20 text-[#FFF8F7] md:px-10 md:py-28 xl:px-[7vw]"
        >
          <SectionHeading
            eyebrow="Tata tertib penghuni kost"
            title="Aturan yang menjaga kualitas hidup bersama."
            copy="Ketentuan ini menjadi panduan awal. Rincian resmi dikonfirmasi kembali bersama Admin sebelum penyewaan."
            inverse
          />
          <div className="mt-12 grid gap-px overflow-hidden border border-white/15 bg-white/15 md:grid-cols-2">
            {houseRuleGroups.map((group, groupIndex) => (
              <article key={group.title} className="bg-[#5C1D24] p-6 md:p-9">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#EADECF]">
                    0{groupIndex + 1}
                  </p>
                  <span className="rounded-full border border-white/20 px-3 py-1 text-[10px]">
                    {group.items.length} poin
                  </span>
                </div>
                <h3 className="font-public-display mt-7 text-3xl capitalize">{group.title}</h3>
                <div className="mt-7 flex flex-wrap gap-2">
                  {group.items.map((rule) => (
                    <span
                      key={rule}
                      className="rounded-full border border-[#EADECF]/30 bg-[#400710]/30 px-4 py-2 text-xs text-[#FFF8F7]/85"
                    >
                      {rule}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 px-5 py-20 md:px-10 md:py-28 xl:px-[7vw]">
          <div className="grid gap-12 lg:grid-cols-[.65fr_1.35fr]">
            <SectionHeading
              eyebrow="Pertanyaan umum"
              title="Hal yang sering ditanyakan."
              copy="Belum menemukan jawaban? Hubungi Admin untuk informasi yang lebih spesifik."
            />
            <div className="divide-y divide-[#DBCBB9] border-y border-[#DBCBB9]">
              {faqItems.map(([question, answer], index) => (
                <details key={question} className="group py-1">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-6">
                    <span className="font-public-display text-xl md:text-2xl">{question}</span>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#DBCBB9] text-[#5C1D24] transition group-open:rotate-90">
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </summary>
                  <p className="max-w-2xl pb-7 pr-12 text-sm leading-7 text-[#635C54]">{answer}</p>
                  <span className="sr-only">Pertanyaan {index + 1}</span>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <PublicFooter onBooking={openBooking} />
      <PublicBookingLeadDialog
        item={item}
        initialGender={selectedGender}
        whatsAppNumber="6287796833181"
        open={bookingOpen}
        onOpenChange={setBookingOpen}
      />
    </div>
  );
}

function DesktopHeader({ onBooking }: { onBooking: () => void }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 hidden h-20 items-center border-b border-[#DBCBB9]/70 bg-[#FDF9F3]/90 px-10 backdrop-blur-xl md:flex xl:px-[7vw]">
      <a
        href="#"
        className="font-public-display text-2xl font-semibold tracking-tight text-[#5C1D24]"
      >
        KOSTATION
      </a>
      <nav className="mx-auto flex items-center gap-8">
        {navItems.map(([label, href]) => (
          <a
            key={href}
            href={href}
            className="text-sm text-[#635C54] transition hover:text-[#5C1D24]"
          >
            {label}
          </a>
        ))}
      </nav>
      <button
        type="button"
        onClick={onBooking}
        className="h-11 bg-[#5C1D24] px-5 text-sm font-semibold text-white"
      >
        Ajukan minat
      </button>
    </header>
  );
}

function MobileHeader({
  drawerOpen,
  setDrawerOpen,
  onBooking,
}: {
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  onBooking: () => void;
}) {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 flex h-[72px] items-center justify-between border-b border-white/10 bg-[#400710]/80 px-5 text-white backdrop-blur-xl md:hidden">
        <a href="#" className="font-public-display text-xl font-semibold">
          KOSTATION
        </a>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="grid h-11 w-11 place-items-center border border-white/20"
          aria-label="Buka menu"
        >
          <Menu />
        </button>
      </header>
      {drawerOpen ? (
        <div className="fixed inset-0 z-[80] bg-[#400710] p-6 text-[#FFF8F7] md:hidden">
          <div className="flex items-center justify-between">
            <span className="font-public-display text-2xl">KOSTATION</span>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="grid h-11 w-11 place-items-center border border-white/20"
              aria-label="Tutup menu"
            >
              <X />
            </button>
          </div>
          <nav className="mt-16 space-y-1">
            {navItems.map(([label, href], index) => (
              <a
                key={href}
                href={href}
                onClick={() => setDrawerOpen(false)}
                className="flex items-center justify-between border-b border-white/15 py-5 font-public-display text-3xl"
              >
                <span>{label}</span>
                <span className="font-mono text-[10px] text-white/45">0{index + 1}</span>
              </a>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(false);
              onBooking();
            }}
            className="absolute inset-x-6 bottom-8 h-14 bg-[#FFF8F7] font-semibold text-[#400710]"
          >
            Ajukan minat booking
          </button>
        </div>
      ) : null}
    </>
  );
}

function SectionHeading({
  eyebrow,
  title,
  copy,
  centered = false,
  inverse = false,
}: {
  eyebrow: string;
  title: string;
  copy?: string;
  centered?: boolean;
  inverse?: boolean;
}) {
  return (
    <div className={`${centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}`}>
      <p
        className={`font-mono text-[10px] uppercase tracking-[.22em] ${inverse ? "text-[#EADECF]" : "text-[#5C1D24]"}`}
      >
        {eyebrow}
      </p>
      <h2 className="font-public-display mt-4 text-4xl leading-[1.04] tracking-[-.025em] md:text-6xl">
        {title}
      </h2>
      {copy ? (
        <p
          className={`mt-5 max-w-2xl text-sm leading-7 md:text-base ${inverse ? "text-white/65" : "text-[#635C54]"} ${centered ? "mx-auto" : ""}`}
        >
          {copy}
        </p>
      ) : null}
    </div>
  );
}

function CategoryTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-12 rounded-full px-4 text-sm font-semibold transition ${active ? "bg-[#5C1D24] text-white shadow" : "text-[#635C54] hover:text-[#5C1D24]"}`}
    >
      {children}
    </button>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 items-center gap-3 bg-[#5C1D24] px-7 font-semibold text-white transition hover:bg-[#400710]"
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </button>
  );
}

function PublicFooter({ onBooking }: { onBooking: () => void }) {
  return (
    <footer className="bg-[#400710] px-5 pt-16 text-[#FFF8F7] md:px-10 md:pt-24 xl:px-[7vw]">
      <div className="grid gap-12 border-b border-white/15 pb-14 lg:grid-cols-[1.25fr_.55fr_.7fr]">
        <div>
          <p className="font-public-display text-3xl font-semibold">KOSTATION</p>
          <h2 className="font-public-display mt-10 text-5xl leading-none md:text-7xl">
            Level Up
            <br />
            <em>Your Living.</em>
          </h2>
          <div className="mt-10 max-w-2xl border border-white/15 bg-white/5 p-5 text-xs leading-6 text-white/55">
            Informasi pada halaman ini merupakan gambaran awal hunian. Ketersediaan, penempatan
            kamar, nilai pembayaran, dan aktivasi sewa dikonfirmasi oleh Admin melalui proses resmi
            KOSTATION.
          </div>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#EADECF]">Navigasi</p>
          <div className="mt-6 space-y-4">
            {navItems.map(([label, href]) => (
              <a key={href} className="block text-sm text-white/65 hover:text-white" href={href}>
                {label}
              </a>
            ))}
          </div>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#EADECF]">
            Kontak pengelola
          </p>
          <a className="mt-6 block font-public-display text-2xl" href="https://wa.me/6287796833181">
            0877-9683-3181
          </a>
          <p className="mt-2 text-sm text-white/55">@kostation.id</p>
          <button
            type="button"
            onClick={onBooking}
            className="mt-7 flex h-12 w-full items-center justify-center gap-2 bg-[#FFF8F7] px-5 font-semibold text-[#400710]"
          >
            <MessageCircle className="h-4 w-4" /> Hubungi Admin
          </button>
          <div className="mt-5 flex gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-white/15">
              <Instagram className="h-4 w-4" />
            </span>
            <span className="grid h-10 w-10 place-items-center rounded-full border border-white/15 font-mono text-xs">
              TT
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 py-6 font-mono text-[9px] uppercase tracking-[.14em] text-white/40 md:flex-row md:items-center md:justify-between">
        <p>© 2026 KOSTATION. All rights reserved.</p>
        <p>Jatinangor · Jawa Barat</p>
      </div>
    </footer>
  );
}
