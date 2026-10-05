-- Multi-pelanggan: penyimpanan dipecah menjadi satu dokumen global dan satu
-- dokumen per ruang kerja. Pola yang sama dengan `app_state` (JSONB dengan
-- kunci baris), tetapi tiap pelanggan memiliki barisnya sendiri sehingga
-- penulisan antar-pelanggan tidak saling menunggu.
--
-- app_global:      akun, sesi, daftar ruang kerja, indeks slug dan media,
--                  serta tempat pesanan/paket/pengaturan situs kelak.
-- workspace_state: isi satu ruang kerja (undangan, tamu, RSVP, anggaran, media).
--
-- `app_state` lama sengaja tidak diubah maupun dihapus: ia menjadi cadangan
-- hasil migrasi data (dijalankan setelah berkas SQL oleh npm run db:migrate
-- atau otomatis saat aplikasi pertama kali menyala). Aman dijalankan berulang.
CREATE TABLE IF NOT EXISTS app_global (
  id text PRIMARY KEY CHECK (id = 'primary'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS workspace_state (
  workspace_id text PRIMARY KEY,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
