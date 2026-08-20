---
name: KOSTATION
description: Pusat kendali hunian yang tenang, tegas, dan mudah dipindai.
colors:
  admin-background-light: "oklch(0.99 0.003 240)"
  admin-foreground-light: "oklch(0.2 0.03 250)"
  admin-card-light: "oklch(1 0 0)"
  admin-primary-light: "oklch(0.55 0.18 250)"
  admin-primary-soft-light: "oklch(0.95 0.04 250)"
  admin-muted-light: "oklch(0.96 0.008 250)"
  admin-muted-foreground-light: "oklch(0.5 0.02 250)"
  admin-border-light: "oklch(0.92 0.01 250)"
  admin-background-dark: "oklch(0.16 0.02 250)"
  admin-foreground-dark: "oklch(0.96 0.01 250)"
  admin-card-dark: "oklch(0.21 0.025 250)"
  admin-primary-dark: "oklch(0.7 0.16 250)"
  admin-primary-soft-dark: "oklch(0.28 0.06 250)"
  admin-muted-dark: "oklch(0.25 0.03 250)"
  admin-muted-foreground-dark: "oklch(0.7 0.02 250)"
  admin-border-dark: "oklch(1 0 0 / 10%)"
  penghuni-background-light: "oklch(0.985 0.005 240)"
  penghuni-primary-light: "oklch(0.58 0.18 255)"
  penghuni-primary-glow-light: "oklch(0.72 0.16 250)"
  penghuni-background-dark: "oklch(0.16 0.02 255)"
  penghuni-primary-dark: "oklch(0.7 0.17 250)"
  penghuni-primary-glow-dark: "oklch(0.78 0.15 245)"
  admin-destructive-light: "oklch(0.6 0.22 25)"
  admin-success-light: "oklch(0.65 0.16 160)"
  admin-warning-light: "oklch(0.78 0.15 75)"
typography:
  title:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  body:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.428571
  label:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.333333
rounded:
  admin-sm: "0.5rem"
  admin-md: "0.625rem"
  admin-lg: "0.75rem"
  admin-xl: "1rem"
  admin-2xl: "1.25rem"
  penghuni-lg: "1rem"
  penghuni-xl: "1.25rem"
  penghuni-2xl: "1.5rem"
  penghuni-3xl: "1.75rem"
spacing:
  compact: "0.5rem"
  control: "0.75rem"
  standard: "1rem"
  section: "1.5rem"
  spacious: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.admin-primary-light}"
    textColor: "{colors.admin-background-light}"
    typography: "{typography.body}"
    rounded: "{rounded.admin-md}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  button-outline:
    backgroundColor: "{colors.admin-background-light}"
    textColor: "{colors.admin-foreground-light}"
    typography: "{typography.body}"
    rounded: "{rounded.admin-md}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.admin-foreground-light}"
    typography: "{typography.body}"
    rounded: "{rounded.admin-md}"
    padding: "0.25rem 0.75rem"
    height: "2.25rem"
  card:
    backgroundColor: "{colors.admin-card-light}"
    textColor: "{colors.admin-foreground-light}"
    rounded: "{rounded.admin-xl}"
    padding: "1.5rem"
  badge:
    backgroundColor: "{colors.admin-primary-light}"
    textColor: "{colors.admin-background-light}"
    typography: "{typography.label}"
    rounded: "{rounded.admin-md}"
    padding: "0.125rem 0.625rem"
---

# Design System: KOSTATION

## Overview

**Creative North Star: “Pusat Kendali Hunian”**

“Pusat Kendali Hunian” memperlakukan setiap layar operasional sebagai permukaan kendali yang tenang: informasi cukup padat untuk kerja harian, tetapi hierarki, jarak, dan penekanan yang restrained membuatnya mudah dipindai. Permukaan tonal dan border terukur membawa struktur; shadow bersifat sekunder dan tidak dekoratif.

Shared core memakai role warna semantic light/dark, kontrol ringkas, focus state yang jelas, dan layout responsif yang wrap sebelum overflow. Admin mengutamakan tabel property-wide dan kepadatan navigasi, Penghuni memakai shell mobile sempit dengan radius, gradient, dan elevation yang sedikit lebih lunak, sedangkan Property Owner memakai shell visual setara Admin dengan registry navigasi yang khusus, terbatas, dan read-only.

**Key Characteristics:**

- Tenang, tegas, informatif, dan profesional.
- Kepadatan operasional yang nyaman dengan hierarki eksplisit.
- Tonal layering, border terukur, dan shadow minimal.
- Komponen refined dan restrained yang mempertahankan implementasi incumbent.

### Role Profiles

- **Admin:** permukaan kendali property-wide dengan tindakan sesuai RBAC.
- **Property Owner:** bahasa visual, shell, ritme, dan primitive sama dengan Admin; hanya route dan proyeksi data yang sudah diizinkan untuk Owner yang boleh ada. Tidak ada mutasi tersembunyi, shortcut Admin, atau data yang disaring di frontend.
- **Penghuni:** shell mobile-first yang tetap memakai token semantic shared, dengan prioritas layanan mandiri.

**The Same Shell, Different Authority Rule.** Kesetaraan visual tidak berarti kesetaraan route, DTO, tindakan, atau data pribadi.

## Colors

Palet berbasis semantic roles biru sejuk dan neutral kebiruan, dengan state success, warning, dan destructive yang tetap terbaca pada light maupun dark mode. Nilai normative berada di frontmatter; implementasi harus memakai role, bukan mengunci warna mentah pada halaman.

### Primary

- **Operational Blue:** aksi utama, active navigation, focus ring, dan penanda prioritas.
- **Soft Operational Blue:** active navigation atau selected state yang membutuhkan penekanan tonal tanpa bidang solid.
- **Penghuni Blue Glow:** aksen Penghuni untuk gradient dan elevation ringan; bukan pengganti role primary shared.
- **Owner Operational Blue:** Property Owner memakai Operational Blue yang sama dengan Admin. Tidak ada palet Owner terpisah; perbedaannya adalah konteks read-only dan bukan warna baru.

### Neutral

- **Background dan Card:** pemisahan canvas dari surface dengan kontras tenang.
- **Foreground dan Muted Foreground:** hierarki teks utama, pendukung, label, dan metadata.
- **Border dan Input:** struktur tipis untuk tabel, card, field, header, dan pembagi.

### State

- **Informational, Success, Warning, Destructive, dan Neutral:** setiap status memakai label, ikon/cue, border atau surface semantic yang sesuai. Informasi/proses memakai biru, selesai/terkonfirmasi memakai hijau, perlu perhatian memakai kuning, gagal/dibatalkan memakai merah, dan status pasif memakai neutral.

### Named Rules

**The Semantic Surface Rule.** Gunakan role background, foreground, card, muted, border, dan state semantic agar light dan dark mode tetap ekuivalen.

## Typography

Sistem memakai sans-serif antarmuka yang mengutamakan keterbacaan dan dukungan platform. Penghuni menetapkan stack system sans secara eksplisit; Admin tidak mendeklarasikan keluarga terpisah dan mempertahankan sans stack incumbent.

### Hierarchy

- **Page Title:** semibold, rapat, dan ringkas; satu tingkat di atas isi operasional.
- **Section Title:** semibold dengan line-height pendek untuk card, dialog, dan kelompok data.
- **Body:** ukuran antarmuka standar dengan line-height nyaman untuk tabel, form, dan keterangan.
- **Label:** kecil tetapi semibold; uppercase dan tracking lebar hanya untuk heading navigasi atau metadata yang memang telah memakai pola tersebut.

Copy terlihat memakai Bahasa Indonesia dan terminology domain yang konsisten. Gunakan “Penghuni” pada UI; jangan menampilkan identifier internal sebagai label.

## Layout

Admin memakai app shell full-width dengan sidebar desktop tetap, header sticky, content padding responsif, dan bottom navigation pada viewport di bawah breakpoint desktop. Header menumpuk title dan action row pada mobile, lalu kembali horizontal mulai `sm`. Tabel boleh scroll di container-nya, tetapi halaman tidak boleh overflow horizontal.

Penghuni memakai shell mobile-first dengan lebar maksimum `28rem`, bottom navigation tetap, safe-area inset, dan public catalog yang dapat melebar sampai `72rem`. Breakpoint incumbent yang aktif adalah `sm` (`640px`), `md` (`768px`), dan `lg` (`1024px`).

Property Owner memakai shell desktop dan header responsif Admin, tetapi sidebar, bottom navigation, breadcrumb, dan tombol notifikasi hanya boleh membaca registry route Owner yang diizinkan. Pada mobile, tampilkan maksimal empat navigasi prioritas dan satu affordance “Lainnya”; jangan membuat horizontal menu tab sebagai pengganti route.

Gunakan ritme berbasis 0.25rem dengan langkah yang berulang pada frontmatter. Kelompokkan kontrol rapat; gunakan jarak section yang lebih besar untuk memisahkan konteks. Grid dan action row harus wrap atau stack saat ruang berkurang. Targetnya adalah comfortable density, scanability, dan `scrollWidth <= clientWidth`.

### Named Rules

**The Wrap Before Overflow Rule.** Pada layar sempit, stack atau wrap kontrol dan pertahankan content di dalam viewport; jangan sembunyikan operasi penting hanya agar layout muat.

## Elevation & Depth

Admin mengandalkan tonal layering, border, sticky surfaces dengan backdrop blur, dan shadow ringan pada button, card, menu, dialog, atau sheet. Penghuni menambahkan gradient primary/card dan tiga shadow token untuk surface mobile yang lebih lunak. Depth harus membantu memahami layer atau interaksi, bukan menjadi ornamen.

### Shadow Vocabulary

- **Control Shadow:** shadow kecil pada button, input, badge, dan outline control untuk memisahkan dari canvas.
- **Floating Surface:** shadow medium atau large pada dropdown, dialog, sheet, dan bottom navigation.
- **Penghuni Soft/Card/Glow:** shadow token khusus Penghuni untuk card dan active mobile navigation.

### Named Rules

**The Restrained Depth Rule.** Gunakan border dan kontras tonal lebih dahulu; simpan shadow untuk kontrol, floating surface, dan feedback interaksi terbatas.

## Shapes

Admin dan Property Owner berakar pada radius `0.75rem` dengan turunan dari `0.5rem` sampai `1.25rem`. Penghuni berakar pada radius `1rem` dan dapat mencapai `1.75rem` untuk surface yang lebih lunak. Button dan field memakai radius medium; card memakai radius lebih besar; pill hanya untuk filter, compact status, atau affordance yang memang berbentuk capsule.

Border satu lapis memisahkan surface dan field. Jangan menambah radius baru atau mengubah seluruh silhouette untuk satu halaman. Dialog dan sheet mempertahankan containment yang jelas serta tidak boleh dipotong viewport.

## Components

Shared Admin/Property Owner/Penghuni primitives memakai variant dan state yang sejalan; perbedaan visual utama berasal dari token app dan perbedaan authority berasal dari route registry serta backend projection, bukan fork perilaku UI.

### Buttons

- **Primary:** tinggi `2.25rem`, padding horizontal `1rem`, teks medium, primary surface, dan kontras foreground semantic.
- **Outline/Secondary/Ghost:** mempertahankan hierarchy melalui border atau tonal background; ghost tidak menambah surface saat idle.
- **Hover/Focus/Disabled:** perubahan warna halus, focus-visible ring, disabled opacity, dan cursor yang sesuai. Icon button tetap mempunyai accessible name.
- **Owner actions:** aksi navigasi/read-only seperti `Lihat detail`, `Lihat laporan`, atau `Unduh export` memakai primary atau outline sesuai hierarchy. `Reset filter` memakai outline/secondary dengan ikon reset—bukan destructive merah—karena tidak menghapus data.

### Inputs and Selects

- Tinggi standar `2.25rem`, border input semantic, radius medium, dan padding horizontal `0.75rem`.
- Field harus mempunyai label terlihat, placeholder bukan pengganti label, error inline terkait, dan focus-visible ring.
- Dialog atau sheet harus memindahkan focus secara aman dan mengembalikannya ketika ditutup.
- **Search and date:** gunakan search field dengan ikon dan clear affordance ketika perlu; gunakan date/month picker bersama yang berbahasa Indonesia, label terlihat, helper text, batas tanggal, serta format tampilan konsisten. Native input polos tidak boleh menjadi variasi halaman Owner.

### Cards and Tables

- Card memakai card surface, border, radius besar, dan shadow ringan; internal padding umumnya `1.5rem`.
- Tabel memakai header muted, divider horizontal, hover tonal, cell padding ringkas, dan horizontal scroll hanya di wrapper tabel.
- Pada mobile, data kompleks boleh berubah menjadi card bila struktur dan action tetap dapat dipahami.
- **Owner summary cards:** tampilkan satu fakta utama, konteks periode/scope, status semantic, dan link read-only yang jelas. Border harus tetap terlihat pada light mode; card bukan wadah untuk menumpuk card lain tanpa kebutuhan informasi.

### Badges and Status

- Badge ringkas memakai label eksplisit, border atau surface semantic, dan teks semibold.
- Status selalu menyertakan teks atau cue nonwarna. Jangan merender raw enum tanpa copy operasional yang dipahami pengguna.
- **Domain mapping:** status aset/hunian, pembayaran, entitlement, settlement, payout, komplain, maintenance, dan notifikasi memakai mapping semantic bersama. Jangan menggabungkan `dibayar`, `diakui`, `settled`, dan `dibayarkan` menjadi satu badge hanya karena semuanya bernuansa sukses.

### Navigation

- Admin sidebar mengelompokkan route berdasarkan konteks, memakai active tonal background plus bar indikator, dan scrollbar tipis yang theme-aware.
- Admin mobile menampilkan empat route prioritas dan sheet “Lainnya”; Penghuni memakai lima item bottom navigation.
- Active state harus terbaca tanpa bergantung pada warna saja, dan seluruh menu tetap keyboard-accessible serta dapat discroll.
- **Property Owner navigation:** gunakan registry allowlist khusus: Dashboard, Aset Saya, Hunian & Penyewaan, Pembayaran & Pendapatan, Komplain & Maintenance, Laporan, Notifikasi, dan Profil Akun. Registry Admin tidak boleh difilter di client untuk membentuk navigasi Owner.

### Dialogs and Sheets

- Overlay gelap memisahkan konteks; content memakai background semantic, border, radius responsif, padding `1.5rem`, dan shadow floating.
- Footer stack pada mobile lalu kembali horizontal mulai `sm`.
- Title, description, close control, validation, pending state, dan consequence copy harus tetap jelas tanpa opaque ID.

## Do's and Don'ts

### Do:

- **Do** pertahankan role semantic light/dark dan focus-visible state yang terbaca.
- **Do** jaga informasi operasional padat tetapi terkelompok, berlabel, dan mudah dipindai.
- **Do** dampingi setiap warna status dengan teks, ikon, atau cue eksplisit lain.
- **Do** jauhkan opaque identifier, rahasia autentikasi, dan metadata privat dari UI yang dirender.
- **Do** beri setiap form control label terlihat, validasi inline, dan focus management yang disengaja.
- **Do** tampilkan fakta Owner melalui proyeksi backend yang property-scoped dan period-bound; gunakan loading, empty, historical, unavailable, no-result, dan retry state yang eksplisit.

### Don't:

- **Don't** redesign sistem incumbent atau memperkenalkan palette, font, radius, atau bahasa komponen yang tidak terkait.
- **Don't** bergantung pada warna saja untuk menyampaikan status, sukses, peringatan, atau kegagalan.
- **Don't** biarkan tabel, header, dialog, atau action row membuat horizontal page overflow.
- **Don't** promosikan keputusan layout khusus satu halaman menjadi aturan desain global.
- **Don't** gunakan shadow berat atau efek dekoratif sebagai pengganti hierarki.
- **Don't** memakai DTO Admin, route Admin, data mock, atau join di browser untuk membentuk tampilan Owner.
- **Don't** memakai merah/destructive untuk reset filter atau tindakan non-destruktif lain.
- **Don't** menjadikan detail penghuni Admin sebagai halaman Owner; proyeksi Owner hanya menampilkan identitas penghuni yang aman bila relevan terhadap hunian aset.
