import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { ApiError } from "@granada-kost/api-client";
import { adminErrorNotice } from "./error-normalizer";
import { parseResidentDetail, parseResidentPage, parseResidentTenancy } from "./admin-resident";
import { parseAvailableRooms } from "./admin-ux-lease-api";
import {
  calculateLeaseEndDate,
  formatIdrInput,
  normalizeDigits,
  validateNewLeaseDraft,
} from "./lease-onboarding-form";
import {
  onboardingErrorFieldErrors,
  onboardingErrorNotice,
  resolveOnboardingErrorNotice,
} from "./onboarding-error-notice";

const propertyId = "11111111-1111-4111-8111-111111111111";
const residentId = "22222222-2222-4222-8222-222222222222";
const timestamp = "2026-08-02T00:00:00.000Z";

function residentListItem(status: string) {
  return {
    id: residentId,
    property_id: propertyId,
    full_name: "Calon Penghuni",
    university: null,
    room_number: null,
    lease_start: null,
    lease_end: null,
    lease_authority_count: 1,
    account_status: "not_provisioned",
    rent_payment_status: "none",
    contract_settlement_stage: "none",
    contract_settlement_due_date: null,
    contract_settlement_remaining_amount: 0,
    contract_settlement_checkpoint_required_amount: 0,
    resident_status: status,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function residentDetail(status: string, dateOfBirth: string | null = null) {
  return {
    id: residentId,
    property_id: propertyId,
    user_id: null,
    full_name: "Calon Penghuni",
    phone: null,
    email: null,
    gender: null,
    account_status: "not_provisioned",
    resident_status: status,
    active_lease: null,
    created_at: timestamp,
    updated_at: timestamp,
    ktp_number: null,
    date_of_birth: dateOfBirth,
    place_of_birth: null,
    address: null,
    university: null,
    faculty: null,
    major: null,
    cohort: null,
    instagram: null,
    parent_name: null,
    parent_phone: null,
    marital_status: null,
    emergency_phone: null,
    emergency_contacts: [],
    ktp_document: null,
    profile_photo_file_id: null,
  };
}

function tenancy() {
  return {
    resident_id: residentId,
    property_id: propertyId,
    lease_id: "33333333-3333-4333-8333-333333333333",
    booking_lead_id: "44444444-4444-4444-8444-444444444444",
    lease_status: "awaiting_activation",
    room_number: "AK-18F-3A",
    kost_type_name: "Apart Kost",
    building_code: "AK-18F",
    start_date: "2026-07-31",
    end_date: "2026-10-31",
    term_months: 3,
    payment_plan_type: "annual_full",
  };
}

test("resident hub is the only primary lease navigation authority", async () => {
  const registry = await readFile(new URL("./admin-route-registry.ts", import.meta.url), "utf8");
  const tenants = await readFile(new URL("../routes/tenants.tsx", import.meta.url), "utf8");
  const leaseCreate = await readFile(
    new URL("../components/leases/LeaseCreatePage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    registry,
    /id: "tenants"[\s\S]*?label: "Penghuni"[\s\S]*?navigation: \{ sidebar: true/,
  );
  assert.match(
    registry,
    /id: "leases"[\s\S]*?redirectOnly: true[\s\S]*?navigation: \{ sidebar: false \}/,
  );
  assert.doesNotMatch(tenants, /Tambah Penghuni/);
  assert.match(tenants, /title="Data Penghuni & Penyewaan"/);
  assert.match(tenants, /flow === "new-lease"/);
  assert.match(tenants, /await residents\.refetch\(\)/);
  assert.match(tenants, /await navigate\(\{ search: \{\}, replace: true \}\)/);
  assert.match(tenants, /Tambah Penyewaan/);
  assert.match(leaseCreate, /Tambah Penyewaan dari Minat Booking/);
  assert.match(
    registry,
    /id: "booking-leads"[\s\S]*?section: "pengelolaan"[\s\S]*?order: 45[\s\S]*?navigation: \{ sidebar: true/,
  );
});

test("legacy lease list and create routes redirect into the resident hub", async () => {
  const listRoute = await readFile(
    new URL("../routes/penyewaan/index.tsx", import.meta.url),
    "utf8",
  );
  const createRoute = await readFile(
    new URL("../routes/penyewaan/tambah.tsx", import.meta.url),
    "utf8",
  );

  assert.match(listRoute, /beforeLoad: \(\) => \{[\s\S]*?to: "\/tenants"[\s\S]*?replace: true/);
  assert.match(
    createRoute,
    /beforeLoad: \(\) => \{[\s\S]*?to: "\/tenants"[\s\S]*?flow: "new-lease"[\s\S]*?replace: true/,
  );
});

test("resident detail is a full page with canonical tenancy rather than a dialog", async () => {
  const tenants = await readFile(new URL("../routes/tenants.tsx", import.meta.url), "utf8");
  const detailRoute = await readFile(
    new URL("../routes/tenants/$residentId.tsx", import.meta.url),
    "utf8",
  );
  const workspace = await readFile(
    new URL("../components/residents/ResidentDetailWorkspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(tenants, /to="\/tenants\/\$residentId"/);
  assert.match(tenants, /match\.routeId === "\/tenants\/\$residentId"/);
  assert.match(tenants, /<Outlet \/>/);
  assert.doesNotMatch(tenants, /ResidentDetailDialog/);
  assert.match(detailRoute, /createFileRoute\("\/tenants\/\$residentId"\)/);
  assert.match(workspace, /aria-label="Breadcrumb"/);
  assert.match(workspace, /Penyewaan dan kamar/);
  assert.match(workspace, /Ringkasan Penyewaan dan Pembayaran/);
  assert.match(workspace, /Aktivasi kamar/);
  assert.match(workspace, /Kendaraan & parkir/);
});

test("lease entry remains a full-page two-stage lifecycle flow", async () => {
  const source = await readFile(
    new URL("../components/leases/LeaseCreatePage.tsx", import.meta.url),
    "utf8",
  );
  const imageUpload = await readFile(
    new URL("../components/ui/image-upload-field.tsx", import.meta.url),
    "utf8",
  );
  const onboarding = await readFile(new URL("./admin-onboarding.ts", import.meta.url), "utf8");

  assert.match(source, /\["Penghuni & Penyewaan", "Pilih Kamar Kost"\]\.map/);
  assert.match(source, /LeaseCreatePage/);
  assert.match(source, /<AppShell/);
  assert.match(source, /useResidentOnboarding/);
  assert.match(source, /<ImageUploadField/);
  assert.match(source, /label="Foto KTP \(opsional\)"/);
  assert.match(source, /prepareFile=\{compressResidentKtpImage\}/);
  assert.match(source, /maxBytes=\{KTP_IMAGE_MAX_BYTES\}/);
  assert.match(imageUpload, /capture=\{capture\}/);
  assert.match(imageUpload, /URL\.revokeObjectURL/);
  assert.match(imageUpload, /event\.dataTransfer\.files/);
  assert.match(imageUpload, /Klik untuk memilih foto/);
  assert.match(source, /useFileUpload/);
  assert.match(source, /filePurpose: "ktp"/);
  assert.match(source, /ktp_file_id: resident\.ktpFileId/);
  assert.match(source, /<Label htmlFor="deposit">Security deposit<\/Label>/);
  assert.match(source, /<RupiahInput\s+id="deposit"/);
  assert.match(source, /Tarif bulanan/);
  assert.match(source, /Metode pembayaran \*/);
  assert.match(source, /aria-pressed=\{paymentMethodSelected && paymentMethod === "cash"\}/);
  assert.match(
    source,
    /aria-pressed=\{paymentMethodSelected && paymentMethod === "bank_transfer"\}/,
  );
  assert.match(source, /Catatan pembayaran \(opsional\)/);
  assert.match(source, /filePurpose="payment_proof"/);
  assert.match(source, /<FilePreview file=\{paymentEvidence\}/);
  assert.match(source, /payment_method: paymentMethod/);
  assert.match(source, /payment_evidence_file_ids: paymentEvidence/);
  assert.match(source, /payment_note: paymentNote\.trim\(\) \|\| undefined/);
  assert.match(source, /Menunggu konfirmasi/);
  assert.match(source, /Security deposit[\s\S]*?Opsional, bebas diisi, dan terpisah dari DP/);
  assert.match(source, /Booking fee \(opsional\)/);
  assert.match(source, /Booking fee menjadi[\s\S]*?kredit sewa/);
  assert.match(source, /const MINIMUM_BOOKING_FEE = 1_000_000/);
  assert.match(source, /bookingFee > 0 && bookingFee < MINIMUM_BOOKING_FEE/);
  assert.match(source, /Booking fee bila diisi minimal/);
  assert.match(source, /onPaymentChoiceChange/);
  assert.match(source, /Rekomendasi DP 25%/);
  assert.match(source, /paymentChoiceSelected/);
  assert.match(source, /paymentMethodSelected/);
  assert.match(source, /paymentChoice === "full" \? amounts\.contractRent : 0/);
  assert.match(source, /Jumlah pelunasan sewa/);
  assert.match(source, /Ringkasan Pembayaran/);
  assert.match(source, /Sisa pembayaran sewa/);
  assert.match(source, /bookingFee \+ paidRent \+ securityDeposit/);
  assert.match(source, /booking_fee_paid_amount: bookingFee \|\| undefined/);
  assert.match(onboarding, /awaiting_activation/);
  assert.doesNotMatch(source, /useM6LeaseMutation/);
  assert.doesNotMatch(source, /adminUxLeaseApi\.leases\.create/);
  assert.doesNotMatch(source, /createOccupancy|useLeaseActivation|activateLease/);
});

test("pending activation is a valid resident projection while unknown states fail closed", () => {
  const page = parseResidentPage(
    { data: [residentListItem("pending_activation")], meta: { limit: 20, offset: 0, total: 1 } },
    propertyId,
  );
  assert.equal(page.data[0]?.residentStatus, "pending_activation");

  const detail = parseResidentDetail(
    { data: residentDetail("pending_activation", "2004-08-02") },
    propertyId,
  );
  assert.equal(detail.residentStatus, "pending_activation");
  assert.equal(detail.dateOfBirth, "2004-08-02");

  assert.throws(() =>
    parseResidentPage(
      { data: [residentListItem("unexpected_status")], meta: { limit: 20, offset: 0, total: 1 } },
      propertyId,
    ),
  );
  assert.throws(() =>
    parseResidentDetail({ data: residentDetail("unexpected_status") }, propertyId),
  );
  assert.throws(() =>
    parseResidentDetail({ data: residentDetail("pending_activation", `${timestamp}`) }, propertyId),
  );
});

test("tenancy projection exposes an awaiting activation lease without claiming occupancy", () => {
  const parsed = parseResidentTenancy({ data: tenancy() }, propertyId, residentId);
  assert.equal(parsed?.leaseStatus, "awaiting_activation");
  assert.equal(parsed?.bookingLeadId, "44444444-4444-4444-8444-444444444444");
  assert.equal(parsed?.roomNumber, "AK-18F-3A");
  assert.equal(parsed?.termMonths, 3);

  assert.throws(() =>
    parseResidentTenancy(
      { data: { ...tenancy(), property_id: "55555555-5555-4555-8555-555555555555" } },
      propertyId,
      residentId,
    ),
  );
  assert.throws(() =>
    parseResidentTenancy(
      { data: { ...tenancy(), lease_status: "occupied" } },
      propertyId,
      residentId,
    ),
  );
});

test("vacant room parser accepts the live snake-case envelope and binds property scope", () => {
  const room = {
    id: "33333333-3333-4333-8333-333333333333",
    property_id: propertyId,
    number: "AK-01-01",
    status: "vacant",
    gender_policy: "female",
    building_name: "Apart Kost Unit 01",
    building_code: "AK-01",
    unit_code: "01",
    floor_label: "Lantai 1",
    floor: "1",
    kost_type: {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Apart Kost",
      category: "apartkost",
      monthly_price: 1_800_000,
      yearly_price: 21_600_000,
      deposit_amount: 1_800_000,
    },
  };
  const envelope = { data: [room], meta: { limit: 100, offset: 0, total: 1 } };

  const page = parseAvailableRooms(envelope, propertyId);
  assert.equal(page.items[0]?.buildingName, "Apart Kost Unit 01");
  assert.equal(page.items[0]?.genderPolicy, "female");
  assert.equal(page.items[0]?.kostType.monthlyPrice, 1_800_000);

  assert.throws(() =>
    parseAvailableRooms(
      {
        ...envelope,
        data: [{ ...room, property_id: "55555555-5555-4555-8555-555555555555" }],
      },
      propertyId,
    ),
  );
  assert.throws(() =>
    parseAvailableRooms(
      { ...envelope, meta: { limit: 0, offset: 0, total: Number.NaN } },
      propertyId,
    ),
  );
});

test("new lease form permits historical dates, requires only operational identity fields, and starts at three months", () => {
  assert.equal(calculateLeaseEndDate("2024-09-03", 3), "2024-12-03");
  assert.equal(calculateLeaseEndDate("2024-09-03", 2), "");

  const errors = validateNewLeaseDraft({
    fullName: "Calon Penghuni",
    phone: "081234567890",
    email: "calon@example.test",
    gender: "female",
    startDate: "2024-09-03",
    termMonths: 3,
  });
  assert.deepEqual(errors, {});

  assert.deepEqual(
    validateNewLeaseDraft({
      fullName: "",
      phone: "0812abc",
      email: "bukan-email",
      gender: "",
      startDate: "",
      termMonths: 2,
    }),
    {
      fullName: "Nama lengkap wajib diisi.",
      phone: "Nomor Telepon / WhatsApp hanya boleh berisi angka.",
      email: "Email untuk akses Penghuni tidak valid.",
      gender: "Jenis kelamin wajib dipilih.",
      startDate: "Tanggal mulai sewa wajib diisi.",
      termMonths: "Durasi sewa minimal 3 bulan.",
    },
  );

  assert.equal(
    validateNewLeaseDraft({
      fullName: "Calon Penghuni",
      phone: "",
      email: "calon@example.test",
      gender: "male",
      startDate: "2024-09-03",
      termMonths: 3,
    }).phone,
    "Nomor Telepon / WhatsApp wajib diisi.",
  );

  assert.equal(
    validateNewLeaseDraft({
      fullName: "Calon Penghuni",
      phone: "1234567890",
      email: "calon@example.test",
      gender: "male",
      startDate: "2024-09-03",
      termMonths: 3,
    }).phone,
    "Nomor Telepon / WhatsApp harus berupa nomor Indonesia yang valid (contoh: 081234567890).",
  );

  const optionalErrors = validateNewLeaseDraft({
    fullName: "Calon Penghuni",
    phone: "081234567890",
    email: "calon@example.test",
    gender: "female",
    startDate: "2024-09-03",
    termMonths: 3,
    ktpNumber: "123",
    dateOfBirth: "2026-02-30",
    parentPhone: "1".repeat(21),
    emergencyPhone: "0812abc",
    university: "U".repeat(161),
  });
  assert.equal(optionalErrors.ktpNumber, "NIK harus terdiri dari tepat 16 digit.");
  assert.equal(optionalErrors.dateOfBirth, "Tanggal lahir tidak valid.");
  assert.equal(optionalErrors.parentPhone, "Telepon / WhatsApp orang tua maksimal 20 digit.");
  assert.equal(optionalErrors.emergencyPhone, "Kontak darurat hanya boleh berisi angka.");
  assert.equal(optionalErrors.university, "Universitas maksimal 160 karakter.");
});

test("onboarding errors resolve to safe, actionable notices and the correct form stage", () => {
  assert.deepEqual(
    resolveOnboardingErrorNotice({
      code: "RESIDENT_PHONE_INVALID",
      kind: "validation",
      message: "raw backend message must not be shown",
    }),
    {
      title: "Nomor telepon belum valid",
      description: "Gunakan nomor Indonesia yang valid, misalnya 081234567890.",
      step: 1,
    },
  );

  assert.deepEqual(
    resolveOnboardingErrorNotice({
      code: "RESIDENT_KTP_DOCUMENT_INVALID",
      kind: "validation",
      message: "raw provider detail must not be shown",
    }),
    {
      title: "Foto KTP tidak dapat digunakan",
      description: "Unggah ulang foto KTP pada properti yang sedang aktif, lalu coba kembali.",
      step: 1,
    },
  );
  assert.deepEqual(
    resolveOnboardingErrorNotice({
      code: "VALIDATION_ERROR",
      kind: "validation",
      message: "raw validation detail must not be shown",
    }),
    {
      title: "Data onboarding belum valid",
      description: "Periksa isian yang ditandai pada tahap Penghuni & Penyewaan.",
      step: 1,
    },
  );

  assert.deepEqual(
    onboardingErrorNotice(
      new ApiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: {
          visitor_phone: ["raw validator text must not be shown"],
          ktp_file_id: ["raw file identifier must not be shown"],
        },
      }),
    ),
    {
      title: "Data onboarding belum valid",
      description: "Periksa Nomor Telepon / WhatsApp dan Foto KTP pada tahap Penghuni & Penyewaan.",
      step: 1,
    },
  );

  const duplicateIdentity = new ApiError({
    status: 409,
    code: "RESIDENT_IDENTITY_DUPLICATE",
    message: "raw duplicate detail must not be shown",
    details: { visitor_email: ["already_used"], visitor_phone: ["already_used"] },
  });
  assert.deepEqual(onboardingErrorFieldErrors(duplicateIdentity), {
    email: "Data ini sudah digunakan oleh penghuni lain pada properti ini.",
    phone: "Data ini sudah digunakan oleh penghuni lain pada properti ini.",
  });
  assert.deepEqual(
    onboardingErrorFieldErrors(
      new ApiError({
        status: 400,
        code: "RESIDENT_PHONE_INVALID",
        message: "raw phone validation must not be shown",
      }),
    ),
    { phone: "Gunakan nomor Indonesia yang valid, misalnya 081234567890." },
  );
  assert.deepEqual(onboardingErrorNotice(duplicateIdentity), {
    title: "Data penghuni sudah terdaftar",
    description:
      "Email untuk akses Penghuni dan Nomor Telepon / WhatsApp sudah digunakan oleh penghuni lain pada properti ini. Gunakan data yang berbeda.",
    step: 1,
  });
});

test("operational error notices never expose API copy or correlation identifiers", () => {
  const activation = adminErrorNotice(
    new ApiError({
      status: 409,
      code: "LEASE_ACTIVATION_FIRST_INSTALLMENT_NOT_DUE",
      message: "First installment must be due no later than activation",
      correlationId: "88e61637-b0bb-46e0-8434-6d4c6d672c0f",
    }),
  );
  assert.deepEqual(activation, {
    title: "Aktivasi kamar belum dapat dilakukan",
    description:
      "Tanggal tagihan pertama masih setelah tanggal aktivasi. Periksa kembali tanggal mulai sewa dan jadwal tagihan sebelum mengaktifkan kamar.",
    code: "LEASE_ACTIVATION_FIRST_INSTALLMENT_NOT_DUE",
    kind: "conflict",
  });

  const activationTooEarly = adminErrorNotice(
    new ApiError({
      status: 409,
      code: "LEASE_ACTIVATION_NOT_YET_AVAILABLE",
      message: "Lease cannot be activated before its Jakarta start date",
    }),
  );
  assert.deepEqual(activationTooEarly, {
    title: "Aktivasi kamar belum tersedia",
    description:
      "Kamar hanya dapat diaktifkan pada atau setelah tanggal mulai sewa. Tunggu sampai jadwal check-in tiba.",
    code: "LEASE_ACTIVATION_NOT_YET_AVAILABLE",
    kind: "conflict",
  });

  const alreadyCompleted = adminErrorNotice(
    new ApiError({
      status: 409,
      code: "BOOKING_LEAD_PAYMENT_COMMITMENT_EXISTS",
      message: "Lead rental data has already been completed",
      correlationId: "ddb93c29-e3d9-4eaf-a5c3-274b8f1fdd38",
    }),
  );
  assert.deepEqual(alreadyCompleted, {
    title: "Minat booking sudah diselesaikan",
    description:
      "Komitmen pembayaran calon penghuni ini sudah tercatat. Buka data Minat Booking lalu pilih Lengkapi Data Penyewaan.",
    code: "BOOKING_LEAD_PAYMENT_COMMITMENT_EXISTS",
    kind: "conflict",
  });

  assert.deepEqual(
    adminErrorNotice(
      new ApiError({
        status: 401,
        code: "UNAUTHENTICATED",
        message: "Authentication token is required",
      }),
    ),
    {
      title: "Sesi masuk telah berakhir",
      description: "Silakan masuk kembali untuk melanjutkan pekerjaan Anda.",
      code: "UNAUTHENTICATED",
      kind: "unauthenticated",
    },
  );
});

test("rupiah amount input strips non-digits and never retains leading-zero text", () => {
  assert.equal(normalizeDigits("Rp 00500.000abc"), 500000);
  assert.equal(formatIdrInput(500000), "500.000");
  assert.equal(formatIdrInput(0), "0");
});
