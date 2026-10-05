import { ensureBootstrapped } from "./bootstrap";
import { normalizeGlobal, type GlobalState } from "./global-state";
import { mutateGlobalRaw, readGlobalRaw } from "./storage";

export * from "./global-state";

/**
 * Penyimpanan global (akun, sesi, ruang kerja, indeks slug dan media).
 * Satu dokumen dengan satu kunci baris; semua penulisnya singkat. Jangan
 * dipanggil dari dalam `mutateWorkspace` atau `mutateGlobal` lain; lihat
 * aturan penguncian di storage.ts.
 */
export async function readGlobal(): Promise<GlobalState> {
  await ensureBootstrapped();
  const raw = await readGlobalRaw();
  if (!raw) throw new Error("Penyimpanan global belum diinisialisasi.");
  return normalizeGlobal(raw);
}

export async function mutateGlobal<T>(
  fn: (global: GlobalState) => T,
): Promise<T> {
  await ensureBootstrapped();
  return mutateGlobalRaw((raw) => {
    const global = normalizeGlobal(raw);
    return { result: fn(global), next: global };
  });
}
