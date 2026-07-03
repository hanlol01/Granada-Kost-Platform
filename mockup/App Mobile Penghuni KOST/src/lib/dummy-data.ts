// Dummy data untuk Kos Resident App
export const currentUser = {
  name: "Andi Pratama",
  room: "A-204",
  phone: "+62 812-3456-7890",
  joinDate: "2024-03-15",
  status: "Aktif",
  avatar: "AP",
  email: "andi.pratama@email.com",
};

export const currentBill = {
  amount: 1850000,
  dueDate: "2026-05-25",
  status: "unpaid" as "paid" | "unpaid" | "overdue",
  period: "Mei 2026",
  breakdown: [
    { label: "Sewa Kamar", amount: 1500000 },
    { label: "Listrik", amount: 180000 },
    { label: "Air", amount: 70000 },
    { label: "WiFi", amount: 100000 },
  ],
};

export const paymentHistory = [
  { id: "INV-2604", period: "April 2026", amount: 1820000, date: "2026-04-05", status: "paid", method: "Transfer Bank" },
  { id: "INV-2603", period: "Maret 2026", amount: 1790000, date: "2026-03-04", status: "paid", method: "QRIS" },
  { id: "INV-2602", period: "Februari 2026", amount: 1850000, date: "2026-02-06", status: "paid", method: "E-Wallet" },
  { id: "INV-2601", period: "Januari 2026", amount: 1800000, date: "2026-01-03", status: "paid", method: "Transfer Bank" },
  { id: "INV-2512", period: "Desember 2025", amount: 1780000, date: "2025-12-05", status: "paid", method: "QRIS" },
  { id: "INV-2511", period: "November 2025", amount: 1820000, date: "2025-11-04", status: "paid", method: "Transfer Bank" },
];

export const announcements = [
  { id: 1, title: "Pemadaman Listrik Terjadwal", body: "Akan ada pemadaman listrik pada Senin 18 Mei 2026 pukul 09:00–12:00 untuk perawatan instalasi.", date: "2026-05-15", priority: "high", category: "Maintenance" },
  { id: 2, title: "Jadwal Kebersihan Baru", body: "Mulai pekan depan, kebersihan area umum dilakukan setiap Senin, Rabu, dan Jumat pagi.", date: "2026-05-12", priority: "medium", category: "Info" },
  { id: 3, title: "Promo Perpanjangan Sewa", body: "Diskon 10% untuk perpanjangan sewa minimal 6 bulan. Berlaku hingga akhir Mei.", date: "2026-05-10", priority: "low", category: "Promo" },
  { id: 4, title: "Peraturan Tamu Menginap", body: "Tamu yang menginap wajib lapor maksimal pukul 21:00. Mohon dipatuhi demi keamanan bersama.", date: "2026-05-08", priority: "medium", category: "Aturan" },
  { id: 5, title: "Upgrade WiFi 100Mbps", body: "Kecepatan WiFi kos telah ditingkatkan menjadi 100 Mbps. Semoga lebih nyaman!", date: "2026-05-03", priority: "low", category: "Info" },
];

export const complaints = [
  { id: "TKT-021", category: "AC", title: "AC bocor di kamar A-204", date: "2026-05-14", status: "process", desc: "AC menetes saat dinyalakan lebih dari 1 jam." },
  { id: "TKT-020", category: "Internet", title: "WiFi sering putus malam hari", date: "2026-05-10", status: "done", desc: "Koneksi terputus antara jam 22:00–24:00." },
  { id: "TKT-019", category: "Air", title: "Air panas tidak menyala", date: "2026-05-07", status: "done", desc: "Heater di kamar mandi tidak bekerja." },
  { id: "TKT-018", category: "Kebersihan", title: "Sampah belum diangkut", date: "2026-05-05", status: "done", desc: "Sampah area lantai 2 belum diangkut 2 hari." },
  { id: "TKT-017", category: "Listrik", title: "Stop kontak rusak", date: "2026-05-02", status: "done", desc: "Stop kontak dekat meja tidak berfungsi." },
  { id: "TKT-016", category: "Kerusakan kamar", title: "Pintu lemari longgar", date: "2026-04-28", status: "waiting", desc: "Engsel pintu lemari perlu diperbaiki." },
];

export const complaintCategories = ["AC", "Air", "Internet", "Listrik", "Kebersihan", "Kerusakan kamar"] as const;

export const chatMessages = [
  { id: 1, from: "admin", text: "Selamat siang Andi, ada yang bisa kami bantu?", time: "09:12" },
  { id: 2, from: "me", text: "Halo, AC kamar saya bocor sejak kemarin.", time: "09:14" },
  { id: 3, from: "admin", text: "Baik, tim teknisi akan kami jadwalkan hari ini sore ya.", time: "09:15" },
  { id: 4, from: "me", text: "Siap, terima kasih banyak!", time: "09:16" },
  { id: 5, from: "admin", text: "Sama-sama, kami kabari lagi jika teknisi sudah berangkat. 🙏", time: "09:17" },
];

export const notifications = [
  { id: 1, title: "Tagihan Mei 2026", body: "Jangan lupa, tagihan jatuh tempo 25 Mei.", time: "2 jam lalu", type: "bill", read: false },
  { id: 2, title: "Tiket #TKT-021 Diproses", body: "Teknisi akan datang hari ini.", time: "5 jam lalu", type: "ticket", read: false },
  { id: 3, title: "Pengumuman Baru", body: "Pemadaman listrik terjadwal Senin.", time: "1 hari lalu", type: "announce", read: true },
  { id: 4, title: "Pembayaran Berhasil", body: "Invoice INV-2604 telah dibayar.", time: "10 hari lalu", type: "bill", read: true },
  { id: 5, title: "Tiket #TKT-020 Selesai", body: "WiFi sudah stabil kembali.", time: "12 hari lalu", type: "ticket", read: true },
];

export const faqs = [
  { q: "Bagaimana cara membayar tagihan?", a: "Buka tab Tagihan, lalu pilih metode pembayaran dan ikuti instruksi." },
  { q: "Kapan tagihan harus dibayar?", a: "Setiap tanggal 25 bulan berjalan. Keterlambatan dikenakan denda 1% per hari." },
  { q: "Bagaimana melapor kerusakan?", a: "Buka tab Komplain, pilih kategori, isi detail, dan kirim." },
  { q: "Apakah ada jam malam?", a: "Pintu utama ditutup pukul 23:00. Tamu wajib lapor sebelum 21:00." },
];

export const formatIDR = (n: number) =>
  "Rp " + n.toLocaleString("id-ID");
