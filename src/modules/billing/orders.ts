import { randomUUID } from "node:crypto";
import { DomainError } from "../invitations/domain/invitation";
import type {
  GlobalState,
  Order,
  OrderStatus,
  SiteSettings,
} from "../invitations/infrastructure/global-state";
import { activePackages, findPackage, toDefinition } from "./packages";
import { activatePlan, recordAudit } from "./plan";

/**
 * Aturan pesanan transfer manual. Semua fungsi di sini murni terhadap
 * `GlobalState` dan dipanggil dari dalam `mutateGlobal` (lihat server/billing.ts),
 * sehingga seluruh perubahan satu pesanan terjadi dalam satu penulisan atomik.
 */

const HOUR = 3_600_000;
export const DEFAULT_ORDER_EXPIRY_HOURS = 48;
export const MAX_UNIQUE_CODE = 999;
export const MAX_PROOF_NOTE = 300;

/** Pesanan yang masih menahan kode unik dan jatah satu pesanan terbuka. */
export const isOpen = (order: Pick<Order, "status">) =>
  order.status === "pending" || order.status === "awaiting_verification";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Menunggu pembayaran",
  awaiting_verification: "Menunggu verifikasi",
  paid: "Lunas",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
  expired: "Kedaluwarsa",
};

export function orderExpiryHours(settings: SiteSettings) {
  const hours = Number(settings.orderExpiryHours);
  return Number.isFinite(hours) && hours >= 1 && hours <= 720
    ? Math.round(hours)
    : DEFAULT_ORDER_EXPIRY_HOURS;
}

/** Tanggal pada nomor tagihan mengikuti WITA (UTC+8), zona penjual. */
function numberDate(now: number) {
  return new Date(now + 8 * HOUR)
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
}

/** `TMU-YYYYMMDD-NNNN`: urutan harian, terus naik walau ada pesanan dibatalkan. */
export function nextOrderNumber(
  global: Pick<GlobalState, "orders">,
  now = Date.now(),
) {
  const prefix = `TMU-${numberDate(now)}-`;
  let max = 0;
  for (const order of global.orders)
    if (order.number.startsWith(prefix))
      max = Math.max(max, Number(order.number.slice(prefix.length)) || 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/**
 * Kode unik 1–999 sehingga `amount + kode` belum dipakai pesanan terbuka lain;
 * dengan begitu setiap mutasi rekening dapat dicocokkan ke satu pesanan.
 */
export function pickUniqueCode(
  global: Pick<GlobalState, "orders">,
  amount: number,
  options: { excludeOrderId?: string; random?: () => number } = {},
) {
  const random = options.random ?? Math.random;
  const taken = new Set(
    global.orders
      .filter((o) => isOpen(o) && o.id !== options.excludeOrderId)
      .map((o) => o.total),
  );
  const start = Math.floor(random() * MAX_UNIQUE_CODE);
  for (let i = 0; i < MAX_UNIQUE_CODE; i++) {
    const code = ((start + i) % MAX_UNIQUE_CODE) + 1;
    if (!taken.has(amount + code)) return code;
  }
  throw new DomainError(
    "Sistem sedang sibuk menerima pesanan. Coba lagi sebentar lagi.",
    503,
  );
}

/** Pesanan yang belum dibayar melewati batas waktu menjadi `expired`. */
export function expireOverdue(
  global: Pick<GlobalState, "orders">,
  now = Date.now(),
) {
  let changed = 0;
  for (const order of global.orders)
    if (order.status === "pending" && Date.parse(order.expiresAt) <= now) {
      order.status = "expired";
      order.updatedAt = new Date(now).toISOString();
      changed++;
    }
  return changed;
}

export const hasOverdue = (
  global: Pick<GlobalState, "orders">,
  now = Date.now(),
) =>
  global.orders.some(
    (o) => o.status === "pending" && Date.parse(o.expiresAt) <= now,
  );

export const openOrderOf = (
  global: Pick<GlobalState, "orders">,
  workspaceId: string,
) => global.orders.find((o) => o.workspaceId === workspaceId && isOpen(o));

export type CreateOrderInput = {
  workspaceId: string;
  userId: string;
  packageId: string;
  now?: number;
  random?: () => number;
  /** Admin boleh memesan paket nonaktif. */
  byAdmin?: boolean;
};

/**
 * Membuat tagihan. Satu ruang kerja hanya boleh punya satu pesanan terbuka:
 * paket yang sama dipakai ulang (`reused`), paket lain mengganti tagihan
 * yang belum dibayar, dan tagihan yang sudah berbukti harus selesai
 * diverifikasi lebih dulu.
 */
export function createOrder(global: GlobalState, input: CreateOrderInput) {
  const now = input.now ?? Date.now();
  expireOverdue(global, now);
  const pkg = findPackage(global, input.packageId);
  if (!pkg || (!pkg.active && !input.byAdmin))
    throw new DomainError("Paket tidak tersedia.", 404);
  if (!global.workspaces.some((w) => w.id === input.workspaceId))
    throw new DomainError("Ruang kerja tidak ditemukan.", 404);

  const open = openOrderOf(global, input.workspaceId);
  if (open) {
    if (open.status === "awaiting_verification")
      throw new DomainError(
        `Pembayaran ${open.number} sedang menunggu verifikasi. Tunggu hasilnya sebelum memesan paket lain.`,
        409,
      );
    if (open.packageId === pkg.id) return { order: open, reused: true };
    open.status = "cancelled";
    open.updatedAt = new Date(now).toISOString();
  }

  const settings = global.siteSettings ?? {};
  const code = pickUniqueCode(global, pkg.price, { random: input.random });
  const iso = new Date(now).toISOString();
  const order: Order = {
    id: randomUUID(),
    number: nextOrderNumber(global, now),
    workspaceId: input.workspaceId,
    userId: input.userId,
    packageId: pkg.id,
    packageSnapshot: toDefinition(pkg),
    amount: pkg.price,
    uniqueCode: code,
    total: pkg.price + code,
    status: "pending",
    createdAt: iso,
    updatedAt: iso,
    expiresAt: new Date(now + orderExpiryHours(settings) * HOUR).toISOString(),
    ...(input.byAdmin ? { createdByAdmin: true } : {}),
  };
  global.orders.push(order);
  return { order, reused: false };
}

function requireOrder(global: Pick<GlobalState, "orders">, number: string) {
  const order = global.orders.find((o) => o.number === number);
  if (!order) throw new DomainError("Tagihan tidak ditemukan.", 404);
  return order;
}

const stale = (order: Order) =>
  new DomainError(
    `Tagihan ${order.number} berstatus "${STATUS_LABELS[order.status].toLowerCase()}" dan tidak dapat diubah dengan cara ini.`,
    409,
  );

/** Pelanggan hanya boleh mengakses tagihan miliknya; admin boleh semuanya. */
export function canViewOrder(
  order: Pick<Order, "workspaceId">,
  actor: { workspaceId: string; role: "admin" | "customer" },
) {
  return actor.role === "admin" || order.workspaceId === actor.workspaceId;
}

/** Tagihan milik pelanggan; selain pemiliknya (dan admin) hanya mendapat 404. */
export function orderForActor(
  global: Pick<GlobalState, "orders">,
  number: string,
  actor: { workspaceId: string; role: "admin" | "customer" },
) {
  const order = global.orders.find((o) => o.number === number);
  if (!order || !canViewOrder(order, actor))
    throw new DomainError("Tagihan tidak ditemukan.", 404);
  return order;
}

/**
 * Mencatat bukti transfer. Dari `pending`, atau dari `rejected` untuk unggah
 * ulang (kode unik diganti bila nominalnya kini bentrok dengan tagihan lain).
 */
export function submitProof(
  global: GlobalState,
  input: {
    number: string;
    workspaceId: string;
    assetId: string;
    note?: string;
    now?: number;
    random?: () => number;
  },
) {
  const now = input.now ?? Date.now();
  expireOverdue(global, now);
  const order = requireOrder(global, input.number);
  if (order.workspaceId !== input.workspaceId)
    throw new DomainError("Tagihan tidak ditemukan.", 404);
  if (order.status === "expired")
    throw new DomainError(
      "Tagihan sudah kedaluwarsa. Buat pesanan baru dari halaman paket.",
      409,
    );
  if (order.status !== "pending" && order.status !== "rejected")
    throw stale(order);
  if (order.status === "rejected") {
    const other = openOrderOf(global, order.workspaceId);
    if (other)
      throw new DomainError(
        `Selesaikan atau batalkan tagihan ${other.number} dulu sebelum mengunggah ulang bukti.`,
        409,
      );
    const clash = global.orders.some(
      (o) => o.id !== order.id && isOpen(o) && o.total === order.total,
    );
    if (clash) {
      order.uniqueCode = pickUniqueCode(global, order.amount, {
        excludeOrderId: order.id,
        random: input.random,
      });
      order.total = order.amount + order.uniqueCode;
    }
  }
  order.status = "awaiting_verification";
  order.proofAssetId = input.assetId;
  const note = input.note?.trim().slice(0, MAX_PROOF_NOTE);
  if (note) order.proofNote = note;
  else delete order.proofNote;
  delete order.rejectReason;
  order.updatedAt = new Date(now).toISOString();
  return order;
}

/** Pelanggan membatalkan tagihan yang belum dibayar atau yang ditolak. */
export function cancelOwnOrder(
  global: GlobalState,
  input: { number: string; workspaceId: string; now?: number },
) {
  const now = input.now ?? Date.now();
  expireOverdue(global, now);
  const order = requireOrder(global, input.number);
  if (order.workspaceId !== input.workspaceId)
    throw new DomainError("Tagihan tidak ditemukan.", 404);
  if (order.status === "awaiting_verification")
    throw new DomainError(
      "Bukti transfer sudah dikirim dan sedang diverifikasi. Hubungi admin bila ingin membatalkan.",
      409,
    );
  if (order.status !== "pending" && order.status !== "rejected")
    throw stale(order);
  order.status = "cancelled";
  order.updatedAt = new Date(now).toISOString();
  return order;
}

/** Pembayaran sah: tandai lunas dan aktifkan paket pada ruang kerja pemesan. */
export function markOrderPaid(
  global: GlobalState,
  order: Order,
  adminUserId: string,
  now = Date.now(),
) {
  const workspace = global.workspaces.find((w) => w.id === order.workspaceId);
  if (!workspace) throw new DomainError("Ruang kerja tidak ditemukan.", 404);
  const iso = new Date(now).toISOString();
  order.status = "paid";
  order.paidAt = iso;
  order.updatedAt = iso;
  order.verifiedByUserId = adminUserId;
  delete order.rejectReason;
  const plan = activatePlan(
    workspace,
    order.packageId,
    order.packageSnapshot.durationDays,
    now,
  );
  recordAudit(
    global,
    {
      actorUserId: adminUserId,
      action: "order.verify",
      targetType: "order",
      targetId: order.number,
      detail: `${order.packageSnapshot.name}, aktif sampai ${plan.expiresAt}`,
    },
    new Date(now),
  );
  return order;
}

export function verifyOrder(
  global: GlobalState,
  input: { number: string; adminUserId: string; now?: number },
) {
  const now = input.now ?? Date.now();
  const order = requireOrder(global, input.number);
  // `expired` boleh diverifikasi: pelanggan bisa saja membayar setelah batas.
  if (
    order.status !== "awaiting_verification" &&
    order.status !== "pending" &&
    order.status !== "expired"
  )
    throw stale(order);
  return markOrderPaid(global, order, input.adminUserId, now);
}

export function rejectOrder(
  global: GlobalState,
  input: { number: string; adminUserId: string; reason: string; now?: number },
) {
  const now = input.now ?? Date.now();
  const order = requireOrder(global, input.number);
  const reason = input.reason.trim();
  if (!reason) throw new DomainError("Alasan penolakan wajib diisi.");
  if (order.status !== "awaiting_verification") throw stale(order);
  order.status = "rejected";
  order.rejectReason = reason.slice(0, 300);
  order.updatedAt = new Date(now).toISOString();
  recordAudit(
    global,
    {
      actorUserId: input.adminUserId,
      action: "order.reject",
      targetType: "order",
      targetId: order.number,
      detail: order.rejectReason,
    },
    new Date(now),
  );
  return order;
}

export function adminCancelOrder(
  global: GlobalState,
  input: { number: string; adminUserId: string; now?: number },
) {
  const now = input.now ?? Date.now();
  const order = requireOrder(global, input.number);
  if (!["pending", "awaiting_verification", "rejected"].includes(order.status))
    throw stale(order);
  order.status = "cancelled";
  order.updatedAt = new Date(now).toISOString();
  recordAudit(
    global,
    {
      actorUserId: input.adminUserId,
      action: "order.cancel",
      targetType: "order",
      targetId: order.number,
    },
    new Date(now),
  );
  return order;
}

/**
 * Penjualan luar sistem (jasa atau transfer langsung): admin membuat pesanan
 * untuk pelanggan, bisa langsung lunas. Pesanan langsung lunas tidak memakai
 * kode unik (`uniqueCode` 0) dan tidak menahan jatah pesanan terbuka.
 */
export function createOrderForCustomer(
  global: GlobalState,
  input: {
    workspaceId: string;
    packageId: string;
    adminUserId: string;
    markPaid: boolean;
    now?: number;
    random?: () => number;
  },
) {
  const now = input.now ?? Date.now();
  const workspace = global.workspaces.find((w) => w.id === input.workspaceId);
  if (!workspace) throw new DomainError("Pelanggan tidak ditemukan.", 404);
  if (!input.markPaid) {
    const result = createOrder(global, {
      workspaceId: workspace.id,
      userId: workspace.ownerUserId,
      packageId: input.packageId,
      byAdmin: true,
      now,
      random: input.random,
    });
    result.order.createdByAdmin = true;
    recordAudit(
      global,
      {
        actorUserId: input.adminUserId,
        action: "order.create",
        targetType: "order",
        targetId: result.order.number,
        detail: `${result.order.packageSnapshot.name} untuk ${workspace.name}`,
      },
      new Date(now),
    );
    return result;
  }
  expireOverdue(global, now);
  const pkg = findPackage(global, input.packageId);
  if (!pkg) throw new DomainError("Paket tidak tersedia.", 404);
  const iso = new Date(now).toISOString();
  const order: Order = {
    id: randomUUID(),
    number: nextOrderNumber(global, now),
    workspaceId: workspace.id,
    userId: workspace.ownerUserId,
    packageId: pkg.id,
    packageSnapshot: toDefinition(pkg),
    amount: pkg.price,
    uniqueCode: 0,
    total: pkg.price,
    status: "pending",
    createdAt: iso,
    updatedAt: iso,
    expiresAt: iso,
    createdByAdmin: true,
  };
  global.orders.push(order);
  markOrderPaid(global, order, input.adminUserId, now);
  return { order, reused: false };
}

/** Paket yang boleh dipilih pelanggan (aktif) beserta pesanan terbuka miliknya. */
export function checkoutView(global: GlobalState, workspaceId: string) {
  return {
    packages: activePackages(global),
    open: openOrderOf(global, workspaceId),
  };
}

export function ordersOfWorkspace(
  global: Pick<GlobalState, "orders">,
  workspaceId: string,
) {
  return global.orders
    .filter((o) => o.workspaceId === workspaceId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
