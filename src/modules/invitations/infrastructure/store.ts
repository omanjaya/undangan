import { DomainError } from "../domain/invitation";
import { ensureBootstrapped } from "./bootstrap";
import {
  deleteWorkspaceRaw,
  mutateWorkspaceRaw,
  putWorkspaceRaw,
  readWorkspaceRaw,
} from "./storage";
import { normalizeState, type State } from "./state";

export { normalizeState } from "./state";
export type { MediaAsset, State } from "./state";

/**
 * Penyimpanan per ruang kerja. Tiap ruang kerja satu dokumen JSON dengan
 * kunci barisnya sendiri, sehingga pelanggan yang berbeda tidak saling
 * menunggu. Lihat storage.ts untuk aturan penguncian.
 */

/** Null bila ruang kerja belum ada; untuk jalur publik yang tidak boleh melempar. */
export async function tryReadWorkspace(
  workspaceId: string,
): Promise<State | null> {
  await ensureBootstrapped();
  let raw: unknown;
  try {
    raw = await readWorkspaceRaw(workspaceId);
  } catch (error) {
    if (error instanceof DomainError) return null;
    throw error;
  }
  return raw ? normalizeState(raw as State) : null;
}

export async function readWorkspace(workspaceId: string): Promise<State> {
  const state = await tryReadWorkspace(workspaceId);
  if (!state) throw new DomainError("Data ruang kerja tidak ditemukan.", 404);
  return state;
}

export async function mutateWorkspace<T>(
  workspaceId: string,
  fn: (state: State) => T,
): Promise<T> {
  await ensureBootstrapped();
  return mutateWorkspaceRaw(workspaceId, (raw) => {
    const state = normalizeState(raw as State);
    return { result: fn(state), next: state };
  });
}

/** Membuat ruang kerja baru (atau menimpa seluruhnya). Hanya untuk pendaftaran. */
export async function createWorkspaceState(workspaceId: string, state: State) {
  await ensureBootstrapped();
  await putWorkspaceRaw(workspaceId, normalizeState(state));
}

export async function discardWorkspaceState(workspaceId: string) {
  await ensureBootstrapped();
  await deleteWorkspaceRaw(workspaceId);
}
