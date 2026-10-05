import type {
  Order,
  Workspace,
} from "../invitations/infrastructure/global-state";
import type { PackageDefinition } from "./catalog";

/** Pengganti "tanpa batas" yang tetap angka biasa agar aman diserialisasi JSON. */
export const UNLIMITED = Number.MAX_SAFE_INTEGER;

/**
 * Hak yang dimiliki sebuah ruang kerja menurut paketnya. Modul penagihan
 * mengisi paket; layanan server hanya bertanya lewat `getEntitlements`.
 */
export type Entitlements = {
  /** Boleh menerbitkan atau memperbarui undangan publik. */
  canPublish: boolean;
  maxInvitations: number;
  /** Batas tamu per undangan. */
  maxGuests: number;
  /** Batas total ukuran media satu ruang kerja, dalam byte. */
  maxMediaBytes: number;
  features: {
    music: boolean;
    video: boolean;
    gift: boolean;
    guestList: boolean;
    qrCheckin: boolean;
    customSlug: boolean;
    removeBranding: boolean;
  };
};

const MB = 1024 * 1024;

const everything = (): Entitlements => ({
  canPublish: true,
  maxInvitations: UNLIMITED,
  maxGuests: UNLIMITED,
  maxMediaBytes: UNLIMITED,
  features: {
    music: true,
    video: true,
    gift: true,
    guestList: true,
    qrCheckin: true,
    customSlug: true,
    removeBranding: true,
  },
});

const trial = (): Entitlements => ({
  canPublish: false,
  maxInvitations: 1,
  maxGuests: 50,
  maxMediaBytes: 200 * MB,
  features: {
    music: true,
    video: true,
    gift: true,
    guestList: true,
    qrCheckin: true,
    customSlug: true,
    removeBranding: false,
  },
});

/** Sumber data paket untuk `getEntitlements`; tanpa ini paket aktif dianggap tanpa batas. */
export type PlanSource = {
  packages?: Pick<PackageDefinition, "id" | "limits" | "flags">[];
  orders?: Pick<
    Order,
    "workspaceId" | "packageId" | "packageSnapshot" | "status" | "paidAt"
  >[];
};

/**
 * Paket yang dibeli: paket di penyimpanan bila masih ada, jika tidak salinan
 * pada pesanan lunas terbaru ruang kerja itu (paket mungkin sudah dihapus).
 */
export function resolvePurchasedPackage(
  workspace: Pick<Workspace, "plan"> & { id?: string },
  source: PlanSource,
): Pick<PackageDefinition, "limits" | "flags"> | undefined {
  const id = workspace.plan.id;
  const stored = source.packages?.find((pkg) => pkg.id === id);
  if (stored) return stored;
  if (!workspace.id) return undefined;
  return source.orders
    ?.filter(
      (o) =>
        o.workspaceId === workspace.id &&
        o.packageId === id &&
        o.status === "paid",
    )
    .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""))[0]
    ?.packageSnapshot;
}

const fromPackage = (
  pkg: Pick<PackageDefinition, "limits" | "flags">,
): Entitlements => ({
  canPublish: true,
  maxInvitations: pkg.limits.maxInvitations,
  maxGuests: pkg.limits.maxGuests,
  maxMediaBytes: pkg.limits.maxMediaMB * MB,
  features: { ...pkg.flags },
});

export function getEntitlements(
  workspace: Pick<Workspace, "plan"> & { id?: string },
  now = Date.now(),
  source: PlanSource = {},
): Entitlements {
  const { plan } = workspace;
  // Ruang kerja admin (plan.id "admin") selalu tanpa batas.
  if (plan.id === "admin") return everything();
  if (plan.status === "active") {
    const expired = plan.expiresAt && Date.parse(plan.expiresAt) <= now;
    if (!expired) {
      // Paket yang tidak dikenal (mis. ditetapkan manual) tetap tanpa batas.
      const pkg = resolvePurchasedPackage(workspace, source);
      return pkg ? fromPackage(pkg) : everything();
    }
  }
  // Uji coba dan paket yang berakhir dibatasi sama: boleh menyusun, belum boleh menerbitkan.
  return trial();
}
