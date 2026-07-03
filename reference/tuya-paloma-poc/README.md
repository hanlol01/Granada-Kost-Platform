# Tuya Smart Lock API Tester

> **Kostation M13 Reference PoC**
>
> This project is a legacy proof-of-concept used to verify PALOMA / Tuya / Smart Life smart lock integration before Kostation M13.
>
> It successfully proved basic Tuya Cloud connectivity and live lock/unlock behavior against a PALOMA smart lock.
>
> This folder must be treated as a **technical reference only**, not production-ready Kostation code.
>
> Do not copy this code directly into production modules.
> Do not commit real Tuya secrets, access tokens, device owner credentials, or production `.env` files.
> Use this PoC only to understand Tuya auth/signing, region/base URL selection, device payloads, and lock/unlock command behavior.

Proof of Concept minimal untuk menguji Tuya Cloud API pada smart lock PALOMA / Tuya / Smart Life. Aplikasi ini hanya berisi koneksi Tuya, pembacaan device, pengujian unlock/lock, dan Raw API Tester.


## Prasyarat

- Node.js 20 atau lebih baru
- Tuya Cloud Project dengan device Smart Life/Tuya yang sudah ditautkan
- API services yang diperlukan sudah di-subscribe pada Tuya Cloud Project
- Endpoint region harus sesuai dengan data center cloud project/device

Contoh endpoint:

- Singapore: `https://openapi-sg.iotbing.com`
- Western America: `https://openapi.tuyaus.com`
- Eastern America: `https://openapi-ueaz.tuyaus.com`
- Central Europe: `https://openapi.tuyaeu.com`
- Western Europe: `https://openapi-weaz.tuyaeu.com`
- China: `https://openapi.tuyacn.com`

## Install

Dari folder `tuya-smartlock-tester`:

```bash
npm install
npm run install:all
```

Atau install backend dan frontend secara terpisah:

```bash
cd backend
npm install

cd ../frontend
npm install
```

## Konfigurasi Backend

Salin `backend/.env.example` menjadi `.env` di folder utama atau `backend/.env`, lalu isi:

```env
PORT=3000
TUYA_CLIENT_ID=isi_access_id_cloud_project
TUYA_CLIENT_SECRET=isi_access_secret_cloud_project
TUYA_ENDPOINT=https://openapi-sg.iotbing.com
TUYA_DEVICE_ID=isi_device_id_smart_lock
TUYA_LANG=en
SAFE_MODE=true
```

Credential hanya dibaca backend. Client secret tidak pernah dikirim ke frontend atau ditulis utuh ke log.

Backend memuat `.env` dari folder utama terlebih dahulu. Jika `backend/.env` tersedia, nilainya menjadi override.

## Menjalankan Aplikasi

Jalankan backend dan frontend sekaligus dari folder utama:

```bash
npm run dev
```

Buka `http://localhost:5173`.

Backend tersedia di `http://localhost:3000`. Endpoint lokal:

```text
GET  /health
GET  /api/tuya/token
GET  /api/device
GET  /api/device/status
GET  /api/device/functions
GET  /api/device/specifications
POST /api/lock/unlock
POST /api/lock/lock
POST /api/tuya/raw
```

## SAFE_MODE

Default `SAFE_MODE=true`:

- Tombol Unlock dan Lock hanya melakukan simulasi.
- Raw API Tester hanya mengizinkan request `GET`.

Untuk benar-benar menguji kontrol pintu, ubah:

```env
SAFE_MODE=false
```

Restart backend setelah mengubah `.env`. Pastikan pintu dan area sekitarnya aman sebelum mengirim unlock.

## Flow Unlock dan Lock

Unlock mencoba flow resmi smart lock berikut:

1. Meminta ticket melalui `POST /v1.0/smart-lock/devices/{device_id}/password-ticket`.
2. Mengirim unlock melalui `POST /v1.0/smart-lock/devices/{device_id}/password-free/door-operate`.
3. Jika gagal, mencoba fallback password-free open-door versi lama.

Lock mencoba `password-free/door-operate` dengan `open: false`. Tidak semua smart lock mendukung remote lock; banyak device hanya mendukung automatic locking. Semua hasil percobaan dan error Tuya ditampilkan agar kemampuan device dapat dianalisis.

Unlock/lock hanya akan berhasil jika model device, firmware, status online, API subscription, permission cloud project, dan konfigurasi remote unlocking pada lock mendukungnya.

## Raw API Tester

Body lokal:

```json
{
  "method": "GET",
  "path": "/v1.0/devices/DEVICE_ID/status",
  "body": {}
}
```

Gunakan relative path Tuya yang diawali `/`. Semua request ditandatangani dan dikirim oleh backend. Field sensitif seperti token, secret, local key, ticket key, dan password dimasking sebelum response dikirim ke frontend.

## Troubleshooting Singkat

- `CONFIG_MISSING`: isi field yang disebutkan di `backend/.env`.
- Signature invalid: periksa client ID/secret, waktu sistem, dan endpoint region.
- Permission denied: tautkan device ke cloud project dan periksa authorization API.
- API not subscribed: subscribe layanan IoT Core/Smart Lock yang diperlukan.
- Device offline: pastikan lock atau gateway online; lock baterai dapat tidur ketika idle.
- Instruction not supported: device tidak mendukung perintah tersebut.
- Remote lock gagal: kemungkinan device hanya mendukung automatic locking.

## Referensi Tuya

- [Sign Requests for Cloud Authorization](https://developer.tuya.com/en/docs/iot/singnature?id=Kbw0q34cs2e5g)
- [Smart Lock Open APIs](https://developer.tuya.com/en/docs/cloud/smart-door-lock?id=K9jgsgd4cgysr)
- [Remote Unlocking APIs](https://developer.tuya.com/en/docs/cloud/doorlock-api-remoteopen?id=Kbe2nm6j9hcsj)
- [Get Device Specification](https://developer.tuya.com/en/docs/cloud/85b8f49180?id=Kb5rg8mvrccb7)
