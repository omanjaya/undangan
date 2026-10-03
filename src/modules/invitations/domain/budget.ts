import { z } from "zod";

/**
 * Pos pengeluaran yang lazim pada rangkaian pawiwahan Bali. Upakara dipisah
 * dari dekorasi karena sarana upacara dan punia pemangku dianggarkan sendiri,
 * terpisah dari kebutuhan resepsi.
 */
export const BUDGET_CATEGORIES = [
  "upakara",
  "tempat",
  "katering",
  "busana",
  "dokumentasi",
  "hiburan",
  "undangan",
  "transportasi",
  "lainnya",
] as const;

export const CATEGORY_LABELS: Record<
  (typeof BUDGET_CATEGORIES)[number],
  string
> = {
  upakara: "Upakara & Banten",
  tempat: "Tempat & Dekorasi",
  katering: "Katering",
  busana: "Busana & Rias",
  dokumentasi: "Dokumentasi",
  hiburan: "Hiburan & Gamelan",
  undangan: "Undangan & Suvenir",
  transportasi: "Transportasi & Akomodasi",
  lainnya: "Lain-lain",
};

/** Rupiah disimpan sebagai bilangan bulat; pecahan sen tidak dipakai. */
const rupiah = z.coerce
  .number()
  .int("Gunakan angka bulat dalam rupiah.")
  .min(0, "Nilai tidak boleh negatif.")
  .max(100_000_000_000, "Nilai terlalu besar.")
  .default(0);

/**
 * Di Bali biaya pawiwahan lazim dipikul bersama kedua keluarga dengan
 * pembagian yang disepakati, jadi tiap pos mencatat penanggungnya.
 */
export const BUDGET_BEARERS = ["bersama", "pria", "wanita"] as const;

export const BEARER_LABELS: Record<(typeof BUDGET_BEARERS)[number], string> = {
  bersama: "Ditanggung bersama",
  pria: "Keluarga mempelai pria",
  wanita: "Keluarga mempelai wanita",
};

export const budgetItemInputSchema = z.object({
  category: z.enum(BUDGET_CATEGORIES).default("lainnya"),
  bearer: z.enum(BUDGET_BEARERS).default("bersama"),
  name: z.string().trim().min(1, "Nama pos wajib diisi.").max(120),
  vendor: z.string().trim().max(120).default(""),
  estimate: rupiah,
  actual: rupiah,
  paid: rupiah,
  dueDate: z
    .union([z.iso.date(), z.literal("")])
    .default("")
    .describe("Tanggal jatuh tempo pembayaran, format YYYY-MM-DD."),
  note: z.string().trim().max(500).default(""),
});

export type BudgetItemInput = z.infer<typeof budgetItemInputSchema>;

export type BudgetItem = BudgetItemInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export const budgetSettingsSchema = z.object({
  cap: rupiah.describe("Pagu total yang disepakati keluarga."),
});

export type BudgetSettings = z.infer<typeof budgetSettingsSchema>;

/**
 * Nilai yang dipakai untuk menghitung komitmen: realisasi bila sudah ada,
 * selain itu estimasi. Ini mencegah pos yang sudah dibayar penuh tetap
 * dihitung dari angka perkiraan.
 */
export function committedAmount(item: Pick<BudgetItem, "estimate" | "actual">) {
  return item.actual > 0 ? item.actual : item.estimate;
}

export type PaymentStatus = "lunas" | "sebagian" | "belum";

export function paymentStatus(
  item: Pick<BudgetItem, "estimate" | "actual" | "paid">,
): PaymentStatus {
  const committed = committedAmount(item);
  if (committed > 0 && item.paid >= committed) return "lunas";
  return item.paid > 0 ? "sebagian" : "belum";
}

export type BudgetSummary = ReturnType<typeof summarizeBudget>;

/** Hari tersisa menuju jatuh tempo; negatif berarti sudah lewat. */
function daysUntil(dueDate: string, today: Date) {
  const due = Date.parse(`${dueDate}T00:00:00+08:00`);
  if (Number.isNaN(due)) return null;
  return Math.ceil((due - today.getTime()) / 86_400_000);
}

export function summarizeBudget(
  items: BudgetItem[],
  settings: BudgetSettings,
  today = new Date(),
) {
  const estimate = items.reduce((n, i) => n + i.estimate, 0);
  const actual = items.reduce((n, i) => n + i.actual, 0);
  const committed = items.reduce((n, i) => n + committedAmount(i), 0);
  const paid = items.reduce((n, i) => n + i.paid, 0);
  // Kekurangan per pos tidak pernah negatif: lebih bayar pada satu pos tidak
  // boleh menutupi kekurangan pos lain.
  const outstanding = items.reduce(
    (n, i) => n + Math.max(committedAmount(i) - i.paid, 0),
    0,
  );
  const byCategory = BUDGET_CATEGORIES.map((category) => {
    const entries = items.filter((i) => i.category === category);
    return {
      category,
      label: CATEGORY_LABELS[category],
      count: entries.length,
      estimate: entries.reduce((n, i) => n + i.estimate, 0),
      committed: entries.reduce((n, i) => n + committedAmount(i), 0),
      paid: entries.reduce((n, i) => n + i.paid, 0),
    };
  }).filter((group) => group.count > 0);
  const byBearer = BUDGET_BEARERS.map((bearer) => {
    const entries = items.filter((i) => i.bearer === bearer);
    return {
      bearer,
      label: BEARER_LABELS[bearer],
      count: entries.length,
      committed: entries.reduce((n, i) => n + committedAmount(i), 0),
      paid: entries.reduce((n, i) => n + i.paid, 0),
      outstanding: entries.reduce(
        (n, i) => n + Math.max(committedAmount(i) - i.paid, 0),
        0,
      ),
    };
  }).filter((group) => group.count > 0);

  // Hanya pos yang belum lunas yang perlu diingatkan.
  const dueSoon = items
    .filter((i) => i.dueDate && paymentStatus(i) !== "lunas")
    .map((i) => ({
      id: i.id,
      name: i.name,
      dueDate: i.dueDate,
      outstanding: Math.max(committedAmount(i) - i.paid, 0),
      daysLeft: daysUntil(i.dueDate, today),
    }))
    .filter((i) => i.daysLeft !== null && i.daysLeft <= 30)
    .sort((a, b) => a.daysLeft! - b.daysLeft!);

  return {
    cap: settings.cap,
    byBearer,
    dueSoon,
    overdue: dueSoon.filter((i) => i.daysLeft! < 0).length,
    items: items.length,
    estimate,
    actual,
    committed,
    paid,
    outstanding,
    /** Positif berarti masih ada ruang di bawah pagu. */
    remainingCap: settings.cap > 0 ? settings.cap - committed : 0,
    overCap: settings.cap > 0 && committed > settings.cap,
    byCategory,
  };
}

/**
 * Kerangka pos yang umum ada pada rangkaian pawiwahan Bali. Nilainya sengaja
 * nol: angka diisi pemilik setelah menawar dengan masing-masing vendor.
 */
export const BUDGET_TEMPLATE: ReadonlyArray<{
  category: (typeof BUDGET_CATEGORIES)[number];
  name: string;
}> = [
  { category: "upakara", name: "Banten pawiwahan" },
  { category: "upakara", name: "Punia pemangku / sulinggih" },
  { category: "upakara", name: "Sarana upacara & bebantenan harian" },
  { category: "tempat", name: "Sewa tempat / wantilan" },
  { category: "tempat", name: "Dekorasi & penjor" },
  { category: "tempat", name: "Tenda, kursi, dan perlengkapan" },
  { category: "katering", name: "Prasmanan tamu" },
  { category: "katering", name: "Konsumsi pengayah & panitia" },
  { category: "busana", name: "Payas agung mempelai" },
  { category: "busana", name: "Rias & sanggul" },
  { category: "busana", name: "Busana keluarga inti" },
  { category: "dokumentasi", name: "Foto & video hari H" },
  { category: "dokumentasi", name: "Prewedding" },
  { category: "hiburan", name: "Gong kebyar / gamelan" },
  { category: "hiburan", name: "Tari penyambutan" },
  { category: "hiburan", name: "Sound system & MC" },
  { category: "undangan", name: "Undangan digital & cetak" },
  { category: "undangan", name: "Suvenir tamu" },
  { category: "transportasi", name: "Transportasi keluarga" },
  { category: "transportasi", name: "Akomodasi tamu luar kota" },
];

const CSV_HEADERS = [
  "Kategori",
  "Pos",
  "Penanggung",
  "Vendor",
  "Estimasi",
  "Realisasi",
  "Dibayar",
  "Kekurangan",
  "Status",
  "Jatuh tempo",
  "Catatan",
] as const;

/** Nilai yang diawali tanda rumus dinetralkan agar aman dibuka di spreadsheet. */
function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function budgetToCsv(items: BudgetItem[]) {
  const rows = items.map((item) =>
    [
      CATEGORY_LABELS[item.category],
      item.name,
      BEARER_LABELS[item.bearer],
      item.vendor,
      item.estimate,
      item.actual,
      item.paid,
      Math.max(committedAmount(item) - item.paid, 0),
      paymentStatus(item),
      item.dueDate,
      item.note,
    ]
      .map(csvCell)
      .join(","),
  );
  // BOM agar Excel membaca karakter Indonesia dengan benar.
  return `﻿${[CSV_HEADERS.map(csvCell).join(","), ...rows].join("\r\n")}\r\n`;
}
