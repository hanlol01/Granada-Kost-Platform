export type InboxBusinessEvent = {
  id: string;
  property_id: string;
  event_key: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  created_at: Date;
};

type Content = {
  category: string;
  title: string;
  body: string;
  priority: 'normal' | 'high' | 'urgent';
};
const facts: Record<string, Omit<Content, 'body'> & { body: string }> = {
  'booking_lead.created_public': {
    category: 'booking',
    title: 'Minat booking baru diterima',
    body: 'Minat booking baru diterima. Buka rincian untuk menindaklanjuti calon penghuni.',
    priority: 'high',
  },
  'booking_lead.created_admin': {
    category: 'booking',
    title: 'Booking baru dicatat',
    body: 'Booking baru telah dicatat. Buka rincian untuk tindak lanjut penyewaan.',
    priority: 'high',
  },
  'complaint.created': {
    category: 'service',
    title: 'Keluhan diterima',
    body: 'Keluhan baru telah diterima. Buka rincian untuk mengikuti penanganan.',
    priority: 'high',
  },
  'complaint.sla_response_breached': {
    category: 'service',
    title: 'Batas respons keluhan terlewati',
    body: 'Keluhan belum memenuhi batas waktu respons. Tindak lanjuti penanganan pada rincian keluhan.',
    priority: 'urgent',
  },
  'complaint.sla_resolution_breached': {
    category: 'service',
    title: 'Batas penyelesaian keluhan terlewati',
    body: 'Keluhan melewati batas waktu penyelesaian. Periksa kendala dan tindak lanjut penanganan.',
    priority: 'urgent',
  },
  'account.password_changed': {
    category: 'account',
    title: 'Password akun diperbarui',
    body: 'Password akun Anda berhasil diperbarui. Hubungi Pengelola jika Anda tidak melakukan perubahan ini.',
    priority: 'normal',
  },
  'account.email_changed': {
    category: 'account',
    title: 'Email akun diperbarui',
    body: 'Email login akun Anda berhasil diperbarui. Hubungi Pengelola jika Anda tidak melakukan perubahan ini.',
    priority: 'normal',
  },
  'account.password_reset': {
    category: 'account',
    title: 'Password akun direset',
    body: 'Pengelola telah mereset password akun Anda. Perbarui password setelah masuk.',
    priority: 'high',
  },
  'account.provisioned': {
    category: 'account',
    title: 'Akun penghuni disiapkan',
    body: 'Akun penghuni Anda telah disiapkan. Perbarui password saat pertama masuk.',
    priority: 'normal',
  },
  'property_owner.password_reset': {
    category: 'account',
    title: 'Password akun direset',
    body: 'Pengelola telah mereset password akun Owner Anda. Hubungi Pengelola jika Anda tidak mengenali tindakan ini.',
    priority: 'high',
  },
  'payment_proof.submitted': {
    category: 'payments',
    title: 'Bukti pembayaran diterima',
    body: 'Bukti diterima untuk diperiksa. Pembayaran belum dinyatakan terverifikasi.',
    priority: 'high',
  },
  'payment_proof.rejected': {
    category: 'payments',
    title: 'Bukti pembayaran perlu diperbaiki',
    body: 'Bukti pembayaran belum dapat diverifikasi. Buka rincian untuk melihat hasil pemeriksaan.',
    priority: 'high',
  },
  'payment.verified': {
    category: 'payments',
    title: 'Pembayaran diverifikasi',
    body: 'Pembayaran telah diverifikasi dan dicatat. Buka rincian untuk melihat alokasi pembayaran.',
    priority: 'normal',
  },
  'payment.rejected': {
    category: 'payments',
    title: 'Pembayaran belum dapat diverifikasi',
    body: 'Pembayaran memerlukan perbaikan. Buka rincian untuk melihat hasil pemeriksaan.',
    priority: 'high',
  },
  'payment.reversed': {
    category: 'payments',
    title: 'Pembayaran dibalik',
    body: 'Pembalikan pembayaran telah dicatat. Periksa kembali kewajiban pada rincian pembayaran.',
    priority: 'high',
  },
  'billing.invoice_issued': {
    category: 'payments',
    title: 'Tagihan diterbitkan',
    body: 'Tagihan baru telah diterbitkan. Buka rincian untuk melihat nominal dan jatuh tempo.',
    priority: 'high',
  },
  'lease.created': {
    category: 'booking',
    title: 'Penyewaan dicatat',
    body: 'Data penyewaan telah dicatat. Periksa status aktivasi dan check-in pada rincian penyewaan.',
    priority: 'normal',
  },
  'lease.activated': {
    category: 'booking',
    title: 'Penyewaan diaktifkan',
    body: 'Aktivasi penyewaan dicatat. Periode sewa efektif mengikuti check-in yang telah dikonfirmasi.',
    priority: 'normal',
  },
  'lease.check_in_confirmed': {
    category: 'rooms',
    title: 'Check-in dikonfirmasi',
    body: 'Check-in telah dicatat dan kamar ditempati.',
    priority: 'normal',
  },
  'lease.check_in_confirmation_required': {
    category: 'booking',
    title: 'Konfirmasi check-in diperlukan',
    body: 'Check-in belum dikonfirmasi. Buka rincian penyewaan untuk menindaklanjuti.',
    priority: 'high',
  },
  'lease.activation_attention_required': {
    category: 'booking',
    title: 'Aktivasi memerlukan perhatian',
    body: 'Aktivasi penyewaan memerlukan tindak lanjut Admin. Periksa rincian penyewaan.',
    priority: 'high',
  },
  'lease.automatic_activation_failed': {
    category: 'booking',
    title: 'Aktivasi otomatis gagal',
    body: 'Aktivasi otomatis gagal. Periksa rincian penyewaan dan tindak lanjuti kendala.',
    priority: 'urgent',
  },
  'booking_lead_hold.expired': {
    category: 'booking',
    title: 'Hold kamar berakhir',
    body: 'Masa hold kamar telah berakhir. Periksa booking dan ketersediaan kamar.',
    priority: 'high',
  },
  'lease.checkout.notice_recorded': {
    category: 'checkout',
    title: 'Pemberitahuan check-out dicatat',
    body: 'Pemberitahuan check-out diterima. Serah-terima kamar dan penyelesaian akhir masih mengikuti tahap masing-masing.',
    priority: 'high',
  },
  'lease.checkout.plan_recorded': {
    category: 'checkout',
    title: 'Rencana check-out dicatat',
    body: 'Jadwal check-out dicatat. Periksa rincian untuk persiapan serah-terima kamar.',
    priority: 'high',
  },
  'lease.checkout.handover': {
    category: 'checkout',
    title: 'Serah-terima kamar dicatat',
    body: 'Serah-terima kamar telah dicatat. Inspeksi dan penyelesaian keuangan mengikuti tahap berikutnya.',
    priority: 'normal',
  },
  'lease.checkout.inspection': {
    category: 'rooms',
    title: 'Inspeksi check-out dicatat',
    body: 'Hasil inspeksi kamar telah dicatat. Buka rincian untuk tindak lanjut kamar.',
    priority: 'high',
  },
  'lease.checkout.completed': {
    category: 'checkout',
    title: 'Penyelesaian akhir dicatat',
    body: 'Penyelesaian akhir telah dicatat. Status tagihan dan refund dapat dilihat pada rincian check-out.',
    priority: 'normal',
  },
  'lease.checkout.refund_settled': {
    category: 'checkout',
    title: 'Refund dicatat',
    body: 'Transfer refund telah dicatat. Buka rincian untuk nominal dan referensi transaksi.',
    priority: 'normal',
  },
  'lease.checkout.refund_waived': {
    category: 'checkout',
    title: 'Keputusan refund dicatat',
    body: 'Keputusan penyelesaian refund telah dicatat. Buka rincian untuk melihat alasan dan status.',
    priority: 'normal',
  },
  'room.inspection_resolved': {
    category: 'rooms',
    title: 'Status kamar diperbarui',
    body: 'Hasil inspeksi dan status kamar telah dicatat.',
    priority: 'normal',
  },
  'complaint.status_changed': {
    category: 'service',
    title: 'Status keluhan diperbarui',
    body: 'Penanganan keluhan memiliki pembaruan. Buka rincian untuk status dan tindak lanjut.',
    priority: 'normal',
  },
  'work_order.status_changed': {
    category: 'service',
    title: 'Status pemeliharaan diperbarui',
    body: 'Pekerjaan pemeliharaan memiliki pembaruan. Buka rincian untuk status pekerjaan.',
    priority: 'normal',
  },
  'vehicle.registered': {
    category: 'service',
    title: 'Kendaraan didaftarkan',
    body: 'Pendaftaran kendaraan diterima untuk pemeriksaan.',
    priority: 'high',
  },
  'vehicle.vehicle.approve': {
    category: 'service',
    title: 'Kendaraan disetujui',
    body: 'Pendaftaran kendaraan telah disetujui.',
    priority: 'normal',
  },
  'vehicle.vehicle.reject': {
    category: 'service',
    title: 'Pendaftaran kendaraan perlu diperbaiki',
    body: 'Pendaftaran kendaraan belum disetujui. Periksa hasil pemeriksaan.',
    priority: 'high',
  },
  'parking.slot_assigned': {
    category: 'service',
    title: 'Tempat parkir ditetapkan',
    body: 'Penempatan kendaraan pada tempat parkir telah dicatat.',
    priority: 'normal',
  },
  'parking.slot_released': {
    category: 'service',
    title: 'Tempat parkir dilepas',
    body: 'Pelepasan tempat parkir kendaraan telah dicatat.',
    priority: 'normal',
  },
  'property_owner.realization.published': {
    category: 'realization',
    title: 'Realisasi Owner diterbitkan',
    body: 'Dokumen Realisasi Owner telah diterbitkan.',
    priority: 'normal',
  },
  'property_owner.transfer.verified': {
    category: 'transfer',
    title: 'Transfer Owner diverifikasi',
    body: 'Transfer Owner telah dicatat dan diverifikasi.',
    priority: 'normal',
  },
  'property_owner.realization.corrected': {
    category: 'realization',
    title: 'Pemulihan Realisasi Owner dicatat',
    body: 'Catatan pemulihan baru terkait Realisasi Owner telah ditambahkan.',
    priority: 'high',
  },
  'property_owner.realization.state_changed': {
    category: 'realization',
    title: 'Tahap Realisasi Owner diperbarui',
    body: 'Tahap Realisasi Owner memiliki pembaruan. Periksa dokumen dan tindak lanjut yang diperlukan.',
    priority: 'high',
  },
};

export const NOTIFICATION_EVENT_TYPES = [...Object.keys(facts), 'payment.recorded'];

const roomStatusLabels: Record<string, string> = {
  inspection_required: 'perlu inspeksi',
  maintenance: 'dalam pemeliharaan',
  available: 'siap digunakan',
  occupied: 'ditempati',
};
const serviceStatusLabels: Record<string, string> = {
  submitted: 'diajukan',
  acknowledged: 'diterima',
  assigned: 'ditugaskan',
  in_progress: 'sedang dikerjakan',
  resolved: 'diselesaikan',
  closed: 'ditutup',
  completed: 'pekerjaan selesai',
  verified: 'hasil diverifikasi',
  rework_required: 'perlu pengerjaan ulang',
  cancelled: 'dibatalkan',
};
function amount(value: unknown): string | null {
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? `Rp${number.toLocaleString('id-ID')}` : null;
}

/** Copy uses event snapshots only; a later state must not rewrite the announced fact. */
export function notificationEventContent(event: InboxBusinessEvent, owner = false): Content | null {
  const payload = event.payload;
  const fact =
    event.event_type === 'payment.recorded'
      ? payload.payment_status === 'verified'
        ? facts['payment.verified']
        : {
            category: 'payments',
            title: 'Pembayaran menunggu verifikasi',
            body: 'Pembayaran telah dicatat untuk diperiksa. Pembayaran belum dinyatakan terverifikasi.',
            priority: 'high' as const,
          }
      : facts[event.event_type];
  if (!fact) return null;
  if (owner && payload.payment_purpose === 'management_fee') {
    return {
      category: 'payments',
      title: 'Pembayaran biaya pengelolaan diverifikasi',
      body: `Pembayaran biaya pengelolaan yang menjadi kewajiban Owner telah diverifikasi. Nominal ${amount(payload.amount) ?? 'tersedia pada rincian'}.`,
      priority: 'normal',
    };
  }
  let body = fact.body;
  if (event.event_type === 'lease.check_in_confirmed' && !owner) {
    const period = payload.service_period as { startDate?: string; endDate?: string } | undefined;
    if (period?.startDate && period.endDate)
      body += ` Periode sewa: ${period.startDate} sampai ${period.endDate}.`;
  }
  if (event.event_type === 'room.inspection_resolved') {
    const label = roomStatusLabels[String(payload.next_status)];
    if (label) body += ` Kamar ${label}.`;
  }
  if (
    event.event_type === 'work_order.status_changed' ||
    event.event_type === 'complaint.status_changed'
  ) {
    const label = serviceStatusLabels[String(payload.to_status)];
    if (label) body += ` Status: ${label}.`;
  }
  if (event.event_type.startsWith('property_owner.')) {
    if (typeof payload.period === 'string') body += ` Periode ${payload.period.slice(0, 7)}.`;
    if (event.event_type === 'property_owner.realization.published') {
      body += ` ${Number(payload.room_count) || 0} kamar; Hak Owner ${amount(payload.entitlement_amount) ?? 'tersedia pada rincian'}.`;
    }
    if (event.event_type === 'property_owner.transfer.verified') {
      body += ` Nominal ${amount(payload.amount) ?? 'tersedia pada rincian'}.`;
      if (typeof payload.transferred_at === 'string')
        body += ` Tanggal ${payload.transferred_at.slice(0, 10)}.`;
      if (typeof payload.reference === 'string') body += ` Referensi ${payload.reference}.`;
    }
    // Correction reasons may include private Admin notes; the Owner receives a safe explanation.
    if (event.event_type === 'property_owner.realization.corrected')
      body += ' Alasan: penyelesaian kelebihan transfer yang tercatat.';
    if (event.event_type === 'property_owner.realization.state_changed') {
      const label = (
        {
          draft: 'draft',
          awaiting_review: 'menunggu pemeriksaan',
          approved: 'disetujui',
          submitted_to_finance: 'diajukan ke Keuangan',
          awaiting_transfer: 'menunggu transfer',
        } as Record<string, string>
      )[String(payload.status)];
      if (label) body += ` Status: ${label}.`;
    }
  }
  return { ...fact, body };
}
