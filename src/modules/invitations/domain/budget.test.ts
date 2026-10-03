import { describe, it, expect } from "vitest";
import {
  budgetItemInputSchema,
  committedAmount,
  paymentStatus,
  summarizeBudget,
  type BudgetItem,
} from "./budget";

const item = (over: Partial<BudgetItem>): BudgetItem => ({
  id: over.id || "x",
  category: "lainnya",
  name: "Pos",
  vendor: "",
  estimate: 0,
  actual: 0,
  paid: 0,
  dueDate: "",
  note: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("anggaran pernikahan", () => {
  it("menolak nama kosong dan nilai negatif", () => {
    expect(budgetItemInputSchema.safeParse({ name: "" }).success).toBe(false);
    expect(
      budgetItemInputSchema.safeParse({ name: "Banten", estimate: -1 }).success,
    ).toBe(false);
  });
  it("mengisi nilai bawaan dan menerima tanggal kosong", () => {
    const parsed = budgetItemInputSchema.parse({ name: "Banten" });
    expect(parsed.category).toBe("lainnya");
    expect(parsed.estimate).toBe(0);
    expect(parsed.dueDate).toBe("");
    expect(
      budgetItemInputSchema.safeParse({ name: "Banten", dueDate: "2026-09-28" })
        .success,
    ).toBe(true);
    expect(
      budgetItemInputSchema.safeParse({ name: "Banten", dueDate: "28-09-2026" })
        .success,
    ).toBe(false);
  });
  it("memakai realisasi bila ada, selain itu estimasi", () => {
    expect(committedAmount({ estimate: 10, actual: 0 })).toBe(10);
    expect(committedAmount({ estimate: 10, actual: 7 })).toBe(7);
  });
  it("menentukan status bayar dari nilai komitmen", () => {
    expect(paymentStatus({ estimate: 100, actual: 0, paid: 0 })).toBe("belum");
    expect(paymentStatus({ estimate: 100, actual: 0, paid: 40 })).toBe(
      "sebagian",
    );
    // Realisasi turun di bawah uang yang sudah disetor: tetap lunas.
    expect(paymentStatus({ estimate: 100, actual: 80, paid: 80 })).toBe(
      "lunas",
    );
  });
  it("menjumlahkan ringkasan tanpa menutupi kekurangan pos lain", () => {
    const summary = summarizeBudget(
      [
        item({ id: "a", category: "upakara", estimate: 1000, paid: 1200 }),
        item({ id: "b", category: "katering", estimate: 500, paid: 0 }),
      ],
      { cap: 2000 },
    );
    expect(summary.committed).toBe(1500);
    expect(summary.paid).toBe(1200);
    // Lebih bayar 200 di pos a tidak mengurangi kekurangan 500 di pos b.
    expect(summary.outstanding).toBe(500);
    expect(summary.remainingCap).toBe(500);
    expect(summary.overCap).toBe(false);
  });
  it("menandai pagu terlampaui dan hanya mencantumkan kategori terpakai", () => {
    const summary = summarizeBudget(
      [item({ category: "upakara", estimate: 3000 })],
      { cap: 1000 },
    );
    expect(summary.overCap).toBe(true);
    expect(summary.byCategory.map((g) => g.category)).toEqual(["upakara"]);
  });
});
