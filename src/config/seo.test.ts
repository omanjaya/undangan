import { describe, expect, it } from "vitest";
import { DEFAULT_PACKAGES } from "../modules/billing/catalog";
import {
  buildLandingJsonLd,
  buildRobots,
  buildSitemap,
  serializeJsonLd,
} from "./seo";
import { getSiteConfig } from "./site";

describe("buildSitemap", () => {
  const xml = buildSitemap("https://temu.id/", ["jepun-ivory", "puri-emerald"]);
  it("memuat halaman publik dan pratinjau tema dengan URL absolut", () => {
    expect(xml).toContain("<loc>https://temu.id/</loc>");
    expect(xml).toContain("<loc>https://temu.id/kebijakan-privasi</loc>");
    expect(xml).toContain("<loc>https://temu.id/themes/jepun-ivory</loc>");
    expect(xml).toContain("<loc>https://temu.id/themes/puri-emerald</loc>");
  });
  it("tidak memuat area privat", () => {
    expect(xml).not.toMatch(/\/(dashboard|admin|api|i)\//);
  });
});

describe("buildRobots", () => {
  const txt = buildRobots("https://temu.id");
  it("menutup area privat dan menunjuk sitemap", () => {
    for (const p of ["/dashboard", "/admin", "/api/", "/i/"])
      expect(txt).toContain(`Disallow: ${p}`);
    expect(txt).toContain("Sitemap: https://temu.id/sitemap.xml");
  });
});

describe("JSON-LD", () => {
  const site = getSiteConfig({ SITE_URL: "https://temu.id" });
  it("membuat satu Offer per paket dengan mata uang IDR", () => {
    const data = buildLandingJsonLd(site, DEFAULT_PACKAGES);
    const products = data["@graph"].filter((n) => n["@type"] === "Product");
    expect(products).toHaveLength(DEFAULT_PACKAGES.length);
    expect(JSON.stringify(data)).toContain('"priceCurrency":"IDR"');
  });
  it("menetralkan </script> pada serialisasi", () => {
    expect(serializeJsonLd({ a: "</script>" })).not.toContain("</script>");
  });
});
