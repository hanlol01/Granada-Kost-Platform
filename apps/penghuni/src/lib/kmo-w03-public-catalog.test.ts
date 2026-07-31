import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  parsePublicHunianCatalogDetail,
  parsePublicHunianCatalogList,
  type PublicHunianCatalogDetail,
  type PublicHunianCatalogItem,
} from "../hooks/usePublicHunianCatalog";

const root = existsSync(resolve(process.cwd(), "src"))
  ? process.cwd()
  : resolve(process.cwd(), "apps/penghuni");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
const galleryImage = {
  contentUrl: "/api/v1/public/hunian-gallery/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/content",
  thumbnailUrl: null,
  altText: "Kamar contoh",
  caption: null,
  sortOrder: 0,
  isCover: true,
};

const validCatalogItem: PublicHunianCatalogItem = {
  slug: "rukost",
  title: "Rumah Kost",
  category: "rukost",
  categoryLabel: "Rumah Kost",
  shortDescription: "Hunian terkelola.",
  priceFromMonthly: 1500000,
  priceFromYearly: 15000000,
  availabilityCount: 2,
  facilitiesPreview: ["Wi-Fi"],
  galleryPreview: [galleryImage],
  ctaLabel: "Ajukan Minat Booking",
  bookingLeadDefaults: { category: "rukost" },
  disclaimers: ["Pengajuan minat belum menjadi reservasi."],
  leaseMinimumMonths: 12,
  paymentSchedules: ["annual", "two_month_installments"],
  dpMinimumPercent: 25,
  securityDepositMonths: 1,
  genderAvailability: [{ gender: "female", genderLabel: "Putri", availabilityCount: 2 }],
};

const validCatalogDetail: PublicHunianCatalogDetail = {
  ...validCatalogItem,
  longDescription: "Hunian terkelola untuk penghuni.",
  facilities: ["Wi-Fi"],
  pricingExplanation: "Tarif mengikuti kategori.",
  minimumLeaseTerm: "12 bulan",
  dpExplanation: "DP minimal 25%.",
  securityDepositExplanation: "Deposit satu bulan.",
  manualPaymentMethods: ["Transfer manual"],
  houseRules: ["Jaga ketenangan"],
  visitorHours: "21:00",
  contactInformation: "Hubungi Admin.",
  gallery: [galleryImage],
};

test("public catalog URL state is limited to category and gender filters", () => {
  const route = code("src/routes/kamar.tsx");
  assert.match(route, /category/);
  assert.match(route, /gender/);
  assert.match(route, /plannedStart|paymentSchedule/);
  assert.match(route, /replace: true/);
  assert.match(route, /normalizePublicPlannedStart/);
  assert.doesNotMatch(route, /roomId|buildingCode|floorCode|propertyId/);
});

test("public lead payload requires contact consent and has no room authority", () => {
  const hook = code("src/hooks/usePublicBookingLead.ts");
  const dialog = code("src/components/booking-lead/PublicBookingLeadDialog.tsx");
  assert.match(hook, /visitorEmail/);
  assert.match(hook, /consent/);
  assert.match(hook, /idempotencyKey/);
  assert.match(hook, /const \{ idempotencyKey, \.\.\.body \} = input/);
  assert.ok(dialog.includes("Universitas / pendidikan *"));
  assert.ok(dialog.includes("crypto.randomUUID"));
  assert.doesNotMatch(hook, /roomId|propertyId/);
  assert.match(dialog, /Saya setuju dihubungi Admin/);
  assert.match(dialog, /disabled=\{mutation\.isPending \|\| !consent\}/);
});

test("public category detail remains a safe category route", () => {
  const hook = code("src/hooks/usePublicHunianCatalog.ts");
  const detail = code("src/routes/kamar.$slug.tsx");
  assert.match(hook, /encodeURIComponent\(slug\)/);
  assert.doesNotMatch(hook, /roomId|room_code/);
  assert.match(detail, /Ajukan Minat Booking/);
  assert.match(detail, /belum menjadi booking/);
});

test("public projection is category-aggregated and parser rejects unsafe shape", () => {
  const hook = code("src/hooks/usePublicHunianCatalog.ts");
  const route = code("src/routes/kamar.tsx");
  assert.match(hook, /genderAvailability/);
  assert.match(hook, /\.max\(2\)/);
  assert.match(hook, /Duplicate category authority/);
  assert.match(hook, /Availability mismatch/);
  assert.doesNotMatch(route, /HERO_HIGHLIGHTS|Fully furnished|AC per kamar/);
});

test("public catalog parsers enforce context, commercial, schedule, and gallery authority", () => {
  assert.deepEqual(parsePublicHunianCatalogList([validCatalogItem], "rukost"), [validCatalogItem]);
  assert.throws(() =>
    parsePublicHunianCatalogList(
      [
        {
          ...validCatalogItem,
          category: "apartkost",
          bookingLeadDefaults: { category: "apartkost" },
        },
      ],
      "rukost",
    ),
  );
  assert.throws(() =>
    parsePublicHunianCatalogList([validCatalogItem, { ...validCatalogItem, slug: "rukost-copy" }]),
  );
  assert.throws(() =>
    parsePublicHunianCatalogList([{ ...validCatalogItem, dpMinimumPercent: 20 }]),
  );
  assert.throws(() =>
    parsePublicHunianCatalogList([{ ...validCatalogItem, paymentSchedules: ["annual"] }]),
  );
  assert.throws(() =>
    parsePublicHunianCatalogList([
      { ...validCatalogItem, galleryPreview: [{ ...galleryImage, isCover: false }] },
    ]),
  );
  assert.throws(() =>
    parsePublicHunianCatalogList([
      { ...validCatalogItem, galleryPreview: [{ ...galleryImage, id: "opaque" }] as never },
    ]),
  );
  assert.throws(() =>
    parsePublicHunianCatalogList([
      {
        ...validCatalogItem,
        galleryPreview: [
          {
            ...galleryImage,
            contentUrl: "/api/v1/public/hunian-gallery/not-a-uuid/content",
          },
        ],
      },
    ]),
  );
  assert.throws(() => parsePublicHunianCatalogDetail(validCatalogDetail, "apartkost"));
  assert.deepEqual(
    parsePublicHunianCatalogDetail(validCatalogDetail, "rukost"),
    validCatalogDetail,
  );
});
