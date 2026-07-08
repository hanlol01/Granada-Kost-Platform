# ADMIN_ROOMS_OWNER_REQUIREMENTS — Kebutuhan Pemilik untuk Renovasi Halaman Admin Kamar

**Tanggal**: 2026-07-09  
**Sumber**: Interview terstruktur + sesi curhat pemilik + analisis screenshot live  
**Scope**: Admin `/rooms` saja — BUKAN public `/kamar`  
**Status**: Menunggu persetujuan pemilik sebelum implementasi

---

## 1. Ringkasan Ekspektasi Pemilik

Pemilik menginginkan halaman admin Manajemen Kamar yang:

- **Tidak terlalu teknis** — label harus Bahasa Indonesia, istilah mudah dipahami admin non-teknis
- **Tidak terlalu panjang** — scrolling berlebihan harus dihilangkan, data disajikan kompak
- **Workflow utama harus cepat** — lihat daftar kamar → cek status → ubah status / edit / lihat detail
- **Form Tambah/Edit Kamar harus lengkap** — BUKAN popup, tapi halaman/panel penuh karena field banyak
- **Fasilitas itu per kategori, bukan per kamar** — semua kamar Rumah Kost punya fasilitas sama, semua kamar Apart Kost punya fasilitas sama
- **Galeri foto sebaiknya terintegrasi** di kelola unit/kamar, bukan terpisah di sidebar
- **Semua fitur yang sudah ada tetap ada** — dirapikan, bukan di-reset

---

## 2. Pain Points dari Pemilik (Lengkap)

### Dari Interview

| # | Keluhan | Severity |
|---|---------|----------|
| 1 | Tabel terlalu penuh, terlalu banyak kolom sekaligus | 🔴 Tinggi |
| 2 | Tidak ada tombol View Detail | 🔴 Tinggi |
| 3 | Tidak ada aksi Nonaktifkan/Hapus | 🔴 Tinggi |
| 4 | Label campur Inggris-Indonesia, membingungkan | 🟡 Sedang |
| 5 | Harga menampilkan tahunan, padahal operasional bulanan | 🟡 Sedang |
| 6 | Form Tambah Kamar terlalu terbatas | 🟡 Sedang |

### Dari Curhat + Screenshot

| # | Keluhan | Severity | Screenshot |
|---|---------|----------|------------|
| 7 | **"Bangunan dan Unit" di Ringkasan terlalu panjang** — list 26 gedung/unit bikin scroll kebawah terus | 🔴 Tinggi | SS-1 |
| 8 | **Tambah Kamar popup terlalu kecil** — tidak cukup untuk form lengkap | 🔴 Tinggi | SS-2 |
| 9 | **Bingung bedanya "Nomor Kamar", "Kode Unit", "Nomor Legacy"** — di master data hanya ada "Nomor Unit" | 🔴 Tinggi | SS-2, SS-3 |
| 10 | **Kenapa ada opsi "Campur" di Gender Policy?** — bisnis kost biasanya hanya Putra atau Putri | 🟡 Sedang | SS-2 |
| 11 | **Daftar kamar di tab Rumah Kost juga terlalu panjang** — harus scroll banyak untuk lihat semua kamar di semua unit | 🟡 Sedang | SS-3, SS-4 |
| 12 | **Fasilitas sama semua per kategori**, tidak perlu per-kamar — di tabel malah tampil "-" karena tidak diisi | 🟡 Sedang | SS-3 |
| 13 | **Galeri Hunian di sidebar terpisah** — pemilik ingin galeri terintegrasi di kelola unit | 🟡 Sedang | Sidebar |
| 14 | **Tab Ketersediaan kurang informatif** — perlu di-improve | 🟠 Rendah | SS-5 |

---

## 3. Model Bisnis Kamar (Dari Curhat Pemilik)

> [!IMPORTANT]
> Pemahaman ini penting untuk desain form dan tabel yang benar.

### Hierarki Data Kamar

```
Properti (Granada Kost)
├── Kategori: Rumah Kost (rukost)
│   ├── Unit 01 (Putra, 11 kamar)
│   │   ├── Lantai Bawah (B): kamar 1B, 2B, 3B, 4B, 5B
│   │   └── Lantai Atas (A): kamar 6A, 7A, 8A, 9A, 10A, 11A
│   ├── Unit 02 (Putra, 8 kamar)
│   │   ├── Lantai Bawah: ...
│   │   └── Lantai Atas: ...
│   └── ... (total ~26 unit)
└── Kategori: Apart Kost (apartkost)
    ├── Unit ...
    └── ...
```

### Aturan Bisnis

- **1 Unit = beberapa kamar** yang dibagi ke Lantai Bawah (B) dan Lantai Atas (A)
- **Setiap unit punya gender policy**: Putra ATAU Putri (bukan Campur)
- **Nomor Unit** = identitas utama (01, 02, 03, ...)
- **Kode Kamar** = diturunkan dari Unit + Lantai + Urutan (contoh: RK-01-B-001)
- **Fasilitas berlaku per kategori**: semua kamar Rumah Kost = fasilitas sama, semua kamar Apart Kost = fasilitas sama
- **Harga utama = bulanan**, tapi kamar juga bisa disewa tahunan
- **"Nomor Legacy"** = identitas lama dari sistem sebelumnya — tidak perlu ditampilkan mencolok

---

## 4. Layout Admin yang Diinginkan

### 4.1 Struktur Tab

Urutan tab **tetap** seperti sekarang, tidak perlu diubah:

```
[Ringkasan] [Rumah Kost] [Apart Kost] [Ketersediaan]
```

Default landing: **Ringkasan** (tetap).

### 4.2 Tab Ringkasan — Perbaikan

**Problem**: Tabel "Bangunan dan Unit" dengan 26 baris sangat panjang → scroll berlebihan.

**Solusi yang diusulkan** (pemilik terbuka untuk improvisasi):

| Opsi | Deskripsi |
|------|-----------|
| A. Collapsible / Accordion | Tabel bisa di-collapse, default tertutup. Klik untuk expand |
| B. Compact summary | Tampilkan hanya 5-8 unit teratas (by jumlah kamar), sisanya "Lihat semua →" |
| C. Horizontal scroll cards | Ganti tabel dengan horizontal scroll card per gedung |
| D. Pagination | Bagi ke halaman 8-10 unit per halaman |
| **E. Gabungkan ke tab inventory** | Hapus dari Ringkasan, pindahkan ke masing-masing tab Rumah Kost / Apart Kost sebagai header |

> [!NOTE]
> Pemilik tidak memutuskan opsi spesifik — minta agen untuk improvisasi solusi terbaik. Yang penting: **tidak boleh scroll terlalu panjang di Ringkasan**.

### 4.3 Tab Rumah Kost / Apart Kost — Perbaikan

**Problem**: List kamar per unit juga panjang karena setiap unit bisa punya 5-11 kamar, lalu ada banyak unit.

**Harapan pemilik**:
- Grouping per unit TETAP ada
- Tapi setiap group unit bisa di-**collapse/expand**
- Default: collapsed (hanya tampil header unit + summary badge)
- Klik untuk expand dan lihat daftar kamar
- Atau: gunakan pagination per group

### 4.4 Tambah / Edit Kamar — BUKAN Popup

> [!IMPORTANT]
> Pemilik secara tegas mengatakan: **Tambah Kamar JANGAN popup/dialog.** Form harus lengkap dan butuh ruang.

**Opsi yang disarankan**:

| Opsi | Deskripsi |
|------|-----------|
| A. Full-page form | Navigate ke `/rooms/new` atau `/rooms/:id/edit` |
| B. Slide-out drawer lebar | Drawer dari kanan dengan lebar besar (60-70% layar) |
| C. Inline panel | Panel yang muncul di bawah/samping tabel, menggantikan area konten |

> [!NOTE]
> View Detail bisa tetap menggunakan drawer/slide-out (sudah disetujui di interview). Tapi untuk **Tambah/Edit**, pemilik ingin ruang lebih luas.

### 4.5 Tab Ketersediaan — Perlu Improve

Pemilik menilai tab Ketersediaan saat ini kurang informatif. Terbuka untuk perbaikan tapi bukan prioritas utama.

---

## 5. Kolom Tabel yang Diinginkan

### Kolom yang Harus Ada di Tabel

| # | Kolom | Konten | Catatan |
|---|-------|--------|---------|
| 1 | **Kamar** | Kode kamar (primary) + nomor legacy (teks kecil di bawah, jika berbeda) | Gabungkan, jangan pisah kolom |
| 2 | **Gender** | Badge: Putra / Putri | Tanpa opsi "Campur" jika memungkinkan |
| 3 | **Status** | Badge: Kosong / Terisi / Dipesan / Maintenance / Perlu Review / Tidak Aktif | Warna badge |
| 4 | **Visibilitas** | Badge: Publik / Internal | Ganti label "Public" → "Visibilitas" |
| 5 | **Harga** | Bulanan (utama, besar) + Tahunan (sekunder, kecil di bawah jika ada) | Bulanan SELALU ditampilkan |
| 6 | **Aksi** | Tombol: View, Edit, Delete/Nonaktifkan | 3 aksi eksplisit |

### Kolom yang Dihapus dari Tabel

| Kolom | Kemana |
|-------|--------|
| Nomor Legacy (kolom terpisah) | Digabung ke kolom "Kamar" sebagai teks kecil |
| Fasilitas | Dihapus dari tabel — fasilitas sama per kategori, tampil di View Detail saja |
| Room Code (label Inggris) | Diganti → "Kamar" (Bahasa Indonesia) |

---

## 6. Konten View Detail (Drawer)

Ketika admin klik "View" → **slide-out drawer dari kanan** menampilkan:

### Bagian 1: Informasi Kamar
- Kode Kamar
- Nomor Kamar / Nomor Legacy
- Unit (Nomor Unit)
- Kategori (Rumah Kost / Apart Kost)
- Gedung/Unit
- Lantai (Bawah / Atas)
- Ukuran Kamar (jika ada)

### Bagian 2: Status & Visibilitas
- Status kamar (dengan badge)
- Visibilitas (Publik / Internal)

### Bagian 3: Harga
- Harga Bulanan
- Harga Tahunan (jika ada, atau "—")
- Deposit

### Bagian 4: Fasilitas
- Daftar fasilitas (badge/chips)
- Note: "Fasilitas berlaku untuk semua kamar [Rumah Kost/Apart Kost]"

### Bagian 5: Galeri (Phase 2/3)
- Foto kamar jika ada
- Thumbnail gallery

### Bagian 6: Metadata (collapsible)
- Room ID
- Property ID
- Room Type
- Created/Updated timestamps

### Footer
- Tombol: [Edit Kamar] [Tutup]

---

## 7. Field Form Tambah / Edit Kamar

### Form BUKAN popup — halaman penuh atau drawer lebar

| Field | Label (Indonesia) | Tipe Input | Wajib? | Backend Support |
|-------|-------------------|------------|--------|-----------------|
| `number` | Nomor Kamar | Text input | ✅ Ya | ✅ Ada |
| Unit (dropdown) | Nomor Unit | Select/Dropdown — pilih dari daftar unit yang ada | ✅ Ya | Melalui `unitCode` |
| `floor` | Lantai | **Dropdown 2 opsi**: "Lantai 1 / Bawah" dan "Lantai 2 / Atas" | ✅ Ya | ✅ Ada |
| `sizeLabel` | Ukuran Kamar | Text input, placeholder "3x4" | Opsional | ✅ Ada |
| `genderPolicy` | Kebijakan Gender | Select: **Putra / Putri** (pertimbangkan hapus "Campur") | ✅ Ya | ✅ Ada |
| `monthlyPrice` | Harga Bulanan (IDR) | Number input | ✅ Ya | ✅ Ada |
| `depositAmount` | Deposit (IDR) | Number input | ✅ Ya | ✅ Ada |
| `yearlyPrice` | Harga Tahunan (IDR) | Number input | Opsional | ❌ Belum ada di DTO |
| `roomTypeId` | Tipe Kamar | Select dari daftar tipe | Opsional | ✅ Ada |
| `facilityIds` | Fasilitas | Multi-select | Opsional | ✅ Ada |
| `publicVisible` | Visibilitas Publik | Toggle on/off | Opsional | ❌ Belum ada di DTO |
| `roomStatus` | Status Awal | Select (saat tambah baru) | Opsional | Via endpoint terpisah |
| Foto/Galeri | Foto Kamar | Upload gambar | Opsional | ❌ Phase 2/3 |

### Catatan Khusus dari Pemilik

> **"Nomor Unit ini harus bisa dipilih dan nanti keluar list-nya"**
> — Dropdown unit harus menampilkan daftar unit/gedung yang sudah ada di sistem. Admin pilih unit, lalu isi nomor kamar di unit tersebut.

> **"Lantai saya ingin ada dropdown saja, dua opsi: Lantai 1/Bawah dan Lantai 2/Atas"**
> — Jangan free text. Dropdown 2 pilihan saja.

> **"Gender Policy kenapa harus ada opsi Campur?"**
> — Pemilik mempertanyakan kebutuhan opsi "Campur". Secara bisnis, kost biasanya Putra atau Putri. Opsi Campur mungkin bisa dihilangkan atau dibuat tersembunyi.

---

## 8. Aksi per Baris Kamar

### Aksi yang Diinginkan

| Aksi | Icon/Label | Fungsi | Konfirmasi? |
|------|-----------|--------|-------------|
| **View** | 👁 Detail | Buka drawer detail kamar | Tidak |
| **Edit** | ✏ Edit | Buka form edit (full page atau drawer lebar) | Tidak |
| **Delete/Nonaktifkan** | 🗑 Hapus / Nonaktifkan | Nonaktifkan kamar (set status → inactive) | ✅ Ya, wajib konfirmasi |

### Dalam Aksi Dropdown (opsional):

| Aksi | Fungsi |
|------|--------|
| Ubah Status | Pilih status baru (Kosong, Terisi, Dipesan, Maintenance, Perlu Review) |
| Nonaktifkan | Set status → inactive (dengan konfirmasi) |
| Aktifkan Kembali | Jika kamar sudah inactive, bisa diaktifkan lagi → vacant |

---

## 9. Preferensi Delete vs Archive vs Nonaktifkan

### Keputusan Pemilik

> **Default: Nonaktifkan** (status → `inactive`) karena lebih aman.
> 
> **Hapus permanen boleh NANTI** — hanya jika backend bisa memastikan kamar **belum pernah**:
> - Ditempati penghuni
> - Ada booking
> - Ada billing/transaksi
> - Ada riwayat apapun
>
> Untuk sekarang: **Nonaktifkan saja sudah cukup.**

### Backend Status Saat Ini

- ❌ Tidak ada `DELETE /rooms/:roomId` endpoint
- ✅ Ada `PATCH /rooms/:roomId/status` → bisa set `inactive`
- ✅ Hook `useUpdateRoomStatus` sudah tersedia

---

## 10. Preferensi Tampilan Harga

### Di Tabel

```
Rp 1.800.000 /bulan          ← utama, font besar
Rp 21.600.000 /tahun         ← sekunder, font kecil, warna muted (jika ada)
```

- **Bulanan SELALU ditampilkan** (required field, selalu ada)
- **Tahunan tampil kecil di bawahnya** jika datanya ada (`yearlyPrice !== null`)
- Jika tahunan tidak ada, hanya tampil bulanan

### Di View Detail Drawer

- Harga Bulanan: `Rp 1.800.000`
- Harga Tahunan: `Rp 21.600.000` (atau "—" jika kosong)
- Deposit: `Rp 500.000`

### Di Form Tambah/Edit

- Harga Bulanan (IDR) — **wajib**
- Harga Tahunan (IDR) — **opsional** (Phase 2, belum ada di backend DTO)
- Deposit (IDR) — **wajib**

---

## 11. Fasilitas — Keputusan Penting

> [!IMPORTANT]
> Pemilik menjelaskan bahwa **fasilitas SAMA untuk semua kamar dalam satu kategori**:
> - Semua kamar **Rumah Kost** → fasilitas A
> - Semua kamar **Apart Kost** → fasilitas B

### Implikasi

1. **Kolom Fasilitas di tabel DIHAPUS** — tidak informatif karena semua sama
2. **Fasilitas di View Detail** ditampilkan dengan catatan: *"Fasilitas berlaku untuk semua kamar Rumah Kost"*
3. **Form per-kamar** tetap bisa punya `facilityIds` (backend mendukung), tapi praktiknya admin tidak perlu isi per kamar
4. **Idealnya**: fasilitas dikelola di level unit/kategori, bukan per kamar — tapi ini butuh perubahan backend (Phase 2/3)

---

## 12. Galeri — Integrasi ke Kelola Unit

> [!IMPORTANT]
> Pemilik tidak ingin **Galeri Hunian** terpisah di sidebar sebagai halaman sendiri. Galeri sebaiknya:
> - Terintegrasi di form Edit Unit / Edit Kamar
> - Saat edit unit, admin bisa langsung upload gambar untuk unit tersebut
> - Ini memperkuat keputusan: **form Tambah/Edit kamar harus full page**, bukan popup

### Status Saat Ini
- Galeri Hunian ada di sidebar sebagai menu terpisah
- Ini adalah fitur M19

### Rekomendasi
- **Phase 1**: Jangan sentuh Galeri Hunian — tetap di sidebar untuk saat ini
- **Phase 2/3**: Integrasikan upload foto ke form Edit Unit/Kamar
- Perubahan sidebar menu: di luar scope renovasi admin `/rooms`

---

## 13. Label yang Harus Diganti

| Label Saat Ini | Label Baru | Alasan |
|----------------|------------|--------|
| "Room Code" | **"Kamar"** atau **"Kode Kamar"** | Full Bahasa Indonesia |
| "Nomor Legacy" | Digabung ke "Kamar" sebagai teks kecil | Bukan kolom terpisah |
| "Gender Policy" | **"Kebijakan Gender"** atau **"Gender"** | Full Bahasa Indonesia |
| "Label Ukuran" | **"Ukuran Kamar"** | Lebih jelas |
| "Public" / "Public Visible" | **"Visibilitas"** | Full Bahasa Indonesia |
| "Status" | **"Status"** | Tetap (sudah Indonesia) |
| "Harga" | **"Harga/Bulan"** | Klarifikasi ini harga bulanan |
| "Aksi" | **"Aksi"** | Tetap |
| "Fasilitas" | Dihapus dari tabel | Per keputusan pemilik |
| "Gender Policy: Campur" | **Pertimbangkan hapus** | Bisnis kost umumnya Putra/Putri |

### Prinsip Label

> **Semua label harus full Bahasa Indonesia. Tidak boleh campur Inggris.**
> Istilah teknis (Room ID, Property ID) hanya boleh tampil di View Detail bagian Metadata.

---

## 14. Hal yang TIDAK BOLEH Diubah

| Area | Status | Catatan |
|------|--------|---------|
| Backend API | ❌ Jangan sentuh | Scope frontend only |
| Database / migrasi | ❌ Jangan sentuh | Tidak ada SQL |
| Public `/kamar` | ❌ Jangan sentuh | Scope terpisah |
| Payment Gateway | ❌ Jangan sentuh | Tidak terkait |
| Smart Lock | ❌ Jangan sentuh | Tidak terkait |
| 4 tab structure | ✅ Tetap ada | Urutan tetap |
| Filter bar | ✅ Tetap ada | Lengkap 6 filter |
| Metric cards di Ringkasan | ✅ Tetap ada | Tapi "Bangunan dan Unit" perlu dirapikan |
| Building grouping | ✅ Tetap ada | Tapi collapsible |
| Ketersediaan tab | ✅ Tetap ada | Tapi improve jika bisa |
| Tombol Tambah Kamar | ✅ Tetap di atas halaman | Posisi tidak berubah |
| Permission gating | ✅ Tetap ada | `room.manage` |

---

## 15. Open Questions / Belum Diputuskan

| # | Pertanyaan | Status |
|---|-----------|--------|
| 1 | Apakah opsi "Campur" di Gender Policy dihapus atau tetap ada tapi tersembunyi? | ⏳ Belum final — pemilik cenderung hapus, tapi perlu cek data existing |
| 2 | Form Tambah/Edit → full page (`/rooms/new`) atau drawer lebar? | ⏳ Pemilik bilang "jangan popup" tapi belum pilih antara full page vs drawer lebar |
| 3 | "Bangunan dan Unit" di Ringkasan → solusi spesifik apa? (collapsible, compact, pindahkan) | ⏳ Pemilik minta improvisasi agen |
| 4 | Galeri integrasi ke form unit — apakah ini masuk Phase 1 atau Phase 2/3? | ⏳ Kemungkinan Phase 2/3 karena butuh upload engine |
| 5 | Tab Ketersediaan — improve apa spesifiknya? | ⏳ Belum ada detail, pemilik terbuka untuk saran |
| 6 | Apakah ada data kamar existing yang menggunakan gender "mixed"? Jika ya, hapus opsi bisa bermasalah | ⏳ Perlu cek database |

---

## 16. Prioritas Implementasi (Dari Pemilik)

### 🔴 URGENT — Harus Segera (Phase 1)

1. ✏️ Perbaiki tabel — kurangi kolom, rapikan tampilan, bahasa Indonesia
2. 👁 Tambah View Detail drawer
3. ⚡ Tambah aksi Ubah Status dan Nonaktifkan (dengan konfirmasi)
4. 🏷 Perbaiki semua label ke Bahasa Indonesia
5. 💰 Harga bulanan sebagai utama, tahunan sekunder
6. 📦 Bangunan dan Unit di Ringkasan — rapikan agar tidak terlalu panjang
7. 📂 Building groups di tab inventory — collapsible agar tidak scroll berlebihan
8. 🚫 Hapus kolom Fasilitas dari tabel (sama semua per kategori)

### 🟡 BISA NANTI — Phase 2

9. Expand form Tambah/Edit dengan Tipe Kamar dan Fasilitas multi-select
10. Input Harga Tahunan (butuh backend DTO)
11. Toggle Visibilitas Publik (butuh backend DTO)
12. Form Tambah/Edit jadi full page atau drawer lebar (bukan popup kecil)
13. Unit dropdown di form (pilih dari daftar unit yang ada)
14. Lantai dropdown (2 opsi: Bawah / Atas)

### 🟠 NANTI — Phase 3

15. Upload foto kamar (butuh upload engine)
16. Integrasi galeri ke form Edit Unit
17. Bulk status change
18. Improve tab Ketersediaan
19. Hapus permanen (jika backend mendukung cek riwayat kamar)

---

## 17. Rekomendasi Scope Implementasi Berikutnya

### Phase 1 Scope (Frontend-Only, Zero Backend Changes)

Fokus pada 8 item urgent yang semuanya bisa dilakukan **tanpa** mengubah backend:

```
✅ Slim table (6 kolom max)
✅ View Detail drawer (slide-out kanan)
✅ Action menu: View, Edit, Ubah Status, Nonaktifkan
✅ Status change confirmation dialog
✅ Nonaktifkan confirmation dialog (menggunakan existing PATCH /rooms/:id/status → inactive)
✅ Semua label → Bahasa Indonesia
✅ Harga: bulanan primary, tahunan secondary
✅ Bangunan dan Unit di Ringkasan → collapsible atau compact
✅ Building groups di inventory tabs → collapsible/expandable
✅ Hapus kolom Fasilitas dari tabel
```

**Estimasi**: 2-3 hari kerja fokus

### File yang Akan Diubah (Phase 1)

| File | Perubahan |
|------|-----------|
| `apps/admin/src/routes/rooms.tsx` | Tabel, labels, grouping, actions, drawer integration |
| `apps/admin/src/components/forms/RoomFormDialog.tsx` | Rename labels |
| `apps/admin/src/components/rooms/RoomDetailDrawer.tsx` | **BARU** — slide-out detail |
| `apps/admin/src/components/rooms/RoomActionMenu.tsx` | **BARU** — dropdown aksi |
| `apps/admin/src/components/rooms/StatusChangeDialog.tsx` | **BARU** — konfirmasi ubah status |
| `apps/admin/src/components/rooms/ArchiveConfirmDialog.tsx` | **BARU** — konfirmasi nonaktifkan |

---

## Final Verdict

| Kriteria | Hasil |
|----------|-------|
| **Status Pengumpulan** | ✅ **PASS** |
| **Ringkasan** | Pemilik menginginkan admin `/rooms` yang lebih bersih, tidak teknis, full Bahasa Indonesia, dengan View Detail drawer, aksi lengkap (View/Edit/Ubah Status/Nonaktifkan), tabel compact, harga bulanan utama, collapsible building groups, dan form Tambah/Edit yang bukan popup. Fasilitas per kategori (bukan per kamar). Galeri terintegrasi ke unit (Phase 2/3). |
| **Scope Rekomendasi** | **Phase 1** — 8 perbaikan urgent, semua frontend-only |
| **Risiko/Unclear** | (1) Opsi "Campur" perlu cek data existing sebelum dihapus, (2) Form full-page vs drawer lebar belum final, (3) "Bangunan dan Unit" solusi spesifik dipercayakan ke agen, (4) Galeri integrasi butuh upload engine |
