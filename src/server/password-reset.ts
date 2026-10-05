import { createHash, randomBytes } from "node:crypto";
import { DomainError } from "../modules/invitations/domain/invitation";
import {
  mutateGlobal,
  readGlobal,
} from "../modules/invitations/infrastructure/global-store";
import { setPassword, validatePassword } from "./auth";
import { rateLimited } from "./http";
import { sendMail } from "./mail";
import { passwordResetEmail } from "./mail-templates";

/**
 * Atur ulang kata sandi lewat email.
 *
 * - Token acak 32 byte; hanya hash SHA-256-nya yang disimpan.
 * - Berlaku 1 jam, sekali pakai, dan token lama pengguna yang sama dicabut
 *   saat token baru dibuat.
 * - `requestPasswordReset` tidak membedakan email terdaftar dan tidak, baik
 *   dari hasil maupun (sejauh mungkin) dari waktu respons: penulisan global
 *   selalu terjadi dan email dikirim tanpa ditunggu.
 */
export const RESET_TTL_MS = 60 * 60_000;
const MAX_TOKENS_STORED = 500;

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** Batas permintaan atur ulang per alamat email (jendela 15 menit). */
export const RESET_EMAIL_LIMIT = { max: 3, windowMs: 15 * 60_000 };

export const RESET_REQUEST_MESSAGE =
  "Jika email tersebut terdaftar, tautan untuk mengatur ulang kata sandi sudah kami kirim. Periksa kotak masuk dan folder spam Anda.";

const INVALID_TOKEN =
  "Tautan atur ulang tidak valid atau sudah kedaluwarsa. Minta tautan baru.";

export async function requestPasswordReset(
  rawEmail: string,
  options: { origin: string; now?: number },
): Promise<void> {
  const email = rawEmail.trim().toLowerCase().slice(0, 254);
  const now = options.now ?? Date.now();
  // Melewati batas per email: diam-diam tidak mengirim (tanpa membocorkan apa pun).
  const throttled = rateLimited(
    "reset-email:" + email,
    RESET_EMAIL_LIMIT.max,
    RESET_EMAIL_LIMIT.windowMs,
  );
  const token = randomBytes(32).toString("hex");
  const target = await mutateGlobal((global) => {
    const user =
      !throttled && email
        ? global.users.find((u) => u.email === email && u.status === "active")
        : undefined;
    // Token kedaluwarsa dibersihkan sekalian; penulisan terjadi untuk semua email.
    global.passwordResets = global.passwordResets.filter(
      (t) => t.expiresAt > now && t.userId !== user?.id,
    );
    if (!user) return null;
    global.passwordResets.push({
      tokenHash: hash(token),
      userId: user.id,
      createdAt: now,
      expiresAt: now + RESET_TTL_MS,
    });
    if (global.passwordResets.length > MAX_TOKENS_STORED)
      global.passwordResets = global.passwordResets.slice(-MAX_TOKENS_STORED);
    return { name: user.name, email: user.email };
  });
  if (!target) return;
  const link = `${options.origin}/reset-sandi?token=${token}`;
  // Tidak ditunggu agar waktu respons sama untuk email yang tidak dikenal.
  void sendMail(
    passwordResetEmail({ to: target.email, name: target.name, link }),
  ).catch(() => {});
}

const validShape = (token: unknown): token is string =>
  typeof token === "string" && /^[a-f0-9]{64}$/.test(token);

/** Apakah tautan masih dapat dipakai; tidak mengubah apa pun. */
export async function isResetTokenValid(token: unknown, now = Date.now()) {
  if (!validShape(token)) return false;
  const tokenHash = hash(token);
  const global = await readGlobal();
  const entry = global.passwordResets.find((t) => t.tokenHash === tokenHash);
  if (!entry || entry.expiresAt <= now) return false;
  return global.users.some(
    (u) => u.id === entry.userId && u.status === "active",
  );
}

/**
 * Memakai token (sekali) lalu mengganti kata sandi; `setPassword` mencabut
 * semua sesi. Kata sandi diperiksa dulu agar salah ketik tidak menghanguskan
 * tautan.
 */
export async function resetPassword(
  token: unknown,
  newPassword: unknown,
  now = Date.now(),
) {
  if (!validShape(token)) throw new DomainError(INVALID_TOKEN, 400);
  const password = validatePassword(newPassword);
  const tokenHash = hash(token);
  const userId = await mutateGlobal((global) => {
    const entry = global.passwordResets.find((t) => t.tokenHash === tokenHash);
    // Hapus selalu (termasuk yang kedaluwarsa): token tidak pernah dipakai dua kali.
    global.passwordResets = global.passwordResets.filter(
      (t) => t.tokenHash !== tokenHash,
    );
    if (!entry || entry.expiresAt <= now) return null;
    const user = global.users.find((u) => u.id === entry.userId);
    return user?.status === "active" ? user.id : null;
  });
  if (!userId) throw new DomainError(INVALID_TOKEN, 400);
  await setPassword(userId, password);
  return { userId };
}
