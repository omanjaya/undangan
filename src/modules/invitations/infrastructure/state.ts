import { randomBytes, randomUUID } from "node:crypto";
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
import {
  GUEST_CODE_PATTERN,
  generateGuestCode,
  type Guest,
} from "../domain/guests";
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
/**
 * Isi satu ruang kerja (workspace). Akun, sesi, dan indeks lintas ruang kerja
 * berada di penyimpanan global (lihat global-state.ts), bukan di sini.
 */
export type State = {
  assets?: MediaAsset[];
  /** State lama menyimpan satu undangan; normalizeState memindahkannya ke `invitations`. */
  invitation?: Invitation;
  invitations: Invitation[];
  rsvps: (Rsvp & { visitorId: string })[];
  /** Anggaran berlaku untuk satu pernikahan, bukan per undangan. */
  budget?: BudgetItem[];
  budgetSettings?: BudgetSettings;
  wishes: Wish[];
  /** Daftar tamu; tiap tamu terikat ke satu undangan lewat `invitationId`. */
  guests?: Guest[];
  /** Templat pesan WhatsApp per id undangan. */
  guestTemplates?: Record<string, string>;
  revisions: {
    invitationId?: string;
    revision: number;
    content: Invitation["draft"];
    createdAt: string;
  }[];
};
/** State awal ruang kerja admin: berisi undangan contoh. */
export const initialWorkspaceState = (): State => ({
  invitations: [structuredClone(demoInvitation)],
  rsvps: [],
  wishes: [],
  guests: [],
  guestTemplates: {},
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

/**
 * Koleksi yang hilang atau bertipe salah dikembalikan sebagai array kosong.
 * Tanpa ini, satu berkas state yang tidak lengkap membuat pemanggil berikutnya
 * gagal pada `.filter` atau `.map` jauh dari sumber masalahnya.
 */
function arrayAman<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Tamu yang cacat diperbaiki seadanya agar satu baris rusak tidak menjatuhkan
 * seluruh daftar. Kode yang hilang, tidak sah, atau kembar diganti baru: kode
 * harus unik karena menjadi kunci tautan pribadi.
 */
function recoverGuests(raw: unknown, invitationIds: Set<string>): Guest[] {
  if (!Array.isArray(raw)) return [];
  const codes = new Set<string>();
  const text = (v: unknown, max: number) =>
    typeof v === "string" ? v.trim().slice(0, max) : "";
  const time = (v: unknown) => (typeof v === "string" && v ? v : null);
  const result: Guest[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const g = item as Record<string, unknown>;
    if (
      typeof g.invitationId !== "string" ||
      !invitationIds.has(g.invitationId)
    )
      continue;
    const code =
      typeof g.code === "string" &&
      GUEST_CODE_PATTERN.test(g.code) &&
      !codes.has(g.code)
        ? g.code
        : generateGuestCode((n) => randomBytes(n), codes);
    codes.add(code);
    const created = time(g.createdAt) ?? new Date(0).toISOString();
    const pax = Number(g.maxPax);
    result.push({
      id: typeof g.id === "string" && g.id ? g.id : randomUUID(),
      invitationId: g.invitationId,
      code,
      name: text(g.name, 100) || "Tamu tanpa nama",
      phone: /^\d{8,15}$/.test(String(g.phone ?? "")) ? String(g.phone) : "",
      group: text(g.group, 60),
      maxPax: Number.isInteger(pax) && pax >= 1 && pax <= 5 ? pax : null,
      sentAt: time(g.sentAt),
      firstOpenedAt: time(g.firstOpenedAt),
      openCount: angkaAman(g.openCount),
      checkedInAt: time(g.checkedInAt),
      createdAt: created,
      updatedAt: time(g.updatedAt) ?? created,
    });
  }
  return result;
}

/** Nilai yang tidak dapat dibaca sebagai rupiah dianggap nol, bukan menggagalkan pos. */
function angkaAman(value: unknown) {
  const angka = typeof value === "string" ? Number(value.trim()) : value;
  return typeof angka === "number" && Number.isFinite(angka) && angka >= 0
    ? Math.round(angka)
    : 0;
}

export function normalizeState(state: State): State {
  // Sesi dulu disimpan di sini; kini hidup di penyimpanan global.
  delete (state as { sessions?: unknown }).sessions;
  // State lama menyimpan satu undangan pada `invitation`; pindahkan sekali ke daftar.
  if (!state.invitations?.length && state.invitation)
    state.invitations = [state.invitation];
  state.invitations ??= [];
  delete state.invitation;
  const fallbackId = state.invitations[0]?.id;
  // Tiap undangan dinormalisasi sendiri-sendiri. Satu undangan yang isinya
  // cacat dibiarkan apa adanya agar pemilik masih bisa memperbaikinya, dan
  // tidak ikut menjatuhkan undangan lain yang sedang dibuka tamu.
  for (const invitation of state.invitations) {
    const draft = contentSchema.safeParse(invitation.draft);
    if (draft.success) invitation.draft = draft.data;
    if (invitation.published) {
      const published = contentSchema.safeParse(invitation.published);
      if (published.success) invitation.published = published.data;
    }
  }
  // Revisi hanya riwayat terbit, tidak pernah disajikan ke pengunjung, jadi
  // entri yang isinya tidak lagi lolos skema dibuang alih-alih menggagalkan
  // pembacaan seluruh state.
  state.revisions = arrayAman(state.revisions).flatMap((revision) => {
    const content = contentSchema.safeParse(revision?.content);
    return content.success
      ? [
          {
            ...revision,
            invitationId: revision.invitationId ?? fallbackId,
            content: content.data,
          },
        ]
      : [];
  });
  state.rsvps = arrayAman(state.rsvps);
  state.wishes = arrayAman(state.wishes);
  state.assets = arrayAman(state.assets);
  state.guests = recoverGuests(
    state.guests,
    new Set(state.invitations.map((i) => i.id)),
  );
  const templates: Record<string, string> = {};
  if (state.guestTemplates && typeof state.guestTemplates === "object")
    for (const [id, value] of Object.entries(state.guestTemplates))
      if (typeof value === "string" && value.trim())
        templates[id] = value.slice(0, 1000);
  state.guestTemplates = templates;
  state.budget = (state.budget ?? []).flatMap(recoverBudgetItem);
  const settings = budgetSettingsSchema.safeParse(state.budgetSettings ?? {});
  state.budgetSettings = settings.success ? settings.data : { cap: 0 };
  return state;
}
