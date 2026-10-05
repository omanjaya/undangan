import { z } from "zod";
import { DomainError } from "../invitations/domain/invitation";
import type {
  GlobalState,
  PackageRecord,
} from "../invitations/infrastructure/global-state";
import { DEFAULT_PACKAGES, type PackageDefinition } from "./catalog";

/** Tanggal tetap untuk paket benih agar normalisasi tetap deterministik. */
const SEED_DATE = "2026-01-01T00:00:00.000Z";

/** Paket awal dari katalog bawaan; dipakai selama penyimpanan belum berisi paket. */
export function seedPackages(): PackageRecord[] {
  return DEFAULT_PACKAGES.map((pkg, index) => ({
    ...structuredClone(pkg),
    active: true,
    sortOrder: index + 1,
    updatedAt: SEED_DATE,
  }));
}

/** Bentuk paket tanpa metadata penyimpanan; inilah yang disalin ke pesanan. */
export function toDefinition(record: PackageDefinition): PackageDefinition {
  const {
    id,
    name,
    tagline,
    price,
    originalPrice,
    durationDays,
    highlighted,
    features,
    limits,
    flags,
  } = record;
  return structuredClone({
    id,
    name,
    tagline,
    price,
    ...(originalPrice ? { originalPrice } : {}),
    durationDays,
    ...(highlighted ? { highlighted } : {}),
    features,
    limits,
    flags,
  });
}

export const sortPackages = (packages: PackageRecord[]) =>
  [...packages].sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price);

/** Paket yang dijual sekarang, terurut. */
export function activePackages(global: Pick<GlobalState, "packages">) {
  const source = global.packages.length ? global.packages : seedPackages();
  return sortPackages(source.filter((pkg) => pkg.active));
}

export function findPackage(
  global: Pick<GlobalState, "packages">,
  id: string,
): PackageRecord | undefined {
  return global.packages.find((pkg) => pkg.id === id);
}

const int = (min: number, max: number, label: string) =>
  z.coerce
    .number({ error: `${label} harus berupa angka.` })
    .int(`${label} harus bilangan bulat.`)
    .min(min, `${label} minimal ${min}.`)
    .max(max, `${label} maksimal ${max}.`);

const flag = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === "true" || v === "on" || v === "1");

const RESERVED_PACKAGE_IDS = ["admin", "trial"];

/** Masukan admin untuk membuat atau mengubah paket. */
export const packageInputSchema = z.object({
  id: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Kode paket hanya huruf kecil, angka, dan tanda hubung.",
    )
    .max(40)
    // "admin" dan "trial" bermakna khusus pada paket ruang kerja (tanpa batas / uji coba).
    .refine(
      (id) => !RESERVED_PACKAGE_IDS.includes(id),
      "Kode paket dicadangkan.",
    ),
  name: z.string().trim().min(1, "Nama paket wajib diisi.").max(60),
  tagline: z.string().trim().max(160).default(""),
  price: int(0, 100_000_000, "Harga"),
  originalPrice: z
    .union([z.literal(""), z.null(), int(0, 100_000_000, "Harga coret")])
    .optional()
    .transform((v) => (typeof v === "number" && v > 0 ? v : undefined)),
  durationDays: int(1, 3650, "Masa aktif"),
  features: z
    .union([z.array(z.string()), z.string()])
    .transform((v) =>
      (Array.isArray(v) ? v : v.split(/\r?\n/))
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.string().max(160))
        .min(1, "Isi minimal satu keunggulan.")
        .max(20),
    ),
  maxInvitations: int(1, 100, "Batas undangan"),
  maxGuests: int(1, 100_000, "Batas tamu"),
  maxMediaMB: int(1, 100_000, "Ruang media"),
  music: flag.default(false),
  video: flag.default(false),
  gift: flag.default(false),
  guestList: flag.default(false),
  qrCheckin: flag.default(false),
  customSlug: flag.default(false),
  removeBranding: flag.default(false),
  active: flag.default(false),
  highlighted: flag.default(false),
  sortOrder: int(0, 1000, "Urutan").default(100),
});
export type PackageInput = z.infer<typeof packageInputSchema>;

export function recordFromInput(
  input: PackageInput,
  now = new Date(),
): PackageRecord {
  return {
    id: input.id,
    name: input.name,
    tagline: input.tagline,
    price: input.price,
    ...(input.originalPrice ? { originalPrice: input.originalPrice } : {}),
    durationDays: input.durationDays,
    ...(input.highlighted ? { highlighted: true } : {}),
    features: input.features,
    limits: {
      maxInvitations: input.maxInvitations,
      maxGuests: input.maxGuests,
      maxMediaMB: input.maxMediaMB,
    },
    flags: {
      music: input.music,
      video: input.video,
      gift: input.gift,
      guestList: input.guestList,
      qrCheckin: input.qrCheckin,
      customSlug: input.customSlug,
      removeBranding: input.removeBranding,
    },
    active: input.active,
    sortOrder: input.sortOrder,
    updatedAt: now.toISOString(),
  };
}

/** Menyimpan paket (baru atau ubah); panggil di dalam `mutateGlobal`. */
export function savePackage(
  global: GlobalState,
  input: PackageInput,
  mode: "create" | "update",
  now = new Date(),
) {
  const existing = findPackage(global, input.id);
  if (mode === "create" && existing)
    throw new DomainError("Kode paket sudah dipakai.", 409);
  if (mode === "update" && !existing)
    throw new DomainError("Paket tidak ditemukan.", 404);
  const record = recordFromInput(input, now);
  // Hanya satu paket yang disorot di halaman harga.
  if (record.highlighted)
    for (const other of global.packages)
      if (other.id !== record.id) delete other.highlighted;
  if (existing) global.packages[global.packages.indexOf(existing)] = record;
  else global.packages.push(record);
  return { record, before: existing };
}

/** Menghapus paket; pesanan lama aman karena menyimpan salinan paket. */
export function deletePackage(global: GlobalState, id: string) {
  const existing = findPackage(global, id);
  if (!existing) throw new DomainError("Paket tidak ditemukan.", 404);
  if (global.packages.length <= 1)
    throw new DomainError(
      "Paket terakhir tidak dapat dihapus. Nonaktifkan bila perlu.",
      409,
    );
  global.packages.splice(global.packages.indexOf(existing), 1);
  return existing;
}
