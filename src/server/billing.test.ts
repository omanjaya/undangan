import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";

let billing: typeof import("./billing");
let service: typeof import("./services");
let media: typeof import("./media");
let support: typeof import("./test-support");
let tenant: typeof import("./tenant");
let globalStore: typeof import("../modules/invitations/infrastructure/global-store");
let directory: string;

type Customer = Awaited<
  ReturnType<typeof import("./test-support").registerCustomer>
>;
let a: Customer;
let b: Customer;
let admin: import("./services").Actor;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "temu-billing-"));
  process.env.DATA_DIR = directory;
  process.env.UPLOAD_DIR = join(directory, "uploads");
  delete process.env.DATABASE_URL;
  billing = await import("./billing");
  service = await import("./services");
  media = await import("./media");
  support = await import("./test-support");
  tenant = await import("./tenant");
  globalStore =
    await import("../modules/invitations/infrastructure/global-store");
  admin = support.adminActor();
  a = await support.registerCustomer("Pelanggan A");
  b = await support.registerCustomer("Pelanggan B");
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

const png = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: "#abc" } })
    .png()
    .toBuffer();
const proofRequest = async (note = "") =>
  new Request("http://localhost/api/billing/orders/x/proof", {
    method: "POST",
    headers: {
      "content-type": "image/png",
      "x-file-name": "bukti.png",
      ...(note ? { "x-proof-note": encodeURIComponent(note) } : {}),
    },
    body: (await png()) as unknown as BodyInit,
  });
const getRequest = new Request("http://localhost/media/x");
const status = (promise: Promise<unknown>) =>
  promise.then(
    () => 200,
    (e: { status?: number; name?: string }) =>
      e.name === "ZodError" ? 400 : (e.status ?? 500),
  );

describe("siklus pembayaran lewat layanan", () => {
  let number: string;

  it("pelanggan memilih paket dan satu tagihan terbuka dipakai ulang", async () => {
    const first = await billing.startOrder(a.actor, "esensial");
    expect(first.number).toMatch(/^TMU-\d{8}-\d{4}$/);
    const again = await billing.startOrder(a.actor, "esensial");
    expect(again).toEqual({ number: first.number, reused: true });
    number = first.number;
    const overview = await billing.getBillingOverview(a.actor);
    expect(overview.orders).toHaveLength(1);
    expect(overview.openOrder?.number).toBe(number);
    expect(overview.packages.map((p) => p.id)).toEqual([
      "esensial",
      "premium",
      "eksklusif",
    ]);
  });

  it("pelanggan lain tidak bisa melihat, mengunggah, atau membatalkan; non-admin tidak bisa memverifikasi", async () => {
    expect(await status(billing.getInvoice(b.actor, number))).toBe(404);
    expect(
      await status(
        proofRequest().then((r) => billing.uploadProof(b.actor, number, r)),
      ),
    ).toBe(404);
    expect(await status(billing.cancelOrder(b.actor, number))).toBe(404);
    expect(await status(billing.adminVerifyOrder(a.actor, number))).toBe(403);
    expect(await status(billing.adminListOrders(b.actor))).toBe(403);
    expect(await status(billing.adminVerifyOrder(null, number))).toBe(401);
    expect((await billing.getInvoice(a.actor, number)).order.status).toBe(
      "pending",
    );
    expect((await billing.getInvoice(admin, number)).isOwner).toBe(false);
  });

  it("bukti transfer: hanya gambar, hanya pemilik dan admin yang dapat melihat", async () => {
    const mp3 = new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "audio/mpeg" },
      body: new Uint8Array([1, 2, 3]) as unknown as BodyInit,
    });
    expect(await status(billing.uploadProof(a.actor, number, mp3))).toBe(415);
    const huge = new Request("http://localhost/x", {
      method: "POST",
      headers: {
        "content-type": "image/png",
        "content-length": String(6 * 1024 * 1024),
      },
      body: (await png()) as unknown as BodyInit,
    });
    expect(await status(billing.uploadProof(a.actor, number, huge))).toBe(413);
    expect((await billing.getInvoice(a.actor, number)).order.status).toBe(
      "pending",
    );

    const updated = await billing.uploadProof(
      a.actor,
      number,
      await proofRequest("dari BCA"),
    );
    expect(updated).toMatchObject({
      status: "awaiting_verification",
      proofNote: "dari BCA",
    });
    expect(updated.proofUrl).toMatch(/^\/media\/[a-f0-9-]+\.webp$/);
    const filename = updated.proofUrl!.replace("/media/", "");

    const serve = (actor: import("./services").Actor | null) =>
      status(media.serveMedia(filename, getRequest, actor));
    expect(await serve(a.actor)).toBe(200);
    expect(await serve(admin)).toBe(200);
    expect(await serve(b.actor)).toBe(404);
    expect(await serve(null)).toBe(404);
    // Tidak muncul di pustaka media pelanggan.
    expect(await media.listMedia(a.actor)).toEqual([]);
    // Tagihan sudah menunggu verifikasi: tidak bisa diunggah ulang atau dibatalkan.
    expect(
      await status(
        proofRequest().then((r) => billing.uploadProof(a.actor, number, r)),
      ),
    ).toBe(409);
    expect(await status(billing.cancelOrder(a.actor, number))).toBe(409);
  });

  it("admin menolak dengan alasan, pelanggan melihatnya dan mengunggah ulang", async () => {
    const oldProof = (await billing.getInvoice(a.actor, number)).order
      .proofUrl!;
    const rejected = await billing.adminRejectOrder(
      admin,
      number,
      "Nominal tidak sesuai",
    );
    expect(rejected.status).toBe("rejected");
    const invoice = await billing.getInvoice(a.actor, number);
    expect(invoice.order.rejectReason).toBe("Nominal tidak sesuai");
    const again = await billing.uploadProof(
      a.actor,
      number,
      await proofRequest(),
    );
    expect(again.status).toBe("awaiting_verification");
    expect(again.rejectReason).toBeUndefined();
    // Bukti lama yang ditolak dihapus; yang baru tetap dapat dibuka.
    expect(again.proofUrl).not.toBe(oldProof);
    await expect(
      status(media.serveMedia(oldProof.slice(7), getRequest, admin)),
    ).resolves.toBe(404);
    await expect(
      status(media.serveMedia(again.proofUrl!.slice(7), getRequest, admin)),
    ).resolves.toBe(200);
    // Pelanggan dikabari alasan penolakan lewat email.
    await new Promise((r) => setTimeout(r, 20));
    const mail = (await import("./mail")).lastMailTo(a.email);
    expect(mail?.subject).toContain("perlu diperbaiki");
    expect(mail?.text).toContain("Nominal tidak sesuai");
  });

  it("verifikasi mengaktifkan paket dan hak mengikuti paket yang dibeli", async () => {
    const before = await tenant.loadEntitlements(a.actor.workspaceId);
    expect(before.canPublish).toBe(false);
    const paid = await billing.adminVerifyOrder(admin, number);
    expect(paid).toMatchObject({ status: "paid", verifiedByUserId: "owner" });
    const ent = await tenant.loadEntitlements(a.actor.workspaceId);
    expect(ent).toMatchObject({
      canPublish: true,
      maxInvitations: 1,
      maxGuests: 150,
      maxMediaBytes: 100 * 1024 * 1024,
    });
    expect(ent.features.music).toBe(false);
    await service.publishInvitation(a.actor, a.slug);
    expect((await service.getInvitation(a.slug))?.status).toBe("published");
    await new Promise((r) => setTimeout(r, 20));
    const mail = (await import("./mail")).lastMailTo(a.email);
    expect(mail?.subject).toContain("Pembayaran diterima");
    expect(mail?.text).toContain(number);
    const summary = await billing.getPlanSummary(a.actor);
    expect(summary).toMatchObject({
      packageName: "Esensial",
      plan: { id: "esensial", status: "active" },
    });
  });

  it("mengubah paket tidak mengubah pesanan lama tetapi hak mengikuti paket terkini", async () => {
    await billing.adminSavePackage(
      admin,
      {
        id: "esensial",
        name: "Esensial Baru",
        price: 120_000,
        durationDays: 100,
        features: "Satu\nDua",
        maxInvitations: 1,
        maxGuests: 77,
        maxMediaMB: 10,
        guestList: true,
        active: true,
      },
      "update",
    );
    const invoice = await billing.getInvoice(a.actor, number);
    expect(invoice.order).toMatchObject({
      amount: 99_000,
      packageSnapshot: { name: "Esensial", durationDays: 365 },
    });
    expect((await tenant.loadEntitlements(a.actor.workspaceId)).maxGuests).toBe(
      77,
    );
    // Dihapus: hak tetap dari salinan pesanan lunas.
    await billing.adminDeletePackage(admin, "esensial");
    expect((await tenant.loadEntitlements(a.actor.workspaceId)).maxGuests).toBe(
      150,
    );
    expect(
      (await billing.getBillingOverview(a.actor)).packages.map((p) => p.id),
    ).not.toContain("esensial");
    expect((await billing.getPlanSummary(a.actor)).packageName).toBe(
      "Esensial",
    );
    const audit = (await globalStore.readGlobal()).auditLog.map(
      (e) => e.action,
    );
    expect(audit).toEqual(
      expect.arrayContaining([
        "order.reject",
        "order.verify",
        "package.update",
        "package.delete",
      ]),
    );
  });

  it("tagihan yang lewat batas waktu menjadi kedaluwarsa saat dibaca", async () => {
    const { number: n } = await billing.startOrder(b.actor, "premium");
    await globalStore.mutateGlobal((g) => {
      g.orders.find((o) => o.number === n)!.expiresAt = new Date(
        Date.now() - 1000,
      ).toISOString();
    });
    const overview = await billing.getBillingOverview(b.actor);
    expect(overview.orders[0]).toMatchObject({ number: n, status: "expired" });
    expect(overview.openOrder).toBeNull();
    expect(
      await status(
        proofRequest().then((r) => billing.uploadProof(b.actor, n, r)),
      ),
    ).toBe(409);
    // Pelanggan dapat memesan lagi dengan tagihan baru.
    const next = await billing.startOrder(b.actor, "premium");
    expect(next.number).not.toBe(n);
  });

  it("pelanggan membatalkan tagihan sendiri dan admin membuat pesanan langsung lunas", async () => {
    await billing.cancelOrder(
      b.actor,
      (await billing.startOrder(b.actor, "premium")).number,
    );
    expect((await billing.getBillingOverview(b.actor)).openOrder).toBeNull();
    const list = await billing.adminListOrders(admin, { status: "cancelled" });
    expect(list.rows.every((r) => r.status === "cancelled")).toBe(true);
    const searched = await billing.adminListOrders(admin, { q: b.email });
    expect(searched.rows.length).toBeGreaterThan(0);
    expect(searched.rows.every((r) => r.customerEmail === b.email)).toBe(true);

    const open = await billing.startOrder(b.actor, "premium");
    const direct = await billing.adminCreateOrder(admin, {
      workspaceId: b.actor.workspaceId,
      packageId: "eksklusif",
      markPaid: "on",
    });
    expect(direct).toMatchObject({ status: "paid", createdByAdmin: true });
    // Tagihan terbuka pelanggan ditutup agar tidak ditransfer dua kali.
    expect((await billing.getInvoice(b.actor, open.number)).order.status).toBe(
      "cancelled",
    );
    expect((await billing.getBillingOverview(b.actor)).openOrder).toBeNull();
    expect(
      (await tenant.loadEntitlements(b.actor.workspaceId)).features.qrCheckin,
    ).toBe(true);
  });

  it("paket nonaktif tidak dijual, dan paket terakhir tidak bisa dihapus", async () => {
    await billing.adminSavePackage(
      admin,
      {
        id: "premium",
        name: "Premium",
        price: 199_000,
        durationDays: 365,
        features: "Satu",
        maxInvitations: 1,
        maxGuests: 500,
        maxMediaMB: 500,
        active: false,
      },
      "update",
    );
    expect(await status(billing.startOrder(a.actor, "premium"))).toBe(404);
    expect((await billing.listSellablePackages()).map((p) => p.id)).toEqual([
      "eksklusif",
    ]);
    await billing.adminDeletePackage(admin, "premium");
    expect(await status(billing.adminDeletePackage(admin, "eksklusif"))).toBe(
      409,
    );
  });

  it("pengaturan pembayaran divalidasi dan dipakai di tagihan", async () => {
    expect(
      await status(
        billing.adminSaveSettings(admin, {
          bankAccounts: [{ bank: "", holder: "A", number: "123" }],
          orderExpiryHours: 48,
        }),
      ),
    ).toBe(400);
    expect(await status(billing.adminSaveSettings(a.actor, {}))).toBe(403);
    await billing.adminSaveSettings(admin, {
      bankAccounts: [{ bank: "BCA", holder: "Temu", number: "1234567890" }],
      paymentNote: "Cantumkan nomor tagihan.",
      orderExpiryHours: 24,
    });
    const { number: n } = await billing.startOrder(a.actor, "eksklusif");
    const invoice = await billing.getInvoice(a.actor, n);
    expect(invoice.bankAccounts).toEqual([
      { bank: "BCA", holder: "Temu", number: "1234567890" },
    ]);
    expect(
      Date.parse(invoice.order.expiresAt) - Date.parse(invoice.order.createdAt),
    ).toBe(24 * 3_600_000);
  });
});

describe("masa tenggang undangan setelah paket berakhir", () => {
  const day = 86_400_000;
  const plan = (days: number) => ({
    id: "pro",
    status: "active" as const,
    expiresAt: new Date(Date.now() + days * day).toISOString(),
  });

  it("tetap tampil 30 hari, lalu nonaktif untuk tamu, dan kembali setelah diperpanjang", async () => {
    const c = await support.registerCustomer("Masa Tenggang");
    await support.setPlan(c.actor.workspaceId, plan(5));
    await service.publishInvitation(c.actor, c.slug);

    expect(await service.resolvePublic(c.slug)).not.toBeNull();
    expect(await service.getInvitationAccess(c.slug)).toMatchObject({
      inactive: false,
    });

    // Berakhir 10 hari lalu: masa tenggang, undangan masih tampil dan menerima RSVP.
    await support.setPlan(c.actor.workspaceId, plan(-10));
    expect(await service.resolvePublic(c.slug)).not.toBeNull();
    expect((await service.getInvitationAccess(c.slug)).inactive).toBe(false);
    await service.submitRsvp(
      c.slug,
      { name: "Tamu", attendance: "attending", attendeeCount: 1 },
      "v1",
    );

    // Berakhir 31 hari lalu: tidak aktif untuk tamu; data tidak hilang.
    await support.setPlan(c.actor.workspaceId, plan(-31));
    expect(await service.resolvePublic(c.slug)).toBeNull();
    expect(await service.getPublished(c.slug)).toBeNull();
    expect(await service.getWishes(c.slug)).toEqual([]);
    const access = await service.getInvitationAccess(c.slug);
    expect(access.inactive).toBe(true);
    expect(access.invitation?.status).toBe("published");
    await expect(
      service.submitRsvp(
        c.slug,
        { name: "Tamu", attendance: "attending", attendeeCount: 1 },
        "v2",
      ),
    ).rejects.toMatchObject({ status: 404 });
    // Pemilik tetap melihat undangannya di dashboard.
    expect((await service.getDashboardData(c.actor)).invitation.slug).toBe(
      c.slug,
    );

    // Perpanjang: aktif lagi.
    await support.setPlan(c.actor.workspaceId, plan(30));
    expect(await service.resolvePublic(c.slug)).not.toBeNull();
    expect((await service.getInvitationAccess(c.slug)).inactive).toBe(false);
  });
});
