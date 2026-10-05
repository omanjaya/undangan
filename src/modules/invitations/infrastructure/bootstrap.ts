import { randomUUID } from "node:crypto";
import { hashPassword } from "../../accounts/password";
import { DomainError } from "../domain/invitation";
import {
  assetKey,
  emptyGlobal,
  normalizeGlobal,
  type GlobalState,
  type SlugEntry,
} from "./global-state";
import { bootstrapRaw } from "./storage";
import { initialWorkspaceState, normalizeState, type State } from "./state";

/** Id ruang kerja admin; sama dengan id yang sudah tertanam di data lama. */
export const ADMIN_WORKSPACE_ID = "workspace-demo";
export const DEMO_OWNER_EMAIL = "owner@undangan.local";
export const DEMO_OWNER_PASSWORD = "demo-undangan-2026";

export class MissingOwnerCredentials extends DomainError {
  constructor() {
    super(
      "Admin pertama belum dikonfigurasi. Isi OWNER_EMAIL dan OWNER_PASSWORD.",
      503,
    );
  }
}

/** Pengembangan lokal tanpa PostgreSQL: akun demo dibuat otomatis. */
export const isDemoMode = () =>
  !process.env.DATABASE_URL && process.env.NODE_ENV !== "production";

export function ownerCredentials() {
  const demo = isDemoMode();
  const email = (
    process.env.OWNER_EMAIL || (demo ? DEMO_OWNER_EMAIL : "")
  ).trim();
  const password =
    process.env.OWNER_PASSWORD || (demo ? DEMO_OWNER_PASSWORD : "");
  if (!email || !password) throw new MissingOwnerCredentials();
  if (process.env.NODE_ENV === "production") {
    if (
      email.toLowerCase() === DEMO_OWNER_EMAIL ||
      password === DEMO_OWNER_PASSWORD ||
      password.length < 16
    )
      throw new DomainError(
        "Konfigurasi production memerlukan email admin dan kata sandi unik minimal 16 karakter.",
        503,
      );
  }
  return { email: email.toLowerCase(), password };
}

/**
 * Membangun indeks slug dan media dari isi satu ruang kerja. Slug aktif
 * didahulukan atas alamat lama bila terjadi bentrok pada data yang rusak.
 */
export function indexesOf(workspaceId: string, state: State) {
  const slugs: Record<string, SlugEntry> = {};
  const add = (slug: string, invitationId: string) => {
    if (!Object.hasOwn(slugs, slug))
      slugs[slug] = { workspaceId, invitationId };
  };
  for (const i of state.invitations) add(i.slug, i.id);
  for (const i of state.invitations)
    for (const alias of i.aliases ?? []) add(alias, i.id);
  const mediaIndex: Record<string, string> = {};
  for (const asset of state.assets ?? [])
    mediaIndex[assetKey(asset.filename)] = workspaceId;
  return { slugs, mediaIndex };
}

/**
 * Memindahkan data single-owner lama (atau membuat data awal) ke bentuk
 * multi-ruang-kerja. Hanya berjalan bila belum ada pengguna sama sekali.
 *
 * - Admin dibuat dari OWNER_EMAIL/OWNER_PASSWORD (mode demo: akun demo).
 * - Isi lama menjadi ruang kerja `workspace-demo` tanpa mengubah id apa pun,
 *   sehingga workspaceId pada undangan dan media tetap sah.
 * - Data lama (`app_state` / `state.json`) tidak diubah atau dihapus; ia
 *   menjadi cadangan.
 * - Idempoten dan aman dijalankan bersamaan: lihat bootstrapRaw.
 */
export async function runBootstrap(
  options: { skipWithoutCredentials?: boolean } = {},
): Promise<"ready" | "migrated" | "seeded" | "skipped"> {
  let outcome: "ready" | "migrated" | "seeded" | "skipped" = "ready";
  await bootstrapRaw(async (current, tx) => {
    const existing = current ? normalizeGlobal(current) : null;
    if (existing && existing.users.length > 0) return null;
    const legacy = await tx.readLegacy();
    let credentials: ReturnType<typeof ownerCredentials>;
    try {
      credentials = ownerCredentials();
    } catch (error) {
      if (
        options.skipWithoutCredentials &&
        error instanceof MissingOwnerCredentials
      ) {
        outcome = "skipped";
        return null;
      }
      throw error;
    }
    const state = legacy
      ? normalizeState(structuredClone(legacy) as State)
      : initialWorkspaceState();
    // Semua undangan dan media lama milik pemilik tunggal itu.
    for (const invitation of state.invitations)
      invitation.workspaceId = ADMIN_WORKSPACE_ID;
    for (const asset of state.assets ?? [])
      asset.workspaceId = ADMIN_WORKSPACE_ID;
    const now = new Date().toISOString();
    const admin = {
      id: randomUUID(),
      email: credentials.email,
      name: "Admin",
      passwordHash: await hashPassword(credentials.password),
      role: "admin" as const,
      status: "active" as const,
      createdAt: now,
    };
    const { slugs, mediaIndex } = indexesOf(ADMIN_WORKSPACE_ID, state);
    const next: GlobalState = {
      ...(existing ?? emptyGlobal()),
      users: [admin],
      sessions: [],
      workspaces: [
        {
          id: ADMIN_WORKSPACE_ID,
          name: "Ruang kerja admin",
          ownerUserId: admin.id,
          createdAt: now,
          plan: { id: "admin", status: "active" },
        },
      ],
      slugs,
      mediaIndex,
    };
    await tx.putWorkspace(ADMIN_WORKSPACE_ID, state);
    outcome = legacy ? "migrated" : "seeded";
    return next;
  });
  return outcome;
}

let ready: Promise<unknown> | null = null;

/** Menjamin penyimpanan siap; dipanggil otomatis oleh semua pembaca/penulis. */
export function ensureBootstrapped() {
  ready ??= runBootstrap().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}
