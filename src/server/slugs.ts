import { DomainError } from "../modules/invitations/domain/invitation";
import {
  mutateGlobal,
  readGlobal,
  slugEntry,
  type SlugEntry,
} from "../modules/invitations/infrastructure/global-store";
import { tryReadWorkspace } from "../modules/invitations/infrastructure/store";

/**
 * Indeks slug global. Slug adalah alamat publik (`/i/<slug>`), jadi harus unik
 * di semua ruang kerja, termasuk alamat lama yang masih dialihkan.
 *
 * Pendekatan konsistensi (tanpa transaksi lintas dokumen):
 *   1. pesan slug di indeks global (atomik, menolak bila sudah dipakai),
 *   2. tulis ruang kerja,
 *   3. bila langkah 2 gagal, lepas pesanan.
 * Yang dikorbankan hanya pesanan yatim bila proses mati di antara langkah 1
 * dan 2. Pesanan yatim tidak merusak apa pun (slug itu hanya tidak mengarah ke
 * undangan) dan otomatis boleh diambil alih setelah `ORPHAN_AFTER_MS`, dengan
 * pengecekan ulang bahwa undangannya memang tidak ada. Penghapusan undangan
 * memakai urutan terbalik: ruang kerja dulu, indeks kemudian.
 */
const ORPHAN_AFTER_MS = 2 * 60_000;

export const SLUG_RESERVED = [
  "api",
  "media",
  "dashboard",
  "login",
  "daftar",
  "lupa-sandi",
  "reset-sandi",
  "admin",
  "preview",
  "templates",
  "themes",
];

export function assertSlug(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 80 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
    SLUG_RESERVED.includes(value)
  )
    throw new DomainError(
      "Gunakan 3–80 huruf kecil, angka, dan tanda hubung untuk alamat undangan.",
    );
}

/** Slug (aktif maupun alamat lama) menuju ruang kerja dan undangan pemiliknya. */
export async function resolveSlug(slug: string) {
  return slugEntry(await readGlobal(), slug) ?? null;
}

async function pointsToLiveInvitation(entry: SlugEntry, slug: string) {
  if ((entry.createdAt ?? 0) > Date.now() - ORPHAN_AFTER_MS) return true;
  const state = await tryReadWorkspace(entry.workspaceId);
  return !!state?.invitations.some(
    (i) =>
      i.id === entry.invitationId &&
      (i.slug === slug || !!i.aliases?.includes(slug)),
  );
}

const taken = () =>
  new DomainError("Alamat itu sudah dipakai undangan lain.", 409);

/**
 * Memesan slug untuk undangan. Mengembalikan true bila pesanan baru dibuat
 * (yang harus dilepas jika langkah berikutnya gagal) dan false bila slug itu
 * memang sudah menjadi milik undangan yang sama.
 */
export async function reserveSlug(
  slug: string,
  workspaceId: string,
  invitationId: string,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const outcome = await mutateGlobal((global) => {
      const existing = slugEntry(global, slug);
      if (!existing) {
        global.slugs[slug] = {
          workspaceId,
          invitationId,
          createdAt: Date.now(),
        };
        return { kind: "reserved" as const };
      }
      if (
        existing.workspaceId === workspaceId &&
        existing.invitationId === invitationId
      )
        return { kind: "same" as const };
      return { kind: "conflict" as const, existing: { ...existing } };
    });
    if (outcome.kind === "reserved") return true;
    if (outcome.kind === "same") return false;
    if (await pointsToLiveInvitation(outcome.existing, slug)) throw taken();
    // Pesanan yatim: ambil alih hanya jika belum berubah sejak dibaca.
    const stolen = await mutateGlobal((global) => {
      const current = slugEntry(global, slug);
      if (
        current?.workspaceId !== outcome.existing.workspaceId ||
        current.invitationId !== outcome.existing.invitationId
      )
        return false;
      global.slugs[slug] = { workspaceId, invitationId, createdAt: Date.now() };
      return true;
    });
    if (stolen) return true;
  }
  throw taken();
}

/** Melepas slug hanya bila masih milik undangan tersebut. */
export async function releaseSlugs(slugs: string[], invitationId: string) {
  if (!slugs.length) return;
  await mutateGlobal((global) => {
    for (const slug of slugs)
      if (slugEntry(global, slug)?.invitationId === invitationId)
        delete global.slugs[slug];
  });
}
