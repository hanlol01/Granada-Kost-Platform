export type RoomStatus = "occupied" | "vacant" | "maintenance";
export type PaymentStatus = "paid" | "unpaid" | "overdue";

export interface Room {
  id: string;
  number: string;
  type: string;
  price: number;
  status: RoomStatus;
  facilities: string[];
}

export interface Tenant {
  id: string;
  name: string;
  phone: string;
  ktp: string;
  joinDate: string;
  roomNumber: string;
  paymentStatus: PaymentStatus;
}

export interface Payment {
  id: string;
  tenantName: string;
  roomNumber: string;
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: PaymentStatus;
}

export const rooms: Room[] = [
  { id: "r1", number: "101", type: "Standard", price: 850000, status: "occupied", facilities: ["Kasur", "Lemari", "Kipas"] },
  { id: "r2", number: "102", type: "Standard", price: 850000, status: "occupied", facilities: ["Kasur", "Lemari", "Kipas"] },
  { id: "r3", number: "103", type: "Standard", price: 850000, status: "vacant", facilities: ["Kasur", "Lemari", "Kipas"] },
  { id: "r4", number: "201", type: "Deluxe", price: 1250000, status: "occupied", facilities: ["AC", "Kasur", "Lemari", "Meja Kerja", "WiFi"] },
  { id: "r5", number: "202", type: "Deluxe", price: 1250000, status: "occupied", facilities: ["AC", "Kasur", "Lemari", "Meja Kerja", "WiFi"] },
  { id: "r6", number: "203", type: "Deluxe", price: 1250000, status: "maintenance", facilities: ["AC", "Kasur", "Lemari", "Meja Kerja", "WiFi"] },
  { id: "r7", number: "301", type: "Premium", price: 1750000, status: "occupied", facilities: ["AC", "Kasur Queen", "Lemari", "Meja", "WiFi", "TV", "Kamar Mandi Dalam"] },
  { id: "r8", number: "302", type: "Premium", price: 1750000, status: "vacant", facilities: ["AC", "Kasur Queen", "Lemari", "Meja", "WiFi", "TV", "Kamar Mandi Dalam"] },
  { id: "r9", number: "303", type: "Premium", price: 1750000, status: "occupied", facilities: ["AC", "Kasur Queen", "Lemari", "Meja", "WiFi", "TV", "Kamar Mandi Dalam"] },
  { id: "r10", number: "304", type: "Premium", price: 1750000, status: "occupied", facilities: ["AC", "Kasur Queen", "Lemari", "Meja", "WiFi", "TV", "Kamar Mandi Dalam"] },
];

export const tenants: Tenant[] = [
  { id: "t1", name: "Andi Pratama", phone: "081234567890", ktp: "3273010101900001", joinDate: "2024-08-15", roomNumber: "101", paymentStatus: "paid" },
  { id: "t2", name: "Budi Santoso", phone: "081234567891", ktp: "3273010102910002", joinDate: "2024-09-01", roomNumber: "102", paymentStatus: "unpaid" },
  { id: "t3", name: "Citra Dewi", phone: "081234567892", ktp: "3273010103920003", joinDate: "2025-01-10", roomNumber: "201", paymentStatus: "paid" },
  { id: "t4", name: "Dewi Lestari", phone: "081234567893", ktp: "3273010104930004", joinDate: "2025-02-20", roomNumber: "202", paymentStatus: "overdue" },
  { id: "t5", name: "Eka Putra", phone: "081234567894", ktp: "3273010105940005", joinDate: "2024-11-05", roomNumber: "301", paymentStatus: "paid" },
  { id: "t6", name: "Fajar Nugroho", phone: "081234567895", ktp: "3273010106950006", joinDate: "2025-03-12", roomNumber: "303", paymentStatus: "paid" },
  { id: "t7", name: "Gita Permata", phone: "081234567896", ktp: "3273010107960007", joinDate: "2025-04-01", roomNumber: "304", paymentStatus: "unpaid" },
];

export const payments: Payment[] = [
  { id: "p1", tenantName: "Andi Pratama", roomNumber: "101", amount: 850000, dueDate: "2026-05-15", paidDate: "2026-05-10", status: "paid" },
  { id: "p2", tenantName: "Budi Santoso", roomNumber: "102", amount: 850000, dueDate: "2026-05-20", status: "unpaid" },
  { id: "p3", tenantName: "Citra Dewi", roomNumber: "201", amount: 1250000, dueDate: "2026-05-10", paidDate: "2026-05-08", status: "paid" },
  { id: "p4", tenantName: "Dewi Lestari", roomNumber: "202", amount: 1250000, dueDate: "2026-04-20", status: "overdue" },
  { id: "p5", tenantName: "Eka Putra", roomNumber: "301", amount: 1750000, dueDate: "2026-05-05", paidDate: "2026-05-03", status: "paid" },
  { id: "p6", tenantName: "Fajar Nugroho", roomNumber: "303", amount: 1750000, dueDate: "2026-05-12", paidDate: "2026-05-11", status: "paid" },
  { id: "p7", tenantName: "Gita Permata", roomNumber: "304", amount: 1750000, dueDate: "2026-05-25", status: "unpaid" },
];

export const monthlyIncome = [
  { month: "Nov", income: 9500000 },
  { month: "Des", income: 10200000 },
  { month: "Jan", income: 10850000 },
  { month: "Feb", income: 11200000 },
  { month: "Mar", income: 11500000 },
  { month: "Apr", income: 11800000 },
  { month: "Mei", income: 12450000 },
];

export const recentActivity = [
  { id: "a1", text: "Pembayaran diterima dari Andi Pratama", time: "2 jam lalu", type: "payment" as const },
  { id: "a2", text: "Penghuni baru: Gita Permata di kamar 304", time: "1 hari lalu", type: "tenant" as const },
  { id: "a3", text: "Kamar 203 dijadwalkan maintenance", time: "2 hari lalu", type: "room" as const },
  { id: "a4", text: "Tagihan jatuh tempo: Dewi Lestari", time: "3 hari lalu", type: "alert" as const },
  { id: "a5", text: "Pembayaran diterima dari Eka Putra", time: "4 hari lalu", type: "payment" as const },
];

export type ComplaintStatus = "waiting" | "processing" | "done";
export type ComplaintPriority = "low" | "medium" | "high";
export type ComplaintCategory = "AC" | "Air" | "Listrik" | "WiFi" | "Kebersihan" | "Fasilitas" | "Keamanan" | "Lainnya";

export interface Complaint {
  id: string;
  tenantName: string;
  roomNumber: string;
  category: ComplaintCategory;
  description: string;
  date: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  photo: string;
  technician?: string;
  timeline: { time: string; label: string }[];
}

export const complaints: Complaint[] = [
  { id: "c1", tenantName: "Andi Pratama", roomNumber: "101", category: "AC", description: "AC tidak dingin sejak kemarin malam", date: "2026-05-15", priority: "high", status: "processing", photo: "https://images.unsplash.com/photo-1581275299888-536e0ad7e7e2?w=600", technician: "Pak Joko", timeline: [{ time: "15 Mei 09:00", label: "Tiket dibuat" }, { time: "15 Mei 10:30", label: "Diassign ke Pak Joko" }, { time: "15 Mei 14:00", label: "Sedang diperbaiki" }] },
  { id: "c2", tenantName: "Budi Santoso", roomNumber: "102", category: "WiFi", description: "WiFi sering putus-putus di malam hari", date: "2026-05-14", priority: "medium", status: "waiting", photo: "https://images.unsplash.com/photo-1606904825846-647eb07f5be2?w=600", timeline: [{ time: "14 Mei 20:00", label: "Tiket dibuat" }] },
  { id: "c3", tenantName: "Citra Dewi", roomNumber: "201", category: "Air", description: "Air kamar mandi mati total", date: "2026-05-12", priority: "high", status: "done", photo: "https://images.unsplash.com/photo-1584461772525-ed8c84d6c5db?w=600", technician: "Pak Tono", timeline: [{ time: "12 Mei 07:00", label: "Tiket dibuat" }, { time: "12 Mei 08:00", label: "Teknisi tiba" }, { time: "12 Mei 11:00", label: "Selesai diperbaiki" }] },
  { id: "c4", tenantName: "Dewi Lestari", roomNumber: "202", category: "Listrik", description: "Stop kontak meja kerja tidak berfungsi", date: "2026-05-13", priority: "medium", status: "done", photo: "https://images.unsplash.com/photo-1558389186-438424b00a7f?w=600", technician: "Pak Joko", timeline: [{ time: "13 Mei 10:00", label: "Tiket dibuat" }, { time: "13 Mei 15:00", label: "Selesai" }] },
  { id: "c5", tenantName: "Eka Putra", roomNumber: "301", category: "Kebersihan", description: "Koridor lantai 3 perlu dibersihkan", date: "2026-05-16", priority: "low", status: "waiting", photo: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600", timeline: [{ time: "16 Mei 08:00", label: "Tiket dibuat" }] },
  { id: "c6", tenantName: "Fajar Nugroho", roomNumber: "303", category: "Fasilitas", description: "Pintu lemari rusak engselnya", date: "2026-05-11", priority: "low", status: "processing", photo: "https://images.unsplash.com/photo-1581782005169-f60a1d048cdc?w=600", technician: "Pak Tono", timeline: [{ time: "11 Mei 12:00", label: "Tiket dibuat" }, { time: "12 Mei 09:00", label: "Diassign" }] },
  { id: "c7", tenantName: "Gita Permata", roomNumber: "304", category: "AC", description: "Remote AC hilang", date: "2026-05-10", priority: "low", status: "done", photo: "https://images.unsplash.com/photo-1631545806609-cd0934d61f72?w=600", technician: "Pak Joko", timeline: [{ time: "10 Mei 14:00", label: "Tiket dibuat" }, { time: "10 Mei 16:00", label: "Remote diganti" }] },
  { id: "c8", tenantName: "Andi Pratama", roomNumber: "101", category: "Keamanan", description: "Kunci kamar agak macet", date: "2026-05-09", priority: "medium", status: "done", photo: "https://images.unsplash.com/photo-1558002038-1055907df827?w=600", technician: "Pak Tono", timeline: [{ time: "9 Mei 09:00", label: "Tiket dibuat" }, { time: "9 Mei 13:00", label: "Selesai" }] },
  { id: "c9", tenantName: "Citra Dewi", roomNumber: "201", category: "WiFi", description: "Kecepatan internet sangat lambat", date: "2026-05-16", priority: "high", status: "processing", photo: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=600", technician: "Pak Joko", timeline: [{ time: "16 Mei 11:00", label: "Tiket dibuat" }, { time: "16 Mei 12:00", label: "Diassign" }] },
  { id: "c10", tenantName: "Eka Putra", roomNumber: "301", category: "Lainnya", description: "Permintaan tambahan handuk", date: "2026-05-17", priority: "low", status: "waiting", photo: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600", timeline: [{ time: "17 Mei 08:00", label: "Tiket dibuat" }] },
];

export interface Camera {
  id: string;
  name: string;
  location: string;
  online: boolean;
  thumbnail: string;
  lastActivity: string;
}

export const cameras: Camera[] = [
  { id: "cam1", name: "CCTV-01", location: "Parkiran", online: true, thumbnail: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=800", lastActivity: "Baru saja" },
  { id: "cam2", name: "CCTV-02", location: "Lobby", online: true, thumbnail: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800", lastActivity: "1 menit lalu" },
  { id: "cam3", name: "CCTV-03", location: "Koridor Lantai 1", online: true, thumbnail: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800", lastActivity: "Baru saja" },
  { id: "cam4", name: "CCTV-04", location: "Koridor Lantai 2", online: false, thumbnail: "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800", lastActivity: "2 jam lalu" },
  { id: "cam5", name: "CCTV-05", location: "Area Umum", online: true, thumbnail: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=800", lastActivity: "Baru saja" },
  { id: "cam6", name: "CCTV-06", location: "Gerbang Masuk", online: true, thumbnail: "https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?w=800", lastActivity: "30 detik lalu" },
];

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  type: "payment" | "complaint" | "cctv" | "tenant";
  read: boolean;
}

export const notifications: NotificationItem[] = [
  { id: "n1", title: "Pembayaran Diterima", description: "Andi Pratama membayar tagihan kamar 101", time: "5 menit lalu", type: "payment", read: false },
  { id: "n2", title: "Komplain Baru", description: "Gita Permata mengajukan komplain WiFi", time: "30 menit lalu", type: "complaint", read: false },
  { id: "n3", title: "CCTV Offline", description: "CCTV-04 Koridor Lantai 2 tidak merespon", time: "2 jam lalu", type: "cctv", read: false },
  { id: "n4", title: "Penghuni Baru", description: "Pendaftaran penghuni baru di kamar 304", time: "1 hari lalu", type: "tenant", read: true },
  { id: "n5", title: "Tagihan Jatuh Tempo", description: "3 tagihan akan jatuh tempo besok", time: "1 hari lalu", type: "payment", read: true },
  { id: "n6", title: "Aktivitas Terdeteksi", description: "Gerakan terdeteksi di Gerbang Masuk pukul 02:14", time: "2 hari lalu", type: "cctv", read: true },
];

export type LockConnection = "online" | "offline";
export type LockState = "locked" | "unlocked" | "restricted";

export interface SmartLock {
  id: string;
  roomNumber: string;
  tenantName: string | null;
  deviceId: string;
  connection: LockConnection;
  state: LockState;
  battery: number;
  lastActivity: string;
  autoLock: boolean;
  restrictedReason?: string;
}

export const smartLocks: SmartLock[] = [
  { id: "sl1", roomNumber: "101", tenantName: "Andi Pratama", deviceId: "TT-AX01-1A2B", connection: "online", state: "locked", battery: 86, lastActivity: "2 menit lalu", autoLock: true },
  { id: "sl2", roomNumber: "102", tenantName: "Budi Santoso", deviceId: "TT-AX01-1A2C", connection: "online", state: "restricted", battery: 72, lastActivity: "10 menit lalu", autoLock: true, restrictedReason: "Tagihan kamar 102 telat 5 hari" },
  { id: "sl3", roomNumber: "103", tenantName: null, deviceId: "TT-AX01-1A2D", connection: "online", state: "locked", battery: 91, lastActivity: "1 jam lalu", autoLock: true },
  { id: "sl4", roomNumber: "201", tenantName: "Citra Dewi", deviceId: "TY-PRO-9X11", connection: "online", state: "unlocked", battery: 64, lastActivity: "Baru saja", autoLock: true },
  { id: "sl5", roomNumber: "202", tenantName: "Dewi Lestari", deviceId: "TY-PRO-9X12", connection: "online", state: "restricted", battery: 18, lastActivity: "15 menit lalu", autoLock: true, restrictedReason: "Tagihan kamar 202 overdue 24 hari" },
  { id: "sl6", roomNumber: "203", tenantName: null, deviceId: "TY-PRO-9X13", connection: "offline", state: "locked", battery: 45, lastActivity: "2 jam lalu", autoLock: false },
  { id: "sl7", roomNumber: "301", tenantName: "Eka Putra", deviceId: "TT-MAX-7K20", connection: "online", state: "locked", battery: 88, lastActivity: "5 menit lalu", autoLock: true },
  { id: "sl8", roomNumber: "302", tenantName: null, deviceId: "TT-MAX-7K21", connection: "offline", state: "locked", battery: 12, lastActivity: "3 jam lalu", autoLock: true },
  { id: "sl9", roomNumber: "303", tenantName: "Fajar Nugroho", deviceId: "TT-MAX-7K22", connection: "online", state: "unlocked", battery: 77, lastActivity: "Baru saja", autoLock: true },
  { id: "sl10", roomNumber: "304", tenantName: "Gita Permata", deviceId: "TT-MAX-7K23", connection: "offline", state: "restricted", battery: 55, lastActivity: "20 menit lalu", autoLock: true, restrictedReason: "Tagihan kamar 304 belum lunas" },
];

export type AccessType = "lock" | "unlock";
export type AccessSource = "Mobile App" | "Admin Dashboard" | "Auto Lock" | "Billing System";
export type AccessStatus = "success" | "failed";

export interface AccessLog {
  id: string;
  tenantName: string;
  roomNumber: string;
  time: string;
  type: AccessType;
  source: AccessSource;
  status: AccessStatus;
}

const _names = ["Andi Pratama","Budi Santoso","Citra Dewi","Dewi Lestari","Eka Putra","Fajar Nugroho","Gita Permata"];
const _rooms = ["101","102","201","202","301","303","304"];
const _sources: AccessSource[] = ["Mobile App","Admin Dashboard","Auto Lock","Billing System"];

export const accessLogs: AccessLog[] = Array.from({ length: 30 }).map((_, i) => {
  const idx = i % _names.length;
  const d = new Date();
  d.setMinutes(d.getMinutes() - i * 27);
  return {
    id: `al${i + 1}`,
    tenantName: _names[idx],
    roomNumber: _rooms[idx],
    time: d.toISOString(),
    type: i % 3 === 0 ? "lock" : "unlock",
    source: _sources[i % _sources.length],
    status: i % 11 === 0 ? "failed" : "success",
  };
});

export const lockActivityHourly = Array.from({ length: 12 }).map((_, i) => ({
  hour: `${(i * 2).toString().padStart(2, "0")}:00`,
  lock: Math.floor(Math.random() * 8) + 2,
  unlock: Math.floor(Math.random() * 10) + 3,
}));

export interface LockAlert {
  id: string;
  title: string;
  description: string;
  time: string;
  severity: "info" | "warning" | "danger";
}

export const lockAlerts: LockAlert[] = [
  { id: "la1", title: "Battery Low", description: "Kamar 202 (TY-PRO-9X12) — battery 18%", time: "5 menit lalu", severity: "warning" },
  { id: "la2", title: "Battery Low", description: "Kamar 302 (TT-MAX-7K21) — battery 12%", time: "20 menit lalu", severity: "danger" },
  { id: "la3", title: "Device Offline", description: "CCTV-04 koridor lantai 2 tidak merespon", time: "2 jam lalu", severity: "warning" },
  { id: "la4", title: "Multiple Unlock Attempt", description: "5x percobaan unlock gagal di kamar 102", time: "30 menit lalu", severity: "danger" },
  { id: "la5", title: "Auto Restriction", description: "Kamar 304 dikunci otomatis (tagihan overdue)", time: "1 jam lalu", severity: "info" },
];

export type BookingStatus = "pending_payment" | "pending_verification" | "approved" | "rejected" | "expired";

export interface Booking {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  ktp: string;
  gender: "L" | "P";
  roomNumber: string;
  checkInDate: string;
  duration: number; // months
  note?: string;
  bookingDate: string;
  fee: number;
  status: BookingStatus;
}

export const BOOKING_FEE = 100000;

export const bookings: Booking[] = [
  { id: "bk1", code: "BK-2026-001", name: "Rina Mahardika", phone: "081298765432", email: "rina@mail.com", ktp: "3273010101990011", gender: "P", roomNumber: "103", checkInDate: "2026-06-01", duration: 6, bookingDate: "2026-05-20", fee: 100000, status: "approved" },
  { id: "bk2", code: "BK-2026-002", name: "Yusuf Hakim", phone: "081298765433", email: "yusuf@mail.com", ktp: "3273010102990012", gender: "L", roomNumber: "302", checkInDate: "2026-06-10", duration: 12, bookingDate: "2026-05-21", fee: 100000, status: "pending_verification" },
  { id: "bk3", code: "BK-2026-003", name: "Sinta Larasati", phone: "081298765434", email: "sinta@mail.com", ktp: "3273010103990013", gender: "P", roomNumber: "204", checkInDate: "2026-06-05", duration: 3, bookingDate: "2026-05-22", fee: 100000, status: "pending_payment" },
  { id: "bk4", code: "BK-2026-004", name: "Rangga Wibowo", phone: "081298765435", email: "rangga@mail.com", ktp: "3273010104990014", gender: "L", roomNumber: "205", checkInDate: "2026-07-01", duration: 6, bookingDate: "2026-05-18", fee: 100000, status: "rejected" },
  { id: "bk5", code: "BK-2026-005", name: "Maya Kusuma", phone: "081298765436", email: "maya@mail.com", ktp: "3273010105990015", gender: "P", roomNumber: "104", checkInDate: "2026-06-15", duration: 12, bookingDate: "2026-05-15", fee: 100000, status: "expired" },
  { id: "bk6", code: "BK-2026-006", name: "Hendra Saputra", phone: "081298765437", email: "hendra@mail.com", ktp: "3273010106990016", gender: "L", roomNumber: "105", checkInDate: "2026-06-20", duration: 6, bookingDate: "2026-05-23", fee: 100000, status: "pending_verification" },
  { id: "bk7", code: "BK-2026-007", name: "Tania Ardelia", phone: "081298765438", email: "tania@mail.com", ktp: "3273010107990017", gender: "P", roomNumber: "302", checkInDate: "2026-06-25", duration: 3, bookingDate: "2026-05-24", fee: 100000, status: "pending_payment" },
  { id: "bk8", code: "BK-2026-008", name: "Bagas Pradana", phone: "081298765439", email: "bagas@mail.com", ktp: "3273010108990018", gender: "L", roomNumber: "204", checkInDate: "2026-07-05", duration: 12, bookingDate: "2026-05-19", fee: 100000, status: "approved" },
  { id: "bk9", code: "BK-2026-009", name: "Larasati Putri", phone: "081298765440", email: "lara@mail.com", ktp: "3273010109990019", gender: "P", roomNumber: "103", checkInDate: "2026-06-30", duration: 6, bookingDate: "2026-05-17", fee: 100000, status: "rejected" },
  { id: "bk10", code: "BK-2026-010", name: "Rio Pranata", phone: "081298765441", email: "rio@mail.com", ktp: "3273010110990020", gender: "L", roomNumber: "205", checkInDate: "2026-07-10", duration: 3, bookingDate: "2026-05-25", fee: 100000, status: "pending_verification" },
  { id: "bk11", code: "BK-2026-011", name: "Nadia Salsabila", phone: "081298765442", email: "nadia@mail.com", ktp: "3273010111990021", gender: "P", roomNumber: "104", checkInDate: "2026-07-12", duration: 12, bookingDate: "2026-05-16", fee: 100000, status: "expired" },
  { id: "bk12", code: "BK-2026-012", name: "Adit Permana", phone: "081298765443", email: "adit@mail.com", ktp: "3273010112990022", gender: "L", roomNumber: "105", checkInDate: "2026-07-15", duration: 6, bookingDate: "2026-05-26", fee: 100000, status: "pending_payment" },
  { id: "bk13", code: "BK-2026-013", name: "Vina Kartika", phone: "081298765444", email: "vina@mail.com", ktp: "3273010113990023", gender: "P", roomNumber: "302", checkInDate: "2026-07-20", duration: 3, bookingDate: "2026-05-14", fee: 100000, status: "approved" },
  { id: "bk14", code: "BK-2026-014", name: "Galang Wirawan", phone: "081298765445", email: "galang@mail.com", ktp: "3273010114990024", gender: "L", roomNumber: "204", checkInDate: "2026-08-01", duration: 12, bookingDate: "2026-05-27", fee: 100000, status: "pending_verification" },
  { id: "bk15", code: "BK-2026-015", name: "Putri Anggraini", phone: "081298765446", email: "putri@mail.com", ktp: "3273010115990025", gender: "P", roomNumber: "205", checkInDate: "2026-08-05", duration: 6, bookingDate: "2026-05-28", fee: 100000, status: "pending_payment" },
];

export const monthlyBookings = [
  { month: "Nov", bookings: 6 },
  { month: "Des", bookings: 8 },
  { month: "Jan", bookings: 10 },
  { month: "Feb", bookings: 9 },
  { month: "Mar", bookings: 12 },
  { month: "Apr", bookings: 14 },
  { month: "Mei", bookings: 15 },
];

// Additional booking-specific rooms (does not modify primary rooms)
export interface BookingRoom {
  number: string;
  floor: number;
  type: string;
  price: number;
  deposit: number;
  size: string;
  facilities: string[];
  photo: string;
  status: RoomStatus | "reserved";
}

export const bookingRooms: BookingRoom[] = [
  { number: "101", floor: 1, type: "Standard", price: 850000, deposit: 500000, size: "3x3 m", facilities: ["Kasur", "Lemari", "Kipas"], photo: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=800", status: "occupied" },
  { number: "102", floor: 1, type: "Standard", price: 850000, deposit: 500000, size: "3x3 m", facilities: ["Kasur", "Lemari", "Kipas"], photo: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800", status: "occupied" },
  { number: "103", floor: 1, type: "Standard", price: 850000, deposit: 500000, size: "3x3 m", facilities: ["Kasur", "Lemari", "Kipas", "WiFi"], photo: "https://images.unsplash.com/photo-1540518614846-7eded433c457?w=800", status: "reserved" },
  { number: "104", floor: 1, type: "Standard", price: 900000, deposit: 500000, size: "3x3.5 m", facilities: ["Kasur", "Lemari", "Kipas", "WiFi"], photo: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800", status: "vacant" },
  { number: "105", floor: 1, type: "Standard", price: 900000, deposit: 500000, size: "3x3.5 m", facilities: ["Kasur", "Lemari", "Kipas", "WiFi"], photo: "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?w=800", status: "maintenance" },
  { number: "201", floor: 2, type: "Deluxe", price: 1250000, deposit: 750000, size: "3.5x4 m", facilities: ["AC", "Kasur", "Lemari", "Meja Kerja", "WiFi"], photo: "https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=800", status: "occupied" },
  { number: "202", floor: 2, type: "Deluxe", price: 1250000, deposit: 750000, size: "3.5x4 m", facilities: ["AC", "Kasur", "Lemari", "Meja Kerja", "WiFi"], photo: "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=800", status: "occupied" },
  { number: "203", floor: 2, type: "Deluxe", price: 1250000, deposit: 750000, size: "3.5x4 m", facilities: ["AC", "Kasur", "Lemari", "Meja Kerja"], photo: "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=800", status: "vacant" },
  { number: "204", floor: 2, type: "Deluxe", price: 1300000, deposit: 750000, size: "4x4 m", facilities: ["AC", "Kasur", "Lemari", "Meja Kerja", "WiFi", "TV"], photo: "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?w=800", status: "reserved" },
  { number: "205", floor: 2, type: "Premium", price: 1750000, deposit: 1000000, size: "4x4.5 m", facilities: ["AC", "Kasur Queen", "Lemari", "Meja", "WiFi", "TV", "Kamar Mandi Dalam"], photo: "https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=800", status: "vacant" },
];
