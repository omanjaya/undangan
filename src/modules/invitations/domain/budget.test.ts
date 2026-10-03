import { describe, it, expect } from "vitest";
import {
  budgetToCsv,
  budgetItemInputSchema,
  committedAmount,
  paymentStatus,
  summarizeBudget,
  type BudgetItem,
} from "./budget";

const item = (over: Partial<BudgetItem>): BudgetItem => ({
  id: over.id || "x",
  category: "lainnya",
  bearer: "bersama",
  name: "Pos",
  vendor: "",
  estimate: 0,
  actual: null,
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
  it("memakai realisasi bila sudah dicatat, selain itu estimasi", () => {
    expect(committedAmount({ estimate: 10, actual: null })).toBe(10);
    expect(committedAmount({ estimate: 10, actual: 7 })).toBe(7);
    // Pos yang batal: realisasi nol yang disengaja, bukan kembali ke estimasi.
    expect(committedAmount({ estimate: 10, actual: 0 })).toBe(0);
  });
  it("menentukan status bayar dari nilai komitmen", () => {
    expect(paymentStatus({ estimate: 100, actual: null, paid: 0 })).toBe(
      "belum",
    );
    expect(paymentStatus({ estimate: 100, actual: null, paid: 40 })).toBe(
      "sebagian",
    );
    // Realisasi turun di bawah uang yang sudah disetor: tetap lunas.
    expect(paymentStatus({ estimate: 100, actual: 80, paid: 80 })).toBe(
      "lunas",
    );
    // Pos kerangka yang belum diisi apa pun bukan berarti sudah lunas.
    expect(paymentStatus({ estimate: 0, actual: null, paid: 0 })).toBe("belum");
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
describe("penanggung, jatuh tempo, dan ekspor", () => {
  const hariIni = new Date("2026-09-20T08:00:00+08:00");
  it("merekap per keluarga penanggung", () => {
    const summary = summarizeBudget(
      [
        item({ id: "a", bearer: "pria", estimate: 1000, paid: 400 }),
        item({ id: "b", bearer: "wanita", estimate: 600, paid: 600 }),
      ],
      { cap: 0 },
      hariIni,
    );
    expect(summary.byBearer.map((g) => g.bearer)).toEqual(["pria", "wanita"]);
    expect(summary.byBearer[0].outstanding).toBe(600);
    expect(summary.byBearer[1].outstanding).toBe(0);
  });
  it("mengingatkan pos belum lunas yang mendekat dan yang lewat", () => {
    const summary = summarizeBudget(
      [
        item({ id: "a", name: "Lewat", estimate: 500, dueDate: "2026-09-10" }),
        item({ id: "b", name: "Dekat", estimate: 500, dueDate: "2026-09-25" }),
        item({ id: "c", name: "Jauh", estimate: 500, dueDate: "2026-12-01" }),
        item({
          id: "d",
          name: "Sudah lunas",
          estimate: 500,
          paid: 500,
          dueDate: "2026-09-21",
        }),
      ],
      { cap: 0 },
      hariIni,
    );
    expect(summary.dueSoon.map((i) => i.name)).toEqual(["Lewat", "Dekat"]);
    expect(summary.overdue).toBe(1);
    expect(summary.dueSoon[0].daysLeft).toBeLessThan(0);
  });
  it("mengekspor CSV dan menetralkan nilai yang diawali rumus", () => {
    const csv = budgetToCsv([
      item({ id: "a", name: "=cmd|calc", estimate: 1000, paid: 250 }),
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Kategori"');
    expect(csv).toContain('"\'=cmd|calc"');
    expect(csv).toContain('"750"');
  });
});
describe("perbaikan hasil audit", () => {
  it("menandai apostrof milik pengguna agar impor dapat memulihkannya", () => {
    const csv = budgetToCsv([item({ id: "a", name: "'catatan manual" })]);
    expect(csv).toContain(`"''catatan manual"`);
  });
  it("tidak mengingatkan pos yang jatuh tempo tapi tidak punya kekurangan", () => {
    const summary = summarizeBudget(
      [
        item({ id: "a", name: "Serba nol", dueDate: "2026-09-01" }),
        item({
          id: "b",
          name: "Sudah dibayar",
          estimate: 500,
          paid: 500,
          dueDate: "2026-09-01",
        }),
      ],
      { cap: 0 },
      new Date("2026-09-20T08:00:00+08:00"),
    );
    expect(summary.dueSoon).toEqual([]);
    expect(summary.overdue).toBe(0);
  });
  it("mencatat realisasi nol sebagai pos yang batal, bukan kembali ke estimasi", () => {
    const summary = summarizeBudget(
      [item({ id: "a", estimate: 50_000_000, actual: 0 })],
      { cap: 40_000_000 },
      new Date("2026-09-20T08:00:00+08:00"),
    );
    expect(summary.committed).toBe(0);
    expect(summary.overCap).toBe(false);
  });
  it("menerima realisasi kosong sebagai belum dicatat", () => {
    expect(budgetItemInputSchema.parse({ name: "Pos" }).actual).toBeNull();
    expect(
      budgetItemInputSchema.parse({ name: "Pos", actual: "" }).actual,
    ).toBeNull();
    expect(budgetItemInputSchema.parse({ name: "Pos", actual: 0 }).actual).toBe(
      0,
    );
  });
});
describe("validasi nilai rupiah", () => {
  const nilai = (estimate: unknown) =>
    budgetItemInputSchema.safeParse({ name: "Pos", estimate });
  it("menolak nilai yang bukan angka rupiah", () => {
    // z.coerce dulu menerima ini sebagai 16 dan 1.
    expect(nilai("0x10").success).toBe(false);
    expect(nilai(true).success).toBe(false);
    expect(nilai("12abc").success).toBe(false);
    expect(nilai(1.5).success).toBe(false);
  });
  it("menerima angka dan string berisi digit", () => {
    expect(nilai(18000000).data?.estimate).toBe(18000000);
    expect(nilai("18000000").data?.estimate).toBe(18000000);
    expect(nilai(" 250 ").data?.estimate).toBe(250);
  });
});
