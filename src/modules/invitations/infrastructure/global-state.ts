/**
 * Penyimpanan global: semua data yang melintasi ruang kerja. Akun, sesi,
 * daftar ruang kerja, serta dua indeks pencarian publik (slug dan media) yang
 * memungkinkan halaman tamu menemukan ruang kerja pemiliknya tanpa memindai
 * semua ruang kerja. Isi undangan, tamu, anggaran, dan media tiap ruang kerja
 * ada di `State` (state.ts).
 */
import type { PackageDefinition } from "../../billing/catalog";
import { seedPackages } from "../../billing/packages";

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

/**
 * Paket yang dijual. Disemai dari `DEFAULT_PACKAGES` dan diubah admin.
 * `active: false` menyembunyikan paket dari halaman harga tanpa memutus
 * pesanan lama yang menyimpan salinan paket (`Order.packageSnapshot`).
 */
export type PackageRecord = PackageDefinition & {
  active: boolean;
  sortOrder: number;
  updatedAt: string;
};

export type OrderStatus =
  /** Tagihan dibuat, menunggu transfer. */
  | "pending"
  /** Pelanggan sudah mengunggah bukti, menunggu verifikasi admin. */
  | "awaiting_verification"
  | "paid"
  | "rejected"
  | "cancelled"
  | "expired";

export type Order = {
  id: string;
  /** Nomor tagihan yang terbaca manusia, mis. `TMU-20261005-0001`. */
  number: string;
  workspaceId: string;
  userId: string;
  packageId: string;
  /** Salinan paket saat dipesan; harga/hak tidak berubah walau paket diedit. */
  packageSnapshot: PackageDefinition;
  /** Harga paket (rupiah). */
  amount: number;
  /** Kode unik 3 digit yang ditambahkan agar transfer mudah dicocokkan. */
  uniqueCode: number;
  /** amount + uniqueCode: nominal yang harus ditransfer persis. */
  total: number;
  status: OrderStatus;
  /** Id aset bukti transfer di ruang kerja pemesan. */
  proofAssetId?: string;
  proofNote?: string;
  rejectReason?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  paidAt?: string;
  verifiedByUserId?: string;
  /** Dibuat admin untuk klien jasa (tanpa transfer dari pelanggan). */
  createdByAdmin?: boolean;
};

export type BankAccount = { bank: string; holder: string; number: string };

export type SiteSettings = {
  /** Rekening tujuan transfer yang ditampilkan di tagihan. */
  bankAccounts?: BankAccount[];
  /** Catatan tambahan di halaman pembayaran. */
  paymentNote?: string;
  /** Lama tagihan berlaku sebelum kedaluwarsa, dalam jam (bawaan 48). */
  orderExpiryHours?: number;
};

export type AuditEntry = {
  id: string;
  at: string;
  actorUserId: string;
  /** Mis. `order.verify`, `user.suspend`, `user.impersonate`, `package.update`. */
  action: string;
  targetType: "user" | "workspace" | "order" | "package" | "settings";
  targetId: string;
  detail?: string;
};

export type GlobalState = {
  users: User[];
  sessions: Session[];
  workspaces: Workspace[];
  slugs: Record<string, SlugEntry>;
  /** Id aset (nama berkas tanpa ekstensi) menuju id ruang kerja pemiliknya. */
  mediaIndex: Record<string, string>;
  orders: Order[];
  packages: PackageRecord[];
  siteSettings: SiteSettings;
  /** Jejak tindakan admin; dipangkas ke entri terbaru. */
  auditLog: AuditEntry[];
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
  auditLog: [],
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
    orders: list<Order>(source.orders).filter(isRecord),
    // Penyimpanan baru (atau lama yang belum berisi paket) memakai katalog bawaan.
    packages: ((packages) => (packages.length ? packages : seedPackages()))(
      list<PackageRecord>(source.packages).filter(isRecord),
    ),
    siteSettings: isRecord(source.siteSettings)
      ? (source.siteSettings as SiteSettings)
      : {},
    auditLog: list<AuditEntry>(source.auditLog).filter(isRecord),
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
