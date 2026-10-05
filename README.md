# Temu — Undangan Online

Website undangan pernikahan dan Pawiwahan Bali dengan Astro dan TypeScript. Temu menyediakan halaman tamu responsif dengan sembilan tema beranimasi, dashboard pelanggan, penagihan transfer manual, dan panel admin untuk menjual undangan sebagai layanan.

Temu adalah platform **multi-pelanggan**: pelanggan mendaftar sendiri, memperoleh ruang kerja (workspace) sendiri, dan menyusun undangan di sana, sedangkan **admin** (penjual) mengelola semuanya. Satu ruang kerja dapat menampung beberapa undangan, misalnya upacara dan tiap sesi resepsi, yang berbagi satu pustaka media, daftar tamu, dan anggaran. Data antar-ruang-kerja terisolasi penuh. Pelanggan membeli paket lewat transfer bank yang diverifikasi admin; lihat [Multi-akun](#multi-akun-dan-paket), [Penagihan](#penagihan-transfer-manual), dan [Panel admin](#panel-admin).

## Daftar isi

- [Fitur](#fitur)
- [Teknologi](#teknologi)
- [Menjalankan lokal](#menjalankan-lokal)
- [Docker development dan hot reload](#docker-development-dan-hot-reload)
- [Konfigurasi environment](#konfigurasi-environment)
- [Mengelola undangan](#mengelola-undangan)
- [Tema dan aset desain](#tema-dan-aset-desain)
- [Arsitektur dan penyimpanan](#arsitektur-dan-penyimpanan)
- [Multi-akun dan paket](#multi-akun-dan-paket)
- [Pemeriksaan kode](#pemeriksaan-kode)
- [Panel admin](#panel-admin)
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
- Animasi cover, pembukaan, dan singkapan foto yang khas per tema.
- Amplop digital (rekening, QRIS, alamat kado), tautan siaran langsung, dan pilihan bahasa Inggris.
- Tautan tamu pribadi (`?to=&g=`), QR masuk untuk check-in, dan balasan mempelai pada ucapan.

### Dashboard pemilik

- Login, editor konten, tema, font, dan kepadatan ornamen.
- Autosave dengan status penyimpanan dan deteksi konflik antar-tab.
- Preview desktop dan ponsel; draft terpisah dari konten yang sudah terbit.
- Unggah banyak file melalui pemilih file atau drag-and-drop.
- Crop foto menjadi aset baru, pengaturan titik fokus, dan pengurutan galeri.
- Pustaka media dengan thumbnail, ukuran file, dan penanda penggunaan dalam draft.
- Checklist sebelum publish, pengaturan slug, publish/unpublish, dan pembuat tautan penerima.
- Rekap RSVP serta moderasi ucapan.
- Anggaran pernikahan dengan estimasi, realisasi, pembayaran, pagu, dan ekspor CSV.
- Daftar tamu dengan impor, kirim via WhatsApp, status (terkirim/dibuka/RSVP), dan check-in QR dengan kamera.
- Ekspor RSVP dan ucapan ke CSV, hapus/balas ucapan, notifikasi Telegram.
- Paket & tagihan (transfer manual, unggah bukti, invoice cetak), pengaturan akun, lupa kata sandi, unduh/hapus data.

### Penjualan dan admin

- Landing page dengan daftar harga dari paket yang diatur admin, FAQ, halaman legal, kontak WhatsApp, sitemap, dan JSON-LD.
- Pendaftaran mandiri dengan masa uji coba (menyusun boleh, menerbitkan setelah membayar) dan hak fitur per paket.
- Panel admin: ringkasan pendapatan, persiapan sebelum berjualan, verifikasi pesanan, paket & harga, rekening tujuan, pelanggan (tangguhkan, masuk sebagai pelanggan, atur paket manual, akun klien untuk jasa), dan log aktivitas.

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

Buka [http://localhost:4321](http://localhost:4321). Development dapat berjalan tanpa PostgreSQL: `DATABASE_URL` pada contoh environment sengaja dikomentari dan data disimpan di `.data/global.json` serta `.data/workspaces/<id>.json`. Jika `.data/state.json` lama (single-owner) ada, isinya dipindahkan otomatis pada start pertama dan berkas lamanya dibiarkan sebagai cadangan.

Kredensial **khusus development** (admin yang dibuat otomatis pada penyimpanan file; pelanggan baru mendaftar lewat `/daftar`):

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
| `/login`                   | Masuk                                  |
| `/daftar`                  | Pendaftaran pelanggan baru             |
| `/admin`                   | Panel admin (hanya admin)              |
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

| Variabel                                                          | Kegunaan                                                                                                                           |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `OWNER_EMAIL`                                                     | Email admin pertama; hanya dipakai membuat admin saat belum ada pengguna (bootstrap/migrasi)                                       |
| `OWNER_PASSWORD`                                                  | Password admin pertama; production minimal 16 karakter dan bukan nilai demo. Tidak berpengaruh setelah admin ada; ganti lewat akun |
| `DATABASE_URL`                                                    | Koneksi PostgreSQL; wajib pada production, disediakan otomatis oleh Compose                                                        |
| `POSTGRES_PASSWORD`                                               | Password PostgreSQL pada Compose; gunakan nilai aman untuk URI, misalnya hex acak                                                  |
| `APP_URL`                                                         | Origin HTTPS publik untuk validasi origin dan URL metadata; tidak perlu diisi saat pengujian lokal/LAN                             |
| `APP_DOMAIN`                                                      | Domain untuk Caddy pada konfigurasi HTTPS                                                                                          |
| `WEB_PORT`                                                        | Port host aplikasi; default `4321`                                                                                                 |
| `WEB_BIND_ADDRESS`                                                | Bind address development; default `0.0.0.0`; Compose production selalu localhost                                                   |
| `UPLOAD_STORAGE_MB`                                               | Batas atas upload **per ruang kerja**; default `1024` MB. Paket dapat membatasi lebih kecil (uji coba 200 MB)                      |
| `UPLOAD_DIR`                                                      | Direktori upload runtime; default `.data/uploads`, Compose memakai `/app/.data/uploads`                                            |
| `DATA_DIR`                                                        | Direktori state file development (`global.json`, `workspaces/`); default `.data`                                                   |
| `TELEGRAM_BOT_TOKEN`                                              | Opsional: token bot Telegram untuk notifikasi RSVP dan ucapan baru ke pemilik                                                      |
| `TELEGRAM_CHAT_ID`                                                | Opsional: id chat Telegram penerima notifikasi; notifikasi nonaktif bila salah satu variabel kosong                                |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | Opsional: server SMTP untuk email atur ulang kata sandi (port bawaan 587; `SMTP_SECURE=true` atau port 465 memakai TLS langsung)   |
| `MAIL_FROM`                                                       | Pengirim email, mis. `Temu <halo@domain.com>`; SMTP dianggap siap bila `SMTP_HOST` dan `MAIL_FROM` terisi                          |
| `SITE_NAME`                                                       | Nama merek di footer, judul, dan JSON-LD; default `Temu`                                                                           |
| `SITE_URL`                                                        | Origin publik untuk canonical, sitemap, dan Open Graph; jatuh ke `APP_URL`                                                         |
| `CONTACT_WHATSAPP`                                                | Nomor WhatsApp format internasional tanpa `+` (mis. `6281234567890`)                                                               |
| `CONTACT_EMAIL`                                                   | Email kontak di halaman kontak, legal, dan JSON-LD                                                                                 |
| `BUSINESS_NAME`                                                   | Nama badan usaha/penjual di syarat, privasi, dan footer                                                                            |
| `BUSINESS_ADDRESS`                                                | Alamat usaha di halaman legal dan kontak                                                                                           |

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

### Anggaran pernikahan

Anggaran berada di Dashboard → **Anggaran pernikahan**. Anggaran melekat pada ruang kerja, bukan pada satu undangan: satu pernikahan yang memiliki beberapa undangan — upacara dan tiap sesi resepsi — memakai satu anggaran yang sama.

Setiap pos memakai salah satu dari sembilan kategori: Upakara & Banten, Tempat & Dekorasi, Katering, Busana & Rias, Dokumentasi, Hiburan & Gamelan, Undangan & Suvenir, Transportasi & Akomodasi, serta Lain-lain. Upakara dipisah dari dekorasi karena sarana upacara dan punia pemangku dianggarkan sendiri, terpisah dari kebutuhan resepsi.

Penanggung biaya dicatat per pos karena biaya pawiwahan lazim dipikul bersama kedua keluarga dengan pembagian yang disepakati. Tersedia tiga pilihan: **Ditanggung bersama**, **Keluarga mempelai pria**, dan **Keluarga mempelai wanita**. Jika lebih dari satu penanggung dipakai, dashboard menampilkan rekap komitmen, pembayaran, dan sisa per keluarga.

| Nilai per pos | Arti                                             |
| ------------- | ------------------------------------------------ |
| Estimasi      | Perkiraan sebelum harga dengan vendor disepakati |
| Realisasi     | Harga yang berlaku setelah disepakati            |
| Dibayar       | Jumlah yang sudah dibayarkan ke vendor           |

Nilai komitmen sebuah pos adalah realisasi bila realisasi lebih dari nol, selain itu estimasi. Dengan begitu pos yang harganya sudah pasti tidak lagi dihitung dari angka perkiraan. Status bayar mengikuti perbandingan dibayar terhadap komitmen: **Lunas**, **Dibayar sebagian**, atau **Belum dibayar**.

Sisa tagihan dihitung per pos sebagai komitmen dikurangi dibayar, dan tidak pernah negatif. Kelebihan bayar pada satu pos tidak menutupi kekurangan pos lain, sehingga total sisa tagihan tetap menunjukkan jumlah yang masih harus dibayar.

Pagu total opsional. Bila pagu diisi, dashboard menampilkan sisa pagu; bila komitmen melewati pagu, kartu ditandai dan labelnya berubah menjadi **Lewat pagu**.

Pos yang punya tanggal jatuh tempo dan belum lunas muncul pada daftar pengingat jika tersisa 30 hari atau kurang, diurutkan dari yang paling dekat. Tanggal yang sudah lewat ditandai beserta jumlah hari keterlambatan. Perhitungan jatuh tempo memakai acuan WITA.

Tombol **Isi kerangka pawiwahan** menambahkan 20 pos yang lazim pada rangkaian pawiwahan Bali dengan nilai nol; angka diisi sendiri setelah menawar dengan vendor. Pos yang namanya sudah ada dilewati, jadi tombol ini aman dijalankan ulang tanpa menggandakan daftar.

**Ekspor CSV** mengunduh `anggaran-pernikahan.csv` berisi kategori, pos, penanggung, vendor, estimasi, realisasi, dibayar, kekurangan, status, jatuh tempo, dan catatan. File memakai BOM UTF-8 agar Excel membaca karakter Indonesia dengan benar, dan nilai yang diawali tanda rumus dinetralkan agar aman dibuka di spreadsheet.

**Impor CSV** menerima berkas hasil ekspor maupun suntingan spreadsheet. Kategori dan penanggung boleh ditulis sebagai label Indonesia atau kunci enum, nilai rupiah boleh ditulis `18000000`, `18.000.000`, atau `Rp 18.000.000`, dan kolom boleh berpindah urutan selama barisnya berheader. Pemisah hanya dianggap ribuan bila mengelompokkan tepat tiga digit, sehingga `1500.00` dari spreadsheet berlokal Inggris terbaca seribu lima ratus. Baris yang rusak dilewati dengan pesan per baris tanpa menggagalkan baris lain, dan maksimal 500 baris diproses sekali impor.

Impor selalu menambah pos baru, tidak menimpa yang ada, karena berkas CSV tidak membawa id. Saat memilih berkas, dashboard menanyakan apakah pos yang namanya sudah ada perlu dilewati; tanpa itu, mengimpor ulang berkas hasil ekspor akan menggandakan daftar.

**Grafik** di atas daftar pos menampilkan komitmen dan pembayaran per kategori serta proporsi antar keluarga, digambar sebagai SVG tanpa dependensi dan mengikuti warna tema.

Anggaran yang rusak tidak menjatuhkan halaman undangan: pos yang cacat diperbaiki seadanya saat dibaca, dan undangan yang isinya tidak lolos skema hanya menonaktifkan dirinya sendiri.

| Endpoint                  | Metode | Kegunaan                                   |
| ------------------------- | ------ | ------------------------------------------ |
| `/api/budget`             | GET    | Daftar pos, pagu, dan ringkasan            |
| `/api/budget`             | POST   | Tambah pos anggaran                        |
| `/api/budget/{id}`        | POST   | Ubah pos anggaran                          |
| `/api/budget/{id}/delete` | POST   | Hapus pos anggaran                         |
| `/api/budget/settings`    | POST   | Simpan pagu total                          |
| `/api/budget/template`    | POST   | Isi kerangka pawiwahan tanpa duplikasi pos |
| `/api/budget/export.csv`  | GET    | Unduh anggaran sebagai CSV                 |
| `/api/budget/import`      | POST   | Impor pos dari berkas CSV                  |

Batas yang berlaku: maksimal **200 pos** anggaran, nilai disimpan sebagai **rupiah bulat** tanpa pecahan sen, dan anggaran hanya dapat diakses pemilik yang sudah masuk.

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
  modules/accounts/            Hash kata sandi (scrypt), sanitasi `next`
  modules/billing/             Paket, hak paket (entitlements), pesanan, masa aktif, penyaringan fitur
  server/                      Use case, autentikasi, validasi request, media
  styles/                      Gaya bersama dan variasi tema
assets/                        Aset sumber dan bahan desain
public/ornaments/              Aset web yang disajikan langsung
db/                            Migrasi dan seed
scripts/                       Preflight dan backup
deploy/                        Konfigurasi Caddy
```

Alur utama: **pages/komponen → services → domain dan infrastructure**. Komponen presentasi memakai komponen bersama; aturan bisnis dan validasi berada di server/domain. Draft dan snapshot publish disimpan terpisah.

Penyimpanan dipecah menjadi dua jenis dokumen JSONB:

- **Global** (`app_global`, satu baris): akun (`users`), sesi, daftar ruang kerja beserta paketnya, indeks slug (`slug → ruang kerja + undangan`, termasuk alamat lama), indeks media (`id aset → ruang kerja`), serta `orders`, `packages`, `siteSettings` yang disiapkan untuk penagihan dan panel admin.
- **Per ruang kerja** (`workspace_state`, satu baris per pelanggan): undangan, revisi, RSVP, ucapan, tamu, anggaran, dan pustaka media milik pelanggan itu.

Mode file development memakai bentuk yang sama: `DATA_DIR/global.json` dan `DATA_DIR/workspaces/<id>.json`, ditulis atomik lewat rename dengan antrean per berkas (satu proses saja; production menolak fallback file).

**Urutan kunci.** Tiap `mutateGlobal` / `mutateWorkspace` memegang kunci baris (`SELECT ... FOR UPDATE`) hanya selama fungsinya berjalan. Kunci tidak boleh bersarang: operasi yang menyentuh kedua dokumen dijalankan sebagai langkah berurutan. Bila suatu saat terpaksa bersarang, urutannya **global dulu, baru ruang kerja**.

**Slug unik global.** Slug adalah alamat publik, jadi indeks global menjadi sumber kebenaran keunikan. Membuat atau mengganti alamat: (1) pesan slug di indeks global (atomik, menolak jika dipakai), (2) tulis ruang kerja, (3) jika langkah 2 gagal, lepas pesanan. Menghapus undangan memakai urutan terbalik (ruang kerja dulu, indeks kemudian). Pesanan yatim akibat proses mati di antara langkah tidak berbahaya dan dapat diambil alih setelah 2 menit bila undangannya memang tidak ada. Halaman tamu, RSVP, ucapan, OG image, dan penyajian media menemukan ruang kerja lewat indeks ini, tanpa memindai semua ruang kerja.

**Migrasi data lama.** Pada start pertama (dan lewat `npm run db:migrate`), bila belum ada pengguna dan ada data lama (`app_state` / `state.json`), sistem membuat admin dari `OWNER_EMAIL`/`OWNER_PASSWORD`, memindahkan seluruh isi lama ke ruang kerja `workspace-demo` (id tidak berubah, sehingga `workspaceId` pada undangan dan media tetap sah), lalu membangun indeks slug dan media. Seluruhnya satu transaksi dengan advisory lock (aman dijalankan dua kali atau bersamaan), dan data lama tidak diubah sehingga menjadi cadangan. Tanpa data lama pada mode demo, admin `owner@undangan.local` dan undangan `amara-raka` dibuat otomatis.

Detail implementasi tersedia di [db/README.md](db/README.md).

## Multi-akun dan paket

- **Peran**: `admin` (penjual, memegang ruang kerja `workspace-demo`) dan `customer`. `requireAdmin(actor)` di `src/server/auth.ts` menjaga halaman/endpoint khusus admin; panel admin ada di `/admin` (pesanan, paket, pengaturan penagihan).
- **Pendaftaran**: `/daftar` memanggil `POST /api/auth/register` (validasi origin, rate limit, kata sandi minimal 8 karakter). Pendaftaran membuat akun, ruang kerja berpaket uji coba, dan satu undangan awal berisi isian netral dengan alamat acak `undangan-xxxxxxxx`.
- **Kata sandi dan sesi**: scrypt dengan salt per pengguna (`scrypt$N$r$p$salt$hash`), perbandingan `timingSafeEqual` yang selalu berjalan walau email tidak dikenal. Sesi berlaku 7 hari sejak login (tetap, tidak diperpanjang otomatis), hanya hash token yang disimpan, logout dan `setPassword` mencabut sesi. Akun yang ditangguhkan (`status: "suspended"`) tidak dapat masuk dan sesinya langsung tidak berlaku.
- **Isolasi**: semua layanan pemilik hanya membaca dan menulis ruang kerja milik `actor`; `authorize` tetap menjadi lapisan pertahanan tambahan. Halaman tamu hanya menyajikan undangan terbit; media draf hanya untuk anggota ruang kerja pemiliknya.
- **Hak paket**: `getEntitlements(workspace)` di `src/modules/billing/entitlements.ts` menentukan `canPublish`, `maxInvitations`, `maxGuests` (per undangan), `maxMediaBytes`, dan flag fitur. Ruang kerja admin dan paket `active` tanpa batas; `trial` tidak boleh menerbitkan, 1 undangan, 50 tamu, 200 MB, tanpa penghapusan branding. Dipaksakan pada publish, buat undangan, tambah/impor tamu, unggah media, check-in QR, dan alamat kustom.
- **Lupa kata sandi**: `/lupa-sandi` mengirim tautan `/reset-sandi?token=…` lewat email (`src/server/mail.ts`, nodemailer). Token acak 32 byte, hanya hash SHA-256 yang disimpan di `global.passwordResets`, berlaku 1 jam, sekali pakai, dan token lama dicabut saat yang baru dibuat. Jawaban selalu sama untuk email terdaftar atau tidak; dibatasi per IP (5 per 15 menit) dan per email (3 per 15 menit, kelebihan diam-diam tidak dikirim). Setelah reset, semua sesi dicabut. Tanpa SMTP: development mencatat email (judul dan tautan) di konsol server dan menyimpannya di memori; production tidak mengirim dan halaman menyuruh pengguna menghubungi admin lewat WhatsApp.
- **Hook uji email**: `GET /api/dev/last-mail?to=<email>` mengembalikan email terakhir yang "dikirim" dan **hanya ada** bila `NODE_ENV !== "production"` dan `DATABASE_URL` kosong (selain itu 404). Dipakai `e2e/account.spec.ts`.
- **Pengaturan akun** `/dashboard/akun`: ubah nama/telepon, ganti email dan kata sandi (wajib kata sandi saat ini; ganti kata sandi mencabut sesi lain), daftar sesi aktif dan "Keluar dari semua perangkat lain", **Unduh data saya** (JSON profil dan isi ruang kerja tanpa hash kata sandi/sesi atau data pengguna lain), dan **Hapus akun** (ketik `HAPUS AKUN` + kata sandi; menghapus akun, sesi, ruang kerja, indeks slug/media, dan berkas media; ditolak untuk admin). Pesanan dan berkas bukti transfernya dibiarkan untuk pembukuan, sehingga baris pesanan dapat merujuk pengguna/ruang kerja yang sudah tidak ada. Semua tindakan ini ditolak saat admin sedang menyamar.
- **`/login?next=`**: hanya jalur relatif satu origin yang dipakai (`src/modules/accounts/next-path.ts`; menolak `//`, URL absolut, backslash, karakter kontrol). Pengguna yang sudah masuk diarahkan dari `/login`, `/daftar`, dan `/lupa-sandi` ke `/dashboard`.
- **Pembatasan login**: per IP (8/menit) dan per email (10 kegagalan per 15 menit, pesan sama untuk email tak dikenal). Halaman autentikasi `no-store`, kolom kata sandi memakai `autocomplete` yang tepat dan tombol lihat/sembunyi.
- **Hak paket di UI dan halaman tamu**: `gateContent` (`src/modules/billing/gating.ts`) menyaring tampilan tamu menurut `getEntitlements` tanpa menghapus data tersimpan: tanpa `music` musik tidak dirender, tanpa `video` video unggahan dan YouTube disembunyikan, tanpa `gift` bagian hadiah disembunyikan, tanpa `guestList` kode `g` diabaikan (tanpa nama sapaan, QR, pelacakan, dan tautan ke daftar tamu), tanpa `qrCheckin` tombol QR disembunyikan, tanpa `removeBranding` tampil `BrandingBadge` (menggantikan kredit lama). Pratinjau editor memakai aturan yang sama; halaman contoh `/themes/...` tidak disaring. Editor mengunci kolom di luar paket dengan petunjuk "Tersedia di paket berbayar" menuju `/dashboard/paket`; menyimpan draf tetap berhasil. API daftar tamu dan check-in membalas 403 dengan pesan jelas.
- **Belum ada** (dikerjakan menyusul): verifikasi email, MFA, penanda perangkat pada daftar sesi.

### Penagihan transfer manual

Alur penjualan tanpa payment gateway. Aturan inti ada di `src/modules/billing/orders.ts` (murni terhadap `GlobalState`), layanan di `src/server/billing.ts`.

**Pelanggan**

1. Tombol harga di landing membawa `/daftar?paket=<id>`; setelah mendaftar pengguna diarahkan ke `/dashboard/paket?paket=<id>` (paket itu disorot). Pelanggan yang sudah masuk memilih langsung di `/dashboard/paket`.
2. "Pilih paket" memanggil `POST /api/billing/orders` dan membuat tagihan `TMU-YYYYMMDD-NNNN` (tanggal WITA, urutan harian). Total transfer = harga + **kode unik 1-999** yang dipilih agar tidak ada tagihan terbuka lain (`pending` / `awaiting_verification`) dengan total sama. Tagihan berlaku `orderExpiryHours` (bawaan 48 jam), lalu `expired` otomatis saat dibaca.
3. **Satu tagihan terbuka per ruang kerja**: memilih paket yang sama membuka tagihan yang ada; memilih paket lain mengganti tagihan yang belum dibayar; selama bukti sedang diverifikasi tidak bisa memesan lagi.
4. `/dashboard/tagihan/<nomor>` menampilkan total persis (kode unik disorot, tombol salin), rekening tujuan, hitung mundur batas bayar, linimasa status, dan unggah bukti (gambar, maks 5 MB, catatan opsional). Bukti disimpan sebagai aset privat di ruang kerja pelanggan (`purpose: "payment-proof"`): tidak muncul di pustaka media, tidak memakai kuota, tidak bisa dipasang di undangan, dan hanya dapat dibuka pemilik dan admin. Pelanggan bisa membatalkan tagihan yang belum berbukti atau yang ditolak.
5. Setelah diverifikasi, `/dashboard/tagihan/<nomor>/cetak` menampilkan invoice/bukti pembayaran siap cetak (nama dan alamat usaha dari `BUSINESS_NAME` / `BUSINESS_ADDRESS`).
6. Dashboard menampilkan kartu status paket (uji coba, aktif, tinggal 14 hari, berakhir). Penerbitan yang ditolak menyertakan tautan ke `/dashboard/paket`.

**Admin** (semua perubahan: `requireAdmin` + cek origin + catatan di log aktivitas)

- `/admin/pesanan`: tab status dengan jumlah, cari nomor/nama/email, dan "Buat pesanan untuk pelanggan" (opsi langsung lunas untuk jasa atau penjualan di luar sistem; tanpa kode unik, `createdByAdmin`).
- `/admin/pesanan/<nomor>`: bukti transfer, nominal, pelanggan. **Verifikasi** menandai lunas dan mengaktifkan paket (`activatePlan`; paket sama yang masih aktif diperpanjang dari tanggal berakhirnya), **Tolak** wajib beralasan (pelanggan melihatnya dan boleh mengunggah ulang, kembali ke menunggu verifikasi), **Batalkan**. Pembayaran terlambat pada tagihan `expired` masih bisa diverifikasi.
- `/admin/paket`: tambah/ubah/hapus paket (harga, harga coret, masa aktif, keunggulan, batas, fitur, aktif, disorot, urutan). Paket terakhir tidak bisa dihapus; nonaktifkan untuk menyembunyikan. Pesanan menyimpan salinan paket (`packageSnapshot`), jadi harga dan masa aktif pesanan lama tidak berubah.
- `/admin/pengaturan`: rekening tujuan (tambah, hapus, urutkan), catatan pembayaran, dan batas waktu tagihan.
- Setiap bukti baru dikirim ke penjual lewat Telegram (`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`, lihat `src/server/notify.ts`); tautan ke pesanan memakai `SITE_URL`/`APP_URL`.

**Paket di penyimpanan.** `global.packages` disemai dari `DEFAULT_PACKAGES` saat kosong (di `normalizeGlobal`, jadi data produksi lama otomatis terisi pada tulis berikutnya). Landing memakai `listSellablePackages()` dan kembali ke katalog bawaan bila penyimpanan tidak terbaca.

**Hak dari paket.** `getEntitlements(workspace, now, { packages, orders })` memakai batas dan fitur paket yang dibeli (`maxMediaMB` dikonversi ke byte). Paket dicari lewat `plan.id`; jika sudah dihapus, dipakai salinan pada pesanan lunas terbaru ruang kerja itu. Paket aktif yang id-nya tak dikenal (ditetapkan manual) tetap tanpa batas; admin tanpa batas; uji coba dan kedaluwarsa memakai batas uji coba.

**Masa tenggang setelah paket berakhir.** Undangan terbit tetap tampil dan menerima RSVP/ucapan selama **30 hari** setelah paket berakhir. Lewat itu, tamu melihat halaman "Undangan ini sudah tidak aktif" (HTTP 410), RSVP/ucapan/OG image tertutup, namun data dan dashboard pemilik tidak disentuh; memperpanjang paket langsung mengaktifkannya lagi. Aturannya ada di `publicAccess` (`src/modules/billing/plan.ts`) dan dipasang di `resolvePublic` (`src/server/services.ts`). Pemilik selalu bisa memratinjau draf.

## Panel admin

Hanya untuk peran `admin`; pelanggan mendapat 403 di semua halaman dan API admin. Admin melihat tautan "Panel admin" di sidebar dashboard-nya.

- **Ringkasan** (`/admin`): jumlah pelanggan (baru 7/30 hari), paket berbayar aktif, uji coba, akan berakhir 14 hari, undangan terbit, pendapatan bulan ini dan total (pesanan `paid`), pesanan menunggu verifikasi, grafik batang 6 bulan (SVG, dengan tabel pengganti), pendaftar dan pesanan lunas terbaru. Rumusnya murni di `src/modules/admin/metrics.ts` (bulan menurut WITA). Hitungan undangan per ruang kerja butuh membaca dokumen tiap ruang kerja, jadi di-cache 60 detik di memori dan dibatasi 200 pembacaan baru per permintaan; sisanya dilengkapi bertahap dan ditandai "perkiraan".
- **Pelanggan** (`/admin/pelanggan`): pencarian nama/email/telepon, filter status, halaman 20 baris. Detail (`/admin/pelanggan/{id}`): profil, paket, undangan (tautan halaman tamu dan pratinjau), pesanan, jejak audit, serta aksi:
  - **Tangguhkan/Aktifkan**: akun ditangguhkan tidak bisa masuk dan sesinya dicabut. Undangan yang sudah terbit **tetap tampil bagi tamu** (acara tetap berjalan).
  - **Masuk sebagai pelanggan**: membuat sesi berlabel `impersonatorUserId`; sesi admin lama dicabut. Pita merah di atas dashboard memuat "Anda masuk sebagai X" dan tombol "Kembali ke admin" yang mencabut sesi pelanggan dan membuat sesi admin baru. Admin lain dan akun ditangguhkan tidak dapat disamari; awal dan akhir dicatat di audit. Halaman `/admin` tidak dapat dibuka selama menyamar (aktornya pelanggan).
  - **Atur paket manual**: pilih paket + durasi, atau tanggal berakhir, atau kembali ke uji coba (paket dari `global.packages`, cadangan `DEFAULT_PACKAGES`). Tidak membuat pesanan.
  - **Reset kata sandi**: kata sandi sementara acak ditampilkan sekali; semua sesi dicabut.
  - **Hapus pelanggan**: harus mengetik email; menghapus akun, sesi, ruang kerja, indeks slug dan media, dokumen ruang kerja, dan berkas media. Pesanan dipertahankan dengan catatan `deletedCustomer`. Admin tidak dapat dihapus.
- **Akun klien (mode jasa)**: formulir di `/admin/pelanggan` memakai `register` yang sama dengan pendaftaran mandiri, kata sandi sementara acak, paket opsional, dan templat pesan WhatsApp beserta tautan `wa.me`.
- **Log aktivitas** (`/admin/log`): filter tindakan, pelaku, target, rentang tanggal (WITA), halaman 25 baris; menyimpan 2.000 catatan terbaru.

Setiap mutasi admin lewat `requireAdmin` (di layanan `src/server/admin.ts`), `guardMutation`, dan `recordAudit`.

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

- Sesi memakai token acak; server menyimpan hash, dengan masa berlaku 7 hari. Cookie production memakai `Secure`, `HttpOnly`, dan `SameSite=Lax`.
- Mutasi memerlukan origin yang sesuai. Preview draft memerlukan autentikasi; media privat tidak dapat dibaca anonim.
- Upload diperiksa berdasarkan signature, nama file dibuat server, dan akses publik terbatas pada media yang dipakai undangan terbit.
- Ucapan publik hanya yang sudah disetujui pemilik. URL embed divalidasi dan halaman memakai security headers.
- Rate limit masih berada dalam memori satu instance.
- RSVP mengenali browser melalui cookie; tidak memverifikasi identitas dan tidak menyinkronkan respons lintas perangkat.
- Belum tersedia payment gateway, verifikasi email, custom domain per undangan, S3, undangan privat bertoken, MFA, atau pengiriman WhatsApp otomatis (kirim WA memakai tautan wa.me). Notifikasi Telegram masih satu tujuan global (penjual).

## Pemecahan masalah

| Gejala                                           | Tindakan                                                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Port 4321 terpakai                               | Gunakan `WEB_PORT=4322` pada Compose, atau `npm run dev -- --port 4322` lokal                                  |
| Database belum siap / tabel belum ada            | Periksa `docker compose ps` dan log; jalankan migrasi (`db:migrate`) lalu seed                                 |
| "Admin pertama belum dikonfigurasi"              | Isi `OWNER_EMAIL` dan `OWNER_PASSWORD` (production: minimal 16 karakter) untuk start pertama                   |
| Perubahan kode tidak muncul di Docker            | Pastikan menjalankan `up --watch`; file harus berada dalam jalur Watch                                         |
| Container development bermasalah setelah restart | Command bawaan memakai `--ignore-lock` untuk lock PID Astro; periksa log aplikasi sebelum mengubah konfigurasi |
| Upload ditolak                                   | Periksa format, batas ukuran, kuota, sesi pemilik, dan ruang disk                                              |
| Draft bertabrakan antar-tab                      | Simpan salinan perubahan yang diperlukan lalu muat ulang draft terbaru                                         |
| Peta kurang tepat                                | Tambahkan URL embed pin Google Maps, bukan hanya alamat teks                                                   |
| Musik/video belum berbunyi                       | Buka undangan melalui tombol; periksa format media dan pembatasan browser/YouTube                              |
| Preview WhatsApp tidak tampil                    | Pastikan undangan sudah terbit serta domain dan `APP_URL` dapat diakses publik                                 |
| Request production ditolak karena origin         | Cocokkan origin HTTPS yang dipakai pengguna dengan `APP_URL`                                                   |

Dokumen tambahan: [Checklist fitur](UPGRADE-CHECKLIST.md), [system design](PLANNING.md), dan [panduan deployment](DEPLOYMENT.md).
