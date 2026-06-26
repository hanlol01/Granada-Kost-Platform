# VEHICLE DOMAIN — GAP ANALYSIS

> **Versi**: 1.0  
> **Tanggal**: 17 Juni 2026  
> **Milestone**: 8A — Vehicle Management Domain Planning  
> **Sumber Analisis**:  
> - [VEHICLE_DOMAIN.md](file:///d:/PROJECT%20CODING/Granada%20Kost%20Platform/docs/VEHICLE_DOMAIN.md)  
> - [MASTER_DATA_KOSTATION.docx](file:///d:/PROJECT%20CODING/Granada%20Kost%20Platform/docs/master-data/MASTER_DATA_KOSTATION.docx)  
> - [MASTER_DATA_MAPPING.md](file:///d:/PROJECT%20CODING/Granada%20Kost%20Platform/docs/MASTER_DATA_MAPPING.md)

---

## Rekomendasi Akhir

### ✅ Minor Patch — Tidak Perlu Major Revision

VEHICLE_DOMAIN.md **tidak perlu revisi besar**. Master data tidak memiliki aturan kendaraan eksplisit, sehingga tidak ada kontradiksi. Namun ada **5 gap yang perlu dicatat di backlog** sebagai input untuk implementasi.

---

## 1. Aturan SOP Kendaraan dari Master Data

### 1.1 Dokumen yang Dianalisis

| Dokumen | Tipe | Konten Kendaraan |
|---|---|---|
| `MASTER_DATA_KOSTATION.docx` | Template perjanjian sewa menyewa kamar kost | ❌ **Tidak ada pasal kendaraan/parkir** |
| `DATA_KAMAR_GRANADA.xlsx` | Data kamar 163 unit | ❌ **Tidak ada kolom kendaraan** |
| `MASTER_DATA_MAPPING.md` | Analisis mapping kedua sumber di atas | ❌ **Tidak ada data kendaraan ditemukan** |

### 1.2 Temuan Kritis

> [!IMPORTANT]
> **Master data Granada Kost saat ini tidak memiliki SOP kendaraan atau parkir sama sekali.** Perjanjian sewa (DOCX) hanya mengatur: kamar, pembayaran, kebersihan, larangan umum, dan force majeure. Tidak ada klausul tentang kendaraan, parkir, stiker parkir, atau registrasi kendaraan.

### 1.3 Aturan yang Secara Implisit Terkait Kendaraan

Meskipun tidak ada aturan eksplisit, beberapa pasal di `MASTER_DATA_KOSTATION.docx` memiliki **implikasi tidak langsung** terhadap kendaraan:

| # | Pasal DOCX | Teks Asli | Relevansi Kendaraan |
|---|---|---|---|
| IMP-01 | Pasal 5.3 | *"Mohon untuk tidak menaruh barang-barang pribadi di koridor atau halaman yang dapat menganggu penghuni kamar lainnya."* | Implisit mencakup kendaraan yang diparkir di koridor/halaman secara sembarangan |
| IMP-02 | Pasal 6.1.b | *"Melakukan tindakan yang dapat menimbulkan kerusakan atau keributan atau gangguan pada Kamar Kos sebelah dan tetangga sekitar."* | Implisit mencakup kebisingan kendaraan (panaskan mesin, klakson) |
| IMP-03 | Pasal 6.1.c | *"Menyimpan...bensin, minyak tanah dan bahan bakar berbahaya lainnya di dalam Kamar Kos."* | Relevan: penghuni tidak boleh simpan bensin cadangan di kamar |
| IMP-04 | Pasal 6.1.f | *"Menerima dan membawa tamu melebihi jam malam di 21:00 WIB."* | Implisit: kendaraan tamu setelah jam 21:00 adalah anomali |

### 1.4 Data CCTV yang Relevan

Dari [DOMAIN_MODEL.md](file:///d:/PROJECT%20CODING/Granada%20Kost%20Platform/docs/DOMAIN_MODEL.md), lokasi kamera CCTV yang sudah dimodelkan:

| Lokasi CCTV | Relevansi Kendaraan |
|---|---|
| **Parkiran** | ✅ Langsung relevan — monitoring area parkir |
| **Gerbang Masuk** | ✅ Langsung relevan — identifikasi kendaraan masuk/keluar |
| Lobby | ❌ Tidak relevan |
| Koridor Lantai 1 | ❌ Tidak relevan |
| Area Umum | ⚠️ Mungkin relevan jika ada area parkir |

---

## 2. Aturan yang Belum Tercakup di VEHICLE_DOMAIN.md

### 2.1 Gap dari Dokumen Master Data

| # | Gap | Sumber | Impact | Severity |
|---|---|---|---|---|
| GAP-01 | **Tidak ada klausul kendaraan di kontrak sewa** | DOCX | Penghuni tidak terikat perjanjian terkait kendaraan | 🟡 Medium |
| GAP-02 | **Tidak ada data kendaraan di onboarding form** | DOCX template fields | Vehicle registration tidak terintegrasi ke onboarding SOP | 🟡 Medium |
| GAP-03 | **Tidak ada peraturan parkir di `kost_rules`** | MASTER_DATA_MAPPING.md §14.2 (14 rules, 0 parkir) | Penghuni tidak punya pedoman parkir formal | 🟡 Medium |
| GAP-04 | **Tidak ada data kapasitas parkir** | Excel + DOCX | Tidak bisa seed parking capacity di property_settings | 🟢 Low |
| GAP-05 | **Bahan bakar di kamar (Pasal 6.1.c)** | DOCX | VEHICLE_DOMAIN.md tidak mencakup aturan penyimpanan bahan bakar kendaraan | 🟢 Low |

### 2.2 Detail per Gap

#### GAP-01: Kontrak Sewa Tidak Memiliki Klausul Kendaraan

Template perjanjian sewa (`MASTER_DATA_KOSTATION.docx`) memiliki 10 pasal, tetapi **tidak satupun yang mengatur**:
- Kewajiban mendaftarkan kendaraan
- Batas jumlah kendaraan per penghuni
- Larangan parkir di area tertentu
- Tanggung jawab atas kerusakan kendaraan
- Konsekuensi kendaraan tidak terdaftar

**Impact pada VEHICLE_DOMAIN.md**: Domain sudah mendesain approval flow dan registrasi, tetapi secara legal/SOP belum ada dasar kontraktual. Ini bukan masalah domain planning — ini masalah **SOP bisnis** yang perlu diupdate oleh manajemen.

**Rekomendasi**: Masukkan ke backlog sebagai **TD-VEH-001** — *"Sarankan pengelola untuk menambahkan klausul kendaraan di template kontrak sewa."*

#### GAP-02: Form Onboarding Tidak Mencakup Kendaraan

Template kontrak saat ini mengumpulkan: Nama, NIK, Alamat, No. Telp, No. Kavling, No. Kamar. **Tidak ada field kendaraan** (plat, tipe, merk, warna).

**Impact pada VEHICLE_DOMAIN.md**: VEHICLE_DOMAIN.md §5 sudah mendesain registration flow terpisah dari onboarding. Ini valid — registrasi kendaraan bisa dilakukan **setelah** check-in melalui PWA atau admin manual. Namun idealnya, data kendaraan juga dikumpulkan saat onboarding.

**Rekomendasi**: Masukkan ke backlog sebagai **TD-VEH-002** — *"Integrasikan vehicle registration ke onboarding/check-in workflow."*

#### GAP-03: Peraturan Kost Tidak Mencakup Parkir

`MASTER_DATA_MAPPING.md` §14.2 mengidentifikasi 14 peraturan kost dari DOCX. **Tidak satupun yang terkait parkir atau kendaraan**.

Peraturan yang perlu ditambahkan:

| # | Peraturan Parkir yang Disarankan |
|---|---|
| P-01 | Setiap kendaraan penghuni wajib didaftarkan kepada pengelola |
| P-02 | Kendaraan yang tidak terdaftar dilarang parkir di area kost |
| P-03 | Parkir hanya boleh di area yang telah ditentukan |
| P-04 | Dilarang parkir di koridor, halaman, atau jalur evakuasi |
| P-05 | Penghuni bertanggung jawab atas keamanan kendaraan masing-masing |
| P-06 | Memanaskan kendaraan berlebihan yang mengganggu penghuni lain akan dikenakan teguran |

**Impact pada VEHICLE_DOMAIN.md**: Tidak ada impact langsung — domain planning sudah mencakup enforcement digital. Tapi aturan formal perlu ada sebagai basis operasional.

**Rekomendasi**: Masukkan ke backlog sebagai **TD-VEH-003** — *"Sarankan pengelola menambahkan peraturan parkir ke kost_rules seed."*

#### GAP-04: Tidak Ada Data Kapasitas Parkir

Master data Excel dan DOCX tidak menyebutkan kapasitas parkir. VEHICLE_DOMAIN.md §9.3 sudah mendesain `property_settings` untuk parking capacity tapi nilainya belum diketahui.

**Impact**: `parking_capacity_motorcycle` dan `parking_capacity_car` tidak bisa di-seed dari master data. Perlu input manual.

**Rekomendasi**: Sudah tercakup oleh `MASTER_DATA_MAPPING.md` missing data pattern — tambahkan ke daftar Manual Input sebagai **MI-VEH-01**.

#### GAP-05: Aturan Bahan Bakar di Kamar

Pasal 6.1.c melarang menyimpan "bensin, minyak tanah dan bahan bakar berbahaya lainnya di dalam Kamar Kos." Ini relevan karena beberapa penghuni kost menyimpan jeriken bensin cadangan di kamar.

**Impact pada VEHICLE_DOMAIN.md**: Tidak perlu dimasukkan ke domain planning — ini adalah aturan ketertiban yang sudah ada di `kost_rules`.

**Rekomendasi**: No change needed di VEHICLE_DOMAIN.md.

---

## 3. Aturan yang Bertentangan

### 3.1 Hasil Analisis

> [!NOTE]
> **Tidak ditemukan kontradiksi antara VEHICLE_DOMAIN.md dan master data.**

Alasan:
- Master data **tidak memiliki aturan kendaraan eksplisit**, sehingga tidak ada yang bisa bertentangan
- VEHICLE_DOMAIN.md didesain dari best practices industri kost dan user requirements, bukan dari SOP yang ada
- Aturan implisit di DOCX (barang pribadi di koridor, kebisingan) **sejalan** dengan konsep vehicle management

### 3.2 Potensi Konflik Minor (Non-Blocking)

| # | Aspek | Master Data | VEHICLE_DOMAIN.md | Konflik? |
|---|---|---|---|---|
| PC-01 | Jam malam 21:00 WIB | Pasal 6.1.f — tamu dilarang setelah 21:00 | §10 Visitor vehicle — check-in/out kapan saja | ⚠️ **Potensi konflik** — visitor vehicle seharusnya tidak boleh masuk setelah 21:00 |
| PC-02 | Sewa tahunan | Pasal 3 — sewa per tahun | §4.2 — lifecycle tied to occupancy | ✅ Kompatibel — occupancy bisa tahunan |
| PC-03 | Keributan/gangguan | Pasal 6.1.b — larangan keributan | §2.4 BR-VEH-07 — kendaraan bisa jadi objek complaint | ✅ Sejalan |

**PC-01 Detail**: VEHICLE_DOMAIN.md §10.4 (Visitor Vehicle Phase 2 Preview) menunjukkan flow guard mencatat kendaraan tamu masuk tanpa batasan jam. Ini berpotensi konflik dengan jam malam 21:00.

**Rekomendasi**: Tambahkan ke backlog **TD-VEH-004** — *"Visitor vehicle check-in harus mematuhi jam malam property (21:00 WIB)."*

---

## 4. Apakah Perlu Perubahan Domain?

### 4.1 Keputusan

| Pertanyaan | Jawaban | Alasan |
|---|---|---|
| Perlu revisi VEHICLE_DOMAIN.md? | **Tidak** | Tidak ada kontradiksi; gap bersifat SOP/operasional, bukan arsitektural |
| Perlu revisi entity/relationship? | **Tidak** | Relationship model sudah benar |
| Perlu revisi status lifecycle? | **Tidak** | Status values sudah comprehensive |
| Perlu revisi approval flow? | **Tidak** | Flow sudah memadai |
| Perlu revisi parking strategy? | **Tidak** | Opsi B (opsional) sudah tepat mengingat tidak ada data parking dari master data |

### 4.2 Alasan Tidak Perlu Perubahan Domain

1. **Master data adalah template kosong** — bukan SOP operasional kendaraan yang sudah berjalan
2. **Granada Kost saat ini 0% occupancy** — belum ada penghuni aktif, belum ada kendaraan terdaftar
3. **Vehicle management adalah modul baru** — tidak ada proses existing yang harus dipertahankan
4. **VEHICLE_DOMAIN.md sudah lebih komprehensif** dari apa yang ada di master data

---

## 5. Apakah Cukup Masuk Backlog?

### 5.1 Ya — Semua Gap Cukup Masuk Backlog

| # | Backlog ID | Judul | Priority | Blocking Implementation? |
|---|---|---|---|---|
| 1 | **TD-VEH-001** | Sarankan pengelola tambahkan klausul kendaraan di template kontrak sewa | Low | ❌ Tidak |
| 2 | **TD-VEH-002** | Integrasikan vehicle registration ke onboarding/check-in workflow | Medium | ❌ Tidak (bisa setelah Phase 8D) |
| 3 | **TD-VEH-003** | Sarankan pengelola tambahkan peraturan parkir ke kost_rules seed | Low | ❌ Tidak |
| 4 | **TD-VEH-004** | Visitor vehicle check-in harus mematuhi jam malam property | Low | ❌ Tidak (Phase 2 scope) |
| 5 | **MI-VEH-01** | Input manual kapasitas parkir dari pengelola | Medium | ❌ Tidak (seed data issue) |

### 5.2 Tidak Ada Gap yang Blocking

Semua gap bersifat:
- **SOP/operasional** — keputusan bisnis pengelola, bukan arsitektur teknis
- **Seed data** — data yang perlu dikumpulkan dari pengelola
- **Phase 2** — fitur yang sudah di-defer

---

## 6. Apakah Perlu Tambahan Field Database?

### 6.1 Keputusan: Tidak Perlu Tambahan Field

| Pertanyaan | Jawaban | Alasan |
|---|---|---|
| Perlu kolom baru di `vehicles`? | **Tidak** | Field yang ada sudah komprehensif |
| Perlu kolom baru di `parking_zones`/`parking_slots`? | **Tidak** | Belum ada data parking dari master data |
| Perlu kolom baru di `property_settings`? | **Tidak** | Parking settings sudah direncanakan di VEHICLE_DOMAIN.md §9.3 |
| Perlu update tabel `residents` untuk vehicle data? | **Tidak** | Relasi via FK `vehicles.resident_id` sudah cukup |
| Perlu update template kontrak (DOCX) untuk include vehicle? | **Ya, tapi bukan field DB** | Ini keputusan bisnis, bukan schema |

### 6.2 Catatan: Potensi Field Tambahan untuk Jam Malam

Jika TD-VEH-004 (visitor vehicle jam malam) diimplementasi di Phase 2, mungkin perlu:

```
visitor_vehicles.check_in_time  — sudah ada (timestamp)
property_settings.quiet_hour_start — sudah ada (21:00 dari DOCX)
```

**Tidak perlu field baru** — `quiet_hour_start` sudah ada di property_settings (dari MASTER_DATA_MAPPING.md §14.1).

---

## 7. Apakah Perlu Tambahan Workflow?

### 7.1 Keputusan: Tidak Perlu Workflow Baru

| Workflow | Status di VEHICLE_DOMAIN.md | Gap dari Master Data | Perlu Tambahan? |
|---|---|---|---|
| Vehicle registration | ✅ §5 Registration Flow | — | Tidak |
| Vehicle approval | ✅ §6 Approval Flow | — | Tidak |
| Vehicle deactivation (checkout) | ✅ §4.3 Checkout Impact | — | Tidak |
| Onboarding + vehicle | ❌ Tidak ada | GAP-02 | **Backlog** (TD-VEH-002) |
| Parking rule enforcement | ❌ Implisit via complaint | GAP-03 | **Backlog** (TD-VEH-003) |
| Visitor vehicle + jam malam | ❌ Phase 2 | GAP PC-01 | **Backlog** (TD-VEH-004) |

### 7.2 Workflow yang Disarankan untuk Future (Backlog, Bukan Sekarang)

**TD-VEH-002 — Onboarding + Vehicle Registration Workflow**:

```
Check-in Flow (existing)
  └── Step tambahan: "Apakah penghuni memiliki kendaraan?"
      ├── Ya → Buka form registrasi kendaraan inline
      │         └── Auto-approve (karena admin yang input)
      └── Tidak → Skip, penghuni bisa daftar nanti via PWA
```

Ini tidak memerlukan perubahan domain architecture — hanya perubahan di application layer (use case) dan UI.

---

## 8. Rekomendasi Final

### 8.1 Verdict: ✅ Minor Patch

| Level | Kriteria | Hasil |
|---|---|---|
| **No Change** | Tidak ada gap sama sekali | ❌ Ada 5 gap |
| **✅ Minor Patch** | Gap ada tapi tidak memerlukan revisi arsitektur; cukup backlog items | ✅ Semua gap bersifat SOP/operasional |
| **Major Revision** | Kontradiksi signifikan atau missing fundamental design | ❌ Tidak ada kontradiksi |

### 8.2 Ringkasan Aksi

| # | Aksi | Target Dokumen | Siapa |
|---|---|---|---|
| 1 | Tambahkan TD-VEH-001 s/d TD-VEH-004 ke BACKLOG.md | BACKLOG.md | Developer |
| 2 | Tambahkan MI-VEH-01 ke daftar Manual Input | MASTER_DATA_MAPPING.md atau seed plan | Developer |
| 3 | **Tidak mengubah VEHICLE_DOMAIN.md** | — | — |
| 4 | **Tidak mengubah database schema** | — | — |
| 5 | Komunikasikan GAP-01 dan GAP-03 ke pengelola | Offline/meeting | Product owner |

### 8.3 Kesimpulan

```
┌──────────────────────────────────────────────────────────────────┐
│                    GAP ANALYSIS SUMMARY                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  VEHICLE_DOMAIN.md status:  ✅ VALID — No Revision Needed        │
│                                                                  │
│  Master Data vehicle rules: ❌ NONE — No SOP exists              │
│                                                                  │
│  Contradictions found:      0                                    │
│  Gaps found:                5 (all operational, not architectural)│
│  New fields needed:         0                                    │
│  New workflows needed:      0 (Phase 1)                          │
│  Backlog items to add:      4 (TD-VEH-001 to TD-VEH-004)        │
│  Manual input needed:       1 (MI-VEH-01: parking capacity)     │
│                                                                  │
│  RECOMMENDATION:            Minor Patch (backlog only)           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Appendix A: Full Text Extraction Summary — MASTER_DATA_KOSTATION.docx

| Pasal | Topik | Relevansi Kendaraan |
|---|---|---|
| 1 | Obyek perjanjian (1 unit kamar kost) | ❌ Tidak relevan |
| 2 | Hak dan kewajiban (sewa, formulir, identitas) | ❌ Tidak relevan |
| 3 | Pembayaran sewa (tahunan, perpanjangan) | ❌ Tidak relevan |
| 4 | Harga sewa (BSI transfer, bukti transfer) | ❌ Tidak relevan |
| 5 | Kebersihan (kamar, area umum, koridor) | ⚠️ IMP-01: barang pribadi di koridor |
| 6 | Larangan dan sanksi | ⚠️ IMP-02, IMP-03, IMP-04 |
| 7 | Force Majeure | ❌ Tidak relevan |
| 8 | Perselisihan (musyawarah, Pengadilan Sumedang) | ❌ Tidak relevan |
| 9 | Hal-hal lain (addendum) | ❌ Tidak relevan |
| 10 | Penutup (tanda tangan) | ❌ Tidak relevan |

**Kesimpulan**: Dari 10 pasal, **0 pasal** secara eksplisit mengatur kendaraan. **2 pasal** (5 dan 6) memiliki aturan yang **secara implisit** bisa diterapkan pada kendaraan.

## Appendix B: Backlog Items yang Harus Ditambahkan

```markdown
### Vehicle Management — Master Data Gap

TD-VEH-001
Title: Recommend vehicle clause addition to lease agreement template
Priority: Low
Description: Template kontrak sewa (MASTER_DATA_KOSTATION.docx) tidak memiliki
klausul kendaraan. Sarankan pengelola menambahkan pasal tentang: kewajiban registrasi
kendaraan, batas jumlah, tanggung jawab keamanan, dan konsekuensi pelanggaran parkir.
Blocked: No

TD-VEH-002
Title: Integrate vehicle registration into check-in/onboarding workflow
Priority: Medium
Description: Saat ini vehicle registration terpisah dari onboarding. Idealnya,
admin ditawarkan opsi untuk mendaftarkan kendaraan penghuni saat proses check-in.
Auto-approve karena admin yang input.
Blocked: No (implement after Phase 8D)

TD-VEH-003
Title: Add parking rules to kost_rules seed data
Priority: Low
Description: 14 peraturan kost dari DOCX tidak mencakup aturan parkir. Tambahkan
6 peraturan parkir yang disarankan ke seed kost_rules.
Blocked: No

TD-VEH-004
Title: Visitor vehicle must comply with property quiet hours (curfew)
Priority: Low
Description: Visitor vehicle Phase 2 harus mematuhi jam malam property
(quiet_hour_start). Kendaraan tamu yang masuk setelah jam malam harus mendapat
persetujuan khusus atau ditolak.
Blocked: No (Phase 2 scope)
```
