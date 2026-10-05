// Pemeriksaan konfigurasi sebelum deploy production: `npm run deploy:check`.
// Kegagalan menghentikan deploy; peringatan tidak, tetapi sebaiknya dibereskan
// sebelum mulai berjualan. Nilai secret tidak pernah dicetak.
const env = process.env;
const failures = [];
const warnings = [];

const required = [
  "APP_DOMAIN",
  "APP_URL",
  "OWNER_EMAIL",
  "OWNER_PASSWORD",
  "POSTGRES_PASSWORD",
];
for (const key of required)
  if (!env[key] || /REPLACE_|example\.com/.test(env[key]))
    failures.push(`${key} belum diisi dengan nilai production.`);
try {
  const url = new URL(env.APP_URL);
  if (
    url.protocol !== "https:" ||
    url.hostname !== env.APP_DOMAIN ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    failures.push(
      "APP_URL harus berupa origin HTTPS dengan hostname sama dengan APP_DOMAIN.",
    );
} catch {
  failures.push("APP_URL tidak valid.");
}
// OWNER_* hanya dipakai untuk membuat admin pertama, tetapi tetap divalidasi
// agar admin bootstrap tidak pernah memakai kredensial lemah.
if (
  (env.OWNER_PASSWORD || "").length < 16 ||
  env.OWNER_PASSWORD === "demo-undangan-2026"
)
  failures.push(
    "Password pemilik minimal 16 karakter dan bukan password demo.",
  );
if (!/^[a-f0-9]{32,}$/i.test(env.POSTGRES_PASSWORD || ""))
  failures.push(
    "Gunakan POSTGRES_PASSWORD hex acak minimal 32 karakter agar aman dimasukkan ke URI.",
  );

// Kesiapan berjualan (sama dengan daftar di /admin).
const placeholder = (value) =>
  !value ||
  /REPLACE_|example\.(com|test)|Nama Usaha Anda|Alamat usaha Anda/i.test(value);
const whatsapp = (env.CONTACT_WHATSAPP || "").replace(/\D/g, "");
if (!whatsapp || whatsapp === "6281234567890")
  warnings.push(
    "CONTACT_WHATSAPP masih kosong/contoh: tombol kontak dan bantuan lupa sandi mengarah ke nomor yang salah.",
  );
for (const key of ["BUSINESS_NAME", "BUSINESS_ADDRESS", "CONTACT_EMAIL"])
  if (placeholder(env[key]))
    warnings.push(
      `${key} masih kosong/contoh: tampil di invoice dan halaman legal.`,
    );
if (!env.SMTP_HOST || !env.MAIL_FROM)
  warnings.push(
    "SMTP_HOST/MAIL_FROM kosong: email lupa sandi dan kabar pembayaran tidak terkirim.",
  );
if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID)
  warnings.push(
    "TELEGRAM_* kosong: Anda tidak diberi tahu saat ada bukti transfer baru.",
  );
if (env.SITE_URL && !/^https:\/\//.test(env.SITE_URL))
  warnings.push("SITE_URL sebaiknya HTTPS.");

if (warnings.length) console.warn("Peringatan:\n- " + warnings.join("\n- "));
if (failures.length) {
  console.error("Gagal:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(
  "Konfigurasi production valid. Secret tidak ditampilkan." +
    (warnings.length ? " Bereskan peringatan sebelum berjualan." : ""),
);
