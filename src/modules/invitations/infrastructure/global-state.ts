/**
 * Penyimpanan global: semua data yang melintasi ruang kerja. Akun, sesi,
 * daftar ruang kerja, serta dua indeks pencarian publik (slug dan media) yang
 * memungkinkan halaman tamu menemukan ruang kerja pemiliknya tanpa memindai
 * semua ruang kerja. Isi undangan, tamu, anggaran, dan media tiap ruang kerja
 * ada di `State` (state.ts).
 */
export type UserRole = "admin" | "customer";
export type UserStatus = "active" | "suspended";

export type User = {
  id: string;
  /** Selalu huruf kecil dan unik. */
  email: string;
  name: string;
  phone?: string;
  /** `scrypt$N$r$p$salt$hash`, lihat modules/accounts/password.ts. */
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLoginAt?: string;
};

export type Session = {
  /** SHA-256 heksadesimal dari token cookie; token asli tidak disimpan. */
  tokenHash: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
  /** Terisi bila admin sedang menyamar sebagai `userId`. */
  impersonatorUserId?: string;
};

export type WorkspacePlan = {
  id: string;
  status: "trial" | "active" | "expired";
  expiresAt?: string;
};

export type Workspace = {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
  plan: WorkspacePlan;
  settings?: Record<string, unknown>;
};

/** Slug (termasuk alamat lama) menuju undangan di salah satu ruang kerja. */
export type SlugEntry = {
  workspaceId: string;
  invitationId: string;
  /** Epoch ms pemesanan; dipakai membedakan pemesanan yatim dari yang baru. */
  createdAt?: number;
};

export type GlobalState = {
  users: User[];
  sessions: Session[];
  workspaces: Workspace[];
  slugs: Record<string, SlugEntry>;
  /** Id aset (nama berkas tanpa ekstensi) menuju id ruang kerja pemiliknya. */
  mediaIndex: Record<string, string>;
  /** Diisi modul penagihan dan admin kelak. */
  orders: unknown[];
  packages: unknown[];
  siteSettings: Record<string, unknown>;
};

export const emptyGlobal = (): GlobalState => ({
  users: [],
  sessions: [],
  workspaces: [],
  slugs: {},
  mediaIndex: {},
  orders: [],
  packages: [],
  siteSettings: {},
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Melengkapi koleksi yang hilang agar pembaca berikutnya tidak gagal di tengah jalan. */
export function normalizeGlobal(raw: unknown): GlobalState {
  const source = isRecord(raw) ? raw : {};
  const list = <T>(value: unknown) =>
    Array.isArray(value) ? (value as T[]) : [];
  return {
    users: list<User>(source.users).filter(isRecord),
    sessions: list<Session>(source.sessions).filter(isRecord),
    workspaces: list<Workspace>(source.workspaces).filter(isRecord),
    slugs: isRecord(source.slugs) ? (source.slugs as GlobalState["slugs"]) : {},
    mediaIndex: isRecord(source.mediaIndex)
      ? (source.mediaIndex as GlobalState["mediaIndex"])
      : {},
    orders: list(source.orders),
    packages: list(source.packages),
    siteSettings: isRecord(source.siteSettings) ? source.siteSettings : {},
  };
}

/** Kunci indeks berasal dari masukan pengguna, jadi jangan membaca rantai prototipe. */
export function slugEntry(global: GlobalState, slug: string) {
  return Object.hasOwn(global.slugs, slug) ? global.slugs[slug] : undefined;
}

export function mediaOwner(global: GlobalState, assetId: string) {
  return Object.hasOwn(global.mediaIndex, assetId)
    ? global.mediaIndex[assetId]
    : undefined;
}

/** Id aset = nama berkas tanpa ekstensi (`<uuid>.webp` menjadi `<uuid>`). */
export const assetKey = (filename: string) => filename.replace(/\.[^.]+$/, "");
