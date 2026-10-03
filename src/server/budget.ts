import { randomUUID } from "node:crypto";
import {
  authorize,
  DomainError,
} from "../modules/invitations/domain/invitation";
import {
  budgetItemInputSchema,
  budgetSettingsSchema,
  budgetToCsv,
  summarizeBudget,
  BUDGET_TEMPLATE,
  type BudgetItem,
} from "../modules/invitations/domain/budget";
import {
  readState,
  mutateState,
  type State,
} from "../modules/invitations/infrastructure/store";
import type { Actor } from "./services";

const MAX_ITEMS = 200;

/**
 * Anggaran milik ruang kerja, bukan undangan tertentu: satu pernikahan bisa
 * punya beberapa undangan (upacara dan tiap sesi resepsi) dengan satu anggaran.
 */
function requireWorkspace(state: State, actor: Actor | null) {
  const reference = state.invitations[0];
  if (!reference) throw new DomainError("Belum ada undangan.", 404);
  authorize(actor, reference);
  return reference;
}

function sorted(items: BudgetItem[]) {
  return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getBudget(actor: Actor | null) {
  const state = await readState();
  requireWorkspace(state, actor);
  const items = sorted(state.budget ?? []);
  return {
    items,
    settings: state.budgetSettings ?? { cap: 0 },
    summary: summarizeBudget(items, state.budgetSettings ?? { cap: 0 }),
  };
}

export async function addBudgetItem(actor: Actor | null, input: unknown) {
  const data = budgetItemInputSchema.parse(input);
  return mutateState((state) => {
    requireWorkspace(state, actor);
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
  const data = budgetItemInputSchema.parse(input);
  return mutateState((state) => {
    requireWorkspace(state, actor);
    const item = (state.budget ?? []).find((i) => i.id === id);
    if (!item) throw new DomainError("Pos anggaran tidak ditemukan.", 404);
    Object.assign(item, data, { updatedAt: new Date().toISOString() });
    return item;
  });
}

export async function removeBudgetItem(actor: Actor | null, id: string) {
  return mutateState((state) => {
    requireWorkspace(state, actor);
    const before = (state.budget ?? []).length;
    state.budget = (state.budget ?? []).filter((i) => i.id !== id);
    if (state.budget.length === before)
      throw new DomainError("Pos anggaran tidak ditemukan.", 404);
    return { id, deleted: true };
  });
}

export async function saveBudgetSettings(actor: Actor | null, input: unknown) {
  const settings = budgetSettingsSchema.parse(input);
  return mutateState((state) => {
    requireWorkspace(state, actor);
    state.budgetSettings = settings;
    return settings;
  });
}

/**
 * Mengisi kerangka pos pawiwahan. Pos yang namanya sudah ada dilewati agar
 * aman dijalankan ulang tanpa menggandakan daftar.
 */
export async function applyBudgetTemplate(actor: Actor | null) {
  return mutateState((state) => {
    requireWorkspace(state, actor);
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
  const state = await readState();
  requireWorkspace(state, actor);
  return budgetToCsv(sorted(state.budget ?? []));
}
