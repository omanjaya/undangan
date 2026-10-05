import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Paket "terbatas" menonaktifkan semua fitur; paket lain memakai perilaku asli.
vi.mock("../modules/billing/entitlements", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../modules/billing/entitlements")>();
  return {
    ...original,
    getEntitlements: (
      workspace: Parameters<typeof original.getEntitlements>[0],
      now?: number,
    ) => {
      const base = original.getEntitlements(workspace, now);
      return workspace.plan.id === "terbatas"
        ? {
            ...base,
            canPublish: true,
            features: {
              music: false,
              video: false,
              gift: false,
              guestList: false,
              qrCheckin: false,
              customSlug: false,
              removeBranding: false,
            },
          }
        : base;
    },
  };
});

let guests: typeof import("./guests");
let service: typeof import("./services");
let support: typeof import("./test-support");
let globalStore: typeof import("../modules/invitations/infrastructure/global-store");
let directory: string;
let full: Awaited<ReturnType<typeof import("./test-support").registerCustomer>>;
let limited: typeof full;
let code = "";

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "temu-gating-"));
  process.env.DATA_DIR = directory;
  process.env.UPLOAD_DIR = join(directory, "uploads");
  delete process.env.DATABASE_URL;
  guests = await import("./guests");
  service = await import("./services");
  support = await import("./test-support");
  globalStore =
    await import("../modules/invitations/infrastructure/global-store");
  full = await support.registerCustomer("Lengkap");
  limited = await support.registerCustomer("Terbatas");
  await support.setPlan(full.actor.workspaceId, {
    id: "pro",
    status: "active",
  });
  await support.setPlan(limited.actor.workspaceId, {
    id: "terbatas",
    status: "active",
  });
  // Tamu dibuat selagi paketnya lengkap, lalu paket dibatasi.
  const guest = await guests.addGuest(full.actor, full.slug, {
    name: "Tamu Penting",
    phone: "081234567890",
  });
  code = guest.code;
  await service.publishInvitation(full.actor, full.slug);
  await service.publishInvitation(limited.actor, limited.slug);
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("daftar tamu dan check-in menurut paket", () => {
  it("memberi 403 dengan pesan jelas bila daftar tamu tidak termasuk paket", async () => {
    const forbidden = {
      status: 403,
      message: expect.stringContaining("daftar tamu"),
    };
    await expect(
      guests.getGuests(limited.actor, limited.slug),
    ).rejects.toMatchObject(forbidden);
    await expect(
      guests.addGuest(limited.actor, limited.slug, {
        name: "X",
        phone: "081234567890",
      }),
    ).rejects.toMatchObject(forbidden);
    await expect(
      guests.exportGuestsCsv(limited.actor, limited.slug, "http://localhost"),
    ).rejects.toMatchObject(forbidden);
    await expect(
      guests.importGuests(limited.actor, limited.slug, "Nama,081234567890"),
    ).rejects.toMatchObject(forbidden);
  });

  it("memberi 403 untuk check-in QR bila tidak termasuk paket", async () => {
    await expect(
      guests.checkInGuest(limited.actor, limited.slug, "ABCDEF"),
    ).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("check-in QR"),
    });
    await expect(
      guests.undoCheckIn(limited.actor, "apa-saja"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("paket lengkap tetap berfungsi", async () => {
    expect((await guests.getGuests(full.actor, full.slug)).guests).toHaveLength(
      1,
    );
  });
});

describe("kode tamu pada halaman publik", () => {
  it("kode tamu dikenali bila daftar tamu ada, dan pembukaan tercatat", async () => {
    expect(await guests.getGuestForPage(full.slug, code)).toMatchObject({
      name: "Tamu Penting",
    });
    expect(await guests.recordGuestOpen(full.slug, code)).toBe(true);
  });

  it("RSVP dengan kode tamu diterima tetapi tidak tertaut ke daftar tamu bila paket tanpa daftar tamu", async () => {
    // Pindahkan tamu ke ruang kerja terbatas lewat data langsung: kode yang sama
    // tidak boleh dikenali setelah paket membatasinya.
    const state = await import("../modules/invitations/infrastructure/store");
    const source = await state.readWorkspace(full.actor.workspaceId);
    await state.mutateWorkspace(limited.actor.workspaceId, (s) => {
      const invitation = s.invitations[0];
      s.guests = source.guests!.map((g) => ({
        ...g,
        invitationId: invitation.id,
      }));
    });
    expect(await guests.recordGuestOpen(limited.slug, code)).toBe(false);
    await service.submitRsvp(
      limited.slug,
      { name: "Tamu Penting", attendance: "attending", attendeeCount: 1 },
      "visitor-x",
      code,
    );
    const rsvps = (await service.getDashboardData(limited.actor)).rsvps;
    expect(rsvps).toHaveLength(1);
    expect(rsvps[0].guestId).toBeUndefined();
    expect(
      (await globalStore.readGlobal()).workspaces.find(
        (w) => w.id === limited.actor.workspaceId,
      )?.plan.id,
    ).toBe("terbatas");
  });
});
