import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  hashPassword,
  verifyPasswordOrDummy,
} from "../modules/accounts/password";
import { DomainError } from "../modules/invitations/domain/invitation";
import { starterInvitation } from "../modules/invitations/domain/starter";
import {
  mutateGlobal,
  readGlobal,
  slugEntry,
  type User,
} from "../modules/invitations/infrastructure/global-store";
import { isDemoMode } from "../modules/invitations/infrastructure/bootstrap";
import {
  createWorkspaceState,
  discardWorkspaceState,
} from "../modules/invitations/infrastructure/store";
import { initialWorkspaceState } from "../modules/invitations/infrastructure/state";
import type { Actor } from "./services";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/**
 * Sesi berlaku tetap 7 hari sejak login (tanpa perpanjangan otomatis), sehingga
 * `getActor` tetap hanya membaca dan tidak menulis pada tiap permintaan.
 */
export const SESSION_TTL_MS = 7 * 86_400_000;
const MAX_SESSIONS_PER_USER = 10;
export const PASSWORD_MIN_LENGTH = 8;
// Batas atas mencegah kata sandi raksasa dipakai untuk membebani scrypt.
const PASSWORD_MAX_LENGTH = 200;

export const isDemo = isDemoMode();

export function cookieValue(request: Request, name: string) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(name + "="))
    ?.slice(name.length + 1);
}
export function sessionCookie(value: string, maxAge = SESSION_TTL_MS / 1000) {
  return `invitation_session=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

/**
 * Production wajib memakai PostgreSQL dan origin HTTPS. OWNER_EMAIL dan
 * OWNER_PASSWORD hanya diperiksa saat admin pertama dibuat (bootstrap.ts).
 */
export function validateOwnerConfiguration() {
  if (process.env.NODE_ENV !== "production") return;
  let secureOrigin = false;
  try {
    const url = new URL(process.env.APP_URL || "");
    secureOrigin = url.protocol === "https:" && !url.username && !url.password;
  } catch {}
  if (!process.env.DATABASE_URL || !secureOrigin)
    throw new DomainError(
      "Production memerlukan DATABASE_URL dan APP_URL HTTPS yang valid.",
      503,
    );
}

export async function getActor(request: Request): Promise<Actor | null> {
  validateOwnerConfiguration();
  const token = cookieValue(request, "invitation_session");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const global = await readGlobal();
  const tokenHash = hash(token);
  const session = global.sessions.find(
    (s) => s.tokenHash === tokenHash && s.expiresAt > Date.now(),
  );
  const user = session && global.users.find((u) => u.id === session.userId);
  if (!session || !user || user.status !== "active") return null;
  const workspace = global.workspaces.find((w) => w.ownerUserId === user.id);
  if (!workspace) return null;
  return {
    userId: user.id,
    workspaceId: workspace.id,
    email: user.email,
    name: user.name,
    role: user.role,
    ...(session.impersonatorUserId
      ? { impersonatorUserId: session.impersonatorUserId }
      : {}),
  };
}
export const requireOwner = getActor;

/** Hanya admin (penjual) yang boleh melewati pintu ini. */
export function requireAdmin(actor: Actor | null): Actor {
  if (!actor) throw new DomainError("Silakan masuk terlebih dahulu.", 401);
  if (actor.role !== "admin")
    throw new DomainError("Akses hanya untuk admin.", 403);
  return actor;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Membuat sesi baru untuk pengguna; mengembalikan token untuk cookie. */
export async function createSession(
  userId: string,
  options: { impersonatorUserId?: string } = {},
) {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  await mutateGlobal((global) => {
    const mine = global.sessions
      .filter((s) => s.userId === userId && s.expiresAt > now)
      .sort((a, b) => a.createdAt - b.createdAt);
    const dropped = new Set(
      mine.slice(0, Math.max(0, mine.length - (MAX_SESSIONS_PER_USER - 1))),
    );
    global.sessions = global.sessions.filter(
      (s) => s.expiresAt > now && !dropped.has(s),
    );
    global.sessions.push({
      tokenHash: hash(token),
      userId,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      ...(options.impersonatorUserId
        ? { impersonatorUserId: options.impersonatorUserId }
        : {}),
    });
  });
  return token;
}

const LOGIN_FAILED = "Email atau kata sandi tidak sesuai.";

export async function login(email: string, password: string) {
  validateOwnerConfiguration();
  const global = await readGlobal();
  const user = global.users.find((u) => u.email === normalizeEmail(email));
  // Perbandingan scrypt selalu berjalan, juga untuk email yang tidak dikenal.
  const valid = await verifyPasswordOrDummy(
    password.slice(0, PASSWORD_MAX_LENGTH),
    user?.passwordHash,
  );
  if (!user || !valid) throw new DomainError(LOGIN_FAILED, 401);
  if (user.status !== "active")
    throw new DomainError(
      "Akun Anda ditangguhkan. Hubungi admin untuk bantuan.",
      403,
    );
  const token = await createSession(user.id);
  await mutateGlobal((g) => {
    const current = g.users.find((u) => u.id === user.id);
    if (current) current.lastLoginAt = new Date().toISOString();
  });
  return token;
}

export async function logout(request: Request) {
  const token = cookieValue(request, "invitation_session");
  if (!token) return;
  const tokenHash = hash(token);
  await mutateGlobal((global) => {
    global.sessions = global.sessions.filter((s) => s.tokenHash !== tokenHash);
  });
}

/** Mencabut semua sesi pengguna, kecuali satu yang boleh dipertahankan. */
export async function revokeUserSessions(userId: string, keepToken?: string) {
  const keep = keepToken ? hash(keepToken) : null;
  await mutateGlobal((global) => {
    global.sessions = global.sessions.filter(
      (s) => s.userId !== userId || s.tokenHash === keep,
    );
  });
}

const passwordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`,
  )
  .max(PASSWORD_MAX_LENGTH, "Kata sandi terlalu panjang.");

/** Memeriksa kata sandi baru tanpa mengubah apa pun; melempar ZodError bila tidak sah. */
export const validatePassword = (value: unknown) => passwordSchema.parse(value);

/**
 * Titik masuk bersama untuk ganti dan atur ulang kata sandi. Semua sesi lama
 * dicabut agar kata sandi yang bocor tidak tetap berlaku.
 */
export async function setPassword(
  userId: string,
  newPassword: string,
  options: { keepToken?: string } = {},
) {
  const password = passwordSchema.parse(newPassword);
  const passwordHash = await hashPassword(password);
  await mutateGlobal((global) => {
    const user = global.users.find((u) => u.id === userId);
    if (!user) throw new DomainError("Akun tidak ditemukan.", 404);
    user.passwordHash = passwordHash;
    // Tautan atur ulang yang masih beredar tidak boleh berlaku setelah ini.
    global.passwordResets = global.passwordResets.filter(
      (t) => t.userId !== userId,
    );
  });
  await revokeUserSessions(userId, options.keepToken);
}

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(100),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email("Format email tidak valid.")),
  password: passwordSchema,
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+()\-\s]*$/, "Nomor telepon hanya boleh berisi angka.")
    .optional()
    .transform((value) => value || undefined),
});
export type RegisterInput = z.input<typeof registerSchema>;

class SlugCollision extends Error {}

/**
 * Mendaftarkan pelanggan: akun, ruang kerja (paket uji coba), dan satu
 * undangan awal dengan alamat acak unik.
 *
 * Urutan: dokumen ruang kerja ditulis dulu (belum ada yang menunjuk ke sana,
 * jadi sisa yang yatim tidak berbahaya), lalu akun, ruang kerja, dan slug
 * dikomit sekaligus dalam satu penulisan global yang juga memeriksa keunikan
 * email dan slug. Bila komit gagal, dokumen ruang kerja dibuang.
 */
export async function register(input: unknown) {
  const data = registerSchema.parse(input);
  const existing = await readGlobal();
  if (existing.users.some((u) => u.email === data.email))
    throw new DomainError("Email sudah terdaftar. Silakan masuk.", 409);
  const passwordHash = await hashPassword(data.password);
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const invitationId = randomUUID();
  const now = new Date();
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = `undangan-${randomBytes(4).toString("hex")}`;
    const state = initialWorkspaceState();
    state.invitations = [
      starterInvitation({ id: invitationId, workspaceId, slug, now }),
    ];
    state.revisions = [];
    await createWorkspaceState(workspaceId, state);
    try {
      await mutateGlobal((global) => {
        if (global.users.some((u) => u.email === data.email))
          throw new DomainError("Email sudah terdaftar. Silakan masuk.", 409);
        if (slugEntry(global, slug)) throw new SlugCollision();
        const user: User = {
          id: userId,
          email: data.email,
          name: data.name,
          ...(data.phone ? { phone: data.phone } : {}),
          passwordHash,
          role: "customer",
          status: "active",
          createdAt: now.toISOString(),
        };
        global.users.push(user);
        global.workspaces.push({
          id: workspaceId,
          name: data.name,
          ownerUserId: userId,
          createdAt: now.toISOString(),
          plan: { id: "trial", status: "trial" },
        });
        global.slugs[slug] = {
          workspaceId,
          invitationId,
          createdAt: now.getTime(),
        };
      });
      return { userId, workspaceId, slug };
    } catch (error) {
      await discardWorkspaceState(workspaceId).catch(() => {});
      if (!(error instanceof SlugCollision)) throw error;
    }
  }
  throw new DomainError("Pendaftaran gagal. Silakan coba lagi.", 503);
}
