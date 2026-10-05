import { DomainError } from "../modules/invitations/domain/invitation";
import {
  getEntitlements,
  type Entitlements,
} from "../modules/billing/entitlements";
import { readGlobal } from "../modules/invitations/infrastructure/global-store";
import type { Actor } from "./services";

/** Semua layanan pemilik bekerja hanya pada ruang kerja milik `actor`. */
export function requireActor(actor: Actor | null): Actor {
  if (!actor) throw new DomainError("Silakan masuk terlebih dahulu.", 401);
  return actor;
}

export async function loadEntitlements(
  workspaceId: string,
): Promise<Entitlements> {
  const global = await readGlobal();
  const workspace = global.workspaces.find((w) => w.id === workspaceId);
  if (!workspace) throw new DomainError("Ruang kerja tidak ditemukan.", 404);
  return getEntitlements(workspace);
}

const UPGRADE_HINT = "Pilih paket terlebih dahulu untuk menggunakannya.";

export function requireFeature(
  entitlements: Entitlements,
  feature: keyof Entitlements["features"],
  label: string,
) {
  if (!entitlements.features[feature])
    throw new DomainError(
      `Fitur ${label} belum termasuk dalam paket Anda. ${UPGRADE_HINT}`,
      403,
    );
}
