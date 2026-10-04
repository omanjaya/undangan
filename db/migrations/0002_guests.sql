-- Daftar tamu per undangan: tamu, kode pribadi, status kirim/buka/check-in, dan
-- templat pesan WhatsApp disimpan di payload JSONB (`guests`, `guestTemplates`),
-- mengikuti agregat yang sama dengan RSVP dan anggaran. Tidak ada kolom atau
-- tabel baru; migrasi ini hanya memastikan kunci koleksinya ada pada baris
-- yang sudah berjalan. Aman dijalankan berulang dan tidak menyentuh data tamu
-- yang sudah ada.
UPDATE app_state
SET payload = payload
  || CASE WHEN payload ? 'guests' THEN '{}'::jsonb ELSE jsonb_build_object('guests', '[]'::jsonb) END
  || CASE WHEN payload ? 'guestTemplates' THEN '{}'::jsonb ELSE jsonb_build_object('guestTemplates', '{}'::jsonb) END,
    updated_at = now()
WHERE id = 'primary'
  AND NOT (payload ? 'guests' AND payload ? 'guestTemplates');
