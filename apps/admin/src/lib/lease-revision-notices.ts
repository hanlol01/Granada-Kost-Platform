/** Reviewed operational copy only. Never render raw SQL, identifiers or API payloads. */
type Notice = { title: string; description: string };
const notices: Record<string, Notice> = {};
function assign(codes: string[], title: string, description: string) {
  for (const code of codes) notices[code] = { title, description };
}
assign(
  [
    "LEASE_REVISION_CONTEXT_INVALID",
    "LEASE_REVISION_FACTS_INVALID",
    "LEASE_MODE_CORRECTION_FACTS_INVALID",
    "LEASE_SPONSORSHIP_FACTS_INVALID",
    "LEASE_ROOM_CORRECTION_AUTHORITY_INVALID",
  ],
  "Data penyewaan belum dapat ditinjau",
  "Hubungan data penyewaan belum lengkap atau tidak sesuai. Perbarui data dan buka ulang koreksi. Jika masih gagal, hubungi Pihak Pengelola; jangan mengubah jenis hunian atau membatalkan penyewaan dahulu.",
);
assign(
  ["LEASE_REVISION_SCOPE_CHANGED"],
  "Penyewaan atau properti telah berubah",
  "Kembali ke detail penghuni pada properti yang benar, lalu buka ulang koreksi. Tinjauan dari penyewaan lain tidak dapat digunakan.",
);
assign(
  ["LEASE_REVISION_PREVIEW_INVALID"],
  "Tinjauan koreksi belum lengkap",
  "Jangan simpan perubahan. Perbarui data lalu tinjau ulang agar tanggal, kamar dan nominal dapat diperiksa bersama.",
);
assign(
  ["LEASE_REVISION_COMMIT_RESPONSE_INVALID"],
  "Hasil penyimpanan belum dapat dipastikan",
  "Periksa riwayat koreksi atau coba ulang tanpa mengubah isian. Jangan membuat pengajuan baru terlebih dahulu; percobaan ulang menggunakan pengajuan yang sama.",
);
assign(
  [
    "LEASE_REVISION_FORBIDDEN",
    "LEASE_DATA_CORRECTION_FORBIDDEN",
    "LEASE_CORRECTION_HISTORY_FORBIDDEN",
  ],
  "Koreksi hanya tersedia bagi Admin properti",
  "Gunakan akun Admin yang memiliki izin mengelola penyewaan pada properti ini. Hubungi Pihak Pengelola bila izin belum sesuai.",
);
assign(
  ["LEASE_REVISION_STATUS_INVALID", "LEASE_DATA_CORRECTION_STATUS_INVALID"],
  "Penyewaan tidak lagi dapat dikoreksi",
  "Tinjau riwayat atau arsip penyewaan. Penyewaan yang sudah berakhir tidak dapat diubah menjadi penyewaan baru; buat penyewaan baru bila penghuni kembali.",
);
assign(
  ["LEASE_REVISION_CHECKOUT_BLOCKED", "LEASE_DATA_CORRECTION_CHECKOUT_BLOCKED"],
  "Penyewaan memiliki proses check-out",
  "Selesaikan atau batalkan check-out yang masih berjalan melalui alurnya sebelum mengoreksi. Jika check-out sudah selesai, pertahankan riwayat dan tinjau penyelesaian keuangannya.",
);
assign(
  ["LEASE_REVISION_SUCCESSOR_PENDING"],
  "Ada rencana pindah kamar atau perpanjangan",
  "Tinjau rencana yang masih berjalan. Batalkan rencana yang keliru melalui alurnya sebelum mengoreksi penyewaan asal.",
);
assign(
  ["LEASE_REVISION_OWNER_REALIZATION_BLOCKED", "LEASE_REVISION_RECOGNIZED_INCOME_REVIEW_REQUIRED"],
  "Pendapatan atau realisasi Owner perlu ditinjau",
  "Penyewaan sudah terkait pendapatan atau realisasi Owner. Tinjau koreksi pendapatan/realisasi terlebih dahulu; dokumen terbit dan transaksi tidak dapat dialihkan diam-diam.",
);
assign(
  ["LEASE_REVISION_FINANCIAL_REVIEW_REQUIRED"],
  "Riwayat keuangan perlu diselesaikan terlebih dahulu",
  "Jenis hunian, Owner penanggung atau kebijakan biaya belum dapat diubah karena ada riwayat keuangan. Tinjau pembalikan dan penyelesaian pembayaran terlebih dahulu; termasuk catatan tertunda atau dibalik, bukan hanya pembayaran lunas.",
);
assign(
  ["LEASE_CORRECTION_OWNER_IMPACT_INVALID"],
  "Dampak hak Owner belum dapat dihitung",
  "Jangan simpan koreksi dahulu. Periksa tarif kamar, biaya pengelolaan dan durasi sewa, lalu tinjau ulang. Hubungi Pihak Pengelola bila perhitungan masih belum tersedia; transfer yang sudah dicatat tidak berubah.",
);
assign(
  ["LEASE_DATA_CORRECTION_END_PASSED"],
  "Tanggal akhir hasil koreksi sudah berlalu",
  "Tinjau tanggal check-in dan durasi yang benar. Gunakan check-out bila hunian memang sudah berakhir, bukan koreksi untuk menyembunyikan kejadian hunian.",
);
assign(
  ["LEASE_DATA_CORRECTION_START_AFTER_CHECK_IN"],
  "Tanggal mulai melewati check-in aktual",
  "Periode sewa mengikuti tanggal check-in fisik. Periksa tanggal check-in yang benar lalu tinjau ulang koreksi tanggalnya.",
);
assign(
  ["LEASE_DATA_CORRECTION_CHECK_IN_NOT_RECORDED"],
  "Check-in belum pernah tercatat",
  "Koreksi tidak dapat membuat check-in baru. Pertahankan tanggal rencana; gunakan Aktifkan kamar & check-in ketika penghuni benar-benar menerima kamar.",
);
assign(
  ["LEASE_DATA_CORRECTION_CHECK_IN_FUTURE"],
  "Check-in aktual tidak boleh berada di masa depan",
  "Isi tanggal kejadian check-in yang sudah berlangsung. Gunakan tanggal rencana untuk kedatangan yang belum terjadi.",
);
assign(
  [
    "LEASE_MODE_CORRECTION_SEPARATE_CHECK_IN_REVIEW_REQUIRED",
    "LEASE_ROOM_CORRECTION_SEPARATE_CHECK_IN_REVIEW_REQUIRED",
  ],
  "Tanggal check-in perlu dikoreksi terlebih dahulu",
  "Perubahan tanggal check-in dan perubahan kamar atau jenis hunian perlu ditinjau terpisah. Simpan koreksi tanggal check-in yang benar dahulu, lalu buka kembali koreksi untuk meninjau perubahan berikutnya.",
);
assign(
  ["LEASE_MODE_CORRECTION_MODE_INVALID"],
  "Pilih jenis hunian yang sesuai",
  "Pilih Penyewaan Berbayar atau Hunian Tanggungan Owner, lengkapi ketentuannya, lalu tinjau kembali. Jenis hunian lain belum dapat digunakan untuk koreksi ini.",
);
assign(
  ["LEASE_MODE_CORRECTION_SCHEDULE_REVIEW_REQUIRED"],
  "Ketentuan tagihan perlu tinjauan terpisah",
  "Rencana pelunasan dan siklus tagihan pada koreksi ini hanya dapat dipilih saat mengubah jenis hunian menjadi Penyewaan Berbayar. Pertahankan ketentuan tagihan lama bila jenis hunian tidak berubah, lalu tinjau ulang.",
);
assign(
  ["LEASE_ROOM_CORRECTION_TARGET_REQUIRED"],
  "Kamar tujuan belum dipilih",
  "Pilih kamar yang benar sebelum menambahkan konfirmasi atau bukti koreksi kamar. Bila kamar semula sudah benar, pertahankan kamar tersebut dan lepaskan isian bukti koreksi kamar sebelum meninjau ulang.",
);
assign(
  [
    "LEASE_ROOM_CORRECTION_ROOM_UNAVAILABLE",
    "LEASE_ROOM_CORRECTION_ROOM_CONFLICT",
    "LEASE_DATA_CORRECTION_ROOM_CONFLICT",
  ],
  "Kamar tidak tersedia pada periode ini",
  "Kamar sudah memiliki hunian, penyewaan atau komitmen lain. Pilih kamar yang tersedia atau pertahankan kamar semula, lalu tinjau ulang.",
);
assign(
  ["LEASE_ROOM_CORRECTION_RECORDING_CONFIRMATION_REQUIRED"],
  "Jenis koreksi kamar perlu dikonfirmasi",
  "Konfirmasikan bahwa kamar pada pencatatan awal memang keliru. Jika penghuni benar-benar berpindah secara fisik, gunakan Pindah Kamar.",
);
assign(
  [
    "LEASE_ROOM_CORRECTION_EVIDENCE_REQUIRED",
    "LEASE_ROOM_CORRECTION_EVIDENCE_UNAVAILABLE",
    "LEASE_ROOM_CORRECTION_EVIDENCE_LIMIT",
  ],
  "Bukti koreksi kamar perlu diperiksa",
  "Untuk kamar yang sudah check-in, tambahkan bukti pencatatan awal yang keliru. Gunakan maksimal 5 berkas JPG, PNG, WebP atau PDF, masing-masing maksimal 5 MB; pilih ulang bukti yang tidak tersedia.",
);
assign(
  [
    "LEASE_ROOM_CORRECTION_SOURCE_REVIEW_REQUIRED",
    "LEASE_ROOM_CORRECTION_SOURCE_BINDING_INVALID",
    "LEASE_ROOM_CORRECTION_SOURCE_CONFLICT",
  ],
  "Hubungan kamar asal perlu diperiksa",
  "Kamar asal masih memiliki hubungan hunian atau komitmen yang tidak sesuai. Pertahankan data dahulu dan minta Pihak Pengelola meninjau pencatatannya sebelum mencoba lagi.",
);
assign(
  ["LEASE_ROOM_CORRECTION_ACCESS_REVIEW_REQUIRED"],
  "Akses kamar asal masih aktif",
  "Tinjau dan cabut akses smart lock melalui alur pengelolaan akses terlebih dahulu. Koreksi kamar tidak dapat mencabut atau memindahkan akses perangkat secara otomatis.",
);
assign(
  [
    "LEASE_ROOM_CORRECTION_SPONSOR_MISMATCH",
    "LEASE_ROOM_CORRECTION_SPONSOR_POLICY_REVIEW_REQUIRED",
    "LEASE_SPONSORSHIP_OWNER_SCOPE_INVALID",
  ],
  "Owner penanggung tidak sesuai dengan kamar",
  "Pilih Owner yang memiliki kamar tujuan. Tinjau kepemilikan aset dan kebijakan biaya pengelolaan; riwayat penanggung lama tidak boleh dialihkan bersama pembayaran yang sudah tercatat.",
);
assign(
  [
    "LEASE_ROOM_CORRECTION_STALE",
    "LEASE_ROOM_CORRECTION_OCCUPANCY_STALE",
    "LEASE_ROOM_CORRECTION_SOURCE_BINDING_STALE",
    "LEASE_ROOM_CORRECTION_ROOM_STALE",
    "LEASE_SPONSORSHIP_STALE",
    "LEASE_MODE_CORRECTION_STALE",
    "LEASE_SPONSORSHIP_COMMIT_REVIEW_REQUIRED",
  ],
  "Data berubah setelah ditinjau",
  "Muat data terbaru dan tinjau kembali sebelum menyimpan. Tidak ada perubahan sebagian yang boleh dianggap berhasil.",
);
assign(
  [
    "LEASE_SPONSORSHIP_OWNER_REQUIRED",
    "LEASE_SPONSORSHIP_FEE_MODE_REQUIRED",
    "LEASE_SPONSORSHIP_PAYER_REQUIRED",
    "LEASE_SPONSORSHIP_PAYER_NAME_REQUIRED",
    "LEASE_SPONSORSHIP_REASON_REQUIRED",
    "LEASE_SPONSORSHIP_WAIVED_PAYER_INVALID",
  ],
  "Ketentuan tanggungan Owner belum lengkap",
  "Periksa Owner penanggung, ketentuan dibebaskan/dikenakan biaya dan alasan tanggungan. Jika dikenakan biaya, pilih penanggung; penanggung lain wajib memiliki nama. Biaya dibebaskan tidak memerlukan penanggung pembayaran.",
);
assign(
  [
    "LEASE_SPONSORSHIP_MODE_REQUIRED",
    "LEASE_MODE_CORRECTION_SPONSORSHIP_NOT_APPLICABLE",
    "LEASE_DATA_CORRECTION_OWNER_SPONSORED_PRICING_IMMUTABLE",
  ],
  "Isian tidak sesuai dengan jenis hunian",
  "Tarif sewa berlaku untuk penyewaan berbayar. Hunian Tanggungan Owner tidak membentuk sewa dan memakai ketentuan biaya pengelolaan tersendiri. Periksa kembali jenis hunian dan isian terkait.",
);
assign(
  [
    "LEASE_SPONSORSHIP_FEE_POLICY_MISSING",
    "LEASE_DATA_CORRECTION_PRICING_MISSING",
    "LEASE_DATA_CORRECTION_COMMERCIAL_INVALID",
    "LEASE_MODE_CORRECTION_BILLING_REVIEW_REQUIRED",
  ],
  "Tarif atau ketentuan tagihan belum dapat dihitung",
  "Periksa tarif kamar, durasi dan ketentuan tagihan/biaya pengelolaan pada periode yang dipilih. Lengkapi referensi yang belum tersedia sebelum meninjau ulang; jangan memakai nominal perkiraan.",
);
assign(
  ["LEASE_DATA_CORRECTION_NO_CHANGES"],
  "Belum ada perubahan untuk disimpan",
  "Ubah pencatatan yang keliru terlebih dahulu. Jika data sudah benar, kembali ke detail penghuni tanpa membuat koreksi baru.",
);
assign(
  ["LEASE_DATA_CORRECTION_CREDIT_EXCEEDS_AUTHORITY"],
  "Kredit kontrak perlu penyelesaian terpisah",
  "Kredit hasil koreksi belum dapat diterapkan pada tagihan yang ada. Tinjau penyelesaian tagihan atau pengembalian melalui alur keuangan; pembayaran dan dokumen lama tetap dipertahankan.",
);
assign(
  ["LEASE_ARCHIVE_RESPONSE_INVALID", "LEASE_CANCELLATION_FACTS_INVALID", "LEASE_CANCELLATION_BINDINGS_INVALID"],
  "Hubungan penyewaan belum dapat dipastikan",
  "Kamar tidak dilepas. Perbarui tinjauan dan periksa catatan pemesanan, aktivasi serta penyewaan. Bila catatan masih tidak sesuai, minta Pihak Pengelola meninjau riwayat sebelum membatalkan.",
);
assign(
  ["LEASE_ARCHIVE_COMMIT_RESPONSE_INVALID"],
  "Hasil pembatalan belum dapat dipastikan",
  "Periksa arsip penyewaan atau coba ulang pengajuan yang sama tanpa mengubah isian. Jangan membuat pengajuan baru; sistem akan memeriksa hasil pembatalan sebelumnya terlebih dahulu.",
);
assign(
  ["LEASE_ARCHIVE_FORBIDDEN"],
  "Arsip hanya tersedia bagi Admin properti",
  "Gunakan akun Admin yang memiliki izin melihat atau mengelola penyewaan pada properti ini. Hubungi Pihak Pengelola bila izin belum sesuai.",
);
assign(
  ["LEASE_ARCHIVE_NOT_FOUND"],
  "Penyewaan atau arsip tidak ditemukan",
  "Kembali ke daftar pada properti yang benar lalu pilih data yang masih tersedia. Arsip dari properti lain tidak dapat dibuka atau dibatalkan.",
);
assign(
  ["LEASE_CANCELLATION_REVIEW_STALE"],
  "Data berubah setelah tinjauan pembatalan",
  "Tidak ada perubahan sebagian yang disimpan. Perbarui tinjauan lalu periksa kembali kamar, pemesanan dan transaksi sebelum membatalkan penyewaan.",
);
assign(
  ["LEASE_CANCELLATION_REASON_REQUIRED"],
  "Alasan pembatalan diperlukan",
  "Isi alasan 3–1.000 karakter yang menjelaskan kesalahan pencatatan. Alasan ini akan tersimpan bersama riwayat pembatalan.",
);
assign(
  ["LEASE_CANCELLATION_CONFIRMATION_REQUIRED"],
  "Konfirmasi pembatalan belum lengkap",
  "Baca akibat pembatalan lalu centang konfirmasi. Jika penyewaan sudah diaktivasi, konfirmasikan juga bahwa aktivasi keliru dan kamar belum pernah dihuni.",
);
assign(
  ["LEASE_CANCELLATION_ACTIVATION_CONFIRMATION_REQUIRED"],
  "Aktivasi sebelumnya perlu dikonfirmasikan",
  "Konfirmasikan terpisah bahwa aktivasi keliru dan penghuni belum pernah menerima atau menghuni kamar. Jika hunian benar-benar berlangsung, gunakan check-out, bukan pembatalan penyewaan.",
);
assign(
  ["LEASE_CANCELLATION_ROOM_CONFLICT"],
  "Kamar terkait penyewaan atau pemesanan lain",
  "Kamar tidak dilepas. Periksa hubungan hunian, pemesanan dan rencana pindah yang lain pada detail kamar sebelum meninjau pembatalan kembali.",
);
assign(
  ["LEASE_CANCELLATION_ACCESS_REVIEW_REQUIRED"],
  "Akses kunci penghuni masih aktif",
  "Cabut akses yang keliru melalui pengelolaan kunci sebelum membatalkan. Gunakan check-out bila penghuni benar-benar telah menerima atau menghuni kamar.",
);
assign(
  ["LEASE_CANCELLATION_REAL_OCCUPANCY"],
  "Kamar sudah pernah dihuni",
  "Gunakan Koreksi Data Penyewaan untuk pencatatan yang salah atau check-out bila hunian berakhir. Pembatalan tidak dapat menghapus kejadian hunian nyata.",
);
assign(
  ["INVOICE_NOT_VOIDABLE"],
  "Tagihan belum dapat dibatalkan",
  "Ada status atau aktivitas pembayaran yang perlu ditinjau. Tidak ada perubahan pembatalan disimpan; periksa riwayat tagihan dan penyelesaian keuangan lalu perbarui tinjauan.",
);
assign(["LEASE_ARCHIVE_RESTORE_RESPONSE_INVALID", "LEASE_ARCHIVE_RESTORE_FACTS_INVALID"],
  "Pemulihan belum dapat ditinjau", "Hubungan arsip belum lengkap. Perbarui data dan periksa riwayat penyewaan; jangan memulihkan atau membuat pengganti sebelum pemeriksaan selesai.");
assign(["LEASE_ARCHIVE_RESTORE_COMMIT_RESPONSE_INVALID"], "Hasil pemulihan belum dapat dipastikan",
  "Periksa riwayat arsip atau coba ulang pengajuan yang sama tanpa mengubah isian. Jangan mengirim pengajuan baru; percobaan ulang memakai kunci yang sama.");
assign(["LEASE_ARCHIVE_RESTORE_STATUS_INVALID", "LEASE_ARCHIVE_SUCCESSOR_SOURCE_STALE"], "Arsip sudah berubah",
  "Arsip mungkin sudah dipulihkan atau memiliki penyewaan pengganti. Buka riwayat terbaru dan penyewaan yang berlaku; jangan membuat pengganti kedua.");
assign(["LEASE_ARCHIVE_RESTORE_HISTORY_PROTECTED"], "Riwayat hunian atau realisasi perlu ditinjau",
  "Arsip terkait hunian nyata, pendapatan atau realisasi Owner. Tinjau penyelesaian terkait melalui alurnya dahulu; riwayat lama tidak dihidupkan atau dihapus ulang.");
assign(["LEASE_ARCHIVE_RESTORE_FINANCIAL_HISTORY"], "Arsip memiliki riwayat pembayaran",
  "Transaksi, bukti dan kewajiban lama tidak dihidupkan ulang. Siapkan penyewaan pengganti yang terhubung ke arsip; penyelesaian keuangan lama tetap ditinjau terpisah.");
assign(["LEASE_ARCHIVE_RESTORE_ROOM_CONFLICT"], "Kamar asal belum tersedia",
  "Kamar sudah digunakan, dipesan atau belum siap. Arsip tetap aman; pilih kamar tersedia melalui penyewaan pengganti.");
assign(["LEASE_ARCHIVE_RESTORE_RESIDENT_CONFLICT"], "Penghuni memiliki proses penyewaan lain",
  "Buka penyewaan atau proses hunian yang masih berlaku. Jangan memulihkan atau membuat dua penyewaan aktif untuk penghuni yang sama.");
assign(["LEASE_ARCHIVE_RESTORE_PERIOD_INVALID"], "Periode lama perlu diperbarui",
  "Periode lama sudah berakhir atau tidak sesuai catatan check-in. Tinjau periode yang benar melalui penyewaan pengganti; pemulihan tidak membuat check-in fisik.");
assign(["LEASE_ARCHIVE_RESTORE_BINDINGS_CHANGED"], "Pemesanan lama tidak dapat dipulihkan otomatis",
  "Hubungan komitmen, pemesanan atau aktivasi sudah berubah. Buat penyewaan pengganti dari arsip dan tinjau ketentuan baru; pemesanan lama tetap menjadi riwayat.");
assign(["LEASE_ARCHIVE_RESTORE_COMMERCIAL_REVIEW_REQUIRED"], "Tarif atau kepemilikan perlu ditinjau ulang",
  "Tarif, jenis hunian atau kepemilikan Owner tidak lagi cocok dengan arsip. Siapkan penyewaan pengganti dan tinjau ketentuan baru, bukan memaksakan ketentuan lama.");
assign(["LEASE_ARCHIVE_RESTORE_REVIEW_STALE"], "Data berubah setelah tinjauan pemulihan",
  "Tidak ada perubahan pemulihan disimpan. Perbarui data kamar dan arsip, lalu tinjau kembali sebelum menyimpan.");
assign(["LEASE_ARCHIVE_RESTORE_BILLING_INVALID"], "Otoritas tagihan pemulihan belum cocok",
  "Tidak ada tagihan baru yang disimpan. Muat tinjauan arsip terbaru dan periksa riwayat tagihan; pembayaran lama tidak dihidupkan ulang.");
assign(["LEASE_ARCHIVE_RESTORE_REASON_REQUIRED"], "Alasan pemulihan perlu dilengkapi",
  "Isi alasan pemulihan 3–1.000 karakter yang menjelaskan pembatalan sebelumnya keliru, lalu tinjau kembali.");
assign(["LEASE_ARCHIVE_RESTORE_CONFIRMATION_REQUIRED"], "Konfirmasi pemulihan belum lengkap",
  "Baca akibat pemulihan dan centang konfirmasi. Check-in fisik dan berkas yang telah dihapus permanen tidak dibuat ulang.");
assign(["LEASE_ARCHIVE_SUCCESSOR_INPUT_REQUIRED"], "Sumber penyewaan pengganti belum lengkap",
  "Buka dari arsip asal, pertahankan penghuni yang sama dan isi alasan pengganti 3–1.000 karakter. Tinjau kamar, periode dan ketentuan baru tanpa memakai pemesanan lama.");
assign(["LEASE_ARCHIVE_SUCCESSOR_IDENTITY_REQUIRED"], "Profil penghuni perlu dilengkapi",
  "Lengkapi nama, nomor WhatsApp Indonesia dan jenis kelamin pada detail penghuni, lalu buka ulang arsip. Penyewaan pengganti menggunakan profil yang sama, bukan membuat penghuni baru.");
assign(["LEASE_ARCHIVE_SUCCESSOR_SUBMISSION_UNCERTAIN"], "Hasil penyewaan pengganti belum dapat dipastikan",
  "Isian tetap dikunci. Coba ulang pengajuan awal dengan kunci yang sama atau periksa riwayat arsip. Jangan mengganti kamar, pembayaran atau ketentuan dan mengirim sebagai pengajuan baru sebelum hasilnya diketahui.");
assign(["LEASE_ARCHIVE_RESTORE_FILE_PURGE_UNRESOLVED"], "Penghapusan berkas belum selesai",
  "Selesaikan pemeriksaan berkas yang gagal atau belum dapat dipastikan melalui pengajuan di arsip sebelum memulihkan penyewaan. Berkas yang sudah dihapus tidak dapat dikembalikan.");
assign(["LEASE_FILE_PURGE_RESPONSE_INVALID", "LEASE_FILE_PURGE_FACTS_INVALID", "LEASE_FILE_PURGE_COVERAGE_UNVERIFIED", "LEASE_FILE_PURGE_OWNERSHIP_UNVERIFIED"],
  "Hubungan berkas belum dapat dipastikan", "Tidak ada penghapusan baru yang dapat diajukan. Perbarui inventaris dan minta Pihak Pengelola memeriksa hubungan berkas serta pembaruan sistem sebelum melanjutkan.");
assign(["LEASE_FILE_PURGE_COMMIT_RESPONSE_INVALID"], "Hasil penghapusan belum dapat dipastikan",
  "Pilihan pengajuan tetap dikunci. Coba ulang pengajuan yang sama tanpa mengubah isian, atau periksa hasilnya pada riwayat pengajuan. Jangan mengajukan berkas yang sama dengan pengajuan baru.");
assign(["LEASE_FILE_PURGE_PROTECTED", "LEASE_FILE_PURGE_SHARED"], "Berkas digunakan oleh hubungan lain",
  "Berkas tidak dihapus. Periksa hubungan yang ditampilkan pada inventaris; berkas bersama, identitas, foto kamar dan bukti Realisasi Owner tetap dilindungi.");
assign(["LEASE_FILE_PURGE_ALREADY_CLAIMED", "FILE_ARCHIVE_PURGE_UNAVAILABLE"], "Berkas masuk pengajuan penghapusan",
  "Berkas tidak dapat diunduh atau diajukan ulang. Buka hasil pengajuan pada arsip; coba ulang hanya berkas yang gagal atau belum dapat dipastikan.");
assign(["LEASE_FILE_PURGE_ALREADY_DELETED"], "Berkas sudah tidak tersedia",
  "Periksa catatan penghapusan pada arsip. Berkas yang dihapus permanen tidak dapat dipulihkan; tidak ada ruang tambahan yang dihitung dari berkas yang sudah tidak tersedia.");
assign(["LEASE_FILE_PURGE_ARCHIVE_ACTIVE"], "Penyewaan tidak lagi dapat diproses dari arsip",
  "Penyewaan sudah dipulihkan atau tidak lagi dibatalkan. Tidak ada berkas baru yang dihapus; buka penyewaan yang sedang berlaku dan tinjau riwayat arsip.");
assign(["LEASE_FILE_PURGE_REVIEW_STALE", "LEASE_FILE_PURGE_REVIEW_REQUIRED"], "Tinjauan berkas perlu diperbarui",
  "Keadaan atau hubungan berkas berubah. Tidak ada berkas baru yang dihapus; perbarui inventaris lalu tinjau pilihan dan akibatnya kembali.");
assign(["LEASE_FILE_PURGE_SELECTION_INVALID"], "Pilihan berkas belum sesuai",
  "Pilih 1–100 berkas yang dapat dihapus dari arsip ini tanpa pilihan ganda. Tidak ada berkas baru yang dihapus.");
assign(["LEASE_FILE_PURGE_RETRY_SELECTION_INVALID"], "Pilihan coba ulang belum sesuai",
  "Pilih hanya berkas yang gagal atau belum dapat dipastikan pada pengajuan ini. Berkas yang terverifikasi telah dihapus tidak diproses kembali.");
assign(["LEASE_FILE_PURGE_REASON_REQUIRED"], "Alasan penghapusan perlu dilengkapi",
  "Isi alasan penghapusan 3–1.000 karakter sebelum melanjutkan. Alasan dan hasil tiap berkas akan tersimpan pada riwayat pengajuan.");
assign(["LEASE_FILE_PURGE_CONFIRMATION_REQUIRED"], "Akibat penghapusan perlu dikonfirmasi",
  "Baca pilihan berkas lalu centang konfirmasi. Bukti terpilih tidak dapat dilihat, diunduh atau dikembalikan dengan memulihkan penyewaan setelah dihapus permanen.");
assign(["LEASE_FILE_PURGE_FORBIDDEN"], "Izin berkas arsip belum sesuai",
  "Gunakan akun Admin dengan izin penyewaan pada properti terkait. Melihat inventaris tidak otomatis memberikan izin menghapus berkas.");
assign(["LEASE_FILE_PURGE_NOT_FOUND", "LEASE_FILE_PURGE_PAGE_INVALID"], "Pengajuan berkas belum ditemukan",
  "Kembali ke rincian arsip pada properti yang benar dan perbarui riwayat pengajuan sebelum melanjutkan.");
export const LEASE_REVISION_ERROR_NOTICES: Readonly<Record<string, Notice>> =
  Object.freeze(notices);
