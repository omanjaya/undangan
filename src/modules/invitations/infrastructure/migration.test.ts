import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoInvitation } from "../domain/invitation";
import { verifyPassword } from "../../accounts/password";

let directory: string;
const saved = { ...process.env };

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const legacyPath = () => join(directory, "state.json");
const read = (...parts: string[]) =>
  readFile(join(directory, ...parts), "utf8");

/** State single-owner seperti yang ada di produksi sebelum multi-pelanggan. */
function legacyState() {
  const invitation = structuredClone(demoInvitation);
  invitation.slug = "amara-raka-baru";
  invitation.aliases = ["amara-raka", "amara-lama"];
  const second = structuredClone(demoInvitation);
  second.id = "inv-resepsi";
  second.slug = "resepsi";
  return {
    invitations: [invitation, second],
    rsvps: [
      {
        id: "r1",
        invitationId: "inv-amara-raka",
        visitorId: "v",
        name: "Sari",
        attendance: "attending",
        attendeeCount: 2,
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    wishes: [],
    revisions: [],
    budget: [{ id: "b1", name: "Banten", estimate: 1000, paid: 0 }],
    assets: [
      {
        id: "22222222-2222-2222-2222-222222222222",
        workspaceId: "workspace-demo",
        url: "/media/22222222-2222-2222-2222-222222222222.webp",
        filename: "22222222-2222-2222-2222-222222222222.webp",
        kind: "image",
        name: "foto",
        bytes: 10,
        mime: "image/webp",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    sessions: [{ tokenHash: "x".repeat(64), expiresAt: Date.now() + 1e9 }],
  };
}

/** Meniru proses baru: modul dimuat ulang, penyimpanan dibaca dari disk. */
async function freshStart() {
  vi.resetModules();
  const bootstrap = await import("./bootstrap");
  const global = await import("./global-store");
  const store = await import("./store");
  return { bootstrap, global, store };
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "temu-migrasi-"));
  process.env.DATA_DIR = directory;
  process.env.OWNER_EMAIL = "Bos@Example.test";
  process.env.OWNER_PASSWORD = "kata-sandi-bos-yang-panjang";
  delete process.env.DATABASE_URL;
});
afterEach(async () => {
  process.env = { ...saved };
  await rm(directory, { recursive: true, force: true });
});

describe("migrasi data single-owner lama", () => {
  it("memindahkan isi lama ke workspace-demo milik admin dan menyimpan cadangannya", async () => {
    await writeFile(legacyPath(), JSON.stringify(legacyState()));
    const before = sha(await readFile(legacyPath(), "utf8"));
    const { global: gs, store } = await freshStart();
    const global = await gs.readGlobal();

    expect(global.users).toHaveLength(1);
    const [admin] = global.users;
    expect(admin).toMatchObject({
      email: "bos@example.test",
      role: "admin",
      status: "active",
    });
    expect(
      await verifyPassword("kata-sandi-bos-yang-panjang", admin.passwordHash),
    ).toBe(true);
    expect(global.workspaces).toEqual([
      expect.objectContaining({
        id: "workspace-demo",
        ownerUserId: admin.id,
        plan: expect.objectContaining({ status: "active" }),
      }),
    ]);
    expect(global.orders).toEqual([]);
    expect(global.packages).toEqual([]);
    expect(global.siteSettings).toEqual({});
    expect(global.sessions).toEqual([]);

    // Slug aktif dan semua alamat lama terindeks.
    expect(Object.keys(global.slugs).sort()).toEqual(
      ["amara-lama", "amara-raka", "amara-raka-baru", "resepsi"].sort(),
    );
    expect(global.slugs["amara-raka"]).toEqual({
      workspaceId: "workspace-demo",
      invitationId: "inv-amara-raka",
    });
    expect(global.mediaIndex).toEqual({
      "22222222-2222-2222-2222-222222222222": "workspace-demo",
    });

    // Isi lama utuh, id tidak berubah, sesi lama tidak ikut.
    const state = await store.readWorkspace("workspace-demo");
    expect(state.invitations.map((i) => i.id)).toEqual([
      "inv-amara-raka",
      "inv-resepsi",
    ]);
    expect(
      state.invitations.every((i) => i.workspaceId === "workspace-demo"),
    ).toBe(true);
    expect(state.rsvps).toHaveLength(1);
    expect(state.budget).toHaveLength(1);
    expect(state.assets).toHaveLength(1);
    expect(
      JSON.parse(await read("workspaces", "workspace-demo.json")).sessions,
    ).toBeUndefined();

    // Berkas lama tidak disentuh.
    expect(sha(await readFile(legacyPath(), "utf8"))).toBe(before);
  });

  it("idempoten: start kedua tidak mengubah apa pun dan tidak menimpa data baru", async () => {
    await writeFile(legacyPath(), JSON.stringify(legacyState()));
    const first = await freshStart();
    await first.global.readGlobal();
    // Pemilik mengubah data setelah migrasi.
    await first.store.mutateWorkspace("workspace-demo", (s) => {
      s.budget = [];
    });
    const globalBefore = await read("global.json");
    const workspaceBefore = await read("workspaces", "workspace-demo.json");

    const second = await freshStart();
    expect(await second.bootstrap.runBootstrap()).toBe("ready");
    expect(await second.bootstrap.runBootstrap()).toBe("ready");
    await second.global.readGlobal();
    expect(await read("global.json")).toBe(globalBefore);
    expect(await read("workspaces", "workspace-demo.json")).toBe(
      workspaceBefore,
    );
    expect((await second.global.readGlobal()).users).toHaveLength(1);
  });

  it("start bersamaan hanya membuat satu admin", async () => {
    await writeFile(legacyPath(), JSON.stringify(legacyState()));
    const { bootstrap, global } = await freshStart();
    await Promise.all([
      bootstrap.runBootstrap(),
      bootstrap.runBootstrap(),
      bootstrap.runBootstrap(),
    ]);
    expect((await global.readGlobal()).users).toHaveLength(1);
  });

  it("tanpa data lama pada mode demo: membuat admin demo dan undangan contoh", async () => {
    delete process.env.OWNER_EMAIL;
    delete process.env.OWNER_PASSWORD;
    const { global: gs, store } = await freshStart();
    const global = await gs.readGlobal();
    expect(global.users[0]).toMatchObject({
      email: "owner@undangan.local",
      role: "admin",
    });
    expect(
      await verifyPassword("demo-undangan-2026", global.users[0].passwordHash),
    ).toBe(true);
    expect(global.slugs["amara-raka"]).toMatchObject({
      workspaceId: "workspace-demo",
    });
    expect(
      (await store.readWorkspace("workspace-demo")).invitations[0].slug,
    ).toBe("amara-raka");
  });

  it("data lama yang rusak sebagian tetap bisa dimigrasikan", async () => {
    const rusak = legacyState() as Record<string, unknown>;
    delete rusak.wishes;
    delete rusak.revisions;
    rusak.rsvps = "bukan-array";
    await writeFile(legacyPath(), JSON.stringify(rusak));
    const { store } = await freshStart();
    const state = await store.readWorkspace("workspace-demo");
    expect(state.rsvps).toEqual([]);
    expect(state.wishes).toEqual([]);
    expect(state.invitations).toHaveLength(2);
  });

  it("production menolak kredensial admin yang lemah atau kosong", async () => {
    const { bootstrap } = await freshStart();
    const set = (email?: string, password?: string) => {
      process.env.NODE_ENV = "production";
      process.env.DATABASE_URL = "postgres://unused";
      if (email === undefined) delete process.env.OWNER_EMAIL;
      else process.env.OWNER_EMAIL = email;
      if (password === undefined) delete process.env.OWNER_PASSWORD;
      else process.env.OWNER_PASSWORD = password;
    };
    set();
    expect(() => bootstrap.ownerCredentials()).toThrow("Admin pertama");
    set("owner@undangan.local", "kata-sandi-bos-yang-panjang");
    expect(() => bootstrap.ownerCredentials()).toThrow("production");
    set("bos@example.test", "demo-undangan-2026");
    expect(() => bootstrap.ownerCredentials()).toThrow("production");
    set("bos@example.test", "pendek");
    expect(() => bootstrap.ownerCredentials()).toThrow("production");
    set("Bos@Example.test", "kata-sandi-bos-yang-panjang");
    expect(bootstrap.ownerCredentials().email).toBe("bos@example.test");
  });
});

describe("ketahanan penyimpanan global", () => {
  it("melengkapi koleksi yang hilang", async () => {
    const { normalizeGlobal } = await import("./global-state");
    expect(normalizeGlobal({ users: "x", slugs: [] })).toEqual({
      users: [],
      sessions: [],
      workspaces: [],
      slugs: {},
      mediaIndex: {},
      orders: [],
      packages: [],
      siteSettings: {},
      auditLog: [],
      passwordResets: [],
    });
  });
});
