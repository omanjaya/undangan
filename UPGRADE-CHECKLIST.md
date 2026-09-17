# Checklist penyempurnaan editor dan tamu

Status: seluruh fitur pada daftar telah diimplementasikan. Bukti pemeriksaan dan batas pengujian di bawah.

## Admin
- [x] Upload banyak foto dengan drag-and-drop
- [x] Crop foto menjadi aset baru
- [x] Titik fokus foto tersimpan dan diterapkan
- [x] Preview desktop/HP di editor
- [x] Autosave, status, penanganan konflik dan publish race
- [x] Drag reorder galeri dan alternatif tombol
- [x] Pustaka thumbnail, ukuran, status dipakai
- [x] Preset ornamen minimal/sedang/penuh
- [x] Checklist sebelum publish
- [x] Preview pin lokasi Google Maps yang sama dengan undangan
- [x] Pembuat tautan penerima personal

## Tamu
- [x] Prioritas foto pertama, lazy loading lanjutan
- [x] Slideshow swipe, navigasi dan jeda
- [x] Navigasi lokasi, kalender, RSVP mudah dijangkau
- [x] RSVP singkat dan konfirmasi jelas
- [x] Kontrol musik dan koordinasi video
- [x] Sapaan penerima dari tautan
- [x] Placeholder dan fallback media/koneksi lambat
- [x] OG WhatsApp dengan URL absolut dan gambar default

## Verifikasi
- [x] Check, test, build
- [x] Browser editor: input/simpan/preview
- [x] Browser tamu desktop/mobile
- [x] Security preview iframe dan embed URL

## Bukti dan batas pengujian

- Browser nyata: autosave terkonfirmasi pada status versi serta isi iframe; titik fokus 51%/50% diterapkan; crop persegi menghasilkan file WebP baru di pustaka; recipient link meng-encode nama dan ampersand; input QA dilepas dari draft sesudah pemeriksaan tanpa publish data QA.
- Dua tab: tab lama menerima konflik versi dan tombol pemulihan; draft terbaru tidak tertimpa. Sesudah uji, teks QA dibersihkan dan draft tersimpan.
- Editor mobile 390 px: scrollWidth = clientWidth, screenshot media/preview diperiksa.
- OG PNG 1200x630 dilihat di browser. Build production Docker berhasil; font DejaVu tersedia dan rendering glyph terkonfirmasi dalam image production.
- Caddy config dan gabungan Compose HTTPS valid; header fallback mempertahankan SAMEORIGIN khusus preview terautentikasi.
- Unit tests mencakup keamanan URL embed, default kompatibel data lama, batas fokus, otorisasi, media, publish, RSVP dan konflik versi.
- Drag/drop dan swipe ditinjau pada kode; tidak semua gesture diuji pada perangkat fisik. Playback YouTube eksternal dan tampilan sesungguhnya dalam aplikasi WhatsApp bergantung video/domain publik, belum diuji end-to-end. Optimasi loading bukan klaim skor Core Web Vitals.
