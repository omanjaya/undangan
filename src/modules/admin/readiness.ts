import type { GlobalState } from "../invitations/infrastructure/global-state";

type Env = Record<string, string | undefined>;

export type ReadinessItem = {
  id: string;
  label: string;
  /** Penjelasan singkat apa yang perlu dilakukan bila belum siap. */
  hint: string;
  done: boolean;
  /** `required`: tanpa ini pelanggan tidak bisa membayar/menghubungi. */
  level: "required" | "recommended";
  href?: string;
};

/** Nilai bawaan di `src/config/site.ts` dan contoh env; belum diganti = belum siap. */
const PLACEHOLDER_WHATSAPP = "6281234567890";
const isPlaceholderEmail = (email: string | undefined) =>
  !email?.trim() || /example\.(com|test)$/i.test(email.trim());

/**
 * Daftar persiapan sebelum berjualan, ditampilkan di ringkasan admin. Murni
 * terhadap state global dan environment agar mudah diuji.
 */
export function salesReadiness(
  global: Pick<GlobalState, "siteSettings" | "packages">,
  env: Env = process.env,
): ReadinessItem[] {
  const banks = global.siteSettings.bankAccounts ?? [];
  const whatsapp = (env.CONTACT_WHATSAPP ?? "").replace(/\D/g, "");
  return [
    {
      id: "bank",
      label: "Rekening tujuan transfer",
      hint: "Tanpa rekening, tagihan pelanggan tidak menampilkan tujuan transfer.",
      done: banks.some((b) => b.bank && b.number && b.holder),
      level: "required",
      href: "/admin/pengaturan",
    },
    {
      id: "packages",
      label: "Paket dan harga",
      hint: "Periksa nama, harga, dan isi paket sebelum ditawarkan.",
      done: global.packages.some((p) => p.active),
      level: "required",
      href: "/admin/paket",
    },
    {
      id: "whatsapp",
      label: "Nomor WhatsApp penjual",
      hint: "Isi CONTACT_WHATSAPP; dipakai tombol kontak, halaman legal, dan bantuan lupa sandi.",
      done: !!whatsapp && whatsapp !== PLACEHOLDER_WHATSAPP,
      level: "required",
    },
    {
      id: "business",
      label: "Identitas usaha",
      hint: "Isi BUSINESS_NAME, BUSINESS_ADDRESS, dan CONTACT_EMAIL; tampil di invoice dan halaman legal.",
      done:
        !!env.BUSINESS_NAME?.trim() &&
        !!env.BUSINESS_ADDRESS?.trim() &&
        !isPlaceholderEmail(env.CONTACT_EMAIL),
      level: "required",
    },
    {
      id: "smtp",
      label: "Email keluar (SMTP)",
      hint: "Isi SMTP_HOST dan MAIL_FROM agar lupa sandi dan kabar pembayaran terkirim ke pelanggan.",
      done: !!(env.SMTP_HOST?.trim() && env.MAIL_FROM?.trim()),
      level: "recommended",
    },
    {
      id: "telegram",
      label: "Notifikasi Telegram",
      hint: "Isi TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID agar bukti transfer baru langsung diketahui.",
      done: !!(env.TELEGRAM_BOT_TOKEN?.trim() && env.TELEGRAM_CHAT_ID?.trim()),
      level: "recommended",
    },
    {
      id: "site-url",
      label: "Alamat situs publik",
      hint: "Isi SITE_URL (atau APP_URL) dengan domain HTTPS agar tautan di email, WhatsApp, dan SEO benar.",
      done: /^https:\/\//.test(
        env.SITE_URL?.trim() || env.APP_URL?.trim() || "",
      ),
      level: "recommended",
    },
  ];
}
