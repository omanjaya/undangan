import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";

let service: typeof import("./services");
let guests: typeof import("./guests");
let media: typeof import("./media");
let budget: typeof import("./budget");
let auth: typeof import("./auth");
let support: typeof import("./test-support");
let store: typeof import("../modules/invitations/infrastructure/store");
let globalStore: typeof import("../modules/invitations/infrastructure/global-store");
let directory: string;

type Customer = Awaited<
  ReturnType<typeof import("./test-support").registerCustomer>
>;
let a: Customer;
let b: Customer;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "temu-tenancy-"));
  process.env.DATA_DIR = directory;
  process.env.UPLOAD_DIR = join(directory, "uploads");
  delete process.env.DATABASE_URL;
  service = await import("./services");
  guests = await import("./guests");
  media = await import("./media");
  budget = await import("./budget");
  auth = await import("./auth");
  support = await import("./test-support");
  store = await import("../modules/invitations/infrastructure/store");
  globalStore =
    await import("../modules/invitations/infrastructure/global-store");
  a = await support.registerCustomer("Pelanggan A");
  b = await support.registerCustomer("Pelanggan B");
  for (const c of [a, b])
    await support.setPlan(c.actor.workspaceId, { id: "pro", status: "active" });
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

const png = () =>
  sharp({
    create: { width: 8, height: 8, channels: 3, background: "#abc" },
  })
    .png()
    .toBuffer();
const upload = (bytes: Uint8Array) =>
  new Request("http://localhost/api/media", {
    method: "POST",
    headers: { "content-type": "image/png", "x-file-name": "a.png" },
    body: bytes as unknown as BodyInit,
  });

describe("isolasi antar pelanggan", () => {
  it("dashboard hanya memuat ruang kerja sendiri", async () => {
    const dataA = await service.getDashboardData(a.actor);
    const dataB = await service.getDashboardData(b.actor);
    expect(dataA.invitations.map((i) => i.slug)).toEqual([a.slug]);
    expect(dataB.invitations.map((i) => i.slug)).toEqual([b.slug]);
    expect(a.actor.workspaceId).not.toBe(b.actor.workspaceId);
  });

  it("pelanggan lain tidak dapat membaca atau mengubah undangan", async () => {
    const dataA = await service.getDashboardData(a.actor);
    const content = dataA.invitation.draft;
    const gagal = { status: 404 };
    await expect(
      service.getDashboardData(b.actor, a.slug),
    ).rejects.toMatchObject(gagal);
    await expect(
      service.saveDraft(b.actor, {
        slug: a.slug,
        lockVersion: dataA.invitation.lockVersion,
        content,
      }),
    ).rejects.toMatchObject(gagal);
    await expect(
      service.publishInvitation(b.actor, a.slug),
    ).rejects.toMatchObject(gagal);
    await expect(
      service.unpublishInvitation(b.actor, a.slug),
    ).rejects.toMatchObject(gagal);
    await expect(
      service.renameInvitation(b.actor, a.slug, "curi-slug"),
    ).rejects.toMatchObject(gagal);
    await expect(
      service.deleteInvitation(b.actor, a.slug),
    ).rejects.toMatchObject(gagal);
    await expect(service.exportRsvpCsv(b.actor, a.slug)).rejects.toMatchObject(
      gagal,
    );
    await expect(
      service.exportWishesCsv(b.actor, a.slug),
    ).rejects.toMatchObject(gagal);
    // Milik A tetap utuh.
    expect((await service.getInvitation(a.slug))?.slug).toBe(a.slug);
  });

  it("RSVP dan ucapan publik masuk ke pemilik yang benar", async () => {
    await service.publishInvitation(a.actor, a.slug);
    await service.submitRsvp(
      a.slug,
      {
        name: "Tamu Untuk A",
        attendance: "attending",
        attendeeCount: 1,
        message: "Selamat A",
      },
      "visitor-a",
    );
    expect((await service.getDashboardData(a.actor)).rsvps).toHaveLength(1);
    expect((await service.getDashboardData(b.actor)).rsvps).toHaveLength(0);
    const wishA = (await service.getDashboardData(a.actor)).wishes[0];
    await expect(
      service.moderateWish(b.actor, wishA.id, "approved"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(service.deleteWish(b.actor, wishA.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      service.replyToWish(b.actor, wishA.id, "x"),
    ).rejects.toMatchObject({ status: 404 });
    await service.moderateWish(a.actor, wishA.id, "approved");
    expect(await service.getWishes(a.slug)).toHaveLength(1);
  });

  it("tamu, kode check-in, dan anggaran terpisah", async () => {
    const tamu = await guests.addGuest(a.actor, a.slug, { name: "Tamu A" });
    await expect(guests.getGuests(b.actor, a.slug)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      guests.updateGuest(b.actor, tamu.id, { name: "Curi" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(guests.removeGuest(b.actor, tamu.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(guests.markGuestSent(b.actor, tamu.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(guests.undoCheckIn(b.actor, tamu.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      guests.checkInGuest(b.actor, b.slug, tamu.code),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      guests.checkInGuest(b.actor, a.slug, tamu.code),
    ).rejects.toMatchObject({ status: 404 });
    expect((await guests.getGuests(b.actor, b.slug)).guests).toHaveLength(0);
    // Halaman tamu publik tetap menemukan tamu lewat slug pemiliknya saja.
    expect(await guests.getGuestForPage(a.slug, tamu.code)).not.toBeNull();
    expect(await guests.getGuestForPage(b.slug, tamu.code)).toBeNull();
    expect(await guests.recordGuestOpen(b.slug, tamu.code)).toBe(false);

    await budget.addBudgetItem(a.actor, { name: "Pos A", estimate: 100 });
    expect((await budget.getBudget(b.actor)).items).toHaveLength(0);
  });

  it("media pribadi hanya untuk ruang kerja pemilik; yang terbit terbuka untuk publik", async () => {
    const asset = await media.uploadMedia(a.actor, upload(await png()));
    expect(await media.listMedia(a.actor)).toHaveLength(1);
    expect(await media.listMedia(b.actor)).toHaveLength(0);
    const filename = asset.url.split("/").pop()!;
    const get = (actor: typeof a.actor | null) =>
      media.serveMedia(
        filename,
        new Request("http://localhost/media/x"),
        actor,
      );
    expect((await get(a.actor)).status).toBe(200);
    await expect(get(b.actor)).rejects.toMatchObject({ status: 404 });
    await expect(get(null)).rejects.toMatchObject({ status: 404 });

    // B tidak bisa menerbitkan draf yang menunjuk media milik A.
    const dataB = await service.getDashboardData(b.actor);
    await service.saveDraft(b.actor, {
      slug: b.slug,
      lockVersion: dataB.invitation.lockVersion,
      content: { ...dataB.invitation.draft, heroPhoto: asset.url },
    });
    await expect(service.publishInvitation(b.actor, b.slug)).rejects.toThrow(
      "Media",
    );

    // A menerbitkan dengan media itu: publik boleh membaca, B tetap lewat jalur publik.
    const dataA = await service.getDashboardData(a.actor);
    await service.saveDraft(a.actor, {
      slug: a.slug,
      lockVersion: dataA.invitation.lockVersion,
      content: { ...dataA.invitation.draft, heroPhoto: asset.url },
    });
    await service.publishInvitation(a.actor, a.slug);
    expect((await get(null)).status).toBe(200);
  });
});

describe("slug unik secara global", () => {
  it("menolak slug yang dipakai pelanggan lain, termasuk alamat lama", async () => {
    await expect(
      service.createInvitation(b.actor, { slug: a.slug }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.renameInvitation(b.actor, b.slug, a.slug),
    ).rejects.toMatchObject({ status: 409 });

    const baru = `${a.slug}-baru`;
    await service.renameInvitation(a.actor, a.slug, baru);
    // Alamat lama A masih dialihkan ke A dan tidak bisa diambil B.
    expect((await service.getInvitation(a.slug))?.slug).toBe(baru);
    await expect(
      service.createInvitation(b.actor, { slug: a.slug }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.renameInvitation(b.actor, b.slug, a.slug),
    ).rejects.toMatchObject({ status: 409 });
    // Penolakan tidak meninggalkan sisa pemesanan.
    expect((await service.getInvitation(b.slug))?.slug).toBe(b.slug);
    a.slug = baru;
  });

  it("melepas slug saat undangan dihapus", async () => {
    const tambahan = `tambahan-${Date.now().toString(36)}`;
    await service.createInvitation(a.actor, { slug: tambahan });
    await expect(
      service.createInvitation(b.actor, { slug: tambahan }),
    ).rejects.toMatchObject({ status: 409 });
    await service.deleteInvitation(a.actor, tambahan);
    expect(await service.getInvitation(tambahan)).toBeNull();
    const diambil = await service.createInvitation(b.actor, { slug: tambahan });
    expect(diambil.workspaceId).toBe(b.actor.workspaceId);
    await service.deleteInvitation(b.actor, tambahan);
  });

  it("memesan ulang slug yatim yang sudah lama, tetapi tidak yang segar", async () => {
    const yatim = "slug-yatim-uji";
    const hidup = "slug-segar-uji";
    await globalStore.mutateGlobal((g) => {
      g.slugs[yatim] = {
        workspaceId: a.actor.workspaceId,
        invitationId: "tidak-ada",
        createdAt: 1,
      };
      g.slugs[hidup] = {
        workspaceId: a.actor.workspaceId,
        invitationId: "tidak-ada",
        createdAt: Date.now(),
      };
    });
    await expect(
      service.createInvitation(b.actor, { slug: hidup }),
    ).rejects.toMatchObject({ status: 409 });
    const diambil = await service.createInvitation(b.actor, { slug: yatim });
    expect(diambil.slug).toBe(yatim);
    await service.deleteInvitation(b.actor, yatim);
  });

  it("nama prototipe tidak dianggap slug yang sudah ada", async () => {
    expect(await service.getInvitation("constructor")).toBeNull();
    const dibuat = await service.createInvitation(b.actor, {
      slug: "constructor",
    });
    expect(dibuat.slug).toBe("constructor");
    await service.deleteInvitation(b.actor, "constructor");
  });
});

describe("pendaftaran", () => {
  it("membuat akun pelanggan, ruang kerja uji coba, dan undangan awal", async () => {
    const baru = await support.registerCustomer("Dewi", "Dewi@Example.TEST");
    const global = await globalStore.readGlobal();
    const user = global.users.find((u) => u.id === baru.actor.userId)!;
    expect(user.email).toBe("dewi@example.test");
    expect(user.role).toBe("customer");
    expect(user.status).toBe("active");
    expect(user.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(user.passwordHash).not.toContain("kata-sandi-aman");
    const workspace = global.workspaces.find(
      (w) => w.id === baru.actor.workspaceId,
    )!;
    expect(workspace.ownerUserId).toBe(user.id);
    expect(workspace.plan).toMatchObject({ id: "trial", status: "trial" });
    const state = await store.readWorkspace(workspace.id);
    expect(state.invitations).toHaveLength(1);
    const [starter] = state.invitations;
    expect(starter.status).toBe("draft");
    expect(starter.slug).toMatch(/^undangan-[a-f0-9]{8}$/);
    expect(starter.draft.gift.accounts).toHaveLength(0);
    expect(starter.draft.bride).not.toBe("Amara");
    expect(global.slugs[starter.slug]).toMatchObject({
      workspaceId: workspace.id,
      invitationId: starter.id,
    });
  });

  it("menolak email ganda (tanpa membedakan huruf besar) dan masukan tidak sah", async () => {
    const asli = await support.registerCustomer("Ani", "ani@example.test");
    await expect(
      auth.register({
        name: "Ani Lagi",
        email: "ANI@example.test",
        password: "kata-sandi-aman",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      auth.register({
        name: "X",
        email: "x@example.test",
        password: "kata-sandi-aman",
      }),
    ).rejects.toThrow();
    await expect(
      auth.register({
        name: "Budi",
        email: "bukan-email",
        password: "kata-sandi-aman",
      }),
    ).rejects.toThrow();
    await expect(
      auth.register({
        name: "Budi",
        email: "budi@example.test",
        password: "pendek",
      }),
    ).rejects.toThrow("8");
    // Pendaftaran gagal tidak meninggalkan akun atau ruang kerja baru.
    const global = await globalStore.readGlobal();
    expect(
      global.users.filter((u) => u.email === "ani@example.test"),
    ).toHaveLength(1);
    expect(global.users.some((u) => u.email === "budi@example.test")).toBe(
      false,
    );
    expect(asli.actor.workspaceId).toBeTruthy();
  });
});

describe("login dan sesi", () => {
  const cookie = (token: string) =>
    new Request("http://localhost", {
      headers: { cookie: `invitation_session=${token}` },
    });

  it("masuk dengan kata sandi benar menghasilkan aktor dengan ruang kerjanya", async () => {
    const token = await auth.login(a.email.toUpperCase(), a.password);
    const actor = await auth.getActor(cookie(token));
    expect(actor).toMatchObject({
      userId: a.actor.userId,
      workspaceId: a.actor.workspaceId,
      role: "customer",
      email: a.email,
    });
    const global = await globalStore.readGlobal();
    expect(
      global.users.find((u) => u.id === a.actor.userId)?.lastLoginAt,
    ).toBeTruthy();
    // Token mentah tidak pernah disimpan.
    expect(JSON.stringify(global.sessions)).not.toContain(token);
  });

  it("kata sandi salah dan email tak dikenal menghasilkan galat yang sama", async () => {
    const salah = await auth.login(a.email, "salah-total").catch((e) => e);
    const asing = await auth
      .login("tidak-ada@example.test", "salah-total")
      .catch((e) => e);
    expect(salah).toMatchObject({ status: 401 });
    expect(asing).toMatchObject({ status: 401 });
    expect(salah.message).toBe(asing.message);
  });

  it("menolak akun yang ditangguhkan, juga untuk sesi yang sudah ada", async () => {
    const c = await support.registerCustomer("Tangguh");
    const token = await auth.login(c.email, c.password);
    expect(await auth.getActor(cookie(token))).not.toBeNull();
    await globalStore.mutateGlobal((g) => {
      g.users.find((u) => u.id === c.actor.userId)!.status = "suspended";
    });
    await expect(auth.login(c.email, c.password)).rejects.toMatchObject({
      status: 403,
    });
    // Kata sandi salah tetap 401, tidak membocorkan status akun.
    await expect(auth.login(c.email, "salah-total")).rejects.toMatchObject({
      status: 401,
    });
    expect(await auth.getActor(cookie(token))).toBeNull();
  });

  it("logout mencabut sesi dan sesi kedaluwarsa tidak berlaku", async () => {
    const token = await auth.login(b.email, b.password);
    expect(await auth.getActor(cookie(token))).not.toBeNull();
    await auth.logout(cookie(token));
    expect(await auth.getActor(cookie(token))).toBeNull();

    const lagi = await auth.login(b.email, b.password);
    await globalStore.mutateGlobal((g) => {
      for (const s of g.sessions) s.expiresAt = Date.now() - 1;
    });
    expect(await auth.getActor(cookie(lagi))).toBeNull();
  });

  it("setPassword mengganti kata sandi dan mencabut sesi lama", async () => {
    const c = await support.registerCustomer("Sandi");
    const lama = await auth.login(c.email, c.password);
    await expect(auth.setPassword(c.actor.userId, "pendek")).rejects.toThrow();
    await auth.setPassword(c.actor.userId, "sandi-baru-yang-aman");
    expect(await auth.getActor(cookie(lama))).toBeNull();
    await expect(auth.login(c.email, c.password)).rejects.toMatchObject({
      status: 401,
    });
    expect(await auth.login(c.email, "sandi-baru-yang-aman")).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it("requireAdmin hanya meloloskan admin", async () => {
    expect(() => auth.requireAdmin(null)).toThrow("masuk");
    expect(() => auth.requireAdmin(a.actor)).toThrow("admin");
    expect(auth.requireAdmin(support.adminActor())).toBeTruthy();
  });
});

describe("batas paket (entitlements)", () => {
  it("paket uji coba boleh menyusun tetapi tidak menerbitkan", async () => {
    const c = await support.registerCustomer("Uji Coba");
    await expect(
      service.publishInvitation(c.actor, c.slug),
    ).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("paket"),
    });
    expect((await service.getInvitation(c.slug))?.status).toBe("draft");
    // Satu undangan saja.
    await expect(
      service.createInvitation(c.actor, { slug: `${c.slug}-dua` }),
    ).rejects.toThrow("paket");
    expect(await service.getInvitation(`${c.slug}-dua`)).toBeNull();

    await support.setPlan(c.actor.workspaceId, { id: "pro", status: "active" });
    await service.publishInvitation(c.actor, c.slug);
    expect((await service.getInvitation(c.slug))?.status).toBe("published");
    // Paket berakhir: tidak bisa menerbitkan ulang.
    await support.setPlan(c.actor.workspaceId, {
      id: "pro",
      status: "active",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    await expect(
      service.publishInvitation(c.actor, c.slug),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("membatasi jumlah tamu per undangan menurut paket", async () => {
    const c = await support.registerCustomer("Tamu Banyak");
    for (let i = 0; i < 50; i++)
      await guests.addGuest(c.actor, c.slug, { name: `Tamu ${i}` });
    await expect(
      guests.addGuest(c.actor, c.slug, { name: "Tamu 51" }),
    ).rejects.toThrow("paket");
    const impor = await guests.importGuests(
      c.actor,
      c.slug,
      "Tamu Impor Satu\nTamu Impor Dua",
    );
    expect(impor.added).toBe(0);
    expect(impor.errors.some((e) => e.message.includes("paket"))).toBe(true);
    await support.setPlan(c.actor.workspaceId, { id: "pro", status: "active" });
    await guests.addGuest(c.actor, c.slug, { name: "Tamu 51" });
  });

  it("membatasi total media menurut paket", async () => {
    const c = await support.registerCustomer("Media Penuh");
    await store.mutateWorkspace(c.actor.workspaceId, (state) => {
      state.assets!.push({
        id: "11111111-1111-1111-1111-111111111111",
        workspaceId: c.actor.workspaceId,
        url: "/media/11111111-1111-1111-1111-111111111111.webp",
        filename: "11111111-1111-1111-1111-111111111111.webp",
        kind: "image",
        name: "besar",
        bytes: 200 * 1024 * 1024,
        mime: "image/webp",
        createdAt: new Date().toISOString(),
      });
    });
    await expect(
      media.uploadMedia(c.actor, upload(await png())),
    ).rejects.toMatchObject({
      status: 413,
      message: expect.stringContaining("paket"),
    });
    await support.setPlan(c.actor.workspaceId, { id: "pro", status: "active" });
    expect((await media.uploadMedia(c.actor, upload(await png()))).kind).toBe(
      "image",
    );
  });
});
