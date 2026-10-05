/**
 * Katalog paket penjualan. `DEFAULT_PACKAGES` menjadi benih paket yang nanti
 * disimpan dan bisa diubah admin; UI harga menerima paket lewat prop sehingga
 * cukup diganti sumber datanya.
 */
export type PackageDefinition = {
  id: string;
  name: string;
  tagline: string;
  /** Harga dalam rupiah. */
  price: number;
  /** Harga coret (sebelum diskon), dalam rupiah. */
  originalPrice?: number;
  durationDays: number;
  highlighted?: boolean;
  /** Daftar keunggulan yang ditampilkan ke calon pelanggan. */
  features: string[];
  limits: { maxInvitations: number; maxGuests: number; maxMediaMB: number };
  flags: {
    music: boolean;
    video: boolean;
    gift: boolean;
    guestList: boolean;
    qrCheckin: boolean;
    customSlug: boolean;
    removeBranding: boolean;
  };
};

export const DEFAULT_PACKAGES: PackageDefinition[] = [
  {
    id: "esensial",
    name: "Esensial",
    tagline: "Cukup untuk undangan yang rapi dan personal.",
    price: 99_000,
    originalPrice: 149_000,
    durationDays: 365,
    features: [
      "1 undangan digital",
      "Pilih dari semua tema Pawiwahan",
      "Hingga 150 tamu dengan tautan personal",
      "RSVP dan ucapan tamu",
      "Peta lokasi dan jadwal acara",
      "Ruang media 100 MB",
    ],
    limits: { maxInvitations: 1, maxGuests: 150, maxMediaMB: 100 },
    flags: {
      music: false,
      video: false,
      gift: false,
      guestList: true,
      qrCheckin: false,
      customSlug: false,
      removeBranding: false,
    },
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "Pilihan terlengkap untuk kebanyakan pasangan.",
    price: 199_000,
    originalPrice: 299_000,
    durationDays: 365,
    highlighted: true,
    features: [
      "1 undangan digital",
      "Semua tema dan mode tanpa foto",
      "Hingga 500 tamu dengan tautan personal",
      "Musik latar dan video YouTube",
      "Amplop digital (hadiah)",
      "Alamat undangan kustom",
      "Ruang media 500 MB",
    ],
    limits: { maxInvitations: 1, maxGuests: 500, maxMediaMB: 500 },
    flags: {
      music: true,
      video: true,
      gift: true,
      guestList: true,
      qrCheckin: false,
      customSlug: true,
      removeBranding: false,
    },
  },
  {
    id: "eksklusif",
    name: "Eksklusif",
    tagline: "Untuk acara besar dan pengelolaan kehadiran yang teliti.",
    price: 349_000,
    originalPrice: 499_000,
    durationDays: 365,
    features: [
      "Hingga 3 undangan (misalnya resepsi terpisah)",
      "Hingga 2.000 tamu",
      "Semua fitur Premium",
      "Check-in tamu dengan kode QR",
      "Tanpa tanda “Dibuat dengan Temu”",
      "Ruang media 2 GB",
    ],
    limits: { maxInvitations: 3, maxGuests: 2000, maxMediaMB: 2048 },
    flags: {
      music: true,
      video: true,
      gift: true,
      guestList: true,
      qrCheckin: true,
      customSlug: true,
      removeBranding: true,
    },
  },
];

/** Format rupiah gaya Indonesia: 1500000 menjadi "Rp1.500.000". */
export function formatRupiah(amount: number): string {
  const rounded = Math.round(Number.isFinite(amount) ? amount : 0);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ".",
  );
  return `${sign}Rp${digits}`;
}

/** Teks masa aktif: 365 hari menjadi "12 bulan", 30 menjadi "1 bulan". */
export function formatDuration(days: number): string {
  if (days >= 360) return `${Math.round(days / 365) * 12} bulan`;
  if (days >= 28 && days % 30 <= 2) return `${Math.round(days / 30)} bulan`;
  return `${days} hari`;
}
