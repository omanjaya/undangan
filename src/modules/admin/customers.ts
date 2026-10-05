import type {
  GlobalState,
  User,
  Workspace,
} from "../invitations/infrastructure/global-state";
import { planState, type InvitationCount, type PlanState } from "./metrics";

export type CustomerRow = {
  user: User;
  workspace?: Workspace;
  plan: PlanState;
  planId: string;
  expiresAt?: string;
  invitations: InvitationCount;
};

export type CustomerQuery = {
  q?: string;
  /** `trial` | `active` | `expired` | `suspended` */
  filter?: string;
  page?: number;
  pageSize?: number;
};

export const CUSTOMER_FILTERS = [
  "trial",
  "active",
  "expired",
  "suspended",
] as const;

export function customerRows(
  global: GlobalState,
  counts: ReadonlyMap<string, InvitationCount>,
  now = Date.now(),
): CustomerRow[] {
  return global.users
    .filter((u) => u.role === "customer")
    .map((user) => {
      const workspace = global.workspaces.find(
        (w) => w.ownerUserId === user.id,
      );
      return {
        user,
        workspace,
        plan: planState(workspace, now),
        planId: workspace?.plan.id ?? "trial",
        expiresAt: workspace?.plan.expiresAt,
        invitations: (workspace && counts.get(workspace.id)) || {
          total: 0,
          published: 0,
        },
      };
    })
    .sort(
      (a, b) => Date.parse(b.user.createdAt) - Date.parse(a.user.createdAt),
    );
}

/** Pencarian nama/email/telepon (tanpa membedakan huruf), filter status, dan halaman. */
export function queryCustomers(rows: CustomerRow[], query: CustomerQuery) {
  const needle = (query.q || "").trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const matched = rows.filter((row) => {
    if (query.filter === "suspended") {
      if (row.user.status !== "suspended") return false;
    } else if (
      query.filter &&
      (CUSTOMER_FILTERS as readonly string[]).includes(query.filter) &&
      row.plan !== query.filter
    )
      return false;
    if (!needle) return true;
    const { name, email, phone } = row.user;
    return (
      name.toLowerCase().includes(needle) ||
      email.includes(needle) ||
      (digits.length >= 3 && (phone || "").replace(/\D/g, "").includes(digits))
    );
  });
  const pageSize = Math.max(1, query.pageSize ?? 20);
  const pages = Math.max(1, Math.ceil(matched.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(query.page || 1)), pages);
  return {
    rows: matched.slice((page - 1) * pageSize, page * pageSize),
    page,
    pages,
    matched: matched.length,
  };
}
