import { describe, expect, it } from "vitest";
import { isSafeHttpsUrl, safeHttpsUrl } from "./links";

describe("tautan HTTPS", () => {
  it("menerima tautan HTTPS biasa", () => {
    expect(isSafeHttpsUrl("https://zoom.us/j/123?pwd=abc")).toBe(true);
    expect(safeHttpsUrl("  https://youtube.com/live/abc  ")).toBe(
      "https://youtube.com/live/abc",
    );
  });
  it("menolak skema lain, kredensial, port, dan teks kosong", () => {
    for (const bad of [
      "http://zoom.us/j/1",
      "javascript:alert(1)",
      "data:text/html,hi",
      "https://user:pw@zoom.us/j/1",
      "https://zoom.us:8443/j/1",
      "https://localhost/x",
      "bukan url",
      "",
    ])
      expect(isSafeHttpsUrl(bad)).toBe(false);
    expect(safeHttpsUrl(undefined)).toBeNull();
    expect(safeHttpsUrl("http://x.com")).toBeNull();
  });
});
