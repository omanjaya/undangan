import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";
import { DomainError } from "../domain/invitation";

/**
 * Lapisan simpan tingkat rendah untuk dua jenis dokumen JSON: satu dokumen
 * global dan satu dokumen per ruang kerja. Produksi memakai PostgreSQL (JSONB
 * dengan kunci baris), pengembangan memakai berkas di DATA_DIR.
 *
 * Aturan penguncian:
 * - `mutate*` memegang kunci baris (SELECT ... FOR UPDATE) selama `transform`
 *   berjalan, dan tidak menulis apa pun bila `transform` melempar galat.
 * - Jangan memanggil `mutate*` lain dari dalam `transform`. Operasi yang
 *   menyentuh dokumen global dan ruang kerja dijalankan sebagai urutan
 *   langkah terpisah. Jika suatu hari terpaksa bersarang, urutannya WAJIB
 *   global dulu, baru ruang kerja, agar tidak terjadi deadlock; kolam koneksi
 *   (max 5) juga habis bila banyak permintaan menahan dua koneksi sekaligus.
 */

type Json = unknown;
export type Transform<T> = (raw: Json) => { next: Json; result: T };

/** Akses tambahan yang hanya tersedia selama bootstrap/migrasi. */
export type BootstrapTx = {
  putWorkspace(id: string, payload: Json): Promise<void>;
  /** Data single-owner lama (`app_state` / `state.json`), atau null. */
  readLegacy(): Promise<Json | null>;
};

/**
 * Skema minimum, idempoten (sama dengan db/migrations/0001 dan 0003). Dijalankan
 * saat bootstrap agar instalasi yang lupa `npm run db:migrate` — misalnya
 * Compose development dengan volume database lama — tetap bisa menyala alih-
 * alih gagal 503 karena tabel baru belum ada.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS app_state (
  id text PRIMARY KEY CHECK (id = 'primary'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_global (
  id text PRIMARY KEY CHECK (id = 'primary'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS workspace_state (
  workspace_id text PRIMARY KEY,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);`;

const WORKSPACE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const BOOTSTRAP_LOCK = 7311001;

let pool: ReturnType<typeof postgres> | null | undefined;
function sql() {
  if (pool === undefined)
    pool = process.env.DATABASE_URL
      ? postgres(process.env.DATABASE_URL, { max: 5 })
      : null;
  return pool;
}

export async function closeStorage() {
  if (pool) await pool.end();
  pool = undefined;
}

export const usesPostgres = () => !!process.env.DATABASE_URL;

function requireDevelopmentFiles() {
  if (process.env.NODE_ENV === "production")
    throw new Error("DATABASE_URL wajib untuk production.");
}

const dataDir = () => resolve(process.env.DATA_DIR || ".data");
const globalFile = () => resolve(dataDir(), "global.json");
const legacyFile = () => resolve(dataDir(), "state.json");
function workspaceFile(id: string) {
  if (!WORKSPACE_ID.test(id))
    throw new DomainError("Ruang kerja tidak ditemukan.", 404);
  return resolve(dataDir(), "workspaces", `${id}.json`);
}

// Antrean per berkas menggantikan kunci baris pada mode berkas.
const queues = new Map<string, Promise<unknown>>();
function enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(operation);
  queues.set(
    key,
    run.catch(() => {}),
  );
  return run;
}

async function readJson(path: string): Promise<Json | null> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(path: string, value: Json) {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temp = `${path}.tmp`;
  await writeFile(temp, JSON.stringify(value), { mode: 0o600 });
  await rename(temp, path);
}

const missingWorkspace = () =>
  new DomainError("Data ruang kerja tidak ditemukan.", 404);

export async function readGlobalRaw(): Promise<Json | null> {
  const db = sql();
  if (db) {
    const rows = await db`SELECT payload FROM app_global WHERE id = 'primary'`;
    return rows[0]?.payload ?? null;
  }
  requireDevelopmentFiles();
  return readJson(globalFile());
}

export async function mutateGlobalRaw<T>(transform: Transform<T>): Promise<T> {
  const db = sql();
  if (db)
    return (await db.begin(async (tx) => {
      const rows =
        await tx`SELECT payload FROM app_global WHERE id = 'primary' FOR UPDATE`;
      if (!rows[0]) throw new Error("Penyimpanan global belum diinisialisasi.");
      const { next, result } = transform(rows[0].payload);
      await tx`UPDATE app_global SET payload = ${tx.json(next as never)}, updated_at = now() WHERE id = 'primary'`;
      return result;
    })) as T;
  requireDevelopmentFiles();
  return enqueue(globalFile(), async () => {
    const raw = await readJson(globalFile());
    if (raw === null)
      throw new Error("Penyimpanan global belum diinisialisasi.");
    const { next, result } = transform(raw);
    await writeJson(globalFile(), next);
    return result;
  });
}

export async function readWorkspaceRaw(id: string): Promise<Json | null> {
  const db = sql();
  if (db) {
    const rows =
      await db`SELECT payload FROM workspace_state WHERE workspace_id = ${id}`;
    return rows[0]?.payload ?? null;
  }
  requireDevelopmentFiles();
  return readJson(workspaceFile(id));
}

export async function mutateWorkspaceRaw<T>(
  id: string,
  transform: Transform<T>,
): Promise<T> {
  const db = sql();
  if (db)
    return (await db.begin(async (tx) => {
      const rows =
        await tx`SELECT payload FROM workspace_state WHERE workspace_id = ${id} FOR UPDATE`;
      if (!rows[0]) throw missingWorkspace();
      const { next, result } = transform(rows[0].payload);
      await tx`UPDATE workspace_state SET payload = ${tx.json(next as never)}, updated_at = now() WHERE workspace_id = ${id}`;
      return result;
    })) as T;
  requireDevelopmentFiles();
  const path = workspaceFile(id);
  return enqueue(path, async () => {
    const raw = await readJson(path);
    if (raw === null) throw missingWorkspace();
    const { next, result } = transform(raw);
    await writeJson(path, next);
    return result;
  });
}

/** Membuat atau menimpa dokumen ruang kerja (pendaftaran dan migrasi). */
export async function putWorkspaceRaw(id: string, payload: Json) {
  const db = sql();
  if (db) {
    await db`INSERT INTO workspace_state (workspace_id, payload) VALUES (${id}, ${db.json(payload as never)})
      ON CONFLICT (workspace_id) DO UPDATE SET payload = excluded.payload, updated_at = now()`;
    return;
  }
  requireDevelopmentFiles();
  const path = workspaceFile(id);
  await enqueue(path, () => writeJson(path, payload));
}

/** Menghapus dokumen ruang kerja; dipakai untuk membersihkan sisa pendaftaran gagal. */
export async function deleteWorkspaceRaw(id: string) {
  const db = sql();
  if (db) {
    await db`DELETE FROM workspace_state WHERE workspace_id = ${id}`;
    return;
  }
  requireDevelopmentFiles();
  const path = workspaceFile(id);
  await enqueue(path, () => rm(path, { force: true }));
}

/**
 * Menjalankan inisialisasi/migrasi secara eksklusif. `run` menerima dokumen
 * global saat ini (null bila belum ada) dan mengembalikan dokumen global baru
 * untuk disimpan, atau null bila tidak ada yang perlu ditulis. Pada PostgreSQL
 * seluruhnya satu transaksi dengan advisory lock, jadi dua proses yang start
 * bersamaan tidak bisa membuat admin ganda dan kegagalan tidak meninggalkan
 * data setengah jadi. Pada mode berkas, dokumen global ditulis paling akhir
 * sebagai penanda selesai.
 */
export async function bootstrapRaw(
  run: (current: Json | null, tx: BootstrapTx) => Promise<Json | null>,
) {
  const db = sql();
  if (db) {
    await db.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK})`;
      await tx.unsafe(SCHEMA);
      const rows =
        await tx`SELECT payload FROM app_global WHERE id = 'primary'`;
      const next = await run(rows[0]?.payload ?? null, {
        async putWorkspace(id, payload) {
          await tx`INSERT INTO workspace_state (workspace_id, payload) VALUES (${id}, ${tx.json(payload as never)})
            ON CONFLICT (workspace_id) DO UPDATE SET payload = excluded.payload, updated_at = now()`;
        },
        async readLegacy() {
          const legacy =
            await tx`SELECT payload FROM app_state WHERE id = 'primary'`;
          return legacy[0]?.payload ?? null;
        },
      });
      if (next)
        await tx`INSERT INTO app_global (id, payload) VALUES ('primary', ${tx.json(next as never)})
          ON CONFLICT (id) DO UPDATE SET payload = excluded.payload, updated_at = now()`;
    });
    return;
  }
  requireDevelopmentFiles();
  await enqueue(globalFile(), async () => {
    const next = await run(await readJson(globalFile()), {
      putWorkspace: (id, payload) => writeJson(workspaceFile(id), payload),
      readLegacy: () => readJson(legacyFile()),
    });
    if (next) await writeJson(globalFile(), next);
  });
}
