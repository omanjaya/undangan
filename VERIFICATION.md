# Verifikasi — 17 September 2026

## Pemeriksaan kode

- Astro check: 45 file, tanpa error/warning/hint.
- 18 tes pada 4 file: skema dan upgrade data lama, validasi media, privasi draft, snapshot publish, konflik versi, slug/alias, RSVP, moderasi, sesi dan keamanan request.
- Build Node standalone berhasil, termasuk tiga preview tema statis.
- Font DM Sans, Italiana, Cormorant Garamond dan Cinzel disajikan lokal. Ornamen generated dioptimasi menjadi WebP transparan. Halaman undangan tidak bergantung foto pihak ketiga.

## Browser nyata

- Login, simpan draft, publish, RSVP dan moderasi ucapan berhasil.
- Upload gambar, MP4 H.264 dan WAV melalui file picker editor berhasil; pemilihan foto, galeri, video dan musik tersimpan dan terbit.
- Musik benar-benar diputar setelah membuka cover; video benar-benar diputar dan musik otomatis berhenti. Aset pengujian sudah dilepas dari undangan terbit dan tetap privat di library.
- Tiga tema diperiksa pada desktop dan viewport mobile 431 px; cover berfungsi, ornamen tidak menimpa konten utama. Reduced motion diperiksa dan konten tetap terlihat.
- Perbaikan landing terakhir menghapus monogram yang menumpuk pada gapura; screenshot desktop memverifikasi komposisi bersih.
- Pemeriksaan awal homepage, dashboard dan undangan pada 390 px tidak menemukan overflow. Editor media diperiksa secara fungsional melalui browser desktop.

## Docker

Image development dan production dibangun, migrasi/seed idempoten, health PostgreSQL dan homepage 200. Source sync/reload Compose Watch terbukti tanpa restart container. Restart dev berhasil dengan Astro --ignore-lock. Production melayani ketiga tema (200), menolak media tanpa sesi (401), dan mengirim header keamanan API. Konfigurasi HTTPS Caddy tersedia; sertifikat publik memerlukan domain sungguhan.

## Batas hasil

Ini verifikasi lokal, bukan benchmark Core Web Vitals produksi, audit WCAG lengkap, penetration test, uji beban, atau uji perangkat fisik. Deployment publik dan restore menyeluruh belum dijalankan. Produk saat ini single-owner dengan state JSONB transaksional; skema multi-tenant dalam PLANNING.md merupakan rancangan lanjutan.

Verifikasi deployment tambahan: konfigurasi Caddy dengan seluruh security headers dan gabungan Compose HTTPS valid. Pada database dan volume QA terisolasi, upload PNG→WebP menghasilkan 201; setelah container dihapus dan dibuat ulang, metadata dan file tetap tersedia. Media privat anonim ditolak 404 dan byte range menghasilkan 206. Resource QA telah dibersihkan tanpa mengubah data asli.

## Aksara, kutipan dan lokasi

Astro check terbaru: 46 file bersih; 18 tes lulus dan build berhasil. Browser memverifikasi aksara Bali dan Sanskerta tampil dengan font lokal, kutipan bersumber, dan halaman 390 px tanpa overflow. Iframe Google tidak dibuat sebelum pratinjau dibuka; sesudah klik URL embed terpasang. Konten peta eksternal belum tampil di browser QA, sehingga keberhasilan pemuatan Google belum terkonfirmasi. Tautan lokasi langsung serta fallback tetap tersedia. CSP production mengizinkan frame hanya dari www.google.com.

## Slideshow dan embed

Semua tema memakai PhotoSlideshow bersama: foto sampul + galeri unik, fallback tiga ilustrasi, transisi silang/zoom, navigasi keyboard dan jeda; menghormati reduced motion, visibilitas halaman/viewport dan cover. Tombol berikutnya diuji di browser (slide1→2). Ornament divider tambahan tidak menutupi teks.

Google iframe kini ada langsung di HTML tanpa tombol pratinjau. Browser mencapai URL embed Google tetapi konten peta belum terlihat di lingkungan pengujian. YouTube memakai parser host/ID ketat dan iframe youtube-nocookie; tombol Buka video berhasil membuat URL embed. Playback eksternal belum terverifikasi; link langsung tersedia. Route QA video sementara sudah dihapus, tidak menambahkan video contoh ke undangan pengguna. Pemeriksaan: 51 file tanpa error/warning, 19 tes lulus, build berhasil.

Pembaruan QA akhir: Google Maps akhirnya selesai dimuat otomatis; browser menampilkan Map, kontrol kamera, satellite, attribution Google dan tautan lokasi Taman Bhagawan. Ikon play/pause slideshow telah diperbaiki dan terlihat di screenshot.

## Penyempurnaan admin dan pengalaman tamu

Pemeriksaan akhir: 54 file tanpa error, warning, atau hint; seluruh 23 tes pada 6 file lulus; build Node standalone berhasil. Format kode telah diperbarui.

Browser memverifikasi autosave dan pembaruan isi iframe, crop persegi menjadi aset WebP baru, titik fokus foto, tautan penerima dengan nama dan ampersand, serta konflik versi dari dua tab tanpa menimpa draft terbaru. Input pengujian telah dibersihkan tanpa menerbitkannya. Editor diperiksa pada lebar 390 px tanpa overflow. Preview desktop terukur 1200×850 dan diskalakan ke ruang editor; mode ponsel memakai bingkai maksimum 390×680.

Gambar OG 1200×630 diperiksa di browser. Image Docker production berhasil dibangun dengan font DejaVu; uji Sharp di dalam image menghasilkan teks yang terlihat. Konfigurasi Caddy dan Compose HTTPS valid, termasuk header preview terautentikasi.

Daftar fitur lengkap dan batas pengujian terdapat pada UPGRADE-CHECKLIST.md. Gesture perangkat fisik, playback YouTube eksternal, serta preview di aplikasi WhatsApp pada domain publik belum diuji end-to-end.

## Polesan desain: parallax dan galeri penuh

Komponen bersama InvitationMotion menambahkan parallax foto sampul, cerita, dan penutup; ornamen bergerak tipis serta teks muncul bertahap. Gerakan lebih kecil di mobile, hanya dihitung saat elemen dekat viewport dengan satu requestAnimationFrame per scroll, dan dinonaktifkan oleh prefers-reduced-motion. Bingkai foto sampul memakai lapisan clipping terpisah agar border tetap utuh.

GalleryLightbox menggantikan modal lama: navigasi foto, keyboard, swipe, zoom dan pan, loading/error/retry, focus trap, pengembalian fokus, serta pemulihan scroll. Browser memverifikasi buka, next, ArrowRight, zoom 150%, Escape dan fokus kembali ke tombol foto asal. Screenshot desktop dan 390 px memverifikasi kontrol layar penuh. Pinch/swipe perangkat fisik belum diuji.

ClosingPortrait memakai foto cerita, sampul, atau galeri pertama dengan ornamen sesuai tema; tanpa foto memakai monogram. Browser 390 px memverifikasi penutup, pergeseran parallax saat scroll, dan scrollWidth sama dengan clientWidth. Fixture lokal memakai ilustrasi yang sudah ada sebagai gambar uji dan telah dihapus; tidak mengubah foto undangan atau database pengguna.

## Cover per tema dan desain tamu — 18 September 2026

Tiga ornamen cover dihasilkan dengan built-in imagegen, disimpan asli pada assets/cover-ornaments dan dioptimasi ke WebP pada public/ornaments/covers. Alpha transparan terverifikasi; tiap file web sekitar 280–390 KB. Prompt tersedia di assets/cover-ornaments/PROMPTS.md.

Cover Jepun Ivory, Puri Emerald, dan Senja Terracotta diperiksa di browser pada 390×844; Ivory juga diperiksa desktop. Nama tamu memiliki panel khusus, nama pasangan tetap dominan, dan tombol pembuka bekerja. Tanggal, jam WITA, serta venue pada hero dipisahkan. Kartu acara, tombol lokasi, grid galeri, formulir RSVP, dan navigasi mobile memiliki polesan konsisten dengan tema. Kontras teks tombol lokasi diperbaiki setelah pemeriksaan visual. RSVP publik diperiksa tanpa mengirim respons baru; halaman 390 px tidak overflow.

## Mode tanpa foto — 18 September 2026

Pilihan photoMode photos/illustrated (default photos) dan illustrationSlideshow (default false) tersedia dalam editor. Media yang dipilih tetap disimpan; helper presentasi hanya mengosongkan slot foto pada tampilan dan OG. Checklist menyesuaikan mode. Foto sampul menjadi ornamen tiap tema, profil pasangan menjadi kartu tipografi tanpa placeholder, cerita memakai ilustrasi, serta penutup memakai monogram. Video/musik tetap tersedia.

26 tes pada 7 file lulus; Astro Check 59 file bersih; build berhasil. Tes baru mencakup default data lama, retensi media dan presentasi tanpa mutasi. Browser memverifikasi kontrol admin, render mode illustrated tanpa galeri/slideshow default, tanpa portrait/medallion, slideshow ilustrasi opsional, serta lebar 390 px tanpa overflow. Pengujian simpan pada draft nyata tidak dijalankan karena review persetujuan otomatis menolaknya; pengujian tampilan memakai fixture lokal sementara yang telah dihapus.

## Landing page editorial — 18 September 2026

Landing page dirancang ulang dengan hero editorial, preview cover sebenarnya, tiga koleksi tema, bagian mode tanpa foto, fitur, alur penggunaan, FAQ native details, dan CTA penutup. Tidak menambahkan dependency atau JavaScript khusus landing. Browser memeriksa desktop dan 390 px, tautan navigasi koleksi, serta FAQ membuka jawaban. Overflow dekorasi mobile diperbaiki; scrollWidth dan clientWidth sama-sama 390 px. Astro Check 59 file bersih dan build berhasil.

## Tiga komposisi tanpa foto dan preview koleksi

Ivory memakai layout surat berbingkai dan cerita mengalir; Emerald memakai susunan aksial dengan gapura serta acara formal; Terracotta memakai pembuka terbalik, kartu berselang, dan cerita asimetris. CSS khusus hanya berlaku pada mode illustrated. Slideshow ornamen kini mempunyai tiga pilihan aset per tema. Koleksi memiliki dua tautan mode dan enam preview statis dibangun, termasuk /themes/{tema}/tanpa-foto. Preview Dengan Foto secara eksplisit menjelaskan ilustrasi pengganti sebelum pengguna mengunggah foto pribadi.

Browser memeriksa tiga preview tanpa foto pada 390 px (scrollWidth = clientWidth), ornamen slideshow Emerald/Terracotta sesuai tema, serta pembuka Ivory desktop. Diperbaiki specificity .invite-density-corner yang sebelumnya membuat dekorasi tersembunyi tampil terlalu besar. Astro Check 62 file bersih, 29 tes lulus, build berhasil.
