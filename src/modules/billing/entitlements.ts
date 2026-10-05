import type { Workspace } from "../invitations/infrastructure/global-state";

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

export function getEntitlements(
  workspace: Pick<Workspace, "plan">,
  now = Date.now(),
): Entitlements {
  const { plan } = workspace;
  // Ruang kerja admin (plan.id "admin") selalu tanpa batas.
  if (plan.id === "admin") return everything();
  if (plan.status === "active") {
    const expired = plan.expiresAt && Date.parse(plan.expiresAt) <= now;
    if (!expired) return everything();
  }
  // Uji coba dan paket yang berakhir dibatasi sama: boleh menyusun, belum boleh menerbitkan.
  return trial();
}
