import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import {
  demoContent,
  contentSchema,
} from "../modules/invitations/domain/invitation";
let media: typeof import("./media");
let service: typeof import("./services");
let directory: string;
const actor = {
  id: "owner",
  workspaceId: "workspace-demo",
  email: "test@example.com",
};
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "temu-media-"));
  process.env.DATA_DIR = directory;
  process.env.UPLOAD_DIR = join(directory, "uploads");
  delete process.env.DATABASE_URL;
  media = await import("./media");
  service = await import("./services");
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
const upload = (bytes: Uint8Array, mime = "image/png") =>
  new Request("http://localhost/api/media", {
    method: "POST",
    headers: { "content-type": mime, "x-file-name": "Jepun.png" },
    body: bytes as unknown as BodyInit,
  });
describe("secure persistent media", () => {
  it("rejects anonymous uploads, forged MIME, and oversized declarations", async () => {
    await expect(
      media.uploadMedia(null, upload(new Uint8Array([1]))),
    ).rejects.toThrow("masuk");
    await expect(
      media.uploadMedia(
        actor,
        upload(new TextEncoder().encode("<script>bad</script>")),
      ),
    ).rejects.toThrow("format");
    const request = upload(new Uint8Array([1]));
    request.headers.set("content-length", String(11 * 1024 * 1024));
    await expect(media.uploadMedia(actor, request)).rejects.toThrow("maksimum");
  });
  it("runs the full publish and private media lifecycle", async () => {
    const png = await sharp({
      create: { width: 16, height: 20, channels: 3, background: "#aaa" },
    })
      .png()
      .toBuffer();
    const asset = await media.uploadMedia(actor, upload(png));
    expect(asset.mime).toBe("image/webp");
    expect(asset.width).toBe(16);
    const filename = asset.url.split("/").pop()!;
    await expect(
      media.serveMedia(filename, new Request("http://localhost"), null),
    ).rejects.toThrow("ditemukan");
    const ownerResponse = await media.serveMedia(
      filename,
      new Request("http://localhost"),
      actor,
    );
    expect(ownerResponse.status).toBe(200);
    expect((await ownerResponse.arrayBuffer()).byteLength).toBe(asset.bytes);
    const original = (await service.getInvitation())!;
    await service.saveDraft(actor, {
      slug: original.slug,
      lockVersion: original.lockVersion,
      content: { ...original.draft, heroPhoto: asset.url },
    });
    await expect(
      media.serveMedia(filename, new Request("http://localhost"), null),
    ).rejects.toThrow("ditemukan");
    await service.publishInvitation(actor, original.slug);
    const partial = await media.serveMedia(
      filename,
      new Request("http://localhost", { headers: { range: "bytes=0-3" } }),
      null,
    );
    expect(partial.status).toBe(206);
    expect((await partial.arrayBuffer()).byteLength).toBe(4);
    const bad = await media.serveMedia(
      filename,
      new Request("http://localhost", { headers: { range: "bytes=999999-" } }),
      null,
    );
    expect(bad.status).toBe(416);
    await service.unpublishInvitation(actor, original.slug);
    await expect(
      media.serveMedia(filename, new Request("http://localhost"), null),
    ).rejects.toThrow("ditemukan");
  });
  it("rejects wrong media types and missing files before publish", async () => {
    const original = (await service.getInvitation())!;
    await service.saveDraft(actor, {
      slug: original.slug,
      lockVersion: original.lockVersion,
      content: { ...original.draft, musicUrl: original.draft.heroPhoto },
    });
    await expect(
      service.publishInvitation(actor, original.slug),
    ).rejects.toThrow("jenis");
  });
  it("parses suffix ranges, rejects multipart and impossible ranges", () => {
    expect(media.parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(media.parseRange("bytes=90-200", 100)).toEqual({
      start: 90,
      end: 99,
    });
    expect(() => media.parseRange("bytes=0-1,4-5", 100)).toThrow();
    expect(() => media.parseRange("bytes=-0", 100)).toThrow();
  });
  it("normalizes old content and restricts executable or remote URLs", () => {
    const { theme, fontPreset, galleryPhotos, ...old } = demoContent;
    expect(contentSchema.parse(old).theme).toBe("jepun-ivory");
    expect(
      contentSchema.safeParse({
        ...demoContent,
        heroPhoto: "https://evil.example/a.svg",
      }).success,
    ).toBe(false);
    expect(
      contentSchema.safeParse({
        ...demoContent,
        musicUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });
});

describe("operational safeguards", () => {
  it("cleans up corrupt images and rejects storage exhaustion", async () => {
    const png = await sharp({
      create: { width: 16, height: 20, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    await expect(
      media.uploadMedia(actor, upload(png.subarray(0, 40))),
    ).rejects.toThrow();
    process.env.UPLOAD_STORAGE_MB = "0.000001";
    try {
      await expect(media.uploadMedia(actor, upload(png))).rejects.toThrow(
        "penuh",
      );
    } finally {
      delete process.env.UPLOAD_STORAGE_MB;
    }
  });
  it("checks actual file existence before publish", async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    const asset = await media.uploadMedia(actor, upload(png));
    const current = (await service.getInvitation())!;
    await service.saveDraft(actor, {
      slug: current.slug,
      lockVersion: current.lockVersion,
      content: { ...current.draft, heroPhoto: asset.url, musicUrl: "" },
    });
    await rm(join(process.env.UPLOAD_DIR!, asset.url.split("/").pop()!));
    await expect(
      service.publishInvitation(actor, current.slug),
    ).rejects.toThrow("hilang");
  });
  it("fails production readiness for insecure origin and demo credentials", async () => {
    const auth = await import("./auth");
    const saved = {
      NODE_ENV: process.env.NODE_ENV,
      APP_URL: process.env.APP_URL,
      DATABASE_URL: process.env.DATABASE_URL,
      OWNER_EMAIL: process.env.OWNER_EMAIL,
      OWNER_PASSWORD: process.env.OWNER_PASSWORD,
    };
    try {
      process.env.NODE_ENV = "production";
      process.env.DATABASE_URL = "postgres://unused";
      process.env.APP_URL = "http://example.test";
      expect(() => auth.validateOwnerConfiguration()).toThrow("HTTPS");
      process.env.APP_URL = "https://example.test";
      process.env.OWNER_EMAIL = "owner@undangan.local";
      process.env.OWNER_PASSWORD = "demo-undangan-2026";
      expect(() => auth.validateOwnerConfiguration()).toThrow("pemilik");
      process.env.OWNER_EMAIL = "owner@example.test";
      process.env.OWNER_PASSWORD = "unique-test-secret-2026";
      expect(() => auth.validateOwnerConfiguration()).not.toThrow();
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
