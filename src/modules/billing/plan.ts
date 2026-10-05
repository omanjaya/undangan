import type {
  AuditEntry,
  GlobalState,
  Workspace,
  WorkspacePlan,
} from "../invitations/infrastructure/global-state";
import { randomUUID } from "node:crypto";

const DAY = 86_400_000;

/**
 * Mengaktifkan paket pada ruang kerja. Bila paket yang sama masih aktif,
 * masa berlakunya diperpanjang dari tanggal berakhir lama (bukan dari hari
 * ini) agar pelanggan yang memperpanjang lebih awal tidak rugi. Dipakai oleh
 * verifikasi pembayaran maupun penetapan paket manual oleh admin; panggil di
 * dalam `mutateGlobal`.
 */
export function activatePlan(
  workspace: Workspace,
  packageId: string,
  durationDays: number,
  now = Date.now(),
) {
  const current = workspace.plan;
  const currentEnd = current.expiresAt ? Date.parse(current.expiresAt) : 0;
  const base =
    current.status === "active" && current.id === packageId && currentEnd > now
      ? currentEnd
      : now;
  workspace.plan = {
    id: packageId,
    status: "active",
    expiresAt: new Date(base + durationDays * DAY).toISOString(),
  };
  return workspace.plan;
}

/** Lama undangan terbit tetap tampil publik setelah paket berakhir. */
export const PUBLIC_GRACE_DAYS = 30;

export type PublicAccess = "active" | "grace" | "lapsed";

/**
 * Aturan tampil publik undangan terbit milik sebuah ruang kerja:
 * - paket berlaku (atau admin, atau tanpa tanggal berakhir): `active`
 * - paket berakhir kurang dari 30 hari lalu: `grace`, undangan tetap tampil
 * - lebih dari itu: `lapsed`, tamu melihat halaman "undangan tidak aktif"
 * Data undangan tidak dihapus; memperpanjang paket langsung mengaktifkannya lagi.
 */
export function publicAccess(
  plan: WorkspacePlan,
  now = Date.now(),
): PublicAccess {
  if (plan.id === "admin" || !plan.expiresAt) return "active";
  const end = Date.parse(plan.expiresAt);
  if (!Number.isFinite(end) || end > now) return "active";
  return now - end <= PUBLIC_GRACE_DAYS * DAY ? "grace" : "lapsed";
}

const AUDIT_LIMIT = 2000;

/** Mencatat tindakan admin; panggil di dalam `mutateGlobal`. */
export function recordAudit(
  global: GlobalState,
  entry: Omit<AuditEntry, "id" | "at">,
  now = new Date(),
) {
  global.auditLog.push({ id: randomUUID(), at: now.toISOString(), ...entry });
  if (global.auditLog.length > AUDIT_LIMIT)
    global.auditLog.splice(0, global.auditLog.length - AUDIT_LIMIT);
}
