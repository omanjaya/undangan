import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let guests: typeof import("./guests");
let service: typeof import("./services");
let store: typeof import("../modules/invitations/infrastructure/store");
let qr: typeof import("./qr");
let directory: string;
const SLUG = "amara-raka";
const actor = {
  id: "owner",
  workspaceId: "workspace-demo",
  email: "owner@example.test",
};
const asing = { ...actor, workspaceId: "lain" };

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "guests-test-"));
  process.env.DATA_DIR = directory;
  delete process.env.DATABASE_URL;
  service = await import("./services");
  guests = await import("./guests");
  store = await import("../modules/invitations/infrastructure/store");
  qr = await import("./qr");
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("daftar tamu: akses", () => {
  it("menolak tanpa sesi dan dari ruang kerja lain", async () => {
    await expect(guests.getGuests(null, SLUG)).rejects.toThrow("masuk");
    await expect(guests.getGuests(asing, SLUG)).rejects.toThrow("Akses");
    await expect(guests.addGuest(asing, SLUG, { name: "X" })).rejects.toThrow(
      "Akses",
    );
    await expect(guests.importGuests(null, SLUG, "A")).rejects.toThrow();
    await expect(
      guests.exportGuestsCsv(null, SLUG, "https://x"),
    ).rejects.toThrow();
    await expect(
      guests.checkInGuest(null, SLUG, "abcdefghjk"),
    ).rejects.toThrow();
    await expect(
      guests.saveWaTemplate(null, SLUG, "{tautan}"),
    ).rejects.toThrow();
    await expect(guests.getGuests(actor, "tidak-ada")).rejects.toThrow(
      "tidak ditemukan",
    );
  });
  it("mutasi per tamu memeriksa undangan milik tamu itu", async () => {
    const tamu = await guests.addGuest(actor, SLUG, { name: "Akses" });
    await expect(
      guests.updateGuest(asing, tamu.id, { name: "Y" }),
    ).rejects.toThrow("Akses");
    await expect(guests.removeGuest(null, tamu.id)).rejects.toThrow("masuk");
    await expect(guests.markGuestSent(asing, tamu.id)).rejects.toThrow("Akses");
    await expect(guests.undoCheckIn(asing, tamu.id)).rejects.toThrow("Akses");
    await guests.removeGuest(actor, tamu.id);
  });
});

describe("daftar tamu: CRUD dan impor", () => {
  it("menambah dengan kode unik dan nomor ternormalisasi", async () => {
    const a = await guests.addGuest(actor, SLUG, {
      name: "  Made  ",
      phone: "0812-3456-7890",
      group: "Keluarga",
      maxPax: 2,
    });
    const b = await guests.addGuest(actor, SLUG, { name: "Sari" });
    expect(a.name).toBe("Made");
    expect(a.phone).toBe("6281234567890");
    expect(a.status).toBe("belum-dikirim");
    expect(a.code).toMatch(/^[a-hjkmnp-z2-9]{10}$/);
    expect(a.code).not.toBe(b.code);
    await expect(
      guests.addGuest(actor, SLUG, { name: "Z", phone: "abc" }),
    ).rejects.toThrow("Nomor");
    await expect(guests.addGuest(actor, SLUG, { name: " " })).rejects.toThrow();
  });
  it("mengubah dan menghapus, menolak id tak dikenal", async () => {
    const { guests: daftar } = await guests.getGuests(actor, SLUG);
    const made = daftar.find((g) => g.name === "Made")!;
    const diubah = await guests.updateGuest(actor, made.id, {
      name: "Made Wirawan",
      phone: "",
      group: "Teman",
      maxPax: null,
    });
    expect(diubah.name).toBe("Made Wirawan");
    expect(diubah.phone).toBe("");
    expect(diubah.code).toBe(made.code);
    await expect(
      guests.updateGuest(actor, "tidak-ada", { name: "X" }),
    ).rejects.toThrow("tidak ditemukan");
    await guests.removeGuest(actor, made.id);
    await expect(guests.removeGuest(actor, made.id)).rejects.toThrow(
      "tidak ditemukan",
    );
  });
  it("impor menambah baru, melewati duplikat, dan melaporkan baris bermasalah", async () => {
    const first = await guests.importGuests(
      actor,
      SLUG,
      "Nama,Telepon,Grup\nKadek, 0813 1111 2222, Kantor\nKomang,xx,Kantor\n,0812,\n",
    );
    expect(first.added).toBe(2);
    expect(first.errors.length).toBe(2);
    const again = await guests.importGuests(
      actor,
      SLUG,
      "Kadek, 62 813 1111 2222, Kantor",
    );
    expect(again).toMatchObject({ added: 0, skipped: 1 });
    await expect(guests.importGuests(actor, SLUG, "  ")).rejects.toThrow(
      "kosong",
    );
    const codes = (await guests.getGuests(actor, SLUG)).guests.map(
      (g) => g.code,
    );
    expect(new Set(codes).size).toBe(codes.length);
  });
  it("menyimpan templat pesan per undangan dan menolak yang tanpa {tautan}", async () => {
    await expect(
      guests.saveWaTemplate(actor, SLUG, "Halo {nama}"),
    ).rejects.toThrow("{tautan}");
    await guests.saveWaTemplate(actor, SLUG, "Halo {nama}, buka {tautan}");
    expect((await guests.getGuests(actor, SLUG)).template).toBe(
      "Halo {nama}, buka {tautan}",
    );
  });
  it("mengekspor CSV milik undangan itu saja", async () => {
    const csv = await guests.exportGuestsCsv(actor, SLUG, "https://temu.test");
    expect(csv).toContain("Kadek");
    expect(csv).toContain("https://temu.test/i/amara-raka?to=Kadek&g=");
  });
});

describe("daftar tamu: terkirim, buka, RSVP, check-in", () => {
  let tamu: Awaited<ReturnType<typeof guests.addGuest>>;
  beforeAll(async () => {
    tamu = await guests.addGuest(actor, SLUG, {
      name: "Ni Luh",
      phone: "081299990000",
      maxPax: 3,
    });
  });
  it("menandai terkirim dan membatalkannya", async () => {
    const sent = await guests.markGuestSent(actor, tamu.id);
    expect(sent.status).toBe("terkirim");
    expect(sent.sentAt).toBeTruthy();
    const first = sent.sentAt;
    expect((await guests.markGuestSent(actor, tamu.id)).sentAt).toBe(first);
    expect((await guests.markGuestSent(actor, tamu.id, false)).status).toBe(
      "belum-dikirim",
    );
    await guests.markGuestSent(actor, tamu.id);
  });
  it("mencatat buka pertama dan menghitung pembukaan, hanya untuk kode sah", async () => {
    expect(await guests.recordGuestOpen(SLUG, "zzzzzzzzzz")).toBe(false);
    expect(await guests.recordGuestOpen(SLUG, 42)).toBe(false);
    expect(await guests.recordGuestOpen("tidak-ada", tamu.code)).toBe(false);
    expect(await guests.recordGuestOpen(SLUG, tamu.code)).toBe(true);
    const first = (await guests.getGuests(actor, SLUG)).guests.find(
      (g) => g.id === tamu.id,
    )!;
    expect(first.openCount).toBe(1);
    expect(first.status).toBe("dibuka");
    await guests.recordGuestOpen(SLUG, tamu.code);
    const second = (await guests.getGuests(actor, SLUG)).guests.find(
      (g) => g.id === tamu.id,
    )!;
    expect(second.openCount).toBe(2);
    expect(second.firstOpenedAt).toBe(first.firstOpenedAt);
  });
  it("tidak mencatat buka untuk undangan yang belum terbit", async () => {
    await service.unpublishInvitation(actor, SLUG);
    expect(await guests.recordGuestOpen(SLUG, tamu.code)).toBe(false);
    await service.publishInvitation(actor, SLUG);
  });
  it("menautkan RSVP ke tamu dan tetap meng-upsert lewat cookie", async () => {
    await service.submitRsvp(
      SLUG,
      { name: "Ni Luh", attendance: "attending", attendeeCount: 2 },
      "visitor-niluh",
      tamu.code,
    );
    let view = (await guests.getGuests(actor, SLUG)).guests.find(
      (g) => g.id === tamu.id,
    )!;
    expect(view.status).toBe("hadir");
    expect(view.rsvp).toEqual({ attendance: "attending", attendeeCount: 2 });
    expect(view.pax).toBe(2);
    // Pengunjung yang sama mengirim ulang tanpa kode: tetap RSVP yang sama.
    const before = (await service.getDashboardData(actor, SLUG)).rsvps.length;
    await service.submitRsvp(
      SLUG,
      { name: "Ni Luh", attendance: "attending", attendeeCount: 3 },
      "visitor-niluh",
    );
    expect((await service.getDashboardData(actor, SLUG)).rsvps.length).toBe(
      before,
    );
    view = (await guests.getGuests(actor, SLUG)).guests.find(
      (g) => g.id === tamu.id,
    )!;
    expect(view.rsvp?.attendeeCount).toBe(3);
    // Dari perangkat lain dengan kode yang sama: memperbarui RSVP tamu itu.
    await service.submitRsvp(
      SLUG,
      { name: "Ni Luh", attendance: "declined", attendeeCount: 0 },
      "visitor-lain",
      tamu.code,
    );
    expect((await service.getDashboardData(actor, SLUG)).rsvps.length).toBe(
      before,
    );
    view = (await guests.getGuests(actor, SLUG)).guests.find(
      (g) => g.id === tamu.id,
    )!;
    expect(view.status).toBe("tidak-hadir");
    await service.submitRsvp(
      SLUG,
      { name: "Ni Luh", attendance: "attending", attendeeCount: 3 },
      "visitor-niluh",
      tamu.code,
    );
  });
  it("RSVP dengan kode tak dikenal tetap diterima tetapi tidak tertaut; jatah ditegakkan", async () => {
    const before = (await guests.getGuests(actor, SLUG)).summary;
    await service.submitRsvp(
      SLUG,
      { name: "Orang Asing", attendance: "attending", attendeeCount: 1 },
      "visitor-asing",
      "zzzzzzzzzz",
    );
    expect((await guests.getGuests(actor, SLUG)).summary.hadir).toBe(
      before.hadir,
    );
    await expect(
      service.submitRsvp(
        SLUG,
        { name: "Ni Luh", attendance: "attending", attendeeCount: 4 },
        "visitor-niluh",
        tamu.code,
      ),
    ).rejects.toThrow("maksimal 3");
  });
  it("satu perangkat untuk dua tamu tidak saling menimpa RSVP", async () => {
    const a = await guests.addGuest(actor, SLUG, { name: "Suami" });
    const b = await guests.addGuest(actor, SLUG, { name: "Istri" });
    for (const g of [a, b])
      await service.submitRsvp(
        SLUG,
        { name: g.name, attendance: "attending", attendeeCount: 1 },
        "visitor-bersama",
        g.code,
      );
    const daftar = (await guests.getGuests(actor, SLUG)).guests;
    expect(daftar.find((g) => g.id === a.id)!.status).toBe("hadir");
    expect(daftar.find((g) => g.id === b.id)!.status).toBe("hadir");
  });
  it("data halaman tamu hanya untuk kode sah pada undangan yang sama", async () => {
    expect((await guests.getGuestForPage(SLUG, tamu.code))?.name).toBe(
      "Ni Luh",
    );
    expect(await guests.getGuestForPage(SLUG, "zzzzzzzzzz")).toBeNull();
    expect(await guests.getGuestForPage(SLUG, null)).toBeNull();
    const lain = await service.createInvitation(actor, { slug: "resepsi-dua" });
    expect(await guests.getGuestForPage(lain.slug, tamu.code)).toBeNull();
    expect(await guests.recordGuestOpen(lain.slug, tamu.code)).toBe(false);
  });
  it("check-in menandai hadir dan memberi peringatan bila ganda", async () => {
    const ok = await guests.checkInGuest(actor, SLUG, tamu.code.toUpperCase());
    expect(ok.status).toBe("ok");
    expect(ok.guest.checkedInAt).toBeTruthy();
    expect(ok.guest.pax).toBe(3);
    expect(ok.summary.checkedIn).toBeGreaterThanOrEqual(1);
    const dup = await guests.checkInGuest(
      actor,
      SLUG,
      `https://temu.test/dashboard/checkin?undangan=${SLUG}&kode=${tamu.code}`,
    );
    expect(dup.status).toBe("duplicate");
    expect(dup.guest.checkedInAt).toBe(ok.guest.checkedInAt);
    await expect(
      guests.checkInGuest(actor, SLUG, "zzzzzzzzzz"),
    ).rejects.toThrow("tidak dikenal");
    await expect(guests.checkInGuest(actor, SLUG, "  ")).rejects.toThrow();
    await expect(guests.checkInGuest(asing, SLUG, tamu.code)).rejects.toThrow(
      "Akses",
    );
    const undone = await guests.undoCheckIn(actor, tamu.id);
    expect(undone.checkedInAt).toBeNull();
    expect((await guests.checkInGuest(actor, SLUG, tamu.code)).status).toBe(
      "ok",
    );
  });
  it("check-in menolak kode milik undangan lain", async () => {
    await expect(
      guests.checkInGuest(actor, "resepsi-dua", tamu.code),
    ).rejects.toThrow("undangan lain");
  });
  it("menghapus tamu melepas tautan RSVP tetapi mempertahankan RSVP", async () => {
    const baru = await guests.addGuest(actor, SLUG, { name: "Sementara" });
    await service.submitRsvp(
      SLUG,
      { name: "Sementara", attendance: "attending", attendeeCount: 1 },
      "visitor-sementara",
      baru.code,
    );
    const before = (await service.getDashboardData(actor, SLUG)).rsvps.length;
    await guests.removeGuest(actor, baru.id);
    expect((await service.getDashboardData(actor, SLUG)).rsvps.length).toBe(
      before,
    );
    expect(
      (await guests.getGuests(actor, SLUG)).guests.some(
        (g) => g.id === baru.id,
      ),
    ).toBe(false);
  });
  it("menghapus undangan membuang tamunya", async () => {
    await guests.addGuest(actor, "resepsi-dua", { name: "Tamu Dua" });
    expect((await guests.getGuests(actor, "resepsi-dua")).guests.length).toBe(
      1,
    );
    await service.deleteInvitation(actor, "resepsi-dua");
    const state = await store.readState();
    expect(state.guests!.some((g) => g.name === "Tamu Dua")).toBe(false);
  });
});

describe("ketahanan state", () => {
  it("memperbaiki tamu cacat dan kode kembar", () => {
    const state = store.normalizeState({
      invitations: [{ id: "i1" } as never],
      rsvps: [],
      wishes: [],
      revisions: [],
      guests: [
        { id: "a", invitationId: "i1", code: "abcdefghjk", name: "A" },
        { id: "b", invitationId: "i1", code: "abcdefghjk", name: "B" },
        { id: "c", invitationId: "i1", code: "bukan kode", name: "" },
        { id: "d", invitationId: "hilang", code: "abcdefghjm", name: "D" },
        null,
        "rusak",
      ] as never,
      guestTemplates: { i1: "{tautan}", x: 5 } as never,
    });
    expect(state.guests!.map((g) => g.id)).toEqual(["a", "b", "c"]);
    const codes = state.guests!.map((g) => g.code);
    expect(new Set(codes).size).toBe(3);
    for (const code of codes) expect(code).toMatch(/^[a-hjkmnp-z2-9]{10}$/);
    expect(state.guests![2].name).toBe("Tamu tanpa nama");
    expect(state.guestTemplates).toEqual({ i1: "{tautan}" });
    expect(store.normalizeState({ invitations: [] } as never).guests).toEqual(
      [],
    );
  });
});

describe("QR", () => {
  it("menghasilkan SVG", async () => {
    const svg = await qr.qrSvg("https://temu.test/dashboard/checkin?kode=abc");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("viewBox");
  });
});
