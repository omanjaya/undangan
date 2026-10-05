# Deployment

Paket ini siap dipasang pada satu server dengan Docker Compose. Gunakan DNS domain menuju server, buka port 80 dan 443, dan pastikan Docker aktif. PostgreSQL dan upload memakai volume persisten. Jalankan seluruh perintah dari direktori proyek.

## Persiapan

```sh
cp .env.production.example .env.production
openssl rand -hex 32
```

Edit `.env.production`: isi domain asli, APP_URL HTTPS dengan domain sama, email pemilik, password pemilik minimal 16 karakter, serta password database hex acak minimal 32 karakter. Jangan memakai nilai contoh. Gunakan hasil acak berbeda untuk setiap password. Jangan commit file ini.

```sh
npm run deploy:check
docker compose --env-file .env.production -f compose.production.yaml run --build --rm migrate
docker compose --env-file .env.production -f compose.production.yaml run --rm migrate npm run db:seed
docker compose --env-file .env.production -f compose.production.yaml -f compose.https.yaml up --build -d
docker compose --env-file .env.production -f compose.production.yaml -f compose.https.yaml ps
```

Preflight membutuhkan Node 24 di host; runtime aplikasi berjalan di Docker. Caddy menyediakan HTTPS otomatis setelah DNS dan konektivitas benar, serta security headers untuk halaman statis dan dinamis. Port aplikasi hanya dibind ke localhost. Jangan gunakan konfigurasi development di internet.

Buka `/dashboard`, masuk dengan kredensial yang diisi, lengkapi identitas keluarga, jadwal WITA, lokasi, tema, foto dan media. Preview dahulu lalu Terbitkan. Seed hanya membuat data contoh jika belum ada; tidak menimpa undangan lama. Tanggal Bali diisi manual berdasarkan informasi keluarga.

## Upgrade dari versi single-owner

Versi multi-pelanggan memindahkan data `app_state` ke ruang kerja `workspace-demo` milik admin yang dibuat dari `OWNER_EMAIL`/`OWNER_PASSWORD`. Sebelum upgrade:

1. Jalankan `scripts/backup.sh` dan simpan hasilnya di luar server.
2. Pastikan `OWNER_EMAIL` dan `OWNER_PASSWORD` di `.env.production` sama dengan akun yang selama ini dipakai login (password minimal 16 karakter).
3. Jalankan `migrate` (perintah di atas). Migrasi data berjalan otomatis, idempoten, dan tidak mengubah `app_state` (menjadi cadangan). Jika dilewati, aplikasi menjalankannya saat start pertama.
4. Setelah start, login dengan akun yang sama; undangan, tamu, anggaran, dan media tetap ada. Sesi lama tidak berlaku, jadi semua pengguna perlu login ulang.

Rollback: pulihkan backup database dan jalankan image versi sebelumnya; tabel baru (`app_global`, `workspace_state`) tidak dibaca versi lama.

## Notifikasi Telegram (opsional)

Isi `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID` di `.env.production` agar pemilik menerima pesan setiap ada RSVP atau ucapan baru. Buat bot lewat @BotFather, kirim satu pesan ke bot, lalu ambil chat id dari `https://api.telegram.org/bot<TOKEN>/getUpdates`. Jika salah satu kosong, notifikasi tidak dikirim. Pengiriman berjalan dari server aplikasi ke `api.telegram.org` (HTTPS keluar); CSP hanya membatasi browser sehingga tidak berpengaruh, tetapi firewall keluar server harus mengizinkannya. Kegagalan kirim hanya dicatat di log dan tidak mengganggu tamu.

## Media

Foto JPG/PNG/WebP maksimal 10 MB dioptimasi menjadi WebP tanpa metadata. Video MP4/WebM maksimal 80 MB; gunakan MP4 H.264/AAC untuk kompatibilitas luas. Musik MP3/M4A/OGG/WAV maksimal 20 MB. Video/audio tidak ditranscode. Musik dimulai setelah tamu menekan Buka Undangan, mengikuti kebijakan browser. Kuota default 1 GB, dapat diatur lewat UPLOAD_STORAGE_MB. Hanya media yang sedang digunakan undangan terbit yang dapat dibaca publik.

## Backup dan pemulihan

```sh
sh scripts/backup.sh
```

Backup berisi dump PostgreSQL dan seluruh `.data`, termasuk media. Simpan salinan terenkripsi di luar server beserta konfigurasi environment secara terpisah. Jangan menghapus volume saat update.

Uji pemulihan pada server atau project Compose terpisah sebelum mengandalkan backup. Siapkan database kosong dengan konfigurasi sama, hentikan aplikasi selama restore, lalu jalankan berikut dengan mengganti path backup:

```sh
docker compose --env-file .env.production -f compose.production.yaml stop web
docker compose --env-file .env.production -f compose.production.yaml up -d db
docker compose --env-file .env.production -f compose.production.yaml exec -T db pg_restore -U undangan -d undangan --no-owner --exit-on-error < backups/TIMESTAMP/database.dump
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps -T --entrypoint tar web -C /app/.data -xzf - < backups/TIMESTAMP/application-data.tar.gz
docker compose --env-file .env.production -f compose.production.yaml -f compose.https.yaml up -d
```

Restore di atas mengasumsikan database tujuan kosong, bukan database produksi yang masih terisi. Periksa health, login, undangan publik dan playback media setelah pemulihan. Restore menyeluruh belum diuji otomatis pada server publik.

## Reverse proxy di host (Caddy sudah berjalan)

Bila server sudah punya Caddy/Nginx di level host untuk situs lain, **jangan** memakai `compose.https.yaml` (Caddy di dalamnya akan merebut port 80/443). Jalankan hanya `compose.production.yaml` — aplikasi terikat ke `127.0.0.1:${WEB_PORT}` — lalu tambahkan satu blok di Caddyfile host:

```caddy
undangan.domain-anda.id {
    encode zstd gzip
    reverse_proxy 127.0.0.1:4321
}
```

Header keamanan (CSP, X-Frame-Options, Permissions-Policy kamera khusus `/dashboard/checkin`) sudah dikirim aplikasi sendiri. Cadangkan Caddyfile dan jalankan `caddy validate` sebelum `systemctl reload caddy`.

Perintah update rutin:

```sh
sh scripts/backup.sh
git pull
npm run deploy:check            # di host, butuh Node 24
docker compose --env-file .env.production -f compose.production.yaml run --build --rm migrate
docker compose --env-file .env.production -f compose.production.yaml up --build -d web
curl -fsS https://undangan.domain-anda.id/api/health
```

Jika build gagal dengan `Cannot find module '../lightningcss.linux-…-musl.node'`, itu cache layer Docker yang basi: ulangi dengan `docker compose ... build --no-cache web`.

## Checklist sebelum mulai berjualan

1. **Environment** (`npm run deploy:check` menampilkan peringatan bila belum): `CONTACT_WHATSAPP`, `CONTACT_EMAIL`, `BUSINESS_NAME`, `BUSINESS_ADDRESS`, `SITE_URL`, SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`) dan Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`).
2. **Panel admin** `/admin`: kotak "Persiapan sebelum berjualan" harus bersih. Isi rekening tujuan di `/admin/pengaturan`, periksa nama/harga/isi paket di `/admin/paket`.
3. **Uji satu transaksi nyata**: daftar sebagai pelanggan dari halaman harga, pilih paket, transfer nominal kecil (atau buat paket uji Rp1.000 lalu nonaktifkan), unggah bukti, verifikasi dari `/admin/pesanan`, pastikan email/Telegram masuk dan undangan bisa terbit.
4. **Halaman legal**: `/syarat-ketentuan`, `/kebijakan-privasi`, `/kebijakan-refund` adalah templat — tinjau dan sesuaikan dengan usaha Anda (sebaiknya dengan penasihat hukum) sebelum dipublikasikan.
5. **Backup terjadwal**: pasang cron harian, misalnya `0 3 * * * cd /opt/undangan && sh scripts/backup.sh >> backups/backup.log 2>&1`, dan salin hasilnya ke penyimpanan di luar server. Uji pemulihan sekali (lihat di atas).
6. **Pantau**: `/api/health` dari layanan uptime monitor; log `docker compose ... logs -f web`.

## Batas operasional

- Satu instance aplikasi. Rate limit disimpan di memori proses (hilang saat restart, tidak dibagi antar-instance); bila kelak menjalankan beberapa instance, pindahkan ke penyimpanan bersama.
- Data global (akun, sesi, indeks slug/media, pesanan) adalah satu dokumen JSONB yang dibaca di banyak permintaan. Cukup untuk ribuan pelanggan; pada skala lebih besar dokumen ini perlu dipecah atau di-cache.
- Media disimpan di disk server (volume `.data/uploads`), belum di object storage. Pantau ruang disk; kuota per paket membatasi pertumbuhan per pelanggan.
- Pembayaran hanya transfer manual dengan verifikasi admin; tidak ada payment gateway atau penagihan berulang otomatis. Paket yang berakhir masih tampil 30 hari (masa tenggang), lalu undangan menjadi tidak aktif bagi tamu tanpa menghapus data.
- RSVP publik tidak membuktikan identitas tamu (kecuali lewat tautan pribadi dengan kode tamu).
- Benchmark Core Web Vitals produksi dan uji beban belum dilakukan.

## Asumsi keamanan di belakang reverse proxy

- Rate limit memakai entri **terakhir** `X-Forwarded-For` (IPv6 dikelompokkan per /64). Ini benar hanya bila satu-satunya hop di depan aplikasi adalah Caddy kita (Caddy menimpa header dari klien yang tidak tepercaya) dan port aplikasi hanya terbuka di `127.0.0.1`. Jangan membuka port 4321 ke internet, dan bila memasang CDN (mis. Cloudflare) di depan Caddy, semua pengunjung akan berbagi satu ember limit sampai IP asli diteruskan secara tepercaya.
- Limiter berada dalam memori satu proses: dijalankan lebih dari satu instance berarti batas dikalikan jumlah instance.
- Pendaftaran tidak memverifikasi email; tiap akun uji coba mendapat kuota media sendiri. Pantau disk volume `app_data`.
- Penguncian login per email (10 kegagalan/15 menit) dapat dipakai pihak lain untuk menahan akun tertentu sementara waktu.
