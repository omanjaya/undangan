import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { access, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";

let auth: typeof import("./auth");
let account: typeof import("./account");
let reset: typeof import("./password-reset");
let mail: typeof import("./mail");
let http: typeof import("./http");
let service: typeof import("./services");
let guests: typeof import("./guests");
let budget: typeof import("./budget");
let media: typeof import("./media");
let support: typeof import("./test-support");
let store: typeof import("../modules/invitations/infrastructure/store");
let globalStore: typeof import("../modules/invitations/infrastructure/global-store");
let forgotRoute: typeof import("../pages/api/auth/forgot");
let directory: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "temu-account-"));
  process.env.DATA_DIR = directory;
  process.env.UPLOAD_DIR = join(directory, "uploads");
  delete process.env.DATABASE_URL;
  auth = await import("./auth");
  account = await import("./account");
  reset = await import("./password-reset");
  mail = await import("./mail");
  http = await import("./http");
  service = await import("./services");
  guests = await import("./guests");
  budget = await import("./budget");
  media = await import("./media");
  support = await import("./test-support");
  store = await import("../modules/invitations/infrastructure/store");
  globalStore =
    await import("../modules/invitations/infrastructure/global-store");
  forgotRoute = await import("../pages/api/auth/forgot");
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterAll(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

const origin = "https://temu.test";
const tokenIn = (mailText: string) =>
  /token=([a-f0-9]{64})/.exec(mailText)?.[1] ?? "";

describe("atur ulang kata sandi", () => {
  it("email terdaftar menerima tautan; hanya hash token yang tersimpan", async () => {
    const c = await support.registerCustomer("Dewi");
    await reset.requestPasswordReset(c.email, { origin });
    const sent = mail.lastMailTo(c.email);
    expect(sent?.text).toContain(`${origin}/reset-sandi?token=`);
    const token = tokenIn(sent!.text);
    expect(token).toHaveLength(64);
    const global = await globalStore.readGlobal();
    const entry = global.passwordResets.find(
      (t) => t.userId === c.actor.userId,
    );
    expect(entry?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry?.tokenHash).not.toBe(token);
    expect(JSON.stringify(global.passwordResets)).not.toContain(token);
    // Berlaku satu jam.
    expect(entry!.expiresAt - entry!.createdAt).toBe(reset.RESET_TTL_MS);
    expect(await reset.isResetTokenValid(token)).toBe(true);
  });

  it("email tak dikenal tidak mengirim apa pun dan tidak melempar galat", async () => {
    mail.clearDevOutbox();
    await expect(
      reset.requestPasswordReset("tidak-ada@example.test", { origin }),
    ).resolves.toBeUndefined();
    expect(mail.lastMailTo("tidak-ada@example.test")).toBeNull();
  });

  it("token sekali pakai, mencabut sesi lama, dan kata sandi baru berlaku", async () => {
    const c = await support.registerCustomer("Made");
    const oldSession = await auth.createSession(c.actor.userId);
    await reset.requestPasswordReset(c.email, { origin });
    const token = tokenIn(mail.lastMailTo(c.email)!.text);
    await reset.resetPassword(token, "kata-sandi-baru-1");
    // Sekali pakai.
    await expect(
      reset.resetPassword(token, "kata-sandi-baru-2"),
    ).rejects.toMatchObject({ status: 400 });
    expect(await reset.isResetTokenValid(token)).toBe(false);
    // Sesi lama dicabut; login lama gagal; login baru berhasil.
    const request = new Request("http://localhost/x", {
      headers: { cookie: `invitation_session=${oldSession}` },
    });
    expect(await auth.getActor(request)).toBeNull();
    await expect(auth.login(c.email, c.password)).rejects.toMatchObject({
      status: 401,
    });
    expect(await auth.login(c.email, "kata-sandi-baru-1")).toHaveLength(64);
  });

  it("token baru mencabut token lama milik pengguna yang sama", async () => {
    const c = await support.registerCustomer("Ketut");
    await reset.requestPasswordReset(c.email, { origin });
    const first = tokenIn(mail.lastMailTo(c.email)!.text);
    await reset.requestPasswordReset(c.email, { origin });
    const second = tokenIn(mail.lastMailTo(c.email)!.text);
    expect(second).not.toBe(first);
    expect(await reset.isResetTokenValid(first)).toBe(false);
    expect(await reset.isResetTokenValid(second)).toBe(true);
    await expect(
      reset.resetPassword(first, "kata-sandi-baru-1"),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("token kedaluwarsa ditolak dan dihanguskan", async () => {
    const c = await support.registerCustomer("Nyoman");
    await reset.requestPasswordReset(c.email, { origin });
    const token = tokenIn(mail.lastMailTo(c.email)!.text);
    const later = Date.now() + reset.RESET_TTL_MS + 1000;
    expect(await reset.isResetTokenValid(token, later)).toBe(false);
    await expect(
      reset.resetPassword(token, "kata-sandi-baru-1", later),
    ).rejects.toMatchObject({ status: 400 });
    // Kata sandi tidak berubah.
    expect(await auth.login(c.email, c.password)).toHaveLength(64);
  });

  it("kata sandi terlalu pendek ditolak tanpa menghanguskan tautan; token asal-asalan ditolak", async () => {
    const c = await support.registerCustomer("Wayan");
    await reset.requestPasswordReset(c.email, { origin });
    const token = tokenIn(mail.lastMailTo(c.email)!.text);
    await expect(reset.resetPassword(token, "pendek")).rejects.toThrow();
    expect(await reset.isResetTokenValid(token)).toBe(true);
    for (const bad of ["", "abc", "z".repeat(64), undefined, 5])
      await expect(
        reset.resetPassword(bad, "kata-sandi-baru-1"),
      ).rejects.toMatchObject({ status: 400 });
  });

  it("akun yang ditangguhkan tidak menerima tautan", async () => {
    const c = await support.registerCustomer("Suspen");
    await globalStore.mutateGlobal((g) => {
      g.users.find((u) => u.id === c.actor.userId)!.status = "suspended";
    });
    await reset.requestPasswordReset(c.email, { origin });
    expect(mail.lastMailTo(c.email)).toBeNull();
  });

  it("batas per email: permintaan berlebih diam-diam tidak mengirim email", async () => {
    const c = await support.registerCustomer("Limit");
    let sent = 0;
    for (let i = 0; i < reset.RESET_EMAIL_LIMIT.max + 2; i++) {
      mail.clearDevOutbox();
      await reset.requestPasswordReset(c.email, { origin });
      if (mail.lastMailTo(c.email)) sent++;
    }
    expect(sent).toBe(reset.RESET_EMAIL_LIMIT.max);
  });

  const forgot = async (email: string, ip: string) => {
    const request = new Request("https://temu.test/api/auth/forgot", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({ email }),
    });
    const response = await forgotRoute.POST({
      request,
      clientAddress: "127.0.0.1",
    } as never);
    return { status: response.status, body: await response.json() };
  };

  it("respons API sama untuk email terdaftar dan tidak (anti-enumerasi)", async () => {
    const c = await support.registerCustomer("Enum");
    const known = await forgot(c.email, "10.1.0.1");
    const unknown = await forgot("tidak-ada-2@example.test", "10.1.0.2");
    expect(known).toEqual(unknown);
    expect(known.status).toBe(200);
    expect(known.body.message).toBe(reset.RESET_REQUEST_MESSAGE);
  });

  it("batas per IP pada endpoint lupa sandi", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++)
      statuses.push((await forgot(`ip-${i}@example.test`, "10.2.0.1")).status);
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });
});

describe("pembatas kegagalan login", () => {
  it("memblokir setelah batas kegagalan dan bisa dibersihkan", () => {
    const key = "login-fail:uji@example.test";
    for (let i = 0; i < 3; i++) http.recordFailure(key, 60_000);
    expect(() => http.assertNotLockedOut(key, 3, "terkunci")).toThrow(
      "terkunci",
    );
    expect(() => http.assertNotLockedOut(key, 4, "terkunci")).not.toThrow();
    http.clearFailures(key);
    expect(() => http.assertNotLockedOut(key, 3, "terkunci")).not.toThrow();
  });
});

describe("pengaturan akun", () => {
  it("mengubah nama dan telepon (dan nama ruang kerja yang mengikuti)", async () => {
    const c = await support.registerCustomer("Nama Lama");
    await account.updateProfile(c.actor, {
      name: "  Nama Baru ",
      phone: "0812 3456",
    });
    const { profile } = await account.getAccount(c.actor);
    expect(profile).toMatchObject({ name: "Nama Baru", phone: "0812 3456" });
    const global = await globalStore.readGlobal();
    expect(
      global.workspaces.find((w) => w.id === c.actor.workspaceId)?.name,
    ).toBe("Nama Baru");
    await expect(
      account.updateProfile(c.actor, { name: "x" }),
    ).rejects.toThrow();
    await expect(
      account.updateProfile(c.actor, { name: "Valid", phone: "abc" }),
    ).rejects.toThrow();
    await account.updateProfile(c.actor, { name: "Valid" });
    expect((await account.getAccount(c.actor)).profile.phone).toBe("");
  });

  it("ganti email memerlukan kata sandi dan menjaga keunikan", async () => {
    const a = await support.registerCustomer("Akun A");
    const b = await support.registerCustomer("Akun B");
    await expect(
      account.changeEmail(a.actor, {
        currentPassword: "salah-total-1",
        email: "baru@example.test",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      account.changeEmail(a.actor, {
        currentPassword: a.password,
        email: b.email.toUpperCase(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      account.changeEmail(a.actor, {
        currentPassword: a.password,
        email: "bukan-email",
      }),
    ).rejects.toThrow();
    const baru = `Baru-${Date.now()}@Example.Test`;
    await account.changeEmail(a.actor, {
      currentPassword: a.password,
      email: baru,
    });
    expect((await account.getAccount(a.actor)).profile.email).toBe(
      baru.toLowerCase(),
    );
    expect(await auth.login(baru, a.password)).toHaveLength(64);
    await expect(auth.login(a.email, a.password)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("ganti kata sandi mempertahankan sesi sekarang dan mencabut yang lain", async () => {
    const c = await support.registerCustomer("Sandi");
    const current = await auth.createSession(c.actor.userId);
    const other = await auth.createSession(c.actor.userId);
    const actorFor = (token: string) =>
      auth.getActor(
        new Request("http://localhost/x", {
          headers: { cookie: `invitation_session=${token}` },
        }),
      );
    await expect(
      account.changePassword(c.actor, current, {
        currentPassword: "salah-total-1",
        newPassword: "kata-sandi-baru-1",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      account.changePassword(c.actor, current, {
        currentPassword: c.password,
        newPassword: "pendek",
      }),
    ).rejects.toThrow();
    await expect(
      account.changePassword(c.actor, current, {
        currentPassword: c.password,
        newPassword: "kata-sandi-baru-1",
        confirmPassword: "beda-sama-sekali",
      }),
    ).rejects.toThrow("Konfirmasi");
    await account.changePassword(c.actor, current, {
      currentPassword: c.password,
      newPassword: "kata-sandi-baru-1",
      confirmPassword: "kata-sandi-baru-1",
    });
    expect(await actorFor(current)).not.toBeNull();
    expect(await actorFor(other)).toBeNull();
    expect(await auth.login(c.email, "kata-sandi-baru-1")).toHaveLength(64);
  });

  it("daftar sesi aktif dan keluar dari perangkat lain", async () => {
    const c = await support.registerCustomer("Sesi");
    const current = await auth.createSession(c.actor.userId);
    await auth.createSession(c.actor.userId);
    const before = await account.getAccount(c.actor, current);
    expect(before.sessions).toHaveLength(2);
    expect(before.sessions.filter((s) => s.current)).toHaveLength(1);
    expect(JSON.stringify(before)).not.toContain("tokenHash");
    await account.signOutOtherSessions(c.actor, current);
    const after = await account.getAccount(c.actor, current);
    expect(after.sessions).toHaveLength(1);
    expect(after.sessions[0].current).toBe(true);
  });

  it("admin yang menyamar tidak dapat mengubah akun pengguna", async () => {
    const c = await support.registerCustomer("Disamar");
    const impersonated = { ...c.actor, impersonatorUserId: "owner" };
    await expect(
      account.updateProfile(impersonated, { name: "Diubah Admin" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      account.changePassword(impersonated, undefined, {
        currentPassword: c.password,
        newPassword: "kata-sandi-baru-1",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(account.exportAccountData(impersonated)).rejects.toMatchObject(
      { status: 403 },
    );
    await expect(
      account.deleteAccount(impersonated, {
        password: c.password,
        confirmation: account.DELETE_CONFIRMATION,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

const png = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: "#abc" } })
    .png()
    .toBuffer();

async function populate(
  c: Awaited<ReturnType<typeof support.registerCustomer>>,
) {
  await support.setPlan(c.actor.workspaceId, { id: "pro", status: "active" });
  const asset = await media.uploadMedia(
    c.actor,
    new Request("http://localhost/api/media", {
      method: "POST",
      headers: { "content-type": "image/png", "x-file-name": "a.png" },
      body: (await png()) as unknown as BodyInit,
    }),
  );
  const dashboard = await service.getDashboardData(c.actor);
  await service.saveDraft(c.actor, {
    slug: c.slug,
    lockVersion: dashboard.invitation.lockVersion,
    content: { ...dashboard.invitation.draft, heroPhoto: asset.url },
  });
  await service.publishInvitation(c.actor, c.slug);
  await guests.addGuest(c.actor, c.slug, {
    name: `Tamu ${c.email}`,
    phone: "081234567890",
  });
  await service.submitRsvp(
    c.slug,
    {
      name: `Penonton ${c.email}`,
      attendance: "attending",
      attendeeCount: 2,
      message: `Selamat dari ${c.email}`,
    },
    "visitor-rahasia-123",
  );
  await budget.addBudgetItem(c.actor, { name: `Banten ${c.email}` });
  return asset;
}

describe("unduh data saya", () => {
  it("memuat profil dan isi ruang kerja sendiri, tanpa hash maupun data orang lain", async () => {
    const mine = await support.registerCustomer("Pengunduh");
    const other = await support.registerCustomer("Orang Lain");
    await populate(mine);
    await populate(other);
    const data = await account.exportAccountData(mine.actor);
    const json = JSON.stringify(data);

    expect(data.profile).toMatchObject({
      email: mine.email,
      name: "Pengunduh",
    });
    expect(data.invitations).toHaveLength(1);
    expect(data.guests).toHaveLength(1);
    expect(data.rsvps).toHaveLength(1);
    expect(data.wishes).toHaveLength(1);
    expect(data.budget).toHaveLength(1);
    expect(data.media).toHaveLength(1);
    expect(data.workspace.slugs).toContain(mine.slug);

    // Rahasia internal tidak ikut.
    expect(json).not.toContain("passwordHash");
    expect(json).not.toContain("scrypt$");
    expect(json).not.toContain("tokenHash");
    expect(json).not.toContain("visitorId");
    expect(json).not.toContain("visitor-rahasia-123");
    expect(json).not.toContain("filename");
    // Data pelanggan lain tidak ikut.
    expect(json).not.toContain(other.email);
    expect(json).not.toContain(other.slug);
    expect(json).not.toContain(other.actor.workspaceId);
    expect(json).not.toContain(other.actor.userId);
  });

  it("menolak tanpa sesi", async () => {
    await expect(account.exportAccountData(null)).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe("hapus akun", () => {
  it("meminta konfirmasi ketikan dan kata sandi", async () => {
    const c = await support.registerCustomer("Hati-hati");
    await expect(
      account.deleteAccount(c.actor, {
        password: c.password,
        confirmation: "hapus",
      }),
    ).rejects.toThrow("HAPUS AKUN");
    await expect(
      account.deleteAccount(c.actor, {
        password: "salah-total-1",
        confirmation: account.DELETE_CONFIRMATION,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect((await account.getAccount(c.actor)).profile.email).toBe(c.email);
  });

  it("menolak menghapus akun admin", async () => {
    const global = await globalStore.readGlobal();
    const admin = global.users.find((u) => u.role === "admin")!;
    const workspace = global.workspaces.find(
      (w) => w.ownerUserId === admin.id,
    )!;
    await expect(
      account.deleteAccount(
        {
          userId: admin.id,
          workspaceId: workspace.id,
          email: admin.email,
          name: admin.name,
          role: "admin",
        },
        { password: "apa-saja-123", confirmation: account.DELETE_CONFIRMATION },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await globalStore.readGlobal()).users.some((u) => u.id === admin.id),
    ).toBe(true);
  });

  it("menghapus akun, sesi, ruang kerja, indeks, dan media tanpa menyentuh pelanggan lain", async () => {
    const doomed = await support.registerCustomer("Dihapus");
    const bystander = await support.registerCustomer("Penonton");
    const doomedAsset = await populate(doomed);
    const bystanderAsset = await populate(bystander);
    const session = await auth.createSession(doomed.actor.userId);
    const doomedFile = join(
      directory,
      "uploads",
      doomedAsset.url.split("/").pop()!,
    );
    const bystanderFile = join(
      directory,
      "uploads",
      bystanderAsset.url.split("/").pop()!,
    );
    await access(doomedFile);

    // Pesanan dibiarkan untuk pembukuan.
    await globalStore.mutateGlobal((g) => {
      g.orders.push({
        id: "order-1",
        number: "TMU-TEST-0001",
        workspaceId: doomed.actor.workspaceId,
        userId: doomed.actor.userId,
        packageId: "pro",
        packageSnapshot: {} as never,
        amount: 1,
        uniqueCode: 1,
        total: 2,
        status: "paid",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-03T00:00:00.000Z",
      });
    });

    await account.deleteAccount(doomed.actor, {
      password: doomed.password,
      confirmation: ` ${account.DELETE_CONFIRMATION.toLowerCase()} `,
    });

    const global = await globalStore.readGlobal();
    expect(global.users.some((u) => u.id === doomed.actor.userId)).toBe(false);
    expect(global.sessions.some((s) => s.userId === doomed.actor.userId)).toBe(
      false,
    );
    expect(
      global.workspaces.some((w) => w.id === doomed.actor.workspaceId),
    ).toBe(false);
    expect(
      Object.values(global.slugs).some(
        (s) => s.workspaceId === doomed.actor.workspaceId,
      ),
    ).toBe(false);
    expect(
      Object.values(global.mediaIndex).includes(doomed.actor.workspaceId),
    ).toBe(false);
    expect(global.orders.map((o) => o.id)).toContain("order-1");
    expect(await store.tryReadWorkspace(doomed.actor.workspaceId)).toBeNull();
    await expect(access(doomedFile)).rejects.toThrow();
    // Sesi lama tidak lagi berlaku dan alamat publik 404.
    expect(
      await auth.getActor(
        new Request("http://localhost/x", {
          headers: { cookie: `invitation_session=${session}` },
        }),
      ),
    ).toBeNull();
    expect(await service.getPublished(doomed.slug)).toBeNull();
    await expect(auth.login(doomed.email, doomed.password)).rejects.toThrow();

    // Pelanggan lain tidak tersentuh.
    expect(global.users.some((u) => u.id === bystander.actor.userId)).toBe(
      true,
    );
    expect(
      Object.values(global.slugs).some(
        (s) => s.workspaceId === bystander.actor.workspaceId,
      ),
    ).toBe(true);
    expect(
      Object.values(global.mediaIndex).includes(bystander.actor.workspaceId),
    ).toBe(true);
    await access(bystanderFile);
    const data = await service.getDashboardData(bystander.actor);
    expect(data.invitations).toHaveLength(1);
    expect(
      (await guests.getGuests(bystander.actor, bystander.slug)).guests,
    ).toHaveLength(1);
    expect((await budget.getBudget(bystander.actor)).items).toHaveLength(1);
    expect(await service.getPublished(bystander.slug)).not.toBeNull();
  });
});
