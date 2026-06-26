# Architecture Decisions

## ADR-001: Monorepo dengan App Terpisah

Admin dan Penghuni berada dalam satu monorepo tetapi tetap menjadi aplikasi terpisah. Ini menjaga deployment domain berbeda sambil memungkinkan shared package bertahap.

## ADR-002: Tetap React + TanStack

Project tidak dimigrasikan ke Next.js. Stack existing React + TanStack dipertahankan untuk mengurangi risiko perubahan fitur/UI besar.

## ADR-003: npm Workspaces

npm dipilih sebagai package manager tunggal karena project asal sudah memiliki `package-lock.json`, dukungan workspace stabil, dan kompatibilitas tim/deployment luas.

## ADR-004: Backend NestJS, PostgreSQL, Redis

Backend direncanakan menggunakan NestJS dengan PostgreSQL sebagai database utama dan Redis untuk cache, rate limit, serta queue.

## ADR-005: Bahasa Produk

UI menggunakan istilah "Penghuni". Istilah "tenant" boleh muncul hanya dalam kode teknis bila unavoidable, bukan sebagai copy UI.
