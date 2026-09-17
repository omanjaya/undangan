import { describe, it, expect } from "vitest";
import { contentSchema, demoContent } from "./invitation";
import { presentationContent } from "./presentation";

describe("invitation photo presentation", () => {
  it("hides selected photos without deleting the saved selections or other media", () => {
    const photo = "/media/abcdef.webp";
    const saved = contentSchema.parse({
      ...demoContent,
      photoMode: "illustrated",
      heroPhoto: photo,
      bridePhoto: photo,
      groomPhoto: photo,
      storyPhoto: photo,
      galleryPhotos: [photo],
      videoUrl: "/media/abcdef.mp4",
    });
    const display = presentationContent(saved);
    expect([
      display.heroPhoto,
      display.bridePhoto,
      display.groomPhoto,
      display.storyPhoto,
    ]).toEqual(["", "", "", ""]);
    expect(display.galleryPhotos).toEqual([]);
    expect(display.videoUrl).toBe(saved.videoUrl);
    expect(saved.heroPhoto).toBe(photo);
    expect(saved.galleryPhotos).toEqual([photo]);
    expect(
      presentationContent({ ...saved, photoMode: "photos" }).galleryPhotos,
    ).toEqual([photo]);
  });
});
