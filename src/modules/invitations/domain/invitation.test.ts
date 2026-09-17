import { describe, it, expect } from "vitest";
import {
  authorize,
  demoInvitation,
  rsvpSchema,
  contentSchema,
  demoContent,
} from "./invitation";
describe("domain policies", () => {
  it("blocks missing and foreign workspace actors", () => {
    expect(() => authorize(null, demoInvitation)).toThrow();
    expect(() =>
      authorize({ workspaceId: "another" }, demoInvitation),
    ).toThrow();
    expect(() =>
      authorize({ workspaceId: "workspace-demo" }, demoInvitation),
    ).not.toThrow();
  });
  it("rejects invalid party size and empty guest names", () => {
    expect(
      rsvpSchema.safeParse({
        name: "A",
        attendance: "attending",
        attendeeCount: 1,
      }).success,
    ).toBe(false);
    expect(
      rsvpSchema.safeParse({
        name: "Sari",
        attendance: "attending",
        attendeeCount: 0,
      }).success,
    ).toBe(false);
    expect(
      rsvpSchema.safeParse({
        name: "Sari",
        attendance: "attending",
        attendeeCount: 6,
      }).success,
    ).toBe(false);
  });
  it("rejects unsafe location URLs", () => {
    expect(
      contentSchema.safeParse({ ...demoContent, mapUrl: "javascript:alert(1)" })
        .success,
    ).toBe(false);
  });
  it("defaults legacy map embeds and focus points, while enforcing boundaries", () => {
    const {
      mapEmbedUrl: _mapEmbedUrl,
      imageFocus: _imageFocus,
      events: _events,
      ...legacy
    } = demoContent;
    const parsed = contentSchema.parse({
      ...legacy,
      events: [
        {
          title: "Resepsi",
          date: demoContent.date,
          venue: demoContent.venue,
          address: demoContent.address,
          mapUrl: demoContent.mapUrl,
        },
      ],
    });
    expect(parsed.mapEmbedUrl).toBe("");
    expect(parsed.events[0]?.mapEmbedUrl).toBe("");
    expect(parsed.imageFocus.heroPhoto).toEqual({ x: 50, y: 50 });

    expect(
      contentSchema.safeParse({
        ...demoContent,
        imageFocus: {
          ...demoContent.imageFocus,
          heroPhoto: { x: -1, y: 101 },
        },
      }).success,
    ).toBe(false);
    expect(
      contentSchema.safeParse({
        ...demoContent,
        mapEmbedUrl: "https://user@www.google.com/maps/embed?pb=pin",
      }).success,
    ).toBe(false);
  });
  it("defaults legacy invitations to photo mode without an illustration slideshow", () => {
    const {
      photoMode: _photoMode,
      illustrationSlideshow: _illustrationSlideshow,
      ...legacy
    } = demoContent;

    const parsed = contentSchema.parse(legacy);

    expect(parsed.photoMode).toBe("photos");
    expect(parsed.illustrationSlideshow).toBe(false);
  });
  it("retains uploaded media when switching to illustrated mode", () => {
    const media = {
      heroPhoto: "/media/11111111-1111-1111-1111-111111111111.webp",
      bridePhoto: "/media/22222222-2222-2222-2222-222222222222.webp",
      groomPhoto: "/media/33333333-3333-3333-3333-333333333333.webp",
      storyPhoto: "/media/44444444-4444-4444-4444-444444444444.webp",
      galleryPhotos: ["/media/55555555-5555-5555-5555-555555555555.webp"],
    };

    const parsed = contentSchema.parse({
      ...demoContent,
      ...media,
      photoMode: "illustrated",
      illustrationSlideshow: true,
    });

    expect(parsed).toMatchObject({
      ...media,
      photoMode: "illustrated",
      illustrationSlideshow: true,
    });
  });
});
describe("jadwal acara", () => {
  const event = {
    title: "Resepsi",
    date: "2026-10-01T17:00:00+08:00",
    venue: "LUME Cafe and Pool Bar",
    address: "Pejeng, Tampaksiring, Gianyar",
    mapUrl: "https://maps.app.goo.gl/j2ybu6vzoB5f6iUY8",
  };
  const withEvents = (events: unknown[]) =>
    contentSchema.safeParse({ ...demoContent, events });
  it("menerima acara tanpa waktu selesai", () => {
    expect(withEvents([event]).success).toBe(true);
  });
  it("menyimpan waktu selesai yang valid", () => {
    const result = withEvents([
      { ...event, endDate: "2026-10-01T21:00:00+08:00" },
    ]);
    expect(result.success).toBe(true);
    expect(result.data?.events[0].endDate).toBe("2026-10-01T21:00:00+08:00");
  });
  it("menolak waktu selesai sebelum atau sama dengan waktu mulai", () => {
    expect(
      withEvents([{ ...event, endDate: "2026-10-01T16:00:00+08:00" }]).success,
    ).toBe(false);
    expect(
      withEvents([{ ...event, endDate: "2026-10-01T17:00:00+08:00" }]).success,
    ).toBe(false);
  });
});
