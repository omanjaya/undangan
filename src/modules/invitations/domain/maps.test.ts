import { describe, expect, it } from "vitest";
import {
  googleMapEmbedUrl,
  isGoogleMapEmbedUrl,
  mapDirectionsUrl,
} from "./maps";

describe("Google Maps URLs", () => {
  it("accepts exact Google Maps embed links", () => {
    const url = "https://www.google.com/maps/embed?pb=exact-pin";
    expect(isGoogleMapEmbedUrl(url)).toBe(true);
    expect(googleMapEmbedUrl(url)).toBe(url);
    expect(
      googleMapEmbedUrl("https://maps.google.com/maps/embed?pb=exact-pin"),
    ).toBe("https://www.google.com/maps/embed?pb=exact-pin");
  });

  it("rejects searches, lookalike hosts, and non-HTTPS embeds", () => {
    expect(isGoogleMapEmbedUrl("https://www.google.com/maps?q=venue")).toBe(
      false,
    );
    expect(
      isGoogleMapEmbedUrl("https://www.google.com.evil.test/maps/embed?pb=x"),
    ).toBe(false);
    expect(isGoogleMapEmbedUrl("http://www.google.com/maps/embed?pb=x")).toBe(
      false,
    );
    expect(
      isGoogleMapEmbedUrl("https://user@www.google.com/maps/embed?pb=x"),
    ).toBe(false);
    expect(
      isGoogleMapEmbedUrl("https://www.google.com:444/maps/embed?pb=x"),
    ).toBe(false);
    expect(
      isGoogleMapEmbedUrl("https://www.google.com/maps/embed?pb=%20"),
    ).toBe(false);
    expect(googleMapEmbedUrl("")).toBeNull();
  });

  it("keeps a valid exact directions URL unchanged", () => {
    const shortLink = "https://maps.app.goo.gl/example";
    expect(mapDirectionsUrl(shortLink)).toBe(shortLink);
    expect(mapDirectionsUrl("javascript:alert(1)")).toBeNull();
  });
});
