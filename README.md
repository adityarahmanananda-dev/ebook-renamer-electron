# Ebook Renamer

[![CI](https://github.com/adityarahmanananda-dev/ebook-renamer-electron/actions/workflows/ci.yml/badge.svg)](https://github.com/adityarahmanananda-dev/ebook-renamer-electron/actions/workflows/ci.yml)

Aplikasi desktop **Electron** untuk menscan folder berisi file `.epub` / `.pdf`,
mengekstrak metadata judul & penulis, mencari hasil terbaik lewat
**Open Library** dan **Google Books**, lalu merename file ke format
`[Judul]-[Penulis]`.

## Cara pakai

```bash
npm install      # sekali saja (pertama kali)
npm start        # selanjutnya cukup ini
```

`npm start` otomatis menginstal dependensi client kalau belum ada, build React
kalau belum ada, lalu membuka jendela app.

Di dalam aplikasi:
1. Klik **📁 Pilih Folder…** untuk memilih folder lewat dialog native (tanpa ketik path manual).
2. Klik **Scan Folder**.
3. Klik **Cari otomatis** per file (atau isi judul/penulis manual).
4. Klik **Terapkan Semua Rename**.

## Opsional: API key Google Books

Untuk hasil pencarian yang lebih stabil:
```bash
GOOGLE_BOOKS_API_KEY=xxx npm start
```
Tanpa key, Open Library tetap dipakai sebagai fallback. Setiap provider punya
timeout agar tidak menggantung.

## Struktur proyek

```
electron/        main process + preload (dialog pilih folder via IPC)
server/src/      backend Express (scan, ekstrak metadata, search, rename)
client/          frontend React (Vite)
launch.mjs       launcher: auto-install + build + jalankan Electron
```

## Packaging (installer)

```bash
npm run dist     # hasil di folder release/ (AppImage / deb)
```

`release/` adalah artefak build dan tidak ikut di-commit.
