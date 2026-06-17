# Security Policy

## Baseline

- Secret hanya di backend atau environment deployment, tidak di frontend bundle.
- Gunakan PostgreSQL untuk data utama dan Redis untuk cache/rate limit/queue.
- Semua API state-changing wajib auth, authorization, validation, dan audit bila sensitif.
- Smart lock dan CCTV diperlakukan sebagai fitur keamanan tinggi.
- PWA Penghuni harus membatasi data hanya untuk Penghuni terkait.

## Data dan Bahasa UI

- Gunakan istilah "Penghuni" pada UI.
- Hindari membocorkan ID internal, secret, raw provider response, atau URL private CCTV.
