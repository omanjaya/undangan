import type { WorkspacePlan } from "../invitations/infrastructure/global-state";
import { PUBLIC_GRACE_DAYS } from "./plan";

const DAY = 86_400_000;
/** Pengingat perpanjangan muncul sejak sisa masa aktif sebanyak ini. */
export const RENEWAL_WINDOW_DAYS = 14;

export type PlanStatus =
  | { kind: "admin" }
  | { kind: "trial" }
  | { kind: "active"; expiresAt: string; daysLeft: number }
  | { kind: "expiring"; expiresAt: string; daysLeft: number }
  | {
      kind: "expired";
      expiresAt?: string;
      /** Sisa hari undangan terbit masih tampil untuk tamu; 0 bila sudah nonaktif. */
      graceDaysLeft: number;
    };

/** Status paket untuk tampilan pelanggan (dashboard dan halaman paket). */
export function describePlan(
  plan: WorkspacePlan,
  now = Date.now(),
): PlanStatus {
  if (plan.id === "admin") return { kind: "admin" };
  if (plan.status === "trial") return { kind: "trial" };
  const end = plan.expiresAt ? Date.parse(plan.expiresAt) : NaN;
  // Paket aktif tanpa tanggal (ditetapkan manual) tidak pernah berakhir.
  if (plan.status === "active" && !plan.expiresAt)
    return { kind: "active", expiresAt: "", daysLeft: Number.MAX_SAFE_INTEGER };
  if (plan.status === "active" && plan.expiresAt && end > now) {
    const daysLeft = Math.ceil((end - now) / DAY);
    return {
      kind: daysLeft <= RENEWAL_WINDOW_DAYS ? "expiring" : "active",
      expiresAt: plan.expiresAt,
      daysLeft,
    };
  }
  const graceEnd = Number.isFinite(end) ? end + PUBLIC_GRACE_DAYS * DAY : now;
  return {
    kind: "expired",
    ...(plan.expiresAt ? { expiresAt: plan.expiresAt } : {}),
    graceDaysLeft: Math.max(0, Math.ceil((graceEnd - now) / DAY)),
  };
}

/** Tanggal panjang gaya Indonesia pada zona WITA, mis. "5 Oktober 2026". */
export const formatDate = (iso: string | number | Date) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Makassar",
  }).format(new Date(iso));

export const formatDateTime = (iso: string | number | Date) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Makassar",
  }).format(new Date(iso));
