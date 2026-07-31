import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  parseCategoryContentWorkspaceEnvelope,
  parseGalleryDataEnvelope,
  parseGalleryListEnvelope,
  parsePropertyPolicyWorkspaceEnvelope,
  parsePublicTermsContent,
} from "./admin-ux-master-api";
import {
  commercialMutationFingerprint,
  resolveCommercialMutationIntent,
  runCommercialSubmissionOnce,
} from "../hooks/useAdminUxMaster";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const source = (path: string) => readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");
const propertyId = "11111111-1111-4111-8111-111111111111";
const kostTypeId = "22222222-2222-4222-8222-222222222222";
const imageId = "33333333-3333-4333-8333-333333333333";
const sourceFileId = "44444444-4444-4444-8444-444444444444";
const derivativeId = "55555555-5555-4555-8555-555555555555";
const versionId = "66666666-6666-4666-8666-666666666666";
const actorId = "77777777-7777-4777-8777-777777777777";
const timestamp = "2026-07-31T08:00:00.000Z";

function facility() {
  return {
    id: imageId,
    label: "Wi-Fi",
    normalized_label: "wi-fi",
    public_description: "Internet kategori",
    sort_order: 0,
    content_state: "active",
    public_visible: true,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function galleryImage() {
  return {
    id: imageId,
    source_file_id: sourceFileId,
    public_derivative_file_id: derivativeId,
    source_content_url: `/api/v1/files/${sourceFileId}/content`,
    public_preview_url: `/api/v1/files/${derivativeId}/content`,
    alt_text: "Foto Rumah Kost",
    caption: null,
    sort_order: 0,
    is_cover: true,
    content_state: "draft",
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function version(contentType: "facilities" | "gallery") {
  return {
    id: versionId,
    content_type: contentType,
    version: 1,
    publication_status: "published",
    effective_date: "2026-08-01",
    restored_from_version_id: null,
    published_at: timestamp,
    published_by_user_id: actorId,
    created_at: timestamp,
  };
}

function publicTerms() {
  return {
    pricing_explanation: "Tarif mengikuti kategori.",
    minimum_lease_term: "Satu tahun.",
    dp_explanation: "DP adalah uang muka sewa.",
    security_deposit_explanation: "Deposit terpisah.",
    manual_payment_methods: ["Transfer manual"],
    house_rules: ["Jaga ketenangan"],
    visitor_hours: "21:00",
    contact_information: "Kanal resmi pengelola.",
    category_applicability: ["rukost", "apartkost"],
  };
}

test("strict category workspace parser accepts exact nested authority", () => {
  const parsed = parseCategoryContentWorkspaceEnvelope(
    {
      data: {
        property_id: propertyId,
        kost_type_id: kostTypeId,
        category: { category: "rukost", label: "Rumah Kost" },
        facilities: [facility()],
        gallery: [galleryImage()],
        publication: {
          facilities: [version("facilities")],
          gallery: [version("gallery")],
        },
      },
    },
    { propertyId, kostTypeId },
  );
  assert.equal(parsed.propertyId, propertyId);
  assert.equal(parsed.kostTypeId, kostTypeId);
  assert.equal(parsed.category.category, "rukost");
  assert.equal(parsed.facilities[0]?.normalizedLabel, "wi-fi");
  assert.equal(parsed.gallery[0]?.publicDerivativeFileId, derivativeId);
  assert.equal(parsed.publication.gallery[0]?.version, 1);
});

test("strict parsers reject extra keys, malformed nested data, and draft leakage", () => {
  const exact = {
    data: {
      property_id: propertyId,
      kost_type_id: kostTypeId,
      category: { category: "rukost", label: "Rumah Kost" },
      facilities: [facility()],
      gallery: [galleryImage()],
      publication: { facilities: [version("facilities")], gallery: [version("gallery")] },
    },
  };
  assert.throws(() =>
    parseCategoryContentWorkspaceEnvelope({
      ...exact,
      data: { ...exact.data, room_id: imageId },
    }),
  );
  assert.throws(() =>
    parseCategoryContentWorkspaceEnvelope({
      ...exact,
      data: { ...exact.data, gallery: [{ ...galleryImage(), is_cover: "true" }] },
    }),
  );
  assert.throws(() =>
    parseCategoryContentWorkspaceEnvelope({
      ...exact,
      data: {
        ...exact.data,
        publication: {
          ...exact.data.publication,
          facilities: [{ ...version("facilities"), version: 1.5 }],
        },
      },
    }),
  );
  assert.throws(() => parsePublicTermsContent({ ...publicTerms(), internal_policy: "private" }));
  assert.throws(() =>
    parseCategoryContentWorkspaceEnvelope(exact, {
      propertyId: "99999999-9999-4999-8999-999999999999",
      kostTypeId,
    }),
  );
  assert.throws(() =>
    parsePublicTermsContent({
      ...publicTerms(),
      category_applicability: ["rukost", "rukost"],
    }),
  );
});

test("gallery list and mutation parsers enforce category binding and exact envelope", () => {
  const record = {
    property_id: propertyId,
    target_type: "kost_type",
    kost_type_id: kostTypeId,
    kost_type_name: "Rumah Kost",
    ...galleryImage(),
  };
  const expected = { propertyId, kostTypeId };
  const page = parseGalleryListEnvelope(
    { data: [record], meta: { limit: 20, offset: 0, total: 1 } },
    expected,
  );
  assert.equal(page.items[0]?.propertyId, propertyId);
  assert.equal(page.items[0]?.targetType, "kost_type");
  assert.equal(
    parseGalleryDataEnvelope({ data: record }, expected).publicDerivativeFileId,
    derivativeId,
  );
  assert.throws(() =>
    parseGalleryDataEnvelope(
      { data: { ...record, property_id: "99999999-9999-4999-8999-999999999999" } },
      expected,
    ),
  );
  assert.throws(() =>
    parseGalleryListEnvelope({ data: [record], meta: { limit: 0, offset: 0, total: 1 } }),
  );
  assert.throws(() =>
    parseGalleryListEnvelope({
      data: [{ ...record, target_type: "common_area" }],
      meta: { limit: 20, offset: 0, total: 1 },
    }),
  );
  assert.throws(() =>
    parseGalleryListEnvelope({
      data: [{ ...record, storage_path: "private/path" }],
      meta: { limit: 20, offset: 0, total: 1 },
    }),
  );
});

test("policy workspace parser separates internal draft from public versions", () => {
  const parsed = parsePropertyPolicyWorkspaceEnvelope(
    {
      data: {
        property_id: propertyId,
        draft: {
          id: versionId,
          internal_operating_policy: "Catatan internal.",
          public_content: publicTerms(),
          restored_from_version_id: null,
          updated_at: timestamp,
        },
        versions: [
          {
            id: imageId,
            version: 2,
            publication_status: "published",
            effective_date: "2026-08-01",
            public_content: publicTerms(),
            restored_from_version_id: null,
            published_at: timestamp,
            published_by_user_id: actorId,
            created_at: timestamp,
          },
        ],
      },
    },
    propertyId,
  );
  assert.equal(parsed.propertyId, propertyId);
  assert.equal(parsed.draft?.internalOperatingPolicy, "Catatan internal.");
  assert.equal(parsed.versions[0]?.publicContent.visitorHours, "21:00");
  assert.equal("internalOperatingPolicy" in parsed.versions[0]!, false);
  assert.throws(() =>
    parsePropertyPolicyWorkspaceEnvelope(
      {
        data: {
          property_id: "99999999-9999-4999-8999-999999999999",
          draft: null,
          versions: [],
        },
      },
      propertyId,
    ),
  );
  const bootstrap = parsePropertyPolicyWorkspaceEnvelope(
    {
      data: {
        property_id: propertyId,
        draft: {
          id: versionId,
          internal_operating_policy: "",
          public_content: {
            pricing_explanation: "",
            minimum_lease_term: "",
            dp_explanation: "",
            security_deposit_explanation: "",
            manual_payment_methods: [],
            house_rules: [],
            visitor_hours: "21:00",
            contact_information: "",
            category_applicability: ["rukost", "apartkost"],
          },
          restored_from_version_id: null,
          updated_at: timestamp,
        },
        versions: [],
      },
    },
    propertyId,
  );
  assert.equal(bootstrap.draft?.publicContent.pricingExplanation, "");
  assert.throws(() =>
    parsePublicTermsContent({
      ...publicTerms(),
      pricing_explanation: "",
    }),
  );
});

test("content mutation intent is property and payload scoped with same-key replay", async () => {
  const firstFingerprint = commercialMutationFingerprint(propertyId, {
    category: "rukost",
    facilities: ["Wi-Fi"],
  });
  const sameFingerprint = commercialMutationFingerprint(propertyId, {
    category: "rukost",
    facilities: ["Wi-Fi"],
  });
  const changedFingerprint = commercialMutationFingerprint(propertyId, {
    category: "apartkost",
    facilities: ["Wi-Fi"],
  });
  const first = resolveCommercialMutationIntent(null, firstFingerprint, () => "key-a");
  assert.equal(
    resolveCommercialMutationIntent(first, sameFingerprint, () => "key-b").idempotencyKey,
    "key-a",
  );
  assert.equal(
    resolveCommercialMutationIntent(first, changedFingerprint, () => "key-b").idempotencyKey,
    "key-b",
  );

  let requests = 0;
  const active: { current: { fingerprint: string; promise: Promise<string> } | null } = {
    current: null,
  };
  let release!: (value: string) => void;
  const pending = runCommercialSubmissionOnce(active, firstFingerprint, () => {
    requests += 1;
    return new Promise<string>((resolve) => {
      release = resolve;
    });
  });
  const duplicate = runCommercialSubmissionOnce(active, firstFingerprint, async () => {
    requests += 1;
    return "duplicate";
  });
  assert.equal(pending, duplicate);
  assert.equal(requests, 1);
  await assert.rejects(
    () => runCommercialSubmissionOnce(active, changedFingerprint, async () => "changed"),
    /COMMERCIAL_SUBMISSION_IN_PROGRESS/,
  );
  release("ok");
  await pending;
});

test("Admin routes render exactly two category workspaces without obsolete assignment taxonomy", () => {
  const facilities = source("apps/admin/src/routes/rooms/fasilitas.tsx");
  const gallery = source("apps/admin/src/routes/rooms/galeri.tsx");
  const policy = source("apps/admin/src/routes/syarat-ketentuan.tsx");
  const api = source("apps/admin/src/lib/admin-ux-master-api.ts");
  const hooks = source("apps/admin/src/hooks/useAdminUxMaster.ts");
  const upload = source("apps/admin/src/hooks/useFileUpload.ts");

  assert.match(facilities, /Rumah Kost/);
  assert.match(facilities, /Apart Kost/);
  assert.match(facilities, /useCategoryContent/);
  assert.match(facilities, /Simpan draft/);
  assert.match(facilities, /Publikasikan/);
  assert.doesNotMatch(facilities, /AssignmentPanel|per kamar|Tambah Room|Add Room/);

  assert.match(gallery, /Rumah Kost/);
  assert.match(gallery, /Apart Kost/);
  assert.match(gallery, /createPublicGalleryDerivative/);
  assert.match(gallery, /publicDerivativeFileId/);
  assert.match(gallery, /progress|Memproses/);
  assert.doesNotMatch(gallery, /common-area|COMMON_AREAS|Lobby|Dapur|publicVisible/);

  assert.match(policy, /Kebijakan operasional internal/);
  assert.match(policy, /Konten aman untuk publik/);
  assert.match(policy, /Preview draft publik/);
  assert.match(policy, /21:00/);
  const preview = policy.slice(
    policy.indexOf("function PublicPreview"),
    policy.indexOf("function fromAuthority"),
  );
  assert.doesNotMatch(preview, /internalOperatingPolicy/);

  assert.match(api, /parseCategoryContentWorkspaceEnvelope/);
  assert.match(api, /parsePropertyPolicyWorkspaceEnvelope/);
  assert.match(api, /target_type: "kost_type"/);
  assert.doesNotMatch(api, /common_area_key/);
  assert.match(hooks, /queryKey\[2\] === propertyId/);
  assert.match(hooks, /PROPERTY_SCOPE_CHANGED/);
  assert.match(upload, /PUBLIC_GALLERY_MAX_DIMENSION = 1920/);
  assert.match(upload, /canvas\.toBlob/);
});

test("mutation proof rejects third category, per-room assignment, unsafe preview, and stale cache", () => {
  const facilities = source("apps/admin/src/routes/rooms/fasilitas.tsx");
  const gallery = source("apps/admin/src/routes/rooms/galeri.tsx");
  const policy = source("apps/admin/src/routes/syarat-ketentuan.tsx");
  const hooks = source("apps/admin/src/hooks/useAdminUxMaster.ts");

  const assertTwoCategories = (value: string) => {
    assert.match(value, /types\.length !== 2/);
    assert.doesNotMatch(value, /common-area|common_area|lobby|dapur/i);
  };
  assertTwoCategories(gallery);
  assert.throws(() => assertTwoCategories(gallery.replace("types.length !== 2", "false")));

  const assertNoAssignment = (value: string) => {
    assert.doesNotMatch(value, /replaceFacilities\(values\.id|facilityIds|AssignmentPanel/);
  };
  assertNoAssignment(facilities);
  assert.throws(() => assertNoAssignment(`${facilities}\nconst AssignmentPanel = facilityIds;`));

  const assertNoInternalPreview = (value: string) => {
    const preview = value.slice(
      value.indexOf("function PublicPreview"),
      value.indexOf("function fromAuthority"),
    );
    assert.doesNotMatch(preview, /internalOperatingPolicy/);
  };
  assertNoInternalPreview(policy);
  assert.throws(() =>
    assertNoInternalPreview(
      policy.replace(
        "function PublicPreview({ content }: { content: PublicTermsContent }) {",
        "function PublicPreview({ content, internalOperatingPolicy }: { content: PublicTermsContent; internalOperatingPolicy: string }) {",
      ),
    ),
  );

  const assertStaleGuard = (value: string) => {
    const contentMutation = value.slice(
      value.indexOf("function useContentPublicationMutation"),
      value.indexOf("export function useM4Mutation"),
    );
    assert.match(contentMutation, /propertyRef\.current !== propertyId/);
    assert.match(contentMutation, /successfulPropertyRef/);
  };
  assertStaleGuard(hooks);
  assert.throws(() =>
    assertStaleGuard(hooks.replaceAll("propertyRef.current !== propertyId", "false")),
  );
});
