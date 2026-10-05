import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let service: typeof import("./services");
let directory: string;
let actor: import("./services").Actor;
let stranger: import("./services").Actor;
const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });

async function ownerWishes() {
  return (await service.getDashboardData(actor)).wishes;
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "undangan-wishes-"));
  process.env.DATA_DIR = directory;
  delete process.env.DATABASE_URL;
  process.env.TELEGRAM_BOT_TOKEN = "123:abc";
  process.env.TELEGRAM_CHAT_ID = "42";
  vi.stubGlobal("fetch", fetchMock);
  service = await import("./services");
  const support = await import("./test-support");
  actor = support.adminActor("o@x.test");
  stranger = (await support.registerCustomer("Asing")).actor;
  await service.publishInvitation(actor, "amara-raka");
  await service.submitRsvp(
    "amara-raka",
    {
      name: "Sari",
      attendance: "attending",
      attendeeCount: 2,
      message: "Selamat menempuh hidup baru",
    },
    "v1",
  );
  await service.submitRsvp(
    "amara-raka",
    { name: "Budi", attendance: "declined", attendeeCount: 0 },
    "v2",
  );
});
afterAll(async () => {
  vi.unstubAllGlobals();
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  await rm(directory, { recursive: true, force: true });
});

describe("notifikasi RSVP", () => {
  it("memanggil notifier untuk tiap RSVP dengan teks yang sesuai", () => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(fetchMock.mock.calls[0][1].body).text as string;
    expect(first).toContain("Sari");
    expect(first).toContain("Hadir (2 orang)");
    expect(first).toContain("Selamat menempuh hidup baru");
    const second = JSON.parse(fetchMock.mock.calls[1][1].body).text as string;
    expect(second).toContain("Tidak hadir");
  });

  it("RSVP tetap berhasil walau pengiriman gagal", async () => {
    fetchMock.mockRejectedValueOnce(new Error("jaringan putus"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      service.submitRsvp(
        "amara-raka",
        { name: "Dewi", attendance: "attending", attendeeCount: 1 },
        "v3",
      ),
    ).resolves.toHaveProperty("id");
  });
});

describe("balas dan hapus ucapan", () => {
  it("hanya menampilkan balasan pada ucapan yang disetujui", async () => {
    const [wish] = await ownerWishes();
    await service.replyToWish(actor, wish.id, "  Terima kasih!  ");
    expect(await service.getWishes("amara-raka")).toEqual([]);
    await service.moderateWish(actor, wish.id, "approved");
    const [pub] = await service.getWishes("amara-raka");
    expect(pub.reply).toBe("Terima kasih!");
    expect(Object.keys(pub).sort()).toEqual(
      ["createdAt", "id", "message", "name", "reply"].sort(),
    );
    await service.moderateWish(actor, wish.id, "hidden");
    expect(await service.getWishes("amara-raka")).toEqual([]);
  });

  it("mengedit dan menghapus balasan", async () => {
    const [wish] = await ownerWishes();
    await service.moderateWish(actor, wish.id, "approved");
    await service.replyToWish(actor, wish.id, "Balasan baru");
    expect((await service.getWishes("amara-raka"))[0].reply).toBe(
      "Balasan baru",
    );
    await service.replyToWish(actor, wish.id, "");
    const [pub] = await service.getWishes("amara-raka");
    expect(pub).not.toHaveProperty("reply");
  });

  it("menolak balasan terlalu panjang", async () => {
    const [wish] = await ownerWishes();
    await expect(
      service.replyToWish(actor, wish.id, "a".repeat(501)),
    ).rejects.toThrow();
  });

  it("menolak aktor tanpa akses dan ucapan tak dikenal", async () => {
    const [wish] = await ownerWishes();
    await expect(service.replyToWish(null, wish.id, "x")).rejects.toMatchObject(
      { status: 401 },
    );
    await expect(
      service.replyToWish(stranger, wish.id, "x"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(service.deleteWish(null, wish.id)).rejects.toMatchObject({
      status: 401,
    });
    await expect(service.deleteWish(stranger, wish.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.deleteWish(actor, "tidak-ada")).rejects.toMatchObject({
      status: 404,
    });
    expect(await ownerWishes()).toHaveLength(1);
  });

  it("menghapus ucapan secara permanen", async () => {
    const [wish] = await ownerWishes();
    await service.deleteWish(actor, wish.id);
    expect(await ownerWishes()).toHaveLength(0);
  });
});

describe("ekspor CSV pemilik", () => {
  it("hanya untuk pemilik dan memuat data undangan itu", async () => {
    await expect(
      service.exportRsvpCsv(null, "amara-raka"),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      service.exportWishesCsv(stranger, "amara-raka"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.exportRsvpCsv(actor, "tidak-ada"),
    ).rejects.toMatchObject({ status: 404 });
    const { slug, csv } = await service.exportRsvpCsv(actor, "amara-raka");
    expect(slug).toBe("amara-raka");
    expect(csv).toContain('"Sari","Hadir","2"');
    expect(csv).toContain('"Budi","Tidak hadir","0"');
  });
});
