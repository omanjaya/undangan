import { describe, expect, it } from "vitest";
import { DEFAULT_PACKAGES } from "./catalog";
import { getEntitlements, UNLIMITED } from "./entitlements";

const plan = (p: Parameters<typeof getEntitlements>[0]["plan"]) => ({
  plan: p,
});

describe("getEntitlements", () => {
  it("ruang kerja admin dan paket aktif tanpa batas", () => {
    for (const ent of [
      getEntitlements(plan({ id: "admin", status: "active" })),
      getEntitlements(plan({ id: "pro", status: "active" })),
      getEntitlements(
        plan({
          id: "pro",
          status: "active",
          expiresAt: "2999-01-01T00:00:00Z",
        }),
      ),
    ]) {
      expect(ent.canPublish).toBe(true);
      expect(ent.maxInvitations).toBe(UNLIMITED);
      expect(ent.maxGuests).toBe(UNLIMITED);
      expect(ent.maxMediaBytes).toBe(UNLIMITED);
      expect(Object.values(ent.features).every(Boolean)).toBe(true);
    }
  });

  it("uji coba: tidak boleh menerbitkan dan dibatasi", () => {
    const ent = getEntitlements(plan({ id: "trial", status: "trial" }));
    expect(ent).toMatchObject({
      canPublish: false,
      maxInvitations: 1,
      maxGuests: 50,
      maxMediaBytes: 200 * 1024 * 1024,
    });
    expect(ent.features.removeBranding).toBe(false);
    const { removeBranding: _, ...rest } = ent.features;
    expect(Object.values(rest).every(Boolean)).toBe(true);
  });

  it("paket kedaluwarsa dibatasi seperti uji coba", () => {
    const now = Date.parse("2026-10-05T00:00:00Z");
    expect(
      getEntitlements(plan({ id: "pro", status: "expired" }), now).canPublish,
    ).toBe(false);
    expect(
      getEntitlements(
        plan({
          id: "pro",
          status: "active",
          expiresAt: "2026-10-04T00:00:00Z",
        }),
        now,
      ).canPublish,
    ).toBe(false);
  });
});

describe("getEntitlements dari paket yang dibeli", () => {
  const now = Date.parse("2026-10-05T00:00:00Z");
  const active = {
    id: "esensial",
    status: "active",
    expiresAt: "2027-01-01T00:00:00Z",
  } as const;
  const [esensial, premium] = DEFAULT_PACKAGES;

  it("memakai batas dan flag paket, ruang media dalam byte", () => {
    const ent = getEntitlements({ id: "w1", plan: active }, now, {
      packages: DEFAULT_PACKAGES,
    });
    expect(ent).toMatchObject({
      canPublish: true,
      maxInvitations: 1,
      maxGuests: 150,
      maxMediaBytes: 100 * 1024 * 1024,
    });
    expect(ent.features).toEqual(esensial.flags);
    expect(ent.features.music).toBe(false);
  });

  it("mengikuti perubahan paket di penyimpanan", () => {
    const edited = {
      ...esensial,
      limits: { ...esensial.limits, maxGuests: 99 },
    };
    expect(
      getEntitlements({ id: "w1", plan: active }, now, { packages: [edited] })
        .maxGuests,
    ).toBe(99);
  });

  it("memakai salinan pesanan lunas terbaru bila paket sudah dihapus", () => {
    const order = (paidAt: string, maxGuests: number) => ({
      workspaceId: "w1",
      packageId: "esensial",
      status: "paid" as const,
      paidAt,
      packageSnapshot: {
        ...premium,
        id: "esensial",
        limits: { ...premium.limits, maxGuests },
      },
    });
    const ent = getEntitlements({ id: "w1", plan: active }, now, {
      packages: [premium],
      orders: [
        order("2026-01-01T00:00:00Z", 10),
        order("2026-06-01T00:00:00Z", 321),
        { ...order("2026-09-01T00:00:00Z", 5), workspaceId: "w2" },
      ],
    });
    expect(ent.maxGuests).toBe(321);
    expect(ent.features.music).toBe(true);
  });

  it("paket tak dikenal tetap tanpa batas; admin, uji coba, dan kedaluwarsa tidak berubah", () => {
    expect(
      getEntitlements({ id: "w1", plan: active }, now, { packages: [premium] })
        .maxGuests,
    ).toBe(UNLIMITED);
    const source = { packages: DEFAULT_PACKAGES };
    expect(
      getEntitlements(
        { id: "w", plan: { id: "admin", status: "active" } },
        now,
        source,
      ).maxGuests,
    ).toBe(UNLIMITED);
    expect(
      getEntitlements(
        { id: "w", plan: { id: "trial", status: "trial" } },
        now,
        source,
      ).canPublish,
    ).toBe(false);
    expect(
      getEntitlements(
        { id: "w", plan: { ...active, expiresAt: "2026-10-01T00:00:00Z" } },
        now,
        source,
      ).canPublish,
    ).toBe(false);
  });
});
