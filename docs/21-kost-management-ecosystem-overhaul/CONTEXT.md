# KMO Context and Canonical Terms

Status: `CURRENT AUTHORITY`

This file is the short entry point for agents. Detailed rules live in the linked
policy and architecture documents.

## Product Context

Kostation operates Rumah Kost and Apart Kost assets on behalf of asset owners.
Residents rent rooms; Property Owners own economic rights over assigned assets;
Kostation remains the operational manager. Ownership, operational authority,
tenancy, occupancy, payment, and reporting are separate authorities.

## Canonical Terms

| Term                               | Canonical meaning                                                                                                                                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Property Owner**                 | The contractual/economic owner of an assigned Rumah Kost building or selected Apart Kost rooms. Technical role: `property_owner`. It is not the global operational role `owner`.                                                                               |
| **Owner Profile**                  | Admin-managed identity, contact, account link, payout destination, and lifecycle status for one Property Owner. One profile has at most one login account.                                                                                                     |
| **Owner Account**                  | Read-only authenticated account linked to one Owner Profile. Login accepts normalized email or phone.                                                                                                                                                          |
| **Ownership Assignment**           | Effective-dated, non-overlapping record that attributes an asset to one Property Owner. It is not property membership, room authority, lease, occupancy, or payment authority.                                                                                 |
| **Building Ownership**             | Rumah Kost authority: one assignment covers one whole building and all current and future rooms within it.                                                                                                                                                     |
| **Room Ownership**                 | Apart Kost authority: one assignment covers one selected room. It never implies ownership of the whole Apart Kost building.                                                                                                                                    |
| **Ownership Period**               | Half-open effective interval `[effective_from, effective_until)` used for access and financial attribution.                                                                                                                                                    |
| **Batch Ownership Period Closure** | Admin command that closes multiple selected assignments of one ownership kind at one effective end date. It is atomic, idempotent, audited, and never deletes asset or ownership history.                                                                      |
| **Kostation-Owned**                | Display state for an asset without an effective owner assignment. No synthetic owner account is created.                                                                                                                                                       |
| **Gross Earned Rent**              | Verified rent collected for service already delivered during an occupancy period. It is not the same as cash received in advance.                                                                                                                              |
| **Owner Entitlement**              | The Property Owner share of Gross Earned Rent for an asset and ownership period. It is calculated from the contractual monthly tariff less the effective Kostation Management Fee for earned service.                                                          |
| **Kostation Management Fee**       | Kostation's service share of Gross Earned Rent. Current policy: Rp300.000 per occupied room per earned month at the standard tariff. It is not an operating expense.                                                                                           |
| **Duration Pricing Tier**          | One monthly room rate selected from the whole contractual duration: Short Stay (3–5 months), Medium Stay (6–11 months), or Long Stay (12+ months). The selected rate applies to every month of that contract.                                                  |
| **Commercial Effective Date**      | The tenancy start date used to select the applicable effective-dated pricing authority. A later tariff change never rewrites an existing lease snapshot.                                                                                                       |
| **Owner Settlement**               | Monthly review artifact that reconciles earned rent, owner entitlement, management fee, adjustments, and payout.                                                                                                                                               |
| **Owner Payout**                   | Money actually disbursed after a settlement is approved. It is not created merely because rent was paid.                                                                                                                                                       |
| **Pembayaran Angsuran Sewa**       | Pembayaran sewa terverifikasi setelah DP atau pembayaran sewa pertama. Nomornya berurutan tetap dalam satu kontrak; Booking Fee dan Security Deposit tidak dihitung, sedangkan pembalikan tidak memakai ulang nomor lama.                                      |
| **Kontrak Sewa Lunas**             | Keadaan ketika seluruh kewajiban sewa satu kontrak telah diterima dan dokumen bukti pelunasan kontrak yang valid telah diterbitkan. Security Deposit tidak menentukan status ini; pembalikan yang membuka kewajiban kembali membatalkan status dan dokumennya. |
| **Koreksi Data Penyewaan**         | Perintah Admin untuk memperbaiki fakta tanggal check-in, tanggal mulai, atau durasi kontrak yang salah input. Koreksi menyimpan nilai sebelum dan sesudah, alasan, pelaku, serta dampak keuangan; bukti lama tidak dihapus.                                    |
| **Tagihan Koreksi Kontrak**        | Kewajiban sewa tambahan yang terbit ketika Nilai Kontrak hasil koreksi lebih besar. Ini bukan pembayaran dan bukan biaya lain-lain.                                                                                                                            |
| **Kredit Koreksi Kontrak**         | Pengurang kewajiban tagihan sewa ketika Nilai Kontrak hasil koreksi lebih kecil. Ini bukan uang masuk, pendapatan, atau pengembalian dana yang sudah dibayarkan.                                                                                               |

## Binding Separation Rules

```text
Property Owner != global owner role
Ownership Assignment != property membership
Building Ownership != Room Ownership
Room Ownership != room operational authority
Booking Lead != Hold != Lease != Occupancy
Payment != Earned Rent != Owner Entitlement != Owner Payout
Management Fee != Expense
Security Deposit != Rent Revenue
```

## Commercial Agreement and Checkout Language

**Tarif Acuan**:
Harga bulanan resmi dari tier durasi yang berlaku pada kategori kamar sebelum
kesepakatan khusus. Untuk kontrak khusus 1–2 bulan, tier 3–5 bulan menjadi
pembanding saja dan tidak membuat durasi tersebut menjadi pilihan standar.
_Avoid_: harga kamar manual, harga sementara.

**Tarif Kesepakatan**:
Harga bulanan yang disetujui Admin melalui jalur kesepakatan khusus untuk satu
kontrak. Nilainya dapat sama atau berbeda dari Tarif Acuan; durasi 1–2 bulan tetap
memakai jalur ini. _Avoid_: diskon bebas, harga custom tanpa persetujuan.

**Nilai Kontrak**:
Tarif Kesepakatan atau Tarif Acuan yang berlaku dikalikan seluruh durasi kontrak
dan disimpan sebagai snapshot yang tidak berubah. _Avoid_: target bulanan.

**Pembayaran Masuk**:
Uang sewa yang sudah diverifikasi dan dialokasikan ke kewajiban kontrak.
_Avoid_: pendapatan tercatat, security deposit.

**Checkpoint Penyelesaian Sewa**:
Target kumulatif pembayaran sewa dan tanggal jatuh tempo yang dihitung server
dari snapshot kontrak. Checkpoint bukan transaksi pembayaran dan tidak mengubah
Nilai Kontrak.

**Pendapatan Tercatat**:
Bagian sewa yang sudah menjadi hak berdasarkan layanan yang telah berjalan,
bukan seluruh uang yang dibayar di muka. _Avoid_: total pembayaran.

**Pemberitahuan Check-out**:
Catatan resmi bahwa penghuni meminta mengakhiri hunian, sebelum serah-terima
fisik dan penyelesaian akhir.

**Check-out Fisik**:
Serah-terima aktual yang mengakhiri okupansi dan memindahkan kamar ke tahap
inspeksi. _Avoid_: sekadar menekan tombol keluar.

**Penyelesaian Akhir**:
Snapshot final yang memisahkan sewa yang telah menjadi hak, tagihan, kelebihan
pembayaran, security deposit, potongan, kompensasi pemberitahuan, dan refund.

**Denda Keterlambatan Check-out**:
Denda operasional setelah masa sewa berakhir bila penghuni belum menyerahkan
kamar dan akses hingga melewati masa toleransi tiga hari kalender. Denda dihitung
per hari dari snapshot tarif harian, dicatat terpisah dari sewa, deposit,
kerusakan, dan management fee. Catatan check-out lama dapat tetap membawa
kompensasi kekurangan pemberitahuan sebagai fakta historisnya.

**Status Operasional**:
Keadaan proses fisik check-out dan kamar: pemberitahuan, terjadwal, inspeksi,
atau selesai.

**Status Keuangan Akhir**:
Keadaan penyelesaian uang setelah check-out fisik: tertutup, masih harus bayar,
refund menunggu transfer, atau refund selesai. Penghapusan saldo terutang berada
di luar alur check-out sampai ada otoritas koreksi keuangan tersendiri.

## Current Economics

- Short Stay (3–5 months): Rp1.900.000 per month.
- Medium Stay (6–11 months): Rp1.850.000 per month.
- Long Stay (12 months or more): Rp1.800.000 per month for every contract month.
- These duration tiers are effective from 1 June 2026 for Rumah Kost and Apart Kost.
- Owner entitlement is the selected duration-tier rate minus the effective Kostation management fee: currently Rp1.600.000, Rp1.550.000, or Rp1.500.000 per earned month.
- Kostation management fee: Rp300.000 per earned occupied-room month.
- Booking Fee and DP are advance rent credits and become earned over service
  coverage; they are not immediately fully payable to an owner.
- Security deposit is a refundable liability and is excluded from owner revenue.
- Vacant or not-yet-activated rooms create neither owner entitlement nor
  management fee.
- Price tiers and management fees are separate effective-dated policies. A normal
  management-fee change starts on the first day of a future month and applies only
  to future earned service periods, including eligible active leases; it is never retroactive.
- A lease snapshots its selected pricing tier and monthly rate when committed.

## Primary References

- [Owner policy decisions and glossary](OWNER_POLICY_DECISIONS_AND_GLOSSARY.md)
- [Property Owner scope and experience](PROPERTY_OWNER_SCOPE_AND_EXPERIENCE.md)
- [Property Owner priority implementation plan](PROPERTY_OWNER_PRIORITY_IMPLEMENTATION_PLAN.md)
- [Data authority matrix](DATA_AUTHORITY_MATRIX.md)
- [Data model and migration](DATA_MODEL_AND_MIGRATION.md)
- [Billing, reminder, notification, and reporting](BILLING_REMINDER_NOTIFICATION_REPORTING.md)
