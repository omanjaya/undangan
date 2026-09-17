import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
let service: typeof import("./services");
let directory: string;
const actor = {
  id: "owner",
  workspaceId: "workspace-demo",
  email: "owner@example.test",
};
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "undangan-test-"));
  process.env.DATA_DIR = directory;
  delete process.env.DATABASE_URL;
  service = await import("./services");
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
describe("invitation flow", () => {
  it("keeps drafts private, rejects stale writes, publishes snapshots and upserts RSVP", async () => {
    const original = await service.getInvitation();
    const content = { ...original!.draft, bride: "Updated" };
    await service.saveDraft(actor, {
      slug: "amara-raka",
      lockVersion: 1,
      content,
    });
    expect((await service.getPublished("amara-raka"))?.bride).toBe("Amara");
    await expect(
      service.saveDraft(actor, { slug: "amara-raka", lockVersion: 1, content }),
    ).rejects.toThrow("Draft telah berubah");
    await service.publishInvitation(actor, "amara-raka");
    expect((await service.getPublished("amara-raka"))?.bride).toBe("Updated");
    await service.submitRsvp(
      "amara-raka",
      {
        name: "Sari",
        attendance: "attending",
        attendeeCount: 2,
        message: "Selamat",
      },
      "visitor-a",
    );
    await service.submitRsvp(
      "amara-raka",
      { name: "Sari", attendance: "declined", attendeeCount: 2 },
      "visitor-a",
    );
    const data = await service.getDashboardData(actor);
    expect(data.rsvps).toHaveLength(1);
    expect(data.stats.guests).toBe(0);
    expect(await service.getWishes("amara-raka")).toHaveLength(0);
    await service.moderateWish(actor, data.wishes[0].id, "approved");
    expect(await service.getWishes("amara-raka")).toHaveLength(1);
    await service.unpublishInvitation(actor, "amara-raka");
    expect(await service.getPublished("amara-raka")).toBeNull();
    await expect(
      service.submitRsvp(
        "amara-raka",
        { name: "Sari", attendance: "attending", attendeeCount: 1 },
        "visitor-b",
      ),
    ).rejects.toThrow();
  });
  it("creates opaque sessions, rejects wrong credentials, and revokes logout", async () => {
    const auth = await import("./auth");
    await expect(auth.login("owner@undangan.local", "bad")).rejects.toThrow();
    const token = await auth.login(
      "owner@undangan.local",
      "demo-undangan-2026",
    );
    const request = new Request("http://localhost", {
      headers: { cookie: "invitation_session=" + token },
    });
    expect((await auth.getActor(request))?.workspaceId).toBe("workspace-demo");
    await auth.logout(request);
    expect(await auth.getActor(request)).toBeNull();
  });
});

describe("custom invitation addresses", () => {
  it("authorizes renames, validates input and preserves old public addresses", async () => {
    await expect(
      service.renameInvitation(null, "amara-raka", "made-putu"),
    ).rejects.toThrow("masuk");
    await expect(
      service.renameInvitation(
        { ...actor, workspaceId: "other" },
        "amara-raka",
        "made-putu",
      ),
    ).rejects.toThrow("Akses");
    for (const invalid of [
      "x",
      "Uppercase",
      "../bad",
      "bad--slug",
      "admin",
      "a".repeat(81),
    ]) {
      await expect(
        service.renameInvitation(actor, "amara-raka", invalid),
      ).rejects.toThrow("3–80");
    }
    const renamed = await service.renameInvitation(
      actor,
      "amara-raka",
      "made-putu",
    );
    expect(renamed.aliases).toContain("amara-raka");
    expect((await service.getInvitation("amara-raka"))?.slug).toBe("made-putu");
    await service.publishInvitation(actor, "made-putu");
    expect(await service.getPublished("amara-raka")).not.toBeNull();
    await service.submitRsvp(
      "amara-raka",
      { name: "Alias guest", attendance: "attending", attendeeCount: 1 },
      "alias-visitor",
    );
    expect(
      (await service.getDashboardData(actor)).rsvps.some(
        (r) => r.name === "Alias guest",
      ),
    ).toBe(true);
    expect(await service.getWishes("amara-raka")).toEqual(
      await service.getWishes("made-putu"),
    );
    await expect(
      service.renameInvitation(actor, "amara-raka", "another-name"),
    ).rejects.toThrow("berubah");
    await service.renameInvitation(actor, "made-putu", "amara-raka");
    expect((await service.getInvitation("made-putu"))?.slug).toBe("amara-raka");
  });
  it("invalidates active sessions when owner credentials rotate", async () => {
    const auth = await import("./auth");
    const token = await auth.login(
      "owner@undangan.local",
      "demo-undangan-2026",
    );
    const request = new Request("http://localhost", {
      headers: { cookie: "invitation_session=" + token },
    });
    expect(await auth.getActor(request)).not.toBeNull();
    const previous = process.env.OWNER_PASSWORD;
    try {
      process.env.OWNER_PASSWORD = "rotated-unique-secret";
      expect(await auth.getActor(request)).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.OWNER_PASSWORD;
      else process.env.OWNER_PASSWORD = previous;
    }
  });
});
