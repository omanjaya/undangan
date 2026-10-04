import { z } from "zod";

/**
 * Daftar tamu per undangan. Setiap tamu punya kode acak pendek yang menjadi
 * kunci tautan pribadi, pelacakan buka, dan QR masuk.
 */
export const GUEST_CODE_LENGTH = 10;
/** Tanpa huruf/angka yang mudah tertukar (0/o, 1/l/i) agar aman diketik manual. */
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const GUEST_CODE_PATTERN = /^[a-hjkmnp-z2-9]{10}$/;
export const MAX_GUESTS_PER_INVITATION = 1000;
export const GUEST_IMPORT_MAX_ROWS = 500;
export const MAX_GUEST_PAX = 5;

export type Guest = {
  id: string;
  invitationId: string;
  code: string;
  name: string;
  /** Nomor WhatsApp ternormalisasi (62…), kosong bila tidak diisi. */
  phone: string;
  group: string;
  /** Jatah orang per undangan; null bila tidak dibatasi. */
  maxPax: number | null;
  sentAt: string | null;
  firstOpenedAt: string | null;
  openCount: number;
  checkedInAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const guestInputSchema = z.object({
  name: z.string().trim().min(1, "Nama tamu wajib diisi.").max(100),
  phone: z.string().trim().max(40).default(""),
  group: z.string().trim().max(60).default(""),
  maxPax: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === null || v === "") return null;
      const n = typeof v === "number" ? v : Number(v.trim());
      if (!Number.isInteger(n) || n < 1 || n > MAX_GUEST_PAX) {
        ctx.addIssue({
          code: "custom",
          message: `Jatah orang harus 1–${MAX_GUEST_PAX}.`,
        });
        return z.NEVER;
      }
      return n;
    }),
});
export type GuestInput = z.output<typeof guestInputSchema>;

/**
 * Nomor Indonesia ditulis banyak cara: 0812-3456-7890, +62 812 3456 7890,
 * 62812…, 812…. Semuanya dibawa ke 62812… yang dipahami wa.me.
 * Kosong tetap kosong; nilai yang tidak masuk akal mengembalikan null.
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const plus = trimmed.startsWith("+");
  let digits = trimmed.replace(/[\s().\-]/g, "");
  if (!/^\+?\d+$/.test(digits)) return null;
  digits = digits.replace(/^\+/, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8") && !plus) digits = `62${digits}`;
  // "+62 0812…" salah ketik: nol di depan nomor lokal ikut tertulis.
  if (digits.startsWith("620")) digits = `62${digits.slice(3)}`;
  if (!/^\d{8,15}$/.test(digits)) return null;
  if (digits.startsWith("62") && (digits.length < 10 || digits.length > 14))
    return null;
  return digits;
}

export function generateGuestCode(
  random: (n: number) => Uint8Array,
  taken: ReadonlySet<string> = new Set(),
) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const bytes = random(GUEST_CODE_LENGTH * 2);
    let code = "";
    for (const byte of bytes) {
      // Buang byte di luar kelipatan alfabet agar sebarannya merata.
      if (byte >= 248) continue;
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (code.length === GUEST_CODE_LENGTH) break;
    }
    if (code.length === GUEST_CODE_LENGTH && !taken.has(code)) return code;
  }
  throw new Error("Gagal membuat kode tamu unik.");
}

/** Terima kode polos maupun URL hasil pindai QR (`…?kode=xxxx`). */
export function parseScannedCode(value: string): string {
  const text = value.trim();
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      const code = url.searchParams.get("kode") ?? url.searchParams.get("g");
      if (code) return code.trim().toLowerCase();
    } catch {
      /* jatuh ke pembacaan polos */
    }
  }
  return text.toLowerCase();
}

export const DEFAULT_WA_TEMPLATE =
  "Om Swastyastu {nama},\n\nDengan penuh sukacita, kami mengundang Anda untuk hadir dan memberikan doa restu pada hari bahagia kami. Detail acara dan konfirmasi kehadiran dapat dibuka melalui tautan pribadi berikut:\n\n{tautan}\n\nMerupakan kehormatan bagi kami apabila Anda berkenan hadir. Terima kasih.\n\nOm Shanti Shanti Shanti Om";

export const waTemplateSchema = z
  .string()
  .trim()
  .min(1, "Pesan tidak boleh kosong.")
  .max(1000, "Pesan maksimal 1000 karakter.")
  .refine((v) => v.includes("{tautan}"), "Pesan harus memuat {tautan}.");

export function renderWaMessage(template: string, name: string, link: string) {
  return template
    .replace(/\{nama\}/g, () => name)
    .replace(/\{tautan\}/g, () => link);
}

export function waUrl(phone: string, message: string) {
  const text = encodeURIComponent(message);
  return phone
    ? `https://wa.me/${phone}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

export function guestLink(
  origin: string,
  slug: string,
  guest: Pick<Guest, "name" | "code">,
) {
  return `${origin.replace(/\/$/, "")}/i/${encodeURIComponent(slug)}?to=${encodeURIComponent(guest.name)}&g=${guest.code}`;
}

export type GuestStatus =
  "belum-dikirim" | "terkirim" | "dibuka" | "hadir" | "tidak-hadir";

export const GUEST_STATUS_LABELS: Record<GuestStatus, string> = {
  "belum-dikirim": "Belum dikirim",
  terkirim: "Terkirim",
  dibuka: "Dibuka",
  hadir: "RSVP hadir",
  "tidak-hadir": "Tidak hadir",
};

export type GuestRsvp = {
  attendance: "attending" | "declined";
  attendeeCount: number;
} | null;

/** RSVP mengalahkan buka, buka mengalahkan terkirim: status paling maju yang tampil. */
export function guestStatus(guest: Guest, rsvp: GuestRsvp): GuestStatus {
  if (rsvp) return rsvp.attendance === "attending" ? "hadir" : "tidak-hadir";
  if (guest.firstOpenedAt) return "dibuka";
  if (guest.sentAt) return "terkirim";
  return "belum-dikirim";
}

/** Jumlah orang yang diharapkan datang: RSVP bila ada, selain itu jatah, selain itu satu. */
export function expectedPax(guest: Guest, rsvp: GuestRsvp) {
  if (rsvp?.attendance === "attending") return rsvp.attendeeCount;
  return guest.maxPax ?? 1;
}

export type GuestView = Guest & {
  status: GuestStatus;
  rsvp: GuestRsvp;
  pax: number;
};

export type GuestSummary = {
  total: number;
  belumDikirim: number;
  terkirim: number;
  dibuka: number;
  hadir: number;
  hadirOrang: number;
  tidakHadir: number;
  belumRespons: number;
  checkedIn: number;
  checkedInOrang: number;
};

export function summarizeGuests(views: GuestView[]): GuestSummary {
  const summary: GuestSummary = {
    total: views.length,
    belumDikirim: 0,
    terkirim: 0,
    dibuka: 0,
    hadir: 0,
    hadirOrang: 0,
    tidakHadir: 0,
    belumRespons: 0,
    checkedIn: 0,
    checkedInOrang: 0,
  };
  for (const view of views) {
    if (view.status === "belum-dikirim") summary.belumDikirim++;
    else if (view.status === "terkirim") summary.terkirim++;
    else if (view.status === "dibuka") summary.dibuka++;
    else if (view.status === "hadir") {
      summary.hadir++;
      summary.hadirOrang += view.pax;
    } else summary.tidakHadir++;
    if (!view.rsvp) summary.belumRespons++;
    if (view.checkedInAt) {
      summary.checkedIn++;
      summary.checkedInOrang += view.pax;
    }
  }
  return summary;
}

/** Kode hanya berlaku pada undangan tamunya; kode undangan lain dianggap tidak ada. */
export function findGuestByCode(
  guests: Guest[] | undefined,
  invitationId: string,
  code: unknown,
) {
  if (typeof code !== "string" || !GUEST_CODE_PATTERN.test(code)) return null;
  return (
    (guests ?? []).find(
      (g) => g.code === code && g.invitationId === invitationId,
    ) ?? null
  );
}

/** Nilai berawalan tanda rumus dinetralkan agar aman dibuka di spreadsheet. */
function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text)
    ? `'${text}`
    : text.startsWith("'")
      ? `'${text}`
      : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function guestsToCsv(
  views: GuestView[],
  linkFor: (guest: Guest) => string,
) {
  const header = [
    "Nama",
    "Telepon",
    "Grup",
    "Jatah orang",
    "Status",
    "Jumlah hadir",
    "Check-in",
    "Tautan",
  ];
  const rows = views.map((v) =>
    [
      v.name,
      v.phone,
      v.group,
      v.maxPax ?? "",
      GUEST_STATUS_LABELS[v.status],
      v.rsvp?.attendance === "attending" ? v.rsvp.attendeeCount : "",
      v.checkedInAt ?? "",
      linkFor(v),
    ]
      .map(csvCell)
      .join(","),
  );
  return `﻿${[header.map(csvCell).join(","), ...rows].join("\r\n")}\r\n`;
}
