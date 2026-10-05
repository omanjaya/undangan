import { describe, expect, it } from "vitest";
import {
  emptyGlobal,
  normalizeGlobal,
  type GlobalState,
} from "../invitations/infrastructure/global-state";
import {
  adminCancelOrder,
  cancelOwnOrder,
  createOrder,
  createOrderForCustomer,
  expireOverdue,
  nextOrderNumber,
  orderForActor,
  pickUniqueCode,
  rejectOrder,
  submitProof,
  verifyOrder,
} from "./orders";

const now = Date.parse("2026-10-05T00:00:00Z");
const HOUR = 3_600_000;

function world(workspaces = 3): GlobalState {
  const g = normalizeGlobal(emptyGlobal());
  for (let i = 1; i <= workspaces; i++) {
    g.users.push({
      id: `u${i}`,
      email: `u${i}@x.test`,
      name: `U${i}`,
      passwordHash: "x",
      role: "customer",
      status: "active",
      createdAt: new Date(now).toISOString(),
    });
    g.workspaces.push({
      id: `w${i}`,
      name: `W${i}`,
      ownerUserId: `u${i}`,
      createdAt: new Date(now).toISOString(),
      plan: { id: "trial", status: "trial" },
    });
  }
  return g;
}

const order = (g: GlobalState, i: number, packageId = "premium", at = now) =>
  createOrder(g, {
    workspaceId: `w${i}`,
    userId: `u${i}`,
    packageId,
    now: at,
  });

describe("paket bawaan di penyimpanan", () => {
  it("normalisasi menyemai paket bila kosong dan tidak menimpa yang ada", () => {
    expect(normalizeGlobal({}).packages.map((p) => p.id)).toEqual([
      "esensial",
      "premium",
      "eksklusif",
    ]);
    const g = normalizeGlobal({ packages: [] });
    g.packages = [g.packages[0]];
    expect(normalizeGlobal(g).packages).toHaveLength(1);
  });
});

describe("kode unik", () => {
  it("tidak pernah memakai total yang sama dengan pesanan terbuka lain", () => {
    const g = world(1);
    // Isi 998 dari 999 kode untuk harga yang sama; hanya satu yang tersisa.
    for (let code = 1; code <= 999; code++) {
      if (code === 417) continue;
      g.orders.push({
        ...order(world(1), 1).order,
        id: `o${code}`,
        number: `X${code}`,
        workspaceId: `other${code}`,
        amount: 199_000,
        uniqueCode: code,
        total: 199_000 + code,
      });
    }
    for (const random of [() => 0, () => 0.5, () => 0.9999]) {
      expect(pickUniqueCode(g, 199_000, { random })).toBe(417);
    }
  });

  it("pesanan yang sudah selesai tidak menahan kodenya, dan penuh melempar 503", () => {
    const g = world(1);
    const base = order(world(1), 1).order;
    for (let code = 1; code <= 999; code++)
      g.orders.push({
        ...base,
        id: `o${code}`,
        number: `X${code}`,
        workspaceId: `o${code}`,
        amount: 1000,
        uniqueCode: code,
        total: 1000 + code,
      });
    expect(() => pickUniqueCode(g, 1000)).toThrow(/sibuk/);
    g.orders[10].status = "cancelled";
    expect(pickUniqueCode(g, 1000)).toBe(11);
    g.orders[10].status = "paid";
    expect(pickUniqueCode(g, 1000)).toBe(11);
  });

  it("nominal beda harga boleh berbagi kode, tetapi total tidak pernah kembar", () => {
    const g = world(3);
    const seen = new Set<number>();
    for (let i = 1; i <= 3; i++) {
      const { order: o } = order(g, i, "esensial");
      expect(o.uniqueCode).toBeGreaterThanOrEqual(1);
      expect(o.uniqueCode).toBeLessThanOrEqual(999);
      expect(o.total).toBe(o.amount + o.uniqueCode);
      expect(seen.has(o.total)).toBe(false);
      seen.add(o.total);
    }
  });
});

describe("nomor dan siklus tagihan", () => {
  it("memberi nomor TMU-YYYYMMDD-NNNN yang naik per hari (WITA)", () => {
    const g = world(2);
    const a = order(g, 1).order;
    expect(a.number).toBe("TMU-20261005-0001");
    expect(order(g, 2).order.number).toBe("TMU-20261005-0002");
    // 17:00 UTC sudah esok hari di WITA.
    expect(nextOrderNumber(g, Date.parse("2026-10-05T17:00:00Z"))).toBe(
      "TMU-20261006-0001",
    );
  });

  it("alur: buat, bukti, verifikasi, paket aktif dari durasi salinan", () => {
    const g = world(1);
    const { order: o } = order(g, 1);
    expect(o.status).toBe("pending");
    expect(Date.parse(o.expiresAt)).toBe(now + 48 * HOUR);
    // Mengubah paket setelahnya tidak mengubah pesanan.
    g.packages.find((p) => p.id === "premium")!.price = 1;
    g.packages.find((p) => p.id === "premium")!.durationDays = 1;
    submitProof(g, {
      number: o.number,
      workspaceId: "w1",
      assetId: "a1",
      note: "  dari BCA  ",
      now,
    });
    expect(o).toMatchObject({
      status: "awaiting_verification",
      proofAssetId: "a1",
      proofNote: "dari BCA",
    });
    verifyOrder(g, { number: o.number, adminUserId: "admin", now });
    expect(o).toMatchObject({
      status: "paid",
      verifiedByUserId: "admin",
      amount: 199_000,
    });
    expect(g.workspaces[0].plan).toEqual({
      id: "premium",
      status: "active",
      expiresAt: new Date(now + 365 * 86_400_000).toISOString(),
    });
    expect(g.auditLog.at(-1)).toMatchObject({
      action: "order.verify",
      targetId: o.number,
    });
    // Tidak bisa diverifikasi dua kali (perpanjangan ganda).
    expect(() =>
      verifyOrder(g, { number: o.number, adminUserId: "admin", now }),
    ).toThrow(/tidak dapat diubah/);
  });

  it("ditolak lalu diunggah ulang kembali menunggu verifikasi", () => {
    const g = world(1);
    const { order: o } = order(g, 1);
    expect(() =>
      rejectOrder(g, { number: o.number, adminUserId: "a", reason: "x" }),
    ).toThrow(); // belum ada bukti
    submitProof(g, { number: o.number, workspaceId: "w1", assetId: "a1", now });
    expect(() =>
      rejectOrder(g, { number: o.number, adminUserId: "a", reason: "  " }),
    ).toThrow(/Alasan/);
    rejectOrder(g, {
      number: o.number,
      adminUserId: "a",
      reason: "Nominal kurang",
      now,
    });
    expect(o).toMatchObject({
      status: "rejected",
      rejectReason: "Nominal kurang",
    });
    submitProof(g, { number: o.number, workspaceId: "w1", assetId: "a2", now });
    expect(o.status).toBe("awaiting_verification");
    expect(o.proofAssetId).toBe("a2");
    expect(o.rejectReason).toBeUndefined();
  });

  it("unggah ulang setelah ditolak mengganti kode unik yang bentrok", () => {
    const g = world(2);
    const { order: o } = order(g, 1);
    submitProof(g, { number: o.number, workspaceId: "w1", assetId: "a", now });
    rejectOrder(g, { number: o.number, adminUserId: "a", reason: "buram" });
    // Pelanggan lain kini memakai total yang sama persis.
    const clash = order(g, 2, "premium", now + 1).order;
    clash.uniqueCode = o.uniqueCode;
    clash.total = o.total;
    cancelOwnOrder(g, { number: clash.number, workspaceId: "w2" });
    clash.status = "pending";
    expect(() =>
      submitProof(g, { number: o.number, workspaceId: "w1", assetId: "b" }),
    ).not.toThrow();
    expect(o.total).not.toBe(clash.total);
    expect(o.total).toBe(o.amount + o.uniqueCode);
  });

  it("pelanggan membatalkan tagihan pending, tetapi tidak yang menunggu verifikasi", () => {
    const g = world(1);
    const { order: o } = order(g, 1);
    cancelOwnOrder(g, { number: o.number, workspaceId: "w1", now });
    expect(o.status).toBe("cancelled");
    expect(() =>
      cancelOwnOrder(g, { number: o.number, workspaceId: "w1" }),
    ).toThrow(/tidak dapat diubah/);
    const { order: p } = order(g, 1);
    submitProof(g, { number: p.number, workspaceId: "w1", assetId: "a", now });
    expect(() =>
      cancelOwnOrder(g, { number: p.number, workspaceId: "w1" }),
    ).toThrow(/diverifikasi/);
    adminCancelOrder(g, { number: p.number, adminUserId: "a", now });
    expect(p.status).toBe("cancelled");
  });

  it("kedaluwarsa setelah batas, mengikuti pengaturan jam, dan tidak bisa diberi bukti", () => {
    const g = world(1);
    g.siteSettings.orderExpiryHours = 2;
    const { order: o } = order(g, 1);
    expect(Date.parse(o.expiresAt)).toBe(now + 2 * HOUR);
    expect(expireOverdue(g, now + HOUR)).toBe(0);
    expect(() =>
      submitProof(g, {
        number: o.number,
        workspaceId: "w1",
        assetId: "a",
        now: now + 3 * HOUR,
      }),
    ).toThrow(/kedaluwarsa/);
    expect(o.status).toBe("expired");
    // Admin masih dapat mengesahkan pembayaran yang datang terlambat.
    verifyOrder(g, { number: o.number, adminUserId: "a", now: now + 4 * HOUR });
    expect(o.status).toBe("paid");
  });

  it("pesanan menunggu verifikasi tidak ikut kedaluwarsa", () => {
    const g = world(1);
    const { order: o } = order(g, 1);
    submitProof(g, { number: o.number, workspaceId: "w1", assetId: "a", now });
    expireOverdue(g, now + 400 * HOUR);
    expect(o.status).toBe("awaiting_verification");
  });
});

describe("satu pesanan terbuka per ruang kerja", () => {
  it("paket sama dipakai ulang, bukan digandakan", () => {
    const g = world(1);
    const first = order(g, 1);
    const second = order(g, 1);
    expect(second.reused).toBe(true);
    expect(second.order).toBe(first.order);
    expect(g.orders).toHaveLength(1);
  });

  it("paket lain mengganti tagihan yang belum dibayar", () => {
    const g = world(1);
    const first = order(g, 1, "esensial").order;
    const second = order(g, 1, "eksklusif").order;
    expect(first.status).toBe("cancelled");
    expect(second.status).toBe("pending");
    expect(g.orders.filter((o) => o.status === "pending")).toHaveLength(1);
  });

  it("tidak boleh memesan lagi saat bukti sedang diverifikasi", () => {
    const g = world(1);
    const { order: o } = order(g, 1);
    submitProof(g, { number: o.number, workspaceId: "w1", assetId: "a", now });
    expect(() => order(g, 1, "eksklusif")).toThrow(/menunggu verifikasi/);
  });

  it("paket nonaktif atau tidak ada ditolak untuk pelanggan, boleh untuk admin", () => {
    const g = world(1);
    g.packages.find((p) => p.id === "esensial")!.active = false;
    expect(() => order(g, 1, "esensial")).toThrow(/tidak tersedia/);
    expect(() => order(g, 1, "tidak-ada")).toThrow(/tidak tersedia/);
    expect(
      createOrder(g, {
        workspaceId: "w1",
        userId: "u1",
        packageId: "esensial",
        byAdmin: true,
        now,
      }).order.createdByAdmin,
    ).toBe(true);
  });
});

describe("pesanan buatan admin", () => {
  it("langsung lunas tanpa kode unik dan mengaktifkan paket", () => {
    const g = world(1);
    const { order: o } = createOrderForCustomer(g, {
      workspaceId: "w1",
      packageId: "eksklusif",
      adminUserId: "admin",
      markPaid: true,
      now,
    });
    expect(o).toMatchObject({
      status: "paid",
      uniqueCode: 0,
      total: o.amount,
      createdByAdmin: true,
    });
    expect(g.workspaces[0].plan).toMatchObject({
      id: "eksklusif",
      status: "active",
    });
  });

  it("tanpa tanda lunas membuat tagihan biasa dan tercatat di audit", () => {
    const g = world(1);
    const { order: o } = createOrderForCustomer(g, {
      workspaceId: "w1",
      packageId: "premium",
      adminUserId: "admin",
      markPaid: false,
      now,
    });
    expect(o).toMatchObject({ status: "pending", createdByAdmin: true });
    expect(g.auditLog.at(-1)?.action).toBe("order.create");
    expect(() =>
      createOrderForCustomer(g, {
        workspaceId: "tidak-ada",
        packageId: "premium",
        adminUserId: "admin",
        markPaid: true,
      }),
    ).toThrow(/tidak ditemukan/);
  });
});

describe("otorisasi tagihan", () => {
  it("pelanggan lain mendapat 404, pemilik dan admin dapat melihat", () => {
    const g = world(2);
    const { order: o } = order(g, 1);
    const view = (workspaceId: string, role: "admin" | "customer") =>
      orderForActor(g, o.number, { workspaceId, role });
    expect(view("w1", "customer")).toBe(o);
    expect(view("w-admin", "admin")).toBe(o);
    expect(() => view("w2", "customer")).toThrow(
      expect.objectContaining({ status: 404 }),
    );
    expect(() =>
      submitProof(g, { number: o.number, workspaceId: "w2", assetId: "a" }),
    ).toThrow(expect.objectContaining({ status: 404 }));
    expect(() =>
      cancelOwnOrder(g, { number: o.number, workspaceId: "w2" }),
    ).toThrow(expect.objectContaining({ status: 404 }));
  });
});
