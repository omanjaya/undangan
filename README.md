# Temu — Undangan Online

Website undangan pernikahan dan Pawiwahan Bali dengan Astro dan TypeScript. Temu menyediakan halaman tamu responsif, tiga tema dengan ornamen khusus, serta dashboard untuk mengelola konten, media, kehadiran, dan ucapan.

Implementasi saat ini ditujukan untuk **satu pemilik, satu undangan, dan satu instance aplikasi**. Rancangan platform multi-workspace di [PLANNING.md](PLANNING.md) merupakan pengembangan lanjutan, bukan fitur yang sudah tersedia.

## Daftar isi

- [Fitur](#fitur)
- [Teknologi](#teknologi)
- [Menjalankan lokal](#menjalankan-lokal)
- [Docker development dan hot reload](#docker-development-dan-hot-reload)
- [Konfigurasi environment](#konfigurasi-environment)
- [Mengelola undangan](#mengelola-undangan)
- [Tema dan aset desain](#tema-dan-aset-desain)
- [Arsitektur dan penyimpanan](#arsitektur-dan-penyimpanan)
- [Pemeriksaan kode](#pemeriksaan-kode)
- [Deployment](#deployment)
- [Keamanan dan batas implementasi](#keamanan-dan-batas-implementasi)
- [Pemecahan masalah](#pemecahan-masalah)

## Fitur

### Halaman tamu

- Cover sebelum membuka undangan dengan ornamen hasil generasi khusus per tema dan sapaan nama penerima.
- Identitas pasangan, keluarga, cerita, jadwal WITA, penanggalan Bali manual, serta acara tambahan.
- Aksara Bali, kutipan Veda dengan transliterasi, terjemahan bebas, dan sumber.
- Parallax foto, kemunculan teks bertahap, serta ornamen berlapis dengan dukungan `prefers-reduced-motion`.
- Slideshow dengan jeda, keyboard, dan swipe; galeri layar penuh dengan zoom dan pan.
- Peta Google Maps langsung di bagian acara, tombol lokasi, dan tautan Google Calendar.
- Musik setelah tamu membuka undangan, video unggahan, dan embed YouTube dengan koordinasi playback.
- RSVP hingga lima orang per respons dan ucapan yang ditampilkan setelah moderasi.
- Navigasi cepat di HP serta gambar berbagi Open Graph 1200×630 dari konten terbit.

### Dashboard pemilik

- Login, editor konten, tema, font, dan kepadatan ornamen.
- Autosave dengan status penyimpanan dan deteksi konflik antar-tab.
- Preview desktop dan ponsel; draft terpisah dari konten yang sudah terbit.
- Unggah banyak file melalui pemilih file atau drag-and-drop.
- Crop foto menjadi aset baru, pengaturan titik fokus, dan pengurutan galeri.
- Pustaka media dengan thumbnail, ukuran file, dan penanda penggunaan dalam draft.
- Checklist sebelum publish, pengaturan slug, publish/unpublish, dan pembuat tautan penerima.
- Rekap RSVP serta moderasi ucapan.

## Teknologi

| Bagian              | Implementasi                                              |
| ------------------- | --------------------------------------------------------- |
| Frontend dan server | Astro 7, adapter Node standalone, TypeScript              |
| Tampilan            | Komponen Astro, CSS, JavaScript untuk interaksi           |
| Validasi            | Zod                                                       |
| Database            | PostgreSQL 17 pada Docker; JSONB transaksional            |
| Media               | Sharp, pemeriksaan tipe file, penyimpanan lokal persisten |
| Pengujian           | Vitest dan Astro Check                                    |
| Infrastruktur       | Node.js 24, Docker Compose Watch, Caddy untuk HTTPS       |
| Tipografi dan ikon  | Font lokal, ikon SVG tanpa emoji                          |

## Menjalankan lokal

Prasyarat: **Node.js 24** dan npm. Jalankan dari direktori proyek. Salin contoh environment hanya jika belum memiliki `.env`.

```sh
cp .env.example .env
npm ci
npm run dev -- --host 0.0.0.0
```

Buka [http://localhost:4321](http://localhost:4321). Development dapat berjalan tanpa PostgreSQL: `DATABASE_URL` pada contoh environment sengaja dikomentari dan data disimpan di `.data/state.json`.

Kredensial **khusus development**:

| Kolom    | Nilai                  |
| -------- | ---------------------- |
| Email    | `owner@undangan.local` |
| Password | `demo-undangan-2026`   |

Ganti `OWNER_EMAIL` dan `OWNER_PASSWORD` sebelum penggunaan di luar development.

Untuk menggunakan PostgreSQL lokal, isi `DATABASE_URL` di `.env`, lalu jalankan:

```sh
npm run db:migrate
npm run db:seed
npm run dev -- --host 0.0.0.0
```

Migrasi dan seed mempertahankan data yang sudah ada. Seed membuat undangan contoh Amara & Raka apabila belum tersedia. Berpindah dari penyimpanan file ke PostgreSQL tidak otomatis memindahkan data file.

### Halaman utama

| URL                        | Kegunaan                               |
| -------------------------- | -------------------------------------- |
| `/`                        | Landing page dan koleksi desain        |
| `/login`                   | Login pemilik                          |
| `/dashboard`               | Pengelolaan undangan                   |
| `/themes/jepun-ivory`      | Contoh tema Jepun Ivory                |
| `/themes/puri-emerald`     | Contoh tema Puri Emerald               |
| `/themes/senja-terracotta` | Contoh tema Senja Terracotta           |
| `/i/{slug}`                | Undangan yang sudah terbit             |
| `/i/{slug}?preview=1`      | Preview draft, memerlukan sesi pemilik |
| `/api/og/{slug}.png`       | Gambar berbagi undangan terbit         |
| `/api/health`              | Healthcheck aplikasi                   |

Untuk menguji dari HP dalam Wi-Fi yang sama, gunakan `http://IP-LAN-KOMPUTER:4321`. Pastikan firewall mengizinkan akses port tersebut.

## Docker development dan hot reload

Prasyarat: Docker Engine/Desktop aktif dan Docker Compose yang mendukung Watch dengan `sync+restart` (minimal versi 2.23).

```sh
cp .env.example .env

docker compose run --build --rm web npm run db:migrate
docker compose run --rm web npm run db:seed
docker compose up --build --watch
```

Buka [http://localhost:4321](http://localhost:4321). Compose menyediakan PostgreSQL dan menunggu database sehat sebelum menjalankan aplikasi.

| Perubahan                           | Perilaku Watch                                              |
| ----------------------------------- | ----------------------------------------------------------- |
| `src/`, `public/`, `db/`            | Sinkronisasi ke container; komponen/CSS mengikuti HMR Astro |
| `package.json`, `package-lock.json` | Rebuild image                                               |
| `astro.config.mjs`, `tsconfig.json` | Sinkronisasi dan restart aplikasi                           |
| `.env`, konfigurasi Compose         | Jalankan ulang perintah `up --build --watch`                |

Migrasi database tetap dijalankan secara eksplisit; perubahan file migrasi tidak otomatis diterapkan. Direktori aset asli `assets/` tidak disinkronkan Watch; salinan web yang dipakai halaman berada di `public/`.

Perintah operasional:

```sh
docker compose ps
docker compose logs -f web
docker compose exec web npm run db:migrate
docker compose exec web npm run db:seed
docker compose down
```

PostgreSQL tidak membuka port ke host. Database dan upload disimpan dalam named volume. `docker compose down` mempertahankan data; **`down -v` menghapus volume dan datanya**.

Jika port 4321 sudah digunakan:

```sh
WEB_PORT=4322 docker compose up --build --watch
```

Development dapat diakses melalui jaringan lokal. Set `WEB_BIND_ADDRESS=127.0.0.1` untuk membatasi akses ke komputer sendiri.

## Konfigurasi environment

Gunakan [.env.example](.env.example) untuk development dan [.env.production.example](.env.production.example) untuk deployment. Jangan commit environment berisi kredensial.

| Variabel            | Kegunaan                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `OWNER_EMAIL`       | Email login pemilik                                                                                    |
| `OWNER_PASSWORD`    | Password pemilik; production minimal 16 karakter dan tidak boleh memakai nilai demo                    |
| `DATABASE_URL`      | Koneksi PostgreSQL; wajib pada production, disediakan otomatis oleh Compose                            |
| `POSTGRES_PASSWORD` | Password PostgreSQL pada Compose; gunakan nilai aman untuk URI, misalnya hex acak                      |
| `APP_URL`           | Origin HTTPS publik untuk validasi origin dan URL metadata; tidak perlu diisi saat pengujian lokal/LAN |
| `APP_DOMAIN`        | Domain untuk Caddy pada konfigurasi HTTPS                                                              |
| `WEB_PORT`          | Port host aplikasi; default `4321`                                                                     |
| `WEB_BIND_ADDRESS`  | Bind address development; default `0.0.0.0`; Compose production selalu localhost                       |
| `UPLOAD_STORAGE_MB` | Kuota total upload; default `1024` MB, contoh production memakai `2048` MB                             |
| `UPLOAD_DIR`        | Direktori upload runtime; default `.data/uploads`, Compose memakai `/app/.data/uploads`                |
| `DATA_DIR`          | Direktori state file development; default `.data`                                                      |

Compose memakai environment yang tercantum pada service. Mengubah lokasi data lewat variabel host saja tidak mengganti mount volume di dalam container.

## Mengelola undangan

1. Masuk melalui `/dashboard`.
2. Pilih tema, font, dan kepadatan ornamen.
3. Lengkapi nama pasangan, keluarga, tanggal, lokasi, serta acara tambahan. Semua jadwal memakai WITA.
4. Unggah media dan pasangkan ke foto sampul, pasangan, cerita, galeri, video, atau musik.
5. Atur crop, titik fokus, dan urutan galeri. Crop membuat file baru tanpa menimpa aset asli.
6. Tunggu status autosave selesai, lalu periksa preview desktop/ponsel dan checklist.
7. Klik **Terbitkan draft**. Edit berikutnya tetap menjadi draft sampai diterbitkan kembali.
8. Buat tautan penerima, lalu pantau RSVP dan moderasi ucapan.

Contoh tautan personal: `/i/amara-raka?to=Keluarga+Wayan`. Parameter nama hanya mengubah sapaan, bukan menjadi token akses atau verifikasi identitas.

Jika muncul konflik versi, salin perubahan yang ingin dipertahankan sebelum memuat ulang draft terbaru. Preview editor tidak mengirim RSVP; gunakan halaman terbit untuk alur tamu.

### Mode tanpa foto

Koleksi landing dan navigasi halaman contoh menyediakan pilihan **Dengan Foto / Tanpa Foto**. Preview tanpa foto memiliki rute statis tersendiri, misalnya `/themes/jepun-ivory/tanpa-foto`, dan slideshow ilustrasi khusus tema. Contoh mode Dengan Foto masih memakai ilustrasi pengganti; foto pribadi dipilih dari editor.

Di Dashboard → Desain → Gaya visual utama, pilih **Tanpa Foto**. Sampul memakai ornamen dan monogram tema, profil pasangan menjadi kartu tipografi tanpa placeholder foto, cerita memakai ilustrasi, serta penutup menampilkan monogram. Galeri foto disembunyikan; aktifkan **Tampilkan slideshow ilustrasi** jika ingin rangkaian ornamen. Video dan musik tetap dapat digunakan.

Foto yang sudah dipilih tidak dihapus; kembali ke **Dengan Foto** untuk menampilkannya lagi. Preview berbagi juga mengikuti mode tanpa foto. Perubahan mode disimpan sebagai draft dan baru terlihat publik setelah diterbitkan.

### Media dan peta

| Media | Format             | Batas per file |
| ----- | ------------------ | -------------- |
| Foto  | JPG, PNG, WebP     | 10 MB          |
| Video | MP4, WebM          | 80 MB          |
| Musik | MP3, M4A, OGG, WAV | 20 MB          |

Foto dioptimasi menjadi WebP tanpa metadata. Audio/video tidak ditranscode; MP4 H.264/AAC disarankan untuk kompatibilitas. Galeri menampung maksimal 12 foto. Tanpa foto, slideshow memakai ilustrasi ornamen. Foto penutup memakai foto cerita, foto sampul, atau foto galeri pertama; tanpa foto ditampilkan monogram.

- **Google Maps:** isi tautan lokasi untuk tombol petunjuk arah. Untuk pin embed yang tepat, gunakan Google Maps → Bagikan → Sematkan peta, kemudian tempel URL `src` atau kode iframe di kolom embed. Aplikasi mengambil dan memvalidasi URL; HTML tidak dijalankan. Tanpa embed, halaman menampilkan perkiraan berdasarkan nama tempat/alamat.
- **YouTube:** tempel tautan watch, youtu.be, Shorts, live, atau embed. Aplikasi membuat player `youtube-nocookie` sendiri. Jika diisi, YouTube menggantikan video unggahan; video harus mengizinkan embed. Tautan langsung tetap tersedia jika player gagal.
- **Musik:** dimulai sesudah tamu menekan Buka undangan, mengikuti kebijakan browser; playback video menjeda musik.
- **Preview berbagi:** isi `APP_URL` dengan domain publik yang benar. WhatsApp tidak dapat mengambil gambar dari localhost.

## Tema dan aset desain

| Tema             | Karakter                                                     |
| ---------------- | ------------------------------------------------------------ |
| Jepun Ivory      | Ivory, floral jepun, daun sage, dan ruang kosong yang lapang |
| Puri Emerald     | Hijau zamrud, gapura emas, serta komposisi simetris          |
| Senja Terracotta | Warna tanah hangat, bunga tropis, dan bingkai organik        |

Aset cover dibuat dengan built-in imagegen, disimpan dalam PNG transparan, kemudian dioptimasi menjadi WebP untuk website.

- [Aset cover asli](assets/cover-ornaments/) dan [prompt generasi](assets/cover-ornaments/PROMPTS.md).
- [Aset cover web](public/ornaments/covers/).
- [Koleksi ornamen web](public/ornaments/) dan [ornamen tiap tema](public/ornaments/theme-pack/).
- [Catatan sumber aksara dan kutipan](RESEARCH-BALI.md).

Pertahankan versi asli ketika mengubah aset; gunakan nama file baru untuk varian. Font Latin, Bali, dan Devanagari disajikan lokal. Tidak ada ketergantungan foto pihak ketiga untuk tampilan default.

## Arsitektur dan penyimpanan

```text
src/
  pages/                       Halaman Astro dan endpoint HTTP
  components/dashboard/        Editor dan interaksi pemilik
  components/invitation/       Cover, acara, RSVP, slideshow, galeri, motion
  modules/invitations/
    domain/                    Skema dan aturan konten
    infrastructure/            Persistence PostgreSQL / file development
  server/                      Use case, autentikasi, validasi request, media
  styles/                      Gaya bersama dan variasi tema
assets/                        Aset sumber dan bahan desain
public/ornaments/              Aset web yang disajikan langsung
db/                            Migrasi dan seed
scripts/                       Preflight dan backup
deploy/                        Konfigurasi Caddy
```

Alur utama: **pages/komponen → services → domain dan infrastructure**. Komponen presentasi memakai komponen bersama; aturan bisnis dan validasi berada di server/domain. Draft dan snapshot publish disimpan terpisah.

Runtime PostgreSQL memakai tabel **`app_state` berisi aggregate JSONB**, termasuk undangan, versi, RSVP, ucapan, dan hash sesi. Mutasi memakai penguncian baris dan transaksi. Ini belum merupakan skema relasional multi-tenant yang dirancang di planning.

Fallback file development menggunakan penulisan atomik ke `.data/state.json`. Jalankan satu proses saja dalam mode ini; production menolak fallback file. Detail implementasi tersedia di [db/README.md](db/README.md).

## Pemeriksaan kode

```sh
npm run check
npm test
npm run build
npm run format:check
```

Gunakan `npm run format` untuk merapikan kode. `npm run preview` tersedia untuk preview build lokal; production Docker menjalankan `dist/server/entry.mjs` secara langsung.

Validasi Compose:

```sh
docker compose config --quiet
docker compose --env-file .env.production -f compose.production.yaml -f compose.https.yaml config --quiet
```

Pemeriksaan terakhir fitur pada 18 September 2026: **26 tes lulus**, Astro Check pada 59 file tanpa error/warning/hint, dan build berhasil. Riwayat verifikasi browser, Docker, serta batas pengujian ada di [VERIFICATION.md](VERIFICATION.md). Ini bukan klaim benchmark Core Web Vitals atau audit keamanan menyeluruh.

## Deployment

Gunakan satu server dengan Docker Compose dan domain yang mengarah ke server tersebut. `compose.production.yaml` adalah konfigurasi mandiri, bukan override development. Runtime berjalan sebagai user `node`, tanpa HMR, dengan volume persisten.

```sh
cp .env.production.example .env.production
# Edit .env.production dengan domain dan kredensial sebenarnya.
npm run deploy:check

docker compose --env-file .env.production -f compose.production.yaml run --build --rm migrate
docker compose --env-file .env.production -f compose.production.yaml run --rm migrate npm run db:seed
docker compose --env-file .env.production -f compose.production.yaml -f compose.https.yaml up --build -d
```

Preflight membutuhkan Node.js 24 pada host. Caddy mengurus HTTPS setelah DNS serta port 80/443 tersedia. Volume development dan production dipisahkan melalui nama project Compose. Font untuk rendering gambar Open Graph sudah disertakan dalam Docker.

Ikuti [DEPLOYMENT.md](DEPLOYMENT.md) untuk konfigurasi lengkap, backup, dan restore. Deployment publik belum dikonfigurasi dalam proyek ini.

## Keamanan dan batas implementasi

- Sesi pemilik memakai token acak; server menyimpan hash, dengan masa berlaku 24 jam. Cookie production memakai `Secure`, `HttpOnly`, dan `SameSite=Lax`.
- Mutasi memerlukan origin yang sesuai. Preview draft memerlukan autentikasi; media privat tidak dapat dibaca anonim.
- Upload diperiksa berdasarkan signature, nama file dibuat server, dan akses publik terbatas pada media yang dipakai undangan terbit.
- Ucapan publik hanya yang sudah disetujui pemilik. URL embed divalidasi dan halaman memakai security headers.
- Rate limit masih berada dalam memori satu instance.
- RSVP mengenali browser melalui cookie; tidak memverifikasi identitas dan tidak menyinkronkan respons lintas perangkat.
- Belum tersedia pendaftaran akun, multi-owner, pembayaran, custom domain per undangan, S3, undangan privat bertoken, MFA, atau pengiriman pesan otomatis.

## Pemecahan masalah

| Gejala                                           | Tindakan                                                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Port 4321 terpakai                               | Gunakan `WEB_PORT=4322` pada Compose, atau `npm run dev -- --port 4322` lokal                                  |
| Database belum siap / tabel belum ada            | Periksa `docker compose ps` dan log; jalankan migrasi lalu seed                                                |
| Perubahan kode tidak muncul di Docker            | Pastikan menjalankan `up --watch`; file harus berada dalam jalur Watch                                         |
| Container development bermasalah setelah restart | Command bawaan memakai `--ignore-lock` untuk lock PID Astro; periksa log aplikasi sebelum mengubah konfigurasi |
| Upload ditolak                                   | Periksa format, batas ukuran, kuota, sesi pemilik, dan ruang disk                                              |
| Draft bertabrakan antar-tab                      | Simpan salinan perubahan yang diperlukan lalu muat ulang draft terbaru                                         |
| Peta kurang tepat                                | Tambahkan URL embed pin Google Maps, bukan hanya alamat teks                                                   |
| Musik/video belum berbunyi                       | Buka undangan melalui tombol; periksa format media dan pembatasan browser/YouTube                              |
| Preview WhatsApp tidak tampil                    | Pastikan undangan sudah terbit serta domain dan `APP_URL` dapat diakses publik                                 |
| Request production ditolak karena origin         | Cocokkan origin HTTPS yang dipakai pengguna dengan `APP_URL`                                                   |

Dokumen tambahan: [Checklist fitur](UPGRADE-CHECKLIST.md), [system design](PLANNING.md), dan [panduan deployment](DEPLOYMENT.md).
