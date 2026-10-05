import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { APIRoute } from "astro";

let admin: typeof import("./admin");
let auth: typeof import("./auth");
let support: typeof import("./test-support");
let globalStore: typeof import("../modules/invitations/infrastructure/global-store");
let store: typeof import("../modules/invitations/infrastructure/store");
let directory: string;
let adminActor: import("./services").Actor;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "temu-admin-"));
  process.env.DATA_DIR = directory;
  process.env.UPLOAD_DIR = join(directory, "uploads");
  delete process.env.DATABASE_URL;
  process.env.OWNER_EMAIL = "admin-uji@example.test";
  process.env.OWNER_PASSWORD = "kata-sandi-admin-uji";
  admin = await import("./admin");
  auth = await import("./auth");
  support = await import("./test-support");
  globalStore =
    await import("../modules/invitations/infrastructure/global-store");
  store = await import("../modules/invitations/infrastructure/store");
  const global = await globalStore.readGlobal();
  const user = global.users.find((u) => u.role === "admin")!;
  adminActor = {
    userId: user.id,
    workspaceId: global.workspaces.find((w) => w.ownerUserId === user.id)!.id,
    email: user.email,
    name: user.name,
    role: "admin",
  };
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

const audit = async () => (await globalStore.readGlobal()).auditLog;
const workspaceOf = async (userId: string) =>
  (await globalStore.readGlobal()).workspaces.find(
    (w) => w.ownerUserId === userId,
  )!;
const cookieRequest = (token: string, url = "http://localhost/x") =>
  new Request(url, {
    method: "POST",
    headers: {
      cookie: `invitation_session=${token}`,
      origin: "http://localhost",
    },
  });

describe("penangguhan", () => {
  it("menangguhkan, mencabut sesi, memblokir login, lalu mengaktifkan kembali", async () => {
    const c = await support.registerCustomer("Tangguh");
    const token = await auth.createSession(c.actor.userId);
    expect(await auth.getActor(cookieRequest(token))).not.toBeNull();

    await admin.setCustomerStatus(adminActor, c.actor.userId, "suspended");
    expect(await auth.getActor(cookieRequest(token))).toBeNull();
    const g = await globalStore.readGlobal();
    expect(g.sessions.some((s) => s.userId === c.actor.userId)).toBe(false);
    await expect(auth.login(c.email, c.password)).rejects.toMatchObject({
      status: 403,
    });

    await admin.setCustomerStatus(adminActor, c.actor.userId, "active");
    await expect(auth.login(c.email, c.password)).resolves.toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect((await audit()).map((e) => e.action)).toEqual(
      expect.arrayContaining(["user.suspend", "user.activate"]),
    );
  });

  it("undangan terbit tetap dapat dibuka tamu saat akun ditangguhkan", async () => {
    const c = await support.registerCustomer("Tetap Tampil");
    await support.setPlan(c.actor.workspaceId, {
      id: "premium",
      status: "active",
    });
    const service = await import("./services");
    await service.publishInvitation(c.actor, c.slug);
    await admin.setCustomerStatus(adminActor, c.actor.userId, "suspended");
    await expect(service.resolvePublic(c.slug)).resolves.toBeTruthy();
  });

  it("tidak dapat menangguhkan admin", async () => {
    await expect(
      admin.setCustomerStatus(adminActor, adminActor.userId, "suspended"),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("penyamaran", () => {
  it("memulai, menandai sesi, lalu mengakhiri dan memulihkan sesi admin", async () => {
    const c = await support.registerCustomer("Disamar");
    const adminToken = await auth.createSession(adminActor.userId);
    const token = await admin.startImpersonation(
      adminActor,
      c.actor.userId,
      adminToken,
    );

    const acting = await auth.getActor(cookieRequest(token));
    expect(acting).toMatchObject({
      userId: c.actor.userId,
      role: "customer",
      impersonatorUserId: adminActor.userId,
    });
    // Sesi admin lama sudah dicabut; admin tidak ikut aktif sebagai pelanggan.
    expect(await auth.getActor(cookieRequest(adminToken))).toBeNull();
    const session = (await globalStore.readGlobal()).sessions.find(
      (s) => s.userId === c.actor.userId,
    );
    expect(session?.impersonatorUserId).toBe(adminActor.userId);

    const ended = await admin.endImpersonation(cookieRequest(token));
    expect(ended.redirect).toBe(`/admin/pelanggan/${c.actor.userId}`);
    expect(await auth.getActor(cookieRequest(token))).toBeNull();
    const back = await auth.getActor(cookieRequest(ended.token));
    expect(back).toMatchObject({ userId: adminActor.userId, role: "admin" });
    expect(back?.impersonatorUserId).toBeUndefined();

    const actions = (await audit())
      .filter((e) => e.targetId === c.actor.userId)
      .map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "user.impersonate.start",
        "user.impersonate.end",
      ]),
    );
  });

  it("tidak dapat menyamar sebagai admin, akun ditangguhkan, atau tanpa peran admin", async () => {
    await expect(
      admin.startImpersonation(adminActor, adminActor.userId),
    ).rejects.toMatchObject({ status: 403 });
    const c = await support.registerCustomer("Tertangguh");
    await admin.setCustomerStatus(adminActor, c.actor.userId, "suspended");
    await expect(
      admin.startImpersonation(adminActor, c.actor.userId),
    ).rejects.toMatchObject({ status: 409 });
    const other = await support.registerCustomer("Biasa");
    await expect(
      admin.startImpersonation(c.actor, other.actor.userId),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("endImpersonation menolak sesi biasa", async () => {
    const c = await support.registerCustomer("Biasa 2");
    const token = await auth.createSession(c.actor.userId);
    await expect(
      admin.endImpersonation(cookieRequest(token)),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("paket manual", () => {
  it("memasang paket dengan durasi paket, tanggal berakhir, dan kembali ke uji coba", async () => {
    const c = await support.registerCustomer("Paket");
    await admin.setManualPlan(adminActor, c.actor.userId, {
      mode: "package",
      packageId: "premium",
      durationDays: 30,
    });
    let ws = await workspaceOf(c.actor.userId);
    expect(ws.plan).toMatchObject({ id: "premium", status: "active" });
    const days = (Date.parse(ws.plan.expiresAt!) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);

    await admin.setManualPlan(adminActor, c.actor.userId, {
      mode: "package",
      packageId: "eksklusif",
      expiresOn: "2099-12-31",
    });
    ws = await workspaceOf(c.actor.userId);
    expect(ws.plan.id).toBe("eksklusif");
    expect(ws.plan.expiresAt).toBe("2099-12-31T15:59:59.000Z");

    await admin.setManualPlan(adminActor, c.actor.userId, { mode: "trial" });
    expect((await workspaceOf(c.actor.userId)).plan).toEqual({
      id: "trial",
      status: "trial",
    });
    expect(
      (await audit()).filter((e) => e.action === "user.plan").length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("menolak paket tak dikenal dan tanggal lampau", async () => {
    const c = await support.registerCustomer("Paket Salah");
    await expect(
      admin.setManualPlan(adminActor, c.actor.userId, {
        mode: "package",
        packageId: "nope",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      admin.setManualPlan(adminActor, c.actor.userId, {
        mode: "package",
        packageId: "premium",
        expiresOn: "2020-01-01",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("memakai global.packages bila ada", async () => {
    const c = await support.registerCustomer("Paket Kustom");
    await globalStore.mutateGlobal((g) => {
      g.packages = [
        {
          id: "khusus",
          name: "Khusus",
          tagline: "",
          price: 1,
          durationDays: 10,
          features: [],
          limits: { maxInvitations: 1, maxGuests: 1, maxMediaMB: 1 },
          flags: {
            music: false,
            video: false,
            gift: false,
            guestList: false,
            qrCheckin: false,
            customSlug: false,
            removeBranding: false,
          },
          active: true,
          sortOrder: 0,
          updatedAt: new Date().toISOString(),
        },
      ];
    });
    try {
      await admin.setManualPlan(adminActor, c.actor.userId, {
        mode: "package",
        packageId: "khusus",
      });
      expect((await workspaceOf(c.actor.userId)).plan.id).toBe("khusus");
      await expect(
        admin.setManualPlan(adminActor, c.actor.userId, {
          mode: "package",
          packageId: "premium",
        }),
      ).rejects.toMatchObject({ status: 400 });
    } finally {
      await globalStore.mutateGlobal((g) => {
        g.packages = [];
      });
    }
  });
});

describe("kata sandi sementara", () => {
  it("mengganti kata sandi dan mencabut sesi lama", async () => {
    const c = await support.registerCustomer("Reset");
    const token = await auth.createSession(c.actor.userId);
    const { password } = await admin.resetCustomerPassword(
      adminActor,
      c.actor.userId,
    );
    expect(await auth.getActor(cookieRequest(token))).toBeNull();
    await expect(auth.login(c.email, c.password)).rejects.toMatchObject({
      status: 401,
    });
    await expect(auth.login(c.email, password)).resolves.toBeTruthy();
  });
});

describe("akun klien", () => {
  it("membuat akun dengan kata sandi sementara, paket, dan pesan WhatsApp", async () => {
    const result = await admin.createClientAccount(
      adminActor,
      {
        name: "Klien Jasa",
        email: "Klien@Example.Test",
        phone: "0812345678",
        packageId: "premium",
      },
      "https://temu.test/login",
    );
    expect(result.email).toBe("klien@example.test");
    expect(result.message).toContain(result.password);
    expect(result.message).toContain("https://temu.test/login");
    expect(result.whatsappUrl).toContain("wa.me/62812345678");
    await expect(
      auth.login("klien@example.test", result.password),
    ).resolves.toBeTruthy();
    const ws = await workspaceOf(result.userId);
    expect(ws.plan).toMatchObject({ id: "premium", status: "active" });
    const state = await store.readWorkspace(ws.id);
    expect(state.invitations).toHaveLength(1);
  });

  it("menolak email ganda, paket tak dikenal, dan non-admin", async () => {
    await expect(
      admin.createClientAccount(
        adminActor,
        { name: "Ganda", email: "klien@example.test" },
        "u",
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      admin.createClientAccount(
        adminActor,
        { name: "Klien X", email: "x1@example.test", packageId: "nope" },
        "u",
      ),
    ).rejects.toMatchObject({ status: 400 });
    const c = await support.registerCustomer("Penyusup");
    await expect(
      admin.createClientAccount(
        c.actor,
        { name: "Klien Y", email: "y1@example.test" },
        "u",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("hapus pelanggan", () => {
  it("menghapus semua data pelanggan, menyimpan pesanan, dan tidak menyentuh yang lain", async () => {
    const victim = await support.registerCustomer("Korban");
    const bystander = await support.registerCustomer("Penonton");
    const adminBefore = await store.readWorkspace(adminActor.workspaceId);

    const uploads = join(directory, "uploads");
    await mkdir(uploads, { recursive: true });
    const assets = (owner: string, id: string) => ({
      id,
      workspaceId: owner,
      url: `/media/${id}.webp`,
      filename: `${id}.webp`,
      kind: "image" as const,
      name: "a.webp",
      bytes: 1,
      mime: "image/webp",
      createdAt: new Date().toISOString(),
    });
    for (const [c, id] of [
      [victim, "aset-korban"],
      [bystander, "aset-penonton"],
    ] as const) {
      await writeFile(join(uploads, `${id}.webp`), "x");
      await store.mutateWorkspace(c.actor.workspaceId, (s) => {
        (s.assets ??= []).push(assets(c.actor.workspaceId, id));
      });
      await globalStore.mutateGlobal((g) => {
        g.mediaIndex[id] = c.actor.workspaceId;
      });
    }
    await globalStore.mutateGlobal((g) => {
      g.orders.push({
        id: "order-korban",
        number: "TMU-1",
        workspaceId: victim.actor.workspaceId,
        userId: victim.actor.userId,
        total: 1000,
        status: "paid",
      } as never);
    });
    await auth.createSession(victim.actor.userId);

    await expect(
      admin.deleteCustomer(
        adminActor,
        victim.actor.userId,
        "salah@example.test",
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (await globalStore.readGlobal()).users.some(
        (u) => u.id === victim.actor.userId,
      ),
    ).toBe(true);

    const result = await admin.deleteCustomer(
      adminActor,
      victim.actor.userId,
      victim.email.toUpperCase(),
    );
    expect(result.removedMedia).toBe(1);

    const g = await globalStore.readGlobal();
    expect(g.users.some((u) => u.id === victim.actor.userId)).toBe(false);
    expect(g.sessions.some((s) => s.userId === victim.actor.userId)).toBe(
      false,
    );
    expect(g.workspaces.some((w) => w.id === victim.actor.workspaceId)).toBe(
      false,
    );
    expect(g.slugs[victim.slug]).toBeUndefined();
    expect(g.mediaIndex["aset-korban"]).toBeUndefined();
    expect(await store.tryReadWorkspace(victim.actor.workspaceId)).toBeNull();
    expect(existsSync(join(uploads, "aset-korban.webp"))).toBe(false);
    expect(
      await (await import("./services")).resolvePublic(victim.slug),
    ).toBeNull();

    // Pesanan tetap ada untuk pembukuan.
    const order = g.orders.find((o) => o.id === "order-korban");
    expect(order?.workspaceId).toBe(victim.actor.workspaceId);
    expect(order?.deletedCustomer).toMatchObject({ email: victim.email });
    expect(
      g.auditLog.some(
        (e) => e.action === "user.delete" && e.targetId === victim.actor.userId,
      ),
    ).toBe(true);

    // Pelanggan lain dan admin utuh.
    expect(g.users.some((u) => u.id === bystander.actor.userId)).toBe(true);
    expect(g.slugs[bystander.slug]).toBeTruthy();
    expect(g.mediaIndex["aset-penonton"]).toBe(bystander.actor.workspaceId);
    expect(existsSync(join(uploads, "aset-penonton.webp"))).toBe(true);
    expect(
      (await store.readWorkspace(bystander.actor.workspaceId)).assets,
    ).toHaveLength(1);
    expect(await store.readWorkspace(adminActor.workspaceId)).toEqual(
      adminBefore,
    );
    expect((await readdir(uploads)).sort()).toContain("aset-penonton.webp");
  });

  it("tidak pernah menghapus admin atau menerima non-admin", async () => {
    await expect(
      admin.deleteCustomer(adminActor, adminActor.userId, adminActor.email),
    ).rejects.toMatchObject({ status: 403 });
    const c = await support.registerCustomer("Calon");
    const d = await support.registerCustomer("Penghapus");
    await expect(
      admin.deleteCustomer(d.actor, c.actor.userId, c.email),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await globalStore.readGlobal()).users.some(
        (u) => u.id === c.actor.userId,
      ),
    ).toBe(true);
  });
});

describe("ringkasan dan daftar", () => {
  it("dapat dibaca admin dan menghitung pelanggan, ditolak non-admin", async () => {
    const overview = await admin.getOverview(adminActor);
    expect(overview.totalCustomers).toBeGreaterThan(0);
    const { rows } = await admin.getCustomerList(adminActor);
    expect(rows.every((r) => r.user.role === "customer")).toBe(true);
    const c = await support.registerCustomer("Intip");
    await expect(admin.getOverview(c.actor)).rejects.toMatchObject({
      status: 403,
    });
    await expect(admin.getCustomerList(null)).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      admin.getCustomerDetail(c.actor, c.actor.userId),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("detail memuat undangan, pesanan, dan jejak audit pelanggan", async () => {
    const c = await support.registerCustomer("Detail");
    await admin.setCustomerStatus(adminActor, c.actor.userId, "suspended");
    const detail = await admin.getCustomerDetail(adminActor, c.actor.userId);
    expect(detail.invitations.map((i) => i.slug)).toEqual([c.slug]);
    expect(detail.audit.some((e) => e.action === "user.suspend")).toBe(true);
    await expect(
      admin.getCustomerDetail(adminActor, adminActor.userId),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      admin.getCustomerDetail(adminActor, "tidak-ada"),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("otorisasi endpoint admin", () => {
  const routes = [
    ["../pages/api/admin/pelanggan/index", {}],
    ["../pages/api/admin/pelanggan/[userId]/status", { userId: "x" }],
    ["../pages/api/admin/pelanggan/[userId]/impersonate", { userId: "x" }],
    ["../pages/api/admin/pelanggan/[userId]/plan", { userId: "x" }],
    ["../pages/api/admin/pelanggan/[userId]/password", { userId: "x" }],
    ["../pages/api/admin/pelanggan/[userId]/delete", { userId: "x" }],
  ] as const;

  const call = async (
    file: string,
    params: Record<string, string>,
    token?: string,
  ) => {
    const { POST } = (await import(/* @vite-ignore */ file)) as {
      POST: APIRoute;
    };
    const headers: Record<string, string> = {
      origin: "http://localhost",
      "content-type": "application/x-www-form-urlencoded",
    };
    if (token) headers.cookie = `invitation_session=${token}`;
    const response = await POST({
      request: new Request("http://localhost/api/x", {
        method: "POST",
        headers,
        body: "status=suspended&confirm=x&name=Y&email=y@example.test",
      }),
      params,
    } as never);
    return response.status;
  };

  it("pelanggan mendapat 403 dan anonim 401 di setiap endpoint", async () => {
    const c = await support.registerCustomer("Penyusup 2");
    const token = await auth.createSession(c.actor.userId);
    for (const [file, params] of routes) {
      expect(await call(file, params, token), file).toBe(403);
      expect(await call(file, params), file).toBe(401);
    }
  });

  it("admin lolos dari penjaga peran (galat berikutnya bukan 401/403)", async () => {
    const token = await auth.createSession(adminActor.userId);
    const status = await call(
      "../pages/api/admin/pelanggan/[userId]/status",
      { userId: "tidak-ada" },
      token,
    );
    expect(status).toBe(404);
  });

  it("endpoint akhiri penyamaran menolak sesi tanpa penyamaran", async () => {
    const c = await support.registerCustomer("Biasa 3");
    const token = await auth.createSession(c.actor.userId);
    expect(await call("../pages/api/impersonation/end", {}, token)).toBe(400);
  });
});
