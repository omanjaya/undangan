import { createHash } from "node:crypto";
import { readdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { verifyPasswordOrDummy } from "../modules/accounts/password";
import { DomainError } from "../modules/invitations/domain/invitation";
import {
  assetKey,
  mutateGlobal,
  readGlobal,
  type User,
} from "../modules/invitations/infrastructure/global-store";
import {
  discardWorkspaceState,
  tryReadWorkspace,
} from "../modules/invitations/infrastructure/store";
import { revokeUserSessions, setPassword, validatePassword } from "./auth";
import { uploadDirectory } from "./media";
import type { Actor } from "./services";
import { requireActor } from "./tenant";

/** Frasa yang harus diketik untuk menghapus akun. */
export const DELETE_CONFIRMATION = "HAPUS AKUN";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const PASSWORD_WRONG = "Kata sandi saat ini tidak sesuai.";

/** Tindakan sensitif tidak boleh dilakukan admin yang sedang menyamar. */
function requireOwnSession(actor: Actor | null) {
  const own = requireActor(actor);
  if (own.impersonatorUserId)
    throw new DomainError(
      "Tindakan ini tidak tersedia saat menyamar sebagai pengguna.",
      403,
    );
  return own;
}

async function requireCurrentPassword(userId: string, password: unknown) {
  const global = await readGlobal();
  const user = global.users.find((u) => u.id === userId);
  if (!user) throw new DomainError("Akun tidak ditemukan.", 404);
  const ok = await verifyPasswordOrDummy(
    typeof password === "string" ? password.slice(0, 200) : "",
    user.passwordHash,
  );
  if (!ok) throw new DomainError(PASSWORD_WRONG, 403);
  return user;
}

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(100),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+()\-\s]*$/, "Nomor telepon hanya boleh berisi angka.")
    .optional()
    .transform((value) => value || undefined),
});

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Format email tidak valid."));

export type AccountSession = {
  createdAt: number;
  expiresAt: number;
  current: boolean;
};

export async function getAccount(actor: Actor | null, currentToken?: string) {
  const { userId } = requireActor(actor);
  const global = await readGlobal();
  const user = global.users.find((u) => u.id === userId);
  if (!user) throw new DomainError("Akun tidak ditemukan.", 404);
  const current = currentToken ? hash(currentToken) : null;
  const now = Date.now();
  const sessions: AccountSession[] = global.sessions
    .filter((s) => s.userId === userId && s.expiresAt > now)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((s) => ({
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      current: s.tokenHash === current,
    }));
  return {
    profile: {
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      role: user.role,
      createdAt: user.createdAt,
    },
    sessions,
  };
}

export async function updateProfile(actor: Actor | null, input: unknown) {
  const { userId } = requireOwnSession(actor);
  const data = profileSchema.parse(input);
  await mutateGlobal((global) => {
    const user = global.users.find((u) => u.id === userId);
    if (!user) throw new DomainError("Akun tidak ditemukan.", 404);
    const workspace = global.workspaces.find((w) => w.ownerUserId === userId);
    // Nama ruang kerja mengikuti nama akun selama belum diubah terpisah.
    if (workspace && workspace.name === user.name) workspace.name = data.name;
    user.name = data.name;
    if (data.phone) user.phone = data.phone;
    else delete user.phone;
  });
  return { name: data.name, phone: data.phone ?? "" };
}

export async function changeEmail(
  actor: Actor | null,
  input: { currentPassword?: unknown; email?: unknown },
) {
  const { userId } = requireOwnSession(actor);
  const email = emailSchema.parse(input.email);
  await requireCurrentPassword(userId, input.currentPassword);
  await mutateGlobal((global) => {
    const user = global.users.find((u) => u.id === userId);
    if (!user) throw new DomainError("Akun tidak ditemukan.", 404);
    if (global.users.some((u) => u.id !== userId && u.email === email))
      throw new DomainError("Email sudah dipakai akun lain.", 409);
    user.email = email;
  });
  return { email };
}

export async function changePassword(
  actor: Actor | null,
  currentToken: string | undefined,
  input: {
    currentPassword?: unknown;
    newPassword?: unknown;
    confirmPassword?: unknown;
  },
) {
  const { userId } = requireOwnSession(actor);
  const password = validatePassword(input.newPassword);
  if (input.confirmPassword !== undefined && input.confirmPassword !== password)
    throw new DomainError("Konfirmasi kata sandi tidak sama.");
  await requireCurrentPassword(userId, input.currentPassword);
  // Sesi lain dicabut, sesi yang sedang dipakai dipertahankan.
  await setPassword(userId, password, { keepToken: currentToken });
}

export async function signOutOtherSessions(
  actor: Actor | null,
  currentToken: string | undefined,
) {
  const { userId } = requireOwnSession(actor);
  if (!currentToken) throw new DomainError("Sesi tidak ditemukan.", 401);
  await revokeUserSessions(userId, currentToken);
}

const publicUser = (user: User) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone ?? null,
  role: user.role,
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt ?? null,
});

/**
 * Salinan data pemilik akun (UU PDP): profil dan isi ruang kerja miliknya.
 * Tidak memuat hash kata sandi/sesi, data pengguna lain, maupun penanda
 * internal pengunjung (`visitorId`).
 */
export async function exportAccountData(actor: Actor | null) {
  const { userId } = requireOwnSession(actor);
  const global = await readGlobal();
  const user = global.users.find((u) => u.id === userId);
  const workspace = global.workspaces.find((w) => w.ownerUserId === userId);
  if (!user || !workspace) throw new DomainError("Akun tidak ditemukan.", 404);
  const state = await tryReadWorkspace(workspace.id);
  const slugs = Object.entries(global.slugs)
    .filter(([, entry]) => entry.workspaceId === workspace.id)
    .map(([slug]) => slug);
  return {
    exportedAt: new Date().toISOString(),
    profile: publicUser(user),
    workspace: {
      id: workspace.id,
      name: workspace.name,
      createdAt: workspace.createdAt,
      plan: workspace.plan,
      slugs,
    },
    orders: global.orders
      .filter((o) => o.workspaceId === workspace.id)
      .map((o) => ({
        number: o.number,
        packageId: o.packageId,
        amount: o.amount,
        total: o.total,
        status: o.status,
        createdAt: o.createdAt,
        paidAt: o.paidAt ?? null,
      })),
    invitations: state?.invitations ?? [],
    guests: state?.guests ?? [],
    guestTemplates: state?.guestTemplates ?? {},
    rsvps: (state?.rsvps ?? []).map(({ visitorId: _, ...rsvp }) => rsvp),
    wishes: state?.wishes ?? [],
    budget: state?.budget ?? [],
    budgetSettings: state?.budgetSettings ?? null,
    media: (state?.assets ?? []).map(
      ({ filename: _, workspaceId: __, ...asset }) => asset,
    ),
  };
}

/**
 * Menghapus akun beserta ruang kerjanya.
 *
 * Urutan: dokumen global dulu (akun tidak bisa masuk dan alamat publik langsung
 * 404), lalu dokumen ruang kerja, lalu berkas media. Kunci tidak pernah
 * bersarang. Pesanan (`orders`) dibiarkan untuk pembukuan, begitu pula berkas
 * bukti transfer yang dirujuknya.
 */
export async function deleteAccount(
  actor: Actor | null,
  input: { password?: unknown; confirmation?: unknown },
) {
  const own = requireOwnSession(actor);
  const global = await readGlobal();
  const user = global.users.find((u) => u.id === own.userId);
  if (!user) throw new DomainError("Akun tidak ditemukan.", 404);
  if (user.role === "admin")
    throw new DomainError("Akun admin tidak dapat dihapus dari sini.", 403);
  if (
    typeof input.confirmation !== "string" ||
    input.confirmation.trim().toUpperCase() !== DELETE_CONFIRMATION
  )
    throw new DomainError(`Ketik "${DELETE_CONFIRMATION}" untuk memastikan.`);
  await requireCurrentPassword(own.userId, input.password);

  const workspaceId = global.workspaces.find(
    (w) => w.ownerUserId === own.userId,
  )?.id;
  const state = workspaceId ? await tryReadWorkspace(workspaceId) : null;

  const removedKeys = await mutateGlobal((g) => {
    const target = g.users.find((u) => u.id === own.userId);
    // Diperiksa ulang di dalam kunci: peran bisa berubah sejak dibaca.
    if (!target) throw new DomainError("Akun tidak ditemukan.", 404);
    if (target.role === "admin")
      throw new DomainError("Akun admin tidak dapat dihapus dari sini.", 403);
    const wsIds = new Set(
      g.workspaces.filter((w) => w.ownerUserId === own.userId).map((w) => w.id),
    );
    g.users = g.users.filter((u) => u.id !== own.userId);
    g.sessions = g.sessions.filter((s) => s.userId !== own.userId);
    g.passwordResets = g.passwordResets.filter((t) => t.userId !== own.userId);
    g.workspaces = g.workspaces.filter((w) => !wsIds.has(w.id));
    for (const [slug, entry] of Object.entries(g.slugs))
      if (wsIds.has(entry.workspaceId)) delete g.slugs[slug];
    const keys = new Set<string>();
    for (const [key, owner] of Object.entries(g.mediaIndex))
      if (wsIds.has(owner)) {
        keys.add(key);
        delete g.mediaIndex[key];
      }
    return keys;
  });

  if (workspaceId) await discardWorkspaceState(workspaceId);

  // Bukti transfer pesanan tetap disimpan untuk pembukuan.
  const keep = new Set(
    global.orders
      .filter((o) => o.workspaceId === workspaceId && o.proofAssetId)
      .map((o) => o.proofAssetId!),
  );
  for (const asset of state?.assets ?? [])
    removedKeys.add(assetKey(asset.filename));
  const directory = uploadDirectory();
  let files: string[] = [];
  try {
    files = await readdir(directory);
  } catch {
    // Direktori belum ada: tidak ada berkas yang perlu dihapus.
  }
  await Promise.all(
    files
      .filter(
        (file) => removedKeys.has(assetKey(file)) && !keep.has(assetKey(file)),
      )
      .map((file) => unlink(resolve(directory, file)).catch(() => {})),
  );
  return { deleted: true };
}
