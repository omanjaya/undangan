import { randomUUID } from "node:crypto";
import { DomainError } from "../modules/invitations/domain/invitation";
import {
  budgetItemInputSchema,
  budgetSettingsSchema,
  budgetToCsv,
  summarizeBudget,
  BUDGET_TEMPLATE,
  type BudgetItem,
} from "../modules/invitations/domain/budget";
import {
  parseBudgetCsv,
  type BudgetImportIssue,
} from "../modules/invitations/domain/budget-import";
import {
  readWorkspace,
  mutateWorkspace,
  type State,
} from "../modules/invitations/infrastructure/store";
import type { Actor } from "./services";
import { requireActor } from "./tenant";

const MAX_ITEMS = 200;

/**
 * Anggaran milik ruang kerja, bukan undangan tertentu: satu pernikahan bisa
 * punya beberapa undangan (upacara dan tiap sesi resepsi) dengan satu anggaran.
 * Semua fungsi hanya menyentuh ruang kerja milik pemanggil.
 */
const readOwn = (actor: Actor | null) =>
  readWorkspace(requireActor(actor).workspaceId);
const mutateOwn = <T>(actor: Actor | null, fn: (state: State) => T) =>
  mutateWorkspace(requireActor(actor).workspaceId, fn);

function sorted(items: BudgetItem[]) {
  return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getBudget(actor: Actor | null) {
  const state = await readOwn(actor);
  const items = sorted(state.budget ?? []);
  return {
    items,
    settings: state.budgetSettings ?? { cap: 0 },
    summary: summarizeBudget(items, state.budgetSettings ?? { cap: 0 }),
  };
}

export async function addBudgetItem(actor: Actor | null, input: unknown) {
  const data = budgetItemInputSchema.parse(input);
  return mutateOwn(actor, (state) => {
    state.budget ??= [];
    if (state.budget.length >= MAX_ITEMS)
      throw new DomainError(`Batas ${MAX_ITEMS} pos anggaran tercapai.`);
    const now = new Date().toISOString();
    const item: BudgetItem = {
      ...data,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    state.budget.push(item);
    return item;
  });
}

export async function updateBudgetItem(
  actor: Actor | null,
  id: string,
  input: unknown,
) {
  // Payload sebagian hanya mengubah kolom yang dikirim; memakai skema penuh
  // akan mengosongkan kolom yang tidak disertakan karena semuanya punya
  // nilai bawaan.
  const { expectedUpdatedAt, ...rest } = (input ?? {}) as Record<
    string,
    unknown
  >;
  // `.partial()` saja tidak cukup: setiap kolom punya `.default()`, sehingga
  // kunci yang tidak dikirim tetap terisi nilai bawaan dan menghapus data lama.
  const dikirim = Object.keys(rest);
  const tervalidasi = budgetItemInputSchema.partial().parse(rest) as Record<
    string,
    unknown
  >;
  const data = Object.fromEntries(
    Object.entries(tervalidasi).filter(([kunci]) => dikirim.includes(kunci)),
  );
  return mutateOwn(actor, (state) => {
    const item = (state.budget ?? []).find((i) => i.id === id);
    if (!item) throw new DomainError("Pos anggaran tidak ditemukan.", 404);
    // Dua orang menyunting anggaran dari perangkat berbeda tidak boleh saling
    // menimpa diam-diam, seperti penguncian pada draft undangan.
    if (
      typeof expectedUpdatedAt === "string" &&
      expectedUpdatedAt !== item.updatedAt
    )
      throw new DomainError(
        "Pos ini baru saja diubah di tempat lain. Muat ulang sebelum menyimpan.",
        409,
      );
    Object.assign(item, data, { updatedAt: new Date().toISOString() });
    return item;
  });
}

export async function removeBudgetItem(actor: Actor | null, id: string) {
  return mutateOwn(actor, (state) => {
    const before = (state.budget ?? []).length;
    state.budget = (state.budget ?? []).filter((i) => i.id !== id);
    if (state.budget.length === before)
      throw new DomainError("Pos anggaran tidak ditemukan.", 404);
    return { id, deleted: true };
  });
}

export async function saveBudgetSettings(actor: Actor | null, input: unknown) {
  const settings = budgetSettingsSchema.parse(input);
  return mutateOwn(actor, (state) => {
    state.budgetSettings = settings;
    return settings;
  });
}

/**
 * Mengisi kerangka pos pawiwahan. Pos yang namanya sudah ada dilewati agar
 * aman dijalankan ulang tanpa menggandakan daftar.
 */
export async function applyBudgetTemplate(actor: Actor | null) {
  return mutateOwn(actor, (state) => {
    state.budget ??= [];
    const existing = new Set(
      state.budget.map((i) => i.name.trim().toLowerCase()),
    );
    const now = new Date().toISOString();
    let added = 0;
    for (const entry of BUDGET_TEMPLATE) {
      if (existing.has(entry.name.toLowerCase())) continue;
      if (state.budget.length >= MAX_ITEMS) break;
      state.budget.push({
        ...budgetItemInputSchema.parse(entry),
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      });
      added++;
    }
    return { added, total: state.budget.length };
  });
}

export async function exportBudgetCsv(actor: Actor | null) {
  const state = await readOwn(actor);
  return budgetToCsv(sorted(state.budget ?? []));
}

/**
 * Impor menambahkan pos baru, tidak menimpa yang sudah ada: berkas spreadsheet
 * tidak membawa id, jadi mencocokkan baris ke pos lama hanya lewat nama akan
 * menghapus perubahan yang dibuat lewat dashboard.
 */
export async function importBudgetCsv(
  actor: Actor | null,
  text: unknown,
  options: { skipExisting?: boolean } = {},
) {
  if (typeof text !== "string" || !text.trim())
    throw new DomainError("Berkas CSV kosong.");
  const parsed = parseBudgetCsv(text);
  return mutateOwn(actor, (state) => {
    state.budget ??= [];
    const errors: BudgetImportIssue[] = [...parsed.errors];
    const now = new Date().toISOString();
    const existing = new Set(
      state.budget.map((i) => i.name.trim().toLowerCase()),
    );
    let added = 0;
    let skipped = 0;
    for (const entry of parsed.items) {
      if (options.skipExisting && existing.has(entry.name.toLowerCase())) {
        skipped++;
        continue;
      }
      if (state.budget.length >= MAX_ITEMS) {
        errors.push({
          line: 0,
          message: `Batas ${MAX_ITEMS} pos tercapai; sisa baris diabaikan.`,
        });
        break;
      }
      state.budget.push({
        ...entry,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      });
      existing.add(entry.name.toLowerCase());
      added++;
    }
    return { added, skipped, total: state.budget.length, errors };
  });
}
