import {
  BadgeCheck,
  BedDouble,
  Cctv,
  Church,
  Clock3,
  Fence,
  GraduationCap,
  LockKeyhole,
  ParkingCircle,
  ShieldCheck,
  Sofa,
  UsersRound,
  Wifi,
} from "lucide-react";

export const commonAmenities = [
  { label: "Area parkir", description: "Penataan kendaraan dalam kawasan", icon: ParkingCircle },
  { label: "Mushola", description: "Ruang ibadah mudah dijangkau", icon: Church },
  { label: "Full furnish", description: "Kamar siap untuk ditempati", icon: Sofa },
  { label: "Free Wi-Fi", description: "Internet untuk belajar dan bekerja", icon: Wifi },
  {
    label: "Security 24 jam",
    description: "Lingkungan dipantau sepanjang hari",
    icon: ShieldCheck,
  },
  { label: "One gate system", description: "Akses masuk melalui satu gerbang", icon: Fence },
  { label: "CCTV", description: "Pemantauan area bersama", icon: Cctv },
  { label: "Smartlock system", description: "Akses kamar lebih praktis", icon: LockKeyhole },
];

export const specialRules = [
  { title: "Sewa tahunan", copy: "Masa sewa utama mengikuti kontrak satu tahun.", icon: Clock3 },
  {
    title: "Mahasiswa & karyawan",
    copy: "Hunian tertib untuk aktivitas studi dan kerja.",
    icon: GraduationCap,
  },
  {
    title: "Gedung putra & putri terpisah",
    copy: "Penempatan mengikuti jenis hunian yang dipilih.",
    icon: BadgeCheck,
  },
  {
    title: "Maksimal 1 penghuni",
    copy: "Setiap kamar diperuntukkan bagi satu penghuni.",
    icon: UsersRound,
  },
];

export const nearbyPlaces = [
  ["Universitas Padjadjaran", "1,8 km", "6 menit"],
  ["Institut Teknologi Bandung", "2,4 km", "8 menit"],
  ["IPDN Jatinangor", "2,7 km", "9 menit"],
  ["IKOPIN University", "3,1 km", "10 menit"],
  ["Jatinangor Town Square", "1,2 km", "4 menit"],
  ["Borma Jatinangor", "1,5 km", "5 menit"],
  ["RS Unpad", "2,6 km", "8 menit"],
  ["Puskesmas Jatinangor", "1,9 km", "6 menit"],
  ["Gerbang Tol Cileunyi", "7,5 km", "15 menit"],
  ["Stasiun Rancaekek", "8,2 km", "18 menit"],
  ["Masjid Al-Jabbar", "12 km", "22 menit"],
  ["Summarecon Mall Bandung", "13 km", "24 menit"],
] as const;

export const transportPartners = ["BHISA", "Cititrans", "KAI", "Arnes", "Lintas", "Bhinneka"];

export const bookingSteps = [
  {
    title: "Pilih hunian",
    copy: "Bandingkan tipe hunian dan cek ketersediaan putra atau putri.",
    icon: BedDouble,
  },
  {
    title: "Ajukan minat",
    copy: "Isi informasi singkat agar Admin dapat menghubungi Anda.",
    icon: UsersRound,
  },
  {
    title: "Konfirmasi Admin",
    copy: "Admin memastikan kamar, jadwal masuk, dan proses penyewaan berikutnya.",
    icon: BadgeCheck,
  },
];

export const houseRuleGroups = [
  {
    title: "Kapasitas dan tamu",
    items: ["Kapasitas kamar", "Lawan jenis", "Tamu menginap", "Jam kunjung"],
  },
  {
    title: "Kebersihan dan fasilitas",
    items: ["Kebersihan mandiri", "Fasilitas umum", "Sampah"],
  },
  {
    title: "Keamanan dan lingkungan",
    items: ["Ketenangan", "Narkoba & miras", "Parkir", "Keamanan"],
  },
  {
    title: "Penggunaan energi",
    items: ["Listrik", "Alat elektronik tambahan"],
  },
];

export const faqItems = [
  [
    "Apakah pengajuan minat langsung menahan kamar?",
    "Belum. Pengajuan minat mengirim data Anda kepada Admin. Ketersediaan dan nomor kamar dikonfirmasi kembali sebelum proses penyewaan.",
  ],
  [
    "Bagaimana sistem pembayarannya?",
    "Pilihan pembayaran mengikuti ketentuan hunian. Admin akan menjelaskan nilai kontrak, DP rekomendasi, dan jadwal pelunasan sebelum aktivasi sewa.",
  ],
  [
    "Apakah gedung putra dan putri terpisah?",
    "Ya. Ketersediaan yang ditampilkan dibedakan berdasarkan kategori hunian putra dan putri.",
  ],
] as const;
