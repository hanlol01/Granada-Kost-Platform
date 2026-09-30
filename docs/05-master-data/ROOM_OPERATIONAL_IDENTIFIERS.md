# Identitas operasional kamar

Kode kamar sistem (`number` / `room_code`) tetap menjadi identitas dan referensi relasi kamar.
Admin dapat melengkapi dua atribut melalui sidebar Edit Kamar:

| Field | Penyimpanan | Nilai awal |
| --- | --- | --- |
| Nomor Kamar by Pengelola | `rooms.manager_room_label` | Label dari kategori, unit bangunan, dan nomor kamar; contoh `Rumah Kost · Unit 1, Kamar 2` |
| Nomor Kavling | `rooms.plot_number` | Kosong |

Nomor Kavling adalah satu-satunya field untuk nomor yang ditetapkan Owner; field
tersebut juga menjadi sumber nilai `No. Kav.` pada dokumen. Nilai kosong
ditampilkan sebagai `-` pada detail kamar dan kartu Penyewaan dan kamar pada
detail penghuni. Label pengelola dan nomor kavling dapat diedit saat kamar
dihuni karena tidak mengubah lokasi, kode kamar, kontrak, atau kepemilikan.

Dokumen Realisasi Owner, kuitansi transfer, Form Finance, dan akses dokumen Owner
mengambil nomor kavling dari kamar terkait ketika dokumen diunduh. Dokumen
memakai Nomor Kavling untuk kolom `No. Kamar` dan `No. Kav.`. Jika Nomor Kavling
belum diisi, kolom nomor kamar memakai kode kamar sistem dan kolom nomor kavling
menampilkan `-`. Realisasi baru juga menyimpan nomor kavling saat dibuat.
Unduhan ulang realisasi lama dapat melengkapi metadata kamar dari data terkini
tanpa mengubah nominal atau catatan transaksi yang tersimpan.

Nomor kavling dapat sama pada beberapa kamar. Kuitansi historis manual yang
tidak dapat dipadankan ke kamar tetap menampilkan `-`. File yang sudah pernah
diunduh perlu diunduh ulang untuk melihat pembaruan.

Migrasi: `111_room_operational_identifiers.sql` menambahkan identitas operasional;
`112_room_single_plot_identifier.sql` menyatukan nomor Owner ke `plot_number` dan
menghapus kolom duplikat. Jika kedua field lama terisi berbeda, Nomor Kavling
yang sebelumnya tersimpan di `plot_number` dipertahankan; nilai dari field lama
hanya dipindahkan jika `plot_number` kosong.
