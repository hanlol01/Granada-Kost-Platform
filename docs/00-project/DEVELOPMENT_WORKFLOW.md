# Development Workflow

## Setup

```powershell
cd "D:\PROJECT CODING\Granada Kost Platform"
npm install
```

## Menjalankan App

```powershell
npm run dev:admin
npm run dev:penghuni
```

## Build dan Lint

```powershell
npm run build:admin
npm run build:penghuni
npm run lint:admin
npm run lint:penghuni
```

## Aturan Perubahan

- Ubah satu app saja jika kebutuhan hanya spesifik Admin atau Penghuni.
- Ekstrak ke `packages/*` hanya ketika ada kontrak atau komponen yang benar-benar dipakai bersama.
- Jangan menambah package manager kedua.
- Jangan commit `node_modules`, `dist`, `.env`, atau artefak build.
