import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
let budget: typeof import("./budget");
let directory: string;
let actor: import("./services").Actor;
let asing: import("./services").Actor;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "budget-test-"));
  process.env.DATA_DIR = directory;
  delete process.env.DATABASE_URL;
  budget = await import("./budget");
  const support = await import("./test-support");
  actor = support.adminActor();
  asing = (await support.registerCustomer("Asing")).actor;
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
describe("anggaran ruang kerja", () => {
  it("menolak akses tanpa sesi dan dari ruang kerja lain", async () => {
    await expect(budget.getBudget(null)).rejects.toThrow();
    // Pelanggan lain punya anggarannya sendiri dan tidak melihat milik admin.
    await budget.addBudgetItem(actor, { name: "Milik admin", estimate: 1 });
    expect((await budget.getBudget(asing)).items).toHaveLength(0);
    const miliknya = await budget.addBudgetItem(asing, { name: "Banten" });
    expect(
      (await budget.getBudget(actor)).items.some((i) => i.id === miliknya.id),
    ).toBe(false);
    await expect(
      budget.removeBudgetItem(
        asing,
        (await budget.getBudget(actor)).items[0].id,
      ),
    ).rejects.toThrow("tidak ditemukan");
    await budget.removeBudgetItem(
      actor,
      (await budget.getBudget(actor)).items[0].id,
    );
  });
  it("menambah pos lalu menghitung ringkasan", async () => {
    const dibuat = await budget.addBudgetItem(actor, {
      category: "upakara",
      name: "Banten pawiwahan",
      estimate: 15000000,
      paid: 5000000,
    });
    expect(dibuat.id).toBeTruthy();
    await budget.addBudgetItem(actor, {
      category: "katering",
      name: "Prasmanan 300 porsi",
      estimate: 30000000,
      actual: 32000000,
      paid: 32000000,
    });
    const hasil = await budget.getBudget(actor);
    expect(hasil.items.length).toBe(2);
    expect(hasil.summary.committed).toBe(47000000);
    expect(hasil.summary.paid).toBe(37000000);
    expect(hasil.summary.outstanding).toBe(10000000);
  });
  it("menyimpan pagu dan menandai pelampauan", async () => {
    await budget.saveBudgetSettings(actor, { cap: 40000000 });
    const hasil = await budget.getBudget(actor);
    expect(hasil.settings.cap).toBe(40000000);
    expect(hasil.summary.overCap).toBe(true);
  });
  it("mengubah dan menghapus pos, menolak id tak dikenal", async () => {
    const { items } = await budget.getBudget(actor);
    const target = items[0];
    const diubah = await budget.updateBudgetItem(actor, target.id, {
      ...target,
      paid: 15000000,
    });
    expect(diubah.paid).toBe(15000000);
    expect(diubah.createdAt).toBe(target.createdAt);
    await expect(
      budget.updateBudgetItem(actor, "tidak-ada", { name: "X" }),
    ).rejects.toThrow("tidak ditemukan");
    await budget.removeBudgetItem(actor, target.id);
    expect((await budget.getBudget(actor)).items.length).toBe(1);
    await expect(budget.removeBudgetItem(actor, target.id)).rejects.toThrow(
      "tidak ditemukan",
    );
  });
});
describe("perbaikan hasil audit", () => {
  it("payload sebagian hanya mengubah kolom yang dikirim", async () => {
    const dibuat = await budget.addBudgetItem(actor, {
      category: "katering",
      name: "Prasmanan",
      vendor: "Dapur Bali",
      estimate: 30000000,
      actual: 32000000,
      paid: 10000000,
      dueDate: "2026-10-01",
      note: "cicil dua kali",
    });
    const diubah = await budget.updateBudgetItem(actor, dibuat.id, {
      name: "Prasmanan 300 porsi",
    });
    expect(diubah.name).toBe("Prasmanan 300 porsi");
    expect(diubah.vendor).toBe("Dapur Bali");
    expect(diubah.estimate).toBe(30000000);
    expect(diubah.actual).toBe(32000000);
    expect(diubah.paid).toBe(10000000);
    expect(diubah.dueDate).toBe("2026-10-01");
    expect(diubah.note).toBe("cicil dua kali");
  });
  it("menolak simpanan yang menimpa perubahan orang lain", async () => {
    const dibuat = await budget.addBudgetItem(actor, { name: "Penjor" });
    // Cap waktu usang mewakili tab lain yang memuat pos sebelum diubah.
    await expect(
      budget.updateBudgetItem(actor, dibuat.id, {
        paid: 2000,
        expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow("diubah di tempat lain");
    const segar = await budget.updateBudgetItem(actor, dibuat.id, {
      paid: 2000,
      expectedUpdatedAt: dibuat.updatedAt,
    });
    expect(segar.paid).toBe(2000);
  });
  it("impor dapat melewati pos yang namanya sudah ada", async () => {
    const csv = await budget.exportBudgetCsv(actor);
    const ulang = await budget.importBudgetCsv(actor, csv, {
      skipExisting: true,
    });
    expect(ulang.added).toBe(0);
    expect(ulang.skipped).toBeGreaterThan(0);
    const ganda = await budget.importBudgetCsv(actor, csv);
    expect(ganda.added).toBeGreaterThan(0);
  });
  it("menolak CSV kosong", async () => {
    await expect(budget.importBudgetCsv(actor, "   ")).rejects.toThrow(
      "kosong",
    );
  });
});
describe("jalur hapus", () => {
  it("tersedia lewat POST karena Astro memblokir DELETE di balik reverse proxy", async () => {
    const dibuat = await budget.addBudgetItem(actor, { name: "Untuk dihapus" });
    await budget.removeBudgetItem(actor, dibuat.id);
    const sisa = await budget.getBudget(actor);
    expect(sisa.items.some((i) => i.id === dibuat.id)).toBe(false);
  });
});
