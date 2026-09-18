# ADR 0004: Denda keterlambatan check-out menggantikan kebijakan pemberitahuan untuk proses baru

- Status: Accepted
- Date: 2026-09-18

## Context

Alur 14 hari pemberitahuan dan kompensasinya sulit diterapkan oleh Admin pada
operasi kost. Yang perlu dikendalikan di lapangan adalah apakah kamar dan akses
sudah diserahkan setelah kontrak berakhir, bukan kapan penghuni menyampaikan
rencana keluar.

## Decision

1. Setiap command check-out baru memakai `late_checkout_penalty_v1`.
2. Hari terakhir hunian kontraktual adalah satu hari sebelum `planned_lease_end`.
3. Penghuni memperoleh masa toleransi tiga hari kalender untuk mengosongkan
   kamar dan mengembalikan akses tanpa denda.
4. Pada serah-terima fisik, sistem menghitung denda dari tanggal aktual,
   snapshot tarif harian `round(tarif bulanan / 30)`, dan batas paling banyak
   30 hari denda.
5. Denda memakai kredit sewa yang masih tersedia terlebih dahulu. Sisa yang
   belum tertutup menjadi komponen tagihan akhir tersendiri; deposit tidak
   dipakai otomatis.
6. Denda yang benar-benar teralokasi pada invoice akhir menjadi hak Owner 100%
   dan tidak membentuk management fee tambahan. Kerusakan tetap bukan pendapatan
   sewa maupun pendapatan Owner.
7. Command dan dokumen lama tetap memakai snapshot kompensasi pemberitahuan
   yang telah disimpan. Tidak ada backfill atau penulisan ulang sejarah.

## Consequences

- UI baru memakai istilah rencana check-out, masa toleransi, batas tanpa denda,
  denda per hari, dan denda final.
- Handover tetap menjadi satu-satunya titik yang mengesahkan tanggal aktual;
  membuat rencana tidak langsung memunculkan tagihan denda.
- Invoice akhir, riwayat, dokumen resmi, dan pengakuan Owner menggunakan
  snapshot denda yang sama.
