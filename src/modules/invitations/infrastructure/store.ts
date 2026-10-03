import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import postgres from "postgres";
import {
  demoInvitation,
  contentSchema,
  type Invitation,
  type Rsvp,
  type Wish,
} from "../domain/invitation";
import {
  budgetItemInputSchema,
  budgetSettingsSchema,
  BUDGET_BEARERS,
  BUDGET_CATEGORIES,
  type BudgetItem,
  type BudgetSettings,
} from "../domain/budget";
export type MediaAsset = {
  id: string;
  workspaceId: string;
  url: string;
  filename: string;
  kind: "image" | "video" | "audio";
  name: string;
  bytes: number;
  mime: string;
  createdAt: string;
  width?: number;
  height?: number;
};
export type State = {
  assets?: MediaAsset[];
  sessions?: { tokenHash: string; expiresAt: number; credentialTag?: string }[];
  /** State lama menyimpan satu undangan; normalizeState memindahkannya ke `invitations`. */
  invitation?: Invitation;
  invitations: Invitation[];
  rsvps: (Rsvp & { visitorId: string })[];
  /** Anggaran berlaku untuk satu pernikahan, bukan per undangan. */
  budget?: BudgetItem[];
  budgetSettings?: BudgetSettings;
  wishes: Wish[];
  revisions: {
    invitationId?: string;
    revision: number;
    content: Invitation["draft"];
    createdAt: string;
  }[];
};
const initial = (): State => ({
  invitations: [structuredClone(demoInvitation)],
  rsvps: [],
  wishes: [],
  budget: [],
  budgetSettings: { cap: 0 },
  revisions: [
    {
      invitationId: demoInvitation.id,
      revision: 1,
      content: structuredClone(demoInvitation.draft),
      createdAt: demoInvitation.updatedAt,
    },
  ],
});
const file = resolve(process.env.DATA_DIR || ".data", "state.json");
const sql = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL, { max: 5 })
  : null;
let queue: Promise<unknown> = Promise.resolve();
export async function readState(): Promise<State> {
  if (sql) {
    const rows = await sql`SELECT payload FROM app_state WHERE id = 'primary'`;
    if (!rows[0])
      throw new Error("Database belum di-seed. Jalankan npm run db:seed.");
    return normalizeState(rows[0].payload as State);
  }
  if (process.env.NODE_ENV === "production")
    throw new Error("DATABASE_URL wajib untuk production.");
  try {
    return normalizeState(JSON.parse(await readFile(file, "utf8")) as State);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return initial();
    throw e;
  }
}
export async function mutateState<T>(fn: (state: State) => T): Promise<T> {
  if (sql) {
    return (await sql.begin(async (tx) => {
      const rows =
        await tx`SELECT payload FROM app_state WHERE id = 'primary' FOR UPDATE`;
      if (!rows[0]) throw new Error("Database belum di-seed.");
      const state = normalizeState(rows[0].payload as State);
      const result = fn(state);
      await tx`UPDATE app_state SET payload = ${tx.json(state as never)}, updated_at = now() WHERE id = 'primary'`;
      return result;
    })) as T;
  }
  const operation = queue.then(async () => {
    const state = await readState();
    const result = fn(state);
    await mkdir(resolve(file, ".."), { recursive: true });
    const temp = file + ".tmp";
    await writeFile(temp, JSON.stringify(state), { mode: 0o600 });
    await rename(temp, file);
    return result;
  });
  queue = operation.catch(() => {});
  return operation;
}

/**
 * Anggaran disunting lewat satu pintu, tetapi berkas state dapat rusak karena
 * suntingan manual atau pemulihan sebagian. Pos yang cacat diperbaiki
 * seadanya, bukan dilempar sebagai galat: kegagalan membaca anggaran tidak
 * boleh ikut menjatuhkan halaman undangan yang dibuka tamu.
 */
function recoverBudgetItem(raw: unknown): BudgetItem[] {
  if (!raw || typeof raw !== "object") return [];
  const item = raw as Record<string, unknown>;
  const parsed = budgetItemInputSchema.safeParse(item);
  const data = parsed.success
    ? parsed.data
    : budgetItemInputSchema.safeParse({
        ...item,
        name: String(item.name ?? "").trim() || "Pos tanpa nama",
        estimate: angkaAman(item.estimate),
        actual: item.actual === null ? null : angkaAman(item.actual),
        paid: angkaAman(item.paid),
        dueDate: typeof item.dueDate === "string" ? item.dueDate : "",
        category: BUDGET_CATEGORIES.includes(item.category as never)
          ? item.category
          : "lainnya",
        bearer: BUDGET_BEARERS.includes(item.bearer as never)
          ? item.bearer
          : "bersama",
        vendor: typeof item.vendor === "string" ? item.vendor : "",
        note: typeof item.note === "string" ? item.note : "",
      }).data;
  if (!data) return [];
  const waktu =
    typeof item.createdAt === "string" && item.createdAt
      ? item.createdAt
      : new Date(0).toISOString();
  return [
    {
      ...data,
      id: typeof item.id === "string" && item.id ? item.id : randomUUID(),
      createdAt: waktu,
      updatedAt:
        typeof item.updatedAt === "string" && item.updatedAt
          ? item.updatedAt
          : waktu,
    },
  ];
}

/** Nilai yang tidak dapat dibaca sebagai rupiah dianggap nol, bukan menggagalkan pos. */
function angkaAman(value: unknown) {
  const angka = typeof value === "string" ? Number(value.trim()) : value;
  return typeof angka === "number" && Number.isFinite(angka) && angka >= 0
    ? Math.round(angka)
    : 0;
}

export function normalizeState(state: State): State {
  // State lama menyimpan satu undangan pada `invitation`; pindahkan sekali ke daftar.
  if (!state.invitations?.length && state.invitation)
    state.invitations = [state.invitation];
  state.invitations ??= [];
  delete state.invitation;
  const fallbackId = state.invitations[0]?.id;
  for (const invitation of state.invitations) {
    invitation.draft = contentSchema.parse(invitation.draft);
    if (invitation.published)
      invitation.published = contentSchema.parse(invitation.published);
  }
  state.revisions = state.revisions.map((revision) => ({
    ...revision,
    invitationId: revision.invitationId ?? fallbackId,
    content: contentSchema.parse(revision.content),
  }));
  state.assets ??= [];
  state.budget = (state.budget ?? []).flatMap(recoverBudgetItem);
  const settings = budgetSettingsSchema.safeParse(state.budgetSettings ?? {});
  state.budgetSettings = settings.success ? settings.data : { cap: 0 };
  return state;
}
