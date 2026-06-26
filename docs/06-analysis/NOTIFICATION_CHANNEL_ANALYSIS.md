# ANALISIS KANAL PENGIRIMAN NOTIFIKASI — Granada Kost Platform

> **Versi**: 1.0  
> **Tanggal**: 18 Juni 2026  
> **Peran Pembuat**: Lead Software Engineer — Notification Infrastructure  
> **Status**: Dokumen Evaluasi Teknis — Untuk Keputusan Pimpinan Proyek  
> **Konteks**: Granada Kost Platform — ±163 kamar (116 kamar aktif skenario awal)

---

## Daftar Isi

1. [Ringkasan Eksekutif](#1-ringkasan-eksekutif)
2. [Opsi 1 — Brevo (Email Transaksional)](#2-opsi-1--brevo-email-transaksional)
3. [Opsi 2 — Fonnte (WhatsApp Unofficial Gateway)](#3-opsi-2--fonnte-whatsapp-unofficial-gateway)
4. [Opsi 3 — Meta WhatsApp Business API (Official)](#4-opsi-3--meta-whatsapp-business-api-official)
5. [Opsi 4 — Baileys (WhatsApp Reverse-Engineering Library)](#5-opsi-4--baileys-whatsapp-reverse-engineering-library)
6. [Tabel Perbandingan Komprehensif](#6-tabel-perbandingan-komprehensif)
7. [Strategi Penghematan Kuota & Rate Limit](#7-strategi-penghematan-kuota--rate-limit)
8. [Simulasi Penggunaan Bulanan](#8-simulasi-penggunaan-bulanan)
9. [Rekomendasi Arsitektur](#9-rekomendasi-arsitektur)
10. [Kesimpulan & Rekomendasi Akhir](#10-kesimpulan--rekomendasi-akhir)

---

## 1. Ringkasan Eksekutif

Granada Kost Platform memerlukan kanal pengiriman notifikasi untuk mendukung operasional harian, khususnya:

- Pengiriman **invoice tagihan bulanan** kepada penghuni
- **Pengingat jatuh tempo** pembayaran
- Notifikasi **status complaint dan maintenance**
- Notifikasi **approval kendaraan**
- Notifikasi **pengumuman** dari admin/pengelola

Dokumen ini mengevaluasi **4 opsi kanal pengiriman** beserta kelebihan, kekurangan, batasan teknis, estimasi biaya, dan strategi mitigasi rate limit untuk masing-masing opsi.

### Matriks Keputusan Cepat

| Opsi | Biaya | Attachment | Reliability | Effort Setup | Rekomendasi |
|---|---|---|---|---|---|
| **Brevo (Email)** | Rp 0/bulan | ✅ Ya (PDF, gambar) | ✅ Tinggi | 🟢 Rendah | ✅ **Direkomendasikan** |
| **Fonnte Lite** | Rp 25.000/bulan | ❌ Tidak (Lite) | ⚠️ Sedang | 🟢 Rendah | ⚠️ Pertimbangan |
| **Meta WA API** | ~Rp 300.000+/bulan | ✅ Ya | ✅ Tinggi | 🔴 Tinggi | ⚠️ Mahal |
| **Baileys** | Rp 0/bulan | ✅ Ya | ❌ Sangat Rendah | 🟡 Sedang | ❌ **Tidak Direkomendasikan** |

---

## 2. Opsi 1 — Brevo (Email Transaksional)

### 2.1 Deskripsi Layanan

[Brevo](https://www.brevo.com) (sebelumnya Sendinblue) adalah platform email transaksional yang menyediakan paket **gratis tanpa batas waktu** dengan kuota harian 300 email per hari. Layanan ini dapat digunakan selama berbulan-bulan atau bahkan bertahun-tahun tanpa biaya selama penggunaan tidak melebihi kuota harian.

### 2.2 Spesifikasi Teknis

| Aspek | Detail |
|---|---|
| **Protokol** | SMTP atau REST API (HTTP) |
| **Kuota gratis** | 300 email/hari (berlaku tanpa batas waktu) |
| **Kuota bulanan** | Tidak ada batasan bulanan; hanya batasan harian |
| **Biaya** | **Rp 0** — gratis selama tidak melebihi 300 email/hari |
| **Attachment** | ✅ Didukung — PDF, gambar, dan dokumen lain |
| **Ukuran attachment** | Hingga 20 MB per email |
| **Deliverability** | Tinggi — dedicated IP, DKIM, SPF, DMARC |
| **API SDK** | Node.js, Python, PHP, Ruby, dll. |
| **Webhook** | ✅ Didukung — bounce, open, click, delivery tracking |
| **Template** | ✅ HTML email template builder |

### 2.3 Kelebihan

| # | Kelebihan | Penjelasan |
|---|---|---|
| K-01 | **Gratis tanpa batas waktu** | Tidak ada batas berapa lama paket gratis bisa dipakai selama kuota harian tidak dilanggar |
| K-02 | **Mendukung attachment PDF** | Invoice tagihan, kuitansi pembayaran, dan dokumen lain dapat dilampirkan langsung |
| K-03 | **Deliverability tinggi** | Infrastruktur email enterprise dengan reputasi baik; dukungan DKIM/SPF/DMARC |
| K-04 | **API terintegrasi dengan baik** | REST API dan SMTP standar; SDK resmi untuk Node.js (NestJS kompatibel) |
| K-05 | **Tracking lengkap** | Webhook untuk delivery, bounce, open rate — berguna untuk audit dan debugging |
| K-06 | **HTML template** | Email bisa didesain profesional; invoice bisa ditampilkan inline + PDF attachment |
| K-07 | **Skalabilitas** | Jika perlu lebih dari 300/hari, tinggal upgrade ke paket berbayar (mulai $9/bulan untuk 5000 email/bulan) |
| K-08 | **Tidak ada risiko blokir nomor telepon** | Berbeda dengan WhatsApp unofficial; email tidak ada risiko ban akun |

### 2.4 Kekurangan

| # | Kekurangan | Penjelasan | Mitigasi |
|---|---|---|---|
| KK-01 | **Batasan 300 email/hari** | Jika seluruh 163 kamar aktif dan ada burst notification, bisa menyentuh limit | Lihat §7 — Strategi Penghematan Kuota |
| KK-02 | **Email sering diabaikan penghuni** | Penghuni kost (mahasiswa) lebih aktif di WhatsApp daripada email | Gunakan email sebagai kanal sekunder; push notification di PWA sebagai primer |
| KK-03 | **Perlu email valid dari penghuni** | Penghuni harus punya email aktif; tidak semua penghuni kost terbiasa cek email | Kumpulkan email saat onboarding; fallback ke in-app notification |
| KK-04 | **Spam filter** | Email transaksional bisa masuk spam jika domain sender belum ter-autentikasi | Setup DKIM, SPF, DMARC dengan benar sejak awal |
| KK-05 | **Tidak real-time seperti WhatsApp** | Email bukan instant messaging; penghuni mungkin baru baca setelah berjam-jam | Acceptable untuk invoice dan pengumuman; tidak ideal untuk urgent notification |

### 2.5 Kalkulasi Kuota Brevo

```
Skenario: 116 kamar aktif

Notifikasi bulanan rutin:
  - Invoice tagihan: 116 email (1x/bulan, awal bulan)
  - Pengingat jatuh tempo: 116 email (1x/bulan, H-3 due date)
  - Overdue reminder: ~30 email (estimasi 25% overdue)
  
  Subtotal rutin: ~262 email/bulan

Notifikasi harian rata-rata:
  - 262 ÷ 30 hari = ~8.7 email/hari (rata-rata)

Notifikasi on-demand (estimasi):
  - Complaint update: ~2-3/hari
  - Vehicle approval: ~1/hari
  - Pengumuman: ~1/minggu

  Total rata-rata: ~12-15 email/hari

Kesimpulan: Jauh di bawah limit 300/hari ✅
```

> **Peringatan**: Risiko terjadi pada **batch day** (hari pengiriman invoice massal). Jika 116 invoice dikirim sekaligus ditambah notifikasi lain, total bisa 130-150 email dalam satu hari — masih di bawah 300, tapi perlu dimonitor.

---

## 3. Opsi 2 — Fonnte (WhatsApp Unofficial Gateway)

### 3.1 Deskripsi Layanan

[Fonnte](https://fonnte.com) adalah layanan gateway WhatsApp **unofficial** (non-official API) berbasis di Indonesia. Layanan ini bekerja dengan cara **menghubungkan nomor WhatsApp pribadi** ke server Fonnte sebagai relay pengiriman pesan.

### 3.2 Spesifikasi Paket Lite

| Aspek | Detail |
|---|---|
| **Nama paket** | **Lite** |
| **Harga bulanan** | **Rp 25.000/bulan** |
| **Harga tahunan** | **Rp 250.000/tahun** (hemat ~Rp 50.000) |
| **Kuota pesan** | **1.000 pesan/bulan** |
| **Attachment** | ❌ **Tidak didukung pada paket Lite** |
| **Tipe pesan** | Hanya teks (text message) |
| **Nomor pengirim** | Nomor WhatsApp pribadi (di-pair ke Fonnte) |
| **API** | REST API (HTTP POST) |
| **Multi-device** | ❌ Terbatas |

### 3.3 Kelebihan

| # | Kelebihan | Penjelasan |
|---|---|---|
| K-01 | **Harga sangat terjangkau** | Rp 25.000/bulan — salah satu gateway WA termurah di Indonesia |
| K-02 | **WhatsApp = kanal paling aktif untuk penghuni kost** | Penghuni (mahasiswa) pasti membuka WhatsApp setiap hari; delivery rate efektif sangat tinggi |
| K-03 | **Setup mudah** | Cukup scan QR code untuk pair nomor; API sederhana (HTTP POST) |
| K-04 | **Berbasis Indonesia** | Dukungan Bahasa Indonesia; support lokal |
| K-05 | **Tidak perlu verifikasi Meta/Facebook** | Langsung bisa dipakai tanpa proses bisnis verification yang rumit |
| K-06 | **Pesan langsung masuk ke WhatsApp penghuni** | Tidak perlu penghuni install aplikasi baru atau buka email |

### 3.4 Kekurangan

| # | Kekurangan | Penjelasan | Severity |
|---|---|---|---|
| KK-01 | **❌ Paket Lite TIDAK mendukung attachment** | Tidak bisa mengirim dokumen PDF (invoice tagihan, kuitansi, bukti pembayaran). Hanya pesan teks. Ini adalah **limitasi kritis** karena pengiriman invoice PDF adalah salah satu kebutuhan utama platform. | 🔴 Kritis |
| KK-02 | **Limit 1.000 pesan/bulan** | Dengan 116 kamar aktif, kuota bisa habis sebelum akhir bulan jika notifikasi tidak dikelola dengan ketat | 🟡 Penting |
| KK-03 | **Unofficial API — risiko blokir nomor** | WhatsApp secara aktif mendeteksi dan memblokir nomor yang menggunakan gateway unofficial. Risiko nomor pengirim di-ban oleh WhatsApp kapan saja tanpa peringatan | 🔴 Kritis |
| KK-04 | **Tidak ada jaminan SLA** | Fonnte bukan partner resmi WhatsApp; tidak ada SLA uptime atau delivery guarantee | 🟡 Penting |
| KK-05 | **Nomor pribadi sebagai sender** | Nomor WhatsApp yang dipakai untuk Fonnte tidak bisa dipakai untuk chat manual secara bersamaan; rawan konflik penggunaan | 🟡 Penting |
| KK-06 | **Perlu upgrade ke paket lebih tinggi untuk attachment** | Paket yang mendukung attachment (media/file) harganya lebih mahal (mulai ~Rp 100.000+/bulan) | 🟡 Penting |
| KK-07 | **Melanggar Terms of Service WhatsApp** | Penggunaan unofficial API bertentangan dengan ToS WhatsApp. Secara legal, ini berisiko walaupun enforcement-nya jarang | 🟡 Penting |

### 3.5 Kalkulasi Kuota Fonnte Lite

```
Skenario: 116 kamar aktif, paket Lite (1.000 pesan/bulan)

Notifikasi bulanan rutin:
  - Invoice reminder (teks saja, tanpa PDF): 116 pesan
  - Pengingat jatuh tempo: 116 pesan
  - Overdue reminder: ~30 pesan

  Subtotal rutin: ~262 pesan/bulan

Notifikasi on-demand:
  - Complaint update: ~60/bulan
  - Vehicle approval: ~30/bulan
  - Pengumuman: ~116 × 4 = ~464/bulan (jika broadcast ke semua penghuni)

  Subtotal on-demand: ~554 pesan/bulan

TOTAL ESTIMASI: ~816 pesan/bulan

Sisa kuota: 1.000 - 816 = ~184 pesan buffer ⚠️ TIPIS

Catatan: Jika ada 5+ pengumuman broadcast per bulan,
kuota PASTI HABIS sebelum akhir bulan.
```

> **Peringatan Kritis**: Paket Lite **tidak mendukung pengiriman file/attachment**. Artinya, **invoice PDF, kuitansi pembayaran, dan dokumen lain TIDAK BISA dikirim** melalui Fonnte Lite. Penghuni hanya menerima pesan teks berisi tautan (link) ke portal web untuk mengunduh dokumen.

---

## 4. Opsi 3 — Meta WhatsApp Business API (Official)

### 4.1 Deskripsi Layanan

[WhatsApp Business API](https://developers.facebook.com/docs/whatsapp) adalah API resmi dari Meta (Facebook) untuk pengiriman pesan WhatsApp secara programatik. Ini adalah satu-satunya cara **legal dan resmi** untuk mengirim pesan WhatsApp otomatis dari aplikasi bisnis.

### 4.2 Spesifikasi Teknis

| Aspek | Detail |
|---|---|
| **Provider** | Meta Platforms / Facebook |
| **Model biaya** | **Per-pesan (conversation-based pricing)** |
| **Harga per pesan (utility)** | ~Rp 300–500 per pesan (Indonesia, utility conversation) |
| **Harga per pesan (marketing)** | ~Rp 500–800 per pesan (Indonesia, marketing conversation) |
| **Attachment** | ✅ Didukung penuh — PDF, gambar, video, dokumen |
| **Template** | ✅ Wajib menggunakan pre-approved message template |
| **Deliverability** | ✅ Sangat tinggi — resmi dari WhatsApp |
| **SLA** | ✅ Ada — enterprise-grade SLA dari Meta |
| **Green tick** | ✅ Bisa mendapat centang hijau (verified business) |

### 4.3 Kelebihan

| # | Kelebihan | Penjelasan |
|---|---|---|
| K-01 | **Resmi dan legal** | Satu-satunya cara pengiriman WhatsApp yang sesuai Terms of Service; tidak ada risiko ban nomor |
| K-02 | **Mendukung attachment penuh** | PDF invoice, gambar, dokumen bisa dikirim langsung |
| K-03 | **Deliverability sangat tinggi** | Pesan pasti terkirim; infrastruktur Meta |
| K-04 | **Green tick (verified business)** | Menambah kepercayaan penghuni; terlihat profesional |
| K-05 | **SLA enterprise** | Guaranteed uptime dan delivery |
| K-06 | **Scalable** | Tidak ada batasan kuota harian yang ketat; hanya bayar per pesan |
| K-07 | **Rich message format** | Buttons, quick replies, list messages — UX yang lebih baik |

### 4.4 Kekurangan

| # | Kekurangan | Penjelasan | Severity |
|---|---|---|---|
| KK-01 | **Biaya per pesan yang signifikan** | Dengan ±116 kamar dan multiple notification types, biaya bulanan bisa mencapai **Rp 300.000+/bulan** atau lebih | 🔴 Kritis |
| KK-02 | **Proses verifikasi Meta yang sulit dan memakan waktu** | Harus memiliki Facebook Business Manager terverifikasi, dokumen legalitas perusahaan (SIUP/NIB/Akta), verifikasi domain, review template pesan oleh Meta. Proses ini bisa memakan **2-4 minggu** atau lebih, dan sering ditolak pada percobaan pertama | 🔴 Kritis |
| KK-03 | **Template pesan harus di-approve terlebih dahulu** | Setiap jenis pesan (invoice, reminder, complaint update) harus dibuat sebagai template dan di-submit untuk review Meta. Perubahan template memerlukan review ulang | 🟡 Penting |
| KK-04 | **Biaya tidak predictable** | Model conversation-based pricing membuat biaya berfluktuasi tergantung jumlah pesan dan tipe conversation | 🟡 Penting |
| KK-05 | **Perlu BSP (Business Solution Provider)** | Akses langsung ke API memerlukan BSP partner (Twilio, MessageBird, dll.) yang menambah biaya intermediary | 🟡 Penting |
| KK-06 | **Kompleksitas teknis lebih tinggi** | Setup webhook, message status tracking, template management, conversation window management | 🟡 Penting |

### 4.5 Estimasi Biaya Bulanan Meta WhatsApp Business API

```
Skenario: 116 kamar aktif
Asumsi: Harga per utility conversation = Rp 350 (rata-rata)
        Harga per marketing conversation = Rp 600

Notifikasi bulanan:
  - Invoice (utility): 116 × Rp 350 = Rp 40.600
  - Reminder jatuh tempo (utility): 116 × Rp 350 = Rp 40.600
  - Overdue (utility): 30 × Rp 350 = Rp 10.500
  - Complaint update (utility): 60 × Rp 350 = Rp 21.000
  - Vehicle approval (utility): 30 × Rp 350 = Rp 10.500
  - Pengumuman (marketing): 4 × 116 × Rp 600 = Rp 278.400

TOTAL ESTIMASI: ~Rp 401.600/bulan

Catatan:
- Ini belum termasuk biaya BSP (middleware) yang bisa menambah 10-20%
- Total bisa mencapai Rp 450.000 - Rp 500.000/bulan
- Per tahun: Rp 5.400.000 - Rp 6.000.000
```

> **Kesimpulan Biaya**: Untuk operasional kost 116 kamar, biaya Meta WhatsApp Business API berkisar **Rp 300.000 – 500.000/bulan**. Ini merupakan beban operasional yang **signifikan** untuk skala bisnis kost.

---

## 5. Opsi 4 — Baileys (WhatsApp Reverse-Engineering Library)

### 5.1 Deskripsi

[Baileys](https://github.com/WhiskeySockets/Baileys) adalah library Node.js open-source yang melakukan **reverse-engineering** terhadap protokol WhatsApp Web. Library ini memungkinkan pengiriman pesan WhatsApp secara programatik tanpa menggunakan API resmi Meta.

### 5.2 Spesifikasi Teknis

| Aspek | Detail |
|---|---|
| **Tipe** | Open-source library (npm package) |
| **Protokol** | Reverse-engineered WhatsApp Web protocol |
| **Biaya** | **Rp 0** — open-source, gratis |
| **Attachment** | ✅ Didukung — PDF, gambar, video, dokumen |
| **Self-hosted** | ✅ Sepenuhnya di-host sendiri (Node.js) |
| **Nomor pengirim** | Nomor WhatsApp pribadi |

### 5.3 Mengapa Baileys SANGAT TIDAK DIREKOMENDASIKAN untuk Production

> ⛔ **BAILEYS TIDAK BOLEH DIGUNAKAN UNTUK PRODUCTION**

| # | Risiko | Penjelasan | Severity |
|---|---|---|---|
| R-01 | **❌ Melanggar Terms of Service WhatsApp** | WhatsApp secara eksplisit melarang penggunaan unofficial clients. Menggunakan Baileys untuk bisnis bisa berujung pada **tuntutan hukum** dari Meta | 🔴 Kritis |
| R-02 | **❌ Nomor bisa di-ban permanen kapan saja** | WhatsApp secara aktif mendeteksi koneksi non-official. Nomor yang digunakan bisa di-ban **dalam hitungan jam atau hari** tanpa peringatan dan **tidak bisa dipulihkan** | 🔴 Kritis |
| R-03 | **❌ Tidak ada jaminan ketersediaan (zero SLA)** | Karena berbasis reverse-engineering, setiap kali WhatsApp memperbarui protokolnya (yang terjadi secara reguler), Baileys **bisa berhenti bekerja total** sampai maintainer library merilis patch | 🔴 Kritis |
| R-04 | **❌ Maintenance burden sangat tinggi** | Tim developer harus mengikuti setiap perubahan protokol WhatsApp, menangani reconnection issues, session management, dan error handling yang tidak terdokumentasi | 🔴 Kritis |
| R-05 | **❌ Session management tidak stabil** | Koneksi WebSocket ke WhatsApp sering terputus; memerlukan mekanisme reconnection yang kompleks. Di production dengan traffic tinggi, session dropout bisa menyebabkan **pesan hilang tanpa notifikasi** | 🔴 Kritis |
| R-06 | **❌ Tidak ada delivery guarantee** | Tidak ada mekanisme resmi untuk mengetahui apakah pesan benar-benar terkirim, dibaca, atau gagal. Webhook status delivery tidak reliable | 🟡 Penting |
| R-07 | **❌ Risiko reputasi bisnis** | Jika diketahui bahwa platform bisnis menggunakan unofficial WhatsApp API, ini bisa merusak kredibilitas di mata penghuni dan stakeholder | 🟡 Penting |
| R-08 | **❌ Rate limiting agresif oleh WhatsApp** | WhatsApp menerapkan rate limit yang ketat pada koneksi non-official. Pengiriman pesan massal bisa memicu flag dan ban otomatis | 🔴 Kritis |
| R-09 | **❌ Tidak ada support** | Jika terjadi masalah, tidak ada customer support. Hanya bergantung pada komunitas open-source yang bisa saja tidak aktif | 🟡 Penting |
| R-10 | **❌ Library bisa discontinued kapan saja** | Maintainer Baileys bisa berhenti mengembangkan library kapan saja (sudah terjadi beberapa kali — project berpindah tangan dari `adiwajshing/Baileys` ke `WhiskeySockets/Baileys`) | 🔴 Kritis |

### 5.4 Kesimpulan Baileys

```
┌──────────────────────────────────────────────────────────────┐
│                    ⛔ VERDICT: BAILEYS                        │
│                                                              │
│  Status:      SANGAT TIDAK DIREKOMENDASIKAN                  │
│  Environment: HANYA untuk eksperimen pribadi/development     │
│  Production:  DILARANG                                       │
│                                                              │
│  Risiko kritis:                                              │
│  - Ban permanen nomor WhatsApp                               │
│  - Zero SLA — bisa berhenti kapan saja                       │
│  - Melanggar ToS WhatsApp (risiko hukum)                     │
│  - Protokol berubah → library rusak → pesan tidak terkirim   │
│  - Maintenance burden tidak sebanding dengan "gratis"         │
│                                                              │
│  "Gratis" di awal, tapi biaya tersembunyi dalam              │
│  risiko operasional dan maintenance jauh lebih mahal.        │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Tabel Perbandingan Komprehensif

### 6.1 Perbandingan Fitur

| Fitur | Brevo (Email) | Fonnte Lite | Meta WA API | Baileys |
|---|:---:|:---:|:---:|:---:|
| **Biaya bulanan** | Rp 0 | Rp 25.000 | ~Rp 300.000+ | Rp 0 |
| **Biaya tahunan** | Rp 0 | Rp 250.000 | ~Rp 3.600.000+ | Rp 0 |
| **Kuota** | 300/hari | 1.000/bulan | Unlimited (bayar per pesan) | Unlimited (tapi risiko ban) |
| **Attachment/PDF** | ✅ Ya | ❌ Tidak (Lite) | ✅ Ya | ✅ Ya |
| **Delivery rate** | ⚠️ Sedang (email bisa spam) | ✅ Tinggi (WA) | ✅ Sangat tinggi | ⚠️ Tidak reliable |
| **Read rate** | ⚠️ Rendah (~20-30%) | ✅ Tinggi (~90%+) | ✅ Tinggi (~90%+) | ⚠️ Tidak terukur |
| **Risiko ban** | ❌ Tidak ada | ⚠️ Ada (unofficial) | ❌ Tidak ada | 🔴 Sangat tinggi |
| **SLA** | ✅ Ada | ❌ Tidak ada | ✅ Ada (enterprise) | ❌ Tidak ada |
| **Legal compliance** | ✅ Legal | ⚠️ Grey area | ✅ Legal | ❌ Melanggar ToS |
| **Setup effort** | 🟢 Mudah | 🟢 Mudah | 🔴 Sulit (verifikasi) | 🟡 Sedang |
| **Rich formatting** | ✅ HTML email | ❌ Teks saja (Lite) | ✅ Buttons, lists | ✅ Teks + media |
| **Webhook/tracking** | ✅ Ya | ⚠️ Terbatas | ✅ Ya | ❌ Tidak reliable |
| **Multi-property ready** | ✅ Ya | ✅ Ya | ✅ Ya | ⚠️ Satu nomor per instance |

### 6.2 Perbandingan Risiko

| Risiko | Brevo | Fonnte Lite | Meta WA API | Baileys |
|---|:---:|:---:|:---:|:---:|
| Ban akun/nomor | ❌ | ⚠️ Mungkin | ❌ | 🔴 Hampir pasti |
| Layanan berhenti mendadak | ❌ | ⚠️ Mungkin | ❌ | 🔴 Sangat mungkin |
| Biaya membengkak | ❌ | ❌ | 🔴 Ya | ❌ |
| Pesan tidak sampai | ⚠️ Spam folder | ⚠️ Mungkin | ❌ | 🔴 Sering |
| Masalah hukum | ❌ | ⚠️ Grey area | ❌ | 🔴 Mungkin |

---

## 7. Strategi Penghematan Kuota & Rate Limit

### 7.1 Strategi untuk Brevo (300 email/hari)

| # | Strategi | Penjelasan | Estimasi Penghematan |
|---|---|---|---|
| S-BRV-01 | **Batch spreading (distribusi pengiriman)** | Jangan kirim 116 invoice sekaligus dalam satu hari. Bagi menjadi 3-4 batch: Batch A (kamar 1-40) hari ke-1, Batch B (41-80) hari ke-2, dst. | Menghindari spike >300/hari |
| S-BRV-02 | **Digest/ringkasan harian** | Gabungkan beberapa notifikasi untuk satu penghuni menjadi satu email digest per hari. Contoh: invoice + pengingat + update complaint = 1 email, bukan 3. | Hemat 40-60% kuota |
| S-BRV-03 | **In-app notification sebagai kanal primer** | Gunakan PWA push notification atau in-app notification untuk notifikasi ringan (complaint update, vehicle approval). Email hanya untuk yang penting (invoice, overdue). | Hemat 50-70% email |
| S-BRV-04 | **Smart deduplication** | Jika penghuni sudah membuka in-app notification, jangan kirim email duplikat. Track status `read` di notification engine. | Hemat 20-30% email |
| S-BRV-05 | **Scheduling engine** | Gunakan queue (Redis/Bull) untuk menjadwalkan pengiriman email secara merata sepanjang hari, bukan burst sekaligus. | Meratakan beban harian |
| S-BRV-06 | **Notification preference per penghuni** | Biarkan penghuni memilih kanal preferensi (email, in-app, atau keduanya). Tidak semua penghuni perlu email. | Hemat 30-50% email |

**Arsitektur Spreading**:

```
Hari ke-1 bulan:  Invoice batch A (kamar 1-40)   = 40 email
Hari ke-2 bulan:  Invoice batch B (kamar 41-80)  = 40 email
Hari ke-3 bulan:  Invoice batch C (kamar 81-116) = 36 email
Hari ke-4+:       On-demand notifications         = ~10-15/hari

Total per hari: MAX ~55 email ✅ (jauh di bawah 300)
```

### 7.2 Strategi untuk Fonnte Lite (1.000 pesan/bulan)

| # | Strategi | Penjelasan | Estimasi Penghematan |
|---|---|---|---|
| S-FNT-01 | **Prioritaskan pesan kritis saja** | Hanya kirim WA untuk: invoice reminder dan overdue warning. Complaint update, vehicle approval, pengumuman → in-app saja. | Hemat 60-70% kuota |
| S-FNT-02 | **Hindari broadcast pengumuman via WA** | Satu pengumuman ke 116 penghuni = 116 pesan. 4 pengumuman/bulan = 464 pesan (hampir setengah kuota habis). Pengumuman harus via in-app notification. | Hemat 400-500 pesan/bulan |
| S-FNT-03 | **Gabung reminder + overdue menjadi satu pesan** | Jangan kirim reminder terpisah lalu overdue terpisah. Kirim satu pesan final jika sudah overdue. | Hemat 50-100 pesan/bulan |
| S-FNT-04 | **Conditional sending** | Hanya kirim WA jika penghuni belum membayar setelah H+3 dari due date. Penghuni yang sudah bayar tidak perlu reminder. | Hemat 70-80% reminder |
| S-FNT-05 | **Opt-in WA notification** | Tanyakan ke penghuni apakah ingin notifikasi WA atau cukup in-app. Kurangi penerima yang tidak aktif. | Hemat 20-40% |

**Budget Kuota Fonnte Lite yang Disarankan**:

```
Alokasi 1.000 pesan/bulan:
  - Invoice reminder (hanya overdue): ~30 pesan   (25% penghuni)
  - H+3 overdue warning:              ~20 pesan   (penghuni yang masih belum bayar)
  - Complaint critical update:         ~10 pesan   (hanya eskalasi/urgent)
  - RESERVED buffer:                   ~940 pesan

Dengan strategi ketat, Fonnte Lite BISA cukup —
tapi hanya jika WA digunakan SANGAT SELEKTIF.
```

### 7.3 Strategi Umum (Berlaku Semua Opsi)

| # | Strategi | Penjelasan |
|---|---|---|
| S-ALL-01 | **In-app notification sebagai kanal utama** | PWA sudah mendukung push notification. Jadikan ini kanal primer. Email/WA hanya untuk fallback atau pesan kritis. |
| S-ALL-02 | **Notification queue dengan rate limiter** | Implementasikan queue (Bull/Redis) dengan rate limiter yang menahan pengiriman agar tidak burst melebihi kuota. |
| S-ALL-03 | **Notification log dan deduplication** | Catat setiap notifikasi yang dikirim. Jangan kirim duplikat ke kanal yang sama dalam window 24 jam. |
| S-ALL-04 | **Tiered notification policy** | Definisikan tier: Tier 1 (in-app only), Tier 2 (in-app + email), Tier 3 (in-app + email + WA). Hanya pesan kritis yang masuk Tier 3. |
| S-ALL-05 | **Monitoring dashboard kuota** | Buat dashboard sederhana yang menampilkan: kuota terpakai hari ini, kuota tersisa bulan ini, projected usage. Alert admin jika mendekati limit. |

---

## 8. Simulasi Penggunaan Bulanan

### 8.1 Skenario: 116 Kamar Aktif, Operasional Normal

| Tipe Notifikasi | Frekuensi | Volume/Bulan | Tier |
|---|---|---|---|
| Invoice tagihan terbit | 1×/bulan | 116 | Tier 2 (in-app + email) |
| Pengingat jatuh tempo (H-3) | 1×/bulan | 116 | Tier 2 |
| Overdue warning (H+3) | 1×/bulan | ~30 (25%) | Tier 3 (in-app + email + WA) |
| Complaint status update | On-demand | ~60 | Tier 1 (in-app only) |
| Vehicle approval | On-demand | ~30 | Tier 1 (in-app only) |
| Pengumuman | 4×/bulan | ~464 | Tier 1 (in-app only) |
| Payment confirmation | On-demand | ~116 | Tier 2 |

### 8.2 Konsumsi per Kanal dengan Tiered Policy

| Kanal | Tier 1 | Tier 2 | Tier 3 | Total/Bulan |
|---|---|---|---|---|
| **In-app notification** | 554 | 348 | 30 | **932 notifikasi** |
| **Email (Brevo)** | 0 | 348 | 30 | **378 email** |
| **WA (jika dipakai)** | 0 | 0 | 30 | **30 pesan** |

### 8.3 Evaluasi Kuota

| Kanal | Kuota | Konsumsi | Sisa | Status |
|---|---|---|---|---|
| **Brevo** | 300/hari = ~9.000/bulan | 378/bulan ≈ 13/hari | 287/hari | ✅ **Sangat aman** |
| **Fonnte Lite** | 1.000/bulan | 30/bulan | 970 | ✅ **Sangat aman** (jika hanya Tier 3) |
| **Meta WA API** | Unlimited | 30 × Rp 350 | Rp 10.500/bulan | ✅ **Murah** (jika hanya Tier 3) |

> **Insight**: Dengan menerapkan **tiered notification policy**, semua opsi menjadi layak secara kuota. Kunci utamanya adalah **in-app notification sebagai kanal primer**.

---

## 9. Rekomendasi Arsitektur

### 9.1 Arsitektur Notification Engine yang Direkomendasikan

```
┌─────────────────────────────────────────────────────────────────┐
│                    NOTIFICATION ENGINE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Domain Event]                                                 │
│       │                                                         │
│       ▼                                                         │
│  ┌──────────────────┐                                           │
│  │ Notification      │                                           │
│  │ Dispatcher        │─── Tentukan tier berdasarkan event type   │
│  └──────┬───────────┘                                           │
│         │                                                       │
│         ├── Tier 1 ──▶ [In-App Notification] (selalu)           │
│         │                                                       │
│         ├── Tier 2 ──▶ [In-App] + [Email Queue] ──▶ Brevo API  │
│         │                                                       │
│         └── Tier 3 ──▶ [In-App] + [Email Queue] + [WA Queue]   │
│                              │                        │         │
│                              ▼                        ▼         │
│                         ┌─────────┐           ┌───────────┐     │
│                         │ Brevo   │           │ Fonnte /  │     │
│                         │ (Email) │           │ Meta WA   │     │
│                         └─────────┘           └───────────┘     │
│                                                                 │
│  ┌──────────────────────────────────────────┐                   │
│  │ Rate Limiter (Redis)                      │                   │
│  │ - Brevo: max 290/hari (safety margin 10) │                   │
│  │ - Fonnte: max 30/hari (budget bulanan)   │                   │
│  │ - Queue overflow → retry next day        │                   │
│  └──────────────────────────────────────────┘                   │
│                                                                 │
│  ┌──────────────────────────────────────────┐                   │
│  │ Notification Log (PostgreSQL)             │                   │
│  │ - Deduplication check                    │                   │
│  │ - Delivery status tracking               │                   │
│  │ - Kuota monitoring                       │                   │
│  └──────────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Tier Classification

| Event | Tier | Alasan |
|---|---|---|
| Invoice terbit | Tier 2 (in-app + email) | Penting, tapi tidak urgent; email cukup |
| Pengingat jatuh tempo | Tier 2 (in-app + email) | Penting, perlu written record |
| **Overdue warning** | **Tier 3** (in-app + email + WA) | Kritis — harus sampai ke penghuni |
| Complaint update | Tier 1 (in-app only) | Informatif; penghuni bisa cek di app |
| Vehicle approval | Tier 1 (in-app only) | Informatif |
| Pengumuman | Tier 1 (in-app only) | Broadcast — terlalu mahal via email/WA |
| Payment confirmation | Tier 2 (in-app + email) | Record keeping |
| **Smart Lock restriction** | **Tier 3** | Sangat kritis — akses kamar terpengaruh |
| Security alert | Tier 2 (in-app + email) | Penting untuk admin |

---

## 10. Kesimpulan & Rekomendasi Akhir

### 10.1 Rekomendasi Utama

```
┌──────────────────────────────────────────────────────────────────┐
│                   REKOMENDASI FINAL                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ✅ KANAL PRIMER: In-App Notification (PWA Push)                 │
│     → Gratis, unlimited, real-time                               │
│                                                                  │
│  ✅ KANAL SEKUNDER: Brevo Email (Gratis)                         │
│     → Invoice PDF, payment receipt, record keeping               │
│     → 300/hari lebih dari cukup                                  │
│                                                                  │
│  ⚠️ KANAL TERSIER (OPSIONAL): Fonnte Lite                       │
│     → HANYA untuk overdue warning dan pesan kritis               │
│     → Rp 25.000/bulan — terjangkau                               │
│     → Limitasi: tanpa attachment (teks saja)                     │
│                                                                  │
│  ❌ Meta WA API: Terlalu mahal dan effort verifikasi tinggi      │
│     → Pertimbangkan jika bisnis scale ke 500+ kamar              │
│                                                                  │
│  ⛔ Baileys: DILARANG untuk production                           │
│     → Risiko ban, zero SLA, melanggar ToS                        │
│                                                                  │
│  ESTIMASI BIAYA BULANAN TOTAL:                                   │
│  → Brevo only: Rp 0/bulan                                       │
│  → Brevo + Fonnte Lite: Rp 25.000/bulan                         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 10.2 Roadmap Implementasi Notifikasi

| Phase | Kanal | Biaya | Scope |
|---|---|---|---|
| **Phase 1** (sekarang) | In-app notification + Brevo email | Rp 0/bulan | Invoice, reminder, complaint, vehicle |
| **Phase 2** (opsional) | + Fonnte Lite (WA teks) | + Rp 25.000/bulan | Overdue warning saja |
| **Phase 3** (scale-up) | Evaluasi Meta WA API | + Rp 300.000+/bulan | Jika occupancy >80% dan revenue justify biaya |

### 10.3 Catatan untuk Pimpinan Proyek

1. **Brevo gratis sudah lebih dari cukup** untuk skala 116 kamar. Dengan strategi batch spreading, penggunaan harian rata-rata hanya ~13 email — jauh dari limit 300/hari.

2. **Fonnte Lite adalah tambahan opsional** yang murah (Rp 25.000/bulan) untuk pesan WhatsApp kritis, **namun tidak bisa mengirim attachment/PDF**. Penghuni hanya menerima teks berisi link untuk mengunduh invoice di portal web.

3. **Meta WhatsApp Business API tidak disarankan untuk saat ini** karena biaya ~Rp 300.000+/bulan tidak sebanding dengan skala operasional, dan proses verifikasi Meta memerlukan effort administratif yang tinggi.

4. **Baileys tidak boleh digunakan untuk production dalam kondisi apapun** karena risiko ban nomor, zero SLA, dan pelanggaran Terms of Service WhatsApp.

5. **Kunci utama efisiensi** adalah menjadikan **in-app notification (PWA) sebagai kanal primer**. Email dan WhatsApp hanya digunakan sebagai fallback untuk pesan kritis yang harus sampai ke penghuni.
