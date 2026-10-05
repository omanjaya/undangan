import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import {
  computeOverview,
  planState,
  type InvitationCount,
} from "../modules/admin/metrics";
import { customerRows } from "../modules/admin/customers";
import {
  generateTempPassword,
  whatsappLink,
  whatsappMessage,
} from "../modules/admin/client-message";
import { activatePlan, recordAudit } from "../modules/billing/plan";
import { DEFAULT_PACKAGES } from "../modules/billing/catalog";
import { DomainError } from "../modules/invitations/domain/invitation";
import {
  mutateGlobal,
  readGlobal,
  type GlobalState,
  type Workspace,
} from "../modules/invitations/infrastructure/global-store";
import {
  discardWorkspaceState,
  tryReadWorkspace,
} from "../modules/invitations/infrastructure/store";
import {
  createSession,
  getActor,
  logout,
  register,
  registerSchema,
  requireAdmin,
  setPassword,
} from "./auth";
import { uploadDirectory } from "./media";
import type { Actor } from "./services";

/* ------------------------------------------------------------------ */
/* Hitungan undangan per ruang kerja                                   */
/* ------------------------------------------------------------------ */

/**
 * Membaca dokumen setiap ruang kerja mahal (JSON besar), jadi hitungan
 * undangan di-cache di memori selama 60 detik per ruang kerja dan satu
 * permintaan membaca paling banyak `READ_CAP` ruang kerja yang belum
 * tersimpan. Bila lebih banyak, sisanya dihitung 0 dan hasil ditandai
 * `partial` (UI memberi catatan "perkiraan"); permintaan berikutnya melengkapi
 * cache sedikit demi sedikit.
 */
const COUNT_TTL_MS = 60_000;
const READ_CAP = 200;
const BATCH = 10;
const countCache = new Map<string, { at: number; count: InvitationCount }>();

export function clearInvitationCountCache(workspaceId?: string) {
  if (workspaceId) countCache.delete(workspaceId);
  else countCache.clear();
}

export async function loadInvitationCounts(
  workspaceIds: string[],
  now = Date.now(),
) {
  const counts = new Map<string, InvitationCount>();
  const missing: string[] = [];
  for (const id of workspaceIds) {
    const hit = countCache.get(id);
    if (hit && now - hit.at < COUNT_TTL_MS) counts.set(id, hit.count);
    else missing.push(id);
  }
  const toRead = missing.slice(0, READ_CAP);
  for (let i = 0; i < toRead.length; i += BATCH) {
    await Promise.all(
      toRead.slice(i, i + BATCH).map(async (id) => {
        const state = await tryReadWorkspace(id);
        const count = {
          total: state?.invitations.length ?? 0,
          published:
            state?.invitations.filter((v) => v.status === "published").length ??
            0,
        };
        countCache.set(id, { at: now, count });
        counts.set(id, count);
      }),
    );
  }
  return { counts, partial: missing.length > READ_CAP };
}

const customerWorkspaceIds = (global: GlobalState) => {
  const owners = new Set(
    global.users.filter((u) => u.role === "customer").map((u) => u.id),
  );
  return global.workspaces
    .filter((w) => owners.has(w.ownerUserId))
    .map((w) => w.id);
};

/* ------------------------------------------------------------------ */
/* Pembacaan                                                           */
/* ------------------------------------------------------------------ */

export async function getOverview(actor: Actor | null) {
  requireAdmin(actor);
  const global = await readGlobal();
  const { counts, partial } = await loadInvitationCounts(
    customerWorkspaceIds(global),
  );
  return computeOverview(global, counts, { partial });
}

export async function getCustomerList(actor: Actor | null) {
  requireAdmin(actor);
  const global = await readGlobal();
  const { counts, partial } = await loadInvitationCounts(
    customerWorkspaceIds(global),
  );
  return { rows: customerRows(global, counts), partial, global };
}

/** Paket yang dapat dipasang manual: dari `global.packages`, atau katalog bawaan bila kosong. */
export function assignablePackages(global: GlobalState) {
  const source = global.packages.length
    ? global.packages.filter((p) => p.active !== false)
    : DEFAULT_PACKAGES;
  return source.map((p) => ({
    id: p.id,
    name: p.name,
    durationDays: p.durationDays,
  }));
}

function findCustomer(global: GlobalState, userId: string) {
  const user = global.users.find((u) => u.id === userId);
  if (!user) throw new DomainError("Pelanggan tidak ditemukan.", 404);
  if (user.role !== "customer")
    throw new DomainError("Tindakan ini hanya untuk akun pelanggan.", 403);
  const workspace = global.workspaces.find((w) => w.ownerUserId === user.id);
  return { user, workspace };
}

export async function getCustomerDetail(actor: Actor | null, userId: string) {
  requireAdmin(actor);
  const global = await readGlobal();
  const { user, workspace } = findCustomer(global, userId);
  const state = workspace ? await tryReadWorkspace(workspace.id) : null;
  const ids = new Set([user.id, workspace?.id ?? ""]);
  return {
    user,
    workspace,
    plan: planState(workspace),
    invitations: (state?.invitations ?? []).map((i) => ({
      id: i.id,
      slug: i.slug,
      status: i.status,
      updatedAt: i.updatedAt,
      title: `${i.draft.groom} & ${i.draft.bride}`,
    })),
    orders: global.orders
      .filter((o) => o.userId === user.id || o.workspaceId === workspace?.id)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    audit: global.auditLog
      .filter((e) => ids.has(e.targetId))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, 30),
    packages: assignablePackages(global),
  };
}

/* ------------------------------------------------------------------ */
/* Tangguhkan / aktifkan                                               */
/* ------------------------------------------------------------------ */

/**
 * Menangguhkan akun: tidak bisa masuk dan semua sesinya (termasuk sesi
 * penyamaran) dicabut. Undangan terbit tetap tampil bagi tamu: acara sudah
 * berjalan dan tamu tidak bersalah atas sengketa akun.
 */
export async function setCustomerStatus(
  actor: Actor | null,
  userId: string,
  status: "active" | "suspended",
) {
  const admin = requireAdmin(actor);
  await mutateGlobal((global) => {
    const { user } = findCustomer(global, userId);
    if (user.status === status) return;
    user.status = status;
    if (status === "suspended")
      global.sessions = global.sessions.filter((s) => s.userId !== user.id);
    recordAudit(global, {
      actorUserId: admin.userId,
      action: status === "suspended" ? "user.suspend" : "user.activate",
      targetType: "user",
      targetId: user.id,
      detail: user.email,
    });
  });
  return { userId, status };
}

/* ------------------------------------------------------------------ */
/* Penyamaran                                                          */
/* ------------------------------------------------------------------ */

export async function startImpersonation(
  actor: Actor | null,
  userId: string,
  currentToken?: string,
) {
  const admin = requireAdmin(actor);
  if (admin.impersonatorUserId)
    throw new DomainError("Akhiri penyamaran yang sedang berjalan dulu.", 409);
  await mutateGlobal((global) => {
    const { user, workspace } = findCustomer(global, userId);
    if (user.status !== "active")
      throw new DomainError(
        "Akun ditangguhkan. Aktifkan kembali sebelum masuk sebagai pelanggan.",
        409,
      );
    if (!workspace)
      throw new DomainError("Pelanggan belum memiliki ruang kerja.", 409);
    recordAudit(global, {
      actorUserId: admin.userId,
      action: "user.impersonate.start",
      targetType: "user",
      targetId: user.id,
      detail: user.email,
    });
  });
  const token = await createSession(userId, {
    impersonatorUserId: admin.userId,
  });
  // Sesi admin lama tidak dibutuhkan lagi; sesi baru dibuat saat penyamaran berakhir.
  if (currentToken)
    await logout(
      new Request("http://local", {
        headers: { cookie: `invitation_session=${currentToken}` },
      }),
    );
  return token;
}

/** Mengakhiri penyamaran: sesi pelanggan dicabut dan sesi admin baru dibuat. */
export async function endImpersonation(request: Request) {
  const actor = await getActor(request);
  if (!actor?.impersonatorUserId)
    throw new DomainError("Tidak sedang menyamar sebagai pelanggan.", 400);
  const adminId = actor.impersonatorUserId;
  await mutateGlobal((global) => {
    const admin = global.users.find((u) => u.id === adminId);
    if (!admin || admin.role !== "admin" || admin.status !== "active")
      throw new DomainError("Akun admin tidak lagi valid.", 403);
    recordAudit(global, {
      actorUserId: adminId,
      action: "user.impersonate.end",
      targetType: "user",
      targetId: actor.userId,
      detail: actor.email,
    });
  });
  await logout(request);
  const token = await createSession(adminId);
  return { token, redirect: `/admin/pelanggan/${actor.userId}` };
}

/* ------------------------------------------------------------------ */
/* Paket manual                                                        */
/* ------------------------------------------------------------------ */

const planSchema = z.object({
  mode: z.enum(["package", "trial"]),
  packageId: z.string().trim().max(60).optional(),
  durationDays: z.coerce.number().int().min(1).max(3650).optional(),
  /** `YYYY-MM-DD`; bila diisi mengalahkan `durationDays`. */
  expiresOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  note: z.string().trim().max(200).optional(),
});
export type ManualPlanInput = z.input<typeof planSchema>;

/** Berakhir pada akhir hari WITA tanggal tersebut. */
const endOfDayWita = (date: string) =>
  new Date(Date.parse(`${date}T23:59:59.000Z`) - 8 * 3_600_000).toISOString();

/** Menerapkan paket pada ruang kerja; panggil di dalam `mutateGlobal`. */
export function applyManualPlan(
  global: GlobalState,
  workspace: Workspace,
  input: z.output<typeof planSchema>,
  now = Date.now(),
) {
  if (input.mode === "trial") {
    workspace.plan = { id: "trial", status: "trial" };
    return workspace.plan;
  }
  const known = global.packages.length
    ? global.packages
    : (DEFAULT_PACKAGES as { id: string; durationDays: number }[]);
  const pkg = known.find((p) => p.id === input.packageId);
  if (!pkg) throw new DomainError("Paket tidak dikenal.", 400);
  if (input.expiresOn) {
    const expiresAt = endOfDayWita(input.expiresOn);
    if (Date.parse(expiresAt) <= now)
      throw new DomainError("Tanggal berakhir harus di masa depan.", 400);
    workspace.plan = { id: pkg.id, status: "active", expiresAt };
    return workspace.plan;
  }
  return activatePlan(
    workspace,
    pkg.id,
    input.durationDays ?? pkg.durationDays,
    now,
  );
}

export async function setManualPlan(
  actor: Actor | null,
  userId: string,
  input: unknown,
) {
  const admin = requireAdmin(actor);
  const data = planSchema.parse(input);
  const plan = await mutateGlobal((global) => {
    const { user, workspace } = findCustomer(global, userId);
    if (!workspace)
      throw new DomainError("Pelanggan belum memiliki ruang kerja.", 409);
    const result = applyManualPlan(global, workspace, data);
    recordAudit(global, {
      actorUserId: admin.userId,
      action: "user.plan",
      targetType: "workspace",
      targetId: workspace.id,
      detail: [
        user.email,
        result.status === "trial"
          ? "uji coba"
          : `${result.id} sampai ${result.expiresAt}`,
        data.note,
      ]
        .filter(Boolean)
        .join(" | "),
    });
    return result;
  });
  return { plan };
}

/* ------------------------------------------------------------------ */
/* Kata sandi sementara                                                */
/* ------------------------------------------------------------------ */

export async function resetCustomerPassword(
  actor: Actor | null,
  userId: string,
) {
  const admin = requireAdmin(actor);
  const global = await readGlobal();
  const { user } = findCustomer(global, userId);
  const password = generateTempPassword();
  await setPassword(user.id, password);
  await mutateGlobal((g) => {
    recordAudit(g, {
      actorUserId: admin.userId,
      action: "user.password_reset",
      targetType: "user",
      targetId: user.id,
      detail: user.email,
    });
  });
  return { password, email: user.email };
}

/* ------------------------------------------------------------------ */
/* Hapus pelanggan                                                     */
/* ------------------------------------------------------------------ */

/**
 * Menghapus pelanggan beserta seluruh datanya: akun, sesi, ruang kerja,
 * indeks slug dan media, dokumen ruang kerja, dan berkas media. Pesanan tetap
 * disimpan (pembukuan) dan diberi `deletedCustomer`. Konfirmasi wajib berupa
 * email pelanggan yang diketik ulang.
 *
 * Urutan: indeks global dibersihkan dulu (akun hilang, halaman tamu 404),
 * baru dokumen dan berkas. Kegagalan di tengah hanya menyisakan data yatim
 * tanpa penunjuk, bukan akun setengah terhapus.
 */
export async function deleteCustomer(
  actor: Actor | null,
  userId: string,
  confirmEmail: string,
) {
  const admin = requireAdmin(actor);
  const before = await readGlobal();
  const { user, workspace } = findCustomer(before, userId);
  if (confirmEmail.trim().toLowerCase() !== user.email)
    throw new DomainError("Email konfirmasi tidak sesuai.", 400);

  const state = workspace ? await tryReadWorkspace(workspace.id) : null;
  const filenames = (state?.assets ?? []).map((a) => a.filename);

  await mutateGlobal((global) => {
    const current = findCustomer(global, userId);
    const now = new Date().toISOString();
    const workspaceId = current.workspace?.id;
    global.users = global.users.filter((u) => u.id !== user.id);
    global.sessions = global.sessions.filter((s) => s.userId !== user.id);
    if (workspaceId) {
      global.workspaces = global.workspaces.filter((w) => w.id !== workspaceId);
      for (const [slug, entry] of Object.entries(global.slugs))
        if (entry.workspaceId === workspaceId) delete global.slugs[slug];
      for (const [asset, owner] of Object.entries(global.mediaIndex))
        if (owner === workspaceId) delete global.mediaIndex[asset];
    }
    for (const order of global.orders)
      if (order.userId === user.id || order.workspaceId === workspaceId)
        order.deletedCustomer = {
          name: user.name,
          email: user.email,
          deletedAt: now,
        };
    recordAudit(global, {
      actorUserId: admin.userId,
      action: "user.delete",
      targetType: "user",
      targetId: user.id,
      detail: `${user.name} <${user.email}>`,
    });
  });

  if (workspace) {
    await discardWorkspaceState(workspace.id);
    clearInvitationCountCache(workspace.id);
  }
  const root = uploadDirectory();
  await Promise.all(
    filenames.map((name) => {
      const path = resolve(root, name);
      // Nama berkas berasal dari data kita sendiri, tetapi jangan pernah keluar dari direktori unggahan.
      if (!path.startsWith(root + "/") && !path.startsWith(root + "\\"))
        return undefined;
      return rm(path, { force: true });
    }),
  );
  return { deleted: true, removedMedia: filenames.length };
}

/* ------------------------------------------------------------------ */
/* Akun klien (mode jasa)                                              */
/* ------------------------------------------------------------------ */

const clientSchema = registerSchema
  .pick({ name: true, email: true, phone: true })
  .extend({
    packageId: z
      .string()
      .trim()
      .max(60)
      .optional()
      .transform((v) => v || undefined),
  });

/**
 * Admin membuat akun untuk klien: memakai `register` yang sama dengan
 * pendaftaran mandiri (akun, ruang kerja uji coba, undangan awal), dengan
 * kata sandi sementara acak yang ditampilkan sekali. Paket opsional langsung
 * diaktifkan.
 */
export async function createClientAccount(
  actor: Actor | null,
  input: unknown,
  loginUrl: string,
) {
  const admin = requireAdmin(actor);
  const data = clientSchema.parse(input);
  if (
    data.packageId &&
    !assignablePackages(await readGlobal()).some((p) => p.id === data.packageId)
  )
    throw new DomainError("Paket tidak dikenal.", 400);
  const password = generateTempPassword();
  const created = await register({
    name: data.name,
    email: data.email,
    phone: data.phone,
    password,
  });
  await mutateGlobal((global) => {
    const workspace = global.workspaces.find(
      (w) => w.id === created.workspaceId,
    );
    if (workspace && data.packageId)
      applyManualPlan(global, workspace, {
        mode: "package",
        packageId: data.packageId,
      });
    recordAudit(global, {
      actorUserId: admin.userId,
      action: "user.create",
      targetType: "user",
      targetId: created.userId,
      detail: [data.email, data.packageId].filter(Boolean).join(" | "),
    });
  });
  const message = whatsappMessage({
    name: data.name,
    loginUrl,
    email: data.email.toLowerCase(),
    password,
  });
  return {
    userId: created.userId,
    email: data.email.toLowerCase(),
    password,
    message,
    whatsappUrl: whatsappLink(data.phone, message),
  };
}
