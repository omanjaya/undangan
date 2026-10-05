/**
 * Konfigurasi situs publik (merek, kontak, URL). Dibaca dari environment saat
 * dipanggil, bukan saat modul dimuat, supaya mudah diuji dan selalu mengikuti
 * environment runtime.
 */
export type SiteConfig = {
  name: string;
  /** Origin tanpa garis miring akhir, mis. https://temu.example.com. */
  url: string;
  /** Nomor WhatsApp format internasional tanpa tanda plus. */
  whatsapp: string;
  email: string;
  businessName: string;
  businessAddress: string;
};

type Env = Record<string, string | undefined>;

function clean(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function getSiteConfig(env: Env = process.env): SiteConfig {
  const url = clean(env.SITE_URL, clean(env.APP_URL, "http://localhost:4321"));
  return {
    name: clean(env.SITE_NAME, "Temu"),
    url: url.replace(/\/+$/, ""),
    whatsapp: clean(env.CONTACT_WHATSAPP, "6281234567890").replace(/\D/g, ""),
    email: clean(env.CONTACT_EMAIL, "halo@temu.example.com"),
    businessName: clean(env.BUSINESS_NAME, "Temu"),
    businessAddress: clean(env.BUSINESS_ADDRESS, "Denpasar, Bali, Indonesia"),
  };
}

/** Tautan WhatsApp dengan pesan terisi. */
export function whatsappLink(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/** Nomor tampilan: 6281234567890 menjadi +62 812-3456-7890. */
export function formatPhoneDisplay(phone: string): string {
  const m = /^62(\d{3})(\d{4})(\d+)$/.exec(phone);
  return m ? `+62 ${m[1]}-${m[2]}-${m[3]}` : `+${phone}`;
}
