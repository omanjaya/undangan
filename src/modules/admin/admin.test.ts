import { describe, expect, it } from "vitest";
import {
  emptyGlobal,
  type GlobalState,
  type Order,
  type User,
  type Workspace,
} from "../invitations/infrastructure/global-state";
import { filterAudit } from "./audit";
import {
  generateTempPassword,
  whatsappLink,
  whatsappMessage,
} from "./client-message";
import { customerRows, queryCustomers } from "./customers";
import {
  computeOverview,
  lastMonthKeys,
  monthKey,
  planState,
  type InvitationCount,
} from "./metrics";

const DAY = 86_400_000;
// 15 Okt 2026, 12:00 WITA
const NOW = Date.parse("2026-10-15T04:00:00Z");

const user = (id: string, over: Partial<User> = {}): User => ({
  id,
  email: `${id}@example.test`,
  name: `Nama ${id}`,
  passwordHash: "x",
  role: "customer",
  status: "active",
  createdAt: new Date(NOW - 100 * DAY).toISOString(),
  ...over,
});
const workspace = (owner: string, plan: Workspace["plan"]): Workspace => ({
  id: `w-${owner}`,
  name: owner,
  ownerUserId: owner,
  createdAt: new Date(NOW).toISOString(),
  plan,
});
const order = (id: string, over: Partial<Order> = {}): Order =>
  ({
    id,
    number: id,
    workspaceId: "w-a",
    userId: "a",
    total: 100_000,
    status: "paid",
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    paidAt: new Date(NOW).toISOString(),
    ...over,
  }) as Order;

function sample(): GlobalState {
  const g = emptyGlobal();
  g.users = [
    user("admin", { role: "admin" }),
    user("a", { createdAt: new Date(NOW - 2 * DAY).toISOString() }),
    user("b", { createdAt: new Date(NOW - 20 * DAY).toISOString() }),
    user("c", { status: "suspended" }),
    user("d"),
  ];
  g.workspaces = [
    workspace("admin", { id: "admin", status: "active" }),
    workspace("a", {
      id: "premium",
      status: "active",
      expiresAt: new Date(NOW + 5 * DAY).toISOString(),
    }),
    workspace("b", { id: "trial", status: "trial" }),
    workspace("c", {
      id: "premium",
      status: "active",
      expiresAt: new Date(NOW + 200 * DAY).toISOString(),
    }),
    workspace("d", {
      id: "premium",
      status: "active",
      expiresAt: new Date(NOW - DAY).toISOString(),
    }),
  ];
  g.orders = [
    order("o1", { total: 200_000 }),
    order("o2", {
      total: 50_000,
      paidAt: new Date(Date.parse("2026-08-10T00:00:00Z")).toISOString(),
    }),
    order("o3", { status: "awaiting_verification", total: 999 }),
    order("o4", { status: "rejected", total: 999 }),
    order("o5", { userId: "ghost", total: 10_000 }),
  ];
  return g;
}
const counts = new Map<string, InvitationCount>([
  ["w-a", { total: 2, published: 1 }],
  ["w-b", { total: 1, published: 0 }],
  ["w-c", { total: 1, published: 1 }],
  // Ruang kerja admin tidak boleh ikut terhitung.
  ["w-admin", { total: 9, published: 9 }],
]);

describe("planState", () => {
  it("menurunkan status efektif", () => {
    expect(planState(undefined)).toBe("trial");
    expect(planState({ plan: { id: "trial", status: "trial" } })).toBe("trial");
    expect(
      planState(
        {
          plan: {
            id: "p",
            status: "active",
            expiresAt: new Date(NOW - 1).toISOString(),
          },
        },
        NOW,
      ),
    ).toBe("expired");
    expect(planState({ plan: { id: "p", status: "active" } }, NOW)).toBe(
      "active",
    );
  });
});

describe("computeOverview", () => {
  const m = computeOverview(sample(), counts, { now: NOW });
  it("menghitung pelanggan tanpa admin", () => {
    expect(m.totalCustomers).toBe(4);
    expect(m.newLast7Days).toBe(1);
    expect(m.newLast30Days).toBe(2);
    expect(m.suspended).toBe(1);
  });
  it("memisahkan paket aktif, uji coba, kedaluwarsa, dan akan berakhir", () => {
    expect(m.activePaid).toBe(2);
    expect(m.trial).toBe(1);
    expect(m.expired).toBe(1);
    expect(m.expiringSoon).toBe(1);
  });
  it("menjumlahkan undangan hanya dari ruang kerja pelanggan", () => {
    expect(m.totalInvitations).toBe(4);
    expect(m.publishedInvitations).toBe(2);
  });
  it("menghitung pendapatan dari pesanan lunas saja", () => {
    expect(m.revenueAllTime).toBe(260_000);
    expect(m.revenueThisMonth).toBe(210_000);
    expect(m.awaitingVerification).toBe(1);
  });
  it("menyusun enam bulan, bulan berjalan terakhir", () => {
    expect(m.monthlyRevenue.map((x) => x.key)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(m.monthlyRevenue[3].total).toBe(50_000);
    expect(m.monthlyRevenue[5].total).toBe(210_000);
  });
  it("mendaftar pendaftar dan pesanan terbaru, termasuk pelanggan terhapus", () => {
    expect(m.latestSignups[0].id).toBe("a");
    expect(m.latestPaidOrders.find((o) => o.id === "o5")?.customerName).toBe(
      "Pelanggan dihapus",
    );
  });
});

describe("bulan WITA", () => {
  it("memakai batas bulan WITA, bukan UTC", () => {
    // 31 Okt 17:00 UTC = 1 Nov 01:00 WITA
    expect(monthKey(Date.parse("2026-10-31T17:00:00Z"))).toBe("2026-11");
    expect(lastMonthKeys(Date.parse("2026-01-15T00:00:00Z"), 3)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
  });
});

describe("daftar pelanggan", () => {
  const rows = customerRows(sample(), counts, NOW);
  it("hanya pelanggan, terbaru dulu", () => {
    expect(rows.map((r) => r.user.id)).not.toContain("admin");
    expect(rows[0].user.id).toBe("a");
  });
  it("mencari nama, email, dan telepon", () => {
    const g = sample();
    g.users.find((u) => u.id === "b")!.phone = "0812-3456-7890";
    const r = customerRows(g, counts, NOW);
    expect(
      queryCustomers(r, { q: "NAMA A" }).rows.map((x) => x.user.id),
    ).toEqual(["a"]);
    expect(queryCustomers(r, { q: "d@example" }).matched).toBe(1);
    expect(queryCustomers(r, { q: "081234567890" }).rows[0].user.id).toBe("b");
  });
  it("memfilter status dan membagi halaman", () => {
    expect(queryCustomers(rows, { filter: "suspended" }).rows[0].user.id).toBe(
      "c",
    );
    expect(queryCustomers(rows, { filter: "expired" }).rows[0].user.id).toBe(
      "d",
    );
    const page = queryCustomers(rows, { pageSize: 3, page: 2 });
    expect(page.pages).toBe(2);
    expect(page.rows).toHaveLength(1);
    expect(queryCustomers(rows, { pageSize: 3, page: 99 }).page).toBe(2);
  });
});

describe("filterAudit", () => {
  const g = sample();
  const at = (iso: string) => iso;
  g.auditLog = [
    {
      id: "1",
      at: at("2026-10-01T10:00:00Z"),
      actorUserId: "admin",
      action: "user.suspend",
      targetType: "user",
      targetId: "a",
    },
    {
      id: "2",
      at: at("2026-10-02T10:00:00Z"),
      actorUserId: "admin",
      action: "order.verify",
      targetType: "order",
      targetId: "o1",
    },
    {
      id: "3",
      at: at("2026-10-03T10:00:00Z"),
      actorUserId: "a",
      action: "user.plan",
      targetType: "user",
      targetId: "b",
    },
  ];
  it("urut terbaru dan menyaring awalan tindakan", () => {
    expect(filterAudit(g, {}).entries.map((e) => e.id)).toEqual([
      "3",
      "2",
      "1",
    ]);
    expect(filterAudit(g, { action: "user." }).matched).toBe(2);
    expect(filterAudit(g, { action: "order.verify" }).matched).toBe(1);
  });
  it("menyaring pelaku dan target lewat nama atau id", () => {
    expect(filterAudit(g, { actor: "nama a" }).entries[0].id).toBe("3");
    expect(filterAudit(g, { target: "a@example.test" }).entries[0].id).toBe(
      "1",
    );
    expect(filterAudit(g, { target: "o1" }).matched).toBe(1);
  });
  it("menyaring rentang tanggal inklusif", () => {
    expect(
      filterAudit(g, { from: "2026-10-02", to: "2026-10-02" }).matched,
    ).toBe(1);
    expect(filterAudit(g, { from: "2026-10-02" }).matched).toBe(2);
    expect(filterAudit(g, { to: "2026-10-01" }).matched).toBe(1);
  });
  it("membagi halaman", () => {
    const r = filterAudit(g, { pageSize: 2, page: 2 });
    expect(r.pages).toBe(2);
    expect(r.entries.map((e) => e.id)).toEqual(["1"]);
  });
});

describe("pesan klien", () => {
  it("kata sandi sementara acak dan terbaca", () => {
    const a = generateTempPassword();
    expect(a).toHaveLength(12);
    expect(a).toMatch(/^[a-zA-Z2-9]+$/);
    expect(a).not.toMatch(/[0OIl1]/);
    expect(generateTempPassword()).not.toBe(a);
  });
  it("menyusun pesan dan tautan WhatsApp", () => {
    const msg = whatsappMessage({
      name: "Sari",
      loginUrl: "https://x.id/login",
      email: "s@x.id",
      password: "pw",
    });
    expect(msg).toContain("https://x.id/login");
    expect(msg).toContain("s@x.id");
    expect(msg).toContain("pw");
    expect(whatsappLink("0812-345-678", msg)).toMatch(
      /^https:\/\/wa\.me\/62812345678\?text=/,
    );
    expect(whatsappLink("", msg)).toBeNull();
  });
});
