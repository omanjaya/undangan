# Riset dan keputusan desain undangan Bali

Riset dilakukan 17 September 2026. Referensi dipakai untuk memahami susunan informasi dan pola penggunaan; tidak menyalin foto pasangan, nama keluarga, kutipan kitab, atau aset vendor.

## Temuan dari undangan yang diterbitkan vendor

- [Pawiwahan Sandi & Mang Ria — Undang Online Bali](https://undangonlinebali.com/pawiwahan-sandi-mang-ria/): pembuka dan penutup Hindu, identitas keluarga, alamat, resepsi WITA, lokasi, hitung mundur, ucapan, serta musik. Halaman lama ini juga memuat informasi masa pandemi yang tidak relevan untuk template baru.
- [Pawiwahan Mega & Dede — Tamu Bali](https://tamubali.com/pawiwahan-mega-dede/): cover penerima, nama lengkap dan orang tua, galeri, cerita, lokasi banjar, RSVP, serta ucapan. Kalender, cerita, dan hadiah adalah pilihan, bukan aturan wajib.
- [Tema Undangan Bali — Undaku](https://undaku.id/blog/tema-undangan-bali): vendor menggunakan bahasa visual bunga jepun, gapura, warna alam dan emas. Ini referensi praktik desain komersial, bukan otoritas aturan adat atau makna simbol.

## Penerapan

- Salam pembuka/penutup dapat diedit; default Om Swastyastu dan Om Shanti Shanti Shanti Om.
- Judul acara, orang tua, alamat asal mempelai, tempat/banjar acara, serta jadwal WITA bisa disesuaikan.
- Tanggal/penanggalan Bali disediakan sebagai teks manual. Sistem tidak menebak dewasa ayu atau mengubah tanggal Gregorian menjadi kalender adat secara otomatis.
- Rangkaian tambahan dapat diisi untuk membedakan upacara dan resepsi. Tidak menetapkan urutan ritual untuk setiap keluarga.
- Jepun Ivory: terang, floral, intim. Puri Emerald: hijau dalam, aksen emas, ilustrasi gapura hasil generasi. Senja Terracotta: warna tanah hangat, komposisi taman floral.
- Tidak memakai teks aksara Bali dekoratif yang belum diverifikasi, ikon dewa sebagai hiasan, atau klaim kutipan kitab tanpa sumber.
- Foto pasangan berasal dari upload pemilik. Preview template menggunakan ilustrasi/ornamen asli dan nama contoh, bukan foto pasangan vendor.
- Font Cormorant Garamond, Cinzel, Italiana, dan DM Sans disajikan lokal; lisensi paket tetap tersedia dalam dependencies.

## Aset hasil generasi

Generator: built-in image_gen. Original PNG dan WebP transparan disimpan di `public/ornaments/`. WebP dipakai untuk halaman, PNG dipertahankan sebagai master. Optimasi mempertahankan alpha.

1. `jepun-corner.png` / `jepun-corner.webp`: ornamen L-shaped bunga jepun putih dan kuning lembut, daun sage, garis emas; negative space transparan untuk konten.
2. `bali-garden.png` / `bali-garden.webp`: rangkaian bunga dan daun sepanjang bagian bawah, dengan ruang transparan di atas.

3. `candi-bentar.png` / `candi-bentar.webp`: ilustrasi gapura simetris dengan latar transparan; menggantikan line art kompleks agar komposisi lebih bersih.

Prompt lengkap ada di `public/ornaments/PROMPTS.md`. Ilustrasi adalah interpretasi artistik floral untuk undangan, bukan dokumentasi motif sakral atau pakem ukiran tertentu.

## Aksara dan kutipan

Salam Unicode mengikuti [panduan aksara Bali BlankOn](https://github.com/BlankOn/wiki/blob/master/TimPengembang/Dokumentasi/Panduan/PanduanMenulisAksaraBali.md). Font Noto Serif Balinese di-host lokal. Teks dapat diedit/dikosongkan; nama tidak ditransliterasi otomatis.

Pilihan kutipan: Ṛgveda 10.191.4, doa keselarasan niat, hati, dan pikiran; bukan klaim mantra perkawinan khusus. Teks Sanskerta dan IAST diperiksa pada [edisi H. H. Wilson di Wisdom Library](https://www.wisdomlib.org/hinduism/book/rig-veda-english-translation/d/doc840453.html), makna dibandingkan dengan [Griffith, Hymn 191](https://sacred-texts.com/hin/rigveda/rv10191.htm). Terjemahan Indonesia merupakan terjemahan bebas aplikasi, dilabeli demikian. Kutipan bisa dinonaktifkan di editor. Teks Sanskerta menggunakan Noto Serif Devanagari lokal.

Google Maps mempertahankan URL pin pemilik. Pratinjau opsional memakai pencarian nama/alamat dan diberi keterangan bahwa hasil dapat berbeda dari pin; iframe hanya dibuat setelah tamu membukanya.
