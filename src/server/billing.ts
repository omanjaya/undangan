import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { getSiteConfig } from "../config/site";
import {
  DEFAULT_PACKAGES,
  type PackageDefinition,
} from "../modules/billing/catalog";
import {
  adminCancelOrder,
  cancelOwnOrder,
  createOrder,
  createOrderForCustomer,
  expireOverdue,
  hasOverdue,
  MAX_PROOF_NOTE,
  openOrderOf,
  orderExpiryHours,
  orderForActor,
  ordersOfWorkspace,
  rejectOrder,
  STATUS_LABELS,
  submitProof,
  verifyOrder,
} from "../modules/billing/orders";
import {
  activePackages,
  deletePackage,
  packageInputSchema,
  savePackage,
  sortPackages,
  toDefinition,
} from "../modules/billing/packages";
import { recordAudit } from "../modules/billing/plan";
import { DomainError } from "../modules/invitations/domain/invitation";
import {
  assetKey,
  mutateGlobal,
  readGlobal,
  type Order,
} from "../modules/invitations/infrastructure/global-store";
import { mutateWorkspace } from "../modules/invitations/infrastructure/store";
import { requireAdmin } from "./auth";
import { notifyPaymentProof } from "./notify";
import { uploadDirectory, uploadMedia } from "./media";
import type { Actor } from "./services";
import { requireActor } from "./tenant";

/**
 * Layanan penagihan: pelanggan memilih paket, mengunggah bukti transfer, dan
 * admin memverifikasi. Aturan inti ada di modules/billing/orders.ts; berkas ini
 * mengurus akses, penyimpanan, bukti transfer, dan notifikasi.
 */

export const PROOF_MAX_MB = 5;

/** Menandai pesanan yang lewat batas waktu; hanya menulis bila ada yang perlu. */
async function sweepExpired() {
  if (hasOverdue(await readGlobal()))
    await mutateGlobal((global) => expireOverdue(global));
}

async function freshGlobal() {
  await sweepExpired();
  return readGlobal();
}

/** Paket yang dijual untuk halaman harga; tetap tampil walau penyimpanan gagal dibaca. */
export async function listSellablePackages(): Promise<PackageDefinition[]> {
  try {
    const packages = activePackages(await readGlobal());
    if (packages.length) return packages.map(toDefinition);
  } catch (error) {
    console.error(
      "Paket tidak dapat dibaca, memakai bawaan:",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
  return DEFAULT_PACKAGES;
}

export const proofUrl = (order: Pick<Order, "proofAssetId">) =>
  order.proofAssetId ? `/media/${order.proofAssetId}.webp` : undefined;

/** Bentuk pesanan yang aman dikirim ke peramban pemiliknya. */
function view(order: Order) {
  return {
    ...order,
    statusLabel: STATUS_LABELS[order.status],
    proofUrl: proofUrl(order),
  };
}
export type OrderView = ReturnType<typeof view>;

export async function getBillingOverview(actor: Actor | null) {
  const { workspaceId } = requireActor(actor);
  const global = await freshGlobal();
  const workspace = global.workspaces.find((w) => w.id === workspaceId);
  if (!workspace) throw new DomainError("Ruang kerja tidak ditemukan.", 404);
  const open = openOrderOf(global, workspaceId);
  return {
    plan: workspace.plan,
    packages: activePackages(global),
    orders: ordersOfWorkspace(global, workspaceId).map(view),
    openOrder: open ? view(open) : null,
  };
}

/** Ringkasan paket untuk dashboard: nama paket yang dibeli (bila masih ada) dan tagihan terbuka. */
export async function getPlanSummary(actor: Actor | null) {
  const { workspaceId } = requireActor(actor);
  const global = await freshGlobal();
  const workspace = global.workspaces.find((w) => w.id === workspaceId);
  if (!workspace) throw new DomainError("Ruang kerja tidak ditemukan.", 404);
  const paid = ordersOfWorkspace(global, workspaceId).find(
    (o) => o.status === "paid" && o.packageId === workspace.plan.id,
  );
  const stored = global.packages.find((p) => p.id === workspace.plan.id);
  const open = openOrderOf(global, workspaceId);
  return {
    plan: workspace.plan,
    packageName:
      stored?.name ??
      paid?.packageSnapshot.name ??
      (workspace.plan.id === "admin" ? "Admin" : workspace.plan.id),
    openOrder: open ? { number: open.number, status: open.status } : null,
  };
}

export async function startOrder(actor: Actor | null, packageId: unknown) {
  const { workspaceId, userId } = requireActor(actor);
  const id = z.string().trim().min(1).max(60).parse(packageId);
  const { order, reused } = await mutateGlobal((global) =>
    createOrder(global, { workspaceId, userId, packageId: id }),
  );
  return { number: order.number, reused };
}

export async function getInvoice(actor: Actor | null, number: string) {
  const current = requireActor(actor);
  const global = await freshGlobal();
  const order = orderForActor(global, number, current);
  const settings = global.siteSettings ?? {};
  const owner = global.users.find((u) => u.id === order.userId);
  return {
    order: view(order),
    customer: { name: owner?.name ?? "", email: owner?.email ?? "" },
    bankAccounts: settings.bankAccounts ?? [],
    paymentNote: settings.paymentNote ?? "",
    expiryHours: orderExpiryHours(settings),
    isOwner: order.workspaceId === current.workspaceId,
  };
}

export async function cancelOrder(actor: Actor | null, number: string) {
  const { workspaceId } = requireActor(actor);
  await mutateGlobal((global) =>
    cancelOwnOrder(global, { number, workspaceId }),
  );
}

async function discardAsset(workspaceId: string, url: string) {
  const filename = url.replace(/^\/media\//, "");
  await mutateWorkspace(workspaceId, (state) => {
    state.assets = (state.assets ?? []).filter((a) => a.filename !== filename);
  }).catch(() => {});
  await mutateGlobal((global) => {
    delete global.mediaIndex[assetKey(filename)];
  }).catch(() => {});
  await unlink(resolve(uploadDirectory(), filename)).catch(() => {});
}

/**
 * Menerima bukti transfer (badan permintaan = berkas gambar). Status dicek
 * sebelum menulis berkas supaya unggahan pada tagihan yang sudah selesai
 * tidak meninggalkan berkas, lalu dicek lagi saat status diubah.
 */
export async function uploadProof(
  actor: Actor | null,
  number: string,
  request: Request,
) {
  const current = requireActor(actor);
  const before = orderForActor(await freshGlobal(), number, current);
  if (before.workspaceId !== current.workspaceId)
    throw new DomainError("Tagihan tidak ditemukan.", 404);
  if (before.status !== "pending" && before.status !== "rejected")
    throw new DomainError(
      before.status === "expired"
        ? "Tagihan sudah kedaluwarsa. Buat pesanan baru dari halaman paket."
        : "Tagihan ini tidak dapat menerima bukti transfer lagi.",
      409,
    );
  let note = "";
  try {
    note = decodeURIComponent(request.headers.get("x-proof-note") || "");
  } catch {
    throw new DomainError("Catatan tidak valid.");
  }
  if (note.length > MAX_PROOF_NOTE)
    throw new DomainError(`Catatan maksimal ${MAX_PROOF_NOTE} karakter.`);
  const asset = await uploadMedia(actor, request, {
    purpose: "payment-proof",
    maxMB: PROOF_MAX_MB,
    imagesOnly: true,
  });
  let order: Order;
  try {
    order = await mutateGlobal((global) =>
      submitProof(global, {
        number,
        workspaceId: current.workspaceId,
        assetId: asset.id,
        note,
      }),
    );
  } catch (error) {
    await discardAsset(current.workspaceId, asset.url);
    throw error;
  }
  const global = await readGlobal();
  const owner = global.users.find((u) => u.id === order.userId);
  notifyPaymentProof({
    number: order.number,
    customerName: owner?.name ?? current.name,
    customerEmail: owner?.email ?? current.email,
    packageName: order.packageSnapshot.name,
    total: order.total,
    ...(order.proofNote ? { note: order.proofNote } : {}),
    url: `${getSiteConfig().url}/admin/pesanan/${order.number}`,
  });
  return view(order);
}

// ---------------------------------------------------------------- admin

export const ORDER_FILTERS = [
  "semua",
  "awaiting_verification",
  "pending",
  "paid",
  "rejected",
  "cancelled",
  "expired",
] as const;
export type OrderFilter = (typeof ORDER_FILTERS)[number];

export async function adminListOrders(
  actor: Actor | null,
  filter: { status?: string; q?: string } = {},
) {
  requireAdmin(actor);
  const global = await freshGlobal();
  const users = new Map(global.users.map((u) => [u.id, u]));
  const q = (filter.q ?? "").trim().toLowerCase();
  const status = ORDER_FILTERS.includes(filter.status as OrderFilter)
    ? (filter.status as OrderFilter)
    : "semua";
  const rows = [...global.orders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((order) => {
      const user = users.get(order.userId);
      return {
        ...view(order),
        customerName: user?.name ?? "",
        customerEmail: user?.email ?? "",
      };
    });
  const counts = Object.fromEntries(
    ORDER_FILTERS.map((s) => [
      s,
      s === "semua" ? rows.length : rows.filter((r) => r.status === s).length,
    ]),
  ) as Record<OrderFilter, number>;
  return {
    counts,
    status,
    rows: rows.filter(
      (r) =>
        (status === "semua" || r.status === status) &&
        (!q ||
          r.number.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.customerEmail.includes(q)),
    ),
  };
}

export async function adminGetOrder(actor: Actor | null, number: string) {
  requireAdmin(actor);
  const global = await freshGlobal();
  const order = global.orders.find((o) => o.number === number);
  if (!order) throw new DomainError("Tagihan tidak ditemukan.", 404);
  const user = global.users.find((u) => u.id === order.userId);
  const workspace = global.workspaces.find((w) => w.id === order.workspaceId);
  return {
    order: view(order),
    customer: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      phone: user?.phone ?? "",
      workspaceName: workspace?.name ?? "",
      plan: workspace?.plan,
    },
  };
}

/** Pelanggan (dengan ruang kerjanya) yang dapat dipilih admin saat membuat pesanan. */
export async function adminCustomerChoices(actor: Actor | null) {
  requireAdmin(actor);
  const global = await readGlobal();
  const owners = new Map(global.users.map((u) => [u.id, u]));
  return global.workspaces
    .map((w) => ({ workspace: w, user: owners.get(w.ownerUserId) }))
    .filter(
      (row) => row.user?.role === "customer" && row.user.status === "active",
    )
    .map((row) => ({
      workspaceId: row.workspace.id,
      label: `${row.user!.name} (${row.user!.email})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const numberSchema = z.string().trim().min(1).max(40);

export async function adminVerifyOrder(actor: Actor | null, number: unknown) {
  const admin = requireAdmin(actor);
  const n = numberSchema.parse(number);
  return view(
    await mutateGlobal((global) =>
      verifyOrder(global, { number: n, adminUserId: admin.userId }),
    ),
  );
}

export async function adminRejectOrder(
  actor: Actor | null,
  number: unknown,
  reason: unknown,
) {
  const admin = requireAdmin(actor);
  const n = numberSchema.parse(number);
  const text = z
    .string()
    .trim()
    .max(300)
    .parse(reason ?? "");
  return view(
    await mutateGlobal((global) =>
      rejectOrder(global, {
        number: n,
        adminUserId: admin.userId,
        reason: text,
      }),
    ),
  );
}

export async function adminCancelOrderByNumber(
  actor: Actor | null,
  number: unknown,
) {
  const admin = requireAdmin(actor);
  const n = numberSchema.parse(number);
  return view(
    await mutateGlobal((global) =>
      adminCancelOrder(global, { number: n, adminUserId: admin.userId }),
    ),
  );
}

const adminOrderSchema = z.object({
  workspaceId: z.string().trim().min(1).max(80),
  packageId: z.string().trim().min(1).max(60),
  markPaid: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === "true" || v === "on"),
});

export async function adminCreateOrder(actor: Actor | null, input: unknown) {
  const admin = requireAdmin(actor);
  const data = adminOrderSchema.parse(input);
  const { order } = await mutateGlobal((global) =>
    createOrderForCustomer(global, { ...data, adminUserId: admin.userId }),
  );
  return view(order);
}

export async function adminListPackages(actor: Actor | null) {
  requireAdmin(actor);
  return sortPackages((await readGlobal()).packages);
}

export async function adminSavePackage(
  actor: Actor | null,
  input: unknown,
  mode: "create" | "update",
) {
  const admin = requireAdmin(actor);
  const data = packageInputSchema.parse(input);
  return mutateGlobal((global) => {
    const { record, before } = savePackage(global, data, mode);
    recordAudit(global, {
      actorUserId: admin.userId,
      action: mode === "create" ? "package.create" : "package.update",
      targetType: "package",
      targetId: record.id,
      detail:
        before && before.price !== record.price
          ? `Harga ${before.price} menjadi ${record.price}`
          : record.name,
    });
    return record;
  });
}

export async function adminDeletePackage(actor: Actor | null, id: unknown) {
  const admin = requireAdmin(actor);
  const packageId = z.string().trim().min(1).max(60).parse(id);
  await mutateGlobal((global) => {
    const removed = deletePackage(global, packageId);
    recordAudit(global, {
      actorUserId: admin.userId,
      action: "package.delete",
      targetType: "package",
      targetId: removed.id,
      detail: removed.name,
    });
  });
}

const bankAccountSchema = z.object({
  bank: z.string().trim().min(1, "Nama bank wajib diisi.").max(60),
  holder: z
    .string()
    .trim()
    .min(1, "Nama pemilik rekening wajib diisi.")
    .max(80),
  number: z
    .string()
    .trim()
    .min(3, "Nomor rekening wajib diisi.")
    .max(40)
    .regex(/^[0-9A-Za-z .\-]+$/, "Nomor rekening tidak valid."),
});

export const settingsSchema = z.object({
  bankAccounts: z.array(bankAccountSchema).max(10, "Maksimal 10 rekening."),
  paymentNote: z.string().trim().max(500).default(""),
  orderExpiryHours: z.coerce
    .number({ error: "Batas waktu harus berupa angka." })
    .int()
    .min(1, "Batas waktu minimal 1 jam.")
    .max(720, "Batas waktu maksimal 720 jam."),
});

export async function getSiteSettings(actor: Actor | null) {
  requireAdmin(actor);
  const settings = (await readGlobal()).siteSettings ?? {};
  return {
    bankAccounts: settings.bankAccounts ?? [],
    paymentNote: settings.paymentNote ?? "",
    orderExpiryHours: orderExpiryHours(settings),
  };
}

export async function adminSaveSettings(actor: Actor | null, input: unknown) {
  const admin = requireAdmin(actor);
  const data = settingsSchema.parse(input);
  await mutateGlobal((global) => {
    global.siteSettings = {
      ...global.siteSettings,
      bankAccounts: data.bankAccounts,
      paymentNote: data.paymentNote,
      orderExpiryHours: data.orderExpiryHours,
    };
    recordAudit(global, {
      actorUserId: admin.userId,
      action: "settings.update",
      targetType: "settings",
      targetId: "pembayaran",
      detail: `${data.bankAccounts.length} rekening, tagihan berlaku ${data.orderExpiryHours} jam`,
    });
  });
}
