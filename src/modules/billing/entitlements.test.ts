import { describe, expect, it } from "vitest";
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
