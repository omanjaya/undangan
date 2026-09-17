import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  readState,
  mutateState,
} from "../modules/invitations/infrastructure/store";
import type { Actor } from "./services";
import { DomainError } from "../modules/invitations/domain/invitation";
const hash = (value: string) => createHash("sha256").update(value).digest();
function credentialTag(token: string) {
  return createHmac(
    "sha256",
    process.env.OWNER_PASSWORD || "demo-undangan-2026",
  )
    .update(token)
    .update("\0")
    .update((process.env.OWNER_EMAIL || "owner@undangan.local").toLowerCase())
    .digest("hex");
}
export const isDemo =
  !process.env.DATABASE_URL && process.env.NODE_ENV !== "production";
export function cookieValue(request: Request, name: string) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(name + "="))
    ?.slice(name.length + 1);
}
export function sessionCookie(value: string, maxAge = 86400) {
  return `invitation_session=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
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
  if (
    !process.env.OWNER_EMAIL ||
    !process.env.OWNER_PASSWORD ||
    process.env.OWNER_EMAIL === "owner@undangan.local" ||
    process.env.OWNER_PASSWORD === "demo-undangan-2026" ||
    process.env.OWNER_PASSWORD.length < 16
  )
    throw new DomainError(
      "Konfigurasi production memerlukan email pemilik dan kata sandi unik minimal 16 karakter.",
      503,
    );
}
export async function getActor(request: Request): Promise<Actor | null> {
  validateOwnerConfiguration();
  const token = cookieValue(request, "invitation_session");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const state = await readState();
  const session = state.sessions?.find(
    (s) =>
      s.tokenHash === hash(token).toString("hex") &&
      s.expiresAt > Date.now() &&
      s.credentialTag === credentialTag(token),
  );
  return session
    ? {
        id: "owner",
        workspaceId: "workspace-demo",
        email: process.env.OWNER_EMAIL || "owner@undangan.local",
      }
    : null;
}
export const requireOwner = getActor;
export async function login(email: string, password: string) {
  validateOwnerConfiguration();
  const expectedEmail =
    process.env.OWNER_EMAIL ||
    (process.env.NODE_ENV !== "production" ? "owner@undangan.local" : "");
  const expectedPassword =
    process.env.OWNER_PASSWORD ||
    (process.env.NODE_ENV !== "production" ? "demo-undangan-2026" : "");
  if (!expectedEmail || !expectedPassword)
    throw new DomainError("Akun pemilik belum dikonfigurasi.", 503);
  if (
    !timingSafeEqual(
      hash(email.toLowerCase()),
      hash(expectedEmail.toLowerCase()),
    ) ||
    !timingSafeEqual(hash(password), hash(expectedPassword))
  )
    throw new DomainError("Email atau kata sandi tidak sesuai.", 401);
  const token = randomBytes(32).toString("hex");
  await mutateState((state) => {
    state.sessions = (state.sessions || [])
      .filter((s) => s.expiresAt > Date.now())
      .slice(-19);
    state.sessions.push({
      tokenHash: hash(token).toString("hex"),
      credentialTag: credentialTag(token),
      expiresAt: Date.now() + 86400000,
    });
  });
  return token;
}
export async function logout(request: Request) {
  const token = cookieValue(request, "invitation_session");
  if (token)
    await mutateState((state) => {
      state.sessions = (state.sessions || []).filter(
        (s) => s.tokenHash !== hash(token).toString("hex"),
      );
    });
}
