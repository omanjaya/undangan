# Deployment single-owner

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
