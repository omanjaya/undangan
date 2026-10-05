import type {
  AuditEntry,
  GlobalState,
} from "../invitations/infrastructure/global-state";

export type AuditQuery = {
  /** Awalan atau nama tindakan persis, mis. `user.` atau `user.suspend`. */
  action?: string;
  /** Id, nama, atau email pelaku. */
  actor?: string;
  /** Id target, atau nama/email pengguna yang menjadi target. */
  target?: string;
  /** Tanggal `YYYY-MM-DD` menurut WITA, inklusif. */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

const WITA = 8 * 3_600_000;
const DAY = 86_400_000;

/** Awal hari WITA (epoch ms) untuk tanggal `YYYY-MM-DD`; NaN bila tidak valid. */
function dayStart(date: string | undefined) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  return Date.parse(`${date}T00:00:00.000Z`) - WITA;
}

export function filterAudit(global: GlobalState, query: AuditQuery) {
  const people = new Map(global.users.map((u) => [u.id, u]));
  const matchesPerson = (id: string, needle: string) => {
    const user = people.get(id);
    return (
      id.toLowerCase() === needle ||
      !!user?.name.toLowerCase().includes(needle) ||
      !!user?.email.includes(needle)
    );
  };
  const action = (query.action || "").trim();
  const actor = (query.actor || "").trim().toLowerCase();
  const target = (query.target || "").trim().toLowerCase();
  const from = dayStart(query.from);
  const to = dayStart(query.to);

  const matched = global.auditLog
    .filter((entry: AuditEntry) => {
      if (
        action &&
        !(entry.action === action || entry.action.startsWith(action))
      )
        return false;
      if (actor && !matchesPerson(entry.actorUserId, actor)) return false;
      if (target) {
        const direct = entry.targetId.toLowerCase().includes(target);
        if (!direct && !matchesPerson(entry.targetId, target)) return false;
      }
      const at = Date.parse(entry.at);
      if (!Number.isNaN(from) && at < from) return false;
      if (!Number.isNaN(to) && at >= to + DAY) return false;
      return true;
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const pageSize = Math.max(1, query.pageSize ?? 25);
  const pages = Math.max(1, Math.ceil(matched.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(query.page || 1)), pages);
  return {
    entries: matched.slice((page - 1) * pageSize, page * pageSize),
    page,
    pages,
    matched: matched.length,
  };
}

/** Daftar tindakan yang pernah tercatat, untuk pilihan filter. */
export const auditActions = (global: GlobalState) =>
  [...new Set(global.auditLog.map((e) => e.action))].sort();
