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

export const budgetItemInputSchema = z.object({
  category: z.enum(BUDGET_CATEGORIES).default("lainnya"),
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

export function summarizeBudget(items: BudgetItem[], settings: BudgetSettings) {
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
  return {
    cap: settings.cap,
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
