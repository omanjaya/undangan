import type {
  GlobalState,
  Order,
  User,
  Workspace,
} from "../invitations/infrastructure/global-state";

const DAY = 86_400_000;
/** Zona waktu bisnis (WITA, UTC+8) untuk pengelompokan bulan. */
const WITA_OFFSET = 8 * 3_600_000;

export type InvitationCount = { total: number; published: number };

export type PlanState = "trial" | "active" | "expired";

/** Status efektif paket: paket aktif yang lewat tanggal berakhir dianggap kedaluwarsa. */
export function planState(
  workspace: Pick<Workspace, "plan"> | undefined,
  now = Date.now(),
): PlanState {
  const plan = workspace?.plan;
  if (!plan) return "trial";
  if (plan.status === "expired") return "expired";
  if (plan.status === "active") {
    if (plan.expiresAt && Date.parse(plan.expiresAt) <= now) return "expired";
    return "active";
  }
  return "trial";
}

/** Kunci bulan `YYYY-MM` menurut WITA. */
export function monthKey(time: number) {
  return new Date(time + WITA_OFFSET).toISOString().slice(0, 7);
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];
export function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** Kunci bulan terakhir (termasuk bulan berjalan), terlama lebih dulu. */
export function lastMonthKeys(now: number, count = 6) {
  const base = new Date(now + WITA_OFFSET);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1),
    );
    keys.push(d.toISOString().slice(0, 7));
  }
  return keys;
}

/** Waktu pembayaran pesanan lunas; cadangan ke `updatedAt` untuk data lama. */
const paidTime = (order: Order) =>
  Date.parse(order.paidAt || order.updatedAt || order.createdAt) || 0;

export type OverviewMetrics = {
  totalCustomers: number;
  newLast7Days: number;
  newLast30Days: number;
  activePaid: number;
  trial: number;
  expired: number;
  expiringSoon: number;
  suspended: number;
  publishedInvitations: number;
  totalInvitations: number;
  /** Benar bila hitungan undangan hanya mencakup sebagian ruang kerja. */
  invitationCountsPartial: boolean;
  revenueThisMonth: number;
  revenueAllTime: number;
  awaitingVerification: number;
  monthlyRevenue: {
    key: string;
    label: string;
    total: number;
    orders: number;
  }[];
  latestSignups: User[];
  latestPaidOrders: (Order & { customerName: string })[];
};

/**
 * Menghitung ringkasan admin dari dokumen global. Fungsi murni: hitungan
 * undangan per ruang kerja diberikan pemanggil (membacanya mahal, lihat
 * `loadInvitationCounts` di server/admin.ts).
 */
export function computeOverview(
  global: GlobalState,
  counts: ReadonlyMap<string, InvitationCount>,
  options: { now?: number; partial?: boolean } = {},
): OverviewMetrics {
  const now = options.now ?? Date.now();
  const customers = global.users.filter((u) => u.role === "customer");
  const customerIds = new Set(customers.map((u) => u.id));
  const workspaces = global.workspaces.filter((w) =>
    customerIds.has(w.ownerUserId),
  );
  const created = (u: User) => Date.parse(u.createdAt) || 0;

  let activePaid = 0;
  let trial = 0;
  let expired = 0;
  let expiringSoon = 0;
  for (const workspace of workspaces) {
    const state = planState(workspace, now);
    if (state === "active") {
      activePaid++;
      const end = workspace.plan.expiresAt
        ? Date.parse(workspace.plan.expiresAt)
        : Infinity;
      if (end - now <= 14 * DAY) expiringSoon++;
    } else if (state === "trial") trial++;
    else expired++;
  }

  let published = 0;
  let total = 0;
  for (const workspace of workspaces) {
    const count = counts.get(workspace.id);
    if (!count) continue;
    published += count.published;
    total += count.total;
  }

  const paid = global.orders.filter((o) => o.status === "paid");
  const thisMonth = monthKey(now);
  const keys = lastMonthKeys(now, 6);
  const buckets = new Map(keys.map((k) => [k, { total: 0, orders: 0 }]));
  let revenueThisMonth = 0;
  let revenueAllTime = 0;
  for (const order of paid) {
    const amount = Number.isFinite(order.total) ? order.total : 0;
    revenueAllTime += amount;
    const key = monthKey(paidTime(order));
    if (key === thisMonth) revenueThisMonth += amount;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.total += amount;
      bucket.orders++;
    }
  }

  const names = new Map(global.users.map((u) => [u.id, u.name]));
  return {
    totalCustomers: customers.length,
    newLast7Days: customers.filter((u) => now - created(u) <= 7 * DAY).length,
    newLast30Days: customers.filter((u) => now - created(u) <= 30 * DAY).length,
    activePaid,
    trial,
    expired,
    expiringSoon,
    suspended: customers.filter((u) => u.status === "suspended").length,
    publishedInvitations: published,
    totalInvitations: total,
    invitationCountsPartial: !!options.partial,
    revenueThisMonth,
    revenueAllTime,
    awaitingVerification: global.orders.filter(
      (o) => o.status === "awaiting_verification",
    ).length,
    monthlyRevenue: keys.map((key) => ({
      key,
      label: monthLabel(key),
      ...buckets.get(key)!,
    })),
    latestSignups: [...customers]
      .sort((a, b) => created(b) - created(a))
      .slice(0, 5),
    latestPaidOrders: [...paid]
      .sort((a, b) => paidTime(b) - paidTime(a))
      .slice(0, 5)
      .map((o) => ({
        ...o,
        customerName: names.get(o.userId) ?? "Pelanggan dihapus",
      })),
  };
}
