import type { InvitationContent } from "../invitations/domain/invitation";
import type { Entitlements } from "./entitlements";

type Features = Entitlements["features"];

/** Tautan ke halaman pemilihan paket (dikerjakan modul penagihan). */
export const UPGRADE_PATH = "/dashboard/paket";
export const UPGRADE_LABEL = "Tersedia di paket berbayar";

/**
 * Isi undangan seperti yang boleh dilihat tamu menurut paket. Data tidak
 * pernah dihapus dari draf atau snapshot terbit: hanya tampilannya yang
 * disaring, sehingga fitur kembali muncul begitu paket ditingkatkan.
 */
export function gateContent<T extends InvitationContent>(
  content: T,
  features: Features,
): T {
  if (features.music && features.video && features.gift) return content;
  return {
    ...content,
    ...(features.music ? {} : { musicUrl: "", musicTitle: "" }),
    ...(features.video ? {} : { videoUrl: "", youtubeUrl: "" }),
    ...(features.gift ? {} : { gift: { ...content.gift, enabled: false } }),
  };
}

/** Kode tamu hanya dikenali (pelacakan, nama sapaan) bila daftar tamu ada di paket. */
export const mayTrackGuests = (features: Features) => features.guestList;

/** QR tamu hanya tampil bila daftar tamu dan check-in QR sama-sama ada di paket. */
export const mayShowGuestQr = (features: Features) =>
  features.guestList && features.qrCheckin;
