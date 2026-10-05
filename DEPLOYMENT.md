# Deployment

Paket ini siap dipasang pada satu server dengan Docker Compose. Belum ada domain/server publik yang dikonfigurasi. Gunakan DNS domain menuju server, buka port 80 dan 443, dan pastikan Docker aktif. PostgreSQL dan upload memakai volume persisten. Jalankan seluruh perintah dari direktori proyek.

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

## Batas operasional

Satu owner, satu undangan, satu instance aplikasi. Rate limit berada dalam memori. Multi-owner, pembayaran, private invitation bertoken, dan object storage belum tersedia. RSVP publik tidak membuktikan identitas tamu. Ganti password environment untuk membatalkan sesi yang ada. Benchmark Core Web Vitals produksi dan uji beban belum dilakukan.

## Asumsi keamanan di belakang reverse proxy

- Rate limit memakai entri **terakhir** `X-Forwarded-For` (IPv6 dikelompokkan per /64). Ini benar hanya bila satu-satunya hop di depan aplikasi adalah Caddy kita (Caddy menimpa header dari klien yang tidak tepercaya) dan port aplikasi hanya terbuka di `127.0.0.1`. Jangan membuka port 4321 ke internet, dan bila memasang CDN (mis. Cloudflare) di depan Caddy, semua pengunjung akan berbagi satu ember limit sampai IP asli diteruskan secara tepercaya.
- Limiter berada dalam memori satu proses: dijalankan lebih dari satu instance berarti batas dikalikan jumlah instance.
- Pendaftaran tidak memverifikasi email; tiap akun uji coba mendapat kuota media sendiri. Pantau disk volume `app_data`.
- Penguncian login per email (10 kegagalan/15 menit) dapat dipakai pihak lain untuk menahan akun tertentu sementara waktu.
