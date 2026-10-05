import type { Actor } from "./services";

/** Pembantu tes: aktor admin (ruang kerja contoh) dan pelanggan sungguhan. */
export const adminActor = (email = "owner@example.test"): Actor => ({
  userId: "owner",
  workspaceId: "workspace-demo",
  email,
  name: "Pemilik",
  role: "admin",
});

let counter = 0;

/** Mendaftarkan pelanggan baru lewat layanan register dan mengembalikan aktornya. */
export async function registerCustomer(
  name = "Pelanggan",
  email = `pelanggan-${++counter}-${Math.random().toString(36).slice(2, 8)}@example.test`,
  password = "kata-sandi-aman",
) {
  const { register } = await import("./auth");
  const result = await register({ name, email, password });
  const actor: Actor = {
    userId: result.userId,
    workspaceId: result.workspaceId,
    email,
    name,
    role: "customer",
  };
  return { actor, slug: result.slug, email, password };
}

/** Mengubah paket ruang kerja (menggantikan alur pembayaran pada tes). */
export async function setPlan(
  workspaceId: string,
  plan: {
    id: string;
    status: "trial" | "active" | "expired";
    expiresAt?: string;
  },
) {
  const { mutateGlobal } =
    await import("../modules/invitations/infrastructure/global-store");
  await mutateGlobal((global) => {
    const workspace = global.workspaces.find((w) => w.id === workspaceId);
    if (!workspace) throw new Error("Ruang kerja tidak ada");
    workspace.plan = plan;
  });
}
