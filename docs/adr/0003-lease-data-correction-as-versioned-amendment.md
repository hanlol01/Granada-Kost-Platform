# ADR 0003: Koreksi data penyewaan sebagai amendment berversi

- Status: Accepted
- Date: 2026-09-15

## Context

ADR 0001 menetapkan snapshot komersial kontrak sebagai immutable. Aturan itu mencegah perubahan harga diam-diam, tetapi belum menyediakan jalur untuk memperbaiki salah input tanggal check-in, tanggal mulai, atau durasi setelah kontrak dibuat.

Mengubah baris kontrak tanpa bukti perubahan akan merusak audit. Melarang seluruh koreksi juga membuat data operasional dan laporan terus memakai fakta yang diketahui salah.

## Decision

Koreksi Data Penyewaan adalah amendment Admin yang append-only.

1. Sistem menyimpan snapshot sebelum dan sesudah, alasan, Admin pencatat, waktu, dan kunci idempotensi.
2. Nilai efektif pada `leases` boleh diperbarui hanya oleh command koreksi transaksional setelah amendment tersimpan.
3. Invoice, pembayaran, pengakuan pendapatan, dan dokumen lama tidak dihapus atau ditulis ulang.
4. Penurunan Nilai Kontrak dicatat sebagai Kredit Koreksi Kontrak pada invoice sewa yang masih menjadi otoritas kontrak.
5. Kenaikan Nilai Kontrak dicatat sebagai Tagihan Koreksi Kontrak baru.
6. Jadwal checkpoint baru diterbitkan sebagai snapshot baru. Snapshot lama tetap immutable dan settlement menunjuk snapshot terbaru.
7. Dokumen pelunasan lama yang tidak lagi cocok ditandai tidak berlaku melalui mekanisme invalidasi yang sudah ada.
8. Koreksi diblokir ketika check-out sedang berjalan, check-out sudah selesai, tanggal akhir hasil koreksi sudah lewat, atau periode baru bertabrakan dengan kontrak kamar lain.
9. Tanggal mulai kontrak yang sudah check-in tidak boleh melewati tanggal check-in aktual.

ADR ini tidak mengizinkan negosiasi ulang terselubung. Bila tier durasi berubah, Admin harus memilih Tarif Acuan baru atau mempertahankan tarif lama sebagai Tarif Kesepakatan dengan alasan eksplisit.

## Consequences

- Laporan membaca nilai kontrak efektif terbaru tanpa kehilangan riwayat asal.
- Pembayaran terverifikasi tidak dibuat ulang.
- Kelebihan pembayaran menjadi saldo kredit atau calon pengembalian dana, bukan otomatis dianggap telah ditransfer.
- Koreksi yang memengaruhi periode layanan tetap terlihat oleh laporan Property Owner sebagai amendment yang dapat diaudit.
- Operasi memerlukan endpoint preview dan commit terpisah agar Admin melihat dampak sebelum menyimpan.
