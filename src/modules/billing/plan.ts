import type {
  AuditEntry,
  GlobalState,
  Workspace,
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
